import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Login from './components/Login';
import Signup from './components/Signup';
import UserHome from './components/UserHome';
import DriverDashboard from './components/DriverDashboard';

function App() {
  return (
    <Router>
      <AuthProvider>
        <Routes>
          {/* Auth Routes */}
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />

          {/* User Routes */}
          <Route
            path="/home"
            element={
              <ProtectedRoute requiredRole="user">
                <UserHome />
              </ProtectedRoute>
            }
          />

          {/* Driver Routes */}
          <Route
            path="/driver-dashboard"
            element={
              <ProtectedRoute requiredRole="driver">
                <DriverDashboard />
              </ProtectedRoute>
            }
          />

          {/* Default redirect */}
          <Route path="/" element={<Navigate to="/login" replace />} />

          {/* 404 */}
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </AuthProvider>
    </Router>
  );
}

export default App;
