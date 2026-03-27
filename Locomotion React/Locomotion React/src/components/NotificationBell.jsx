import { useState, useRef, useEffect } from "react";
import { Bell, Trash2, Clock } from "lucide-react";
import { useNotificationStore } from "../store/notificationStore";
import api from "../api/axios";
import { onMessageListener } from "../firebase";

export default function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);
  const refreshTimeoutRef = useRef(null);
  const {
    notifications,
    unreadCount,
    addNotification,
    fetchNotifications,
    markAllAsRead,
    clearNotifications,
  } = useNotificationStore();

  useEffect(() => {
    fetchNotifications(api);
    // Fallback polling (FCM is primary). Keep light to avoid backend load.
    const interval = setInterval(() => fetchNotifications(api), 120000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  const scheduleRefresh = () => {
    if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current);
    refreshTimeoutRef.current = setTimeout(() => {
      fetchNotifications(api);
    }, 800);
  };

  useEffect(() => {
    // Foreground messages (tab is open)
    const unsubscribe = onMessageListener((payload) => {
      const title =
        payload?.notification?.title ||
        payload?.data?.title ||
        "Locomotion Update";
      const body =
        payload?.notification?.body ||
        payload?.data?.body ||
        "You have a new update.";

      const hasDedupeKey = payload?.data?.message_id || payload?.data?.ride_id;
      const dedupeKey = hasDedupeKey
        ? `${payload?.data?.type || "update"}:${payload?.data?.ride_id || ""}:${payload?.data?.status || ""}:${payload?.data?.message_id || ""}`
        : null;

      addNotification({
        title,
        body,
        data: payload?.data || {},
        dedupeKey,
      });
      scheduleRefresh();
    });

    return () => {
      if (typeof unsubscribe === "function") unsubscribe();
      if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current);
    };
  }, [addNotification, fetchNotifications]);

  useEffect(() => {
    // Background messages (service worker) => BroadcastChannel -> page
    if (typeof window === "undefined" || !("BroadcastChannel" in window)) return;

    const channel = new BroadcastChannel("locomotion-fcm-channel");
    const handler = (event) => {
      const payload = event?.data;
      if (!payload) return;

      const title =
        payload?.notification?.title ||
        payload?.data?.title ||
        "Locomotion Update";
      const body =
        payload?.notification?.body ||
        payload?.data?.body ||
        "You have a new update.";

      const hasDedupeKey = payload?.data?.message_id || payload?.data?.ride_id;
      const dedupeKey = hasDedupeKey
        ? `${payload?.data?.type || "update"}:${payload?.data?.ride_id || ""}:${payload?.data?.status || ""}:${payload?.data?.message_id || ""}`
        : null;

      addNotification({
        title,
        body,
        data: payload?.data || {},
        dedupeKey,
      });
      scheduleRefresh();
    };

    channel.addEventListener("message", handler);
    return () => {
      channel.removeEventListener("message", handler);
      channel.close();
    };
  }, [addNotification, fetchNotifications]);

  const toggleDropdown = () => {
    const nextOpen = !isOpen;
    setIsOpen(nextOpen);

    if (nextOpen) {
      fetchNotifications(api);
      // Real-world UX: opening the panel counts as "seen"
      if (unreadCount > 0) markAllAsRead(api);
    }
  };

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const formatDate = (isoString) => {
    const date = new Date(isoString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell Icon Button */}
      <button
        onClick={toggleDropdown}
        className="relative p-2 rounded-full text-slate-600 hover:text-indigo-600 hover:bg-slate-100 transition-colors focus:outline-none"
      >
        <Bell size={24} />
        {unreadCount > 0 && (
          <span className="absolute top-1.5 right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white ring-2 ring-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Panel */}
      {isOpen && (
          <div className="absolute right-0 mt-3 w-80 sm:w-96 bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden z-50 transform origin-top-right transition-all">
          <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
            <h3 className="font-bold text-slate-900">Notifications</h3>
            <div className="flex gap-2 text-xs font-semibold">
              <button
                onClick={() => clearNotifications(api)}
                className="text-slate-400 hover:text-red-500 flex items-center gap-1 transition-colors"
                disabled={notifications.length === 0}
              >
                <Trash2 size={14} /> Clear all
              </button>
            </div>
          </div>

          <div className="max-h-[400px] overflow-y-auto overflow-x-hidden scrollbar-thin scrollbar-thumb-slate-200">
            {notifications.length === 0 ? (
              <div className="p-10 text-center">
                <div className="bg-slate-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-300">
                  <Bell size={32} />
                </div>
                <p className="text-slate-500 font-medium">No notifications yet</p>
                <p className="text-slate-400 text-xs mt-1">Updates about your rides will appear here</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {notifications.map((notif) => (
                  <div
                    key={notif.id}
                    className={`p-4 hover:bg-slate-50 transition-colors relative group ${
                      !notif.read ? "bg-indigo-50/30" : ""
                    }`}
                  >
                    <div className="flex justify-between items-start gap-3">
                      <div className="flex-1">
                        <h4 className={`text-sm font-semibold mb-1 ${
                          !notif.read ? "text-indigo-950" : "text-slate-700"
                        }`}>
                          {notif.title}
                        </h4>
                        <p className="text-sm text-slate-500 leading-relaxed">
                          {notif.body}
                        </p>
                        <div className="mt-2 flex items-center gap-1.5 text-[10px] font-medium text-slate-400 uppercase tracking-wider">
                          <Clock size={10} />
                          {formatDate(notif.timestamp)}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {notifications.length > 0 && (
            <div className="p-3 border-t border-slate-100 text-center bg-slate-50/50">
              <button className="text-xs font-bold text-slate-500 hover:text-indigo-600 transition-colors">
                View All Activity
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
