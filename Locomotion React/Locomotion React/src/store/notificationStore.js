import { create } from "zustand";
import { persist } from "zustand/middleware";

export const useNotificationStore = create(
  persist(
    (set) => ({
      notifications: [],
      unreadCount: 0,

      addNotification: (notification) =>
        set((state) => {
          const dedupeKey = notification?.dedupeKey ?? null;
          if (dedupeKey && state.notifications.some((n) => n.dedupeKey === dedupeKey)) {
            return state;
          }

          const isRead = Boolean(notification?.read);
          return {
            notifications: [
              {
                id: notification?.id ?? dedupeKey ?? Date.now(),
                dedupeKey,
                timestamp: new Date().toISOString(),
                read: isRead,
                ...notification,
              },
              ...state.notifications.slice(0, 49), // Keep last 50
            ],
            unreadCount: isRead ? state.unreadCount : state.unreadCount + 1,
          };
        }),

      fetchNotifications: async (api) => {
        try {
          const res = await api.get("accounts/notifications/");
          const fetched = res.data.map(n => ({
            id: n.id,
            title: n.title,
            body: n.body,
            read: n.is_read,
            timestamp: n.created_at
          }));
          set({
            notifications: fetched,
            unreadCount: fetched.filter(n => !n.read).length
          });
        } catch (err) {
          console.error("Failed to fetch notifications:", err);
        }
      },

      markAsRead: (id, api) =>
        set((state) => {
          const notification = state.notifications.find((n) => n.id === id);
          if (notification && !notification.read) {
            if (api) api.post("accounts/notifications/", { id }).catch(e => console.error(e));
            return {
              notifications: state.notifications.map((n) =>
                n.id === id ? { ...n, read: true } : n
              ),
              unreadCount: Math.max(0, state.unreadCount - 1),
            };
          }
          return state;
        }),

      markAllAsRead: (api) => {
        if (api) api.post("accounts/notifications/").catch(e => console.error(e));
        set((state) => ({
          notifications: state.notifications.map((n) => ({ ...n, read: true })),
          unreadCount: 0,
        }));
      },

      clearNotifications: (api) => {
        if (api) api.delete("accounts/notifications/").catch(e => console.error(e));
        set({
          notifications: [],
          unreadCount: 0,
        });
      },
    }),
    {
      name: "notification-storage", // local storage key
    }
  )
);
