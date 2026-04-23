import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { AuthProvider } from "./context/AuthContext";
import ErrorBoundary from "./components/ErrorBoundary";
import "./index.css";


ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <AuthProvider>
        <App />
      </AuthProvider>
    </ErrorBoundary>
  </React.StrictMode>
);

// Service worker disabled for stability
if ('serviceWorker' in navigator) {
  try {
    navigator.serviceWorker.getRegistrations().then(registrations => {
      registrations.forEach(reg => {
        reg.unregister().catch(() => {
          console.log('Service Worker already unregistered or invalid state');
        });
      });
      console.log('Service Workers unregistered for stability');
    }).catch(() => {
      console.log('Service Worker registration check failed - continuing');
    });
  } catch (error) {
    console.log('Service Worker handling failed - continuing');
  }
}