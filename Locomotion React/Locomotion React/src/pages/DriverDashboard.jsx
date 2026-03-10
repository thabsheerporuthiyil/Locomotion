import { useState, useEffect, useCallback, useRef } from "react";
import api from "../api/axios";
import { useAuthStore } from "../store/authStore";
import { Plus, Car, FileText, CheckCircle, Clock, XCircle, MapPin, Navigation, MessageSquare } from "lucide-react";
import { requestFirebaseNotificationPermission, onMessageListener } from "../firebase";
import ChatBox from "../components/ChatBox";

export default function DriverDashboard() {
    const { name } = useAuthStore();
    const [vehicles, setVehicles] = useState([]);
    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showAddModal, setShowAddModal] = useState(false);
    const [otpInputs, setOtpInputs] = useState({});

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

    // Wallet State
    const [walletBalance, setWalletBalance] = useState(0);

    // Form State
    const [categories, setCategories] = useState([]);
    const [brands, setBrands] = useState([]);
    const [models, setModels] = useState([]);

    const [form, setForm] = useState({
        vehicle_category: "",
        vehicle_brand: "",
        vehicle_model: "",
        registration_number: "",
        vehicle_image: null,
        rc_document: null,
        insurance_document: null,
    });

    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState(null);
    const [isAvailable, setIsAvailable] = useState(true);

    /* =========================
       FETCH DATA
    ========================== */
    const fetchData = async () => {
        setLoading(true);
        try {
            const [vehiclesRes, availabilityRes, requestsRes] = await Promise.all([
                api.get("drivers/vehicles/"),
                api.get("drivers/availability/"),
                api.get("bookings/driver-requests/")
            ]);

            setVehicles(vehiclesRes.data);
            setIsAvailable(availabilityRes.data.is_available);

            // Extract wallet balance from availability response (which returns DriverProfile)
            if (availabilityRes.data.wallet_balance !== undefined) {
                setWalletBalance(parseFloat(availabilityRes.data.wallet_balance));
            }

            setRequests(requestsRes.data);

        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const toggleAvailability = async () => {
        try {
            const res = await api.post("drivers/availability/");
            setIsAvailable(res.data.is_available);
        } catch (err) {
            console.error("Failed to toggle availability", err);
        }
    };

    const handleRequestAction = useCallback(async (id, action, extraData = null) => {
        try {
            await api.post(`bookings/${id}/${action}/`, extraData);
            // Refresh requests
            const res = await api.get("bookings/driver-requests/");
            setRequests(res.data);

            // Clear OTP input if successful
            if (action === 'start_trip') {
                setOtpInputs(prev => ({ ...prev, [id]: "" }));
            }

            // If completed a trip, update the wallet balance showing instantly
            if (action === 'complete') {
                const availRes = await api.get("drivers/availability/");
                if (availRes.data.wallet_balance !== undefined) {
                    setWalletBalance(parseFloat(availRes.data.wallet_balance));
                }
            }

            alert(`Ride ${action}ed successfully`);
        } catch (err) {
            console.error(err);
            alert(err.response?.data?.error || "Failed to update ride status");
        }
    }, []);

    useEffect(() => {
        fetchData();
        // Load Categories
        api.get("vehicles/categories/").then(res => setCategories(res.data));

        // Load Razorpay Script
        const script = document.createElement("script");
        script.src = "https://checkout.razorpay.com/v1/checkout.js";
        script.async = true;
        document.body.appendChild(script);

        // Setup Firebase Notifications
        requestFirebaseNotificationPermission()
            .then((token) => {
                if (token) {
                    console.log("FCM Token Generated, sending to backend...");
                    api.post("accounts/update-fcm-token/", { fcm_token: token })
                        .catch(err => console.error("Failed to save token to backend:", err));
                }
            })
            .catch((err) => console.error("Firebase permission error", err));

        // Listen for foreground push notifications continuously
        const unsubscribe = onMessageListener((payload) => {
            console.log("Foreground push notification received:", payload);
            fetchData(); // Refresh the board
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

        // Listen for messages from the Service Worker (in case Firebase handles it as background while tab is blurred)
        const channel = new BroadcastChannel('locomotion-fcm-channel');
        channel.onmessage = (event) => {
            console.log("Service Worker broadcast received:", event.data);
            fetchData(); // Refresh the board
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

        // Fallback polling: refresh ride requests every 10 seconds to ensure no dropped rides
        const pollInterval = setInterval(() => {
            api.get("bookings/driver-requests/")
                .then(res => setRequests(res.data))
                .catch(err => console.log("Polling error:", err));
        }, 10000);

        return () => {
            document.body.removeChild(script);
            // Unsubscribe from foreground listener on unmount
            if (unsubscribe) unsubscribe();
            channel.close();
            clearInterval(pollInterval);
        }
    }, []);

    /* =========================
       HANDLE FORM CHANGES
    ========================== */
    useEffect(() => {
        if (form.vehicle_category) {
            api.get(`vehicles/brands/?category=${form.vehicle_category}`)
                .then(res => setBrands(res.data));
        } else {
            setBrands([]);
            setModels([]);
        }
    }, [form.vehicle_category]);

    useEffect(() => {
        if (form.vehicle_brand) {
            api.get(`vehicles/models/?brand=${form.vehicle_brand}`)
                .then(res => setModels(res.data));
        } else {
            setModels([]);
        }
    }, [form.vehicle_brand]);

    const handleChange = (e) => {
        const { name, value, files, type } = e.target;
        if (type === "file") {
            setForm({ ...form, [name]: files[0] });
        } else {
            setForm({ ...form, [name]: value });
        }
    };

    /* =========================
       SUBMIT NEW VEHICLE
    ========================== */
    const handleSubmit = async (e) => {
        e.preventDefault();
        setError(null);
        setSubmitting(true);

        const formData = new FormData();
        Object.keys(form).forEach(key => {
            if (key !== "vehicle_brand")
                formData.append(key, form[key]);
        });

        try {
            await api.post("drivers/vehicles/", formData, {
                headers: { "Content-Type": "multipart/form-data" },
            });
            setShowAddModal(false);

            // Reset form
            setForm({
                vehicle_category: "",
                vehicle_brand: "",
                vehicle_model: "",
                registration_number: "",
                vehicle_image: null,
                rc_document: null,
                insurance_document: null,
            });

            fetchData();
        } catch (err) {
            setError(err.response?.data?.error || "Failed to add vehicle. Please check inputs.");
            console.error(err);
        } finally {
            setSubmitting(false);
        }
    };

    /* =========================
       HANDLE WALLET RECHARGE
    ========================== */
    const handleWalletRecharge = async () => {
        try {
            // 1. Create Razorpay order on our backend
            const orderRes = await api.post("payments/wallet/recharge/");
            const { order_id, amount, currency, key_id } = orderRes.data;

            // 2. Initialize Razorpay Checkout
            const options = {
                key: key_id,
                amount: amount,
                currency: currency,
                name: "Locomotion",
                description: "Driver Wallet Recharge",
                order_id: order_id,
                handler: async function (response) {
                    try {
                        // 3. Verify payment on our backend
                        const verifyRes = await api.post("payments/wallet/verify/", {
                            razorpay_order_id: response.razorpay_order_id,
                            razorpay_payment_id: response.razorpay_payment_id,
                            razorpay_signature: response.razorpay_signature
                        });

                        alert("Wallet recharged successfully! Your account is unlocked.");

                        // 4. Update the wallet balance in UI
                        if (verifyRes.data.new_balance !== undefined) {
                            setWalletBalance(parseFloat(verifyRes.data.new_balance));
                            // Re-fetch to unlock the requests view
                            fetchData();
                        }
                    } catch (verifyErr) {
                        console.error("Payment verification failed", verifyErr);
                        alert("Payment successful but verification failed. Please contact support.");
                    }
                },
                prefill: {
                    name: name,
                },
                theme: {
                    color: "#4F46E5" // indigo-600
                }
            };

            const rzp = new window.Razorpay(options);

            rzp.on('payment.failed', function (response) {
                alert("Payment failed: " + response.error.description);
            });

            rzp.open();

        } catch (err) {
            console.error("Failed to initiate wallet recharge", err);
            alert(err.response?.data?.error || "Failed to initialize payment gateway.");
        }
    };


    /* =========================
       RENDER
    ========================== */
    const isLockedOut = walletBalance <= -100;

    return (
        <div className="min-h-screen bg-slate-50 py-12 px-4 sm:px-6 lg:px-8">
            <div className="max-w-5xl mx-auto space-y-12">

                {/* Header */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900">Driver Dashboard</h1>
                        <p className="text-gray-500 mt-1">Manage your rides and vehicles</p>
                    </div>

                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">

                        {/* Wallet Balance Display */}
                        <div className={`flex flex-col items-center justify-center px-4 py-2 rounded-xl border ${isLockedOut ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'}`}>
                            <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">Wallet</span>
                            <span className={`text-lg font-black ${isLockedOut ? 'text-red-700' : 'text-green-700'}`}>
                                ₹{walletBalance.toFixed(2)}
                            </span>
                        </div>

                        {/* Availability Toggle */}
                        <div className="flex items-center gap-3 bg-gray-50 px-4 py-3 rounded-xl border border-gray-100">
                            <span className={`text-sm font-medium ${isAvailable ? "text-green-600" : "text-gray-500"}`}>
                                {isAvailable ? "Available" : "Unavailable"}
                            </span>
                            <button
                                onClick={toggleAvailability}
                                disabled={isLockedOut}
                                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${isAvailable && !isLockedOut ? 'bg-green-500' : 'bg-gray-300'} ${isLockedOut ? 'opacity-50 cursor-not-allowed' : ''}`}
                            >
                                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${isAvailable && !isLockedOut ? 'translate-x-6' : 'translate-x-1'}`} />
                            </button>
                        </div>

                        <button
                            onClick={() => setShowAddModal(true)}
                            className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-3 rounded-xl font-semibold shadow hover:bg-indigo-700 transition"
                        >
                            <Plus size={20} /> Add Vehicle
                        </button>
                    </div>
                </div>

                {/* Ride Requests Section or Lockout Screen */}
                <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">

                    {isLockedOut ? (
                        <div className="text-center py-12 px-4 bg-red-50 rounded-xl border border-red-200">
                            <XCircle className="mx-auto h-16 w-16 text-red-500 mb-4" />
                            <h2 className="text-2xl font-black text-red-900 mb-2">Account Locked</h2>
                            <p className="text-red-700 max-w-md mx-auto mb-6">
                                Your wallet balance has dropped below the -₹100 limit. You cannot accept new rides until you settle your negative balance.
                            </p>
                            <div className="flex flex-col items-center justify-center space-y-3">
                                <div className="text-3xl font-black text-red-800 bg-white px-6 py-3 rounded-xl border border-red-200 shadow-sm">
                                    Amount Due: ₹{Math.abs(walletBalance).toFixed(2)}
                                </div>
                                <button
                                    onClick={handleWalletRecharge}
                                    className="mt-4 bg-red-600 text-white px-8 py-3 rounded-xl font-bold text-lg shadow hover:bg-red-700 transition flex items-center justify-center gap-2"
                                >
                                    Recharge Wallet via Razorpay
                                </button>
                            </div>
                        </div>
                    ) : (
                        <>
                            <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
                                <Navigation size={24} className="text-indigo-600" />
                                Ride Requests
                            </h2>

                            {loading ? (
                                <p>Loading requests...</p>
                            ) : requests.length === 0 ? (
                                <div className="text-center py-10 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                                    <p className="text-gray-500">No active ride requests.</p>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {requests.map(req => (
                                        <div key={req.id} className="border border-gray-100 rounded-xl p-5 hover:bg-slate-50 transition flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                                            <div className="space-y-2 flex-1">
                                                <div className="flex items-center gap-2">
                                                    <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase ${req.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                                                        req.status === 'accepted' ? 'bg-indigo-100 text-indigo-700' :
                                                            req.status === 'arrived' ? 'bg-blue-100 text-blue-700' :
                                                                req.status === 'in_progress' ? 'bg-green-100 text-green-700' :
                                                                    req.status === 'rejected' ? 'bg-red-100 text-red-700' :
                                                                        'bg-gray-100 text-gray-700'
                                                        }`}>
                                                        {req.status.replace("_", " ")}
                                                    </span>
                                                    <span className="text-sm text-gray-500">{new Date(req.created_at).toLocaleString()}</span>
                                                </div>

                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                    <div>
                                                        <p className="text-xs text-gray-400 font-bold uppercase">Pickup</p>
                                                        <p className="font-medium text-gray-800">{req.source_location}</p>
                                                    </div>
                                                    <div>
                                                        <p className="text-xs text-gray-400 font-bold uppercase">Destination</p>
                                                        <p className="font-medium text-gray-800">{req.destination_location}</p>
                                                    </div>
                                                </div>

                                                <div className="flex gap-4 mt-2">
                                                    <p className="text-sm">🛣️ <b>{req.distance_km} km</b></p>
                                                    <p className="text-sm">💰 <b>₹{req.estimated_fare}</b></p>
                                                </div>

                                                {req.status === 'accepted' && (
                                                    <div className="bg-green-50 p-3 rounded-lg border border-green-100 mt-2">
                                                        <p className="text-sm font-semibold text-green-800">Rider Contact:</p>
                                                        <p className="text-lg font-bold text-green-900">{req.rider_phone || "Not available"}</p>
                                                        <p className="text-sm text-green-700">{req.rider_name}</p>
                                                        <div className="flex flex-col gap-2 mt-3">
                                                            <a
                                                                href={`https://www.google.com/maps/dir/?api=1&destination=${req.source_lat},${req.source_lng}`}
                                                                target="_blank"
                                                                rel="noreferrer"
                                                                className="inline-flex items-center gap-2 text-indigo-600 hover:underline font-medium text-sm"
                                                            >
                                                                <Navigation size={14} /> Navigate to Rider's Location
                                                            </a>
                                                            <a
                                                                href={`https://www.google.com/maps/dir/?api=1&origin=${req.source_lat},${req.source_lng}&destination=${req.destination_lat},${req.destination_lng}`}
                                                                target="_blank"
                                                                rel="noreferrer"
                                                                className="inline-flex items-center gap-2 text-blue-600 hover:underline font-medium text-sm pt-1 border-t border-green-200"
                                                            >
                                                                <MapPin size={14} /> Navigate Ride Route (Pickup to Dropoff)
                                                            </a>
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Chat Toggle Button */}
                                                {['accepted', 'arrived', 'in_progress'].includes(req.status) && (
                                                    <button
                                                        onClick={() => {
                                                            setActiveChatRideId(req.id);
                                                            // Clear unread mark when opened
                                                            setUnreadMessages(prev => ({ ...prev, [req.id]: false }));
                                                        }}
                                                        className="w-full mt-3 flex items-center justify-center gap-2 bg-indigo-50 text-indigo-700 border border-indigo-200 px-4 py-2 rounded-xl font-bold shadow-sm hover:bg-indigo-100 transition-colors text-sm relative"
                                                    >
                                                        <MessageSquare size={16} />
                                                        Chat with Rider
                                                        {unreadMessages[req.id] && (
                                                            <span className="absolute top-0 right-0 -mt-1 -mr-1 flex h-3 w-3">
                                                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                                                                <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                                                            </span>
                                                        )}
                                                    </button>
                                                )}
                                            </div>

                                            {/* Pending Actions */}
                                            {req.status === 'pending' && (
                                                <div className="flex flex-col gap-2 min-w-[120px]">
                                                    <button
                                                        onClick={() => handleRequestAction(req.id, "accept")}
                                                        className="bg-green-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-green-700 transition"
                                                    >
                                                        Accept
                                                    </button>
                                                    <button
                                                        onClick={() => handleRequestAction(req.id, "reject")}
                                                        className="bg-red-100 text-red-600 px-4 py-2 rounded-lg font-semibold hover:bg-red-200 transition"
                                                    >
                                                        Reject
                                                    </button>
                                                </div>
                                            )}

                                            {/* Accepted Actions */}
                                            {req.status === 'accepted' && (
                                                <div className="flex flex-col gap-2 min-w-[120px]">
                                                    <button
                                                        onClick={() => handleRequestAction(req.id, "arrive")}
                                                        className="bg-blue-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-blue-700 transition"
                                                    >
                                                        Arrived at Pickup
                                                    </button>
                                                </div>
                                            )}

                                            {/* Arrived Actions (OTP) */}
                                            {req.status === 'arrived' && (
                                                <div className="flex flex-col justify-end gap-2 min-w-[150px]">
                                                    <div className="flex flex-col gap-1">
                                                        <label className="text-xs font-semibold text-gray-500 uppercase">Enter Rider PIN</label>
                                                        <div className="flex gap-2">
                                                            <input
                                                                type="text"
                                                                maxLength={4}
                                                                placeholder="0000"
                                                                value={otpInputs[req.id] || ""}
                                                                onChange={(e) => setOtpInputs({ ...otpInputs, [req.id]: e.target.value })}
                                                                className="w-20 text-center font-bold tracking-widest border border-gray-300 rounded-lg py-2"
                                                            />
                                                            <button
                                                                onClick={() => handleRequestAction(req.id, "start_trip", { otp: otpInputs[req.id] })}
                                                                disabled={!otpInputs[req.id] || otpInputs[req.id].length !== 4}
                                                                className="flex-1 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 transition disabled:opacity-50"
                                                            >
                                                                Start
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}

                                            {/* In Progress Actions */}
                                            {req.status === 'in_progress' && (
                                                <div className="flex flex-col gap-2 min-w-[120px]">
                                                    <button
                                                        onClick={() => handleRequestAction(req.id, "complete")}
                                                        className="bg-indigo-600 text-white px-4 py-3 rounded-lg font-bold shadow-md hover:bg-indigo-700 transition flex items-center justify-center gap-2"
                                                    >
                                                        <CheckCircle size={18} /> Complete Trip
                                                    </button>
                                                </div>
                                            )}

                                            {/* Completed Actions (Payment Collection) */}
                                            {req.status === 'completed' && !req.is_paid && (
                                                <div className="flex flex-col gap-2 min-w-[150px] bg-emerald-50 border border-emerald-200 p-3 rounded-xl text-center">
                                                    <p className="text-xs font-bold text-emerald-600 uppercase tracking-widest mb-1">Collect Cash / UPI</p>
                                                    <p className="text-2xl font-black text-emerald-700">₹{req.estimated_fare}</p>
                                                    <p className="text-[10px] text-emerald-600 mt-1 mb-2">Ride Completed</p>

                                                    <button
                                                        onClick={() => handleRequestAction(req.id, "confirm_payment")}
                                                        className="w-full bg-emerald-600 text-white py-2 rounded-lg text-sm font-bold shadow-sm hover:bg-emerald-700 transition flex items-center justify-center gap-1.5"
                                                    >
                                                        <CheckCircle size={14} /> Confirm Payment
                                                    </button>
                                                </div>
                                            )}

                                            {/* Fully Settled Actions (Done) */}
                                            {req.status === 'completed' && req.is_paid && (
                                                <div className="flex flex-col gap-1 min-w-[120px] bg-gray-50 border border-gray-200 p-3 rounded-xl text-center">
                                                    <CheckCircle className="mx-auto h-6 w-6 text-green-500 mb-1" />
                                                    <p className="text-xs font-bold text-gray-700 uppercase tracking-wide">Paid & Finished</p>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </>
                    )}
                </div>

                {/* Vehicles Grid */}
                <div>
                    <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
                        <Car size={24} className="text-indigo-600" />
                        My Vehicles
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {loading ? (
                            <p className="text-gray-500 col-span-2 text-center py-10">Loading vehicles...</p>
                        ) : vehicles.length === 0 ? (
                            <div className="col-span-2 bg-white rounded-2xl p-10 text-center border border-dashed border-gray-300">
                                <Car className="mx-auto h-12 w-12 text-gray-400 mb-3" />
                                <h3 className="text-lg font-medium text-gray-900">No Vehicles Found</h3>
                                <p className="text-gray-500">Add your first vehicle to get started.</p>
                            </div>
                        ) : (
                            vehicles.map(vehicle => (
                                <div key={vehicle.id} className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden hover:shadow-md transition">
                                    <div className="relative h-48 bg-gray-200">
                                        {vehicle.vehicle_image ? (
                                            <img
                                                src={vehicle.vehicle_image}
                                                alt={vehicle.vehicle_model_name}
                                                className="w-full h-full object-cover"
                                            />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-gray-400">
                                                <Car size={48} />
                                            </div>
                                        )}
                                        <div className="absolute top-3 right-3">
                                            <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase shadow-sm ${vehicle.status === 'approved' ? 'bg-green-100 text-green-700' :
                                                vehicle.status === 'rejected' ? 'bg-red-100 text-red-700' :
                                                    'bg-yellow-100 text-yellow-700'
                                                }`}>
                                                {vehicle.status}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="p-5">
                                        <div className="flex justify-between items-start mb-2">
                                            <div>
                                                <h3 className="text-lg font-bold text-gray-900">{vehicle.vehicle_brand_name} {vehicle.vehicle_model_name}</h3>
                                                <p className="text-sm text-gray-500">{vehicle.vehicle_category_name}</p>
                                            </div>
                                            {vehicle.is_primary && (
                                                <span className="bg-indigo-50 text-indigo-700 text-xs px-2 py-1 rounded-md font-semibold">Primary</span>
                                            )}
                                        </div>

                                        <div className="flex items-center gap-2 mt-4 text-sm text-gray-600 bg-gray-50 p-3 rounded-lg">
                                            <span className="font-mono font-medium tracking-wide">{vehicle.registration_number}</span>
                                        </div>

                                        <div className="flex gap-2 mt-4">
                                            {vehicle.rc_document && (
                                                <a href={vehicle.rc_document} target="_blank" rel="noreferrer" className="flex-1 flex items-center justify-center gap-2 text-xs font-semibold py-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition">
                                                    <FileText size={14} /> View RC
                                                </a>
                                            )}
                                            {vehicle.insurance_document && (
                                                <a href={vehicle.insurance_document} target="_blank" rel="noreferrer" className="flex-1 flex items-center justify-center gap-2 text-xs font-semibold py-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition">
                                                    <FileText size={14} /> Insurance
                                                </a>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

            </div>

            {/* Add Vehicle Modal */}
            {showAddModal && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                        <div className="p-6 border-b border-gray-100 flex justify-between items-center sticky top-0 bg-white">
                            <h2 className="text-xl font-bold">Add New Vehicle</h2>
                            <button
                                onClick={() => setShowAddModal(false)}
                                className="p-2 hover:bg-gray-100 rounded-full transition"
                            >
                                <XCircle size={24} className="text-gray-400" />
                            </button>
                        </div>

                        <div className="p-6">
                            {error && (
                                <div className="bg-red-50 text-red-600 p-3 rounded-lg mb-4 text-sm font-medium">
                                    {error}
                                </div>
                            )}

                            <form onSubmit={handleSubmit} className="space-y-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    {/* Category */}
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Vehicle Category</label>
                                        <select
                                            name="vehicle_category"
                                            value={form.vehicle_category}
                                            onChange={handleChange}
                                            className="w-full border-gray-300 rounded-xl py-2.5"
                                        >
                                            <option value="">Select Category</option>
                                            {categories.map(cat => (
                                                <option key={cat.id} value={cat.id}>{cat.name}</option>
                                            ))}
                                        </select>
                                    </div>

                                    {/* Brand */}
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Brand</label>
                                        <select
                                            name="vehicle_brand"
                                            value={form.vehicle_brand}
                                            onChange={handleChange}
                                            disabled={!form.vehicle_category}
                                            className="w-full border-gray-300 rounded-xl py-2.5 disabled:bg-gray-100"
                                        >
                                            <option value="">Select Brand</option>
                                            {brands.map(brand => (
                                                <option key={brand.id} value={brand.id}>{brand.name}</option>
                                            ))}
                                        </select>
                                    </div>

                                    {/* Model */}
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Model</label>
                                        <select
                                            name="vehicle_model"
                                            value={form.vehicle_model}
                                            onChange={handleChange}
                                            disabled={!form.vehicle_brand}
                                            className="w-full border-gray-300 rounded-xl py-2.5 disabled:bg-gray-100"
                                        >
                                            <option value="">Select Model</option>
                                            {models.map(model => (
                                                <option key={model.id} value={model.id}>{model.name}</option>
                                            ))}
                                        </select>
                                    </div>

                                    {/* Registration */}
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Registration Number</label>
                                        <input
                                            type="text"
                                            name="registration_number"
                                            placeholder="e.g. KL 01 AB 1234"
                                            onChange={handleChange}
                                            className="w-full border-gray-300 rounded-xl py-2.5"
                                        />
                                    </div>

                                    {/* Documents */}
                                    <div className="md:col-span-2 space-y-4 pt-2">
                                        <h3 className="text-sm font-semibold text-gray-900 border-b pb-2">Documents</h3>

                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                            <div>
                                                <label className="block text-xs font-medium text-gray-500 mb-1">Vehicle Photo</label>
                                                <input type="file" name="vehicle_image" onChange={handleChange} className="text-xs" />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-medium text-gray-500 mb-1">RC Document</label>
                                                <input type="file" name="rc_document" onChange={handleChange} className="text-xs" />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-medium text-gray-500 mb-1">Insurance</label>
                                                <input type="file" name="insurance_document" onChange={handleChange} className="text-xs" />
                                            </div>
                                        </div>
                                    </div>

                                </div>

                                <div className="pt-4">
                                    <button
                                        type="submit"
                                        disabled={submitting}
                                        className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold hover:bg-indigo-700 transition disabled:opacity-50"
                                    >
                                        {submitting ? "Submitting..." : "Submit for Approval"}
                                    </button>
                                </div>
                            </form>
                        </div>
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
