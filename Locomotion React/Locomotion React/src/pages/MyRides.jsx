import { useState, useEffect, useRef } from "react";
import api from "../api/axios";
import { Clock, MapPin, Navigation, Car, RefreshCw, CreditCard, Star, X, CheckCircle, MessageSquare, Map } from "lucide-react";
import { requestFirebaseNotificationPermission, onMessageListener } from "../firebase";
import ChatBox from "../components/ChatBox";
import LiveTrackingMap from "../components/LiveTrackingMap";

export default function MyRides() {
    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [processingPayment, setProcessingPayment] = useState(false);

    // Chat / Tracking State
    const [activeChatRideId, setActiveChatRideId] = useState(null);
    const [trackingRideId, setTrackingRideId] = useState(null);
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
                    api.post("accounts/update-fcm-token/", { fcm_token: token })
                        .catch(err => console.error("Failed to save token to backend:", err));
                }
            })
            .catch((err) => console.error("Firebase permission error", err));

        // Listen for foreground push notifications continuously
        const unsubscribe = onMessageListener((payload) => {
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
            case 'pending': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
            case 'accepted': return 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30';
            case 'arrived': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
            case 'in_progress': return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
            case 'completed': return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
            case 'cancelled': return 'bg-slate-500/20 text-slate-400 border-slate-500/30';
            default: return 'bg-slate-500/20 text-slate-400 border-slate-500/30';
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
        <div className="min-h-screen bg-slate-950 py-12 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
            {/* Decorative Background Gradients */}
            <div className="absolute top-0 left-[20%] w-[30%] h-[30%] bg-indigo-600/20 rounded-full blur-[120px] mix-blend-screen pointer-events-none" />
            <div className="fixed bottom-0 right-[10%] w-[40%] h-[40%] bg-purple-600/10 rounded-full blur-[120px] mix-blend-screen pointer-events-none" />

            <div className="max-w-4xl mx-auto space-y-8 relative z-10 pt-16">
                <div className="flex justify-between items-center bg-slate-900/40 p-6 rounded-3xl border border-white/5 backdrop-blur-md">
                    <div>
                        <h1 className="text-3xl font-black text-white tracking-tight">My Rides</h1>
                        <p className="text-sm text-indigo-200/70 mt-1 font-medium">View your current and past ride requests.</p>
                    </div>
                    <button
                        onClick={fetchRequests}
                        disabled={loading}
                        className="flex items-center gap-2 px-6 py-3 bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-400 border border-indigo-500/30 rounded-xl font-bold shadow-lg transition-all disabled:opacity-50 disabled:hover:bg-indigo-600/20"
                    >
                        <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
                        Refresh
                    </button>
                </div>

                {loading && requests.length === 0 ? (
                    <div className="text-center py-20 bg-slate-900/40 rounded-3xl border border-white/5 backdrop-blur-md">
                        <div className="animate-spin text-indigo-500 w-10 h-10 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full mx-auto mb-6 shadow-[0_0_15px_rgba(99,102,241,0.5)]"></div>
                        <p className="text-indigo-200/70 font-medium">Loading your rides...</p>
                    </div>
                ) : requests.length === 0 ? (
                    <div className="bg-slate-900/40 rounded-3xl shadow-2xl shadow-black/50 border border-white/5 p-16 text-center backdrop-blur-xl">
                        <div className="w-20 h-20 bg-indigo-500/10 border border-indigo-500/20 rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner">
                            <Navigation className="w-10 h-10 text-indigo-400" />
                        </div>
                        <h3 className="text-2xl font-black text-white mb-3">No Rides Found</h3>
                        <p className="text-slate-400 max-w-sm mx-auto font-medium leading-relaxed">You haven't requested any rides yet. Book a ride from the "Find Driver" page to get started!</p>
                    </div>
                ) : (
                    <div className="space-y-6">
                        {requests.map((ride) => (
                            <div key={ride.id} className="bg-slate-900/60 rounded-3xl shadow-xl shadow-black/40 border border-white/10 overflow-hidden hover:border-indigo-500/30 transition-all group backdrop-blur-xl">
                                <div className="p-6">
                                    <div className="flex flex-col sm:flex-row justify-between items-start mb-6 gap-4 border-b border-white/5 pb-6">
                                        <div className="flex items-center gap-4">
                                            <div className="w-14 h-14 bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border border-white/10 rounded-full flex items-center justify-center text-indigo-400 shadow-inner">
                                                <Car size={26} />
                                            </div>
                                            <div>
                                                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Driver</p>
                                                <h3 className="text-xl font-black text-white leading-tight">{ride.driver_name}</h3>
                                                {ride.vehicle_details && (
                                                    <p className="text-sm font-medium text-indigo-200/70 mt-1">{ride.vehicle_details}</p>
                                                )}
                                            </div>
                                        </div>

                                        <div className="flex flex-col items-end gap-2.5">
                                            <span className={`px-4 py-1.5 text-xs font-bold uppercase tracking-wider rounded-lg border shadow-[0_0_15px_rgba(0,0,0,0.2)] ${getStatusStyle(ride.status)} backdrop-blur-sm`}>
                                                {ride.status.replace("_", " ")}
                                            </span>
                                            {ride.is_paid && (
                                                <span className={`px-4 py-1.5 text-xs font-bold uppercase tracking-wider rounded-lg border bg-emerald-500/20 text-emerald-400 border-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.1)] backdrop-blur-sm`}>
                                                    Paid
                                                </span>
                                            )}
                                            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 mt-1">
                                                <Clock size={14} className="text-slate-500" />
                                                <span>{new Date(ride.created_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-6 relative">
                                        {/* Visual Timeline Bar (Desktop) */}
                                        <div className="hidden md:flex absolute left-1/2 top-4 bottom-4 w-px bg-white/10 -translate-x-1/2"></div>

                                        <div className="relative pl-6">
                                            <div className="absolute left-0 top-1.5 w-3 h-3 rounded-full bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.6)]"></div>
                                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Pickup</p>
                                            <p className="text-sm font-semibold text-slate-300 leading-relaxed">{ride.source_location}</p>
                                        </div>

                                        <div className="relative pl-6">
                                            <div className="absolute left-0 top-1.5 w-3 h-3 bg-purple-500 shadow-[0_0_10px_rgba(168,85,247,0.6)]"></div>
                                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Dropoff</p>
                                            <p className="text-sm font-semibold text-slate-300 leading-relaxed">{ride.destination_location}</p>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 bg-black/20 p-5 rounded-2xl border border-white/5 items-center">
                                        <div>
                                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Distance</p>
                                            <p className="text-sm font-bold text-white">{ride.distance_km || "--"} km</p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Estimated Fare</p>
                                            <p className="text-sm font-black text-emerald-400 tracking-tight text-shadow-sm">₹{ride.estimated_fare || "--"}</p>
                                        </div>

                                        {['accepted', 'arrived', 'in_progress'].includes(ride.status) && ride.driver_phone && (
                                            <div className="col-span-2 sm:col-span-1 border-t border-white/10 sm:border-t-0 sm:border-l sm:pl-4 pt-3 sm:pt-0">
                                                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Driver Phone</p>
                                                <p className="text-sm font-bold text-slate-300">{ride.driver_phone}</p>
                                            </div>
                                        )}

                                        {/* OTP Display */}
                                        {['accepted', 'arrived'].includes(ride.status) && ride.ride_otp && (
                                            <div className="col-span-2 sm:col-span-1 border-t border-white/10 sm:border-t-0 sm:border-l sm:pl-4 pt-3 sm:pt-0">
                                                <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest mb-1">Ride PIN</p>
                                                <p className="text-xl font-black tracking-widest text-indigo-300">{ride.ride_otp}</p>
                                            </div>
                                        )}

                                        {/* Status / Actions Container */}
                                        <div className="col-span-2 sm:col-span-all border-t border-white/10 sm:border-t-0 sm:pl-0 pt-3 sm:pt-4 flex flex-col gap-3 justify-center h-full mt-2">

                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                {/* Live Tracking Button */}
                                                {['accepted', 'arrived', 'in_progress'].includes(ride.status) && (
                                                    <button
                                                        onClick={() => setTrackingRideId(ride.id)}
                                                        className="w-full flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-500 text-white px-4 py-3 rounded-xl font-bold shadow-lg transition-all text-sm group-hover:shadow-purple-500/20"
                                                    >
                                                        <Map size={18} />
                                                        Track Driver
                                                    </button>
                                                )}

                                                {/* Chat Button */}
                                                {['accepted', 'arrived', 'in_progress'].includes(ride.status) && (
                                                    <button
                                                        onClick={() => {
                                                            setActiveChatRideId(ride.id);
                                                            // Clear unread mark when opened
                                                            setUnreadMessages(prev => ({ ...prev, [ride.id]: false }));
                                                        }}
                                                        className="w-full flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-white border border-slate-600 px-4 py-3 rounded-xl font-bold shadow-lg transition-all text-sm relative"
                                                    >
                                                        <MessageSquare size={18} className="text-indigo-400" />
                                                        Chat with Driver
                                                        {unreadMessages[ride.id] && (
                                                            <span className="absolute top-0 right-0 -mt-1.5 -mr-1.5 flex h-4 w-4">
                                                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                                                                <span className="relative inline-flex rounded-full h-4 w-4 bg-red-500 border-2 border-slate-800"></span>
                                                            </span>
                                                        )}
                                                    </button>
                                                )}
                                            </div>

                                            {/* Payment Notice */}
                                            {ride.status === 'completed' && !ride.is_paid && (
                                                <div className="w-full text-center bg-yellow-500/10 text-yellow-500 border border-yellow-500/20 px-4 py-3.5 rounded-xl shadow-inner text-sm font-bold flex items-center justify-center gap-2 mt-2 backdrop-blur-sm">
                                                    <CreditCard size={18} />
                                                    Pay ₹{ride.estimated_fare} via Cash or UPI
                                                </div>
                                            )}

                                            {/* Payment Verified */}
                                            {ride.status === 'completed' && ride.is_paid && (
                                                <div className="w-full text-center bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-4 py-3.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 shadow-inner mt-2 backdrop-blur-sm">
                                                    <CheckCircle size={18} />
                                                    Payment Verified
                                                </div>
                                            )}

                                            {/* Rating Area */}
                                            {ride.status === 'completed' && (
                                                <div className="w-full flex justify-end mt-4">
                                                    {ride.rating ? (
                                                        <div className="flex flex-col items-end bg-black/20 p-3 rounded-xl border border-white/5 w-full sm:w-auto">
                                                            <div className="flex text-amber-500">
                                                                {[...Array(5)].map((_, i) => (
                                                                    <Star key={i} size={16} fill={i < ride.rating ? "currentColor" : "none"} className={i >= ride.rating ? "text-slate-600" : ""} />
                                                                ))}
                                                            </div>
                                                            {ride.feedback && <p className="text-xs font-medium text-slate-400 mt-2 italic text-right">"{ride.feedback}"</p>}
                                                        </div>
                                                    ) : (
                                                        <button
                                                            onClick={() => openRatingModal(ride.id)}
                                                            className="w-full sm:w-auto flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-white border border-slate-600 px-6 py-3 rounded-xl font-bold shadow-lg transition-all text-sm"
                                                        >
                                                            <Star size={18} className="text-amber-400" />
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
                <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
                    <div className="bg-slate-900 border border-indigo-500/30 rounded-[2rem] w-full max-w-sm shadow-[0_0_50px_rgba(0,0,0,0.5)] p-8 relative animate-in fade-in zoom-in duration-300">
                        <div className="absolute top-0 left-0 w-full h-1/2 bg-gradient-to-b from-indigo-500/10 to-transparent rounded-t-[2rem] pointer-events-none"></div>

                        <button
                            onClick={() => setShowRatingModal(false)}
                            className="absolute right-6 top-6 text-slate-500 hover:text-white transition-colors bg-white/5 hover:bg-white/10 p-2 rounded-full"
                        >
                            <X size={20} />
                        </button>

                        <div className="text-center mb-8 pt-2 relative z-10">
                            <div className="w-16 h-16 bg-amber-500/20 border border-amber-500/30 rounded-full flex items-center justify-center text-amber-400 mx-auto mb-4 shadow-[0_0_20px_rgba(245,158,11,0.2)]">
                                <Star size={32} fill="currentColor" />
                            </div>
                            <h3 className="text-2xl font-black text-white tracking-tight">How was your ride?</h3>
                            <p className="text-sm font-semibold text-slate-400 mt-2">Please rate your driver's service</p>
                        </div>

                        <div className="flex justify-center gap-2 mb-8 cursor-pointer relative z-10">
                            {[1, 2, 3, 4, 5].map((star) => (
                                <Star
                                    key={star}
                                    size={42}
                                    className={`transition-all duration-300 ${(hoverRating || ratingValue) >= star
                                        ? "text-amber-400 scale-110 drop-shadow-[0_0_8px_rgba(251,191,36,0.6)]"
                                        : "text-slate-700 hover:text-amber-500/50"
                                        }`}
                                    fill={(hoverRating || ratingValue) >= star ? "currentColor" : "none"}
                                    onClick={() => setRatingValue(star)}
                                    onMouseEnter={() => setHoverRating(star)}
                                    onMouseLeave={() => setHoverRating(0)}
                                />
                            ))}
                        </div>

                        <div className="mb-8 relative z-10">
                            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3">Feedback (Optional)</label>
                            <textarea
                                value={feedback}
                                onChange={(e) => setFeedback(e.target.value)}
                                placeholder="Any comments for the driver? Tell us about the trip."
                                className="w-full bg-black/40 border border-white/10 rounded-2xl max-h-32 min-h-[100px] p-4 text-sm text-white focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all resize-none placeholder-slate-600 font-medium"
                            ></textarea>
                        </div>

                        <button
                            onClick={submitRating}
                            disabled={isSubmittingRating || ratingValue === 0}
                            className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-black tracking-wide hover:bg-indigo-500 transition-all disabled:opacity-50 disabled:bg-slate-700 flex justify-center items-center gap-3 shadow-[0_0_20px_rgba(79,70,229,0.3)] disabled:shadow-none hover:shadow-[0_0_25px_rgba(79,70,229,0.5)] relative z-10"
                        >
                            {isSubmittingRating ? (
                                <RefreshCw size={20} className="animate-spin" />
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

            {/* Live Tracking Map Modal */}
            {trackingRideId && (
                <LiveTrackingMap
                    rideId={trackingRideId}
                    onClose={() => setTrackingRideId(null)}
                />
            )}
        </div>
    );
}
