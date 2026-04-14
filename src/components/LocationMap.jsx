import React, { useEffect, useState, useCallback, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Circle, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { Maximize2, Minimize2 } from 'lucide-react';
import { Label } from '../lib/components/Label';
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

const MapClickHandler = ({ onLocationChange }) => {
  useMapEvents({
    click(e) {
      const newPos = [e.latlng.lat, e.latlng.lng];
      onLocationChange(newPos[0], newPos[1]);
    },
  });
  return null;
};

const LocationMap = ({ latitude, longitude, radius, onLocationChange, onRadiusChange, title }) => {
  const [markerPosition, setMarkerPosition] = useState([
    latitude ? parseFloat(latitude) : null,
    longitude ? parseFloat(longitude) : null,
  ]);
  const [mapCenter, setMapCenter] = useState(DEFAULT_CENTER);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const mapWrapperRef = useRef(null);

  // Get current user location on mount
  useEffect(() => {
    if (!latitude && !longitude && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const pos = [position.coords.latitude, position.coords.longitude];
          setMapCenter(pos);
          setMarkerPosition(pos);
        },
        (error) => {
          console.warn('Could not get current location:', error);
          // Use default center if geolocation fails
          setMapCenter(DEFAULT_CENTER);
        }
      );
    } else if (latitude && longitude) {
      // If coordinates are provided, use them
      setMapCenter([parseFloat(latitude), parseFloat(longitude)]);
    } else {
      // Use default center if no coords and no geolocation
      setMapCenter(DEFAULT_CENTER);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update marker position when props change
  useEffect(() => {
    if (latitude && longitude) {
      const newPos = [parseFloat(latitude), parseFloat(longitude)];
      setMarkerPosition(newPos);
      setMapCenter(newPos);
    }
  }, [latitude, longitude]);

  const handleMarkerDrag = useCallback((e) => {
    const newPos = [e.target.getLatLng().lat, e.target.getLatLng().lng];
    setMarkerPosition(newPos);
    onLocationChange(newPos[0], newPos[1]);
  }, [onLocationChange]);

  const handleRadiusChange = useCallback((e) => {
    onRadiusChange(parseFloat(e.target.value));
  }, [onRadiusChange]);

  const handleLocationChange = useCallback((lat, lng) => {
    const newPos = [lat, lng];
    setMarkerPosition(newPos);
    onLocationChange(lat, lng);
  }, [onLocationChange]);

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

  const currentRadius = radius ? parseFloat(radius) : 0.5;
  const validMarkerPosition = markerPosition[0] !== null && markerPosition[1] !== null ? markerPosition : mapCenter;

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">{title}</h3>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-12 md:items-start">
        <div className="space-y-4 md:col-span-5">
          {/* Coordinates Display */}
          <div className="grid grid-cols-2 gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
            <div>
              <p className="text-xs text-gray-600 font-semibold">Latitude</p>
              <p className="text-sm font-mono text-gray-900">
                {validMarkerPosition[0] !== null ? validMarkerPosition[0].toFixed(6) : '---'}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-600 font-semibold">Longitude</p>
              <p className="text-sm font-mono text-gray-900">
                {validMarkerPosition[1] !== null ? validMarkerPosition[1].toFixed(6) : '---'}
              </p>
            </div>
          </div>

          {/* Radius Slider */}
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

          {/* Instructions */}
          <p className="text-xs text-gray-500 italic">
            💡 Drag the marker to adjust location, or click on the map to set a new position. Use the slider to adjust radius.
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
              <div className="absolute bottom-3 left-3 right-3 z-[1000] rounded-lg border border-gray-200 bg-white/95 p-3 shadow">
                <div className="mb-2 flex items-center justify-between">
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
            )}

            <MapContainer
              key={`map-${mapCenter[0]}-${mapCenter[1]}`}
              center={mapCenter}
              zoom={13}
              style={{ height: '100%', width: '100%' }}
              zoomControl={true}
            >
              <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              />
              {validMarkerPosition[0] !== null && validMarkerPosition[1] !== null && (
                <>
                  <Marker
                    position={validMarkerPosition}
                    draggable={true}
                    eventHandlers={{
                      dragend: handleMarkerDrag,
                    }}
                  />
                  <Circle center={validMarkerPosition} radius={currentRadius * 1000} />
                </>
              )}
              <MapClickHandler onLocationChange={handleLocationChange} />
            </MapContainer>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LocationMap;
