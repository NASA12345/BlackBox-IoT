import React, { useState, useEffect } from 'react';
import { getUserTrips } from '../services/firestoreService';
import { useAuth } from '../contexts/AuthContext';
import CreateTrip from './CreateTrip';
import TripModal from './TripModal';
import { Button } from '../lib/components/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../lib/components/Card';
import { Badge } from '../lib/components/Badge';
import { Alert, AlertDescription } from '../lib/components/Alert';
import { Skeleton } from '../lib/components/Skeleton';

const UserHome = () => {
  const [trips, setTrips] = useState([]);
  const [selectedTrip, setSelectedTrip] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tripListView, setTripListView] = useState('assigned');
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

  const handleTripListViewChange = (nextView) => {
    if (tripListView === nextView) return;
    setTripListView(nextView);
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50">
      {/* Header */}
      <div className="border-b bg-white shadow-sm">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">BlackBox</h1>
            <p className="text-gray-600 text-sm mt-1">User Dashboard</p>
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
      <div className="container mx-auto px-4 py-4">
        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Create Trip Section */}
        <div className="mb-4">
          <CreateTrip onTripCreated={handleTripCreated} />
        </div>

        {/* Trips Section */}
        <div>
          {/* <div className="mb-6">
            <h2 className="text-2xl font-bold text-gray-900">Your Trips</h2>
            <p className="text-gray-600 text-sm mt-1">Monitor and track all your journeys</p>
          </div> */}

          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-80" />
              ))}
            </div>
          ) : trips.length === 0 ? (
            <Card className="bg-blue-50 border-blue-200">
              <CardContent className="flex flex-col items-center justify-center py-12">
                <div className="text-4xl mb-4">📍</div>
                <p className="text-lg font-semibold text-gray-900 mb-2">No trips yet</p>
                <p className="text-gray-600 text-center">Create your first trip to start tracking!</p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <CardTitle className="text-lg">Your Trips</CardTitle>
                  <div className="relative grid grid-cols-2 rounded-full bg-muted p-1 text-muted-foreground w-[220px]">
                    <span
                      aria-hidden="true"
                      className={`absolute top-1 bottom-1 left-1 w-[calc(50%-0.25rem)] rounded-full bg-white shadow-sm transition-transform duration-300 ease-out ${
                        tripListView === 'assigned' ? 'translate-x-0' : 'translate-x-full'
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => handleTripListViewChange('assigned')}
                      className={`relative z-10 rounded-full px-3 py-1.5 text-sm font-medium transition-all ${
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
                      className={`relative z-10 rounded-full px-3 py-1.5 text-sm font-medium transition-all ${
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
                    ? 'Monitor and track all active/assigned journeys'
                    : 'Review your completed trips'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {tripListView === 'assigned' && assignedTrips.length === 0 ? (
                  <div className="py-8 text-center text-sm text-gray-500">No assigned trips yet</div>
                ) : tripListView === 'completed' && completedTrips.length === 0 ? (
                  <div className="py-8 text-center text-sm text-gray-500">No completed trips yet</div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                    {(tripListView === 'assigned' ? assignedTrips : completedTrips).map((trip) => {
                      const isAssignedView = tripListView === 'assigned';

                      return (
                        <Card
                          key={trip.id}
                          className="hover:shadow-lg transition-shadow cursor-pointer overflow-hidden"
                          onClick={() => setSelectedTrip(trip)}
                        >
                          <CardHeader className="pb-3">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1">
                                <CardTitle className="text-lg">{trip.tripName}</CardTitle>
                                {trip.description && <CardDescription className="mt-1">{trip.description}</CardDescription>}
                              </div>
                              <Badge variant={isAssignedView ? getStatusColor(trip.status) : 'default'}>
                                {isAssignedView
                                  ? trip.status?.charAt(0).toUpperCase() + trip.status?.slice(1)
                                  : 'Completed'}
                              </Badge>
                            </div>
                          </CardHeader>

                          {isAssignedView ? (
                            <CardContent className="space-y-3">
                              <div className="grid grid-cols-2 gap-3 text-sm">
                                <div className="bg-gray-50 p-2 rounded">
                                  <p className="text-gray-600 text-xs">Created</p>
                                  <p className="font-semibold">
                                    {trip.createdAt?.toDate ? new Date(trip.createdAt.toDate()).toLocaleDateString() : 'N/A'}
                                  </p>
                                </div>
                                <div className="bg-gray-50 p-2 rounded">
                                  <p className="text-gray-600 text-xs">Driver</p>
                                  <p className="font-semibold">
                                    {trip.assignedDriverName ||
                                      (trip.assignedDriver ? trip.assignedDriver.slice(0, 8) + '...' : 'Unassigned')}
                                  </p>
                                </div>
                                <div className="bg-gray-50 p-2 rounded">
                                  <p className="text-gray-600 text-xs">Alerts</p>
                                  <p className="font-semibold text-red-600">{trip.alerts?.length || 0}</p>
                                </div>
                                <div className="bg-gray-50 p-2 rounded">
                                  <p className="text-gray-600 text-xs">Data Points</p>
                                  <p className="font-semibold text-blue-600">{trip.trackingData?.length || 0}</p>
                                </div>
                              </div>
                              <div className="border-t pt-3 space-y-2 text-sm">
                                <div>
                                  <p className="text-gray-600 text-xs">📍 Start Point</p>
                                  <p className="font-mono text-xs">{trip.startGeofence?.latitude?.toFixed(4)}, {trip.startGeofence?.longitude?.toFixed(4)}</p>
                                </div>
                                <div>
                                  <p className="text-gray-600 text-xs">🎯 End Point</p>
                                  <p className="font-mono text-xs">{trip.endGeofence?.latitude?.toFixed(4)}, {trip.endGeofence?.longitude?.toFixed(4)}</p>
                                </div>
                              </div>
                              <Button variant="outline" className="w-full mt-2" onClick={() => setSelectedTrip(trip)}>
                                View Details →
                              </Button>
                            </CardContent>
                          ) : (
                            <CardContent className="space-y-3">
                              <div className="grid grid-cols-2 gap-3 text-sm">
                                <div className="bg-gray-50 p-2 rounded">
                                  <p className="text-gray-600 text-xs">Created</p>
                                  <p className="font-semibold">
                                    {trip.createdAt?.toDate ? new Date(trip.createdAt.toDate()).toLocaleDateString() : 'N/A'}
                                  </p>
                                </div>
                                <div className="bg-gray-50 p-2 rounded">
                                  <p className="text-gray-600 text-xs">Driver</p>
                                  <p className="font-semibold">
                                    {trip.assignedDriverName ||
                                      (trip.assignedDriver ? trip.assignedDriver.slice(0, 8) + '...' : 'Unassigned')}
                                  </p>
                                </div>
                              </div>
                              <Button variant="outline" className="w-full mt-2" onClick={() => setSelectedTrip(trip)}>
                                View Details →
                              </Button>
                            </CardContent>
                          )}
                        </Card>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
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
