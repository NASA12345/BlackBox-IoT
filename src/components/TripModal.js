import React, { useState, useEffect } from 'react';
import { subscribeToAlerts, subscribeToTrackingData } from '../services/firestoreService';
import { Button } from '../lib/components/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../lib/components/Card';
import { Badge } from '../lib/components/Badge';
import { Alert, AlertDescription } from '../lib/components/Alert';

const TripModal = ({ trip, onClose }) => {
  const [alerts, setAlerts] = useState([]);
  const [trackingData, setTrackingData] = useState([]);
  const [activeTab, setActiveTab] = useState('alerts'); // 'alerts' or 'tracking'
  const [alertsLoading, setAlertsLoading] = useState(true);
  const [trackingLoading, setTrackingLoading] = useState(true);

  const toMillis = (value) => {
    if (!value) return 0;
    if (typeof value?.toDate === 'function') return value.toDate().getTime();
    const parsed = new Date(value).getTime();
    return Number.isNaN(parsed) ? 0 : parsed;
  };

  const sortByTimestampDesc = (items) =>
    [...items].sort((a, b) => toMillis(b.timestamp) - toMillis(a.timestamp));

  const sortedAlerts = sortByTimestampDesc(alerts);
  const sortedTrackingData = sortByTimestampDesc(trackingData);

  useEffect(() => {
    if (!trip || !trip.id) return;

    setAlerts([]);
    setTrackingData([]);
    setAlertsLoading(true);
    setTrackingLoading(true);

    // Subscribe to alerts
    const unsubscribeAlerts = subscribeToAlerts(trip.id, (nextAlerts) => {
      setAlerts(nextAlerts || []);
      setAlertsLoading(false);
    });

    // Subscribe to tracking data
    const unsubscribeTracking = subscribeToTrackingData(trip.id, (nextTrackingData) => {
      setTrackingData(nextTrackingData || []);
      setTrackingLoading(false);
    });

    return () => {
      unsubscribeAlerts();
      unsubscribeTracking();
    };
  }, [trip]);

  const getAlertTypeColor = (type) => {
    switch (type) {
      case 'temperature':
        return 'warning';
      case 'tamper':
        return 'destructive';
      case 'impact':
        return 'destructive';
      case 'geofence':
        return 'warning';
      default:
        return 'default';
    }
  };

  const getAlertIcon = (type) => {
    switch (type) {
      case 'temperature':
        return '🌡️';
      case 'tamper':
        return '🔓';
      case 'impact':
        return '💥';
      case 'geofence':
        return '📍';
      default:
        return '⚠️';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-[2px]">
      <Card className="w-full max-w-3xl h-[88vh] overflow-hidden rounded-2xl border-slate-200 shadow-2xl flex flex-col">
        {/* Header */}
        <CardHeader className="border-b border-slate-200 bg-white pb-4 pt-5 flex flex-row items-center justify-between gap-4">
          <div>
            <CardTitle className="text-2xl tracking-tight">{trip.tripName}</CardTitle>
            {/* <CardDescription className="mt-1">Trip ID: {trip.id?.substring(0, 12)}...</CardDescription> */}
          </div>
          <Button 
            variant="ghost" 
            size="icon"
            onClick={onClose}
            className="h-9 w-9 rounded-full text-lg hover:bg-slate-100"
          >
            ✕
          </Button>
        </CardHeader>

        {/* Trip Info */}
        <div className="border-b border-slate-200 bg-gradient-to-r from-sky-50 to-indigo-50 px-6 py-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <p className="text-xs text-gray-600 font-semibold">Status</p>
              <Badge variant="default" className="mt-1">
                {trip.status?.charAt(0).toUpperCase() + trip.status?.slice(1)}
              </Badge>
            </div>
            <div>
              <p className="text-xs text-gray-600 font-semibold">Created</p>
              <p className="text-sm font-medium mt-1">
                {trip.createdAt?.toDate ? new Date(trip.createdAt.toDate()).toLocaleDateString() : 'N/A'}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-600 font-semibold">Driver</p>
              <p className="text-sm font-medium mt-1">
                {trip.assignedDriverName ||
                  (trip.assignedDriver ? `${trip.assignedDriver.substring(0, 12)}...` : '🚫 Unassigned')}
              </p>
            </div>
          </div>
        </div>

        {/* Tabs and Content */}
        <div className="border-b border-slate-200 bg-white px-6 py-3">
          <div className="relative grid w-full grid-cols-2 rounded-full bg-slate-100 p-1 text-slate-600">
            <span
              aria-hidden="true"
              className={`absolute top-1 bottom-1 w-[calc(50%-0.25rem)] rounded-full bg-white shadow-sm transition-transform duration-300 ease-out ${
                activeTab === 'alerts' ? 'translate-x-0 left-1' : 'translate-x-full left-1'
              }`}
            />
            <button
              type="button"
              onClick={() => setActiveTab('alerts')}
              className={`relative z-10 inline-flex items-center justify-center gap-2 rounded-full px-3 py-2 text-sm font-semibold transition-all ${
                activeTab === 'alerts' ? 'text-slate-900' : 'hover:text-slate-800'
              }`}
            >
              🚨 Alerts <Badge variant="secondary" className="text-xs">{alerts.length}</Badge>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('tracking')}
              className={`relative z-10 inline-flex items-center justify-center gap-2 rounded-full px-3 py-2 text-sm font-semibold transition-all ${
                activeTab === 'tracking' ? 'text-slate-900' : 'hover:text-slate-800'
              }`}
            >
              📍 Tracking <Badge variant="secondary" className="text-xs">{trackingData.length}</Badge>
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-hidden">
          {activeTab === 'alerts' && (
            <div className="h-full overflow-y-auto p-6 space-y-3 scroll-smooth [scrollbar-width:thin] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-slate-100 [&::-webkit-scrollbar-thumb]:bg-slate-300 [&::-webkit-scrollbar-thumb]:rounded-full">
              {alertsLoading ? (
                <Card className="bg-slate-50 border-slate-200">
                  <CardContent className="pt-6 text-center">
                    <p className="text-sm font-medium text-slate-700">Loading alerts...</p>
                  </CardContent>
                </Card>
              ) : sortedAlerts.length === 0 ? (
                <Card className="bg-green-50 border-green-200">
                  <CardContent className="pt-6 text-center">
                    <p className="text-lg font-semibold text-green-700 mb-2">✅ No Alerts</p>
                    <p className="text-green-600 text-sm">The trip is proceeding normally</p>
                  </CardContent>
                </Card>
              ) : (
                sortedAlerts.map((alert) => (
                  <Alert key={alert.id} variant={getAlertTypeColor(alert.type)} className="px-3 py-2">
                    <div className="flex items-start gap-2">
                      <span className="text-base leading-none mt-0.5">{getAlertIcon(alert.type)}</span>
                      <div className="flex-1">
                        <p className="text-sm font-semibold capitalize leading-5">{alert.type} Alert</p>
                        <AlertDescription className="mt-0.5 text-xs leading-4">{alert.message}</AlertDescription>
                        <p className="text-[11px] mt-1.5 opacity-75 leading-4">
                          {alert.timestamp?.toDate ? new Date(alert.timestamp.toDate()).toLocaleString() : 'N/A'}
                        </p>
                        {alert.value && (
                          <p className="text-[11px] mt-1 font-mono leading-4">
                            Value: {typeof alert.value === 'number' ? alert.value.toFixed(2) : alert.value}
                          </p>
                        )}
                      </div>
                    </div>
                  </Alert>
                ))
              )}
            </div>
          )}

          {activeTab === 'tracking' && (
            <div className="h-full overflow-y-auto p-6 space-y-3 scroll-smooth [scrollbar-width:thin] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-slate-100 [&::-webkit-scrollbar-thumb]:bg-slate-300 [&::-webkit-scrollbar-thumb]:rounded-full">
              {trackingLoading ? (
                <Card className="bg-slate-50 border-slate-200">
                  <CardContent className="pt-6 text-center">
                    <p className="text-sm font-medium text-slate-700">Loading tracking data...</p>
                  </CardContent>
                </Card>
              ) : sortedTrackingData.length === 0 ? (
                <Card className="bg-gray-50 border-gray-200">
                  <CardContent className="pt-6 text-center">
                    <p className="text-lg font-semibold text-gray-700 mb-2">📊 No Tracking Data</p>
                    <p className="text-gray-600 text-sm">Tracking data will appear here</p>
                  </CardContent>
                </Card>
              ) : (
                sortedTrackingData.map((data, idx) => (
                  <Card key={`${toMillis(data.timestamp)}-${idx}`} className="border-slate-200 hover:shadow-md transition">
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold">
                          {data.timestamp?.toDate ? new Date(data.timestamp.toDate()).toLocaleTimeString() : 'N/A'}
                        </p>
                        <Badge variant="secondary" className="text-xs">
                          #{sortedTrackingData.length - idx}
                        </Badge>
                      </div>
                    </CardHeader>

                    <CardContent className="space-y-2 text-sm">
                      {/* Location */}
                      <div className="grid grid-cols-2 gap-2 p-2 bg-purple-50 rounded">
                        <div>
                          <p className="text-xs text-gray-600">📍 Latitude</p>
                          <p className="font-mono text-xs font-semibold">{data.latitude?.toFixed(6)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-600">📍 Longitude</p>
                          <p className="font-mono text-xs font-semibold">{data.longitude?.toFixed(6)}</p>
                        </div>
                      </div>

                      {/* Environmental Data */}
                      <div className="grid grid-cols-2 gap-2">
                        <div className="p-2 bg-orange-50 rounded">
                          <p className="text-xs text-gray-600">🌡️ Temperature</p>
                          <p className="font-bold text-orange-600">{data.temp?.toFixed(1)}°C</p>
                        </div>
                        <div className="p-2 bg-blue-50 rounded">
                          <p className="text-xs text-gray-600">💧 Humidity</p>
                          <p className="font-bold text-blue-600">{data.humidity?.toFixed(1)}%</p>
                        </div>
                      </div>

                      {/* Acceleration */}
                      <div className="p-2 bg-gray-50 rounded">
                        <p className="text-xs text-gray-600 mb-1">📊 Acceleration (m/s²)</p>
                        <div className="grid grid-cols-3 gap-2 text-xs">
                          <div>
                            <p className="font-semibold">X: {data.ax?.toFixed(2)}</p>
                          </div>
                          <div>
                            <p className="font-semibold">Y: {data.ay?.toFixed(2)}</p>
                          </div>
                          <div>
                            <p className="font-semibold">Z: {data.az?.toFixed(2)}</p>
                          </div>
                        </div>
                      </div>

                      {/* Status Indicators */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <Alert
                          variant={data.tamper ? 'destructive' : 'default'}
                          className={data.tamper ? 'py-2' : 'py-2 border-green-200 bg-green-50 text-green-800'}
                        >
                          <AlertDescription className="text-xs font-medium">
                            {data.tamper ? '🔓 Tamper Detected' : '🔒 Not Tampered'}
                          </AlertDescription>
                        </Alert>

                        <Alert
                          variant={data.impact ? 'destructive' : 'default'}
                          className={data.impact ? 'py-2' : 'py-2 border-green-200 bg-green-50 text-green-800'}
                        >
                          <AlertDescription className="text-xs font-medium">
                            {data.impact ? '💥 Impact Detected' : '✅ No Impact'}
                          </AlertDescription>
                        </Alert>
                      </div>

                      {/* Accuracy
                      {data.accuracy && (
                        <p className="text-xs text-gray-500 border-t pt-2">
                          GPS Accuracy: ±{data.accuracy?.toFixed(1)}m
                        </p>
                      )} */}
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-200 bg-slate-50 p-4 flex justify-end">
          <Button onClick={onClose} variant="outline">
            Close
          </Button>
        </div>
      </Card>
    </div>
  );
};

export default TripModal;
