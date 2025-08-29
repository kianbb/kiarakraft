'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Star, ArrowLeft, Package } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import Link from 'next/link';
import { OptimizedImage } from '@/components/ui/optimized-image';

interface OrderItem {
  id: string;
  product: {
    id: string;
    title: string;
    slug: string;
    images: Array<{ url: string; alt?: string | null }>;
  };
  quantity: number;
  unitPriceToman: number;
}

interface ReviewFormData {
  rating: number;
  title: string;
  body: string;
}

export default function ReviewPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const params = useParams();
  const t = useTranslations('reviews');

  const orderId = params.id as string;
  const locale = params.locale as string;

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<string>('');
  const [existingReviews, setExistingReviews] = useState<Set<string>>(
    new Set()
  );
  const [reviews, setReviews] = useState<Record<string, ReviewFormData>>({});
  const [hoveredRating, setHoveredRating] = useState<Record<string, number>>(
    {}
  );

  useEffect(() => {
    if (!session) {
      router.push('/auth/login');
      return;
    }

    const fetchOrderDetails = async () => {
      try {
        const response = await fetch(`/api/orders/${orderId}`);
        if (!response.ok) {
          router.push('/account/orders');
          return;
        }

        const order = await response.json();

        // Check if order is delivered
        if (order.status !== 'DELIVERED') {
          alert(t('orderNotDelivered'));
          router.push(`/${locale}/account/orders/${orderId}`);
          return;
        }

        setOrderItems(order.items);

        // Check for existing reviews
        const reviewsResponse = await fetch(
          `/api/reviews/check?orderId=${orderId}`
        );
        let existingReviewData: { reviewedProductIds: string[] } | null = null;
        if (reviewsResponse.ok) {
          existingReviewData = await reviewsResponse.json();
          if (existingReviewData) {
            setExistingReviews(new Set(existingReviewData.reviewedProductIds));
          }
        }

        // Initialize review forms for each product
        const initialReviews: Record<string, ReviewFormData> = {};
        const reviewedIds = existingReviewData?.reviewedProductIds || [];
        order.items.forEach((item: OrderItem) => {
          if (!reviewedIds.includes(item.product.id)) {
            initialReviews[item.product.id] = {
              rating: 0,
              title: '',
              body: '',
            };
          }
        });
        setReviews(initialReviews);

        if (order.items.length === 1) {
          setSelectedProduct(order.items[0].product.id);
        }
      } catch (error) {
        console.error('Error fetching order:', error);
        router.push('/account/orders');
      } finally {
        setLoading(false);
      }
    };

    fetchOrderDetails();
  }, [session, orderId, router, locale, t]);

  const handleRatingClick = (productId: string, rating: number) => {
    setReviews(prev => ({
      ...prev,
      [productId]: { ...prev[productId], rating },
    }));
  };

  const handleSubmit = async (productId: string) => {
    const review = reviews[productId];

    if (!review.rating) {
      alert(t('pleaseSelectRating'));
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId,
          orderId,
          rating: review.rating,
          title: review.title,
          body: review.body,
        }),
      });

      if (response.ok) {
        alert(t('reviewSubmitted'));
        setExistingReviews(prev => new Set([...prev, productId]));

        // Clear the form for this product
        setReviews(prev => {
          const updated = { ...prev };
          delete updated[productId];
          return updated;
        });

        // If all products reviewed, redirect
        if (existingReviews.size + 1 === orderItems.length) {
          router.push(`/${locale}/account/orders`);
        }
      } else {
        const error = await response.json();
        alert(error.error || t('reviewFailed'));
      }
    } catch (error) {
      console.error('Error submitting review:', error);
      alert(t('reviewFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  const renderStars = (productId: string) => {
    const rating = reviews[productId]?.rating || 0;
    const hovered = hoveredRating[productId] || 0;

    return (
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map(star => (
          <button
            key={star}
            type="button"
            onClick={() => handleRatingClick(productId, star)}
            onMouseEnter={() =>
              setHoveredRating({ ...hoveredRating, [productId]: star })
            }
            onMouseLeave={() =>
              setHoveredRating({ ...hoveredRating, [productId]: 0 })
            }
            className="focus:outline-none transition-colors"
          >
            <Star
              className={`h-8 w-8 ${
                star <= (hovered || rating)
                  ? 'fill-yellow-400 text-yellow-400'
                  : 'text-gray-300'
              }`}
            />
          </button>
        ))}
        {rating > 0 && (
          <span className="ml-2 text-sm text-gray-600 self-center">
            {rating === 1 && t('rating1')}
            {rating === 2 && t('rating2')}
            {rating === 3 && t('rating3')}
            {rating === 4 && t('rating4')}
            {rating === 5 && t('rating5')}
          </span>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="animate-pulse">
          <div className="bg-gray-200 h-8 rounded w-1/3 mb-8"></div>
          <div className="bg-gray-200 h-64 rounded"></div>
        </div>
      </div>
    );
  }

  const reviewableItems = orderItems.filter(
    item => !existingReviews.has(item.product.id)
  );

  if (reviewableItems.length === 0) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="text-center py-12">
          <Package className="h-16 w-16 mx-auto mb-6 text-muted-foreground opacity-50" />
          <h2 className="text-xl font-semibold mb-2">{t('allReviewed')}</h2>
          <p className="text-muted-foreground mb-6">
            {t('allReviewedDescription')}
          </p>
          <Link href={`/${locale}/account/orders`}>
            <Button>{t('backToOrders')}</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="mb-8">
        <Link
          href={`/${locale}/account/orders/${orderId}`}
          className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-4"
        >
          <ArrowLeft
            className={`h-4 w-4 ${locale === 'fa' ? 'rotate-180' : ''}`}
          />
          {t('backToOrder')}
        </Link>

        <h1 className="text-3xl font-bold">{t('leaveReview')}</h1>
        <p className="text-muted-foreground mt-2">{t('shareExperience')}</p>
      </div>

      {reviewableItems.length > 1 && (
        <div className="mb-6">
          <Label>{t('selectProduct')}</Label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
            {reviewableItems.map(item => (
              <button
                key={item.product.id}
                onClick={() => setSelectedProduct(item.product.id)}
                className={`p-4 rounded-lg border-2 transition-colors ${
                  selectedProduct === item.product.id
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="relative w-16 h-16 rounded overflow-hidden">
                    {item.product.images[0] && (
                      <OptimizedImage
                        src={item.product.images[0].url}
                        alt={item.product.title}
                        fill
                        className="object-cover"
                        sizes="64px"
                      />
                    )}
                  </div>
                  <div className="text-left flex-1">
                    <p className="font-medium">{item.product.title}</p>
                    <p className="text-sm text-gray-500">
                      {t('quantity')}: {item.quantity}
                    </p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {selectedProduct && (
        <div className="bg-white rounded-lg border p-6 space-y-6">
          {/* Product being reviewed */}
          <div className="pb-4 border-b">
            {(() => {
              const item = orderItems.find(
                i => i.product.id === selectedProduct
              );
              if (!item) return null;

              return (
                <div className="flex items-center gap-4">
                  <div className="relative w-20 h-20 rounded overflow-hidden">
                    {item.product.images[0] && (
                      <OptimizedImage
                        src={item.product.images[0].url}
                        alt={item.product.title}
                        fill
                        className="object-cover"
                        sizes="80px"
                      />
                    )}
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg">
                      {item.product.title}
                    </h3>
                    <Link
                      href={`/${locale}/product/${item.product.slug}`}
                      className="text-sm text-blue-600 hover:underline"
                    >
                      {t('viewProduct')}
                    </Link>
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Rating */}
          <div>
            <Label className="text-base mb-3 block">
              {t('rating')} <span className="text-red-500">*</span>
            </Label>
            {renderStars(selectedProduct)}
          </div>

          {/* Review Title */}
          <div>
            <Label htmlFor="title">{t('reviewTitle')}</Label>
            <Input
              id="title"
              value={reviews[selectedProduct]?.title || ''}
              onChange={e =>
                setReviews(prev => ({
                  ...prev,
                  [selectedProduct]: {
                    ...prev[selectedProduct],
                    title: e.target.value,
                  },
                }))
              }
              placeholder={t('reviewTitlePlaceholder')}
              maxLength={100}
              className="mt-2"
            />
          </div>

          {/* Review Body */}
          <div>
            <Label htmlFor="body">{t('reviewBody')}</Label>
            <textarea
              id="body"
              value={reviews[selectedProduct]?.body || ''}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                setReviews(prev => ({
                  ...prev,
                  [selectedProduct]: {
                    ...prev[selectedProduct],
                    body: e.target.value,
                  },
                }))
              }
              placeholder={t('reviewBodyPlaceholder')}
              rows={5}
              maxLength={1000}
              className="mt-2 w-full min-h-[120px] px-3 py-2 border border-input rounded-md resize-none"
            />
            <p className="text-sm text-gray-500 mt-1">
              {reviews[selectedProduct]?.body?.length || 0}/1000
            </p>
          </div>

          {/* Submit Button */}
          <div className="flex justify-end gap-4">
            <Link href={`/${locale}/account/orders/${orderId}`}>
              <Button variant="outline">{t('cancel')}</Button>
            </Link>
            <Button
              onClick={() => handleSubmit(selectedProduct)}
              disabled={submitting || !reviews[selectedProduct]?.rating}
            >
              {submitting ? t('submitting') : t('submitReview')}
            </Button>
          </div>

          {/* Info */}
          <div className="bg-blue-50 rounded-lg p-4 text-sm text-blue-800">
            <p>{t('reviewInfo')}</p>
          </div>
        </div>
      )}
    </div>
  );
}
