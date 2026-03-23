import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from "react-router-dom";
import { GoogleOAuthProvider } from "@react-oauth/google";
import App from './App.jsx'

if ("serviceWorker" in navigator) {
  const apiKey = import.meta.env.VITE_FIREBASE_API_KEY || "";
  navigator.serviceWorker.register(
    `/firebase-messaging-sw.js?apiKey=${encodeURIComponent(apiKey)}`,
  );
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <GoogleOAuthProvider clientId="1068487642544-la6amm7hgtjo6bkr69lv27ajn28c0ruc.apps.googleusercontent.com">
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </GoogleOAuthProvider>
  </StrictMode>,
)
