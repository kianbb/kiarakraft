'use client';

import React from 'react';

export default function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] =
    React.useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    const onBeforeInstallPrompt = (e: Event) => {
      const bip = e as unknown as BeforeInstallPromptEvent;
      e.preventDefault();
      setDeferredPrompt(bip);
      setVisible(true);
    };

    window.addEventListener(
      'beforeinstallprompt',
      onBeforeInstallPrompt as EventListener
    );

    return () => {
      window.removeEventListener(
        'beforeinstallprompt',
        onBeforeInstallPrompt as EventListener
      );
    };
  }, []);

  const onInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt?.();
    try {
      const choice = await deferredPrompt.userChoice;
      if (choice?.outcome === 'accepted') {
        setVisible(false);
      }
    } catch {
      // ignore
    } finally {
      setDeferredPrompt(null);
    }
  };

  if (!visible) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <button
        type="button"
        onClick={onInstallClick}
        className="rounded-full bg-primary text-primary-foreground px-4 py-2 shadow-lg hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="Install Kiara Kraft App"
      >
        نصب اپلیکیشن
      </button>
    </div>
  );
}

// Minimal type to quiet TS without adding a global lib
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}
