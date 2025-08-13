'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { QuantitySelector } from './QuantitySelector';
import { ShoppingCart } from 'lucide-react';

interface AddToCartButtonProps {
  product: {
    id: string;
    stock: number;
  };
}

export function AddToCartButton({ product }: AddToCartButtonProps) {
  const { data: session } = useSession();
  const t = useTranslations('product');
  const router = useRouter();
  const [quantity, setQuantity] = useState(1);
  const [addingToCart, setAddingToCart] = useState(false);

  const handleAddToCart = async () => {
    if (!session) {
      router.push('/auth/login');
      return;
    }

    setAddingToCart(true);
    try {
      const response = await fetch('/api/cart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: product.id,
          quantity
        })
      });

      if (response.ok) {
        // Show success message or toast here
        alert(t('addedToCart'));
      } else {
        throw new Error('Failed to add to cart');
      }
    } catch (error) {
      console.error('Error adding to cart:', error);
      alert('Failed to add item to cart');
    } finally {
      setAddingToCart(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <div>
          <label className="text-sm font-medium mb-2 block">
            {t('quantity')}
          </label>
          <QuantitySelector
            value={quantity}
            onChange={setQuantity}
            max={Math.min(product.stock, 10)}
          />
        </div>
        <div className="text-sm text-muted-foreground">
          {product.stock} {t('available')}
        </div>
      </div>

      <Button
        onClick={handleAddToCart}
        disabled={addingToCart || product.stock === 0}
        className="w-full"
        size="lg"
      >
        <ShoppingCart className="h-4 w-4 mr-2" />
        {addingToCart ? t('adding') : t('addToCart')}
      </Button>
    </div>
  );
}