'use client';

import { useSyncExternalStore } from 'react';

// Hydration has no event to subscribe to. React switches from the server
// snapshot to the browser snapshot once the component can render on the client.
const subscribe = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

export function useHydrated() {
  return useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot);
}
