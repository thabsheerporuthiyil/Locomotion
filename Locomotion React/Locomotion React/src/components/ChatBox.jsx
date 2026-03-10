import React, { useState, useEffect, useRef } from "react";
import api from "../api/axios";
import { Send, X, Loader2, MessageSquare } from "lucide-react";
import { onMessageListener } from "../firebase";
export default function ChatBox({ rideId, onClose }) {
    const [messages, setMessages] = useState([]);
    const [newMessage, setNewMessage] = useState("");
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const messagesEndRef = useRef(null);
    // We determine our role based on the current URL
    const isDriverView = window.location.pathname.includes("driver");
    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };
    const fetchMessages = async () => {
        try {
            const res = await api.get(`bookings/${rideId}/chat/`);
            setMessages(res.data);
        } catch (err) {
            console.error("Failed to fetch chat history:", err);
        } finally {
            setLoading(false);
        }
    };
    useEffect(() => {
        fetchMessages();
        // 1. Listen for new chat messages specifically via FCM Foreground
        const unsubscribe = onMessageListener((payload) => {
            if (payload?.data?.type === "chat_message" && payload?.data?.ride_id === String(rideId)) {
                // Instantly inject incoming message from FCM Data Payload
                const incomingMessage = {
                    id: payload.data.message_id || Date.now(),
                    message: payload.data.message_text,
                    sender_name: payload.data.sender_name,
                    // If we received a push, the sender is the opposite of us.
                    sender_role: isDriverView ? "rider" : "driver",
                    created_at: new Date().toISOString()
                };
                setMessages(prev => {
                    // Prevent accidental duplicates if API polling hit at the same microsecond
                    if (prev.find(m => String(m.id) === String(incomingMessage.id))) return prev;
                    return [...prev, incomingMessage];
                });
                // Optional: small tick sound for new message inside the active chat
                const audio = new Audio("https://actions.google.com/sounds/v1/water/water_drop.ogg");
                audio.play().catch(e => console.log("Audio blocked"));
            }
        });
        // 2. Listen via BroadcastChannel (If App was briefly Backgrounded in Service Worker)
        const channel = new BroadcastChannel('locomotion-fcm-channel');
        channel.onmessage = (event) => {
            const payload = event.data;
            if (payload?.data?.type === "chat_message" && payload?.data?.ride_id === String(rideId)) {
                fetchMessages(); // Soft refresh history to ensure sync
            }
        };
        // 3. Fallback Polling 
        // Some browsers (like Brave) completely block Firebase Push Notifications out of the box.
        // To ensure the chat remains real-time even without FCM, we quietly poll every 3 seconds.
        const pollInterval = setInterval(() => {
            api.get(`bookings/${rideId}/chat/`)
                .then(res => {
                    setMessages(prev => {
                        // Only update state if length or a message changed to prevent excessive re-renders/scrolls
                        if (prev.length !== res.data.length || prev[prev.length - 1]?.id !== res.data[res.data.length - 1]?.id) {
                            return res.data;
                        }
                        return prev;
                    });
                })
                .catch(err => console.error("Chat sync error:", err));
        }, 3000);
        return () => {
            if (unsubscribe) unsubscribe();
            channel.close();
            clearInterval(pollInterval);
        };
    }, [rideId, isDriverView]);
    useEffect(() => {
        scrollToBottom();
    }, [messages]);
    const handleSendMessage = async (e) => {
        e.preventDefault();
        if (!newMessage.trim()) return;
        setSending(true);
        const textCache = newMessage;
        setNewMessage(""); // Optimistic clear
        try {
            const res = await api.post(`bookings/${rideId}/chat/send/`, {
                message: textCache
            });
            // We successfully saved it on backend, add to our UI immediately
            setMessages(prev => [...prev, res.data]);
        } catch (err) {
            console.error("Failed to send message:", err);
            alert("Failed to send message. Please try again.");
            setNewMessage(textCache); // Restore input on failure
        } finally {
            setSending(false);
        }
    };
    return (
        <div className="fixed bottom-4 right-4 w-80 md:w-96 bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col z-50 overflow-hidden" style={{ height: '500px', maxHeight: '80vh' }}>
            {/* Header */}
            <div className="bg-indigo-600 p-4 text-white flex justify-between items-center shadow-md z-10">
                <div className="flex items-center gap-2 font-semibold">
                    <MessageSquare size={18} />
                    <span>Ride Chat</span>
                </div>
                <button onClick={onClose} className="text-indigo-100 hover:text-white transition-colors p-1 rounded-full hover:bg-white/10">
                    <X size={20} />
                </button>
            </div>
            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-4 bg-slate-50 flex flex-col gap-3">
                {loading ? (
                    <div className="flex-1 flex justify-center items-center">
                        <Loader2 className="animate-spin text-indigo-500" />
                    </div>
                ) : messages.length === 0 ? (
                    <div className="flex-1 flex flex-col justify-center items-center text-slate-400">
                        <MessageSquare size={32} className="mb-2 opacity-30" />
                        <p className="text-sm font-medium">No messages yet</p>
                        <p className="text-xs mt-1">Send a message to coordinate pickup!</p>
                    </div>
                ) : (
                    messages.map((msg, idx) => {
                        // Check if I sent this message
                        const isMe = isDriverView ? msg.sender_role === "driver" : msg.sender_role === "rider";
                        return (
                            <div key={idx} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} animate-in fade-in slide-in-from-bottom-2 duration-300`}>
                                <span className="text-[10px] text-slate-400 font-medium px-2 mb-1">
                                    {isMe ? "You" : msg.sender_name}
                                </span>
                                <div className={`px-4 py-2 rounded-2xl max-w-[85%] shadow-sm text-sm ${isMe
                                    ? 'bg-indigo-600 text-white rounded-br-sm'
                                    : 'bg-white text-slate-800 border border-slate-100 rounded-bl-sm'
                                    }`}>
                                    {msg.message}
                                </div>
                                <span className="text-[9px] text-slate-400 mt-1 px-1">
                                    {msg.created_at ? new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "Just now"}
                                </span>
                            </div>
                        );
                    })
                )}
                <div ref={messagesEndRef} />
            </div>
            {/* Input Form */}
            <form onSubmit={handleSendMessage} className="p-3 bg-white border-t border-slate-100 flex gap-2 items-center">
                <input
                    type="text"
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    placeholder="Type a message..."
                    className="flex-1 bg-slate-100 border-transparent rounded-full px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all"
                    disabled={sending}
                />
                <button
                    type="submit"
                    disabled={!newMessage.trim() || sending}
                    className="bg-indigo-600 text-white p-2.5 rounded-full hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0 flex items-center justify-center w-10 h-10 shadow-sm"
                >
                    {sending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} className="translate-x-[1px] translate-y-[1px]" />}
                </button>
            </form>
        </div>
    );
}