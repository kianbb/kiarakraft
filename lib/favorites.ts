'use client';

const STORAGE_KEY = 'kk:favorites:v1';
const EVENT_NAME = 'favorites:updated';

export function getFavorites(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? (arr as string[]) : [];
  } catch {
    return [];
  }
}

export function setFavorites(ids: string[]) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(Array.from(new Set(ids)))
    );
    window.dispatchEvent(new Event(EVENT_NAME));
  } catch {
    // ignore
  }
}

export function isFavorite(productId: string): boolean {
  return getFavorites().includes(productId);
}

export function toggleFavorite(productId: string): boolean {
  if (typeof window === 'undefined') return false;
  const current = new Set(getFavorites());
  if (current.has(productId)) {
    current.delete(productId);
  } else {
    current.add(productId);
  }
  setFavorites(Array.from(current));
  return current.has(productId);
}

export function onFavoritesUpdated(handler: () => void) {
  if (typeof window === 'undefined') return () => {};
  const cb = () => handler();
  window.addEventListener(EVENT_NAME, cb);
  return () => window.removeEventListener(EVENT_NAME, cb);
}
