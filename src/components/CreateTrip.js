import React, { useState } from 'react';
import { createTrip } from '../services/firestoreService';
import { useAuth } from '../contexts/AuthContext';
import '../styles/trips.css';

const CreateTrip = ({ onTripCreated }) => {
  const [showForm, setShowForm] = useState(false);
  const [tripName, setTripName] = useState('');
  const [description, setDescription] = useState('');
  
  // Start Geofence
  const [startLat, setStartLat] = useState('');
  const [startLong, setStartLong] = useState('');
  const [startRadius, setStartRadius] = useState('');
  
  // End Geofence
  const [endLat, setEndLat] = useState('');
  const [endLong, setEndLong] = useState('');
  const [endRadius, setEndRadius] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { currentUser } = useAuth();

  const handleGetCurrentLocation = async (setLatFunc, setLongFunc) => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setLatFunc(position.coords.latitude.toString());
          setLongFunc(position.coords.longitude.toString());
        },
        (error) => {
          setError('Could not get current location: ' + error.message);
        }
      );
    } else {
      setError('Geolocation not supported by browser');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    
    if (!tripName || !startLat || !startLong || !startRadius || !endLat || !endLong || !endRadius) {
      setError('All fields are required');
      return;
    }

    setLoading(true);

    try {
      const tripId = await createTrip(currentUser.uid, {
        tripName,
        description,
        startGeofence: {
          latitude: parseFloat(startLat),
          longitude: parseFloat(startLong),
          radiusKm: parseFloat(startRadius),
        },
        endGeofence: {
          latitude: parseFloat(endLat),
          longitude: parseFloat(endLong),
          radiusKm: parseFloat(endRadius),
        },
      });

      onTripCreated(tripId);
      
      // Reset form
      setTripName('');
      setDescription('');
      setStartLat('');
      setStartLong('');
      setStartRadius('');
      setEndLat('');
      setEndLong('');
      setEndRadius('');
      setShowForm(false);
    } catch (err) {
      setError(err.message || 'Failed to create trip');
    } finally {
      setLoading(false);
    }
  };

  if (!showForm) {
    return (
      <button className="btn-primary" onClick={() => setShowForm(true)}>
        + Create New Trip
      </button>
    );
  }

  return (
    <div className="trip-form-container">
      <div className="trip-form-card">
        <h3>Create New Trip</h3>
        
        {error && <div className="error-message">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Trip Name</label>
            <input
              type="text"
              value={tripName}
              onChange={(e) => setTripName(e.target.value)}
              placeholder="e.g., Daily Commute"
              required
            />
          </div>

          <div className="form-group">
            <label>Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Trip details"
            />
          </div>

          <h4>Start Location Geofence</h4>
          <div className="geo-section">
            <div className="form-group">
              <label>Latitude</label>
              <input
                type="number"
                value={startLat}
                onChange={(e) => setStartLat(e.target.value)}
                placeholder="0.0000"
                step="0.0001"
                required
              />
            </div>

            <div className="form-group">
              <label>Longitude</label>
              <input
                type="number"
                value={startLong}
                onChange={(e) => setStartLong(e.target.value)}
                placeholder="0.0000"
                step="0.0001"
                required
              />
            </div>

            <div className="form-group">
              <label>Radius (km)</label>
              <input
                type="number"
                value={startRadius}
                onChange={(e) => setStartRadius(e.target.value)}
                placeholder="0.5"
                step="0.1"
                required
              />
            </div>

            <button
              type="button"
              className="btn-secondary"
              onClick={() => handleGetCurrentLocation(setStartLat, setStartLong)}
            >
              Use Current Location
            </button>
          </div>

          <h4>End Location Geofence</h4>
          <div className="geo-section">
            <div className="form-group">
              <label>Latitude</label>
              <input
                type="number"
                value={endLat}
                onChange={(e) => setEndLat(e.target.value)}
                placeholder="0.0000"
                step="0.0001"
                required
              />
            </div>

            <div className="form-group">
              <label>Longitude</label>
              <input
                type="number"
                value={endLong}
                onChange={(e) => setEndLong(e.target.value)}
                placeholder="0.0000"
                step="0.0001"
                required
              />
            </div>

            <div className="form-group">
              <label>Radius (km)</label>
              <input
                type="number"
                value={endRadius}
                onChange={(e) => setEndRadius(e.target.value)}
                placeholder="0.5"
                step="0.1"
                required
              />
            </div>

            <button
              type="button"
              className="btn-secondary"
              onClick={() => handleGetCurrentLocation(setEndLat, setEndLong)}
            >
              Use Current Location
            </button>
          </div>

          <div className="form-actions">
            <button type="submit" disabled={loading} className="btn-primary">
              {loading ? 'Creating...' : 'Create Trip'}
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setShowForm(false)}
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateTrip;
