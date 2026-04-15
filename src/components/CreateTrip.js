import React, { useState } from 'react';
import { createTrip } from '../services/firestoreService';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../lib/components/Button';
import { Input } from '../lib/components/Input';
import { Label } from '../lib/components/Label';
import { Modal, ModalBody } from '../lib/components/Modal';
import { Alert, AlertDescription } from '../lib/components/Alert';
import LocationMap from './LocationMap';
import { useToast } from '../contexts/ToastContext';

const DEFAULT_LOCATION = {
  latitude: '28.610250',
  longitude: '77.031741',
};

const buildDefaultGeofence = () => ({
  type: 'circle',
  center: {
    latitude: Number(DEFAULT_LOCATION.latitude),
    longitude: Number(DEFAULT_LOCATION.longitude),
  },
  latitude: Number(DEFAULT_LOCATION.latitude),
  longitude: Number(DEFAULT_LOCATION.longitude),
  radiusKm: 0.5,
  polygonPoints: [],
});

const PillYesNo = ({ value, onChange, labels = { yes: 'Yes', no: 'No' } }) => (
  <div className="relative grid grid-cols-2 rounded-full bg-slate-100 p-1 text-sm">
    <span
      aria-hidden="true"
      className={`absolute top-1 bottom-1 left-1 w-[calc(50%-0.25rem)] rounded-full bg-white shadow-sm ring-1 ring-slate-200 transition-transform duration-300 ease-out ${
        value ? 'translate-x-0' : 'translate-x-full'
      }`}
    />
    <button
      type="button"
      onClick={() => onChange(true)}
      className={`relative z-10 rounded-full px-3 py-1.5 font-semibold transition-colors ${
        value ? 'text-emerald-700' : 'text-slate-600 hover:text-slate-900'
      }`}
      aria-pressed={value}
    >
      {labels.yes}
    </button>
    <button
      type="button"
      onClick={() => onChange(false)}
      className={`relative z-10 rounded-full px-3 py-1.5 font-semibold transition-colors ${
        !value ? 'text-rose-700' : 'text-slate-600 hover:text-slate-900'
      }`}
      aria-pressed={!value}
    >
      {labels.no}
    </button>
  </div>
);

const ImpactPillSelector = ({ value, onChange }) => (
  <div className="relative grid grid-cols-3 rounded-full bg-slate-100 p-1 text-sm">
    <span
      aria-hidden="true"
      className={`absolute top-1 bottom-1 left-1 w-[calc(33.333%-0.35rem)] rounded-full bg-white shadow-sm ring-1 ring-slate-200 transition-transform duration-300 ease-out ${
        value === 'high' ? 'translate-x-0' : value === 'mid' ? 'translate-x-full' : 'translate-x-[200%]'
      }`}
    />
    <button
      type="button"
      onClick={() => onChange('high')}
      className={`relative z-10 rounded-full px-3 py-1.5 font-semibold transition-colors ${
        value === 'high' ? 'text-rose-700' : 'text-slate-600 hover:text-slate-900'
      }`}
      aria-pressed={value === 'high'}
    >
      High
    </button>
    <button
      type="button"
      onClick={() => onChange('mid')}
      className={`relative z-10 rounded-full px-3 py-1.5 font-semibold transition-colors ${
        value === 'mid' ? 'text-amber-700' : 'text-slate-600 hover:text-slate-900'
      }`}
      aria-pressed={value === 'mid'}
    >
      Mid
    </button>
    <button
      type="button"
      onClick={() => onChange('low')}
      className={`relative z-10 rounded-full px-3 py-1.5 font-semibold transition-colors ${
        value === 'low' ? 'text-emerald-700' : 'text-slate-600 hover:text-slate-900'
      }`}
      aria-pressed={value === 'low'}
    >
      Low
    </button>
  </div>
);

const CreateTrip = ({ onTripCreated }) => {
  const [showModal, setShowModal] = useState(false);
  const [activeSection, setActiveSection] = useState('details'); // details, start, end
  const [tripName, setTripName] = useState('');
  const [description, setDescription] = useState('');
  const [temperatureThreshold, setTemperatureThreshold] = useState('35');
  const [humidityThreshold, setHumidityThreshold] = useState('70');
  const [tempHumidityEnabled, setTempHumidityEnabled] = useState(true);
  const [impactEnabled, setImpactEnabled] = useState(true);
  const [impactLevel, setImpactLevel] = useState('mid');
  
  // Start/End Geofence
  const [startGeofence, setStartGeofence] = useState(buildDefaultGeofence);
  const [endGeofence, setEndGeofence] = useState(buildDefaultGeofence);
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { currentUser } = useAuth();
  const { toast } = useToast();

  const activeSectionIndex =
    activeSection === 'details' ? 0 : activeSection === 'start' ? 1 : 2;

  const normalizeSubmitGeofence = (geofence) => {
    const centerLat = Number(geofence?.center?.latitude ?? geofence?.latitude ?? DEFAULT_LOCATION.latitude);
    const centerLong = Number(geofence?.center?.longitude ?? geofence?.longitude ?? DEFAULT_LOCATION.longitude);
    const radiusKm = Number(geofence?.radiusKm ?? 0.5);

    const normalizedPoints = Array.isArray(geofence?.polygonPoints)
      ? geofence.polygonPoints
          .map((point) => ({
            latitude: Number(point?.latitude),
            longitude: Number(point?.longitude),
          }))
          .filter((point) => Number.isFinite(point.latitude) && Number.isFinite(point.longitude))
      : [];

    const type = geofence?.type === 'polygon' ? 'polygon' : 'circle';

    return {
      type,
      center: {
        latitude: Number.isFinite(centerLat) ? centerLat : Number(DEFAULT_LOCATION.latitude),
        longitude: Number.isFinite(centerLong) ? centerLong : Number(DEFAULT_LOCATION.longitude),
      },
      latitude: Number.isFinite(centerLat) ? centerLat : Number(DEFAULT_LOCATION.latitude),
      longitude: Number.isFinite(centerLong) ? centerLong : Number(DEFAULT_LOCATION.longitude),
      radiusKm: Number.isFinite(radiusKm) ? radiusKm : 0.5,
      polygonPoints: normalizedPoints,
    };
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const resolvedStartGeofence = normalizeSubmitGeofence(startGeofence);
    const resolvedEndGeofence = normalizeSubmitGeofence(endGeofence);
    
    if (!tripName) {
      setError('All fields are required');
      toast({
        title: 'Create trip failed',
        description: 'Trip name is required.',
        variant: 'destructive',
      });
      return;
    }

    if (resolvedStartGeofence.type === 'polygon' && resolvedStartGeofence.polygonPoints.length < 3) {
      setError('Start polygon must have at least 3 points');
      toast({
        title: 'Create trip failed',
        description: 'Start polygon must have at least 3 points.',
        variant: 'destructive',
      });
      return;
    }

    if (resolvedEndGeofence.type === 'polygon' && resolvedEndGeofence.polygonPoints.length < 3) {
      setError('End polygon must have at least 3 points');
      toast({
        title: 'Create trip failed',
        description: 'End polygon must have at least 3 points.',
        variant: 'destructive',
      });
      return;
    }

    if (
      tempHumidityEnabled &&
      (!Number.isFinite(Number(temperatureThreshold)) || !Number.isFinite(Number(humidityThreshold)))
    ) {
      setError('Temperature and humidity thresholds are required when Temp + Humidity service is enabled');
      toast({
        title: 'Create trip failed',
        description: 'Enter valid temperature and humidity threshold values.',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);

    try {
      const tripId = await createTrip(currentUser.uid, {
        tripName,
        description,
        servicesConfig: {
          tempHumidityEnabled,
          impactEnabled,
          tamperingEnabled: true,
        },
        alertThresholds: {
          temperatureMax: tempHumidityEnabled ? parseFloat(temperatureThreshold || '35') : null,
          humidityMax: tempHumidityEnabled ? parseFloat(humidityThreshold || '70') : null,
          impactLevel: impactEnabled ? impactLevel : null,
        },
        startGeofence: resolvedStartGeofence,
        endGeofence: resolvedEndGeofence,
      });

      onTripCreated(tripId);
      toast({
        title: 'Trip created',
        description: 'Your trip has been created successfully.',
        variant: 'success',
      });
      
      // Reset form
      setTripName('');
      setDescription('');
      setTemperatureThreshold('35');
      setHumidityThreshold('70');
      setTempHumidityEnabled(true);
      setImpactEnabled(true);
      setImpactLevel('mid');
      setStartGeofence(buildDefaultGeofence());
      setEndGeofence(buildDefaultGeofence());
      setShowModal(false);
      setActiveSection('details');
    } catch (err) {
      setError(err.message || 'Failed to create trip');
      toast({
        title: 'Create trip failed',
        description: err.message || 'Failed to create trip',
        variant: 'destructive',
      });
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
        className="max-h-[96vh]"
      >
        <ModalBody>
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Section Navigation */}
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-1.5">
              <div className="relative grid grid-cols-3 gap-1.5">
                <span
                  aria-hidden="true"
                  className="absolute top-0.5 bottom-0.5 left-0.5 z-0 rounded-lg bg-white shadow-sm ring-1 ring-blue-200 transition-transform duration-300 ease-out"
                  style={{ width: 'calc(33.333% - 0.5rem)', transform: `translateX(calc(${activeSectionIndex * 100}% + ${activeSectionIndex * 0.25}rem))` }}
                />
                <button
                  type="button"
                  onClick={() => setActiveSection('details')}
                  className={`relative z-10 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
                    activeSection === 'details'
                      ? 'text-blue-700'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Details
                </button>
                <button
                  type="button"
                  onClick={() => setActiveSection('start')}
                  className={`relative z-10 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
                    activeSection === 'start'
                      ? 'text-emerald-700'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Trip Start
                </button>
                <button
                  type="button"
                  onClick={() => setActiveSection('end')}
                  className={`relative z-10 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
                    activeSection === 'end'
                      ? 'text-orange-700'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Trip End
                </button>
              </div>
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
                  <div className="space-y-3 pl-3 ml-1 pb-1 md:col-span-2 rounded-lg border border-blue-200 bg-blue-50 p-3">
                    <p className="text-sm font-semibold text-blue-900">Services Needed</p>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="rounded-md border border-blue-200 bg-white p-3 space-y-2">
                        <p className="text-xs font-semibold text-gray-700">Temp + Humidity</p>
                        <PillYesNo
                          value={tempHumidityEnabled}
                          onChange={setTempHumidityEnabled}
                        />
                      </div>

                      <div className="rounded-md border border-blue-200 bg-white p-3 space-y-2">
                        <p className="text-xs font-semibold text-gray-700">Impact</p>
                        <PillYesNo value={impactEnabled} onChange={setImpactEnabled} />
                      </div>
                    </div>

                    <div className="rounded-md border border-blue-200 bg-white p-3">
                      <p className="text-xs text-gray-700">
                        Tampering: <span className="font-semibold text-green-700">Always ON</span>
                      </p>
                    </div>

                    {tempHumidityEnabled && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="space-y-2">
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
                        <div className="space-y-2">
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
                    )}

                    {impactEnabled && (
                      <div className="space-y-2">
                        <Label htmlFor="impactLevel">Impact Level</Label>
                        <ImpactPillSelector value={impactLevel} onChange={setImpactLevel} />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Start Location Section */}
            {activeSection === 'start' && (
              <div className="max-h-[55vh] overflow-y-auto p-3 bg-blue-50 rounded-lg border border-blue-200">
                <div className="space-y-4">
                  <LocationMap
                    geofence={startGeofence}
                    onGeofenceChange={setStartGeofence}
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
                    geofence={endGeofence}
                    onGeofenceChange={setEndGeofence}
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
