// Service Worker (handles notifications when website is NOT active)

// import Firebase libraries for Service Worker environment
// Service workers cannot use normal ES imports, so we use importScripts
importScripts('https://www.gstatic.com/firebasejs/10.9.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.9.0/firebase-messaging-compat.js');


const firebaseConfig = {
  apiKey: new URL(self.location.href).searchParams.get("apiKey") || "",
  authDomain: "locomotion-7c62d.firebaseapp.com",
  projectId: "locomotion-7c62d",
  storageBucket: "locomotion-7c62d.firebasestorage.app",
  messagingSenderId: "1096933293116",
  appId: "1:1096933293116:web:efccdba3f0414a029d5739"
};


// Initialize Firebase inside the service worker
firebase.initializeApp(firebaseConfig);

// Initialize Firebase Cloud Messaging inside service worker
const messaging = firebase.messaging();

// This function triggers when a push notification arrives
// and the website is in background or closed
messaging.onBackgroundMessage((payload) => {

  console.log('[firebase-messaging-sw.js] Received background message ', payload);

  // Create a communication channel between Service Worker and React app
  // This allows background notifications to update the UI when tab becomes active
  const channel = new BroadcastChannel('locomotion-fcm-channel');
  // Send the notification data to the open browser tabs
  channel.postMessage(payload);


  // Notification title (fallback if not provided)
  const notificationTitle =
    payload.notification?.title || "Locomotion Update";

  // Notification body and icon settings
  const notificationOptions = {
    body: payload.notification?.body || "You have a new update.",
    icon: '/vite.svg'
  };

  // Show browser notification (system notification popup)
  self.registration.showNotification(notificationTitle, notificationOptions);

});