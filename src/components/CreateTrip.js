import React, { useState } from 'react';
import { createTrip } from '../services/firestoreService';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../lib/components/Button';
import { Input } from '../lib/components/Input';
import { Label } from '../lib/components/Label';
import { Modal, ModalBody } from '../lib/components/Modal';
import { Alert, AlertDescription } from '../lib/components/Alert';
import LocationMap from './LocationMap';

const DEFAULT_LOCATION = {
  latitude: '28.610250',
  longitude: '77.031741',
};

const CreateTrip = ({ onTripCreated }) => {
  const [showModal, setShowModal] = useState(false);
  const [activeSection, setActiveSection] = useState('details'); // details, start, end
  const [tripName, setTripName] = useState('');
  const [description, setDescription] = useState('');
  const [temperatureThreshold, setTemperatureThreshold] = useState('35');
  const [humidityThreshold, setHumidityThreshold] = useState('70');
  
  // Start Geofence
  const [startLat, setStartLat] = useState(DEFAULT_LOCATION.latitude);
  const [startLong, setStartLong] = useState(DEFAULT_LOCATION.longitude);
  const [startRadius, setStartRadius] = useState('0.5');
  
  // End Geofence
  const [endLat, setEndLat] = useState(DEFAULT_LOCATION.latitude);
  const [endLong, setEndLong] = useState(DEFAULT_LOCATION.longitude);
  const [endRadius, setEndRadius] = useState('0.5');
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { currentUser } = useAuth();

  const handleStartLocationChange = (lat, long) => {
    setStartLat(lat.toString());
    setStartLong(long.toString());
  };

  const handleStartRadiusChange = (radius) => {
    setStartRadius(radius.toString());
  };

  const handleEndLocationChange = (lat, long) => {
    setEndLat(lat.toString());
    setEndLong(long.toString());
  };

  const handleEndRadiusChange = (radius) => {
    setEndRadius(radius.toString());
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const resolvedStartLat = startLat || DEFAULT_LOCATION.latitude;
    const resolvedStartLong = startLong || DEFAULT_LOCATION.longitude;
    const resolvedStartRadius = startRadius || '0.5';
    const resolvedEndLat = endLat || DEFAULT_LOCATION.latitude;
    const resolvedEndLong = endLong || DEFAULT_LOCATION.longitude;
    const resolvedEndRadius = endRadius || '0.5';
    
    if (!tripName) {
      setError('All fields are required');
      return;
    }

    setLoading(true);

    try {
      const tripId = await createTrip(currentUser.uid, {
        tripName,
        description,
        alertThresholds: {
          temperatureMax: parseFloat(temperatureThreshold || '35'),
          humidityMax: parseFloat(humidityThreshold || '70'),
        },
        startGeofence: {
          latitude: parseFloat(resolvedStartLat),
          longitude: parseFloat(resolvedStartLong),
          radiusKm: parseFloat(resolvedStartRadius),
        },
        endGeofence: {
          latitude: parseFloat(resolvedEndLat),
          longitude: parseFloat(resolvedEndLong),
          radiusKm: parseFloat(resolvedEndRadius),
        },
      });

      onTripCreated(tripId);
      
      // Reset form
      setTripName('');
      setDescription('');
      setTemperatureThreshold('35');
      setHumidityThreshold('70');
      setStartLat(DEFAULT_LOCATION.latitude);
      setStartLong(DEFAULT_LOCATION.longitude);
      setStartRadius('0.5');
      setEndLat(DEFAULT_LOCATION.latitude);
      setEndLong(DEFAULT_LOCATION.longitude);
      setEndRadius('0.5');
      setShowModal(false);
      setActiveSection('details');
    } catch (err) {
      setError(err.message || 'Failed to create trip');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Open Modal Button */}
      <Button 
        size="sm"
        onClick={() => setShowModal(true)}
        className="gap-2"
      >
        Create New Trip
      </Button>

      {/* Modal */}
      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title="Create New Trip"
        size="2xl"
      >
        <ModalBody>
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Section Navigation */}
            <div className="flex gap-2 border-b border-gray-200 pb-4">
              <button
                type="button"
                onClick={() => setActiveSection('details')}
                className={`px-4 py-2 font-medium text-sm rounded-t-lg transition-colors ${
                  activeSection === 'details'
                    ? 'bg-blue-100 text-blue-900 border-b-2 border-blue-500'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                📋 Details
              </button>
              <button
                type="button"
                onClick={() => setActiveSection('start')}
                className={`px-4 py-2 font-medium text-sm rounded-t-lg transition-colors ${
                  activeSection === 'start'
                    ? 'bg-blue-100 text-blue-900 border-b-2 border-blue-500'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                🔵 Trip Start
              </button>
              <button
                type="button"
                onClick={() => setActiveSection('end')}
                className={`px-4 py-2 font-medium text-sm rounded-t-lg transition-colors ${
                  activeSection === 'end'
                    ? 'bg-blue-100 text-blue-900 border-b-2 border-blue-500'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                🟢 Trip End
              </button>
            </div>

            {/* Details Section */}
            {activeSection === 'details' && (
              <div className="max-h-[52vh] overflow-y-auto space-y-4 pr-1">
                {/* <h3 className="text-lg font-semibold">Trip Details</h3> */}
                
                <div className="space-y-2 border-blue-300 pl-1 ml-1">
                  <Label htmlFor="tripName">Trip Name *</Label>
                  <Input
                    id="tripName"
                    type="text"
                    value={tripName}
                    onChange={(e) => setTripName(e.target.value)}
                    placeholder="e.g., Daily Commute to Office"
                    required
                  />
                </div>

                <div className="space-y-2 border-blue-300 pl-1 ml-1 pb-1">
                  <Label htmlFor="description">Description</Label>
                  <textarea
                    id="description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Additional details about your trip"
                    className="flex min-h-[110px] w-full rounded-md border border-blue-200 bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-2 border-blue-300 pl-1 ml-1 pb-1">
                    <Label htmlFor="temperatureThreshold">Temperature Threshold (°C)</Label>
                    <Input
                      id="temperatureThreshold"
                      type="number"
                      step="0.1"
                      value={temperatureThreshold}
                      onChange={(e) => setTemperatureThreshold(e.target.value)}
                      placeholder="35"
                      className="border-blue-200"
                    />
                  </div>
                  <div className="space-y-2 border-blue-300 pl-1 ml-1 pb-1">
                    <Label htmlFor="humidityThreshold">Humidity Threshold (%)</Label>
                    <Input
                      id="humidityThreshold"
                      type="number"
                      step="0.1"
                      value={humidityThreshold}
                      onChange={(e) => setHumidityThreshold(e.target.value)}
                      placeholder="70"
                      className="border-blue-200"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Start Location Section */}
            {activeSection === 'start' && (
              <div className="max-h-[52vh] overflow-y-auto p-3 bg-blue-50 rounded-lg border border-blue-200">
                <div className="space-y-4">
                  <LocationMap
                    latitude={startLat}
                    longitude={startLong}
                    radius={startRadius}
                    onLocationChange={handleStartLocationChange}
                    onRadiusChange={handleStartRadiusChange}
                    title="📍 Start Location"
                  />
                </div>
              </div>
            )}

            {/* End Location Section */}
            {activeSection === 'end' && (
              <div className="max-h-[52vh] overflow-y-auto p-3 bg-green-50 rounded-lg border border-green-200">
                <div className="space-y-4">
                  <LocationMap
                    latitude={endLat}
                    longitude={endLong}
                    radius={endRadius}
                    onLocationChange={handleEndLocationChange}
                    onRadiusChange={handleEndRadiusChange}
                    title="🎯 End Location"
                  />
                </div>
              </div>
            )}

            {/* Modal Actions */}
            <div className="flex gap-3 justify-end pt-4 border-t border-gray-200">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowModal(false)}
              >
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={loading}
                className="gap-2"
              >
                {loading ? '⏳ Creating...' : 'Create Trip'}
              </Button>
            </div>
          </form>
        </ModalBody>
      </Modal>
    </>
  );
};

export default CreateTrip;
