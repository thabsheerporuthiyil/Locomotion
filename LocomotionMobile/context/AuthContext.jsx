import React, { createContext, useContext, useEffect, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import { useRouter, useSegments } from 'expo-router';

// Make sure this matches your backend IP
const API_URL = 'http://192.168.220.62:8000/api/accounts';

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
                const role = await SecureStore.getItemAsync('userRole');
                const name = await SecureStore.getItemAsync('userName');

                if (token) {
                    setUser({ token, role, name });
                }
            } catch (e) {
                console.error('Failed to load storage', e);
            } finally {
                setLoading(false);
            }
        }

        loadToken();
    }, []);

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

            // If OTP or 2FA is required, we'd handle it here. 
            // For now, assuming direct access token return.
            if (data.access) {
                await SecureStore.setItemAsync('userToken', data.access);
                await SecureStore.setItemAsync('userRole', data.role || 'customer');
                await SecureStore.setItemAsync('userName', data.name || 'User');

                setUser({
                    token: data.access,
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
            await SecureStore.deleteItemAsync('userRole');
            await SecureStore.deleteItemAsync('userName');
            setUser(null);
        }
    };

    return (
        <AuthContext.Provider value={{ signIn, signOut, user, loading }}>
            {!loading && children}
        </AuthContext.Provider>
    );
}
