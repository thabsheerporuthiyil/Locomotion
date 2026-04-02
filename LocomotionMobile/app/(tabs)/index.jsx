import React, { useState, useEffect, useRef, useCallback } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Alert, ActivityIndicator, TextInput, KeyboardAvoidingView, Platform, ScrollView, Dimensions, StatusBar, FlatList } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import * as Location from 'expo-location';
import { useAuth } from '@/context/AuthContext';
import { useFocusEffect, useRouter } from 'expo-router';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { BASE_URL, WS_URL as WS_BASE_URL } from '@/constants/Config';

const { width } = Dimensions.get('window');

export default function HomeScreen() {
    const { user, refreshToken } = useAuth();
    const router = useRouter();
    const userRef = useRef(user);

    useEffect(() => {
        userRef.current = user;
    }, [user]);

    // UI State: 'idle' | 'hasRequests' | 'tracking'
    const [appState, setAppState] = useState('idle');
    const [pendingRequests, setPendingRequests] = useState([]);
    const [activeRide, setActiveRide] = useState(null);
    const [currentRideId, setCurrentRideId] = useState(null);
    const [otpInput, setOtpInput] = useState('');
    const [isActionLoading, setIsActionLoading] = useState(false);

    // Chat State
    const [isChatOpen, setIsChatOpen] = useState(false);
    const [messages, setMessages] = useState([]);
    const [newMessage, setNewMessage] = useState('');
    const [unreadCount, setUnreadCount] = useState(0);

    // Polling & Location Tracking
    const pollingInterval = useRef(null);
    const chatPollingInterval = useRef(null);
    const hasInitialChatFetch = useRef(false);
    const [location, setLocation] = useState(null);
    const [riderLocation, setRiderLocation] = useState(null);
    const [isConnected, setIsConnected] = useState(false);
    const ws = useRef(null);
    const locationSubscription = useRef(null);
    const mapRef = useRef(null);
    const reconnectTimeout = useRef(null);
    const shouldReconnect = useRef(false);
    const latestLocationRef = useRef(null);
    const appStateRef = useRef(appState);
    const currentRideIdRef = useRef(currentRideId);
    const checkForRequestsRef = useRef(null);
    const fetchChatMessagesRef = useRef(null);

    // --- INITIALIZATION & FOCUS HANDLING ---
    const startPolling = useCallback(() => {
        if (pollingInterval.current) return;
        checkForRequestsRef.current?.();
        pollingInterval.current = setInterval(() => checkForRequestsRef.current?.(), 5000);
    }, []);

    const stopChatPolling = useCallback(() => {
        if (chatPollingInterval.current) {
            clearInterval(chatPollingInterval.current);
            chatPollingInterval.current = null;
        }
    }, []);

    const stopPolling = useCallback(() => {
        if (pollingInterval.current) {
            clearInterval(pollingInterval.current);
            pollingInterval.current = null;
        }
        stopChatPolling();
    }, [stopChatPolling]);

    const stopTracking = useCallback(() => {
        shouldReconnect.current = false;
        if (reconnectTimeout.current) {
            clearTimeout(reconnectTimeout.current);
            reconnectTimeout.current = null;
        }
        locationSubscription.current?.remove();
        locationSubscription.current = null;
        if (ws.current) {
            ws.current.onclose = null;
            ws.current.close();
            ws.current = null;
        }
        setRiderLocation(null);
        setIsConnected(false);
        latestLocationRef.current = null;
    }, []);

    useFocusEffect(
        useCallback(() => {
            startPolling();
            return () => {
                stopPolling();
                stopTracking();
            };
        }, [startPolling, stopPolling, stopTracking])
    );

    useEffect(() => {
        appStateRef.current = appState;
    }, [appState]);

    useEffect(() => {
        currentRideIdRef.current = currentRideId;
    }, [currentRideId]);

    // --- POLLING LOGIC ---
    async function checkForRequests() {
        try {
            let currentToken = userRef.current?.token;
            if (!currentToken) return;

            const res = await fetch(`${BASE_URL}/api/bookings/driver-requests/`, {
                headers: { 'Authorization': `Bearer ${currentToken}` }
            });

            if (res.status === 401) {
                const newTask = await refreshToken();
                if (newTask) {
                    const retryRes = await fetch(`${BASE_URL}/api/bookings/driver-requests/`, {
                        headers: { 'Authorization': `Bearer ${newTask}` }
                    });
                    if (retryRes.ok) handleRequests(await retryRes.json());
                }
                return;
            }

            if (res.ok) {
                handleRequests(await res.json());
            }
        } catch (e) {
            console.error("Polling Error:", e);
        }
    }

    checkForRequestsRef.current = checkForRequests;

    const handleRequests = (rides) => {
        // 1. Identify if there's an active (accepted/in-progress) ride
        const active = rides.find(r => ['accepted', 'arrived', 'in_progress', 'completed'].includes(r.status) && (r.status !== 'completed' || !r.is_paid));
        
        if (active) {
            setActiveRide(active);
            setCurrentRideId(active.id);
            currentRideIdRef.current = active.id;
            const socketState = ws.current?.readyState;
            const hasHealthyTrackingSession =
                appStateRef.current === 'tracking' &&
                currentRideIdRef.current === active.id &&
                locationSubscription.current &&
                (socketState === WebSocket.OPEN || socketState === WebSocket.CONNECTING);

            if (!hasHealthyTrackingSession) startTracking(active.id);
            setPendingRequests([]); // Hide pending stack if on active ride
            return;
        }

        // 2. Identify pending requests
        const pending = rides.filter(r => r.status === 'pending');
        setPendingRequests(pending);

        if (pending.length > 0) {
            setAppState('hasRequests');
            setActiveRide(null);
        } else {
            resetToIdle();
        }
    };

    const resetToIdle = () => {
        if (appStateRef.current !== 'idle') {
            setAppState('idle');
            setPendingRequests([]);
            setActiveRide(null);
            setCurrentRideId(null);
            currentRideIdRef.current = null;
            setOtpInput('');
            stopTracking();
            stopChatPolling();
            setMessages([]);
            setUnreadCount(0);
        }
    };

    // --- CHAT LOGIC ---
    const startChatPolling = useCallback(() => {
        if (chatPollingInterval.current) return;
        fetchChatMessagesRef.current?.();
        chatPollingInterval.current = setInterval(() => fetchChatMessagesRef.current?.(), 3000);
    }, []);

    async function fetchChatMessages() {
        if (!activeRide || !['accepted', 'arrived', 'in_progress'].includes(activeRide.status)) return;
        try {
            const res = await fetch(`${BASE_URL}/api/bookings/${activeRide.id}/chat/`, {
                headers: { 'Authorization': `Bearer ${user?.token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setMessages(prev => {
                    if (hasInitialChatFetch.current && data.length > prev.length && !isChatOpen) {
                        setUnreadCount(u => u + (data.length - prev.length));
                    }
                    return data;
                });
                hasInitialChatFetch.current = true;
            }
        } catch (e) {
            console.error("Chat error:", e);
        }
    }

    fetchChatMessagesRef.current = fetchChatMessages;

    useEffect(() => {
        if (activeRide && ['accepted', 'arrived', 'in_progress'].includes(activeRide.status)) {
            hasInitialChatFetch.current = false;
            startChatPolling();
        } else {
            stopChatPolling();
        }
    }, [activeRide, startChatPolling, stopChatPolling]);

    const handleSendMessage = async () => {
        if (!newMessage.trim() || !activeRide) return;
        try {
            const formData = new FormData();
            formData.append('message', newMessage);
            setNewMessage('');
            const res = await fetch(`${BASE_URL}/api/bookings/${activeRide.id}/chat/send/`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${user?.token}` },
                body: formData
            });
            if (res.ok) fetchChatMessages();
        } catch (e) { console.error(e); }
    };

    // --- RIDE ACTIONS ---
    const handleRideAction = async (rideId, action, extraData = {}) => {
        if (!rideId || isActionLoading) return;
        
        setIsActionLoading(true);
        try {
            // Optimistic update for acceptance
            if (action === 'accept') {
                const rideToAccept = pendingRequests.find(r => r.id === rideId);
                if (rideToAccept) {
                    setActiveRide({ ...rideToAccept, status: 'accepted' });
                    setPendingRequests([]);
                    startTracking(rideId);
                }
            }

            const res = await fetch(`${BASE_URL}/api/bookings/${rideId}/${action}/`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${user?.token}`,
                    'Content-Type': 'application/json'
                },
                body: Object.keys(extraData).length > 0 ? JSON.stringify(extraData) : null
            });
            
            if (res.ok) {
                if (action === 'confirm_payment') resetToIdle();
                else await checkForRequests(); // Refresh data to get latest server state
            } else {
                const data = await res.json();
                Alert.alert("Action Failed", data.error || "Unknown error");
                // Rollback if needed (handled by next poll usually)
            }
        } catch { 
            Alert.alert("Network Error"); 
        } finally {
            setIsActionLoading(false);
        }
    };

    // --- LIVE TRACKING ---
    const startTracking = async (rideId) => {
        setAppState('tracking');
        let { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return Alert.alert('Location permission required');

        shouldReconnect.current = true;
        connectWebSocket(rideId);
        let initialLoc = await Location.getCurrentPositionAsync({});
        setLocation(initialLoc);
        latestLocationRef.current = initialLoc;
        sendLocation(initialLoc.coords);
        persistLocationUpdate(rideId, initialLoc.coords);
        locationSubscription.current?.remove();
        locationSubscription.current = null;

        locationSubscription.current = await Location.watchPositionAsync(
            { accuracy: Location.Accuracy.High, timeInterval: 3000, distanceInterval: 5 },
            (newLoc) => {
                setLocation(newLoc);
                latestLocationRef.current = newLoc;
                sendLocation(newLoc.coords);
                persistLocationUpdate(rideId, newLoc.coords);
            }
        );
    };

    const sendLocation = (coords) => {
        if (!coords || ws.current?.readyState !== WebSocket.OPEN) return;

        ws.current.send(JSON.stringify({
            role: 'driver',
            latitude: coords.latitude,
            longitude: coords.longitude,
            heading: coords.heading || 0
        }));
    };

    const persistLocationUpdate = async (rideId, coords) => {
        if (!rideId || !coords || !userRef.current?.token) return;

        try {
            await fetch(`${BASE_URL}/api/location/rides/${rideId}/update/`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${userRef.current.token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    latitude: coords.latitude,
                    longitude: coords.longitude,
                    heading: coords.heading || 0,
                }),
            });
        } catch (error) {
            console.log("Driver location POST fallback error:", error?.message || error);
        }
    };

    const scheduleReconnect = (rideId) => {
        if (!shouldReconnect.current || !rideId) return;
        if (reconnectTimeout.current) clearTimeout(reconnectTimeout.current);
        reconnectTimeout.current = setTimeout(() => connectWebSocket(rideId), 3000);
    };

    const connectWebSocket = (rideId) => {
        const websocketUrl = `${WS_BASE_URL}/ws/location/${rideId}/`;

        if (reconnectTimeout.current) {
            clearTimeout(reconnectTimeout.current);
            reconnectTimeout.current = null;
        }

        if (ws.current) {
            ws.current.onclose = null;
            ws.current.close();
        }

        ws.current = new WebSocket(websocketUrl);
        ws.current.onopen = () => {
            setIsConnected(true);
            const latestCoords = latestLocationRef.current?.coords || latestLocationRef.current;
            sendLocation(latestCoords);
            persistLocationUpdate(rideId, latestCoords);
        };
        ws.current.onerror = (error) => {
            console.log("Driver websocket error:", error?.message || error);
        };
        ws.current.onclose = () => {
            setIsConnected(false);
            scheduleReconnect(rideId);
        };
        ws.current.onmessage = (e) => {
            try {
                const data = JSON.parse(e.data);
                if (data.role === 'rider') setRiderLocation(data);
            } catch {}
        };
    };

    // --- RENDERS ---
    const renderHeader = () => (
        <View style={styles.header}>
            <View>
                <Text style={styles.greeting}>Hello, {user?.name || 'Partner'}</Text>
                <Text style={styles.headerSub}>You&apos;re currently {appState === 'idle' ? 'waiting for rides' : 'on a mission'}</Text>
            </View>
            <TouchableOpacity onPress={() => router.push('/(tabs)/profile')} style={styles.profileBtn}>
                <IconSymbol name="person.circle.fill" size={32} color="#fff" />
            </TouchableOpacity>
        </View>
    );

    if (appState === 'idle') {
        return (
            <View style={styles.darkContainer}>
                <StatusBar barStyle="light-content" />
                {renderHeader()}
                <View style={styles.idleBody}>
                    <View style={styles.pulseOuter}>
                        <View style={styles.pulseInner}>
                            <IconSymbol name="antenna.radiowaves.left.and.right" size={60} color="#00D2FF" />
                        </View>
                    </View>
                    <Text style={styles.idleTitle}>Scanning for Rides</Text>
                    <Text style={styles.idleSub}>Stay close to busy areas to increase your chances.</Text>
                </View>
            </View>
        );
    }

    if (appState === 'hasRequests' && pendingRequests.length > 0) {
        return (
            <View style={styles.darkContainer}>
                <StatusBar barStyle="light-content" />
                {renderHeader()}
                <View style={styles.requestContainer}>
                    <Text style={styles.carouselTitle}>{pendingRequests.length} AVAILABLE REQUESTS</Text>
                    <FlatList
                        data={pendingRequests}
                        horizontal
                        pagingEnabled
                        showsHorizontalScrollIndicator={false}
                        keyExtractor={(item) => item.id.toString()}
                        renderItem={({ item }) => (
                            <View style={styles.requestCardWrapper}>
                                <View style={styles.requestCard}>
                                    <View style={styles.requestHeader}>
                                        <View style={styles.badge}>
                                            <Text style={styles.badgeText}>PENDING</Text>
                                        </View>
                                        <Text style={styles.fareAmount}>₹{item.estimated_fare}</Text>
                                    </View>
                                    
                                    <View style={styles.locationSection}>
                                        <View style={styles.locItem}>
                                            <View style={[styles.dot, { backgroundColor: '#00D2FF' }]} />
                                            <Text style={styles.locText} numberOfLines={1}>{item.source_location}</Text>
                                        </View>
                                        <View style={styles.pathLine} />
                                        <View style={styles.locItem}>
                                            <View style={[styles.dot, { backgroundColor: '#FF007A' }]} />
                                            <Text style={styles.locText} numberOfLines={1}>{item.destination_location}</Text>
                                        </View>
                                    </View>

                                    <View style={styles.requestStats}>
                                        <View style={styles.stat}>
                                            <Text style={styles.statLabel}>Distance</Text>
                                            <Text style={styles.statValue}>{item.distance_km} km</Text>
                                        </View>
                                        <View style={styles.statDivider} />
                                        <View style={styles.stat}>
                                            <Text style={styles.statLabel}>Client</Text>
                                            <Text style={styles.statValue}>{item.rider_name || 'Rider'}</Text>
                                        </View>
                                    </View>

                                    <View style={styles.requestActions}>
                                        <TouchableOpacity 
                                            style={[styles.declineBtn, isActionLoading && { opacity: 0.5 }]} 
                                            onPress={() => handleRideAction(item.id, 'reject')}
                                            disabled={isActionLoading}
                                        >
                                            <Text style={styles.declineText}>Skip</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity 
                                            style={[styles.acceptBtn, isActionLoading && { opacity: 0.8 }]} 
                                            onPress={() => handleRideAction(item.id, 'accept')}
                                            disabled={isActionLoading}
                                        >
                                            {isActionLoading ? (
                                                <ActivityIndicator color="#fff" size="small" />
                                            ) : (
                                                <Text style={styles.acceptText}>Accept Ride</Text>
                                            )}
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            </View>
                        )}
                    />
                </View>
            </View>
        );
    }

    // Tracking View
    return (
        <View style={styles.darkContainer}>
            <MapView
                ref={mapRef}
                style={styles.fullMap}
                customMapStyle={darkMapStyle}
                initialRegion={{
                    latitude: location?.coords.latitude || 20,
                    longitude: location?.coords.longitude || 78,
                    latitudeDelta: 0.01,
                    longitudeDelta: 0.01
                }}
            >
                {location && (
                    <Marker coordinate={location.coords} rotation={location.coords.heading}>
                        <View style={styles.driverMarker}>
                            <IconSymbol name="car.fill" size={24} color="#00D2FF" />
                        </View>
                    </Marker>
                )}
                {riderLocation && (
                    <Marker coordinate={riderLocation}>
                        <View style={styles.riderMarker}>
                            <IconSymbol name="person.fill" size={20} color="#fff" />
                        </View>
                    </Marker>
                )}
            </MapView>

            {!location && (
                <View style={styles.locatingOverlay}>
                    <ActivityIndicator color="#00D2FF" size="large" />
                    <Text style={styles.locatingText}>LOCATING...</Text>
                </View>
            )}

            <View style={styles.trackingHeader}>
                <View style={styles.glassHeader}>
                    <Text style={styles.statusLabel}>
                        {activeRide?.status === 'accepted' ? 'Heading to Client' :
                         activeRide?.status === 'arrived' ? 'Waiting at Pickup' :
                         activeRide?.status === 'in_progress' ? 'On Trip' : 'Almost Done'}
                    </Text>
                    <View style={styles.headerRight}>
                        <View style={[styles.liveIndicator, { backgroundColor: isConnected ? '#4CAF50' : '#FF3B30' }]} />
                        <Text style={styles.liveText}>{isConnected ? 'LIVE' : 'OFFLINE'}</Text>
                    </View>
                </View>
            </View>

            <View style={styles.overlayHUD}>
                {/* HUD Card */}
                <View style={styles.hudCard}>
                    {activeRide?.status === 'arrived' ? (
                        <View style={styles.otpSection}>
                            <Text style={styles.otpLabel}>ENTER START PIN</Text>
                            <TextInput
                                style={styles.otpField}
                                placeholder="----"
                                placeholderTextColor="rgba(255,255,255,0.3)"
                                keyboardType="number-pad"
                                maxLength={4}
                                value={otpInput}
                                onChangeText={setOtpInput}
                            />
                            <TouchableOpacity 
                                style={[styles.primaryBtn, { opacity: (otpInput.length === 4 && !isActionLoading) ? 1 : 0.4 }]}
                                disabled={otpInput.length !== 4 || isActionLoading}
                                onPress={() => handleRideAction(activeRide.id, 'start_trip', { otp: otpInput })}
                            >
                                {isActionLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnLabel}>VERIFY & START</Text>}
                            </TouchableOpacity>
                        </View>
                    ) : activeRide?.status === 'completed' ? (
                        <View style={styles.paymentSection}>
                            <Text style={styles.payTitle}>COLLECT FARE</Text>
                            <Text style={styles.payValue}>₹{activeRide?.estimated_fare}</Text>
                            <TouchableOpacity 
                                style={[styles.primaryBtn, { backgroundColor: '#4CAF50', opacity: isActionLoading ? 0.6 : 1 }]} 
                                onPress={() => handleRideAction(activeRide.id, 'confirm_payment')}
                                disabled={isActionLoading}
                            >
                                {isActionLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnLabel}>CONFIRM PAYMENT</Text>}
                            </TouchableOpacity>
                        </View>
                    ) : (
                        <View style={styles.hudBody}>
                            <View style={styles.clientInfo}>
                                <View style={styles.clientAvatar}>
                                    <IconSymbol name="person.fill" size={24} color="#fff" />
                                </View>
                                <View>
                                    <Text style={styles.clientName}>{activeRide?.rider_name || 'Rider'}</Text>
                                    <Text style={styles.clientSub}>{activeRide?.status === 'in_progress' ? 'Dropping off' : 'Awaiting at pickup'}</Text>
                                </View>
                            </View>
                            
                            <TouchableOpacity 
                                style={[styles.mainActionBtn, isActionLoading && { opacity: 0.7 }]}
                                disabled={isActionLoading}
                                onPress={() => {
                                    if (activeRide?.status === 'accepted') handleRideAction(activeRide.id, 'arrive');
                                    else if (activeRide?.status === 'in_progress') handleRideAction(activeRide.id, 'complete');
                                }}
                            >
                                {isActionLoading ? (
                                    <ActivityIndicator color="#fff" />
                                ) : (
                                    <Text style={styles.btnLabel}>
                                        {activeRide?.status === 'accepted' ? 'I HAVE ARRIVED' : 'COMPLETE TRIP'}
                                    </Text>
                                )}
                            </TouchableOpacity>
                        </View>
                    )}
                </View>

                {/* Floating Chat Button */}
                <TouchableOpacity style={styles.floatingChat} onPress={() => setIsChatOpen(true)}>
                    <IconSymbol name="bubble.left.and.bubble.right.fill" size={24} color="#fff" />
                    {unreadCount > 0 && <View style={styles.chatBadge}><Text style={styles.badgeTxt}>{unreadCount}</Text></View>}
                </TouchableOpacity>
            </View>

            {/* Chat Overlay Implementation */}
            {isChatOpen && (
                <View style={styles.chatSheet}>
                    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.chatInner}>
                        <View style={styles.chatHead}>
                            <TouchableOpacity 
                                onPress={() => { setIsChatOpen(false); setUnreadCount(0); }}
                                style={styles.chatBackBtn}
                            >
                                <IconSymbol name="chevron.left" size={20} color="#fff" />
                            </TouchableOpacity>
                            <Text style={styles.chatTitle}>Live Support</Text>
                            <TouchableOpacity 
                                onPress={() => { setIsChatOpen(false); setUnreadCount(0); }}
                                style={styles.chatCloseBtn}
                            >
                                <IconSymbol name="xmark" size={18} color="#fff" />
                            </TouchableOpacity>
                        </View>
                        <ScrollView style={styles.msgScroll} ref={msgScrollRef => { if (msgScrollRef) msgScrollRef.scrollToEnd({ animated: false }); }}>
                            {messages.map((m, idx) => {
                                const isMe = m.sender_role === 'driver';
                                const senderLabel = isMe ? 'You (Driver)' : (m.sender_name || 'Rider');
                                const time = m.created_at ? new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
                                return (
                                    <View key={m.id ?? idx} style={[styles.msgWrapper, isMe ? styles.msgWrapperMe : styles.msgWrapperThem]}>
                                        <Text style={[styles.msgSenderLabel, isMe ? styles.msgSenderMe : styles.msgSenderThem]}>
                                            {senderLabel}
                                        </Text>
                                        <View style={[styles.msgBox, isMe ? styles.msgMe : styles.msgThem]}>
                                            <Text style={[styles.msgTxt, isMe ? styles.msgTxtMe : styles.msgTxtThem]}>{m.message}</Text>
                                        </View>
                                        {time ? <Text style={[styles.msgTime, isMe ? { textAlign: 'right' } : { textAlign: 'left' }]}>{time}</Text> : null}
                                    </View>
                                );
                            })}
                            <View style={{ height: 8 }} />
                        </ScrollView>
                        <View style={styles.msgInputArea}>
                            <TextInput 
                                style={styles.msgInput} 
                                placeholder="Type here..." 
                                placeholderTextColor="#999"
                                value={newMessage}
                                onChangeText={setNewMessage}
                            />
                            <TouchableOpacity style={styles.msgSend} onPress={handleSendMessage}>
                                <IconSymbol name="paperplane.fill" size={20} color="#fff" />
                            </TouchableOpacity>
                        </View>
                    </KeyboardAvoidingView>
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    darkContainer: { flex: 1, backgroundColor: '#0F172A' },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 24, paddingTop: 60, paddingBottom: 20 },
    greeting: { fontSize: 24, fontWeight: '800', color: '#FFFFFF' },
    headerSub: { fontSize: 13, color: 'rgba(255,255,255,0.5)', marginTop: 4 },
    profileBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.1)', justifyContent: 'center', alignItems: 'center' },
    
    idleBody: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingBottom: 100 },
    pulseOuter: { width: 140, height: 140, borderRadius: 70, backgroundColor: 'rgba(0, 210, 255, 0.05)', justifyContent: 'center', alignItems: 'center' },
    pulseInner: { width: 100, height: 100, borderRadius: 50, backgroundColor: 'rgba(0, 210, 255, 0.1)', justifyContent: 'center', alignItems: 'center' },
    idleTitle: { fontSize: 20, fontWeight: '700', color: '#FFFFFF', marginTop: 32 },
    idleSub: { fontSize: 14, color: 'rgba(255,255,255,0.4)', textAlign: 'center', marginTop: 12, paddingHorizontal: 60, lineHeight: 20 },

    requestContainer: { flex: 1, paddingBottom: 40 },
    carouselTitle: { color: 'rgba(255,255,255,0.4)', fontSize: 11, fontWeight: '800', letterSpacing: 2, textAlign: 'center', marginBottom: 20 },
    requestCardWrapper: { width: width, paddingHorizontal: 16 },
    requestCard: { backgroundColor: '#1E293B', borderRadius: 32, padding: 24, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 15, elevation: 10 },
    requestHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
    badge: { backgroundColor: 'rgba(0, 210, 255, 0.1)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
    badgeText: { fontSize: 10, fontWeight: 'bold', color: '#00D2FF' },
    fareAmount: { fontSize: 32, fontWeight: '900', color: '#FFFFFF' },
    
    locationSection: { paddingVertical: 8 },
    locItem: { flexDirection: 'row', alignItems: 'center' },
    dot: { width: 8, height: 8, borderRadius: 4, marginRight: 16 },
    locText: { color: '#F1F5F9', fontSize: 15, fontWeight: '500', flex: 1 },
    pathLine: { width: 2, height: 24, backgroundColor: 'rgba(255,255,255,0.05)', marginLeft: 3, marginVertical: 4 },
    
    requestStats: { flexDirection: 'row', marginTop: 24, backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 16, padding: 16 },
    stat: { flex: 1, alignItems: 'center' },
    statLabel: { fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 4 },
    statValue: { fontSize: 15, fontWeight: '700', color: '#F8FAFC' },
    statDivider: { width: 1, height: '100%', backgroundColor: 'rgba(255,255,255,0.05)' },

    requestActions: { flexDirection: 'row', marginTop: 32 },
    declineBtn: { flex: 1, paddingVertical: 18, borderRadius: 16, alignItems: 'center' },
    declineText: { color: 'rgba(255,255,255,0.4)', fontWeight: 'bold' },
    acceptBtn: { flex: 2, backgroundColor: '#00D2FF', paddingVertical: 18, borderRadius: 16, alignItems: 'center', shadowColor: '#00D2FF', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 10, elevation: 8 },
    acceptText: { color: '#0F172A', fontWeight: '900', fontSize: 16 },

    fullMap: { flex: 1 },
    locatingOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(15, 23, 42, 0.7)', justifyContent: 'center', alignItems: 'center', zIndex: 10 },
    locatingText: { color: '#00D2FF', fontWeight: '900', fontSize: 14, letterSpacing: 2, marginTop: 12 },
    driverMarker: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#0F172A', borderWidth: 2, borderColor: '#00D2FF', justifyContent: 'center', alignItems: 'center' },
    riderMarker: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#FF007A', borderWidth: 2, borderColor: '#fff', justifyContent: 'center', alignItems: 'center' },

    trackingHeader: { position: 'absolute', top: 60, left: 16, right: 16 },
    glassHeader: { backgroundColor: 'rgba(30, 41, 59, 0.9)', borderRadius: 20, paddingHorizontal: 20, paddingVertical: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
    statusLabel: { color: '#fff', fontWeight: '800', fontSize: 14, letterSpacing: 0.5 },
    headerRight: { flexDirection: 'row', alignItems: 'center' },
    liveIndicator: { width: 6, height: 6, borderRadius: 3, marginRight: 6 },
    liveText: { fontSize: 10, fontWeight: 'bold', color: 'rgba(255,255,255,0.6)' },

    overlayHUD: { position: 'absolute', bottom: 40, left: 16, right: 16 },
    hudCard: { backgroundColor: '#1E293B', borderRadius: 28, padding: 20, shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 20, elevation: 12 },
    hudBody: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    clientInfo: { flexDirection: 'row', alignItems: 'center', flex: 1 },
    clientAvatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.1)', justifyContent: 'center', alignItems: 'center', marginRight: 16 },
    clientName: { color: '#fff', fontSize: 18, fontWeight: '700' },
    clientSub: { color: 'rgba(255,255,255,0.4)', fontSize: 12, marginTop: 2 },
    mainActionBtn: { backgroundColor: '#FFFFFF', paddingHorizontal: 20, paddingVertical: 14, borderRadius: 16 },
    btnLabel: { color: '#0F172A', fontSize: 13, fontWeight: '900' },
    
    otpSection: { alignItems: 'center' },
    otpLabel: { color: 'rgba(255,255,255,0.4)', fontSize: 11, fontWeight: 'bold', marginBottom: 12 },
    otpField: { color: '#fff', fontSize: 40, fontWeight: '900', letterSpacing: 8, marginBottom: 20 },
    primaryBtn: { width: '100%', backgroundColor: '#00D2FF', height: 56, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },

    paymentSection: { alignItems: 'center' },
    payTitle: { color: 'rgba(255,255,255,0.6)', fontWeight: 'bold', fontSize: 12 },
    payValue: { color: '#fff', fontSize: 44, fontWeight: '900', marginVertical: 10 },

    floatingChat: { position: 'absolute', top: -70, right: 0, width: 56, height: 56, borderRadius: 28, backgroundColor: '#1E293B', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', shadowColor: '#000', shadowOpacity: 0.3, elevation: 10 },
    chatBadge: { position: 'absolute', top: 0, right: 0, backgroundColor: '#FF007A', width: 22, height: 22, borderRadius: 11, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#1E293B' },
    badgeTxt: { color: '#fff', fontSize: 10, fontWeight: 'bold' },

    chatSheet: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(15,23,42,0.9)', justifyContent: 'flex-end', zIndex: 1000 },
    chatInner: { height: '80%', backgroundColor: '#1E293B', borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 24 },
    chatHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
    chatBackBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.1)', justifyContent: 'center', alignItems: 'center' },
    chatCloseBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.1)', justifyContent: 'center', alignItems: 'center' },
    chatTitle: { color: '#fff', fontSize: 20, fontWeight: '900' },
    msgScroll: { flex: 1 },
    msgWrapper: { marginBottom: 12, maxWidth: '80%' },
    msgWrapperMe: { alignSelf: 'flex-end', alignItems: 'flex-end' },
    msgWrapperThem: { alignSelf: 'flex-start', alignItems: 'flex-start' },
    msgSenderLabel: { fontSize: 10, fontWeight: '700', marginBottom: 4, letterSpacing: 0.5, textTransform: 'uppercase' },
    msgSenderMe: { color: '#00D2FF' },
    msgSenderThem: { color: 'rgba(255,255,255,0.4)' },
    msgBox: { padding: 14, borderRadius: 18, maxWidth: '100%' },
    msgMe: { backgroundColor: '#00D2FF', borderBottomRightRadius: 4 },
    msgThem: { backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', borderBottomLeftRadius: 4 },
    msgTxt: { fontSize: 15 },
    msgTxtMe: { color: '#0F172A', fontWeight: '600' },
    msgTxtThem: { color: '#F1F5F9' },
    msgTime: { fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 4 },
    msgInputArea: { flexDirection: 'row', alignItems: 'center', marginTop: 20 },
    msgInput: { flex: 1, height: 50, backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 16, paddingHorizontal: 20, color: '#fff' },
    msgSend: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#00D2FF', justifyContent: 'center', alignItems: 'center', marginLeft: 12 }
});

const darkMapStyle = [
    { "elementType": "geometry", "stylers": [{ "color": "#212121" }] },
    { "elementType": "labels.icon", "stylers": [{ "visibility": "off" }] },
    { "elementType": "labels.text.fill", "stylers": [{ "color": "#757575" }] },
    { "elementType": "labels.text.stroke", "stylers": [{ "color": "#212121" }] },
    { "featureType": "administrative", "elementType": "geometry", "stylers": [{ "color": "#757575" }] },
    { "featureType": "administrative.country", "elementType": "labels.text.fill", "stylers": [{ "color": "#9e9e9e" }] },
    { "featureType": "administrative.land_parcel", "stylers": [{ "visibility": "off" }] },
    { "featureType": "administrative.locality", "elementType": "labels.text.fill", "stylers": [{ "color": "#bdbdbd" }] },
    { "featureType": "poi", "elementType": "labels.text.fill", "stylers": [{ "color": "#757575" }] },
    { "featureType": "poi.park", "elementType": "geometry", "stylers": [{ "color": "#181818" }] },
    { "featureType": "road", "elementType": "geometry.fill", "stylers": [{ "color": "#2c2c2c" }] },
    { "featureType": "road", "elementType": "labels.text.fill", "stylers": [{ "color": "#8a8a8a" }] },
    { "featureType": "road.arterial", "elementType": "geometry", "stylers": [{ "color": "#373737" }] },
    { "featureType": "road.highway", "elementType": "geometry", "stylers": [{ "color": "#3c3c3c" }] },
    { "featureType": "road.highway.controlled_access", "elementType": "geometry", "stylers": [{ "color": "#4e4e4e" }] },
    { "featureType": "road.local", "elementType": "labels.text.fill", "stylers": [{ "color": "#616161" }] },
    { "featureType": "water", "elementType": "geometry", "stylers": [{ "color": "#000000" }] },
    { "featureType": "water", "elementType": "labels.text.fill", "stylers": [{ "color": "#3d3d3d" }] }
];
