import React, { useEffect, useState, useCallback, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Circle, Polygon, Polyline, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { Maximize2, Minimize2, X } from 'lucide-react';
import { Label } from '../lib/components/Label';
import { Button } from '../lib/components/Button';
import 'leaflet/dist/leaflet.css';

// Fix Leaflet default icon issue
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

// Default center (New York City)
const DEFAULT_CENTER = [28.610250, 77.031741];

const DEFAULT_MAP_PIN_ICON = L.icon({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

const POINT_ICON = DEFAULT_MAP_PIN_ICON;
const SELECTED_POINT_ICON = DEFAULT_MAP_PIN_ICON;
const CENTER_ICON = DEFAULT_MAP_PIN_ICON;

const createDefaultPolygonPoints = (center) => {
  const [lat, lng] = center;
  const d = 0.002;
  return [
    [lat + d, lng - d],
    [lat + d, lng + d],
    [lat - d, lng],
  ];
};

const normalizeGeofence = (geofence) => {
  const centerLat = Number(geofence?.center?.latitude ?? geofence?.latitude ?? DEFAULT_CENTER[0]);
  const centerLng = Number(geofence?.center?.longitude ?? geofence?.longitude ?? DEFAULT_CENTER[1]);
  const center = [
    Number.isFinite(centerLat) ? centerLat : DEFAULT_CENTER[0],
    Number.isFinite(centerLng) ? centerLng : DEFAULT_CENTER[1],
  ];

  const radiusValue = Number(geofence?.radiusKm ?? geofence?.radius ?? 0.5);
  const radiusKm = Number.isFinite(radiusValue) ? radiusValue : 0.5;
  const type = geofence?.type === 'polygon' ? 'polygon' : 'circle';

  const incomingPoints = Array.isArray(geofence?.polygonPoints)
    ? geofence.polygonPoints
        .map((point) => {
          const lat = Number(point?.latitude ?? point?.lat);
          const lng = Number(point?.longitude ?? point?.lng);
          return Number.isFinite(lat) && Number.isFinite(lng) ? [lat, lng] : null;
        })
        .filter(Boolean)
    : [];

  const polygonPoints = type === 'polygon'
    ? (incomingPoints.length >= 3 ? incomingPoints : createDefaultPolygonPoints(center))
    : incomingPoints;

  return { type, center, radiusKm, polygonPoints };
};

const toExternalGeofence = (state) => ({
  type: state.type,
  center: {
    latitude: state.center[0],
    longitude: state.center[1],
  },
  latitude: state.center[0],
  longitude: state.center[1],
  radiusKm: state.radiusKm,
  polygonPoints: state.polygonPoints.map(([lat, lng]) => ({ latitude: lat, longitude: lng })),
});

const MapClickHandler = ({ onMapClick }) => {
  useMapEvents({
    click(e) {
      onMapClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
};

const MapCenterUpdater = ({ center }) => {
  const map = useMap();

  useEffect(() => {
    map.panTo(center, { animate: false });
  }, [map, center]);

  return null;
};

const LocationMap = ({ geofence, onGeofenceChange, title }) => {
  const [geoState, setGeoState] = useState(() => normalizeGeofence(geofence));
  const [mapCenter, setMapCenter] = useState(DEFAULT_CENTER);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [selectedPointIndex, setSelectedPointIndex] = useState(null);
  const mapWrapperRef = useRef(null);

  // Get current user location on mount
  useEffect(() => {
    if (!geofence?.center?.latitude && !geofence?.center?.longitude && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const pos = [position.coords.latitude, position.coords.longitude];
          setMapCenter(pos);
          const normalized = normalizeGeofence({
            ...geofence,
            center: {
              latitude: pos[0],
              longitude: pos[1],
            },
          });
          setGeoState(normalized);
          onGeofenceChange(toExternalGeofence(normalized));
        },
        (error) => {
          console.warn('Could not get current location:', error);
          // Use default center if geolocation fails
          setMapCenter(DEFAULT_CENTER);
        }
      );
    } else if (Number.isFinite(Number(geofence?.center?.latitude ?? geofence?.latitude)) && Number.isFinite(Number(geofence?.center?.longitude ?? geofence?.longitude))) {
      // If coordinates are provided, use them
      setMapCenter([
        Number(geofence?.center?.latitude ?? geofence?.latitude),
        Number(geofence?.center?.longitude ?? geofence?.longitude),
      ]);
    } else {
      // Use default center if no coords and no geolocation
      setMapCenter(DEFAULT_CENTER);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update map when props change from parent
  useEffect(() => {
    const normalized = normalizeGeofence(geofence);
    setGeoState(normalized);
    setMapCenter(normalized.center);
  }, [geofence]);

  const moveCenter = useCallback((newCenterLat, newCenterLng) => {
    setGeoState((prev) => {
      const deltaLat = newCenterLat - prev.center[0];
      const deltaLng = newCenterLng - prev.center[1];
      const movedPolygon = prev.polygonPoints.map(([lat, lng]) => [lat + deltaLat, lng + deltaLng]);
      const nextState = {
        ...prev,
        center: [newCenterLat, newCenterLng],
        polygonPoints: prev.type === 'polygon' ? movedPolygon : prev.polygonPoints,
      };
      onGeofenceChange(toExternalGeofence(nextState));
      return nextState;
    });
    setMapCenter([newCenterLat, newCenterLng]);
  }, [onGeofenceChange]);

  const handleCenterDrag = useCallback((e) => {
    const newPos = e.target.getLatLng();
    moveCenter(newPos.lat, newPos.lng);
  }, [moveCenter]);

  const handleMapClick = useCallback((lat, lng) => {
    moveCenter(lat, lng);
  }, [moveCenter]);

  const handleRadiusChange = useCallback((e) => {
    const value = Number(e.target.value);
    if (!Number.isFinite(value)) return;

    setGeoState((prev) => {
      const nextState = { ...prev, radiusKm: value };
      onGeofenceChange(toExternalGeofence(nextState));
      return nextState;
    });
  }, [onGeofenceChange]);

  const handleTypeChange = useCallback((type) => {
    setGeoState((prev) => {
      const nextState = {
        ...prev,
        type,
        polygonPoints:
          type === 'polygon'
            ? (prev.polygonPoints.length >= 3 ? prev.polygonPoints : createDefaultPolygonPoints(prev.center))
            : prev.polygonPoints,
      };
      onGeofenceChange(toExternalGeofence(nextState));
      return nextState;
    });
    setSelectedPointIndex(null);
  }, [onGeofenceChange]);

  const addPoint = useCallback(() => {
    setGeoState((prev) => {
      const angle = (Math.PI * 2 * prev.polygonPoints.length) / Math.max(prev.polygonPoints.length + 1, 1);
      const d = 0.0016;
      const newPoint = [
        prev.center[0] + d * Math.sin(angle),
        prev.center[1] + d * Math.cos(angle),
      ];
      const nextState = {
        ...prev,
        polygonPoints: [...prev.polygonPoints, newPoint],
      };
      onGeofenceChange(toExternalGeofence(nextState));
      return nextState;
    });
  }, [onGeofenceChange]);

  const removeSelectedPoint = useCallback(() => {
    if (selectedPointIndex === null) return;

    setGeoState((prev) => {
      if (prev.polygonPoints.length <= 3) return prev;
      const nextPoints = prev.polygonPoints.filter((_, idx) => idx !== selectedPointIndex);
      const nextState = { ...prev, polygonPoints: nextPoints };
      onGeofenceChange(toExternalGeofence(nextState));
      return nextState;
    });
    setSelectedPointIndex(null);
  }, [onGeofenceChange, selectedPointIndex]);

  const handlePointDrag = useCallback((index, e) => {
    const nextLatLng = e.target.getLatLng();
    setGeoState((prev) => {
      const nextPoints = prev.polygonPoints.map((point, i) =>
        i === index ? [nextLatLng.lat, nextLatLng.lng] : point
      );
      const nextState = { ...prev, polygonPoints: nextPoints };
      onGeofenceChange(toExternalGeofence(nextState));
      return nextState;
    });
  }, [onGeofenceChange]);

  const toggleFullscreen = useCallback(async () => {
    if (!mapWrapperRef.current) return;

    if (!document.fullscreenElement) {
      await mapWrapperRef.current.requestFullscreen();
      setIsFullscreen(true);
      return;
    }

    await document.exitFullscreen();
    setIsFullscreen(false);
  }, []);

  useEffect(() => {
    const onFullscreenChange = () => {
      const full = document.fullscreenElement === mapWrapperRef.current;
      setIsFullscreen(full);

      // Let Leaflet re-calculate map size after fullscreen changes.
      window.setTimeout(() => {
        window.dispatchEvent(new Event('resize'));
      }, 150);
    };

    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', onFullscreenChange);
    };
  }, []);

  const currentRadius = Number.isFinite(Number(geoState.radiusKm)) ? Number(geoState.radiusKm) : 0.5;
  const centerPosition = geoState.center;
  const isPolygon = geoState.type === 'polygon';

  const renderCompactFullscreenControls = () => (
    <div className="absolute bottom-5 left-5 z-[1000] w-[420px] max-w-[92vw] space-y-3 rounded-lg border border-gray-200 bg-white/95 p-4 shadow-lg">
      <div className="grid grid-cols-2 gap-2">
        <Button
          type="button"
          size="sm"
          variant={geoState.type === 'circle' ? 'default' : 'outline'}
          onClick={() => handleTypeChange('circle')}
        >
          Circle
        </Button>
        <Button
          type="button"
          size="sm"
          variant={geoState.type === 'polygon' ? 'default' : 'outline'}
          onClick={() => handleTypeChange('polygon')}
        >
          Polygon
        </Button>
      </div>

      <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-700">
        <p className="font-semibold text-gray-900">Legend</p>
        <p>Green marker: center (drag to move full area)</p>
        <p>Blue marker: polygon point (click to manage)</p>
      </div>

      {geoState.type === 'circle' ? (
        <>
          <div className="mb-1 flex items-center justify-between">
            <Label>Radius: {currentRadius.toFixed(2)} km</Label>
            <span className="text-sm text-gray-500 bg-gray-100 px-2 py-1 rounded">
              {(currentRadius * 1000).toFixed(0)} m
            </span>
          </div>
          <input
            type="range"
            min="0.1"
            max="5"
            step="0.1"
            value={currentRadius}
            onChange={handleRadiusChange}
            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-500"
          />
        </>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" variant="outline" onClick={addPoint}>Add Point</Button>
          <span className="text-xs text-gray-600">Click a blue point to remove (min 3 points)</span>
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">{title}</h3>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-12 md:items-start">
        <div className="space-y-4 md:col-span-5">
          {/* Geofence type */}
          <div className="space-y-2">
            <Label>Geofence Type</Label>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={geoState.type === 'circle' ? 'default' : 'outline'}
                onClick={() => handleTypeChange('circle')}
              >
                Circle
              </Button>
              <Button
                type="button"
                variant={geoState.type === 'polygon' ? 'default' : 'outline'}
                onClick={() => handleTypeChange('polygon')}
              >
                Polygon
              </Button>
            </div>
          </div>

          {/* Center Coordinates Display */}
          <div className="grid grid-cols-2 gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
            <div>
              <p className="text-xs text-gray-600 font-semibold">Center Latitude</p>
              <p className="text-sm font-mono text-gray-900">
                {centerPosition[0].toFixed(6)}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-600 font-semibold">Center Longitude</p>
              <p className="text-sm font-mono text-gray-900">
                {centerPosition[1].toFixed(6)}
              </p>
            </div>
          </div>

          {/* Instructions */}
          <p className="text-xs text-gray-500 italic">
            {geoState.type === 'circle'
              ? 'Drag the green center marker or click map to move center. Use slider to adjust circle radius.'
              : 'Drag blue points to reshape polygon. Drag green center to move entire polygon. Click a point to select and remove.'}
          </p>
        </div>

        {/* Map Container */}
        <div className="md:col-span-7 md:pl-1">
          <div
            ref={mapWrapperRef}
            className={`relative ml-auto w-full overflow-hidden ${
              isFullscreen
                ? 'h-screen max-w-none rounded-none border-0'
                : 'md:max-w-[430px] rounded-lg border border-gray-300 h-[190px] sm:h-[210px]'
            }`}
          >
            <button
              type="button"
              onClick={toggleFullscreen}
              className="absolute top-2 right-2 z-[1000] rounded-md bg-white/95 p-2 text-gray-800 shadow hover:bg-white"
              aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            >
              {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>

            {isFullscreen && (
              renderCompactFullscreenControls()
            )}

            <MapContainer
              center={mapCenter}
              zoom={13}
              style={{ height: '100%', width: '100%' }}
              zoomControl={true}
            >
              <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              />
              {centerPosition[0] !== null && centerPosition[1] !== null && (
                <>
                  <Marker
                    position={centerPosition}
                    draggable={true}
                    icon={CENTER_ICON}
                    eventHandlers={{
                      dragend: handleCenterDrag,
                    }}
                  />

                  {isPolygon ? (
                    <>
                      {geoState.polygonPoints.length >= 3 ? (
                        <Polygon
                          positions={geoState.polygonPoints}
                          pathOptions={{ color: '#2563eb', weight: 2, fillOpacity: 0.2 }}
                        />
                      ) : (
                        <Polyline positions={geoState.polygonPoints} pathOptions={{ color: '#2563eb', weight: 2 }} />
                      )}

                      {geoState.polygonPoints.map((point, idx) => (
                        <Marker
                          key={`poly-point-${idx}`}
                          position={point}
                          draggable={true}
                          icon={selectedPointIndex === idx ? SELECTED_POINT_ICON : POINT_ICON}
                          eventHandlers={{
                            click: () => setSelectedPointIndex(idx),
                            dragend: (e) => handlePointDrag(idx, e),
                          }}
                        >
                          {selectedPointIndex === idx && (
                            <Tooltip direction="top" offset={[0, -10]} opacity={1} permanent interactive>
                              <div className="flex items-center justify-between gap-2">
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    if (geoState.polygonPoints.length > 3) {
                                      removeSelectedPoint();
                                    }
                                  }}
                                  disabled={geoState.polygonPoints.length <= 3}
                                  className="rounded bg-red-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                                >
                                  Remove Point
                                </button>
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    setSelectedPointIndex(null);
                                  }}
                                  className="rounded bg-gray-300 p-0.5 text-gray-700 hover:bg-gray-400 flex items-center justify-center"
                                >
                                  <X size={14} />
                                </button>
                              </div>
                            </Tooltip>
                          )}
                        </Marker>
                      ))}
                    </>
                  ) : (
                    <Circle center={centerPosition} radius={currentRadius * 1000} />
                  )}
                </>
              )}
              <MapCenterUpdater center={mapCenter} />
              <MapClickHandler onMapClick={handleMapClick} />
            </MapContainer>
          </div>
        </div>
      </div>

      {/* Slider and Polygon Controls Below Map */}
      <div className="md:col-span-7 md:ml-auto md:max-w-[340px]">
        {geoState.type === 'circle' ? (
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <Label>Radius: {currentRadius.toFixed(2)} km</Label>
              <span className="text-sm text-gray-500 bg-gray-100 px-2 py-1 rounded">
                {(currentRadius * 1000).toFixed(0)} m
              </span>
            </div>
            <input
              type="range"
              min="0.1"
              max="5"
              step="0.1"
              value={currentRadius}
              onChange={handleRadiusChange}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-500"
            />
          </div>
        ) : (
          <div className="space-y-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
            <div className="flex items-center justify-between gap-2">
              <Label>Polygon Points: {geoState.polygonPoints.length}</Label>
              <span className="text-xs text-gray-500">Click a point then remove</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="outline" onClick={addPoint}>Add Point</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default LocationMap;
