// Centralized, curated image fallbacks for categories and any other assets.
// Prefer Cloudinary assets if you've uploaded them to the following paths.
// If not available, we point to stable Unsplash images that match the category.

export const CATEGORY_IMAGE_FALLBACKS: Record<string, string> = {
  // These are public, version-pinned Cloudinary URLs to ensure cache-busting on deploys
  // and to avoid relying on runtime env in static generation.
  ceramics:
    'https://res.cloudinary.com/dyakwocvr/image/upload/v1755722906/kiarakraft/categories/ceramics.png',
  textiles:
    'https://res.cloudinary.com/dyakwocvr/image/upload/v1755722982/kiarakraft/categories/textiles.png',
  jewelry:
    'https://res.cloudinary.com/dyakwocvr/image/upload/v1755722814/kiarakraft/categories/jewelry.png',
  woodwork:
    'https://res.cloudinary.com/dyakwocvr/image/upload/v1755723097/kiarakraft/categories/woodwork.png',
  painting:
    'https://res.cloudinary.com/dyakwocvr/image/upload/v1755723044/kiarakraft/categories/painting.png',
};
