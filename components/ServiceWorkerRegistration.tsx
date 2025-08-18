'use client';

import { useEffect } from 'react';

export default function ServiceWorkerRegistration() {
  useEffect(() => {
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      registerServiceWorker();
    }
  }, []);

  const registerServiceWorker = async () => {
    try {
      // Check if there's an existing registration
      const existingRegistration = await navigator.serviceWorker.getRegistration();
      
      if (existingRegistration) {
        console.log('[SW] Service Worker already registered');
        
        // Check for updates
        existingRegistration.update();
        
        // Listen for updates
        existingRegistration.addEventListener('updatefound', () => handleUpdateFound(existingRegistration));
        
        // Check if there's a waiting SW
        if (existingRegistration.waiting) {
          showUpdateAvailable(existingRegistration);
        }
        
        return;
      }

      // Register new service worker
      console.log('[SW] Registering Service Worker...');
      const registration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/',
      });

      console.log('[SW] Service Worker registered successfully:', registration.scope);

      // Handle updates
      registration.addEventListener('updatefound', () => handleUpdateFound(registration));

      // Handle controlling
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        console.log('[SW] Controller changed - reloading page');
        window.location.reload();
      });

    } catch (error) {
      console.warn('[SW] Service Worker registration failed:', error);
    }
  };

  const handleUpdateFound = (registration: ServiceWorkerRegistration) => {
    console.log('[SW] Update found');
    const newWorker = registration.installing;
    
    if (newWorker) {
      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          showUpdateAvailable(registration);
        }
      });
    }
  };

  const showUpdateAvailable = (registration: ServiceWorkerRegistration) => {
    console.log('[SW] Update available');
    
    // You can show a toast/notification here
    // For now, we'll just log it
    if (window.confirm('A new version of the app is available. Reload to update?')) {
      // Tell the waiting SW to skip waiting
      if (registration.waiting) {
        registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      }
      
      window.location.reload();
    }
  };

  // Helper function to cache important pages
  const cacheImportantPages = async () => {
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      const pagesToCache = [
        '/fa',
        '/en',
        '/fa/explore',
        '/en/explore',
        '/fa/auth/login',
        '/en/auth/login',
      ];

      navigator.serviceWorker.controller.postMessage({
        type: 'CACHE_URLS',
        payload: pagesToCache,
      });
    }
  };

  // Cache important pages after a delay
  useEffect(() => {
    const timer = setTimeout(cacheImportantPages, 5000);
    return () => clearTimeout(timer);
  }, []);

  return null; // This component doesn't render anything
}