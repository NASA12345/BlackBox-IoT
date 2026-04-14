import React, { useState, useEffect } from 'react';
import { getUserTrips } from '../services/firestoreService';
import { useAuth } from '../contexts/AuthContext';
import CreateTrip from './CreateTrip';
import TripModal from './TripModal';
import '../styles/userHome.css';

const UserHome = () => {
  const [trips, setTrips] = useState([]);
  const [selectedTrip, setSelectedTrip] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { currentUser, logout } = useAuth();

  // Fetch trips on mount and when component updates
  const fetchTrips = async () => {
    if (!currentUser) return;

    try {
      setLoading(true);
      const userTrips = await getUserTrips(currentUser.uid);
      setTrips(userTrips);
    } catch (err) {
      setError('Failed to fetch trips: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTrips();
  }, [currentUser]);

  const handleLogout = async () => {
    try {
      await logout();
    } catch (err) {
      setError('Failed to logout: ' + err.message);
    }
  };

  const handleTripCreated = (tripId) => {
    fetchTrips();
  };

  return (
    <div className="user-home">
      <div className="header">
        <h1>BlackBox Insurance - User Dashboard</h1>
        <button onClick={handleLogout} className="btn-logout">
          Logout
        </button>
      </div>

      {error && <div className="error-message">{error}</div>}

      <div className="content">
        <div className="create-trip-section">
          <CreateTrip onTripCreated={handleTripCreated} />
        </div>

        <div className="trips-section">
          <h2>Your Trips</h2>
          
          {loading ? (
            <p>Loading trips...</p>
          ) : trips.length === 0 ? (
            <p className="no-trips">No trips yet. Create your first trip!</p>
          ) : (
            <div className="trips-grid">
              {trips.map((trip) => (
                <div
                  key={trip.id}
                  className="trip-card"
                  onClick={() => setSelectedTrip(trip)}
                >
                  <div className="trip-header">
                    <h3>{trip.tripName}</h3>
                    <span className={`status-badge ${trip.status}`}>
                      {trip.status}
                    </span>
                  </div>
                  
                  <div className="trip-details">
                    <p>
                      <strong>Created:</strong>{' '}
                      {trip.createdAt?.toDate
                        ? new Date(trip.createdAt.toDate()).toLocaleDateString()
                        : 'N/A'}
                    </p>
                    {trip.assignedDriver && (
                      <p>
                        <strong>Driver:</strong> {trip.assignedDriver}
                      </p>
                    )}
                    <p>
                      <strong>Alerts:</strong> {trip.alerts?.length || 0}
                    </p>
                    <p>
                      <strong>Data Points:</strong> {trip.trackingData?.length || 0}
                    </p>
                  </div>

                  <div className="trip-locations">
                    <p>
                      <strong>Start:</strong>{' '}
                      {trip.startGeofence.latitude.toFixed(4)},
                      {trip.startGeofence.longitude.toFixed(4)}
                    </p>
                    <p>
                      <strong>End:</strong> {trip.endGeofence.latitude.toFixed(4)},
                      {trip.endGeofence.longitude.toFixed(4)}
                    </p>
                  </div>

                  <button className="btn-view-details">View Details</button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {selectedTrip && (
        <TripModal
          trip={selectedTrip}
          onClose={() => setSelectedTrip(null)}
        />
      )}
    </div>
  );
};

export default UserHome;
