import React, { createContext, useContext, useEffect, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import { GoogleSignin } from '@react-native-google-signin/google-signin';

import { BASE_URL } from '../constants/Config';

const API_URL = `${BASE_URL}/api/accounts`;

const AuthContext = createContext({});

export function useAuth() {
  return useContext(AuthContext);
}

const buildDriverSession = (payload, previousSession = {}) => ({
  token: payload.access || previousSession.token || '',
  refreshToken: payload.refresh || previousSession.refreshToken || '',
  role: payload.role || previousSession.role || 'driver',
  name: payload.name || previousSession.name || 'Driver',
  email: payload.email || previousSession.email || '',
  phoneNumber: payload.phone_number || previousSession.phoneNumber || '',
  profileImageUrl: payload.profile_image_url || previousSession.profileImageUrl || '',
});

const persistDriverSession = async (payload, setUser, previousSession = {}) => {
  const session = buildDriverSession(payload, previousSession);

  await SecureStore.setItemAsync('userToken', session.token);
  await SecureStore.setItemAsync('refreshToken', session.refreshToken);
  await SecureStore.setItemAsync('userRole', session.role);
  await SecureStore.setItemAsync('userName', session.name);
  await SecureStore.setItemAsync('userEmail', session.email);
  await SecureStore.setItemAsync('userPhoneNumber', session.phoneNumber);
  await SecureStore.setItemAsync('userProfileImageUrl', session.profileImageUrl);
  setUser(session);
  return session;
};

const clearDriverSession = async (setUser) => {
  await SecureStore.deleteItemAsync('userToken');
  await SecureStore.deleteItemAsync('refreshToken');
  await SecureStore.deleteItemAsync('userRole');
  await SecureStore.deleteItemAsync('userName');
  await SecureStore.deleteItemAsync('userEmail');
  await SecureStore.deleteItemAsync('userPhoneNumber');
  await SecureStore.deleteItemAsync('userProfileImageUrl');
  setUser(null);
};

const fetchDriverProfile = async (token) => {
  const response = await fetch(`${API_URL}/me/`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const data = await parseApiResponse(response);

  if (!response.ok) {
    throw new Error(data?.error || 'Failed to fetch driver profile');
  }

  return data;
};

const hydrateDriverSession = async (authPayload, setUser, previousSession = {}) => {
  let nextPayload = authPayload;

  try {
    const profile = await fetchDriverProfile(authPayload.access);
    nextPayload = {
      ...authPayload,
      ...profile,
    };
  } catch (error) {
    console.error('Profile fetch warning:', error?.message || error);
  }

  return persistDriverSession(nextPayload, setUser, previousSession);
};

const parseApiResponse = async (response) => {
  const text = await response.text();

  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    console.error('Server returned non-JSON response:', text.substring(0, 500));
    throw new Error('Server returned an invalid response.');
  }
};

const getDriverLoginError = (data) => {
  if (data?.otp_required) {
    return 'This driver account requires 2FA. Mobile 2FA login is not available yet.';
  }
  return data?.error || 'Failed to login';
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadToken() {
      try {
        const token = await SecureStore.getItemAsync('userToken');
        const refreshToken = await SecureStore.getItemAsync('refreshToken');
        const role = await SecureStore.getItemAsync('userRole');
        const name = await SecureStore.getItemAsync('userName');
        const email = await SecureStore.getItemAsync('userEmail');
        const phoneNumber = await SecureStore.getItemAsync('userPhoneNumber');
        const profileImageUrl = await SecureStore.getItemAsync('userProfileImageUrl');

        if (token) {
          if (role && role !== 'driver') {
            await clearDriverSession(setUser);
            return;
          }

          const restoredSession = {
            token,
            refreshToken,
            role: role || 'driver',
            name: name || 'Driver',
            email: email || '',
            phoneNumber: phoneNumber || '',
            profileImageUrl: profileImageUrl || '',
          };

          setUser(restoredSession);

          if (!email || !phoneNumber || !profileImageUrl) {
            await hydrateDriverSession(
              {
                access: token,
                refresh: refreshToken,
                role: role || 'driver',
                name: name || 'Driver',
              },
              setUser,
              restoredSession
            );
          }
        }
      } catch (error) {
        console.error('Failed to load storage', error);
      } finally {
        setLoading(false);
      }
    }

    loadToken();
  }, []);

  const refreshToken = async () => {
    try {
      const currentRefreshToken = await SecureStore.getItemAsync('refreshToken');
      if (!currentRefreshToken) return null;

      const res = await fetch(`${API_URL}/token/refresh/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh: currentRefreshToken }),
      });

      const data = await parseApiResponse(res);

      if (!res.ok || !data.access) {
        await clearDriverSession(setUser);
        return null;
      }

      await SecureStore.setItemAsync('userToken', data.access);
      if (data.refresh) {
        await SecureStore.setItemAsync('refreshToken', data.refresh);
      }

      const nextUser = {
        ...(user || {}),
        token: data.access,
        refreshToken: data.refresh || currentRefreshToken,
      };
      await persistDriverSession(
        {
          access: nextUser.token,
          refresh: nextUser.refreshToken,
          role: nextUser.role,
          name: nextUser.name,
          email: nextUser.email,
          phone_number: nextUser.phoneNumber,
          profile_image_url: nextUser.profileImageUrl,
        },
        setUser,
        nextUser
      );
      return data.access;
    } catch (error) {
      console.error('Refresh Error:', error);
      return null;
    }
  };

  const refreshProfile = async () => {
    if (!user?.token) {
      return { success: false, error: 'Not signed in' };
    }

    try {
      const profile = await fetchDriverProfile(user.token);
      await persistDriverSession(
        {
          access: user.token,
          refresh: user.refreshToken,
          role: user.role,
          ...profile,
        },
        setUser,
        user
      );
      return { success: true };
    } catch (error) {
      console.error('Refresh profile error:', error?.message || error);
      return { success: false, error: error.message };
    }
  };

  const signIn = async (email, password) => {
    try {
      const response = await fetch(`${API_URL}/mobile/driver/login/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await parseApiResponse(response);

      if (!response.ok) {
        throw new Error(getDriverLoginError(data));
      }

      if (!data.access) {
        return { success: false, error: getDriverLoginError(data) };
      }

      await hydrateDriverSession(data, setUser);
      return { success: true };
    } catch (error) {
      console.error('Login Error:', error.message);
      return { success: false, error: error.message };
    }
  };

  const signInWithGoogle = async (token) => {
    try {
      const response = await fetch(`${API_URL}/mobile/driver/auth/google/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });

      const data = await parseApiResponse(response);

      if (!response.ok) {
        throw new Error(getDriverLoginError(data));
      }

      if (!data.access) {
        return { success: false, error: getDriverLoginError(data) };
      }

      await hydrateDriverSession(data, setUser);
      return { success: true };
    } catch (error) {
      console.error('Google Login Error:', error.message);
      return { success: false, error: error.message };
    }
  };

  const signOut = async () => {
    try {
      await fetch(`${API_URL}/logout/`, {
        method: 'POST',
        headers: user?.token
          ? {
              Authorization: `Bearer ${user.token}`,
            }
          : {},
      });
    } catch (error) {
      console.error('Logout Error:', error.message);
    } finally {
      try {
        if (GoogleSignin.hasPreviousSignIn()) {
          await GoogleSignin.signOut();
        }
      } catch (googleError) {
        console.error('Google Logout Error:', googleError?.message || googleError);
      }
      await clearDriverSession(setUser);
    }
  };

  return (
    <AuthContext.Provider
      value={{ signIn, signInWithGoogle, signOut, refreshToken, refreshProfile, user, loading }}
    >
      {!loading && children}
    </AuthContext.Provider>
  );
}
