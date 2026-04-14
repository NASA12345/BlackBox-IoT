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
  deleteDoc,
  arrayUnion,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../firebase';

const DEFAULT_ALERT_THRESHOLDS = {
  temperatureMax: 35,
  humidityMax: 70,
};

const ACCELERATION_THRESHOLD = 18; // m/s^2 (approx harsh shock threshold)
const GYROSCOPE_THRESHOLD = 3; // rad/s
const ALERT_COOLDOWN_MS = 2 * 60 * 1000;

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
    const { alertThresholds, ...restTripData } = tripData || {};
    const normalizedThresholds = {
      temperatureMax:
        Number.isFinite(Number(alertThresholds?.temperatureMax))
          ? Number(alertThresholds.temperatureMax)
          : DEFAULT_ALERT_THRESHOLDS.temperatureMax,
      humidityMax:
        Number.isFinite(Number(alertThresholds?.humidityMax))
          ? Number(alertThresholds.humidityMax)
          : DEFAULT_ALERT_THRESHOLDS.humidityMax,
    };

    const tripRef = await addDoc(collection(db, 'trips'), {
      userId,
      ...restTripData,
      alertThresholds: normalizedThresholds,
      status: 'created', // created, assigned, active, completed, cancelled
      createdAt: serverTimestamp(),
      assignedDriver: null,
      alerts: [],
      trackingData: [],
    });
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
    const trackingEntry = {
      ...trackingData,
      timestamp: Timestamp.now(),
    };

    await updateDoc(tripRef, {
      trackingData: arrayUnion(trackingEntry),
    });

    const generatedAlerts = buildAlertsFromTracking(trip, trackingData);
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

const buildAlertsFromTracking = (trip, trackingData) => {
  const alerts = [];
  const tripAlerts = Array.isArray(trip.alerts) ? trip.alerts : [];
  const tripTracking = Array.isArray(trip.trackingData) ? trip.trackingData : [];
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
    const latestForType = tripAlerts
      .filter((alert) => alert?.type === type)
      .sort((a, b) => toMillis(b?.timestamp) - toMillis(a?.timestamp))[0];

    if (!latestForType) return true;
    return Date.now() - toMillis(latestForType.timestamp) > ALERT_COOLDOWN_MS;
  };

  const temp = Number(trackingData?.temp);
  if (Number.isFinite(temp) && temp > thresholds.temperatureMax && canSendAlert('temperature')) {
    alerts.push({
      type: 'temperature',
      message: `Temperature exceeded threshold (${temp.toFixed(1)}°C > ${thresholds.temperatureMax.toFixed(1)}°C)`,
      value: temp,
    });
  }

  const humidity = Number(trackingData?.humidity);
  if (Number.isFinite(humidity) && humidity > thresholds.humidityMax && canSendAlert('humidity')) {
    alerts.push({
      type: 'humidity',
      message: `Humidity exceeded threshold (${humidity.toFixed(1)}% > ${thresholds.humidityMax.toFixed(1)}%)`,
      value: humidity,
    });
  }

  const ax = Number(trackingData?.ax);
  const ay = Number(trackingData?.ay);
  const az = Number(trackingData?.az);
  if ([ax, ay, az].every(Number.isFinite)) {
    const accMag = Math.sqrt(ax * ax + ay * ay + az * az);
    if (accMag > ACCELERATION_THRESHOLD && canSendAlert('acceleration')) {
      alerts.push({
        type: 'acceleration',
        message: `High acceleration detected (${accMag.toFixed(2)} m/s²)`,
        value: accMag,
      });
    }
  }

  const gx = Number(trackingData?.gx);
  const gy = Number(trackingData?.gy);
  const gz = Number(trackingData?.gz);
  if ([gx, gy, gz].every(Number.isFinite)) {
    const gyroMag = Math.sqrt(gx * gx + gy * gy + gz * gz);
    if (gyroMag > GYROSCOPE_THRESHOLD && canSendAlert('gyroscope')) {
      alerts.push({
        type: 'gyroscope',
        message: `High angular motion detected (${gyroMag.toFixed(2)} rad/s)`,
        value: gyroMag,
      });
    }
  }

  const tamperNow = isTruthySensorFlag(trackingData?.tamper);
  const previousTracking = tripTracking.length > 0 ? tripTracking[tripTracking.length - 1] : null;
  const tamperPrev = isTruthySensorFlag(previousTracking?.tamper);

  const lat = Number(trackingData?.latitude);
  const long = Number(trackingData?.longitude);
  const hasLocation = Number.isFinite(lat) && Number.isFinite(long);

  const inStartGeofence =
    hasLocation &&
    trip?.startGeofence &&
    Number.isFinite(Number(trip.startGeofence.latitude)) &&
    Number.isFinite(Number(trip.startGeofence.longitude)) &&
    Number.isFinite(Number(trip.startGeofence.radiusKm)) &&
    checkGeofenceViolation(
      lat,
      long,
      Number(trip.startGeofence.latitude),
      Number(trip.startGeofence.longitude),
      Number(trip.startGeofence.radiusKm)
    );

  const inEndGeofence =
    hasLocation &&
    trip?.endGeofence &&
    Number.isFinite(Number(trip.endGeofence.latitude)) &&
    Number.isFinite(Number(trip.endGeofence.longitude)) &&
    Number.isFinite(Number(trip.endGeofence.radiusKm)) &&
    checkGeofenceViolation(
      lat,
      long,
      Number(trip.endGeofence.latitude),
      Number(trip.endGeofence.longitude),
      Number(trip.endGeofence.radiusKm)
    );

  const outsideBothGeofences = hasLocation ? !inStartGeofence && !inEndGeofence : false;

  if (tamperNow && !tamperPrev && outsideBothGeofences && canSendAlert('tamper')) {
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
    const alert = {
      ...alertData,
      timestamp: Timestamp.now(),
      id: Date.now().toString(),
    };
    await updateDoc(doc(db, 'trips', tripId), {
      alerts: arrayUnion(alert),
    });
    return alert.id;
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
