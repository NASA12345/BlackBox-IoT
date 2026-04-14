import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Card, CardContent } from '../lib/components/Card';

const ProtectedRoute = ({ children, requiredRole = null }) => {
  const { currentUser, userRole, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-8">
            <div className="flex flex-col items-center gap-4">
              <div className="w-12 h-12 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-full animate-spin"></div>
              <p className="text-lg font-semibold text-gray-900">Loading...</p>
              <p className="text-sm text-gray-600">Please wait while we verify your access</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }

  if (requiredRole && userRole !== requiredRole) {
    return <Navigate to="/login" replace />;
  }

  return children;
};

export default ProtectedRoute;
