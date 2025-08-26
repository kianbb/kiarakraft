'use client';

import { useState, useTransition } from 'react';
import { Heart, Loader2 } from 'lucide-react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { toggleWishlistAction } from '@/lib/actions/wishlist';
import { Button } from '@/components/ui/button';
// Tooltip removed for simplicity - can be added later with shadcn/ui tooltip

interface WishlistButtonProps {
  productId: string;
  initialIsInWishlist: boolean;
  variant?: 'default' | 'minimal' | 'large';
  // showTooltip removed - tooltip functionality disabled
  className?: string;
}

export function WishlistButton({
  productId,
  initialIsInWishlist,
  variant = 'default',
  className,
}: WishlistButtonProps) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [optimisticIsInWishlist, setOptimisticIsInWishlist] =
    useState(initialIsInWishlist);

  const handleToggle = async () => {
    // Check authentication
    if (status === 'loading') return;

    if (!session) {
      router.push('/auth/login');
      return;
    }

    // Optimistic update
    const newState = !optimisticIsInWishlist;
    setOptimisticIsInWishlist(newState);

    startTransition(async () => {
      try {
        const result = await toggleWishlistAction(productId);

        if (result.success) {
          // Server state matches optimistic state, all good
          setOptimisticIsInWishlist(result.isInWishlist ?? newState);
        } else {
          // Revert optimistic update on error
          setOptimisticIsInWishlist(!newState);
          console.error('Wishlist toggle failed:', result.error);
        }
      } catch (error) {
        // Revert optimistic update on error
        setOptimisticIsInWishlist(!newState);
        console.error('Wishlist toggle error:', error);
      }
    });
  };

  const isLoading = isPending || status === 'loading';
  const isInWishlist = optimisticIsInWishlist;

  // Different sizes based on variant
  const getSizeClasses = () => {
    switch (variant) {
      case 'minimal':
        return 'h-8 w-8';
      case 'large':
        return 'h-12 w-12';
      default:
        return 'h-10 w-10';
    }
  };

  const getIconSize = () => {
    switch (variant) {
      case 'minimal':
        return 16;
      case 'large':
        return 24;
      default:
        return 20;
    }
  };

  const buttonContent = (
    <Button
      variant="ghost"
      size="icon"
      onClick={handleToggle}
      disabled={isLoading}
      className={cn(
        getSizeClasses(),
        'relative transition-all duration-200 hover:scale-105',
        isInWishlist
          ? 'text-red-500 hover:text-red-600'
          : 'text-gray-400 hover:text-gray-600',
        className
      )}
      aria-label={isInWishlist ? 'Remove from wishlist' : 'Add to wishlist'}
    >
      {isLoading ? (
        <Loader2 size={getIconSize()} className="animate-spin" />
      ) : (
        <Heart
          size={getIconSize()}
          className={cn(
            'transition-all duration-200',
            isInWishlist && 'fill-current'
          )}
        />
      )}
    </Button>
  );

  // Tooltip functionality removed for simplicity
  return buttonContent;
}

/**
 * Wrapper component that checks wishlist status server-side
 */
interface WishlistButtonWrapperProps
  extends Omit<WishlistButtonProps, 'initialIsInWishlist'> {
  productId: string;
}

export async function WishlistButtonWrapper({
  productId,
  ...props
}: WishlistButtonWrapperProps) {
  // This would be used in server components where we can check the initial state
  // For now, we'll default to false and let the client handle the state
  return (
    <WishlistButton
      productId={productId}
      initialIsInWishlist={false}
      {...props}
    />
  );
}
