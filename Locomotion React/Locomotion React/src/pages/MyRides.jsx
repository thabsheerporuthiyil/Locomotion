import { useState, useEffect, useRef } from "react";
import api from "../api/axios";
import { Clock, MapPin, Navigation, Car, RefreshCw, CreditCard, Star, X, CheckCircle, MessageSquare } from "lucide-react";
import { requestFirebaseNotificationPermission, onMessageListener } from "../firebase";
import ChatBox from "../components/ChatBox";

export default function MyRides() {
    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [processingPayment, setProcessingPayment] = useState(false);

    // Chat State
    const [activeChatRideId, setActiveChatRideId] = useState(null);
    const [unreadMessages, setUnreadMessages] = useState({});

    // Robust Polling Refs for Unread Dot
    const activeChatRef = useRef(null);
    useEffect(() => { activeChatRef.current = activeChatRideId; }, [activeChatRideId]);
    const latestMessageIdsRef = useRef({});

    // Polling effect for unread messages (Fallback for Brave/Safari & listener bugs)
    useEffect(() => {
        const checkUnreadChats = async () => {
            const activeRides = requests.filter(r => ['accepted', 'arrived', 'in_progress'].includes(r.status));

            for (const ride of activeRides) {
                try {
                    const res = await api.get(`bookings/${ride.id}/chat/`);
                    const messages = res.data;

                    if (messages.length > 0) {
                        const latestId = messages[messages.length - 1].id;
                        const prevLatest = latestMessageIdsRef.current[ride.id];

                        // If there is a new message and chat is not currently open
                        if (prevLatest && prevLatest !== latestId && activeChatRef.current !== ride.id) {
                            setUnreadMessages(prev => ({ ...prev, [ride.id]: true }));
                        }

                        latestMessageIdsRef.current[ride.id] = latestId;
                    }
                } catch (err) {
                    console.error("Unread chat check error:", err);
                }
            }
        };

        const interval = setInterval(checkUnreadChats, 5000);
        checkUnreadChats(); // Run immediately on mount or requests change

        return () => clearInterval(interval);
    }, [requests]);

    // Rating Modal State
    const [showRatingModal, setShowRatingModal] = useState(false);
    const [ratingRideId, setRatingRideId] = useState(null);
    const [ratingValue, setRatingValue] = useState(0);
    const [hoverRating, setHoverRating] = useState(0);
    const [feedback, setFeedback] = useState("");
    const [isSubmittingRating, setIsSubmittingRating] = useState(false);

    const fetchRequests = async () => {
        setLoading(true);
        try {
            const res = await api.get("bookings/my-requests/");
            setRequests(res.data);
        } catch (err) {
            console.error("Failed to fetch rides:", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchRequests();

        // Setup Firebase Notifications for Rider
        requestFirebaseNotificationPermission()
            .then((token) => {
                if (token) {
                    console.log("FCM Token Generated for Rider, sending to backend...");
                    api.post("accounts/update-fcm-token/", { fcm_token: token })
                        .catch(err => console.error("Failed to save token to backend:", err));
                }
            })
            .catch((err) => console.error("Firebase permission error", err));

        // Listen for foreground push notifications continuously
        const unsubscribe = onMessageListener((payload) => {
            console.log("Foreground push notification received:", payload);
            fetchRequests(); // Refresh the board
            const audio = new Audio("https://actions.google.com/sounds/v1/alarms/beep_short.ogg");
            audio.play().catch(e => console.log("Audio play blocked"));

            // Check if it's a chat message and the chat box isn't currently open for this ride
            if (payload?.data?.type === "chat_message") {
                const incomingRideId = parseInt(payload.data.ride_id, 10);
                setUnreadMessages(prev => {
                    // Only mark as unread if we aren't actively chatting in this ride
                    if (activeChatRideId !== incomingRideId) {
                        return { ...prev, [incomingRideId]: true };
                    }
                    return prev;
                });
            }
        });

        // Listen for messages from the Service Worker
        const channel = new BroadcastChannel('locomotion-fcm-channel');
        channel.onmessage = (event) => {
            console.log("Service Worker broadcast received:", event.data);
            fetchRequests(); // Refresh the board
            const audio = new Audio("https://actions.google.com/sounds/v1/alarms/beep_short.ogg");
            audio.play().catch(e => console.log("Audio play blocked"));

            if (event.data?.data?.type === "chat_message") {
                const incomingRideId = parseInt(event.data.data.ride_id, 10);
                setUnreadMessages(prev => {
                    if (activeChatRideId !== incomingRideId) {
                        return { ...prev, [incomingRideId]: true };
                    }
                    return prev;
                });
            }
        };

        // Fallback polling: refresh ride requests every 10 seconds
        const pollInterval = setInterval(() => {
            fetchRequests();
        }, 10000);

        return () => {
            if (unsubscribe) unsubscribe();
            channel.close();
            clearInterval(pollInterval);
        };
    }, []);

    const getStatusStyle = (status) => {
        switch (status) {
            case 'pending': return 'bg-yellow-100 text-yellow-700 border-yellow-200';
            case 'accepted': return 'bg-indigo-100 text-indigo-700 border-indigo-200';
            case 'arrived': return 'bg-blue-100 text-blue-700 border-blue-200';
            case 'in_progress': return 'bg-green-100 text-green-700 border-green-200';
            case 'completed': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
            case 'cancelled': return 'bg-gray-100 text-gray-700 border-gray-200';
            default: return 'bg-slate-100 text-slate-700 border-slate-200';
        }
    };

    const handlePayment = async (rideId) => {
        alert("Please pay the driver directly via Cash or UPI.");
    };

    const openRatingModal = (rideId) => {
        setRatingRideId(rideId);
        setRatingValue(0);
        setHoverRating(0);
        setFeedback("");
        setShowRatingModal(true);
    };

    const submitRating = async () => {
        if (ratingValue === 0) return alert("Please select a star rating first.");

        setIsSubmittingRating(true);
        try {
            await api.post(`bookings/${ratingRideId}/rate/`, {
                rating: ratingValue,
                feedback: feedback
            });
            setShowRatingModal(false);
            fetchRequests(); // Refresh to show new rating
        } catch (err) {
            console.error("Failed to submit rating:", err);
            alert(err.response?.data?.error || "Failed to submit rating");
        } finally {
            setIsSubmittingRating(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 py-12 px-4 sm:px-6 lg:px-8">
            <div className="max-w-4xl mx-auto space-y-8">
                <div className="flex justify-between items-center">
                    <div>
                        <h1 className="text-3xl font-black text-slate-900 tracking-tight">My Rides</h1>
                        <p className="text-sm text-slate-500 mt-1">View your current and past ride requests.</p>
                    </div>
                    <button
                        onClick={fetchRequests}
                        disabled={loading}
                        className="flex items-center gap-2 px-4 py-2 bg-white text-indigo-600 rounded-xl font-bold shadow-sm border border-slate-200 hover:bg-slate-50 transition-colors disabled:opacity-50"
                    >
                        <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
                        Refresh
                    </button>
                </div>

                {loading && requests.length === 0 ? (
                    <div className="text-center py-12">
                        <div className="animate-spin text-indigo-600 w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full mx-auto mb-4"></div>
                        <p className="text-slate-500 font-medium">Loading your rides...</p>
                    </div>
                ) : requests.length === 0 ? (
                    <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-12 text-center">
                        <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <Navigation className="w-8 h-8 text-slate-400" />
                        </div>
                        <h3 className="text-xl font-bold text-slate-900 mb-2">No Rides Found</h3>
                        <p className="text-slate-500 max-w-sm mx-auto">You haven't requested any rides yet. Book a ride from the "Find Driver" page!</p>
                    </div>
                ) : (
                    <div className="space-y-6">
                        {requests.map((ride) => (
                            <div key={ride.id} className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden hover:shadow-md transition-shadow group">
                                <div className="p-6">
                                    <div className="flex flex-col sm:flex-row justify-between items-start mb-6 gap-4 border-b border-slate-100 pb-6">
                                        <div className="flex items-center gap-4">
                                            <div className="w-12 h-12 bg-indigo-50 rounded-full flex items-center justify-center text-indigo-600 shadow-inner">
                                                <Car size={24} />
                                            </div>
                                            <div>
                                                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Driver</p>
                                                <h3 className="text-lg font-bold text-slate-900 leading-tight">{ride.driver_name}</h3>
                                                {ride.vehicle_details && (
                                                    <p className="text-sm text-slate-500 mt-0.5">{ride.vehicle_details}</p>
                                                )}
                                            </div>
                                        </div>

                                        <div className="flex flex-col items-end gap-2">
                                            <span className={`px-3 py-1 text-xs font-bold uppercase tracking-wider rounded-lg border ${getStatusStyle(ride.status)} shadow-sm`}>
                                                {ride.status.replace("_", " ")}
                                            </span>
                                            {ride.is_paid && (
                                                <span className={`px-3 py-1 text-xs font-bold uppercase tracking-wider rounded-lg border bg-emerald-100 text-emerald-700 border-emerald-200 shadow-sm`}>
                                                    Paid
                                                </span>
                                            )}
                                            <div className="flex items-center gap-1.5 text-xs font-medium text-slate-400 mt-1">
                                                <Clock size={12} />
                                                <span>{new Date(ride.created_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-6 relative">
                                        {/* Visual Timeline Bar (Desktop) */}
                                        <div className="hidden md:flex absolute left-1/2 top-4 bottom-4 w-px bg-slate-100 -translate-x-1/2"></div>

                                        <div className="relative pl-6">
                                            <div className="absolute left-0 top-1.5 w-2 h-2 rounded-full bg-indigo-500 shadow shadow-indigo-200"></div>
                                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Pickup</p>
                                            <p className="text-sm font-semibold text-slate-800 leading-relaxed">{ride.source_location}</p>
                                        </div>

                                        <div className="relative pl-6">
                                            <div className="absolute left-0 top-1.5 w-2 h-2 bg-slate-800 shadow shadow-slate-300"></div>
                                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Dropoff</p>
                                            <p className="text-sm font-semibold text-slate-800 leading-relaxed">{ride.destination_location}</p>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-100 items-center">
                                        <div>
                                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Distance</p>
                                            <p className="text-sm font-bold text-slate-900">{ride.distance_km || "--"} km</p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Estimated Fare</p>
                                            <p className="text-sm font-black text-indigo-600 tracking-tight">₹{ride.estimated_fare || "--"}</p>
                                        </div>

                                        {['accepted', 'arrived', 'in_progress'].includes(ride.status) && ride.driver_phone && (
                                            <div className="col-span-2 sm:col-span-1 border-t border-slate-200 sm:border-t-0 sm:border-l sm:pl-4 pt-3 sm:pt-0">
                                                <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest mb-1">Driver Phone</p>
                                                <p className="text-sm font-bold text-emerald-700">{ride.driver_phone}</p>
                                            </div>
                                        )}

                                        {/* OTP Display */}
                                        {['accepted', 'arrived'].includes(ride.status) && ride.ride_otp && (
                                            <div className="col-span-2 sm:col-span-1 border-t border-slate-200 sm:border-t-0 sm:border-l sm:pl-4 pt-3 sm:pt-0">
                                                <p className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest mb-1">Ride PIN</p>
                                                <p className="text-xl font-black tracking-widest text-indigo-700">{ride.ride_otp}</p>
                                            </div>
                                        )}

                                        {/* Status / Actions Container */}
                                        <div className="col-span-2 sm:col-span-1 border-t border-slate-200 sm:border-t-0 sm:border-l sm:pl-4 pt-3 sm:pt-0 flex flex-col gap-2 justify-center h-full">

                                            {/* Chat Button */}
                                            {['accepted', 'arrived', 'in_progress'].includes(ride.status) && (
                                                <button
                                                    onClick={() => {
                                                        setActiveChatRideId(ride.id);
                                                        // Clear unread mark when opened
                                                        setUnreadMessages(prev => ({ ...prev, [ride.id]: false }));
                                                    }}
                                                    className="w-full flex items-center justify-center gap-2 bg-indigo-50 text-indigo-700 border border-indigo-200 px-4 py-2 rounded-xl font-bold shadow-sm hover:bg-indigo-100 transition-colors text-sm mb-2 relative"
                                                >
                                                    <MessageSquare size={16} />
                                                    Chat with Driver
                                                    {unreadMessages[ride.id] && (
                                                        <span className="absolute top-0 right-0 -mt-1 -mr-1 flex h-3 w-3">
                                                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                                                            <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                                                        </span>
                                                    )}
                                                </button>
                                            )}

                                            {/* Payment Notice */}
                                            {ride.status === 'completed' && !ride.is_paid && (
                                                <div className="w-full text-center bg-gray-100 text-gray-700 px-4 py-3 rounded-xl shadow-inner text-sm font-semibold flex items-center justify-center gap-2">
                                                    <CreditCard size={16} className="text-gray-500" />
                                                    Pay ₹{ride.estimated_fare} via Cash/UPI
                                                </div>
                                            )}

                                            {/* Payment Verified */}
                                            {ride.status === 'completed' && ride.is_paid && (
                                                <div className="w-full text-center bg-emerald-50 text-emerald-700 border border-emerald-200 px-4 py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 shadow-sm">
                                                    <CheckCircle size={16} />
                                                    Payment Verified
                                                </div>
                                            )}

                                            {/* Rating Area */}
                                            {ride.status === 'completed' && (
                                                <div className="w-full flex justify-end">
                                                    {ride.rating ? (
                                                        <div className="flex flex-col items-end">
                                                            <div className="flex text-amber-500">
                                                                {[...Array(5)].map((_, i) => (
                                                                    <Star key={i} size={14} fill={i < ride.rating ? "currentColor" : "none"} className={i >= ride.rating ? "text-slate-300" : ""} />
                                                                ))}
                                                            </div>
                                                            {ride.feedback && <p className="text-[10px] text-slate-500 mt-1 italic text-right line-clamp-2">"{ride.feedback}"</p>}
                                                        </div>
                                                    ) : (
                                                        <button
                                                            onClick={() => openRatingModal(ride.id)}
                                                            className="w-full flex items-center justify-center gap-2 bg-white text-slate-700 border border-slate-200 px-4 py-2 rounded-xl font-bold shadow-sm hover:bg-slate-50 transition-colors text-sm"
                                                        >
                                                            <Star size={16} className="text-amber-500" />
                                                            Rate Trip
                                                        </button>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Rating Modal Content */}
            {showRatingModal && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl w-full max-w-sm shadow-2xl p-6 relative animate-in fade-in zoom-in duration-200">
                        <button
                            onClick={() => setShowRatingModal(false)}
                            className="absolute right-4 top-4 text-slate-400 hover:text-slate-600 transition-colors"
                        >
                            <X size={20} />
                        </button>

                        <div className="text-center mb-6 pt-2">
                            <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center text-amber-600 mx-auto mb-3">
                                <Star size={24} fill="currentColor" />
                            </div>
                            <h3 className="text-xl font-black text-slate-900">How was your ride?</h3>
                            <p className="text-sm text-slate-500 mt-1">Please rate your driver</p>
                        </div>

                        <div className="flex justify-center gap-2 mb-6 cursor-pointer">
                            {[1, 2, 3, 4, 5].map((star) => (
                                <Star
                                    key={star}
                                    size={36}
                                    className={`transition-all duration-200 ${(hoverRating || ratingValue) >= star
                                        ? "text-amber-500 scale-110"
                                        : "text-slate-200 hover:text-amber-300"
                                        }`}
                                    fill={(hoverRating || ratingValue) >= star ? "currentColor" : "none"}
                                    onClick={() => setRatingValue(star)}
                                    onMouseEnter={() => setHoverRating(star)}
                                    onMouseLeave={() => setHoverRating(0)}
                                />
                            ))}
                        </div>

                        <div className="mb-6">
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Feedback (Optional)</label>
                            <textarea
                                value={feedback}
                                onChange={(e) => setFeedback(e.target.value)}
                                placeholder="Any comments for the driver?"
                                className="w-full border border-slate-200 rounded-xl max-h-32 min-h-24 p-3 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-shadow resize-none"
                            ></textarea>
                        </div>

                        <button
                            onClick={submitRating}
                            disabled={isSubmittingRating || ratingValue === 0}
                            className="w-full bg-slate-900 text-white py-3.5 rounded-xl font-bold hover:bg-slate-800 transition-colors disabled:opacity-50 disabled:bg-slate-300 flex justify-center items-center gap-2"
                        >
                            {isSubmittingRating ? (
                                <RefreshCw size={18} className="animate-spin" />
                            ) : "Submit Feedback"}
                        </button>
                    </div>
                </div>
            )}

            {/* Chat Box Element */}
            {activeChatRideId && (
                <ChatBox
                    rideId={activeChatRideId}
                    onClose={() => setActiveChatRideId(null)}
                />
            )}
        </div>
    );
}
