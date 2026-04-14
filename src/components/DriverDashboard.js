import React, { useState, useEffect, useRef } from 'react';
import {
  getDriverTrips,
  getUnassignedTrips,
  assignTripToDriver,
  updateTripStatus,
  addAlert,
  addTrackingData,
  checkGeofenceViolation,
} from '../services/firestoreService';
import bluetoothService from '../services/bluetoothService';
import { useAuth } from '../contexts/AuthContext';
import '../styles/driverDashboard.css';

const DriverDashboard = () => {
  const [trips, setTrips] = useState([]);
  const [availableTrips, setAvailableTrips] = useState([]);
  const [activeTrip, setActiveTrip] = useState(null);
  const [btConnected, setBtConnected] = useState(false);
  const [btLoading, setBtLoading] = useState(false);
  const [assigningTripId, setAssigningTripId] = useState(null);
  const [sensorData, setSensorData] = useState(null);
  const [gpsData, setGpsData] = useState(null);
  const [error, setError] = useState('');
  const { currentUser, logout } = useAuth();
  const gpsDataRef = useRef(null);
  const activeTripRef = useRef(null);

  useEffect(() => {
    gpsDataRef.current = gpsData;
  }, [gpsData]);

  useEffect(() => {
    activeTripRef.current = activeTrip;
  }, [activeTrip]);

  const loadTrips = async () => {
    if (!currentUser) return;

    try {
      const [driverTrips, unassignedTrips] = await Promise.all([
        getDriverTrips(currentUser.uid),
        getUnassignedTrips(),
      ]);
      setTrips(driverTrips);
      setAvailableTrips(unassignedTrips);
    } catch (err) {
      console.error('Error fetching trips:', err);
      setError('Failed to load trips');
    }
  };

  // Fetch driver trips
  useEffect(() => {
    if (!currentUser) return;

    loadTrips();
  }, [currentUser]);

  const handleSelfAssignTrip = async (tripId) => {
    if (!currentUser) return;

    setError('');
    setAssigningTripId(tripId);
    try {
      await assignTripToDriver(tripId, currentUser.uid);
      await loadTrips();
    } catch (err) {
      setError(err.message || 'Failed to assign trip');
    } finally {
      setAssigningTripId(null);
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
    } catch (err) {
      setError('Failed to logout: ' + err.message);
    }
  };

  const handleEndTrip = async () => {
    if (!activeTrip) {
      setError('Please select a trip first');
      return;
    }

    const shouldEndTrip = window.confirm('Are you sure you want to end this trip?');
    if (!shouldEndTrip) return;

    setError('');
    try {
      if (btConnected) {
        await bluetoothService.disconnect();
        setBtConnected(false);
      }

      await updateTripStatus(activeTrip.id, 'completed');
      setSensorData(null);
      setGpsData(null);
      setActiveTrip(null);
      await loadTrips();
    } catch (err) {
      setError(err.message || 'Failed to end trip');
    }
  };

  // Start GPS tracking
  const startGPSTracking = () => {
    if (navigator.geolocation) {
      const watchId = navigator.geolocation.watchPosition(
        (position) => {
          setGpsData({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            timestamp: new Date(),
          });
        },
        (error) => {
          console.error('GPS error:', error);
          setError('GPS error: ' + error.message);
        }
      );

      return watchId;
    }
  };

  // Connect to ESP32
  const handleBluetoothConnect = async () => {
    if (!activeTrip) {
      setError('Please select a trip first');
      return;
    }

    setBtLoading(true);
    setError('');

    try {
      // Check if Bluetooth is supported
      if (!bluetoothService.isBluetoothSupported()) {
        throw new Error('Web Bluetooth is not supported on this device');
      }

      // Connect to device
      await bluetoothService.connectToDevice();
      setBtConnected(true);

      // Set up data callback
      bluetoothService.setDataCallback(async (data) => {
        setSensorData(data);

        const latestTrip = activeTripRef.current;
        if (!latestTrip) {
          return;
        }

        try {
          const latestGps = gpsDataRef.current;
          const trackingPayload = {
            ...data,
            latitude: latestGps?.latitude ?? null,
            longitude: latestGps?.longitude ?? null,
            accuracy: latestGps?.accuracy ?? null,
          };

          await addTrackingData(latestTrip.id, trackingPayload);
          await checkForAlerts(trackingPayload, latestTrip);
        } catch (callbackError) {
          console.error('Error processing BLE payload:', callbackError);
          setError('Failed to write tracking/alerts. Check Firestore rules and console logs.');
        }
      });

      // Start GPS tracking
      startGPSTracking();
    } catch (err) {
      setError(err.message || 'Failed to connect to Bluetooth');
      setBtConnected(false);
    } finally {
      setBtLoading(false);
    }
  };

  // Check for alert conditions
  const checkForAlerts = async (trackingData, trip) => {
    try {
      // Alert for temperature
      if (trackingData.temp > 35 || trackingData.temp < 5) {
        await addAlert(trip.id, {
          type: 'temperature',
          message: `Temperature alert: ${trackingData.temp}°C`,
          value: trackingData.temp,
        });
      }

      // Alert for tamper
      if (trackingData.tamper) {
        await addAlert(trip.id, {
          type: 'tamper',
          message: 'Tamper detected on shipment',
          value: 1,
        });
      }

      // Alert for impact
      if (trackingData.impact) {
        await addAlert(trip.id, {
          type: 'impact',
          message: 'High impact/acceleration detected',
          value: 1,
        });
      }

      // Alert for geofence violations
      if (
        trip.startGeofence &&
        typeof trackingData.latitude === 'number' &&
        typeof trackingData.longitude === 'number' &&
        !checkGeofenceViolation(
        trackingData.latitude,
        trackingData.longitude,
        trip.startGeofence.latitude,
        trip.startGeofence.longitude,
        trip.startGeofence.radiusKm
      ) &&
        trip.status === 'active'
      ) {
        await addAlert(trip.id, {
          type: 'geofence',
          message: 'Outside start location geofence',
          value: 1,
        });
      }
    } catch (err) {
      console.error('Error checking alerts:', err);
    }
  };

  // Disconnect Bluetooth
  const handleBluetoothDisconnect = async () => {
    try {
      await bluetoothService.disconnect();
      setBtConnected(false);
      setSensorData(null);
      setGpsData(null);
    } catch (err) {
      setError('Failed to disconnect: ' + err.message);
    }
  };

  return (
    <div className="driver-dashboard">
      <div className="driver-header">
        <h1>Driver Dashboard</h1>
        <button onClick={handleLogout} className="driver-logout-btn">
          Logout
        </button>
      </div>

      {error && <div className="error-message">{error}</div>}

      <div className="dashboard-grid">
        {/* Trips Section */}
        <div className="trips-section">
          <h2>Available Trips (Self Assign)</h2>
          <div className="trips-list">
            {availableTrips.length === 0 ? (
              <p>No available trips right now</p>
            ) : (
              availableTrips.map((trip) => (
                <div key={trip.id} className="trip-card">
                  <h3>{trip.tripName}</h3>
                  <p>Status: <strong>{trip.status}</strong></p>
                  <p>Start: {trip.startGeofence.latitude.toFixed(4)}, {trip.startGeofence.longitude.toFixed(4)}</p>
                  <button
                    type="button"
                    className="btn-assign-trip"
                    disabled={assigningTripId === trip.id}
                    onClick={() => handleSelfAssignTrip(trip.id)}
                  >
                    {assigningTripId === trip.id ? 'Assigning...' : 'Assign To Me'}
                  </button>
                </div>
              ))
            )}
          </div>

          <h2>Assigned Trips</h2>
          <div className="trips-list">
            {trips.length === 0 ? (
              <p>No trips assigned yet</p>
            ) : (
              trips.map((trip) => (
                <div
                  key={trip.id}
                  className={`trip-card ${activeTrip?.id === trip.id ? 'active' : ''}`}
                  onClick={() => setActiveTrip(trip)}
                >
                  <h3>{trip.tripName}</h3>
                  <p>Status: <strong>{trip.status}</strong></p>
                  <p>Start: {trip.startGeofence.latitude.toFixed(4)}, {trip.startGeofence.longitude.toFixed(4)}</p>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Monitoring Section */}
        <div className="monitoring-section">
          <h2>Monitoring</h2>

          {activeTrip && (
            <>
              <div className="bt-control">
                {!btConnected ? (
                  <button
                    onClick={handleBluetoothConnect}
                    disabled={btLoading}
                    className="btn-primary"
                  >
                    {btLoading ? 'Connecting...' : 'Connect ESP32'}
                  </button>
                ) : (
                  <>
                    <button
                      onClick={handleBluetoothDisconnect}
                      className="btn-danger"
                    >
                      Disconnect
                    </button>
                    <p className="status-connected">✓ Connected</p>
                  </>
                )}
                <button
                  onClick={handleEndTrip}
                  className="btn-end-trip"
                >
                  End Trip
                </button>
              </div>

              {btConnected && sensorData && (
                <div className="sensor-data">
                  <h3>Live Sensor Data</h3>
                  <div className="sensor-grid">
                    <div className="sensor-item">
                      <p className="label">Temperature</p>
                      <p className="value">{sensorData.temp}°C</p>
                    </div>
                    <div className="sensor-item">
                      <p className="label">Humidity</p>
                      <p className="value">{sensorData.humidity}%</p>
                    </div>
                    <div className="sensor-item">
                      <p className="label">Tamper</p>
                      <p className={`value ${sensorData.tamper ? 'alert' : ''}`}>
                        {sensorData.tamper ? 'YES' : 'NO'}
                      </p>
                    </div>
                    <div className="sensor-item">
                      <p className="label">Impact</p>
                      <p className={`value ${sensorData.impact ? 'alert' : ''}`}>
                        {sensorData.impact ? 'YES' : 'NO'}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {gpsData && (
                <div className="gps-data">
                  <h3>GPS Data</h3>
                  <p>Latitude: {gpsData.latitude.toFixed(4)}</p>
                  <p>Longitude: {gpsData.longitude.toFixed(4)}</p>
                  <p>Accuracy: {gpsData.accuracy.toFixed(2)}m</p>
                </div>
              )}
            </>
          )}

          {!activeTrip && <p className="select-trip">Select a trip to start monitoring</p>}
        </div>
      </div>
    </div>
  );
};

export default DriverDashboard;
