/* global firebase, importScripts */

// Service worker for background notifications.
importScripts("https://www.gstatic.com/firebasejs/10.9.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.9.0/firebase-messaging-compat.js");

const params = new URL(self.location.href).searchParams;
const firebaseConfig = {
  apiKey: params.get("apiKey") || "",
  authDomain: params.get("authDomain") || "",
  projectId: params.get("projectId") || "",
  storageBucket: params.get("storageBucket") || "",
  messagingSenderId: params.get("messagingSenderId") || "",
  appId: params.get("appId") || "",
};

if (Object.values(firebaseConfig).every(Boolean)) {
  firebase.initializeApp(firebaseConfig);

  const messaging = firebase.messaging();

  messaging.onBackgroundMessage((payload) => {
    console.log("[firebase-messaging-sw.js] Received background message", payload);

    const channel = new BroadcastChannel("locomotion-fcm-channel");
    channel.postMessage(payload);

    const notificationTitle = payload.notification?.title || "Locomotion Update";
    const notificationOptions = {
      body: payload.notification?.body || "You have a new update.",
      icon: "/vite.svg",
    };

    self.registration.showNotification(notificationTitle, notificationOptions);
  });
} else {
  console.warn("Firebase messaging service worker is missing configuration.");
}
