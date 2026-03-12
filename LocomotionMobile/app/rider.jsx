import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, View, Text, ActivityIndicator, TouchableOpacity, Alert, TextInput, FlatList } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import * as Location from 'expo-location';
import { useAuth } from '../context/AuthContext';

const BASE_URL = 'http://192.168.220.62:8000';

export default function RiderScreen() {
    // Auth
    const { user } = useAuth();

    // UI State
    // 'booking' | 'polling' | 'tracking'
    const [appState, setAppState] = useState('booking');

    // Booking State
    const [pickupLocation, setPickupLocation] = useState('My Location');
    const [dropoffLocation, setDropoffLocation] = useState('City Center');
    const [availableDrivers, setAvailableDrivers] = useState([]);
    const [isFetchingDrivers, setIsFetchingDrivers] = useState(false);

    // Polling State
    const [currentRideId, setCurrentRideId] = useState(null);
    const pollingInterval = useRef(null);

    // Tracking State
    const [driverLocation, setDriverLocation] = useState(null);
    const [isConnected, setIsConnected] = useState(false);

    const mapRef = useRef(null);
    const ws = useRef(null);

    useEffect(() => {
        // Cleanup tracking and polling on unmount
        return () => {
            if (ws.current) ws.current.close();
            if (pollingInterval.current) clearInterval(pollingInterval.current);
        };
    }, []);

    // --- PHASE 1: BOOKING APIs ---
    const fetchDrivers = async () => {
        setIsFetchingDrivers(true);
        try {
            const res = await fetch(`${BASE_URL}/api/drivers/`, {
                headers: { 'Authorization': `Bearer ${user?.token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setAvailableDrivers(data);
            } else {
                Alert.alert("Error", "Failed to fetch drivers.");
            }
        } catch (e) {
            console.error(e);
            Alert.alert("Error", "Network error fetching drivers.");
        } finally {
            setIsFetchingDrivers(false);
        }
    };

    const requestRide = async (driverId) => {
        try {
            // Need dummy coordinates to satisfy the backend serializer restrictions
            const payload = {
                driver: driverId,
                source_location: pickupLocation,
                source_lat: 11.25,
                source_lng: 75.78,
                destination_location: dropoffLocation,
                destination_lat: 11.26,
                destination_lng: 75.79,
                vehicle_details: 'dummy',
                distance_km: 5.0,
                estimated_fare: 150.0
            };

            const res = await fetch(`${BASE_URL}/api/bookings/request/`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${user?.token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            const data = await res.json();
            if (res.ok) {
                // We successfully created the ride
                startPollingForAcceptance();
            } else {
                Alert.alert("Error", JSON.stringify(data));
            }
        } catch (e) {
            console.error(e);
            Alert.alert("Error", "Network error requesting ride.");
        }
    };

    // --- PHASE 1: POLLING APIs ---
    const startPollingForAcceptance = () => {
        setAppState('polling');

        // Poll every 5 seconds to see if the ride's status changed
        pollingInterval.current = setInterval(async () => {
            try {
                const res = await fetch(`${BASE_URL}/api/bookings/my-requests/`, {
                    headers: { 'Authorization': `Bearer ${user?.token}` }
                });
                if (res.ok) {
                    const rides = await res.json();
                    if (rides.length > 0) {
                        const latestRide = rides[0]; // Assuming order_by('-created_at')
                        if (latestRide.status === 'accepted' || latestRide.status === 'arrived' || latestRide.status === 'in_progress') {
                            clearInterval(pollingInterval.current);
                            pollingInterval.current = null;
                            setCurrentRideId(latestRide.id);
                            startTracking(latestRide.id);
                        }
                    }
                }
            } catch (e) {
                console.error("Polling error:", e);
            }
        }, 5000);
    };

    const cancelPolling = () => {
        if (pollingInterval.current) {
            clearInterval(pollingInterval.current);
            pollingInterval.current = null;
        }
        setAppState('booking');
    };

    // --- PHASE 2: LIVE TRACKING ---
    const startTracking = (rideId) => {
        setAppState('tracking');
        connectWebSocket(rideId);
    };

    const connectWebSocket = (rideId) => {
        const WS_URL = `ws://192.168.220.62:8000/ws/location/${rideId}/`;
        ws.current = new WebSocket(WS_URL);

        ws.current.onopen = () => setIsConnected(true);
        ws.current.onclose = () => setIsConnected(false);
        ws.current.onerror = (e) => console.error("[Rider] WS error:", e.message);

        ws.current.onmessage = (e) => {
            try {
                const data = JSON.parse(e.data);
                if (data.role === 'driver' && data.latitude && data.longitude) {
                    setDriverLocation({
                        latitude: data.latitude,
                        longitude: data.longitude,
                        heading: data.heading || 0
                    });

                    // Option to map fitToCoordinates can be implemented here later
                }
            } catch (err) { }
        };
    };

    // --- RENDERERS ---
    if (appState === 'booking') {
        return (
            <View style={styles.bookingContainer}>
                <Text style={styles.headerTitle}>Request a Ride</Text>

                <TextInput
                    style={styles.input}
                    value={pickupLocation}
                    onChangeText={setPickupLocation}
                    placeholder="Pickup Location"
                />
                <TextInput
                    style={styles.input}
                    value={dropoffLocation}
                    onChangeText={setDropoffLocation}
                    placeholder="Dropoff Location"
                />

                <TouchableOpacity style={styles.buttonPrimary} onPress={fetchDrivers} disabled={isFetchingDrivers}>
                    <Text style={styles.buttonText}>{isFetchingDrivers ? "Searching..." : "Find Nearby Drivers"}</Text>
                </TouchableOpacity>

                <FlatList
                    data={availableDrivers}
                    keyExtractor={(item) => item.id.toString()}
                    contentContainerStyle={{ marginTop: 20 }}
                    renderItem={({ item }) => (
                        <View style={styles.driverCard}>
                            <View>
                                <Text style={styles.driverName}>{item.user?.name || "Driver"}</Text>
                                <Text style={styles.driverVehicle}>{item.vehicle_model?.name || "Standard Vehicle"}</Text>
                            </View>
                            <TouchableOpacity style={styles.buttonAction} onPress={() => requestRide(item.id)}>
                                <Text style={styles.buttonText}>Select</Text>
                            </TouchableOpacity>
                        </View>
                    )}
                    ListEmptyComponent={
                        !isFetchingDrivers && availableDrivers.length === 0 ?
                            <Text style={{ textAlign: 'center', marginTop: 20, color: '#666' }}>No drivers found or haven't searched yet.</Text> : null
                    }
                />
            </View>
        );
    }

    if (appState === 'polling') {
        return (
            <View style={styles.centerContainer}>
                <ActivityIndicator size="large" color="#2196F3" />
                <Text style={styles.loadingText}>Waiting for Driver to accept...</Text>
                <TouchableOpacity style={[styles.buttonPrimary, { marginTop: 30, backgroundColor: '#F44336' }]} onPress={cancelPolling}>
                    <Text style={styles.buttonText}>Cancel Request</Text>
                </TouchableOpacity>
            </View>
        );
    }

    // Tracking State
    const initialRegion = driverLocation
        ? { latitude: driverLocation.latitude, longitude: driverLocation.longitude, latitudeDelta: 0.01, longitudeDelta: 0.01 }
        : null;

    return (
        <View style={styles.container}>
            {initialRegion ? (
                <MapView
                    ref={mapRef}
                    style={styles.map}
                    initialRegion={initialRegion}
                    showsUserLocation={true}
                    followsUserLocation={!driverLocation}
                >
                    {driverLocation && (
                        <Marker
                            coordinate={{ latitude: driverLocation.latitude, longitude: driverLocation.longitude }}
                            title="Driver"
                            description="Your driver's live location."
                            rotation={driverLocation.heading}
                        />
                    )}
                </MapView>
            ) : (
                <View style={styles.centerContainer}>
                    <ActivityIndicator size="large" color="#0000ff" />
                    <Text style={styles.loadingText}>Connecting to live map...</Text>
                </View>
            )}

            <View style={styles.statusBadge}>
                <View style={[styles.dot, { backgroundColor: isConnected ? '#4CAF50' : '#F44336' }]} />
                <Text style={styles.statusText}>Ride {currentRideId} {isConnected ? "(Live)" : ""}</Text>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f5f5f5' },
    centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    bookingContainer: { flex: 1, padding: 20, backgroundColor: '#fff', paddingTop: 60 },
    headerTitle: { fontSize: 24, fontWeight: 'bold', marginBottom: 20, textAlign: 'center' },
    input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 15, marginBottom: 15, fontSize: 16 },
    map: { width: '100%', height: '100%' },
    loadingText: { marginTop: 15, fontSize: 16, color: '#666' },
    statusBadge: {
        position: 'absolute', top: 50, right: 20, backgroundColor: 'white', paddingHorizontal: 12, paddingVertical: 8,
        borderRadius: 20, flexDirection: 'row', alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.1, elevation: 3,
    },
    dot: { width: 10, height: 10, borderRadius: 5, marginRight: 8 },
    statusText: { fontSize: 14, fontWeight: 'bold' },
    buttonPrimary: { backgroundColor: '#2196F3', padding: 15, borderRadius: 10, alignItems: 'center' },
    buttonAction: { backgroundColor: '#4CAF50', padding: 10, borderRadius: 8, justifyContent: 'center' },
    buttonText: { color: 'white', fontWeight: 'bold', fontSize: 16 },
    driverCard: { flexDirection: 'row', justifyContent: 'space-between', padding: 15, borderWidth: 1, borderColor: '#eee', borderRadius: 10, marginBottom: 10 },
    driverName: { fontSize: 18, fontWeight: 'bold' },
    driverVehicle: { fontSize: 14, color: '#777', marginTop: 4 }
});
