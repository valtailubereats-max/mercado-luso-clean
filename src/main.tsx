import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Programmatically unregister any stale service workers from older sessions or other applets running on the same domain
if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    for (const registration of registrations) {
      registration.unregister().then((success) => {
        if (success) {
          console.log('[CacheCleaner] Unregistered stale service worker successfully');
        }
      });
    }
  }).catch((err) => {
    console.error('[CacheCleaner] Error finding registrations:', err);
  });
}

// Programmatically clear all browser Cache Storage buckets
if (typeof window !== 'undefined' && 'caches' in window) {
  caches.keys().then((keys) => {
    return Promise.all(keys.map((key) => {
      console.log(`[CacheCleaner] Removing stale cache: ${key}`);
      return caches.delete(key);
    }));
  }).catch((err) => {
    console.error('[CacheCleaner] Error clearing caches:', err);
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
