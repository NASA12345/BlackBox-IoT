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
    const tripRef = await addDoc(collection(db, 'trips'), {
      userId,
      ...tripData,
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
    await updateDoc(doc(db, 'trips', tripId), {
      trackingData: arrayUnion({
        ...trackingData,
        timestamp: Timestamp.now(),
      }),
    });
  } catch (error) {
    console.error('Error adding tracking data:', error);
    throw error;
  }
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
