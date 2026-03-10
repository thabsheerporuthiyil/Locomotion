// Foreground Notifications

// getToken → generates a unique browser/device token
// onMessage → listens for notifications when website is open
import { initializeApp } from "firebase/app";
import { getMessaging, getToken, onMessage } from "firebase/messaging";


// Firebase project configuration 
const firebaseConfig = {
  apiKey: "AIzaSyD9Oje6HSMxBdwbEWnAXOzG0iJtx4pZ0d",
  authDomain: "locomotion-7c62d.firebaseapp.com",
  projectId: "locomotion-7c62d",
  storageBucket: "locomotion-7c62d.firebasestorage.app",
  messagingSenderId: "1096933293116",
  appId: "1:1096933293116:web:efccdba3f0414a029d5739"
};


const app = initializeApp(firebaseConfig);

// Initialize Firebase Cloud Messaging service
const messaging = getMessaging(app);

// Function to request notification permission from the browser
// and generate an FCM token for this browser/device
export const requestFirebaseNotificationPermission = () => {
  return new Promise((resolve, reject) => {

    // Ask the user for notification permission
    Notification.requestPermission().then((permission) => {

      // If user clicks "Allow"
      if (permission === 'granted') {

        console.log('Notification permission granted.');
        getToken(messaging, {
          vapidKey: 'BKWoCwvan93p_UQsHHs06SMebk35MMcR898Pyv3J0d25VTY1c2uaMKNhcgPMH3rWvYo-p0ivGO4G8GGK1iUdicQ'
        })

        .then((currentToken) => {
          // If token successfully generated
          if (currentToken) {
            // Return token so React app can send it to backend
            resolve(currentToken);

          } else {
            // Token generation failed (rare case)
            console.log('No registration token available. Request permission to generate one.');
            resolve(null);

          }
        })

        .catch((err) => {

          // Error while generating token
          console.log('An error occurred while retrieving token. ', err);
          reject(err);

        });

      } else {

        // User denied notification permission
        console.log('Unable to get permission to notify.');
        resolve(null);

      }
    });
  });
};

// Function to listen for notifications when the website is OPEN
// This handles "foreground notifications"
export const onMessageListener = (callback) => {

  // onMessage triggers when Firebase sends a message to the active page
  return onMessage(messaging, (payload) => {

    // Pass the received message to the callback function
    callback(payload);

  });
};