import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, View, Text, ActivityIndicator } from 'react-native';
import MapView, { Marker } from 'react-native-maps';

const RIDE_ID = "123";
const WS_URL = `ws://192.168.220.62:8000/ws/location/${RIDE_ID}/`; // Use your PC's local IP for physical device testing

export default function RiderScreen() {
    const [driverLocation, setDriverLocation] = useState(null);
    const [isConnected, setIsConnected] = useState(false);
    const mapRef = useRef(null);
    const ws = useRef(null);

    useEffect(() => {
        connectWebSocket();
        return () => {
            if (ws.current) ws.current.close();
        };
    }, []);

    const connectWebSocket = () => {
        ws.current = new WebSocket(WS_URL);

        ws.current.onopen = () => setIsConnected(true);
        ws.current.onclose = () => setIsConnected(false);

        ws.current.onmessage = (e) => {
            const data = JSON.parse(e.data);
            if (data.latitude && data.longitude) {
                setDriverLocation({
                    latitude: data.latitude,
                    longitude: data.longitude,
                    heading: data.heading
                });

                // Optionally animate map to driver
                mapRef.current?.animateToRegion({
                    latitude: data.latitude,
                    longitude: data.longitude,
                    latitudeDelta: 0.005,
                    longitudeDelta: 0.005,
                });
            }
        };
    };

    return (
        <View style={styles.container}>
            {driverLocation ? (
                <MapView
                    ref={mapRef}
                    style={styles.map}
                    initialRegion={{
                        latitude: driverLocation.latitude,
                        longitude: driverLocation.longitude,
                        latitudeDelta: 0.01,
                        longitudeDelta: 0.01,
                    }}
                >
                    <Marker
                        coordinate={{ latitude: driverLocation.latitude, longitude: driverLocation.longitude }}
                        title="Driver"
                        description="Your driver's live location."
                        rotation={driverLocation.heading}
                    // You can replace this with a custom car image:
                    // image={require('../assets/images/car.png')}
                    />
                </MapView>
            ) : (
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color="#0000ff" />
                    <Text style={styles.loadingText}>
                        {isConnected ? "Waiting for driver signal..." : "Connecting to live map..."}
                    </Text>
                </View>
            )}

            <View style={styles.statusBadge}>
                <View style={[styles.dot, { backgroundColor: isConnected ? '#4CAF50' : '#F44336' }]} />
                <Text style={styles.statusText}>{isConnected ? "Connected" : "Disconnected"}</Text>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f5f5f5' },
    map: { width: '100%', height: '100%' },
    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    loadingText: { marginTop: 10, fontSize: 16, color: '#666' },
    statusBadge: {
        position: 'absolute',
        top: 50,
        right: 20,
        backgroundColor: 'white',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 20,
        flexDirection: 'row',
        alignItems: 'center',
        shadowColor: '#000',
        shadowOpacity: 0.1,
        shadowRadius: 5,
        elevation: 3,
    },
    dot: { width: 10, height: 10, borderRadius: 5, marginRight: 8 },
    statusText: { fontSize: 14, fontWeight: 'bold' }
});
