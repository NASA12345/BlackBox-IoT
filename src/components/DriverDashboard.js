import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  getDriverTrips,
  getUnassignedTrips,
  assignTripToDriver,
  updateTripStatus,
  addTrackingData,
  addAlert,
} from '../services/firestoreService';
import bluetoothService from '../services/bluetoothService';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../lib/components/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../lib/components/Card';
import { Badge } from '../lib/components/Badge';
import { Alert, AlertDescription } from '../lib/components/Alert';
import { Modal } from '../lib/components/Modal';
import { useToast } from '../contexts/ToastContext';

const DriverDashboard = () => {
  const TRACKING_LOST_INTERVAL_MS = 60 * 1000;

  const [trips, setTrips] = useState([]);
  const [availableTrips, setAvailableTrips] = useState([]);
  const [activeTrip, setActiveTrip] = useState(null);
  const [btConnected, setBtConnected] = useState(false);
  const [btLoading, setBtLoading] = useState(false);
  const [assigningTripId, setAssigningTripId] = useState(null);
  const [sensorData, setSensorData] = useState(null);
  const [gpsData, setGpsData] = useState(null);
  const [lastPingAtMs, setLastPingAtMs] = useState(0);
  const [lastTrackingLostAlertAtMs, setLastTrackingLostAlertAtMs] = useState(0);
  const [heartbeatNowMs, setHeartbeatNowMs] = useState(() => Date.now());
  const [activeSection, setActiveSection] = useState('controls');
  const [tripListView, setTripListView] = useState('assigned');
  const [showEndTripConfirm, setShowEndTripConfirm] = useState(false);
  const [showBluetoothConnectConfirm, setShowBluetoothConnectConfirm] = useState(false);
  const [error, setError] = useState('');
  const { currentUser, logout } = useAuth();
  const { toast } = useToast();
  const gpsDataRef = useRef(null);
  const activeTripRef = useRef(null);

  useEffect(() => {
    gpsDataRef.current = gpsData;
  }, [gpsData]);

  useEffect(() => {
    activeTripRef.current = activeTrip;
  }, [activeTrip]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setHeartbeatNowMs(Date.now());
    }, 10000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  const loadTrips = useCallback(async () => {
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
      toast({
        title: 'Failed to load trips',
        description: err.message || 'Unable to fetch trips',
        variant: 'destructive',
      });
    }
  }, [currentUser, toast]);

  // Fetch driver trips
  useEffect(() => {
    if (!currentUser) return;

    loadTrips();
  }, [currentUser, loadTrips]);

  const handleSelfAssignTrip = async (tripId) => {
    if (!currentUser) return;

    setError('');
    setAssigningTripId(tripId);
    try {
      await assignTripToDriver(tripId, currentUser.uid);
      await loadTrips();
      toast({
        title: 'Trip assigned',
        description: 'Trip assigned to your account.',
        variant: 'success',
      });
    } catch (err) {
      setError(err.message || 'Failed to assign trip');
      toast({
        title: 'Assignment failed',
        description: err.message || 'Failed to assign trip',
        variant: 'destructive',
      });
    } finally {
      setAssigningTripId(null);
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      toast({
        title: 'Logged out',
        description: 'You have been signed out.',
        variant: 'success',
      });
    } catch (err) {
      setError('Failed to logout: ' + err.message);
      toast({
        title: 'Logout failed',
        description: err.message || 'Failed to logout',
        variant: 'destructive',
      });
    }
  };

  const handleEndTrip = async () => {
    if (!activeTrip) {
      setError('Please select a trip first');
      toast({
        title: 'No active trip',
        description: 'Please select a trip first.',
        variant: 'warning',
      });
      return;
    }

    setShowEndTripConfirm(true);
  };

  const confirmEndTrip = async () => {
    setShowEndTripConfirm(false);

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
      toast({
        title: 'Trip completed',
        description: 'The trip has been marked as completed.',
        variant: 'success',
      });
    } catch (err) {
      setError(err.message || 'Failed to end trip');
      toast({
        title: 'End trip failed',
        description: err.message || 'Failed to end trip',
        variant: 'destructive',
      });
    }
  };

  const cancelEndTrip = () => {
    setShowEndTripConfirm(false);
    toast({
      title: 'Trip end cancelled',
      description: 'Trip is still active.',
      variant: 'warning',
    });
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
          toast({
            title: 'GPS error',
            description: error.message || 'Unable to fetch location.',
            variant: 'destructive',
          });
        }
      );

      return watchId;
    }
  };

  // Connect to ESP32
  const handleBluetoothConnect = () => {
    if (!activeTrip) {
      setError('Please select a trip first');
      toast({
        title: 'No active trip',
        description: 'Please select a trip first.',
        variant: 'warning',
      });
      return;
    }

    setShowBluetoothConnectConfirm(true);
  };

  const confirmBluetoothConnect = async () => {
    setShowBluetoothConnectConfirm(false);

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
      setLastPingAtMs(Date.now());
      setLastTrackingLostAlertAtMs(0);
      toast({
        title: 'Bluetooth connected',
        description: 'Connected to ESP32 device.',
        variant: 'success',
      });

      // Set up data callback
      bluetoothService.setDataCallback(async (data) => {
        setSensorData(data);
        setLastPingAtMs(Date.now());
        setLastTrackingLostAlertAtMs(0);

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
        } catch (callbackError) {
          console.error('Error processing BLE payload:', callbackError);
          setError('Failed to write tracking data/alerts. Check Firestore rules and console logs.');
          toast({
            title: 'Tracking write failed',
            description: callbackError.message || 'Unable to save tracking data.',
            variant: 'destructive',
          });
        }
      });

      // Start GPS tracking
      startGPSTracking();
    } catch (err) {
      setError(err.message || 'Failed to connect to Bluetooth');
      setBtConnected(false);
      toast({
        title: 'Bluetooth connection failed',
        description: err.message || 'Failed to connect to Bluetooth',
        variant: 'destructive',
      });
    } finally {
      setBtLoading(false);
    }
  };

  const cancelBluetoothConnect = () => {
    setShowBluetoothConnectConfirm(false);
    toast({
      title: 'Bluetooth connect cancelled',
      description: 'Connection attempt was cancelled.',
      variant: 'warning',
    });
  };

  // Disconnect Bluetooth
  const handleBluetoothDisconnect = async () => {
    try {
      await bluetoothService.disconnect();
      setBtConnected(false);
      setSensorData(null);
      setGpsData(null);
      setLastPingAtMs(0);
      setLastTrackingLostAlertAtMs(0);
      toast({
        title: 'Bluetooth disconnected',
        description: 'ESP32 has been disconnected.',
        variant: 'warning',
      });
    } catch (err) {
      setError('Failed to disconnect: ' + err.message);
      toast({
        title: 'Disconnect failed',
        description: err.message || 'Failed to disconnect Bluetooth',
        variant: 'destructive',
      });
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'created':
        return 'info';
      case 'assigned':
        return 'success';
      case 'active':
        return 'warning';
      case 'completed':
        return 'default';
      default:
        return 'secondary';
    }
  };

  const assignedTrips = trips.filter((trip) => trip.status !== 'completed');
  const completedTrips = trips.filter((trip) => trip.status === 'completed');
  const activeServices = {
    tempHumidityEnabled:
      typeof activeTrip?.servicesConfig?.tempHumidityEnabled === 'boolean'
        ? activeTrip.servicesConfig.tempHumidityEnabled
        : true,
    impactEnabled:
      typeof activeTrip?.servicesConfig?.impactEnabled === 'boolean'
        ? activeTrip.servicesConfig.impactEnabled
        : true,
    tamperingEnabled: true,
  };

  const activeSectionIndex =
    activeSection === 'controls' ? 0 : activeSection === 'sensors' ? 1 : 2;
  const shouldReconnect =
    btConnected &&
    lastPingAtMs > 0 &&
    heartbeatNowMs - lastPingAtMs >= TRACKING_LOST_INTERVAL_MS;

  useEffect(() => {
    if (!btConnected || !activeTrip?.id || lastPingAtMs <= 0) return;

    const silenceMs = heartbeatNowMs - lastPingAtMs;
    if (silenceMs < TRACKING_LOST_INTERVAL_MS) return;

    const elapsedSinceLastLossAlert =
      lastTrackingLostAlertAtMs > 0
        ? heartbeatNowMs - lastTrackingLostAlertAtMs
        : TRACKING_LOST_INTERVAL_MS;

    if (elapsedSinceLastLossAlert < TRACKING_LOST_INTERVAL_MS) return;

    let isCancelled = false;

    const pushTrackingLostAlert = async () => {
      try {
        const silentSeconds = Math.floor(silenceMs / 1000);
        await addAlert(activeTrip.id, {
          type: 'tracking',
          message: `Tracking is lost. No ping received for ${silentSeconds}s.`,
          value: silentSeconds,
        });

        if (!isCancelled) {
          setLastTrackingLostAlertAtMs(Date.now());
        }
      } catch (lossAlertError) {
        console.error('Error sending tracking lost alert:', lossAlertError);
      }
    };

    pushTrackingLostAlert();

    return () => {
      isCancelled = true;
    };
  }, [
    btConnected,
    activeTrip,
    lastPingAtMs,
    heartbeatNowMs,
    lastTrackingLostAlertAtMs,
    TRACKING_LOST_INTERVAL_MS,
  ]);

  const handleTripListViewChange = (nextView) => {
    if (tripListView === nextView) return;
    setTripListView(nextView);
  };

  const handleActiveSectionChange = (nextSection) => {
    if (activeSection === nextSection) return;
    setActiveSection(nextSection);
  };

  useEffect(() => {
    if (!activeTrip) return;

    const latestActiveTrip = trips.find((trip) => trip.id === activeTrip.id);
    if (!latestActiveTrip || latestActiveTrip.status === 'completed') {
      setActiveTrip(null);
      setBtConnected(false);
      setSensorData(null);
      setGpsData(null);
      setLastPingAtMs(0);
      setLastTrackingLostAlertAtMs(0);
    }
  }, [activeTrip, trips]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <div className="border-b bg-white shadow-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Driver Dashboard</h1>
            {/* <p className="text-gray-600 text-sm mt-1">🚗 Real-time Trip Monitoring</p> */}
          </div>
          <Button 
            variant="outline" 
            onClick={handleLogout}
            className="gap-2"
          >
         Logout
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-8">
        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Panel - Trips */}
          <div className="lg:col-span-1 space-y-6">
            {/* Available Trips */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Available Trips</CardTitle>
                <CardDescription>Self-assign unassigned trips</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {availableTrips.length === 0 ? (
                    <p className="text-sm text-gray-500 text-center py-4">No available trips</p>
                  ) : (
                    availableTrips.map((trip) => (
                      <Card key={trip.id} className="border bg-blue-50 hover:bg-blue-100 transition cursor-pointer">
                        <CardContent className="p-3">
                          <h3 className="font-semibold text-sm mb-2">{trip.tripName}</h3>
                          <p className="text-xs text-gray-600 mb-3">📍 {trip.startGeofence?.latitude?.toFixed(4)}, {trip.startGeofence?.longitude?.toFixed(4)}</p>
                          <Button
                            size="sm"
                            variant="default"
                            disabled={assigningTripId === trip.id}
                            onClick={() => handleSelfAssignTrip(trip.id)}
                            className="w-full text-xs"
                          >
                            {assigningTripId === trip.id ? 'Assigning...' : 'Assign to Me'}
                          </Button>
                        </CardContent>
                      </Card>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Assigned Trips */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <CardTitle className="text-lg">Your Trips</CardTitle>
                  <div className="relative grid grid-cols-2 rounded-full bg-muted p-1 text-muted-foreground w-[200px]">
                    <span
                      aria-hidden="true"
                      className={`absolute top-1 bottom-1 left-1 w-[calc(50%-0.25rem)] rounded-full bg-white shadow-sm transition-transform duration-300 ease-out ${
                        tripListView === 'assigned' ? 'translate-x-0' : 'translate-x-full'
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => handleTripListViewChange('assigned')}
                      className={`relative z-10 rounded-full px-2 py-1 text-xs font-medium transition-all ${
                        tripListView === 'assigned'
                          ? 'text-foreground cursor-default'
                          : 'hover:text-foreground cursor-pointer'
                      }`}
                      aria-pressed={tripListView === 'assigned'}
                    >
                      Assigned
                    </button>
                    <button
                      type="button"
                      onClick={() => handleTripListViewChange('completed')}
                      className={`relative z-10 rounded-full px-2 py-1 text-xs font-medium transition-all ${
                        tripListView === 'completed'
                          ? 'text-foreground cursor-default'
                          : 'hover:text-foreground cursor-pointer'
                      }`}
                      aria-pressed={tripListView === 'completed'}
                    >
                      Completed
                    </button>
                  </div>
                </div>
                <CardDescription>
                  {tripListView === 'assigned'
                    ? 'Only assigned/active trips can be monitored'
                    : 'Completed trips are read-only'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {tripListView === 'assigned' && assignedTrips.length === 0 ? (
                    <p className="text-sm text-gray-500 text-center py-4">No assigned trips</p>
                  ) : tripListView === 'completed' && completedTrips.length === 0 ? (
                    <p className="text-sm text-gray-500 text-center py-4">No completed trips</p>
                  ) : (
                    (tripListView === 'assigned' ? assignedTrips : completedTrips).map((trip) => {
                      const isAssignedView = tripListView === 'assigned';

                      return (
                        <Card
                          key={trip.id}
                          className={`border transition ${
                            isAssignedView
                              ? activeTrip?.id === trip.id
                                ? 'bg-indigo-100 border-indigo-500 shadow-md cursor-pointer'
                                : 'bg-white hover:bg-gray-50 cursor-pointer'
                              : 'bg-gray-50'
                          }`}
                          onClick={isAssignedView ? () => setActiveTrip(trip) : undefined}
                        >
                          <CardContent className="p-3">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1">
                                <h3 className="font-semibold text-sm">{trip.tripName}</h3>
                                <p className="text-xs text-gray-600 mt-1">📍 {trip.startGeofence?.latitude?.toFixed(4)}, {trip.startGeofence?.longitude?.toFixed(4)}</p>
                              </div>
                              <Badge
                                variant={isAssignedView ? getStatusColor(trip.status) : 'default'}
                                className="text-xs"
                              >
                                {isAssignedView ? trip.status : 'completed'}
                              </Badge>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right Panel - Monitoring */}
          <div className="lg:col-span-2">
            {activeTrip ? (
              <div className="space-y-3">
                <div className="relative grid grid-cols-3 rounded-full bg-muted p-1 text-muted-foreground">
                  <span
                    aria-hidden="true"
                    className="absolute top-1 bottom-1 left-1 w-[calc(33.333%-0.25rem)] rounded-full bg-white shadow-sm transition-transform duration-300 ease-out"
                    style={{ transform: `translateX(${activeSectionIndex * 100}%)` }}
                  />
                  <button
                    type="button"
                    onClick={() => handleActiveSectionChange('controls')}
                    className={`relative z-10 rounded-full px-3 py-1.5 text-sm font-medium transition-all ${
                      activeSection === 'controls'
                        ? 'text-foreground cursor-default'
                        : 'hover:text-foreground cursor-pointer'
                    }`}
                    aria-pressed={activeSection === 'controls'}
                  >
                    Controls
                  </button>
                  <button
                    type="button"
                    onClick={() => handleActiveSectionChange('sensors')}
                    className={`relative z-10 rounded-full px-3 py-1.5 text-sm font-medium transition-all ${
                      activeSection === 'sensors'
                        ? 'text-foreground cursor-default'
                        : 'hover:text-foreground cursor-pointer'
                    }`}
                    aria-pressed={activeSection === 'sensors'}
                  >
                    Sensors
                  </button>
                  <button
                    type="button"
                    onClick={() => handleActiveSectionChange('location')}
                    className={`relative z-10 rounded-full px-3 py-1.5 text-sm font-medium transition-all ${
                      activeSection === 'location'
                        ? 'text-foreground cursor-default'
                        : 'hover:text-foreground cursor-pointer'
                    }`}
                    aria-pressed={activeSection === 'location'}
                  >
                    GPS
                  </button>
                </div>

                {/* Controls Section */}
                {activeSection === 'controls' && (
                  <Card>
                    <CardHeader className="pb-4">
                      <CardTitle className="text-lg">Trip Control</CardTitle>
                      <CardDescription className="text-xs">{activeTrip.tripName}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3 pt-0">
                      {!btConnected ? (
                        <Button
                          onClick={handleBluetoothConnect}
                          disabled={btLoading}
                          className="w-full gap-2 h-10 text-sm"
                        >
                          {btLoading ? '⏳ Connecting...' : '📡 Connect ESP32'}
                        </Button>
                      ) : (
                        <div className="space-y-2">
                          <div className="p-2 bg-green-50 border border-green-200 rounded-md flex items-center gap-2">
                            <div className="w-2.5 h-2.5 bg-green-500 rounded-full animate-pulse"></div>
                            <span className="text-xs font-semibold text-green-700">{shouldReconnect ? 'Reconnect to ESP32' : 'Connected to ESP32'}</span>
                          </div>
                          <Button
                            onClick={handleBluetoothDisconnect}
                            variant="destructive"
                            className="w-full gap-2 h-10 text-sm"
                          >
                            📡 Disconnect
                          </Button>
                        </div>
                      )}

                      <div className="border-t pt-3">
                        <Button
                          onClick={handleEndTrip}
                          variant="destructive"
                          className="w-full gap-2 h-10 text-sm"
                        >
                          🛑 End Trip
                        </Button>
                      </div>

                      <Card className="bg-blue-50 border-blue-200">
                        <CardContent className="pt-4">
                          <div className="grid grid-cols-2 gap-3 text-xs">
                            <div>
                              <p className="text-gray-600">Trip Status</p>
                              <p className="font-bold text-base capitalize">{activeTrip.status}</p>
                            </div>
                            <div>
                              <p className="text-gray-600">BLE Status</p>
                              <p className="font-bold text-base">{btConnected ? (shouldReconnect ? '⚠️ Reconnect' : '✅ Connected') : '❌ Disconnected'}</p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </CardContent>
                  </Card>
                )}

                {/* Sensors Section */}
                {activeSection === 'sensors' && (
                  btConnected && sensorData ? (
                    <Card>
                      <CardHeader className="pb-4">
                        <CardTitle className="text-lg">Live Sensor Data</CardTitle>
                        <CardDescription className="text-xs">Real-time sensor readings</CardDescription>
                      </CardHeader>
                      <CardContent className="pt-0">
                        <div className="grid grid-cols-2 gap-3">
                          {activeServices.tempHumidityEnabled && (
                            <Card className="bg-orange-50 border-orange-200">
                              <CardContent className="pt-3">
                                <p className="text-xs text-gray-600 mb-1">🌡️ Temperature</p>
                                <p className="text-2xl font-bold text-orange-600">{Number(sensorData.temp ?? 0).toFixed(1)}°C</p>
                              </CardContent>
                            </Card>
                          )}

                          {activeServices.tempHumidityEnabled && (
                            <Card className="bg-blue-50 border-blue-200">
                              <CardContent className="pt-3">
                                <p className="text-xs text-gray-600 mb-1">💧 Humidity</p>
                                <p className="text-2xl font-bold text-blue-600">{Number(sensorData.humidity ?? 0).toFixed(1)}%</p>
                              </CardContent>
                            </Card>
                          )}

                          <Card className={sensorData.tamper ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'}>
                            <CardContent className="pt-3">
                              <p className="text-xs text-gray-600 mb-1">🔒 Tamper</p>
                              <p className={`text-xl font-bold ${sensorData.tamper ? 'text-red-600' : 'text-green-600'}`}>
                                {sensorData.tamper ? '⚠️ ALERT' : '✅ OK'}
                              </p>
                            </CardContent>
                          </Card>

                          {activeServices.impactEnabled && (
                            <Card className="bg-indigo-50 border-indigo-200">
                              <CardContent className="pt-3">
                                <p className="text-xs text-gray-600 mb-1">🌀 Gyroscope (rad/s)</p>
                                <p className="text-sm font-bold text-indigo-700">
                                  X:{Number(sensorData.gx ?? 0).toFixed(2)} Y:{Number(sensorData.gy ?? 0).toFixed(2)} Z:{Number(sensorData.gz ?? 0).toFixed(2)}
                                </p>
                              </CardContent>
                            </Card>
                          )}

                          {activeServices.impactEnabled && (
                            <Card className="bg-slate-50 border-slate-200 col-span-2">
                              <CardContent className="pt-3">
                                <p className="text-xs text-gray-600 mb-1">📊 Accelerometer (m/s²)</p>
                                <p className="text-sm font-bold text-slate-700">
                                  X:{Number(sensorData.ax ?? 0).toFixed(2)} Y:{Number(sensorData.ay ?? 0).toFixed(2)} Z:{Number(sensorData.az ?? 0).toFixed(2)}
                                </p>
                              </CardContent>
                            </Card>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ) : (
                    <Card className="bg-gray-50 border-gray-200">
                      <CardContent className="pt-5 text-center">
                        <p className="text-sm text-gray-500">Connect to ESP32 to view sensor data</p>
                      </CardContent>
                    </Card>
                  )
                )}

                {/* GPS Section */}
                {activeSection === 'location' && (
                  gpsData ? (
                    <Card>
                      <CardHeader className="pb-4">
                        <CardTitle className="text-lg">GPS Location</CardTitle>
                        <CardDescription className="text-xs">Current driver location</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-3 pt-0">
                        <Card className="bg-purple-50 border-purple-200">
                          <CardContent className="pt-3">
                            <p className="text-xs text-gray-600 mb-1 font-semibold">📍 Latitude</p>
                            <p className="font-mono text-base font-bold text-purple-700">{gpsData.latitude?.toFixed(6)}</p>
                          </CardContent>
                        </Card>

                        <Card className="bg-purple-50 border-purple-200">
                          <CardContent className="pt-3">
                            <p className="text-xs text-gray-600 mb-1 font-semibold">📍 Longitude</p>
                            <p className="font-mono text-base font-bold text-purple-700">{gpsData.longitude?.toFixed(6)}</p>
                          </CardContent>
                        </Card>

                        <Card className="bg-blue-50 border-blue-200">
                          <CardContent className="pt-3">
                            <p className="text-xs text-gray-600 mb-1 font-semibold">🎯 Accuracy</p>
                            <p className="text-base font-bold text-blue-700">±{gpsData.accuracy?.toFixed(1)}m</p>
                          </CardContent>
                        </Card>

                        <p className="text-xs text-gray-500 text-center">Last updated: {gpsData.timestamp?.toLocaleTimeString()}</p>
                      </CardContent>
                    </Card>
                  ) : (
                    <Card className="bg-gray-50 border-gray-200">
                      <CardContent className="pt-5 text-center">
                        <p className="text-sm text-gray-500">GPS location will appear here once available</p>
                      </CardContent>
                    </Card>
                  )
                )}
              </div>
            ) : (
              <Card className="bg-gradient-to-br from-indigo-50 to-blue-50 border-indigo-200 h-96 flex items-center justify-center">
                <CardContent className="text-center">
                  <div className="text-5xl mb-4">📋</div>
                  <p className="text-xl font-semibold text-gray-900 mb-2">Select a Trip</p>
                  <p className="text-gray-600">Choose one of your assigned trips to start monitoring</p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>

      <Modal
        isOpen={showEndTripConfirm}
        onClose={cancelEndTrip}
        title="End Trip?"
        size="md"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-700">
            Are you sure you want to end this trip?
          </p>
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={cancelEndTrip}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" onClick={confirmEndTrip}>
              Yes, End Trip
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={showBluetoothConnectConfirm}
        onClose={cancelBluetoothConnect}
        title="Connect to ESP32?"
        size="md"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-700">
            Start Bluetooth pairing for this trip now?
          </p>
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={cancelBluetoothConnect}>
              Cancel
            </Button>
            <Button type="button" onClick={confirmBluetoothConnect}>
              Continue
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default DriverDashboard;
