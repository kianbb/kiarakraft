'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Bell, BellOff } from 'lucide-react';

interface PushNotificationToggleProps {
  locale: string;
}

export function PushNotificationToggle({
  locale,
}: PushNotificationToggleProps) {
  const { data: session } = useSession();
  const [isSupported, setIsSupported] = useState(false);
  const [permission, setPermission] =
    useState<NotificationPermission>('default');
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [publicKey, setPublicKey] = useState<string | null>(null);

  const isRTL = locale === 'fa';

  useEffect(() => {
    // Check if push notifications are supported
    const supported =
      'serviceWorker' in navigator &&
      'PushManager' in window &&
      'Notification' in window;
    setIsSupported(supported);

    if (supported && session?.user) {
      setPermission(Notification.permission);
      checkSubscription();
      fetchPublicKey();
    }
  }, [session]);

  async function fetchPublicKey() {
    try {
      const response = await fetch('/api/push/subscribe');
      if (response.ok) {
        const data = await response.json();
        setPublicKey(data.publicKey);
      }
    } catch (error) {
      console.error('Error fetching VAPID public key:', error);
    }
  }

  async function checkSubscription() {
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      setIsSubscribed(!!subscription);
    } catch (error) {
      console.error('Error checking subscription:', error);
    }
  }

  async function requestPermission() {
    if (!isSupported || !session?.user || !publicKey) return;

    setIsLoading(true);
    try {
      const permission = await Notification.requestPermission();
      setPermission(permission);

      if (permission === 'granted') {
        await subscribe();
      }
    } catch (error) {
      console.error('Error requesting permission:', error);
    } finally {
      setIsLoading(false);
    }
  }

  async function subscribe() {
    if (!isSupported || !session?.user || !publicKey) return;

    setIsLoading(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: publicKey,
      });

      // Send subscription to server
      const response = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          endpoint: subscription.endpoint,
          keys: {
            p256dh: btoa(
              String.fromCharCode(
                ...new Uint8Array(subscription.getKey('p256dh')!)
              )
            ),
            auth: btoa(
              String.fromCharCode(
                ...new Uint8Array(subscription.getKey('auth')!)
              )
            ),
          },
        }),
      });

      if (response.ok) {
        setIsSubscribed(true);
      } else {
        console.error('Failed to save subscription');
      }
    } catch (error) {
      console.error('Error subscribing:', error);
    } finally {
      setIsLoading(false);
    }
  }

  async function unsubscribe() {
    if (!isSupported || !session?.user) return;

    setIsLoading(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        await subscription.unsubscribe();

        // Remove from server
        await fetch('/api/push/unsubscribe', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            endpoint: subscription.endpoint,
          }),
        });
      }

      setIsSubscribed(false);
    } catch (error) {
      console.error('Error unsubscribing:', error);
    } finally {
      setIsLoading(false);
    }
  }

  async function toggleSubscription() {
    if (permission === 'denied') {
      // Can't do anything if permission is denied
      return;
    }

    if (permission === 'default') {
      await requestPermission();
    } else if (isSubscribed) {
      await unsubscribe();
    } else {
      await subscribe();
    }
  }

  if (!isSupported || !session?.user || !publicKey) {
    return null;
  }

  const texts = {
    title: isRTL ? 'اعلان‌های فوری' : 'Push Notifications',
    description: isRTL
      ? 'دریافت اعلان برای تغییرات مهم سفارشات'
      : 'Receive notifications for important order updates',
    enable: isRTL ? 'فعال کردن اعلان‌ها' : 'Enable Notifications',
    denied: isRTL
      ? 'اجازه ارسال اعلان رد شده است. لطفاً از تنظیمات مرورگر اجازه دهید.'
      : 'Notification permission denied. Please enable in your browser settings.',
  };

  return (
    <div className="space-y-4 p-4 border rounded-lg">
      <div className="flex items-center gap-3">
        {isSubscribed ? (
          <Bell className="h-5 w-5 text-green-600" />
        ) : (
          <BellOff className="h-5 w-5 text-gray-400" />
        )}
        <div className="flex-1">
          <Label className="text-base font-medium">{texts.title}</Label>
          <p className="text-sm text-gray-600 mt-1">{texts.description}</p>
        </div>
      </div>

      {permission === 'denied' ? (
        <p className="text-sm text-amber-600">{texts.denied}</p>
      ) : (
        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={isSubscribed}
            onChange={toggleSubscription}
            disabled={isLoading}
            className="h-4 w-4"
          />
          {!isSubscribed && permission === 'default' && (
            <Button
              onClick={requestPermission}
              disabled={isLoading}
              size="sm"
              variant="outline"
            >
              {texts.enable}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
