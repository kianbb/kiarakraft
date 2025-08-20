// Centralized, curated image fallbacks for categories and any other assets.
// Prefer Cloudinary assets if you've uploaded them to the following paths.
// If not available, we point to stable Unsplash images that match the category.

export const CATEGORY_IMAGE_FALLBACKS: Record<string, string> = {
  ceramics:
    // Cloudinary (recommended) e.g. https://res.cloudinary.com/<cloud>/image/upload/kiarakraft/categories/ceramics.jpg
    process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME
      ? `https://res.cloudinary.com/${process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME}/image/upload/kiarakraft/categories/ceramics`
      : 'https://images.unsplash.com/photo-1610701596007-11502861dcfa?w=400&h=400&fit=crop&q=80',
  textiles:
    process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME
      ? `https://res.cloudinary.com/${process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME}/image/upload/kiarakraft/categories/textiles`
      : 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400&h=400&fit=crop&q=80',
  jewelry:
    process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME
      ? `https://res.cloudinary.com/${process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME}/image/upload/kiarakraft/categories/jewelry`
      : 'https://images.unsplash.com/photo-1605100804763-247f67b3557e?w=400&h=400&fit=crop&q=80',
  woodwork:
    process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME
      ? `https://res.cloudinary.com/${process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME}/image/upload/kiarakraft/categories/woodwork`
      : 'https://images.unsplash.com/photo-1542319375-a5bb87543ad7?w=400&h=400&fit=crop&q=80',
  painting:
    process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME
      ? `https://res.cloudinary.com/${process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME}/image/upload/kiarakraft/categories/painting`
      : 'https://images.unsplash.com/photo-1513475382585-d06e58bcb0e0?w=400&h=400&fit=crop&q=80',
};
