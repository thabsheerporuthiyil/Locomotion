import React, { createContext, useContext, useEffect, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import { useRouter, useSegments } from 'expo-router';

// Make sure this matches your backend IP
const API_URL = 'http://192.168.220.46:8000/api/accounts';

const AuthContext = createContext({});

export function useAuth() {
    return useContext(AuthContext);
}

// Custom hook to protect routes removed from here (moved to app/_layout.jsx)

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    // Load the token when the app starts
    useEffect(() => {
        async function loadToken() {
            try {
                const token = await SecureStore.getItemAsync('userToken');
                const refreshTokenVal = await SecureStore.getItemAsync('refreshToken');
                const role = await SecureStore.getItemAsync('userRole');
                const name = await SecureStore.getItemAsync('userName');

                if (token) {
                    setUser({ token, refreshToken: refreshTokenVal, role, name });
                }
            } catch (e) {
                console.error('Failed to load storage', e);
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
                body: JSON.stringify({ refresh: currentRefreshToken })
            });

            if (res.ok) {
                const data = await res.json();
                await SecureStore.setItemAsync('userToken', data.access);
                if (data.refresh) await SecureStore.setItemAsync('refreshToken', data.refresh);
                
                const newUser = { ...user, token: data.access, refreshToken: data.refresh || currentRefreshToken };
                setUser(newUser);
                return data.access;
            } else {
                // If refresh fails, log out
                signOut();
                return null;
            }
        } catch (e) {
            console.error("Refresh Error:", e);
            return null;
        }
    };

    const signIn = async (email, password) => {
        try {
            const response = await fetch(`${API_URL}/login/`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password }),
            });

            const text = await response.text();
            let data;
            try {
                data = JSON.parse(text);
            } catch (err) {
                console.error("Server returned non-JSON response:", text.substring(0, 500));
                throw new Error('Server returned an invalid response (not JSON)');
            }

            if (!response.ok) {
                throw new Error(data.error || 'Failed to login');
            }

            if (data.access) {
                await SecureStore.setItemAsync('userToken', data.access);
                await SecureStore.setItemAsync('refreshToken', data.refresh || '');
                await SecureStore.setItemAsync('userRole', data.role || 'customer');
                await SecureStore.setItemAsync('userName', data.name || 'User');

                setUser({
                    token: data.access,
                    refreshToken: data.refresh,
                    role: data.role || 'customer',
                    name: data.name || 'User'
                });
                return { success: true };
            }

            return { success: false, error: 'Login step incomplete (OTP/2FA not handled here)' };

        } catch (e) {
            console.error("Login Error:", e.message);
            return { success: false, error: e.message };
        }
    };

    const signOut = async () => {
        try {
            await fetch(`${API_URL}/logout/`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${user?.token}`,
                }
            });
        } catch (e) {
            console.error("Logout Error:", e.message);
        } finally {
            await SecureStore.deleteItemAsync('userToken');
            await SecureStore.deleteItemAsync('refreshToken');
            await SecureStore.deleteItemAsync('userRole');
            await SecureStore.deleteItemAsync('userName');
            setUser(null);
        }
    };

    return (
        <AuthContext.Provider value={{ signIn, signOut, refreshToken, user, loading }}>
            {!loading && children}
        </AuthContext.Provider>
    );
}
