import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Alert } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import * as Location from 'expo-location';

const RIDE_ID = "123"; // Hardcoded for testing, would normally be passed via navigation params
const WS_URL = `ws://192.168.220.62:8000/ws/location/${RIDE_ID}/`; // Use your PC's local IP for physical device testing

export default function DriverScreen() {
    const [location, setLocation] = useState(null);
    const [isTracking, setIsTracking] = useState(false);
    const ws = useRef(null);
    const locationSubscription = useRef(null);

    useEffect(() => {
        return () => {
            stopTracking();
            if (ws.current) {
                ws.current.close();
            }
        };
    }, []);

    const connectWebSocket = () => {
        ws.current = new WebSocket(WS_URL);
        ws.current.onopen = () => console.log("WebSocket connected!");
        ws.current.onclose = () => console.log("WebSocket disconnected!");
        ws.current.onerror = (e) => console.log("WebSocket error:", e.message);
    };

    const startTracking = async () => {
        let { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
            Alert.alert('Permission to access location was denied');
            return;
        }

        connectWebSocket();
        setIsTracking(true);

        locationSubscription.current = await Location.watchPositionAsync(
            {
                accuracy: Location.Accuracy.High,
                timeInterval: 3000,
                distanceInterval: 5,
            },
            (newLocation) => {
                setLocation(newLocation);

                // Broadcast location to backend
                if (ws.current && ws.current.readyState === WebSocket.OPEN) {
                    ws.current.send(JSON.stringify({
                        latitude: newLocation.coords.latitude,
                        longitude: newLocation.coords.longitude,
                        heading: newLocation.coords.heading || 0
                    }));
                }
            }
        );
    };

    const stopTracking = () => {
        setIsTracking(false);
        if (locationSubscription.current) {
            locationSubscription.current.remove();
            locationSubscription.current = null;
        }
        if (ws.current) {
            ws.current.close();
            ws.current = null;
        }
    };

    return (
        <View style={styles.container}>
            <MapView
                style={styles.map}
                showsUserLocation={true}
                followsUserLocation={true}
            />

            <View style={styles.controls}>
                <Text style={styles.status}>
                    Status: {isTracking ? "Broadcasting Location 📡" : "Offline"}
                </Text>

                <TouchableOpacity
                    style={[styles.button, isTracking ? styles.buttonStop : styles.buttonStart]}
                    onPress={isTracking ? stopTracking : startTracking}
                >
                    <Text style={styles.buttonText}>
                        {isTracking ? "Stop Broadcasting" : "Start Broadcasting"}
                    </Text>
                </TouchableOpacity>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    map: { width: '100%', height: '100%' },
    controls: {
        position: 'absolute',
        bottom: 40,
        left: 20,
        right: 20,
        backgroundColor: 'white',
        padding: 20,
        borderRadius: 15,
        shadowColor: '#000',
        shadowOpacity: 0.1,
        shadowRadius: 10,
        elevation: 5,
        alignItems: 'center'
    },
    status: { fontSize: 16, fontWeight: 'bold', marginBottom: 15 },
    button: {
        width: '100%', padding: 15, borderRadius: 10, alignItems: 'center'
    },
    buttonStart: { backgroundColor: '#4CAF50' },
    buttonStop: { backgroundColor: '#F44336' },
    buttonText: { color: 'white', fontWeight: 'bold', fontSize: 16 }
});
