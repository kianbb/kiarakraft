import type { Prisma } from '@prisma/client';

// Includes contact data for the seller's own profile and account export.
export const sellerSelfProfileSelect = {
  id: true,
  userId: true,
  handle: true,
  shopName: true,
  displayName: true,
  bio: true,
  region: true,
  avatarUrl: true,
  bannerUrl: true,
  createdAt: true,
  updatedAt: true,
  phone: true,
  address: true,
  website: true,
  city: true,
  province: true,
  verified: true,
  verifiedAt: true,
} satisfies Prisma.SellerProfileSelect;
