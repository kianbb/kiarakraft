'use server';

import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

const toggleWishlistSchema = z.object({
  productId: z.string().min(1, 'Product ID is required'),
});

export interface WishlistActionResult {
  success: boolean;
  isInWishlist?: boolean;
  error?: string;
}

/**
 * Toggle a product in/out of the user's wishlist
 */
export async function toggleWishlistAction(
  productId: string
): Promise<WishlistActionResult> {
  try {
    // Validate input
    const validatedFields = toggleWishlistSchema.safeParse({ productId });
    if (!validatedFields.success) {
      return {
        success: false,
        error: 'Invalid product ID',
      };
    }

    // Check authentication
    const session = await auth();
    if (!session?.user?.id) {
      return {
        success: false,
        error: 'Authentication required',
      };
    }

    const userId = session.user.id;

    // Check if product exists
    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, active: true, isTest: true },
    });

    if (!product || !product.active || product.isTest) {
      return {
        success: false,
        error: 'Product not found or not available',
      };
    }

    // Check if item already exists in wishlist
    const existingWishlistItem = await prisma.wishlistItem.findUnique({
      where: {
        userId_productId: {
          userId,
          productId,
        },
      },
    });

    let isInWishlist: boolean;

    if (existingWishlistItem) {
      // Remove from wishlist
      await prisma.wishlistItem.delete({
        where: { id: existingWishlistItem.id },
      });
      isInWishlist = false;
    } else {
      // Add to wishlist
      await prisma.wishlistItem.create({
        data: {
          userId,
          productId,
        },
      });
      isInWishlist = true;
    }

    // Revalidate pages that might show wishlist state
    revalidatePath('/');
    revalidatePath('/explore');
    revalidatePath(`/product/${product.id}`);
    revalidatePath('/account/wishlist');

    return {
      success: true,
      isInWishlist,
    };
  } catch (error) {
    console.error('Error toggling wishlist:', error);
    return {
      success: false,
      error: 'Failed to update wishlist. Please try again.',
    };
  }
}

/**
 * Get user's wishlist items
 */
export async function getUserWishlist() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect('/auth/login');
  }

  try {
    const wishlistItems = await prisma.wishlistItem.findMany({
      where: { userId: session.user.id },
      include: {
        product: {
          include: {
            images: {
              orderBy: { sortOrder: 'asc' },
              take: 1,
              select: { url: true, alt: true },
            },
            seller: {
              select: {
                handle: true,
                displayName: true,
                shopName: true,
                verified: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return wishlistItems.filter(
      item => item.product.active && !item.product.isTest
    );
  } catch (error) {
    console.error('Error fetching wishlist:', error);
    return [];
  }
}

/**
 * Check if a product is in the user's wishlist
 */
export async function isProductInWishlist(productId: string): Promise<boolean> {
  const session = await auth();
  if (!session?.user?.id) {
    return false;
  }

  try {
    const wishlistItem = await prisma.wishlistItem.findUnique({
      where: {
        userId_productId: {
          userId: session.user.id,
          productId,
        },
      },
    });

    return !!wishlistItem;
  } catch (error) {
    console.error('Error checking wishlist status:', error);
    return false;
  }
}

/**
 * Remove multiple items from wishlist
 */
export async function removeFromWishlistAction(
  productIds: string[]
): Promise<WishlistActionResult> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return {
        success: false,
        error: 'Authentication required',
      };
    }

    await prisma.wishlistItem.deleteMany({
      where: {
        userId: session.user.id,
        productId: { in: productIds },
      },
    });

    revalidatePath('/account/wishlist');

    return { success: true };
  } catch (error) {
    console.error('Error removing from wishlist:', error);
    return {
      success: false,
      error: 'Failed to remove items from wishlist.',
    };
  }
}
