import React, { useState, useEffect } from 'react';
import { subscribeToAlerts, subscribeToTrackingData } from '../services/firestoreService';
import '../styles/tripModal.css';

const TripModal = ({ trip, onClose }) => {
  const [alerts, setAlerts] = useState([]);
  const [trackingData, setTrackingData] = useState([]);
  const [activeTab, setActiveTab] = useState('alerts'); // 'alerts' or 'tracking'

  useEffect(() => {
    if (!trip || !trip.id) return;

    // Subscribe to alerts
    const unsubscribeAlerts = subscribeToAlerts(trip.id, setAlerts);

    // Subscribe to tracking data
    const unsubscribeTracking = subscribeToTrackingData(trip.id, setTrackingData);

    return () => {
      unsubscribeAlerts();
      unsubscribeTracking();
    };
  }, [trip]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{trip.tripName}</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <div className="trip-info">
          <p><strong>Status:</strong> {trip.status}</p>
          <p><strong>Created:</strong> {trip.createdAt?.toDate ? new Date(trip.createdAt.toDate()).toLocaleString() : 'N/A'}</p>
          {trip.assignedDriver && <p><strong>Driver:</strong> {trip.assignedDriver}</p>}
        </div>

        <div className="tab-selector">
          <button
            className={`tab-btn ${activeTab === 'alerts' ? 'active' : ''}`}
            onClick={() => setActiveTab('alerts')}
          >
            Alerts ({alerts.length})
          </button>
          <button
            className={`tab-btn ${activeTab === 'tracking' ? 'active' : ''}`}
            onClick={() => setActiveTab('tracking')}
          >
            Tracking Data ({trackingData.length})
          </button>
        </div>

        <div className="tab-content">
          {activeTab === 'alerts' && (
            <div className="alerts-list">
              {alerts.length === 0 ? (
                <p className="no-data">No alerts yet</p>
              ) : (
                alerts.map((alert) => (
                  <div key={alert.id} className="alert-item">
                    <div className={`alert-type ${alert.type}`}>
                      {alert.type.toUpperCase()}
                    </div>
                    <div className="alert-details">
                      <p className="alert-message">{alert.message}</p>
                      <p className="alert-time">
                        {alert.timestamp?.toDate ? new Date(alert.timestamp.toDate()).toLocaleString() : 'N/A'}
                      </p>
                      {alert.value && <p className="alert-value"><strong>Value:</strong> {alert.value}</p>}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === 'tracking' && (
            <div className="tracking-list">
              {trackingData.length === 0 ? (
                <p className="no-data">No tracking data yet</p>
              ) : (
                <div className="tracking-items">
                  {trackingData.slice().reverse().map((data, idx) => (
                    <div key={idx} className="tracking-item">
                      <div className="tracking-header">
                        <p className="tracking-time">
                          {data.timestamp?.toDate ? new Date(data.timestamp.toDate()).toLocaleString() : 'N/A'}
                        </p>
                      </div>
                      <div className="tracking-data">
                        <p><strong>Location:</strong> {data.latitude?.toFixed(4)}, {data.longitude?.toFixed(4)}</p>
                        <p><strong>Temp:</strong> {data.temp}°C | <strong>Humidity:</strong> {data.humidity}%</p>
                        <p><strong>Acceleration:</strong> X: {data.ax?.toFixed(2)}, Y: {data.ay?.toFixed(2)}, Z: {data.az?.toFixed(2)}</p>
                        {data.tamper && <p className="tamper-warning">⚠️ TAMPER DETECTED</p>}
                        {data.impact && <p className="impact-warning">⚡ IMPACT DETECTED</p>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TripModal;
