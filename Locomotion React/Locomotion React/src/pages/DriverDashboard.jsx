import { useState, useEffect } from "react";
import api from "../api/axios";
import { useAuthStore } from "../store/authStore";
import { 
    Plus, Car, FileText, CheckCircle, Navigation, XCircle, 
    Zap, ArrowUpRight, Calendar, ArrowRight, Brain, Info, AlertTriangle, RefreshCcw, Download, Smartphone
} from "lucide-react";
import { requestFirebaseNotificationPermission, onMessageListener } from "../firebase";

const DRIVER_APP_INSTALL_URL = "https://expo.dev/accounts/thabsheerporuthiyil/projects/LocomotionMobile/builds/0a898618-9cf7-4787-bcf0-ae811f05bf7c";

export default function DriverDashboard() {
    const { name } = useAuthStore();
    const [vehicles, setVehicles] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showAddModal, setShowAddModal] = useState(false);
    const [walletBalance, setWalletBalance] = useState(0);

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
    const [availLoading, setAvailLoading] = useState(false);

    const [coachDays, setCoachDays] = useState(14);
    const [coachGoal, setCoachGoal] = useState("maximize earnings");
    const [coachPlan, setCoachPlan] = useState(null);
    const [coachLLMUsed, setCoachLLMUsed] = useState(false);
    const [coachDebug, setCoachDebug] = useState("");
    const [coachShowDebug, setCoachShowDebug] = useState(true);
    const [coachLoading, setCoachLoading] = useState(false);
    const [coachError, setCoachError] = useState(null);
    const [reminders, setReminders] = useState([]);
    const [remindersLoading, setRemindersLoading] = useState(false);
    const [applyLoading, setApplyLoading] = useState(false);
    const [applyResult, setApplyResult] = useState(null);
    const isAppleDevice = /iPad|iPhone|iPod/i.test(window.navigator.userAgent);

    const formatDateTime = (iso) => {
        if (!iso) return "";
        try { return new Date(iso).toLocaleString(); } catch { return iso; }
    };

    const fetchData = async () => {
        setLoading(true);
        try {
            const [vehiclesRes, availabilityRes] = await Promise.all([
                api.get("drivers/vehicles/"),
                api.get("drivers/availability/"),
            ]);
            setVehicles(vehiclesRes.data);
            setIsAvailable(availabilityRes.data.is_available);
            if (availabilityRes.data.wallet_balance !== undefined) {
                setWalletBalance(parseFloat(availabilityRes.data.wallet_balance));
            }
        } catch (err) { console.error(err); } finally { setLoading(false); }
    };

    const toggleAvailability = async () => {
        console.log("Toggle Availability Clicked. Current State:", { isAvailable, isLockedOut, walletBalance });
        if (isLockedOut && !isAvailable) {
            console.warn("Locked out! Cannot go online.");
            alert("Account restricted. Please recharge your wallet to go online.");
            return;
        }
        setAvailLoading(true);
        try {
            console.log("Sending POST to drivers/availability/...");
            const res = await api.post("drivers/availability/");
            console.log("Server Response:", res.data);
            setIsAvailable(res.data.is_available);
            if (res.data.wallet_balance !== undefined) {
                setWalletBalance(parseFloat(res.data.wallet_balance));
            }
        } catch (err) { 
            const msg = err.response?.data?.error || "Failed to toggle availability";
            console.error("Toggle Error:", msg, err.response?.status, err.response?.data);
            alert(msg);
        } finally {
            setAvailLoading(false);
        }
    };

    const fetchReminders = async () => {
        setRemindersLoading(true);
        try {
            const res = await api.get("drivers/coach/reminders/");
            setReminders(res.data || []);
        } catch (err) { console.error("Failed to fetch reminders", err); } finally { setRemindersLoading(false); }
    };

    const generateCoachPlan = async () => {
        setCoachError(null);
        setCoachDebug("");
        setCoachLoading(true);
        setApplyResult(null);
        try {
            const params = new URLSearchParams();
            params.set("days", String(coachDays || 14));
            if (coachGoal) params.set("goal", coachGoal);
            if (coachShowDebug) params.set("debug", "1");
            const res = await api.get(`drivers/coach/plan/?${params.toString()}`);
            setCoachPlan(res.data?.plan || null);
            setCoachLLMUsed(Boolean(res.data?.llm_used));
            setCoachDebug(res.data?.debug || "");
        } catch (err) {
            setCoachError(err.response?.data?.error || "Failed to generate coach plan.");
            console.error(err);
        } finally { setCoachLoading(false); }
    };

    const applyCoachActions = async () => {
        setCoachError(null);
        setApplyLoading(true);
        try {
            const actions = coachPlan?.actions || [];
            if (!actions.length) {
                setCoachError("No actions found in the plan.");
                return;
            }
            const res = await api.post("drivers/coach/apply/", { actions });
            setApplyResult(res.data);
            fetchReminders();
        } catch (err) {
            setCoachError(err.response?.data?.error || "Failed to apply coach actions.");
            console.error(err);
        } finally { setApplyLoading(false); }
    };

    useEffect(() => {
        fetchData();
        fetchReminders();
        api.get("vehicles/categories/").then(res => setCategories(res.data));
        const script = document.createElement("script");
        script.src = "https://checkout.razorpay.com/v1/checkout.js";
        script.async = true;
        document.body.appendChild(script);
        requestFirebaseNotificationPermission()
            .then((token) => {
                if (token) api.post("accounts/update-fcm-token/", { fcm_token: token });
            }).catch((err) => console.error("Firebase permission error", err));
        const unsubscribe = onMessageListener((payload) => {
            fetchData();
            new Audio("https://actions.google.com/sounds/v1/alarms/beep_short.ogg").play().catch(() => {});
        });
        const channel = new BroadcastChannel('locomotion-fcm-channel');
        channel.onmessage = () => {
            fetchData();
            new Audio("https://actions.google.com/sounds/v1/alarms/beep_short.ogg").play().catch(() => {});
        };
        return () => {
            if (document.body.contains(script)) document.body.removeChild(script);
            if (unsubscribe) unsubscribe();
            channel.close();
        }
    }, []);

    useEffect(() => {
        if (form.vehicle_category) {
            api.get(`vehicles/brands/?category=${form.vehicle_category}`).then(res => setBrands(res.data));
        } else { setBrands([]); setModels([]); }
    }, [form.vehicle_category]);

    useEffect(() => {
        if (form.vehicle_brand) {
            api.get(`vehicles/models/?brand=${form.vehicle_brand}`).then(res => setModels(res.data));
        } else { setModels([]); }
    }, [form.vehicle_brand]);

    const handleChange = (e) => {
        const { name, value, files, type } = e.target;
        if (type === "file") setForm({ ...form, [name]: files[0] });
        else setForm({ ...form, [name]: value });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError(null);
        setSubmitting(true);
        const formData = new FormData();
        Object.keys(form).forEach(key => {
            if (key !== "vehicle_brand") formData.append(key, form[key]);
        });
        try {
            await api.post("drivers/vehicles/", formData, { headers: { "Content-Type": "multipart/form-data" } });
            setShowAddModal(false);
            setForm({
                vehicle_category: "", vehicle_brand: "", vehicle_model: "", registration_number: "",
                vehicle_image: null, rc_document: null, insurance_document: null,
            });
            fetchData();
        } catch (err) {
            setError(err.response?.data?.error || "Failed to add vehicle.");
            console.error(err);
        } finally { setSubmitting(false); }
    };

    const handleWalletRecharge = async () => {
        try {
            const orderRes = await api.post("payments/wallet/recharge/");
            const { order_id, amount, currency, key_id } = orderRes.data;
            const options = {
                key: key_id, amount, currency, name: "Locomotion", description: "Driver Wallet Recharge", order_id: order_id,
                handler: async function (response) {
                    try {
                        const verifyRes = await api.post("payments/wallet/verify/", {
                            razorpay_order_id: response.razorpay_order_id,
                            razorpay_payment_id: response.razorpay_payment_id,
                            razorpay_signature: response.razorpay_signature
                        });
                        alert("Wallet recharged successfully!");
                        if (verifyRes.data.new_balance !== undefined) {
                            setWalletBalance(parseFloat(verifyRes.data.new_balance));
                            fetchData();
                        }
                    } catch (err) { alert("Verification failed. Contact support."); }
                },
                prefill: { name }, theme: { color: "#4F46E5" }
            };
            const rzp = new window.Razorpay(options);
            rzp.on('payment.failed', (r) => alert("Payment failed: " + r.error.description));
            rzp.open();
        } catch (err) { alert(err.response?.data?.error || "Initialization failed."); }
    };

    const isLockedOut = walletBalance <= -100;

    return (
        <div className="min-h-screen bg-slate-950 py-12 px-4 sm:px-6 lg:px-8 relative overflow-hidden font-sans">
            {/* Background Decorative Elements */}
            <div className="absolute top-0 left-[10%] w-[40%] h-[40%] bg-indigo-600/10 rounded-full blur-[120px] mix-blend-screen pointer-events-none" />
            <div className="absolute bottom-0 right-[5%] w-[30%] h-[30%] bg-purple-600/10 rounded-full blur-[120px] mix-blend-screen pointer-events-none" />

            <div className="max-w-5xl mx-auto space-y-10 relative z-10">
                {/* Header Card */}
                <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 bg-slate-900/40 backdrop-blur-xl p-8 rounded-[2.5rem] border border-indigo-500/20 shadow-2xl">
                    <div>
                        <h1 className="text-4xl font-black text-white tracking-tight leading-tight">
                            Welcome, <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400">{name || "Driver"}</span>
                        </h1>
                        <p className="text-slate-400 font-medium mt-1 flex items-center gap-2">
                             <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> Command Center Dashboard
                        </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-4">
                        <div className={`flex flex-col items-end pr-4 border-r border-slate-800/50`}>
                            <span className="text-[0.65rem] font-black text-slate-500 uppercase tracking-widest">Active Balance</span>
                            <span className={`text-xl font-mono font-bold ${walletBalance < 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                                ₹{walletBalance.toFixed(2)}
                            </span>
                        </div>

                        <div className="flex items-center gap-4 bg-slate-950/50 p-2 rounded-3xl border border-slate-800">
                             <span className={`px-4 py-1.5 rounded-2xl text-[0.65rem] font-black uppercase tracking-widest transition-all ${isAvailable ? 'bg-emerald-500/10 text-emerald-400' : 'bg-slate-800 text-slate-500'}`}>
                                {availLoading ? 'Processing...' : isAvailable ? 'Online' : 'Offline'}
                             </span>
                             <button 
                                onClick={toggleAvailability}
                                disabled={availLoading || (isLockedOut && !isAvailable)}
                                className={`relative inline-flex h-8 w-14 items-center rounded-full transition-all duration-300 ${(availLoading || (isLockedOut && !isAvailable)) ? 'opacity-50 cursor-not-allowed' : ''} ${isAvailable ? 'bg-indigo-600 shadow-[0_0_15px_rgba(79,70,229,0.4)]' : 'bg-slate-700'}`}
                             >
                                <span className={`inline-block h-6 w-6 transform rounded-full bg-white transition-all duration-300 ${isAvailable ? 'translate-x-7' : 'translate-x-1'}`} />
                             </button>
                        </div>
                    </div>
                </div>

                <div className="bg-slate-900/40 backdrop-blur-xl p-6 rounded-[2rem] border border-slate-800/60 shadow-2xl">
                    <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
                        <div className="flex items-start gap-4">
                            <div className="p-3 rounded-2xl bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                                <Smartphone size={22} />
                            </div>
                            <div>
                                <p className="text-[0.65rem] font-black text-indigo-400 uppercase tracking-[0.25em] mb-2">
                                    Driver App
                                </p>
                                <h2 className="text-xl font-black text-white">Install the Android driver app</h2>
                                <p className="text-slate-400 text-sm font-medium mt-1 max-w-2xl">
                                    Use the mobile app for faster ride updates, live notifications, and driver-only actions on the go.
                                </p>
                                <p className="text-slate-500 text-xs font-medium mt-3">
                                    {isAppleDevice
                                        ? "iPhone users need a separate TestFlight link. This button currently opens the Android install page."
                                        : "This opens your Expo install page for the latest Android test build."}
                                </p>
                            </div>
                        </div>

                        <a
                            href={DRIVER_APP_INSTALL_URL}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center justify-center gap-3 bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-3 rounded-2xl font-black tracking-widest uppercase text-xs transition-all shadow-lg hover:shadow-indigo-600/30 active:scale-95 whitespace-nowrap"
                        >
                            <Download size={16} />
                            Download Driver App
                        </a>
                    </div>
                </div>

                {/* Lockout Warning */}
                {isLockedOut && (
                    <div className="group relative bg-rose-950/20 border border-rose-500/30 backdrop-blur-xl p-8 rounded-[2.5rem] overflow-hidden transition-all hover:shadow-[0_0_50px_rgba(244,63,94,0.15)] animate-pulse-subtle">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-rose-500/10 blur-[80px] group-hover:bg-rose-500/20 transition-all" />
                        <div className="flex flex-col md:flex-row items-center justify-between gap-8 relative z-10">
                            <div className="flex items-center gap-6">
                                <div className="p-4 bg-rose-500/20 rounded-[1.5rem] text-rose-400 shadow-xl border border-rose-500/30">
                                    <AlertTriangle size={32} />
                                </div>
                                <div className="text-center md:text-left">
                                    <h2 className="text-2xl font-black text-white tracking-tight uppercase">Account Restricted</h2>
                                    <p className="text-rose-200/60 font-medium mt-1">Settle your debt of ₹{Math.abs(walletBalance).toFixed(2)} to start accepting rides again.</p>
                                </div>
                            </div>
                            <button 
                                onClick={handleWalletRecharge}
                                className="group flex items-center gap-3 bg-rose-600 hover:bg-rose-500 text-white px-8 py-4 rounded-[1.5rem] font-black tracking-widest uppercase text-sm transition-all shadow-lg hover:shadow-rose-600/30 active:scale-95 whitespace-nowrap"
                            >
                                <Zap size={18} fill="currentColor" /> Resolve Account
                            </button>
                        </div>
                    </div>
                )}

                {/* Earnings Coach */}
                <div className="bg-slate-900/40 border border-slate-800/50 rounded-[2rem] p-6 mb-8">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                        <div>
                            <h3 className="text-xl font-black text-white mb-1">Strategic Optimizer</h3>
                            <p className="text-slate-500 text-xs font-medium uppercase tracking-widest">AI-Driven Earnings Growth</p>
                        </div>
                        <div className="flex items-center gap-4">
                            <select 
                                value={coachGoal}
                                onChange={(e) => setCoachGoal(e.target.value)}
                                className="bg-slate-950 border border-slate-800 text-white text-[0.65rem] font-black uppercase tracking-widest px-4 py-3 rounded-xl outline-none"
                            >
                                <option value="maximize earnings">Maximize Earnings</option>
                                <option value="optimize efficiency">Optimize Efficiency</option>
                                <option value="balanced growth">Balanced Growth</option>
                            </select>
                            <button 
                                onClick={generateCoachPlan}
                                disabled={coachLoading}
                                className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-8 py-3 rounded-xl font-black tracking-widest uppercase text-[0.65rem] transition-all flex items-center gap-2"
                            >
                                {coachLoading ? <RefreshCcw size={14} className="animate-spin" /> : <Zap size={14} fill="currentColor" />}
                                Analyze
                            </button>
                        </div>
                    </div>
                </div>

                {coachError && (
                    <div className="bg-rose-500/10 border border-rose-500/20 p-4 rounded-2xl text-rose-400 flex items-center gap-3 mb-6 text-sm font-bold">
                        <XCircle size={18} />
                        <p>{coachError}</p>
                    </div>
                )}
                {coachPlan ? (
                    <div className="bg-slate-950/30 border border-slate-800/40 rounded-[2.5rem] p-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <div className="mb-8">
                            <div className="flex items-center gap-2 mb-4">
                                <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
                                <span className="text-[0.65rem] font-black text-indigo-400 uppercase tracking-widest">Growth Strategy Optimized</span>
                            </div>
                            <p className="text-slate-200 text-lg font-medium leading-relaxed">
                                {coachPlan.summary || coachPlan.notes || "High performance strategy generated for your current shift."}
                            </p>
                        </div>

                        <div className="space-y-4 mb-8">
                            {coachPlan.actions?.map((act, i) => (
                                <div key={i} className="flex gap-4 p-5 bg-slate-900/40 border border-slate-800/30 rounded-2xl">
                                    <div className="flex-shrink-0 w-8 h-8 bg-indigo-500/10 rounded-lg flex items-center justify-center text-indigo-400 font-bold text-xs border border-indigo-500/20">
                                        {act.at || `0${i + 1}`}
                                    </div>
                                    <div>
                                        <h5 className="text-white font-bold text-sm mb-1">{act.title || "Strategic Reminder"}</h5>
                                        <p className="text-slate-500 text-xs font-medium leading-tight">{act.description || act.message}</p>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {coachPlan.best_hours?.length > 0 && (
                            <div className="mb-8 pt-6 border-t border-slate-800/50">
                                <div className="flex items-center gap-2 mb-4">
                                    <Zap size={14} className="text-indigo-400" />
                                    <span className="text-[0.65rem] font-black text-slate-500 uppercase tracking-widest">Peak Demand Windows</span>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    {coachPlan.best_hours.map((hour, i) => (
                                        <div key={i} className="bg-slate-900/40 border border-slate-800/30 p-4 rounded-2xl flex flex-col gap-1">
                                            <div className="flex items-center justify-between">
                                                <span className="text-white font-black text-sm">{hour.start_hour}:00 - {hour.end_hour}:00</span>
                                                <div className="w-6 h-6 bg-emerald-500/10 rounded-lg flex items-center justify-center text-emerald-400">
                                                    <ArrowUpRight size={14} />
                                                </div>
                                            </div>
                                            <p className="text-slate-500 text-[0.6rem] font-bold uppercase tracking-tight leading-tight">{hour.reason}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {coachPlan.hotspots?.length > 0 && (
                            <div className="mb-8 pt-6 border-t border-slate-800/50">
                                <div className="flex items-center gap-2 mb-4">
                                    <Navigation size={14} className="text-indigo-400" />
                                    <span className="text-[0.65rem] font-black text-slate-500 uppercase tracking-widest">Recommended Demand Zones</span>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {coachPlan.hotspots.map((spot, i) => (
                                        <div key={i} className="px-4 py-2 bg-indigo-500/5 border border-indigo-500/10 rounded-xl text-slate-300 text-xs font-bold transition-all hover:bg-indigo-500/10 hover:border-indigo-500/20">
                                            {spot}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="flex items-center justify-between pt-6 border-t border-slate-800/50">
                            <button 
                                onClick={() => setCoachPlan(null)}
                                className="text-[0.6rem] font-black text-slate-500 hover:text-white uppercase tracking-widest transition-colors"
                            >
                                Dismiss Plan
                            </button>
                            <button 
                                onClick={applyCoachActions}
                                disabled={applyLoading}
                                className="bg-white text-slate-950 px-8 py-4 rounded-xl font-black tracking-widest uppercase text-[0.65rem] transition-all hover:scale-105 active:scale-95 flex items-center gap-2"
                            >
                                {applyLoading ? <RefreshCcw className="animate-spin" size={14} /> : <CheckCircle size={14} />}
                                Schedule Actions
                            </button>
                        </div>
                    </div>
                ) : reminders.length > 0 ? (
                    <div className="space-y-4">
                        <div className="flex items-center justify-between px-2 mb-2">
                             <h3 className="text-[0.65rem] font-black text-slate-500 uppercase tracking-widest">Active Schedule</h3>
                             <div className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 rounded-md text-[0.55rem] font-black uppercase tracking-wider border border-emerald-500/20">Live</div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {reminders.map(rem => (
                                <div key={rem.id} className="bg-slate-900/20 border border-slate-800/40 p-4 rounded-2xl flex items-center justify-between gap-4">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-slate-900 rounded-xl text-slate-500">
                                            <Calendar size={14} />
                                        </div>
                                        <div>
                                            <p className="text-slate-300 text-xs font-bold leading-tight line-clamp-1">{rem.message}</p>
                                            <p className="text-[0.55rem] font-bold text-slate-600 uppercase tracking-widest mt-0.5">{formatDateTime(rem.remind_at)}</p>
                                        </div>
                                    </div>
                                    <div className={`flex-shrink-0 w-2 h-2 rounded-full ${rem.status === 'sent' ? 'bg-indigo-500' : 'bg-slate-700'}`} />
                                </div>
                            ))}
                        </div>
                    </div>
                ) : (
                    <div className="py-20 text-center bg-slate-950/20 rounded-[3rem] border border-dashed border-slate-800/50">
                        <div className="w-16 h-16 bg-slate-900 rounded-2xl flex items-center justify-center text-slate-700 mx-auto mb-6">
                            <Brain size={32} strokeWidth={1.5} />
                        </div>
                        <h3 className="text-lg font-black text-white mb-2">Ready for Strategy</h3>
                        <p className="text-slate-500 text-xs max-w-[240px] mx-auto font-medium">Click analyze to generate a growth plan based on your recent activity.</p>
                    </div>
                )}

                {/* Fleet Management Area */}
                <div className="space-y-8">
                    <div className="flex items-center justify-between px-4">
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-indigo-500/10 rounded-2xl border border-indigo-500/20 text-indigo-400">
                                <Car size={24} />
                            </div>
                            <h2 className="text-3xl font-black text-white tracking-tight">Fleet Intelligence</h2>
                        </div>
                        <button 
                            onClick={() => setShowAddModal(true)}
                            className="flex items-center gap-3 bg-slate-900/60 hover:bg-slate-800 border border-slate-800 text-white px-6 py-3 rounded-2xl font-black text-sm transition-all group active:scale-95"
                        >
                            <Plus size={20} className="text-indigo-400 group-hover:scale-125 transition-transform" /> Register Asset
                        </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        {loading ? (
                             <div className="col-span-full py-32 flex flex-col items-center justify-center gap-6 opacity-50 grayscale">
                                <div className="w-16 h-16 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
                                <span className="text-[0.65rem] font-black text-slate-500 uppercase tracking-widest">Synchronizing Database...</span>
                             </div>
                        ) : vehicles.length === 0 ? (
                            <div className="col-span-full bg-slate-900/40 backdrop-blur-xl border-2 border-dashed border-slate-800 rounded-[3rem] p-20 text-center group hover:border-indigo-500/30 transition-all duration-500">
                                <div className="w-24 h-24 bg-slate-950 border border-slate-800 rounded-[2rem] flex items-center justify-center text-slate-800 mx-auto mb-8 group-hover:scale-110 group-hover:text-indigo-400 transition-all duration-500">
                                    <Car size={52} strokeWidth={1} />
                                </div>
                                <h3 className="text-3xl font-black text-white mb-4">No Assets Registered</h3>
                                <p className="text-slate-500 max-w-md mx-auto font-medium mb-10 leading-relaxed text-lg">Your fleet is currently empty. Start onboarded your first vehicle to begin earning on the platform.</p>
                                <button 
                                    onClick={() => setShowAddModal(true)}
                                    className="px-10 py-5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-[1.8rem] font-black tracking-widest uppercase text-sm transition-all shadow-xl active:scale-95"
                                >
                                    Initialize Onboarding
                                </button>
                            </div>
                        ) : (
                            vehicles.map(vehicle => (
                                <div key={vehicle.id} className="group bg-slate-900/40 backdrop-blur-xl rounded-[2.5rem] border border-white/5 hover:border-indigo-500/30 transition-all duration-500 overflow-hidden shadow-2xl hover:shadow-indigo-500/10">
                                    <div className="relative h-60 bg-slate-950/80 overflow-hidden">
                                        {vehicle.vehicle_image ? (
                                            <img 
                                                src={vehicle.vehicle_image} 
                                                alt={vehicle.vehicle_model_name}
                                                className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700 opacity-80 group-hover:opacity-100"
                                            />
                                        ) : (
                                            <div className="w-full h-full flex flex-col items-center justify-center text-slate-800 gap-4">
                                                <Car size={64} strokeWidth={1} />
                                                <span className="text-[0.6rem] font-black uppercase tracking-[0.3em]">No Preview Interface</span>
                                            </div>
                                        )}
                                        
                                        <div className="absolute top-6 right-6">
                                            <div className={`px-5 py-2 rounded-2xl text-[0.65rem] font-black uppercase tracking-widest backdrop-blur-md border shadow-2xl transition-all duration-500 ${
                                                vehicle.status === 'approved' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' :
                                                vehicle.status === 'rejected' ? 'bg-rose-500/20 text-rose-400 border-rose-500/30' :
                                                'bg-amber-500/20 text-amber-400 border-amber-500/30'
                                            }`}>
                                                {vehicle.status}
                                            </div>
                                        </div>

                                        {vehicle.is_primary && (
                                            <div className="absolute bottom-6 left-6 bg-indigo-600 text-white text-[0.65rem] px-5 py-2 rounded-2xl font-black uppercase tracking-widest shadow-xl shadow-indigo-600/30">
                                                Primary Asset
                                            </div>
                                        )}
                                    </div>

                                    <div className="p-10">
                                        <div className="flex justify-between items-start mb-8">
                                            <div>
                                                <h3 className="text-2xl font-black text-white tracking-tight group-hover:text-indigo-400 transition-colors">
                                                    {vehicle.vehicle_brand_name} <span className="text-slate-600 font-medium opacity-50">/</span> {vehicle.vehicle_model_name}
                                                </h3>
                                                <div className="flex items-center gap-3 mt-2">
                                                    <span className="text-[0.7rem] font-black text-indigo-400/80 uppercase tracking-widest">{vehicle.vehicle_category_name}</span>
                                                    <div className="w-1.5 h-1.5 rounded-full bg-slate-800" />
                                                    <span className="text-[0.75rem] font-mono text-slate-500 font-bold tracking-tighter uppercase">{vehicle.registration_number}</span>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 gap-4">
                                            {vehicle.rc_document ? (
                                                <a href={vehicle.rc_document} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-3 bg-slate-950/50 border border-slate-800 rounded-2xl py-4 text-xs font-black text-slate-500 hover:text-white hover:bg-slate-800 hover:border-indigo-500/30 transition-all">
                                                    <FileText size={18} className="text-indigo-500" /> View RC
                                                </a>
                                            ) : (
                                                <div className="flex items-center justify-center gap-3 bg-slate-950/20 border border-slate-800/20 rounded-2xl py-4 text-xs font-black text-slate-700 cursor-not-allowed">
                                                    No RC Link
                                                </div>
                                            )}
                                            {vehicle.insurance_document && (
                                                <a href={vehicle.insurance_document} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-3 bg-slate-950/50 border border-slate-800 rounded-2xl py-4 text-xs font-black text-slate-500 hover:text-white hover:bg-slate-800 hover:border-indigo-500/30 transition-all">
                                                    <FileText size={18} className="text-indigo-500" /> Insurance
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
                <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-2xl z-[100] flex items-center justify-center p-6 animate-in fade-in duration-300">
                    <div className="bg-slate-900 shadow-[0_0_100px_rgba(79,70,229,0.15)] border border-white/5 rounded-[3rem] w-full max-w-2xl max-h-[90vh] overflow-hidden relative">
                        {/* Decorative modal gradient */}
                        <div className="absolute top-0 right-0 w-80 h-80 bg-indigo-600/10 blur-[100px] pointer-events-none" />
                        
                        <div className="p-10 border-b border-slate-800 flex justify-between items-center sticky top-0 bg-slate-900/50 backdrop-blur-xl z-10">
                            <div>
                                <h2 className="text-3xl font-black text-white tracking-tight leading-none">Register Vehicle</h2>
                                <p className="text-slate-500 text-[0.65rem] font-bold uppercase tracking-[0.2em] mt-2">New Asset Integration Phase</p>
                            </div>
                            <button 
                                onClick={() => setShowAddModal(false)}
                                className="p-4 hover:bg-slate-800 rounded-3xl transition-all text-slate-500 hover:text-white border border-transparent hover:border-slate-700"
                            >
                                <XCircle size={32} />
                            </button>
                        </div>

                        <div className="p-10 overflow-y-auto max-h-[calc(90vh-160px)] custom-scrollbar">
                            {error && (
                                <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 p-6 rounded-3xl mb-10 flex items-center gap-4 animate-shake">
                                    <XCircle size={24} />
                                    <p className="text-sm font-bold tracking-wide uppercase">{error}</p>
                                </div>
                            )}

                            <form onSubmit={handleSubmit} className="space-y-12">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                    <div className="space-y-4">
                                        <label className="block text-[0.65rem] font-black text-slate-500 uppercase tracking-widest ml-1">Asset Category</label>
                                        <select 
                                            name="vehicle_category"
                                            value={form.vehicle_category}
                                            onChange={handleChange}
                                            className="w-full bg-slate-950/50 border border-slate-800 text-white rounded-2xl py-5 px-6 focus:border-indigo-500/50 focus:ring-0 transition-all appearance-none outline-none font-bold"
                                        >
                                            <option value="" className="bg-slate-900">Select...</option>
                                            {categories.map(cat => <option key={cat.id} value={cat.id} className="bg-slate-900">{cat.name}</option>)}
                                        </select>
                                    </div>

                                    <div className="space-y-4">
                                        <label className="block text-[0.65rem] font-black text-slate-500 uppercase tracking-widest ml-1">Manufacturer</label>
                                        <select 
                                            name="vehicle_brand"
                                            value={form.vehicle_brand}
                                            onChange={handleChange}
                                            disabled={!form.vehicle_category}
                                            className="w-full bg-slate-950/50 border border-slate-800 text-white rounded-2xl py-5 px-6 focus:border-indigo-500/50 focus:ring-0 transition-all appearance-none outline-none font-bold disabled:opacity-30"
                                        >
                                            <option value="" className="bg-slate-900">Select...</option>
                                            {brands.map(brand => <option key={brand.id} value={brand.id} className="bg-slate-900">{brand.name}</option>)}
                                        </select>
                                    </div>

                                    <div className="space-y-4">
                                        <label className="block text-[0.65rem] font-black text-slate-500 uppercase tracking-widest ml-1">Model Variant</label>
                                        <select 
                                            name="vehicle_model"
                                            value={form.vehicle_model}
                                            onChange={handleChange}
                                            disabled={!form.vehicle_brand}
                                            className="w-full bg-slate-950/50 border border-slate-800 text-white rounded-2xl py-5 px-6 focus:border-indigo-500/50 focus:ring-0 transition-all appearance-none outline-none font-bold disabled:opacity-30"
                                        >
                                            <option value="" className="bg-slate-900">Select...</option>
                                            {models.map(model => <option key={model.id} value={model.id} className="bg-slate-900">{model.name}</option>)}
                                        </select>
                                    </div>

                                    <div className="space-y-4">
                                        <label className="block text-[0.65rem] font-black text-slate-500 uppercase tracking-widest ml-1">Registry/License Plate</label>
                                        <input 
                                            type="text"
                                            name="registration_number"
                                            placeholder="Ex: KL-01-AB-1234"
                                            onChange={handleChange}
                                            className="w-full bg-slate-950/50 border border-slate-800 text-white rounded-2xl py-5 px-6 focus:border-indigo-500/50 focus:ring-0 transition-all outline-none font-mono font-bold placeholder:text-slate-700"
                                        />
                                    </div>

                                    <div className="md:col-span-2 pt-8 border-t border-slate-800/50">
                                        <div className="flex items-center gap-4 mb-8">
                                            <FileText size={20} className="text-indigo-400" />
                                            <h3 className="text-lg font-black text-white uppercase tracking-tighter italic">Document Verification Required</h3>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                            <div className="space-y-3 p-6 bg-slate-950/30 rounded-3xl border border-slate-800/50 group hover:border-indigo-500/30 transition-all">
                                                <label className="block text-[0.6rem] font-black text-slate-500 uppercase tracking-widest">Asset Photo</label>
                                                <input type="file" name="vehicle_image" onChange={handleChange} className="w-full text-[0.6rem] text-slate-400 file:bg-indigo-600/10 file:border-0 file:text-indigo-400 file:px-4 file:py-2 file:rounded-xl file:cursor-pointer hover:file:bg-indigo-600 hover:file:text-white transition-all" />
                                            </div>
                                            <div className="space-y-3 p-6 bg-slate-950/30 rounded-3xl border border-slate-800/50 group hover:border-indigo-500/30 transition-all">
                                                <label className="block text-[0.6rem] font-black text-slate-500 uppercase tracking-widest">RC Document</label>
                                                <input type="file" name="rc_document" onChange={handleChange} className="w-full text-[0.6rem] text-slate-400 file:bg-indigo-600/10 file:border-0 file:text-indigo-400 file:px-4 file:py-2 file:rounded-xl file:cursor-pointer hover:file:bg-indigo-600 hover:file:text-white transition-all" />
                                            </div>
                                            <div className="space-y-3 p-6 bg-slate-950/30 rounded-3xl border border-slate-800/50 group hover:border-indigo-500/30 transition-all">
                                                <label className="block text-[0.6rem] font-black text-slate-500 uppercase tracking-widest">Insurance Policy</label>
                                                <input type="file" name="insurance_document" onChange={handleChange} className="w-full text-[0.6rem] text-slate-400 file:bg-indigo-600/10 file:border-0 file:text-indigo-400 file:px-4 file:py-2 file:rounded-xl file:cursor-pointer hover:file:bg-indigo-600 hover:file:text-white transition-all" />
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="pt-10">
                                    <button 
                                        type="submit"
                                        disabled={submitting}
                                        className="w-full bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white py-6 rounded-3xl font-black text-lg tracking-widest uppercase transition-all shadow-[0_0_40px_rgba(79,70,229,0.3)] hover:shadow-[0_0_60px_rgba(79,70,229,0.4)] disabled:opacity-50 active:scale-[0.98]"
                                    >
                                        {submitting ? "Uploading Strategy..." : "Initialize Asset Registration"}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
