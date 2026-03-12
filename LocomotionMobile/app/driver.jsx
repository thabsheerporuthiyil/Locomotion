import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { StyleSheet, View, Text, TouchableOpacity, Alert, ActivityIndicator, TextInput, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import * as Location from 'expo-location';
import { useAuth } from '../context/AuthContext';

const BASE_URL = 'http://192.168.220.62:8000';

export default function DriverScreen() {
    // Auth
    const { user } = useAuth();

    // UI State: 'idle' | 'incomingRequest' | 'tracking'
    const [appState, setAppState] = useState('idle');
    const [activeRequest, setActiveRequest] = useState(null);
    const [currentRideId, setCurrentRideId] = useState(null);
    const [otpInput, setOtpInput] = useState('');

    // Chat State
    const [isChatOpen, setIsChatOpen] = useState(false);
    const [messages, setMessages] = useState([]);
    const [newMessage, setNewMessage] = useState('');
    const [unreadCount, setUnreadCount] = useState(0);

    // Polling Reference
    const pollingInterval = useRef(null);
    const chatPollingInterval = useRef(null);
    const hasInitialChatFetch = useRef(false);

    // Tracking State
    const [location, setLocation] = useState(null);
    const [riderLocation, setRiderLocation] = useState(null);
    const [isConnected, setIsConnected] = useState(false);

    const ws = useRef(null);
    const locationSubscription = useRef(null);

    // --- POLLING FOR REQUESTS AND STATUS UPDATES ---
    useEffect(() => {
        startPolling();

        return () => {
            stopPolling();
            stopTracking();
        };
    }, []);

    const startPolling = () => {
        checkForRequests(); // Initial fetch
        pollingInterval.current = setInterval(() => {
            checkForRequests();
        }, 5000);
    };

    const stopPolling = () => {
        if (pollingInterval.current) {
            clearInterval(pollingInterval.current);
            pollingInterval.current = null;
        }
        stopChatPolling();
    };

    const startChatPolling = () => {
        if (chatPollingInterval.current) return;
        fetchChatMessages();
        chatPollingInterval.current = setInterval(fetchChatMessages, 3000);
    };

    const stopChatPolling = () => {
        if (chatPollingInterval.current) {
            clearInterval(chatPollingInterval.current);
            chatPollingInterval.current = null;
        }
    };

    const fetchChatMessages = async () => {
        if (!activeRequest || !['accepted', 'arrived', 'in_progress'].includes(activeRequest.status)) return;
        
        try {
            const res = await fetch(`${BASE_URL}/api/bookings/${activeRequest.id}/chat/`, {
                headers: { 'Authorization': `Bearer ${user?.token}` }
            });
            if (res.ok) {
                const data = await res.json();
                
                // Determine if we have new messages (using callback form to avoid stale closure)
                setMessages(prevMessages => {
                    if (hasInitialChatFetch.current && data.length > prevMessages.length && !isChatOpen) {
                        setUnreadCount(prevUnread => prevUnread + (data.length - prevMessages.length));
                    }
                    return data;
                });
                hasInitialChatFetch.current = true;
            }
        } catch (e) {
            console.error("Chat Map fetch error:", e);
        }
    };

    // React to chat opening/closing
    useEffect(() => {
        if (isChatOpen) {
            setUnreadCount(0); // Clear unread on open
        }
    }, [isChatOpen]);

    // React to active ride state changes to start/stop chat polling
    useEffect(() => {
        if (activeRequest && ['accepted', 'arrived', 'in_progress'].includes(activeRequest.status)) {
            hasInitialChatFetch.current = false; // Reset fetch tracker whenever entering active ride state
            startChatPolling();
        } else {
            stopChatPolling();
        }
    }, [activeRequest?.status]);

    const handleSendMessage = async () => {
        if (!newMessage.trim() || !activeRequest) return;

        try {
            const textToSend = newMessage;
            setNewMessage(''); // optimistic clear
            
            const formData = new FormData();
            formData.append('message', textToSend);
            
            const res = await fetch(`${BASE_URL}/api/bookings/${activeRequest.id}/chat/send/`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${user?.token}`,
                    // Don't set Content-Type here, let fetch handle the boundary for FormData
                },
                body: formData
            });
            
            if (res.ok) {
                fetchChatMessages(); // refresh instantly
            } else {
                setNewMessage(textToSend); // put it back on failure
                console.error("Failed to send message", await res.text());
            }
        } catch (e) {
            console.error("Send message error:", e);
        }
    };

    const checkForRequests = async () => {
        try {
            const res = await fetch(`${BASE_URL}/api/bookings/driver-requests/`, {
                headers: { 'Authorization': `Bearer ${user?.token}` }
            });
            if (res.ok) {
                const rides = await res.json();
                if (rides.length > 0) {
                    const latestRide = rides[0];
                    setActiveRequest(latestRide);
                    
                    if (latestRide.status === 'pending') {
                        // Provide incoming request view
                        if (appState !== 'incomingRequest') setAppState('incomingRequest');
                    } else if (['accepted', 'arrived', 'in_progress'].includes(latestRide.status)) {
                        // Active ride
                        setCurrentRideId(latestRide.id);
                        if (appState !== 'tracking') {
                            startTracking(latestRide.id);
                        }
                    } else if (latestRide.status === 'completed' && !latestRide.is_paid) {
                        // Completed but payment pending
                        setCurrentRideId(latestRide.id);
                        if (appState !== 'tracking') {
                            startTracking(latestRide.id); // keep them in tracking view for UI
                        }
                    } else {
                        // Completed & paid, or rejected/cancelled
                        resetToIdle();
                    }
                } else {
                    resetToIdle();
                }
            }
        } catch (e) {
            console.error("Driver Polling Error:", e);
        }
    };

    const resetToIdle = () => {
        if (appState !== 'idle') {
            setAppState('idle');
            setActiveRequest(null);
            setOtpInput('');
            stopTracking();
            stopChatPolling();
            setMessages([]);
            setUnreadCount(0);
            hasInitialChatFetch.current = false;
        }
    };

    // --- ACTIONS: ACCEPT / ARRIVE / START / COMPLETE / CONFIRM PAYMENT ---
    const handleRideAction = async (action, extraData = {}) => {
        if (!activeRequest) return;

        try {
            const res = await fetch(`${BASE_URL}/api/bookings/${activeRequest.id}/${action}/`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${user?.token}`,
                    'Content-Type': 'application/json'
                },
                body: Object.keys(extraData).length > 0 ? JSON.stringify(extraData) : null
            });

            if (res.ok) {
                if (action === 'accept') {
                    setCurrentRideId(activeRequest.id);
                    startTracking(activeRequest.id);
                    // Force poll to get updated status
                    checkForRequests();
                } else if (action === 'reject') {
                    resetToIdle();
                    checkForRequests();
                } else if (action === 'confirm_payment') {
                    Alert.alert("Payment Confirmed", "Ride completely finished!");
                    resetToIdle();
                    checkForRequests();
                } else {
                    // For arrive, start_trip, complete
                    // Clear OTP just in case
                    if (action === 'start_trip') setOtpInput('');
                    checkForRequests();
                }
            } else {
                const data = await res.json();
                Alert.alert("Action Failed", JSON.stringify(data));
            }
        } catch (e) {
            console.error(`Error performing ${action}:`, e);
            Alert.alert("Error", `Network error trying to ${action} ride.`);
        }
    };

    // --- LIVE TRACKING ---
    const startTracking = async (rideId) => {
        if (appState === 'tracking') return; // already tracking
        setAppState('tracking');

        let { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
            Alert.alert('Permission to access location was denied');
            return;
        }

        // Connect WebSocket dynamically
        connectWebSocket(rideId);

        // Get initial real location
        let initialLoc = await Location.getCurrentPositionAsync({});
        setLocation(initialLoc);

        // REAL DRIVING LOCATION TRACKING
        locationSubscription.current = await Location.watchPositionAsync(
            {
                accuracy: Location.Accuracy.High,
                timeInterval: 3000,
                distanceInterval: 2,
            },
            (newLocation) => {
                if (ws.current && ws.current.readyState === WebSocket.OPEN) {
                    ws.current.send(JSON.stringify({
                        role: 'driver',
                        latitude: newLocation.coords.latitude,
                        longitude: newLocation.coords.longitude,
                        heading: newLocation.coords.heading || 0
                    }));
                }
                setLocation(newLocation);
            }
        );
    };

    const connectWebSocket = (rideId) => {
        const WS_URL = `ws://192.168.220.62:8000/ws/location/${rideId}/`;
        if (ws.current) {
            ws.current.close();
        }
        ws.current = new WebSocket(WS_URL);

        ws.current.onopen = () => setIsConnected(true);
        ws.current.onclose = () => setIsConnected(false);
        ws.current.onerror = (e) => console.log("WebSocket error:", e.message);

        ws.current.onmessage = (e) => {
            try {
                const data = JSON.parse(e.data);
                if (data.role === 'rider' && data.latitude && data.longitude) {
                    setRiderLocation({
                        latitude: data.latitude,
                        longitude: data.longitude,
                        heading: data.heading || 0
                    });
                }
            } catch (err) { }
        };
    };

    const stopTracking = () => {
        if (locationSubscription.current) {
            locationSubscription.current.remove();
            locationSubscription.current = null;
        }
        if (ws.current) {
            ws.current.close();
            ws.current = null;
        }
        setRiderLocation(null);
        setIsConnected(false);
        hasInitialChatFetch.current = false;
    };

    // --- RESET ON SCREEN BLUR ---
    useFocusEffect(
        useCallback(() => {
            // When screen is focused
            return () => {
                // When screen goes out of focus (e.g. going back to Profile/Home)
                stopPolling();
                resetToIdle();
            };
        }, [])
    );

    // --- RENDER BOTTOM SHEET ---
    const renderActiveRideControls = () => {
        if (!activeRequest) return null;

        const { status, estimated_fare, distance_km } = activeRequest;

        return (
            <KeyboardAvoidingView 
                behavior={Platform.OS === "ios" ? "padding" : "height"}
                style={styles.bottomSheet}
            >
                <View style={styles.sheetHeader}>
                    <Text style={styles.sheetTitle}>
                        {status === 'accepted' ? 'Driving to Pickup' :
                         status === 'arrived' ? 'Waiting for Rider' :
                         status === 'in_progress' ? 'Trip in Progress' :
                         status === 'completed' ? 'Payment Collection' : 'Active Ride'}
                    </Text>
                    <Text style={styles.sheetSubtitle}>
                        Fare: ₹{estimated_fare} • Dist: {distance_km}km
                    </Text>
                </View>

                {status === 'accepted' && (
                    <TouchableOpacity style={styles.actionBtn} onPress={() => handleRideAction('arrive')}>
                        <Text style={styles.actionBtnText}>Arrived at Pickup</Text>
                    </TouchableOpacity>
                )}

                {/* Chat Button for Active States */}
                {['accepted', 'arrived', 'in_progress'].includes(status) && (
                    <TouchableOpacity 
                        style={styles.chatToggleBtn} 
                        onPress={() => setIsChatOpen(true)}
                    >
                        <Text style={styles.chatToggleText}>💬 Chat with Rider</Text>
                        {unreadCount > 0 && (
                            <View style={styles.unreadBadge}>
                                <Text style={styles.unreadCount}>{unreadCount}</Text>
                            </View>
                        )}
                    </TouchableOpacity>
                )}

                {status === 'arrived' && (
                    <View style={styles.optContainer}>
                        <Text style={styles.label}>Ask Rider for Start PIN</Text>
                        <TextInput
                            style={styles.otpInput}
                            placeholder="0000"
                            keyboardType="number-pad"
                            maxLength={4}
                            value={otpInput}
                            onChangeText={setOtpInput}
                        />
                        <TouchableOpacity 
                            style={[styles.actionBtn, { opacity: otpInput.length === 4 ? 1 : 0.5 }]} 
                            disabled={otpInput.length !== 4}
                            onPress={() => handleRideAction('start_trip', { otp: otpInput })}
                        >
                            <Text style={styles.actionBtnText}>Start Trip</Text>
                        </TouchableOpacity>
                    </View>
                )}

                {status === 'in_progress' && (
                    <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#FF5722' }]} onPress={() => handleRideAction('complete')}>
                        <Text style={styles.actionBtnText}>Complete Trip</Text>
                    </TouchableOpacity>
                )}

                {status === 'completed' && !activeRequest.is_paid && (
                    <View style={styles.paymentContainer}>
                        <Text style={styles.paymentTitle}>Collect ₹{estimated_fare}</Text>
                        <Text style={styles.paymentSub}>Via Cash or UPI directly from Rider</Text>
                        <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#4CAF50', marginTop: 15 }]} onPress={() => handleRideAction('confirm_payment')}>
                            <Text style={styles.actionBtnText}>Payment Received</Text>
                        </TouchableOpacity>
                    </View>
                )}
            </KeyboardAvoidingView>
        );
    };

    // --- RENDER CHAT MODAL ---
    const renderChatModal = () => {
        if (!isChatOpen) return null;

        return (
            <View style={styles.chatModalOverlay}>
                <KeyboardAvoidingView 
                    behavior={Platform.OS === "ios" ? "padding" : "height"}
                    style={styles.chatModalContent}
                >
                    <View style={styles.chatHeader}>
                        <Text style={styles.chatTitle}>Chat with Rider</Text>
                        <TouchableOpacity onPress={() => setIsChatOpen(false)} style={styles.closeChatBtn}>
                            <Text style={styles.closeChatTxt}>Close</Text>
                        </TouchableOpacity>
                    </View>

                    <ScrollView style={styles.messageList} contentContainerStyle={{ paddingBottom: 10 }}>
                        {messages.length === 0 ? (
                            <Text style={styles.emptyChat}>No messages yet. Say hello!</Text>
                        ) : (
                            messages.map(msg => {
                                const isMe = msg.sender_type === 'driver';
                                return (
                                    <View key={msg.id} style={[styles.messageBubble, isMe ? styles.myMessage : styles.theirMessage]}>
                                        <Text style={[styles.messageText, isMe ? styles.myMessageText : styles.theirMessageText]}>
                                            {msg.message}
                                        </Text>
                                        <Text style={styles.messageTime}>
                                            {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </Text>
                                    </View>
                                )
                            })
                        )}
                    </ScrollView>

                    <View style={styles.chatInputContainer}>
                        <TextInput
                            style={styles.chatInput}
                            placeholder="Type a message..."
                            value={newMessage}
                            onChangeText={setNewMessage}
                        />
                        <TouchableOpacity style={styles.sendBtn} onPress={handleSendMessage}>
                            <Text style={styles.sendBtnTxt}>Send</Text>
                        </TouchableOpacity>
                    </View>
                </KeyboardAvoidingView>
            </View>
        );
    };

    // --- MAIN RENDERS ---
    if (appState === 'idle') {
        return (
            <View style={styles.centerContainer}>
                <ActivityIndicator size="large" color="#4CAF50" />
                <Text style={styles.statusTitle}>You are Online</Text>
                <Text style={styles.statusDescription}>Waiting for ride requests in your area...</Text>
            </View>
        );
    }

    if (appState === 'incomingRequest') {
        return (
            <View style={styles.incomingContainer}>
                <View style={styles.card}>
                    <Text style={styles.cardHeader}>🚨 New Ride Request!</Text>

                    <View style={styles.infoRow}>
                        <Text style={styles.label}>Pickup:</Text>
                        <Text style={styles.value}>{activeRequest?.source_location}</Text>
                    </View>

                    <View style={styles.infoRow}>
                        <Text style={styles.label}>Dropoff:</Text>
                        <Text style={styles.value}>{activeRequest?.destination_location}</Text>
                    </View>

                    <View style={styles.infoRow}>
                        <Text style={styles.label}>Est. Fare:</Text>
                        <Text style={styles.value}>₹{activeRequest?.estimated_fare}</Text>
                    </View>

                    <View style={styles.infoRow}>
                        <Text style={styles.label}>Distance:</Text>
                        <Text style={styles.value}>{activeRequest?.distance_km} km</Text>
                    </View>

                    <View style={styles.actionButtons}>
                        <TouchableOpacity style={[styles.btn, styles.btnReject]} onPress={() => handleRideAction('reject')}>
                            <Text style={styles.btnText}>Decline</Text>
                        </TouchableOpacity>

                        <TouchableOpacity style={[styles.btn, styles.btnAccept]} onPress={() => handleRideAction('accept')}>
                            <Text style={styles.btnText}>Accept Ride</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        );
    }

    // Tracking State
    return (
        <View style={styles.container}>
            {location ? (
                <MapView
                    style={styles.map}
                    showsUserLocation={true}
                    followsUserLocation={true}
                >
                    {riderLocation && (
                        <Marker
                            coordinate={{ latitude: riderLocation.latitude, longitude: riderLocation.longitude }}
                            title="Rider"
                            description="Your rider's live location."
                            pinColor="blue"
                        />
                    )}
                </MapView>
            ) : (
                <View style={styles.centerContainer}>
                    <ActivityIndicator size="large" color="#0000ff" />
                    <Text style={styles.statusDescription}>Acquiring GPS Signal...</Text>
                </View>
            )}

            <View style={styles.statusBadge}>
                <View style={[styles.dot, { backgroundColor: isConnected ? '#4CAF50' : '#F44336' }]} />
                <Text style={styles.statusText}>Ride {currentRideId} {isConnected ? "(Live Tracking)" : ""}</Text>
            </View>

            {/* Bottom Sheet for Ride Controls */}
            {renderActiveRideControls()}

            {/* Chat Overlay */}
            {renderChatModal()}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f5f5f5' },
    centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' },
    map: { width: '100%', height: '100%' },
    statusTitle: { fontSize: 24, fontWeight: 'bold', marginTop: 20, color: '#333' },
    statusDescription: { fontSize: 16, color: '#666', marginTop: 10 },

    // Incoming Request Card
    incomingContainer: { flex: 1, justifyContent: 'center', padding: 20, backgroundColor: 'rgba(0,0,0,0.5)' },
    card: { backgroundColor: '#fff', borderRadius: 15, padding: 25, elevation: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.3, shadowRadius: 10 },
    cardHeader: { fontSize: 22, fontWeight: 'bold', textAlign: 'center', marginBottom: 20, color: '#F44336' },
    infoRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12, borderBottomWidth: 1, borderBottomColor: '#eee', paddingBottom: 8 },
    label: { fontSize: 16, color: '#555', fontWeight: '500' },
    value: { fontSize: 16, fontWeight: 'bold', color: '#111', flex: 1, textAlign: 'right' },

    // Actions
    actionButtons: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 25 },
    btn: { flex: 1, padding: 15, borderRadius: 10, alignItems: 'center', marginHorizontal: 5 },
    btnAccept: { backgroundColor: '#4CAF50' },
    btnReject: { backgroundColor: '#F44336' },
    btnText: { color: 'white', fontWeight: 'bold', fontSize: 16 },

    // Tracking UI & Top Badge
    statusBadge: {
        position: 'absolute', top: 50, right: 20, backgroundColor: 'white', paddingHorizontal: 15, paddingVertical: 10,
        borderRadius: 25, flexDirection: 'row', alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.1, elevation: 3,
    },
    dot: { width: 12, height: 12, borderRadius: 6, marginRight: 8 },
    statusText: { fontSize: 14, fontWeight: 'bold' },

    // Bottom Sheet
    bottomSheet: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: '#fff',
        borderTopLeftRadius: 25,
        borderTopRightRadius: 25,
        padding: 24,
        paddingBottom: Platform.OS === 'ios' ? 40 : 24,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -5 },
        shadowOpacity: 0.2,
        shadowRadius: 10,
        elevation: 15,
    },
    sheetHeader: {
        alignItems: 'center',
        marginBottom: 20,
        borderBottomWidth: 1,
        borderBottomColor: '#eee',
        paddingBottom: 15,
    },
    sheetTitle: {
        fontSize: 22,
        fontWeight: '900',
        color: '#111',
    },
    sheetSubtitle: {
        fontSize: 14,
        color: '#666',
        marginTop: 4,
        fontWeight: '600'
    },
    actionBtn: {
        backgroundColor: '#3F51B5', // Indigo 500
        paddingVertical: 16,
        borderRadius: 12,
        alignItems: 'center',
        shadowColor: '#3F51B5',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 5,
        elevation: 5,
    },
    actionBtnText: {
        color: '#fff',
        fontSize: 18,
        fontWeight: 'bold',
        letterSpacing: 0.5,
    },
    optContainer: {
        alignItems: 'center',
    },
    otpInput: {
        width: 150,
        height: 60,
        backgroundColor: '#f5f5f5',
        borderRadius: 12,
        fontSize: 28,
        fontWeight: 'bold',
        textAlign: 'center',
        letterSpacing: 4,
        marginBottom: 20,
        borderWidth: 2,
        borderColor: '#e0e0e0',
    },
    paymentContainer: {
        alignItems: 'center',
    },
    paymentTitle: {
        fontSize: 32,
        fontWeight: '900',
        color: '#4CAF50',
    },
    paymentSub: {
        fontSize: 14,
        color: '#555',
        marginTop: 5,
    },

    // Chat Enhancements
    chatToggleBtn: {
        backgroundColor: '#E8EAF6', // Light Indigo
        paddingVertical: 12,
        borderRadius: 12,
        alignItems: 'center',
        marginTop: 10,
        flexDirection: 'row',
        justifyContent: 'center',
    },
    chatToggleText: {
        color: '#3F51B5',
        fontSize: 16,
        fontWeight: 'bold',
    },
    unreadBadge: {
        backgroundColor: '#F44336',
        borderRadius: 10,
        width: 20,
        height: 20,
        justifyContent: 'center',
        alignItems: 'center',
        marginLeft: 8,
    },
    unreadCount: {
        color: 'white',
        fontSize: 12,
        fontWeight: 'bold',
    },
    chatModalOverlay: {
        position: 'absolute',
        top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.6)',
        justifyContent: 'flex-end',
        zIndex: 100,
    },
    chatModalContent: {
        backgroundColor: '#fff',
        height: '70%',
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        padding: 20,
        paddingBottom: Platform.OS === 'ios' ? 40 : 20,
    },
    chatHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderBottomWidth: 1,
        borderBottomColor: '#eee',
        paddingBottom: 15,
        marginBottom: 10,
    },
    chatTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#333',
    },
    closeChatBtn: {
        padding: 5,
    },
    closeChatTxt: {
        color: '#F44336',
        fontWeight: 'bold',
        fontSize: 16,
    },
    messageList: {
        flex: 1,
    },
    emptyChat: {
        textAlign: 'center',
        color: '#999',
        marginTop: 20,
        fontStyle: 'italic',
    },
    messageBubble: {
        padding: 12,
        borderRadius: 15,
        marginBottom: 10,
        maxWidth: '80%',
    },
    myMessage: {
        backgroundColor: '#3F51B5',
        alignSelf: 'flex-end',
        borderBottomRightRadius: 5,
    },
    theirMessage: {
        backgroundColor: '#f1f1f1',
        alignSelf: 'flex-start',
        borderBottomLeftRadius: 5,
    },
    messageText: {
        fontSize: 16,
    },
    myMessageText: {
        color: 'white',
    },
    theirMessageText: {
        color: '#333',
    },
    messageTime: {
        fontSize: 10,
        color: 'rgba(255,255,255,0.7)',
        alignSelf: 'flex-end',
        marginTop: 4,
    },
    chatInputContainer: {
        flexDirection: 'row',
        marginTop: 10,
        borderTopWidth: 1,
        borderTopColor: '#eee',
        paddingTop: 10,
    },
    chatInput: {
        flex: 1,
        backgroundColor: '#f5f5f5',
        borderRadius: 20,
        paddingHorizontal: 15,
        paddingVertical: 10,
        fontSize: 16,
    },
    sendBtn: {
        backgroundColor: '#4CAF50',
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 20,
        borderRadius: 20,
        marginLeft: 10,
    },
    sendBtnTxt: {
        color: 'white',
        fontWeight: 'bold',
        fontSize: 16,
    }
});
