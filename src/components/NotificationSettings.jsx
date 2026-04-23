import { useState, useEffect } from 'react';
import { HiOutlineBell } from 'react-icons/hi';
import { API_ENDPOINTS } from '../services/api';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

const NotificationSettings = () => {
  const [permission, setPermission] = useState(Notification.permission);
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    checkSubscription();
  }, []);

  const checkSubscription = async () => {
    const token = localStorage.getItem('token') || sessionStorage.getItem('token');
    if (!token) return;
  };

  const subscribe = async () => {
    if (permission !== 'granted') {
      const result = await Notification.requestPermission();
      setPermission(result);
      if (result !== 'granted') return;
    }

    setLoading(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(import.meta.env.VITE_VAPID_PUBLIC_KEY)
      });

      const token = localStorage.getItem('token') || sessionStorage.getItem('token');
      const res = await fetch(API_ENDPOINTS.NOTIFICATIONS.SUBSCRIBE, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(subscription)
      });

      if (res.ok) setSubscribed(true);
    } catch (err) {
      console.error('Subscription failed:', err);
    } finally {
      setLoading(false);
    }
  };

  const unsubscribe = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token') || sessionStorage.getItem('token');
      await fetch(API_ENDPOINTS.NOTIFICATIONS.UNSUBSCRIBE, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      setSubscribed(false);
    } catch (err) {
      console.error('Unsubscribe failed:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
      <div className="flex items-center gap-2">
        <HiOutlineBell className="w-5 h-5 text-gray-600" />
        <span className="text-sm font-medium">Push Notifications</span>
      </div>
      {permission === 'granted' ? (
        <button
          onClick={subscribed ? unsubscribe : subscribe}
          disabled={loading}
          className={`px-3 py-1 rounded-full text-xs font-semibold ${
            subscribed
              ? 'border border-emerald-600 text-emerald-600'
              : 'bg-emerald-600 text-white'
          } disabled:opacity-50`}
        >
          {loading ? '...' : subscribed ? 'Disable' : 'Enable'}
        </button>
      ) : (
        <button
          onClick={subscribe}
          disabled={loading}
          className="px-3 py-1 rounded-full text-xs font-semibold bg-emerald-600 text-white disabled:opacity-50"
        >
          {loading ? '...' : 'Allow'}
        </button>
      )}
    </div>
  );
};

export default NotificationSettings;
