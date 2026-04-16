import {
  collection,
  addDoc,
  updateDoc,
  getDoc,
  getDocs,
  query,
  where,
  onSnapshot,
  setDoc,
  doc,
  arrayUnion,
  runTransaction,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../firebase';
import blockchainService from './blockchainService';

const DEFAULT_ALERT_THRESHOLDS = {
  temperatureMax: 35,
  humidityMax: 70,
  impactLevel: 'mid',
};

const IMPACT_THRESHOLDS = {
  high: { acceleration: 24, gyroscope: 4.2 },
  mid: { acceleration: 18, gyroscope: 3.0 },
  low: { acceleration: 14, gyroscope: 2.2 },
};

const DEFAULT_SERVICES_CONFIG = {
  tempHumidityEnabled: true,
  impactEnabled: true,
  tamperingEnabled: true,
};

const ALERT_COOLDOWN_MS = 2 * 60 * 1000;
const DEFAULT_GEOFENCE_RADIUS_KM = 0.5;
const POLYGON_GEOFENCE_COLLECTION = 'tripGeofencePolygons';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const anchorPayloadWithRetry = async (payload, maxRetries = 2) => {
  let lastError = null;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      return await blockchainService.hashAndStoreTripData(payload);
    } catch (error) {
      lastError = error;
      if (attempt < maxRetries) {
        await sleep(750 * (attempt + 1));
      }
    }
  }

  throw lastError;
};

const updateTripArrayRecordById = async (tripId, fieldName, recordId, patch) => {
  const tripRef = doc(db, 'trips', tripId);

  await runTransaction(db, async (transaction) => {
    const tripSnap = await transaction.get(tripRef);
    if (!tripSnap.exists()) return;

    const records = tripSnap.data()?.[fieldName];
    if (!Array.isArray(records)) return;

    const nextRecords = records.map((record) => {
      if (record?.id !== recordId) return record;

      // Never downgrade a successfully anchored record back to failed.
      if (record.blockchainStatus === 'confirmed' && patch.blockchainStatus === 'failed') {
        return record;
      }

      return {
        ...record,
        ...patch,
      };
    });

    transaction.update(tripRef, {
      [fieldName]: nextRecords,
    });
  });
};

const anchorTripCreationInBackground = (tripRef, payload) => {
  void (async () => {
    try {
      const { hash, txHash } = await anchorPayloadWithRetry(payload);
      await updateDoc(tripRef, {
        blockchainHash: hash,
        blockchainTxHash: txHash,
        blockchainNetwork: 'sepolia',
        blockchainStatus: 'confirmed',
      });
    } catch (blockchainError) {
      console.error('Blockchain hash store failed:', blockchainError);
      await updateDoc(tripRef, {
        blockchainStatus: 'failed',
        blockchainNetwork: 'sepolia',
      });
    }
  })();
};

const anchorTripArrayRecordInBackground = (tripId, fieldName, recordId, payload, errorLabel) => {
  void (async () => {
    try {
      const { hash, txHash } = await anchorPayloadWithRetry(payload);
      await updateTripArrayRecordById(tripId, fieldName, recordId, {
        blockchainHash: hash,
        blockchainTxHash: txHash,
        blockchainNetwork: 'sepolia',
        blockchainStatus: 'confirmed',
      });
    } catch (blockchainError) {
      console.error(`${errorLabel}:`, blockchainError);
      await updateTripArrayRecordById(tripId, fieldName, recordId, {
        blockchainStatus: 'failed',
        blockchainNetwork: 'sepolia',
      });
    }
  })();
};

const normalizePolygonPoints = (points) => {
  if (!Array.isArray(points)) return [];

  return points
    .map((point) => {
      const latitude = Number(point?.latitude ?? point?.lat);
      const longitude = Number(point?.longitude ?? point?.lng);
      return Number.isFinite(latitude) && Number.isFinite(longitude)
        ? { latitude, longitude }
        : null;
    })
    .filter(Boolean);
};

const normalizeGeofencePayload = (geofence = {}) => {
  const centerLat = Number(geofence?.center?.latitude ?? geofence?.latitude);
  const centerLong = Number(geofence?.center?.longitude ?? geofence?.longitude);

  const latitude = Number.isFinite(centerLat) ? centerLat : 0;
  const longitude = Number.isFinite(centerLong) ? centerLong : 0;
  const type = geofence?.type === 'polygon' ? 'polygon' : 'circle';
  const radiusCandidate = Number(geofence?.radiusKm);
  const radiusKm = Number.isFinite(radiusCandidate) ? radiusCandidate : DEFAULT_GEOFENCE_RADIUS_KM;
  const polygonPoints = normalizePolygonPoints(geofence?.polygonPoints);
  const geofenceId = geofence?.geofenceId || doc(collection(db, POLYGON_GEOFENCE_COLLECTION)).id;

  return {
    geofenceId,
    type,
    latitude,
    longitude,
    center: {
      latitude,
      longitude,
    },
    radiusKm: type === 'circle' ? radiusKm : null,
    polygonPointCount: type === 'polygon' ? polygonPoints.length : 0,
    polygonPoints,
  };
};

const normalizeServicesConfig = (servicesConfig = {}) => ({
  tempHumidityEnabled:
    typeof servicesConfig?.tempHumidityEnabled === 'boolean'
      ? servicesConfig.tempHumidityEnabled
      : DEFAULT_SERVICES_CONFIG.tempHumidityEnabled,
  impactEnabled:
    typeof servicesConfig?.impactEnabled === 'boolean'
      ? servicesConfig.impactEnabled
      : DEFAULT_SERVICES_CONFIG.impactEnabled,
  tamperingEnabled: true,
});

const normalizeImpactLevel = (impactLevel) => {
  const level = String(impactLevel || '').toLowerCase();
  if (level === 'high' || level === 'mid' || level === 'low') return level;
  return DEFAULT_ALERT_THRESHOLDS.impactLevel;
};

const buildTrackingEntryByServices = (trackingData = {}, servicesConfig = DEFAULT_SERVICES_CONFIG) => {
  const entry = {
    tamper: trackingData?.tamper,
    latitude: trackingData?.latitude ?? null,
    longitude: trackingData?.longitude ?? null,
    accuracy: trackingData?.accuracy ?? null,
  };

  if (servicesConfig.tempHumidityEnabled) {
    entry.temp = trackingData?.temp;
    entry.humidity = trackingData?.humidity;
  }

  if (servicesConfig.impactEnabled) {
    entry.ax = trackingData?.ax;
    entry.ay = trackingData?.ay;
    entry.az = trackingData?.az;
    entry.gx = trackingData?.gx;
    entry.gy = trackingData?.gy;
    entry.gz = trackingData?.gz;
  }

  return entry;
};

const savePolygonGeofenceIfNeeded = async (tripId, geofenceType, geofencePayload) => {
  if (geofencePayload.type !== 'polygon') return;

  await setDoc(doc(db, POLYGON_GEOFENCE_COLLECTION, geofencePayload.geofenceId), {
    geofenceId: geofencePayload.geofenceId,
    tripId,
    geofenceType,
    center: geofencePayload.center,
    points: geofencePayload.polygonPoints,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
};

const getPolygonGeofencePoints = async (geofenceId) => {
  if (!geofenceId) return [];

  const polygonDoc = await getDoc(doc(db, POLYGON_GEOFENCE_COLLECTION, geofenceId));
  if (!polygonDoc.exists()) return [];

  return normalizePolygonPoints(polygonDoc.data()?.points);
};

export const getGeofencePolygonPoints = async (geofenceId) => getPolygonGeofencePoints(geofenceId);

const getTripGeofenceShapes = async (trip) => {
  const startIsPolygon = trip?.startGeofence?.type === 'polygon';
  const endIsPolygon = trip?.endGeofence?.type === 'polygon';

  const [startPolygonPoints, endPolygonPoints] = await Promise.all([
    startIsPolygon ? getPolygonGeofencePoints(trip?.startGeofence?.geofenceId) : Promise.resolve([]),
    endIsPolygon ? getPolygonGeofencePoints(trip?.endGeofence?.geofenceId) : Promise.resolve([]),
  ]);

  return {
    startGeofence: {
      ...trip?.startGeofence,
      points: startPolygonPoints,
    },
    endGeofence: {
      ...trip?.endGeofence,
      points: endPolygonPoints,
    },
  };
};

const isPointOnSegment = (py, px, y1, x1, y2, x2) => {
  const cross = (py - y1) * (x2 - x1) - (px - x1) * (y2 - y1);
  if (Math.abs(cross) > 1e-10) return false;
  const dot = (px - x1) * (px - x2) + (py - y1) * (py - y2);
  return dot <= 1e-10;
};

const isPointInsidePolygon = (latitude, longitude, points) => {
  if (!Array.isArray(points) || points.length < 3) return false;

  const x = longitude;
  const y = latitude;
  let inside = false;

  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const xi = Number(points[i].longitude);
    const yi = Number(points[i].latitude);
    const xj = Number(points[j].longitude);
    const yj = Number(points[j].latitude);

    if (![xi, yi, xj, yj].every(Number.isFinite)) continue;

    if (isPointOnSegment(y, x, yi, xi, yj, xj)) {
      return true;
    }

    const intersects =
      (yi > y) !== (yj > y) &&
      x < ((xj - xi) * (y - yi)) / (yj - yi + Number.EPSILON) + xi;

    if (intersects) inside = !inside;
  }

  return inside;
};

const isWithinGeofence = (latitude, longitude, geofence) => {
  if (!geofence) return false;

  if (geofence.type === 'polygon') {
    return isPointInsidePolygon(latitude, longitude, geofence.points);
  }

  return (
    Number.isFinite(Number(geofence.latitude)) &&
    Number.isFinite(Number(geofence.longitude)) &&
    Number.isFinite(Number(geofence.radiusKm)) &&
    checkGeofenceViolation(
      latitude,
      longitude,
      Number(geofence.latitude),
      Number(geofence.longitude),
      Number(geofence.radiusKm)
    )
  );
};

// ========== USER OPERATIONS ==========

export const createUserProfile = async (userId, userData) => {
  try {
    await setDoc(doc(db, 'users', userId), {
      ...userData,
      createdAt: serverTimestamp(),
      role: 'user',
    });
  } catch (error) {
    console.error('Error creating user profile:', error);
    throw error;
  }
};

export const createDriverProfile = async (userId, driverData) => {
  try {
    await setDoc(doc(db, 'drivers', userId), {
      ...driverData,
      createdAt: serverTimestamp(),
      role: 'driver',
      isAvailable: true,
    });
  } catch (error) {
    console.error('Error creating driver profile:', error);
    throw error;
  }
};

export const getUserProfile = async (userId) => {
  try {
    const docSnap = await getDoc(doc(db, 'users', userId));
    return docSnap.exists() ? docSnap.data() : null;
  } catch (error) {
    console.error('Error getting user profile:', error);
    throw error;
  }
};

export const getDriverProfile = async (driverId) => {
  try {
    const docSnap = await getDoc(doc(db, 'drivers', driverId));
    return docSnap.exists() ? docSnap.data() : null;
  } catch (error) {
    console.error('Error getting driver profile:', error);
    throw error;
  }
};

// ========== TRIP OPERATIONS ==========

export const createTrip = async (userId, tripData) => {
  try {
    const { alertThresholds, servicesConfig, ...restTripData } = tripData || {};
    const normalizedStartGeofence = normalizeGeofencePayload(restTripData.startGeofence);
    const normalizedEndGeofence = normalizeGeofencePayload(restTripData.endGeofence);
    const normalizedServices = normalizeServicesConfig(servicesConfig);

    const normalizedThresholds = {
      temperatureMax:
        normalizedServices.tempHumidityEnabled && Number.isFinite(Number(alertThresholds?.temperatureMax))
          ? Number(alertThresholds.temperatureMax)
          : null,
      humidityMax:
        normalizedServices.tempHumidityEnabled && Number.isFinite(Number(alertThresholds?.humidityMax))
          ? Number(alertThresholds.humidityMax)
          : null,
      impactLevel: normalizedServices.impactEnabled
        ? normalizeImpactLevel(alertThresholds?.impactLevel)
        : null,
    };

    const tripRef = await addDoc(collection(db, 'trips'), {
      userId,
      ...restTripData,
      startGeofence: {
        geofenceId: normalizedStartGeofence.geofenceId,
        type: normalizedStartGeofence.type,
        latitude: normalizedStartGeofence.latitude,
        longitude: normalizedStartGeofence.longitude,
        center: normalizedStartGeofence.center,
        radiusKm: normalizedStartGeofence.radiusKm,
        polygonPointCount: normalizedStartGeofence.polygonPointCount,
      },
      endGeofence: {
        geofenceId: normalizedEndGeofence.geofenceId,
        type: normalizedEndGeofence.type,
        latitude: normalizedEndGeofence.latitude,
        longitude: normalizedEndGeofence.longitude,
        center: normalizedEndGeofence.center,
        radiusKm: normalizedEndGeofence.radiusKm,
        polygonPointCount: normalizedEndGeofence.polygonPointCount,
      },
      servicesConfig: normalizedServices,
      alertThresholds: normalizedThresholds,
      status: 'created', // created, assigned, active, completed, cancelled
      createdAt: serverTimestamp(),
      assignedDriver: null,
      alerts: [],
      trackingData: [],
      blockchainHash: null,
      blockchainTxHash: null,
      blockchainNetwork: 'sepolia',
      blockchainStatus: 'pending',
    });

    await Promise.all([
      savePolygonGeofenceIfNeeded(tripRef.id, 'start', normalizedStartGeofence),
      savePolygonGeofenceIfNeeded(tripRef.id, 'end', normalizedEndGeofence),
    ]);

    const tripDataForHash = {
      recordType: 'trip',
      tripId: tripRef.id,
      userId,
      ...restTripData,
      startGeofence: {
        geofenceId: normalizedStartGeofence.geofenceId,
        type: normalizedStartGeofence.type,
        latitude: normalizedStartGeofence.latitude,
        longitude: normalizedStartGeofence.longitude,
        center: normalizedStartGeofence.center,
        radiusKm: normalizedStartGeofence.radiusKm,
        polygonPointCount: normalizedStartGeofence.polygonPointCount,
      },
      endGeofence: {
        geofenceId: normalizedEndGeofence.geofenceId,
        type: normalizedEndGeofence.type,
        latitude: normalizedEndGeofence.latitude,
        longitude: normalizedEndGeofence.longitude,
        center: normalizedEndGeofence.center,
        radiusKm: normalizedEndGeofence.radiusKm,
        polygonPointCount: normalizedEndGeofence.polygonPointCount,
      },
      servicesConfig: normalizedServices,
      alertThresholds: normalizedThresholds,
      alerts: [],
      trackingData: [],
      status: 'created',
      createdAt: new Date().toISOString(),
    };
    anchorTripCreationInBackground(tripRef, tripDataForHash);

    return tripRef.id;
  } catch (error) {
    console.error('Error creating trip:', error);
    throw error;
  }
};

export const getUserTrips = async (userId) => {
  try {
    const q = query(collection(db, 'trips'), where('userId', '==', userId));
    const querySnapshot = await getDocs(q);
    const trips = [];
    querySnapshot.forEach((doc) => {
      trips.push({ id: doc.id, ...doc.data() });
    });
    return await enrichTripsWithDriverNames(trips);
  } catch (error) {
    console.error('Error fetching user trips:', error);
    throw error;
  }
};

export const getTripById = async (tripId) => {
  try {
    const docSnap = await getDoc(doc(db, 'trips', tripId));
    if (!docSnap.exists()) return null;

    const trip = { id: docSnap.id, ...docSnap.data() };
    const [enrichedTrip] = await enrichTripsWithDriverNames([trip]);
    return enrichedTrip;
  } catch (error) {
    console.error('Error fetching trip:', error);
    throw error;
  }
};

export const updateTripStatus = async (tripId, status) => {
  try {
    await updateDoc(doc(db, 'trips', tripId), {
      status,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    console.error('Error updating trip status:', error);
    throw error;
  }
};

export const assignTripToDriver = async (tripId, driverId) => {
  try {
    const driverProfile = await getDriverProfile(driverId);

    await updateDoc(doc(db, 'trips', tripId), {
      assignedDriver: driverId,
      assignedDriverName: driverProfile?.fullName || null,
      status: 'assigned',
      assignedAt: serverTimestamp(),
    });
  } catch (error) {
    console.error('Error assigning trip to driver:', error);
    throw error;
  }
};

export const getDriverTrips = async (driverId) => {
  try {
    const q = query(collection(db, 'trips'), where('assignedDriver', '==', driverId));
    const querySnapshot = await getDocs(q);
    const trips = [];
    querySnapshot.forEach((doc) => {
      trips.push({ id: doc.id, ...doc.data() });
    });
    return await enrichTripsWithDriverNames(trips);
  } catch (error) {
    console.error('Error fetching driver trips:', error);
    throw error;
  }
};

export const getUnassignedTrips = async () => {
  try {
    const q = query(collection(db, 'trips'), where('assignedDriver', '==', null));
    const querySnapshot = await getDocs(q);
    const trips = [];
    querySnapshot.forEach((doc) => {
      const tripData = { id: doc.id, ...doc.data() };
      if (tripData.status !== 'completed' && tripData.status !== 'cancelled') {
        trips.push(tripData);
      }
    });
    return await enrichTripsWithDriverNames(trips);
  } catch (error) {
    console.error('Error fetching unassigned trips:', error);
    throw error;
  }
};

const enrichTripsWithDriverNames = async (trips) => {
  if (!Array.isArray(trips) || trips.length === 0) return trips;

  const driverIds = [...new Set(trips.map((trip) => trip.assignedDriver).filter(Boolean))];
  if (driverIds.length === 0) return trips;

  const driverNameMap = new Map();

  await Promise.all(
    driverIds.map(async (driverId) => {
      const profile = await getDriverProfile(driverId);
      driverNameMap.set(driverId, profile?.fullName || null);
    })
  );

  return trips.map((trip) => ({
    ...trip,
    assignedDriverName:
      trip.assignedDriverName || (trip.assignedDriver ? driverNameMap.get(trip.assignedDriver) : null),
  }));
};

// ========== TRACKING DATA OPERATIONS ==========

export const addTrackingData = async (tripId, trackingData) => {
  try {
    const tripRef = doc(db, 'trips', tripId);
    const tripSnap = await getDoc(tripRef);

    if (!tripSnap.exists()) {
      throw new Error('Trip not found');
    }

    const trip = { id: tripSnap.id, ...tripSnap.data() };
    const servicesConfig = normalizeServicesConfig(trip?.servicesConfig);
    const entryId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const trackingTimestampIso = new Date().toISOString();
    const trackingEntry = {
      ...buildTrackingEntryByServices(trackingData, servicesConfig),
      id: entryId,
      timestamp: Timestamp.now(),
      blockchainHash: null,
      blockchainTxHash: null,
      blockchainNetwork: 'sepolia',
      blockchainStatus: 'pending',
    };

    await updateDoc(tripRef, {
      trackingData: arrayUnion(trackingEntry),
    });

    const trackingPayloadForHash = {
      recordType: 'tracking',
      tripId,
      trackingId: entryId,
      timestamp: trackingTimestampIso,
      ...buildTrackingEntryByServices(trackingData, servicesConfig),
    };
    anchorTripArrayRecordInBackground(
      tripId,
      'trackingData',
      entryId,
      trackingPayloadForHash,
      'Blockchain tracking hash store failed'
    );

    const geofenceShapes = await getTripGeofenceShapes(trip);
    const generatedAlerts = buildAlertsFromTracking(trip, trackingEntry, geofenceShapes);
    if (generatedAlerts.length > 0) {
      for (const alertData of generatedAlerts) {
        await addAlert(tripId, alertData);
      }
    }
  } catch (error) {
    console.error('Error adding tracking data:', error);
    throw error;
  }
};

const toMillis = (value) => {
  if (!value) return 0;
  if (typeof value?.toDate === 'function') return value.toDate().getTime();
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
};

const isTruthySensorFlag = (value) => value === true || value === 1 || value === '1';

const buildAlertsFromTracking = (trip, trackingData, geofenceShapes) => {
  const alerts = [];
  const tripAlerts = Array.isArray(trip.alerts) ? trip.alerts : [];
  const tripTracking = Array.isArray(trip.trackingData) ? trip.trackingData : [];
  const servicesConfig = normalizeServicesConfig(trip?.servicesConfig);
  const impactLevel = normalizeImpactLevel(trip?.alertThresholds?.impactLevel);
  const impactThresholds = IMPACT_THRESHOLDS[impactLevel] || IMPACT_THRESHOLDS.mid;
  const thresholds = {
    temperatureMax:
      Number.isFinite(Number(trip.alertThresholds?.temperatureMax))
        ? Number(trip.alertThresholds.temperatureMax)
        : DEFAULT_ALERT_THRESHOLDS.temperatureMax,
    humidityMax:
      Number.isFinite(Number(trip.alertThresholds?.humidityMax))
        ? Number(trip.alertThresholds.humidityMax)
        : DEFAULT_ALERT_THRESHOLDS.humidityMax,
  };

  const canSendAlert = (type) => {
    if (type === 'tamper') {
      const hasTamperAlert = tripAlerts.some((alert) => alert?.type === 'tamper');
      return !hasTamperAlert;
    }

    const latestForType = tripAlerts
      .filter((alert) => alert?.type === type)
      .sort((a, b) => toMillis(b?.timestamp) - toMillis(a?.timestamp))[0];

    if (!latestForType) return true;
    return Date.now() - toMillis(latestForType.timestamp) > ALERT_COOLDOWN_MS;
  };

  const previousTracking = tripTracking.length > 0 ? tripTracking[tripTracking.length - 1] : null;

  const temp = Number(trackingData?.temp);
  if (
    servicesConfig.tempHumidityEnabled &&
    Number.isFinite(temp) &&
    temp > thresholds.temperatureMax &&
    canSendAlert('temperature')
  ) {
    alerts.push({
      type: 'temperature',
      message: `Temperature exceeded threshold (${temp.toFixed(1)}°C > ${thresholds.temperatureMax.toFixed(1)}°C)`,
      value: temp,
    });
  }

  const humidity = Number(trackingData?.humidity);
  if (
    servicesConfig.tempHumidityEnabled &&
    Number.isFinite(humidity) &&
    humidity > thresholds.humidityMax &&
    canSendAlert('humidity')
  ) {
    alerts.push({
      type: 'humidity',
      message: `Humidity exceeded threshold (${humidity.toFixed(1)}% > ${thresholds.humidityMax.toFixed(1)}%)`,
      value: humidity,
    });
  }

  if (
    servicesConfig.tempHumidityEnabled &&
    Number.isFinite(temp) &&
    Number.isFinite(humidity) &&
    temp === 0 &&
    humidity === 0 &&
    canSendAlert('Temp Humidity Sensor Fault')
  ) {
    alerts.push({
      type: 'Temp Humidity Sensor Fault',
      message: 'Temperature/Humidity sensor is not working (both readings are zero).',
      value: 0,
    });
  }

  const ax = Number(trackingData?.ax);
  const ay = Number(trackingData?.ay);
  const az = Number(trackingData?.az);
  const gx = Number(trackingData?.gx);
  const gy = Number(trackingData?.gy);
  const gz = Number(trackingData?.gz);

  let accMag = 0;
  if ([ax, ay, az].every(Number.isFinite)) {
    accMag = Math.sqrt(ax * ax + ay * ay + az * az);
  }

  let gyroMag = 0;
  if ([gx, gy, gz].every(Number.isFinite)) {
    gyroMag = Math.sqrt(gx * gx + gy * gy + gz * gz);
  }

  if (servicesConfig.impactEnabled) {
    const impactExceeded =
      (accMag > 0 && accMag > impactThresholds.acceleration) ||
      (gyroMag > 0 && gyroMag > impactThresholds.gyroscope);

    const impactSensorFault =
      [ax, ay, az, gx, gy, gz].every(Number.isFinite) &&
      [ax, ay, az, gx, gy, gz].every((value) => value === 0);

    if (impactExceeded && canSendAlert('impact')) {
      alerts.push({
        type: 'impact',
        message: `Impact threshold (${impactLevel}) exceeded: Acc ${accMag.toFixed(2)} m/s², Gyro ${gyroMag.toFixed(2)} rad/s`,
        value: Math.max(accMag, gyroMag),
      });
    }

    if (impactSensorFault && canSendAlert('Impact Sensor Fault')) {
      alerts.push({
        type: 'Impact Sensor Fault',
        message: 'Impact sensor is faulty (all acceleration and gyroscope axes are fixed).',
        value: 0,
      });
    }
  }

  const tamperNow = isTruthySensorFlag(trackingData?.tamper);
  const tamperPrev = isTruthySensorFlag(previousTracking?.tamper);

  const lat = Number(trackingData?.latitude);
  const long = Number(trackingData?.longitude);
  const hasLocation = Number.isFinite(lat) && Number.isFinite(long);

  const inStartGeofence =
    hasLocation && isWithinGeofence(lat, long, geofenceShapes?.startGeofence || trip?.startGeofence);

  const inEndGeofence =
    hasLocation && isWithinGeofence(lat, long, geofenceShapes?.endGeofence || trip?.endGeofence);

  const outsideBothGeofences = hasLocation ? !inStartGeofence && !inEndGeofence : false;

  if (servicesConfig.tamperingEnabled && tamperNow && !tamperPrev && outsideBothGeofences && canSendAlert('tamper')) {
    alerts.push({
      type: 'tamper',
      message: 'Seal tampering detected outside start/end geofence',
      value: 1,
    });
  }

  return alerts;
};

export const subscribeToTrackingData = (tripId, callback) => {
  try {
    const unsubscribe = onSnapshot(doc(db, 'trips', tripId), (doc) => {
      if (doc.exists()) {
        callback(doc.data().trackingData || []);
      }
    });
    return unsubscribe;
  } catch (error) {
    console.error('Error subscribing to tracking data:', error);
    throw error;
  }
};

// ========== ALERT OPERATIONS ==========

export const addAlert = async (tripId, alertData) => {
  try {
    const alertId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const timestampIso = new Date().toISOString();
    const alert = {
      ...alertData,
      timestamp: Timestamp.now(),
      id: alertId,
      blockchainHash: null,
      blockchainTxHash: null,
      blockchainNetwork: 'sepolia',
      blockchainStatus: 'pending',
    };

    await updateDoc(doc(db, 'trips', tripId), {
      alerts: arrayUnion(alert),
    });

    const alertPayloadForHash = {
      recordType: 'alert',
      tripId,
      alertId,
      timestamp: timestampIso,
      ...alertData,
    };
    anchorTripArrayRecordInBackground(
      tripId,
      'alerts',
      alertId,
      alertPayloadForHash,
      'Blockchain alert hash store failed'
    );

    return alertId;
  } catch (error) {
    console.error('Error adding alert:', error);
    throw error;
  }
};

export const subscribeToAlerts = (tripId, callback) => {
  try {
    const unsubscribe = onSnapshot(doc(db, 'trips', tripId), (doc) => {
      if (doc.exists()) {
        callback(doc.data().alerts || []);
      }
    });
    return unsubscribe;
  } catch (error) {
    console.error('Error subscribing to alerts:', error);
    throw error;
  }
};

// ========== GEOFENCE OPERATIONS ==========

export const checkGeofenceViolation = (
  currentLat,
  currentLong,
  geofenceLat,
  geofenceLong,
  radiusKm
) => {
  const R = 6371; // Earth's radius in km
  const dLat = ((geofenceLat - currentLat) * Math.PI) / 180;
  const dLon = ((geofenceLong - currentLong) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((currentLat * Math.PI) / 180) *
      Math.cos((geofenceLat * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;
  return distance <= radiusKm;
};
