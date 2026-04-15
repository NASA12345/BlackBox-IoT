import React, { useState, useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Circle, Polygon, Polyline, CircleMarker, Tooltip, Popup } from 'react-leaflet';
import L from 'leaflet';
import { subscribeToAlerts, subscribeToTrackingData, getGeofencePolygonPoints } from '../services/firestoreService';
import { Button } from '../lib/components/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../lib/components/Card';
import { Badge } from '../lib/components/Badge';
import { Alert, AlertDescription } from '../lib/components/Alert';
import 'leaflet/dist/leaflet.css';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

const DEFAULT_MAP_CENTER = [28.61025, 77.031741];

const TripModal = ({ trip, onClose }) => {
  const [alerts, setAlerts] = useState([]);
  const [trackingData, setTrackingData] = useState([]);
  const [activeTab, setActiveTab] = useState('alerts'); // 'alerts' | 'tracking' | 'location'
  const [alertFilter, setAlertFilter] = useState('all');
  const [alertsLoading, setAlertsLoading] = useState(true);
  const [trackingLoading, setTrackingLoading] = useState(true);
  const [startPolygonPoints, setStartPolygonPoints] = useState([]);
  const [endPolygonPoints, setEndPolygonPoints] = useState([]);

  const servicesConfig = {
    tempHumidityEnabled:
      typeof trip?.servicesConfig?.tempHumidityEnabled === 'boolean'
        ? trip.servicesConfig.tempHumidityEnabled
        : true,
    impactEnabled:
      typeof trip?.servicesConfig?.impactEnabled === 'boolean'
        ? trip.servicesConfig.impactEnabled
        : true,
    tamperingEnabled: true,
  };

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
  const trackingMapPoints = useMemo(() => {
    return [...sortedTrackingData]
      .slice()
      .reverse()
      .map((point, index) => {
        const lat = Number(point?.latitude);
        const lng = Number(point?.longitude);
        const valid = Number.isFinite(lat) && Number.isFinite(lng);

        return {
          ...point,
          _idx: index + 1,
          _lat: lat,
          _lng: lng,
          _valid: valid,
        };
      })
      .filter((point) => point._valid);
  }, [sortedTrackingData]);

  const trackingMapCenter = useMemo(() => {
    if (trackingMapPoints.length === 0) {
      return DEFAULT_MAP_CENTER;
    }

    const latest = trackingMapPoints[trackingMapPoints.length - 1];
    return [latest._lat, latest._lng];
  }, [trackingMapPoints]);

  const alertFilterOptions = useMemo(() => {
    const types = [...new Set(sortedAlerts.map((alert) => alert?.type).filter(Boolean))];
    return ['all', ...types];
  }, [sortedAlerts]);

  const filteredAlerts = useMemo(() => {
    if (alertFilter === 'all') return sortedAlerts;
    return sortedAlerts.filter((alert) => alert?.type === alertFilter);
  }, [alertFilter, sortedAlerts]);

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

  useEffect(() => {
    if (!alertFilterOptions.includes(alertFilter)) {
      setAlertFilter('all');
    }
  }, [alertFilter, alertFilterOptions]);

  useEffect(() => {
    if (!trip) return;

    let isCancelled = false;

    const loadPolygonPoints = async () => {
      try {
        const [startPoints, endPoints] = await Promise.all([
          trip?.startGeofence?.type === 'polygon' && trip?.startGeofence?.geofenceId
            ? getGeofencePolygonPoints(trip.startGeofence.geofenceId)
            : Promise.resolve([]),
          trip?.endGeofence?.type === 'polygon' && trip?.endGeofence?.geofenceId
            ? getGeofencePolygonPoints(trip.endGeofence.geofenceId)
            : Promise.resolve([]),
        ]);

        if (isCancelled) return;
        setStartPolygonPoints(startPoints || []);
        setEndPolygonPoints(endPoints || []);
      } catch (error) {
        if (!isCancelled) {
          setStartPolygonPoints([]);
          setEndPolygonPoints([]);
        }
      }
    };

    loadPolygonPoints();

    return () => {
      isCancelled = true;
    };
  }, [trip]);

  const toGeofenceCenter = (geofence) => {
    const lat = Number(geofence?.center?.latitude ?? geofence?.latitude);
    const lng = Number(geofence?.center?.longitude ?? geofence?.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return [lat, lng];
  };

  const startCenter = toGeofenceCenter(trip?.startGeofence);
  const endCenter = toGeofenceCenter(trip?.endGeofence);
  const startPositions = startPolygonPoints.map((point) => [Number(point.latitude), Number(point.longitude)]);
  const endPositions = endPolygonPoints.map((point) => [Number(point.latitude), Number(point.longitude)]);

  const mapCenter = useMemo(() => {
    if (startCenter && endCenter) {
      return [
        (startCenter[0] + endCenter[0]) / 2,
        (startCenter[1] + endCenter[1]) / 2,
      ];
    }
    if (startCenter) return startCenter;
    if (endCenter) return endCenter;
    return DEFAULT_MAP_CENTER;
  }, [startCenter, endCenter]);

  const getAlertTypeColor = (type) => {
    switch (type) {
      case 'temperature':
        return 'warning';
      case 'humidity':
        return 'warning';
      case 'tamper':
        return 'destructive';
      case 'acceleration':
      case 'gyroscope':
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
      case 'humidity':
        return '💧';
      case 'tamper':
        return '🔓';
      case 'acceleration':
        return '💥';
      case 'gyroscope':
        return '🌀';
      case 'impact':
        return '💥';
      case 'geofence':
        return '📍';
      default:
        return '⚠️';
    }
  };

  const getGyroMagnitude = (data) => {
    const gx = Number(data?.gx);
    const gy = Number(data?.gy);
    const gz = Number(data?.gz);
    if (![gx, gy, gz].every(Number.isFinite)) return 0;
    return Math.sqrt(gx * gx + gy * gy + gz * gz);
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
          <div className="relative grid w-full grid-cols-3 rounded-full bg-slate-100 p-1 text-slate-600">
            <span
              aria-hidden="true"
              className={`absolute top-1 bottom-1 w-[calc(33.333%-0.33rem)] rounded-full bg-white shadow-sm transition-transform duration-300 ease-out ${
                activeTab === 'alerts'
                  ? 'translate-x-0 left-1'
                  : activeTab === 'tracking'
                    ? 'translate-x-full left-1'
                    : 'translate-x-[200%] left-1'
              }`}
            />
            <button
              type="button"
              onClick={() => setActiveTab('alerts')}
              className={`relative z-10 inline-flex items-center justify-center gap-2 rounded-full px-3 py-2 text-sm font-semibold transition-all ${
                activeTab === 'alerts' ? 'text-slate-900' : 'hover:text-slate-800'
              }`}
            >
            Alerts <Badge variant="secondary" className="text-xs">{alerts.length}</Badge>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('tracking')}
              className={`relative z-10 inline-flex items-center justify-center gap-2 rounded-full px-3 py-2 text-sm font-semibold transition-all ${
                activeTab === 'tracking' ? 'text-slate-900' : 'hover:text-slate-800'
              }`}
            >
              Tracking <Badge variant="secondary" className="text-xs">{trackingData.length}</Badge>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('location')}
              className={`relative z-10 inline-flex items-center justify-center gap-2 rounded-full px-3 py-2 text-sm font-semibold transition-all ${
                activeTab === 'location' ? 'text-slate-900' : 'hover:text-slate-800'
              }`}
            >
            Location Details
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-hidden">
          {activeTab === 'alerts' && (
            <div className="h-full overflow-y-auto p-6 space-y-3 scroll-smooth [scrollbar-width:thin] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-slate-100 [&::-webkit-scrollbar-thumb]:bg-slate-300 [&::-webkit-scrollbar-thumb]:rounded-full">
              {!alertsLoading && sortedAlerts.length > 0 && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">
                  <div className="flex flex-wrap items-center gap-2">
                    {alertFilterOptions.map((filterType) => {
                      const isActive = alertFilter === filterType;
                      const filterCount =
                        filterType === 'all'
                          ? sortedAlerts.length
                          : sortedAlerts.filter((alert) => alert?.type === filterType).length;

                      return (
                        <button
                          key={filterType}
                          type="button"
                          onClick={() => setAlertFilter(filterType)}
                          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                            isActive
                              ? 'border-slate-900 bg-slate-900 text-white'
                              : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                          }`}
                        >
                          <span className="capitalize">{filterType}</span>
                          <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${
                            isActive ? 'bg-white/25 text-white' : 'bg-slate-100 text-slate-700'
                          }`}>
                            {filterCount}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {alertsLoading ? (
                <Card className="bg-slate-50 border-slate-200">
                  <CardContent className="pt-6 text-center">
                    <p className="text-sm font-medium text-slate-700">Loading alerts...</p>
                  </CardContent>
                </Card>
              ) : filteredAlerts.length === 0 ? (
                <Card className="bg-green-50 border-green-200">
                  <CardContent className="pt-6 text-center">
                    <p className="text-lg font-semibold text-green-700 mb-2">✅ No Alerts</p>
                    <p className="text-green-600 text-sm">
                      {sortedAlerts.length === 0
                        ? 'The trip is proceeding normally'
                        : `No ${alertFilter} alerts found`}
                    </p>
                  </CardContent>
                </Card>
              ) : (
                filteredAlerts.map((alert) => (
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
                <>
                  <Card className="border-slate-200">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">Live Tracking Map</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="h-64 overflow-hidden rounded-lg border border-slate-200">
                        <MapContainer
                          center={trackingMapCenter}
                          zoom={13}
                          style={{ height: '100%', width: '100%' }}
                          zoomControl={true}
                          dragging={true}
                        >
                          <TileLayer
                            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                          />

                          <Polyline
                            positions={trackingMapPoints.map((p) => [p._lat, p._lng])}
                            pathOptions={{ color: '#2563eb', weight: 3, opacity: 0.9 }}
                          />

                          {trackingMapPoints.map((point) => (
                            <CircleMarker
                              key={`${toMillis(point.timestamp)}-${point._idx}`}
                              center={[point._lat, point._lng]}
                              radius={5}
                              pathOptions={{
                                color: '#1d4ed8',
                                weight: 1,
                                fillColor: '#3b82f6',
                                fillOpacity: 0.95,
                              }}
                            >
                              <Tooltip direction="top" offset={[0, -4]}>
                                Ping #{point._idx}
                              </Tooltip>
                              <Popup>
                                <div className="space-y-1 text-xs min-w-[180px]">
                                  <p><span className="font-semibold">Ping:</span> #{point._idx}</p>
                                  <p>
                                    <span className="font-semibold">Time:</span>{' '}
                                    {point.timestamp?.toDate
                                      ? new Date(point.timestamp.toDate()).toLocaleString()
                                      : 'N/A'}
                                  </p>
                                  {/* <p><span className="font-semibold">Lat:</span> {point._lat.toFixed(6)}</p>
                                  <p><span className="font-semibold">Lng:</span> {point._lng.toFixed(6)}</p> */}
                                  {servicesConfig.tempHumidityEnabled && (
                                    <>
                                      <p><span className="font-semibold">Temp:</span> {Number(point.temp ?? 0).toFixed(1)} C</p>
                                      <p><span className="font-semibold">Humidity:</span> {Number(point.humidity ?? 0).toFixed(1)}%</p>
                                    </>
                                  )}
                                  {servicesConfig.impactEnabled && (
                                    <>
                                      <p><span className="font-semibold">Impact (Acc):</span> X {Number(point.ax ?? 0).toFixed(2)}, Y {Number(point.ay ?? 0).toFixed(2)}, Z {Number(point.az ?? 0).toFixed(2)}</p>
                                      <p><span className="font-semibold">Gyro:</span> X {Number(point.gx ?? 0).toFixed(2)}, Y {Number(point.gy ?? 0).toFixed(2)}, Z {Number(point.gz ?? 0).toFixed(2)}</p>
                                    </>
                                  )}
                                  <p><span className="font-semibold">Tamper:</span> {point.tamper ? 'Yes' : 'No'}</p>
                                </div>
                              </Popup>
                            </CircleMarker>
                          ))}
                        </MapContainer>
                      </div>
                    </CardContent>
                  </Card>

                  {sortedTrackingData.map((data, idx) => (
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
                        {servicesConfig.tempHumidityEnabled && (
                          <div className="grid grid-cols-2 gap-2">
                            <div className="p-2 bg-orange-50 rounded">
                              <p className="text-xs text-gray-600">🌡️ Temperature</p>
                              <p className="font-bold text-orange-600">{Number(data.temp ?? 0).toFixed(1)}°C</p>
                            </div>
                            <div className="p-2 bg-blue-50 rounded">
                              <p className="text-xs text-gray-600">💧 Humidity</p>
                              <p className="font-bold text-blue-600">{Number(data.humidity ?? 0).toFixed(1)}%</p>
                            </div>
                          </div>
                        )}

                        {servicesConfig.impactEnabled && (
                          <>
                            {/* Acceleration */}
                            <div className="p-2 bg-gray-50 rounded">
                              <p className="text-xs text-gray-600 mb-1">📊 Acceleration (m/s²)</p>
                              <div className="grid grid-cols-3 gap-2 text-xs">
                                <div>
                                  <p className="font-semibold">X: {Number(data.ax ?? 0).toFixed(2)}</p>
                                </div>
                                <div>
                                  <p className="font-semibold">Y: {Number(data.ay ?? 0).toFixed(2)}</p>
                                </div>
                                <div>
                                  <p className="font-semibold">Z: {Number(data.az ?? 0).toFixed(2)}</p>
                                </div>
                              </div>
                            </div>

                            <div className="p-2 bg-indigo-50 rounded">
                              <p className="text-xs text-gray-600 mb-1">🌀 Gyroscope (rad/s)</p>
                              <div className="grid grid-cols-3 gap-2 text-xs">
                                <div>
                                  <p className="font-semibold">X: {Number(data.gx ?? 0).toFixed(2)}</p>
                                </div>
                                <div>
                                  <p className="font-semibold">Y: {Number(data.gy ?? 0).toFixed(2)}</p>
                                </div>
                                <div>
                                  <p className="font-semibold">Z: {Number(data.gz ?? 0).toFixed(2)}</p>
                                </div>
                              </div>
                            </div>
                          </>
                        )}

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

                          {servicesConfig.impactEnabled && (
                            <Alert
                              variant={getGyroMagnitude(data) > 3 ? 'destructive' : 'default'}
                              className={getGyroMagnitude(data) > 3 ? 'py-2' : 'py-2 border-green-200 bg-green-50 text-green-800'}
                            >
                              <AlertDescription className="text-xs font-medium">
                                {getGyroMagnitude(data) > 3 ? '🌀 High Gyro Motion' : '✅ Gyro Normal'}
                              </AlertDescription>
                            </Alert>
                          )}
                        </div>

                        {/* Accuracy
                        {data.accuracy && (
                          <p className="text-xs text-gray-500 border-t pt-2">
                            GPS Accuracy: ±{data.accuracy?.toFixed(1)}m
                          </p>
                        )} */}
                      </CardContent>
                    </Card>
                  ))}
                </>
              )}
            </div>
          )}

          {activeTab === 'location' && (
            <div className="h-full overflow-y-auto p-6 space-y-3 scroll-smooth [scrollbar-width:thin] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-slate-100 [&::-webkit-scrollbar-thumb]:bg-slate-300 [&::-webkit-scrollbar-thumb]:rounded-full">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-900">Location Details</p>
                <span className="text-xs text-slate-500">Fixed by user</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
                  <p className="text-xs font-semibold text-blue-800">Start Point</p>
                  <p className="font-mono text-xs mt-1 text-blue-900">
                    {startCenter ? `${startCenter[0].toFixed(6)}, ${startCenter[1].toFixed(6)}` : 'N/A'}
                  </p>
                  <p className="text-[11px] mt-1 text-blue-700">
                    {trip?.startGeofence?.type === 'polygon'
                      ? `Polygon (${startPolygonPoints.length || trip?.startGeofence?.polygonPointCount || 0} points)`
                      : `Circle (${Number(trip?.startGeofence?.radiusKm || 0).toFixed(2)} km)`}
                  </p>
                </div>

                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                  <p className="text-xs font-semibold text-emerald-800">End Point</p>
                  <p className="font-mono text-xs mt-1 text-emerald-900">
                    {endCenter ? `${endCenter[0].toFixed(6)}, ${endCenter[1].toFixed(6)}` : 'N/A'}
                  </p>
                  <p className="text-[11px] mt-1 text-emerald-700">
                    {trip?.endGeofence?.type === 'polygon'
                      ? `Polygon (${endPolygonPoints.length || trip?.endGeofence?.polygonPointCount || 0} points)`
                      : `Circle (${Number(trip?.endGeofence?.radiusKm || 0).toFixed(2)} km)`}
                  </p>
                </div>
              </div>

              <div className="h-52 overflow-hidden rounded-lg border border-slate-200">
                <MapContainer
                  center={mapCenter}
                  zoom={12}
                  style={{ height: '100%', width: '100%' }}
                  zoomControl={true}
                  dragging={true}
                >
                  <TileLayer
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                  />

                  {startCenter && (
                    <>
                      <Marker position={startCenter} />
                      {trip?.startGeofence?.type === 'circle' && Number.isFinite(Number(trip?.startGeofence?.radiusKm)) && (
                        <Circle center={startCenter} radius={Number(trip.startGeofence.radiusKm) * 1000} pathOptions={{ color: '#2563eb', fillOpacity: 0.15 }} />
                      )}
                      {trip?.startGeofence?.type === 'polygon' && (
                        startPositions.length >= 3
                          ? <Polygon positions={startPositions} pathOptions={{ color: '#2563eb', fillOpacity: 0.15 }} />
                          : <Polyline positions={startPositions} pathOptions={{ color: '#2563eb' }} />
                      )}
                    </>
                  )}

                  {endCenter && (
                    <>
                      <Marker position={endCenter} />
                      {trip?.endGeofence?.type === 'circle' && Number.isFinite(Number(trip?.endGeofence?.radiusKm)) && (
                        <Circle center={endCenter} radius={Number(trip.endGeofence.radiusKm) * 1000} pathOptions={{ color: '#059669', fillOpacity: 0.15 }} />
                      )}
                      {trip?.endGeofence?.type === 'polygon' && (
                        endPositions.length >= 3
                          ? <Polygon positions={endPositions} pathOptions={{ color: '#059669', fillOpacity: 0.15 }} />
                          : <Polyline positions={endPositions} pathOptions={{ color: '#059669' }} />
                      )}
                    </>
                  )}
                </MapContainer>
              </div>
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
