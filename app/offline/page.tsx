'use client';

import { useState, useEffect } from 'react';
import { WifiOff, RefreshCw, Home, Wifi } from 'lucide-react';

// Prevent static generation since this is a client-only page
export const dynamic = 'force-dynamic';

export default function OfflinePage() {
  const [isOnline, setIsOnline] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);

  useEffect(() => {
    const updateOnlineStatus = () => {
      setIsOnline(navigator.onLine);
      if (navigator.onLine) {
        setIsRetrying(false);
      }
    };

    // Initial check
    updateOnlineStatus();

    // Listen for connection changes
    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);

    return () => {
      window.removeEventListener('online', updateOnlineStatus);
      window.removeEventListener('offline', updateOnlineStatus);
    };
  }, []);

  // Auto-refresh when back online
  useEffect(() => {
    if (isOnline && !isRetrying) {
      const timer = setTimeout(() => {
        window.location.reload();
      }, 2000);

      return () => clearTimeout(timer);
    }
  }, [isOnline, isRetrying]);

  const handleRetry = () => {
    setIsRetrying(true);
    setTimeout(() => {
      window.location.reload();
    }, 500);
  };

  const goHome = () => {
    window.location.href = '/';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-blue-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center">
        {/* Icon */}
        <div className="mb-6">
          {isOnline ? (
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto">
              <Wifi className="w-10 h-10 text-green-600" />
            </div>
          ) : (
            <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto">
              <WifiOff className="w-10 h-10 text-red-600" />
            </div>
          )}
        </div>

        {/* Content */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">
            {isOnline ? 'Back Online!' : 'You&apos;re Offline'}
          </h1>

          <p className="text-gray-600 leading-relaxed">
            {isOnline ? (
              'Your internet connection has been restored. The page will refresh shortly.'
            ) : (
              <>
                <span className="block mb-2">
                  You&apos;re currently offline. Please check your internet
                  connection.
                </span>
                <span className="text-sm text-gray-500">
                  Some cached content may still be available.
                </span>
              </>
            )}
          </p>
        </div>

        {/* Status indicator */}
        <div
          className={`mb-6 px-4 py-2 rounded-lg text-sm font-medium ${
            isOnline ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
          }`}
        >
          {isOnline ? 'Connected' : 'Disconnected'}
        </div>

        {/* Actions */}
        <div className="space-y-3">
          <button
            onClick={handleRetry}
            disabled={isRetrying}
            className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg disabled:opacity-50 hover:bg-blue-700 transition-colors"
          >
            {isRetrying ? (
              <>
                <RefreshCw className="w-4 h-4 mr-2 animate-spin inline" />
                Retrying...
              </>
            ) : (
              <>
                <RefreshCw className="w-4 h-4 mr-2 inline" />
                Try Again
              </>
            )}
          </button>

          <button
            onClick={goHome}
            className="w-full border border-gray-300 text-gray-700 py-3 px-4 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <Home className="w-4 h-4 mr-2 inline" />
            Go Home
          </button>
        </div>

        {/* Help text */}
        <div className="mt-8 text-xs text-gray-500">
          <p>Some cached content may still be available while offline.</p>
        </div>
      </div>
    </div>
  );
}
