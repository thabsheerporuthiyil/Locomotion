// Foreground notifications
import { initializeApp } from "firebase/app";
import { getMessaging, getToken, onMessage } from "firebase/messaging";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "",
};

const firebaseVapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY || "";
const hasFirebaseMessagingConfig =
  Object.values(firebaseConfig).every(Boolean) && Boolean(firebaseVapidKey);

const app = hasFirebaseMessagingConfig ? initializeApp(firebaseConfig) : null;
const messaging = app ? getMessaging(app) : null;

export const requestFirebaseNotificationPermission = () => {
  return new Promise((resolve, reject) => {
    if (!messaging || !firebaseVapidKey || typeof Notification === "undefined") {
      resolve(null);
      return;
    }

    Notification.requestPermission().then((permission) => {
      if (permission === "granted") {
        console.log("Notification permission granted.");

        const tokenPromise =
          "serviceWorker" in navigator
            ? navigator.serviceWorker.ready.then((serviceWorkerRegistration) =>
                getToken(messaging, {
                  vapidKey: firebaseVapidKey,
                  serviceWorkerRegistration,
                }),
              )
            : getToken(messaging, { vapidKey: firebaseVapidKey });

        tokenPromise
          .then((currentToken) => {
            if (currentToken) {
              resolve(currentToken);
            } else {
              console.log(
                "No registration token available. Request permission to generate one.",
              );
              resolve(null);
            }
          })
          .catch((err) => {
            console.log("An error occurred while retrieving token.", err);
            reject(err);
          });
      } else {
        console.log("Unable to get permission to notify.");
        resolve(null);
      }
    });
  });
};

export const onMessageListener = (callback) => {
  if (!messaging) {
    return () => {};
  }

  return onMessage(messaging, (payload) => {
    callback(payload);
  });
};
