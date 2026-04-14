import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from 'firebase/auth';
import { auth } from '../firebase';
import { createUserProfile, createDriverProfile, getUserProfile, getDriverProfile } from '../services/firestoreService';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState(null); // 'user' or 'driver'

  // Register as User
  const signUpAsUser = async (email, password, fullName, phone) => {
    try {
      const result = await createUserWithEmailAndPassword(auth, email, password);
      await createUserProfile(result.user.uid, {
        email,
        fullName,
        phone,
      });
      return result.user;
    } catch (error) {
      console.error('User signup error:', error);
      throw error;
    }
  };

  // Register as Driver
  const signUpAsDriver = async (email, password, fullName, phone, licenseNumber, vehicleNumber) => {
    try {
      const result = await createUserWithEmailAndPassword(auth, email, password);
      await createDriverProfile(result.user.uid, {
        email,
        fullName,
        phone,
        licenseNumber,
        vehicleNumber,
      });
      return result.user;
    } catch (error) {
      console.error('Driver signup error:', error);
      throw error;
    }
  };

  // Login function (handles both user and driver)
  const login = async (email, password) => {
    try {
      const result = await signInWithEmailAndPassword(auth, email, password);
      return result.user;
    } catch (error) {
      console.error('Login error:', error);
      throw error;
    }
  };

  // Logout function
  const logout = async () => {
    try {
      await signOut(auth);
      setUserProfile(null);
      setUserRole(null);
    } catch (error) {
      console.error('Logout error:', error);
      throw error;
    }
  };

  // Fetch user or driver profile based on auth
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      
      if (user) {
        try {
          // Check if user exists in users collection
          const uProfile = await getUserProfile(user.uid);
          if (uProfile) {
            setUserProfile(uProfile);
            setUserRole('user');
          } else {
            // Check if driver exists in drivers collection
            const dProfile = await getDriverProfile(user.uid);
            if (dProfile) {
              setUserProfile(dProfile);
              setUserRole('driver');
            }
          }
        } catch (error) {
          console.error('Error fetching profile:', error);
        }
      }
      
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const value = {
    currentUser,
    userProfile,
    userRole,
    loading,
    signUpAsUser,
    signUpAsDriver,
    login,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};
