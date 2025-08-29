'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  Star,
  Check,
  X,
  Eye,
  Clock,
  User,
  Package,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { formatDate } from '@/lib/utils';

interface Review {
  id: string;
  rating: number;
  title: string | null;
  body: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  createdAt: string;
  user: {
    name: string | null;
    email: string;
  };
  product: {
    title: string;
    slug: string;
  };
}

interface ReviewsResponse {
  reviews: Review[];
  pagination: {
    page: number;
    limit: number;
    hasNext: boolean;
    total: number;
  };
}

export default function AdminReviewsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [isHydrated, setIsHydrated] = useState(false);
  useEffect(() => setIsHydrated(true), []);
  const _t = useTranslations('admin');
  const t = isHydrated ? _t : (((k: string) => k) as (k: string) => string);

  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  const [selectedStatus, setSelectedStatus] = useState('PENDING');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [hasNext, setHasNext] = useState(false);
  const [expandedReview, setExpandedReview] = useState<string | null>(null);

  useEffect(() => {
    if (status === 'loading') return;

    if (!session) {
      router.push('/auth/login');
      return;
    }

    if (session.user?.role !== 'ADMIN') {
      router.push('/');
      return;
    }

    const fetchReviews = async () => {
      try {
        setLoading(true);
        const response = await fetch(
          `/api/reviews?status=${selectedStatus}&page=${currentPage}&limit=10`
        );

        if (response.ok) {
          const data: ReviewsResponse = await response.json();
          setReviews(data.reviews);
          setTotalCount(data.pagination.total);
          setHasNext(data.pagination.hasNext);
        } else {
          console.error('Failed to fetch reviews');
        }
      } catch (error) {
        console.error('Error fetching reviews:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchReviews();
  }, [session, status, router, selectedStatus, currentPage]);

  const handleStatusUpdate = async (
    reviewId: string,
    newStatus: 'APPROVED' | 'REJECTED'
  ) => {
    setUpdating(reviewId);
    try {
      const response = await fetch(`/api/admin/reviews/${reviewId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });

      if (response.ok) {
        // Remove the review from the current list if it's no longer matches the filter
        setReviews(prevReviews =>
          prevReviews.filter(review => review.id !== reviewId)
        );
        setTotalCount(prev => Math.max(0, prev - 1));
        alert(t('reviewStatusUpdated'));
      } else {
        alert(t('errorUpdatingReview'));
      }
    } catch (error) {
      console.error('Error updating review status:', error);
      alert(t('errorUpdatingReview'));
    } finally {
      setUpdating(null);
    }
  };

  const renderStars = (rating: number) => {
    return (
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map(star => (
          <Star
            key={star}
            className={`h-4 w-4 ${
              star <= rating
                ? 'fill-yellow-400 text-yellow-400'
                : 'text-gray-300'
            }`}
          />
        ))}
      </div>
    );
  };

  const getStatusBadge = (status: string) => {
    const config = {
      PENDING: { label: t('pending'), variant: 'secondary' as const },
      APPROVED: { label: t('approved'), variant: 'default' as const },
      REJECTED: { label: t('rejected'), variant: 'destructive' as const },
    };

    const { label, variant } =
      config[status as keyof typeof config] || config.PENDING;
    return <Badge variant={variant}>{label}</Badge>;
  };

  if (status === 'loading' || loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="animate-pulse">
          <div className="bg-gray-200 h-8 rounded mb-8"></div>
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="bg-gray-200 h-24 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">{t('reviewModeration')}</h1>
        <p className="text-muted-foreground">{t('moderateReviews')}</p>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg border p-6 mb-6">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-4">
            <div>
              <label className="text-sm font-medium">{t('status')}</label>
              <Select
                value={selectedStatus}
                onValueChange={value => {
                  setSelectedStatus(value);
                  setCurrentPage(1);
                }}
              >
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PENDING">{t('pending')}</SelectItem>
                  <SelectItem value="APPROVED">{t('approved')}</SelectItem>
                  <SelectItem value="REJECTED">{t('rejected')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="text-sm text-muted-foreground">
              {t('totalReviews', { count: totalCount })}
            </div>
          </div>
        </div>
      </div>

      {/* Reviews List */}
      <div className="space-y-4">
        {reviews.length === 0 ? (
          <div className="text-center py-12">
            <Clock className="h-16 w-16 mx-auto mb-6 text-muted-foreground opacity-50" />
            <h2 className="text-xl font-semibold mb-2">{t('noReviews')}</h2>
            <p className="text-muted-foreground">
              {selectedStatus === 'PENDING'
                ? t('noPendingReviews')
                : t('noReviewsInCategory')}
            </p>
          </div>
        ) : (
          reviews.map(review => (
            <div key={review.id} className="bg-white rounded-lg border p-6">
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-3">
                  {getStatusBadge(review.status)}
                  <span className="text-sm text-gray-500">
                    {formatDate(review.createdAt)}
                  </span>
                </div>
                <div className="flex gap-2">
                  {selectedStatus === 'PENDING' && (
                    <>
                      <Button
                        size="sm"
                        onClick={() =>
                          handleStatusUpdate(review.id, 'APPROVED')
                        }
                        disabled={updating === review.id}
                      >
                        <Check className="h-4 w-4 mr-1" />
                        {t('approve')}
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() =>
                          handleStatusUpdate(review.id, 'REJECTED')
                        }
                        disabled={updating === review.id}
                      >
                        <X className="h-4 w-4 mr-1" />
                        {t('reject')}
                      </Button>
                    </>
                  )}

                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setExpandedReview(
                        expandedReview === review.id ? null : review.id
                      )
                    }
                  >
                    <Eye className="h-4 w-4 mr-1" />
                    {expandedReview === review.id
                      ? t('hideDetails')
                      : t('viewDetails')}
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Package className="h-4 w-4 text-gray-400" />
                    <span className="font-medium">{review.product.title}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-gray-400" />
                    <span className="text-sm text-gray-600">
                      {review.user.name || review.user.email}
                    </span>
                  </div>
                </div>

                <div>
                  <div className="flex items-center gap-2 mb-2">
                    {renderStars(review.rating)}
                    <span className="font-medium">{review.rating}/5</span>
                  </div>
                  {review.title && (
                    <p className="text-sm font-medium text-gray-800 line-clamp-1">
                      {review.title}
                    </p>
                  )}
                </div>
              </div>

              {review.body && (
                <div className="mt-4 pt-4 border-t">
                  <p className="text-sm text-gray-700 line-clamp-3">
                    {review.body}
                  </p>
                </div>
              )}

              {/* Expanded Details */}
              {expandedReview === review.id && (
                <div className="mt-4 pt-4 border-t bg-gray-50 rounded p-4 space-y-3">
                  <h4 className="font-medium">{t('reviewDetails')}</h4>

                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="font-medium text-gray-500">
                        {t('product')}:{' '}
                      </span>
                      <span>{review.product.title}</span>
                    </div>
                    <div>
                      <span className="font-medium text-gray-500">
                        {t('reviewer')}:{' '}
                      </span>
                      <span>{review.user.name || review.user.email}</span>
                    </div>
                  </div>

                  <div className="text-sm">
                    <span className="font-medium text-gray-500">
                      {t('rating')}:{' '}
                    </span>
                    <div className="flex items-center gap-2 mt-1">
                      {renderStars(review.rating)}
                      <span>{review.rating}/5</span>
                    </div>
                  </div>

                  {review.title && (
                    <div className="text-sm">
                      <span className="font-medium text-gray-500">
                        {t('title')}:{' '}
                      </span>
                      <p className="mt-1 font-medium">{review.title}</p>
                    </div>
                  )}

                  {review.body && (
                    <div className="text-sm">
                      <span className="font-medium text-gray-500">
                        {t('fullReview')}:{' '}
                      </span>
                      <p className="mt-1 bg-white p-3 rounded border whitespace-pre-wrap">
                        {review.body}
                      </p>
                    </div>
                  )}

                  <div className="text-sm text-gray-500">
                    <span className="font-medium">{t('submittedAt')}: </span>
                    {formatDate(review.createdAt)}
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Pagination */}
      {(currentPage > 1 || hasNext) && (
        <div className="flex justify-center items-center gap-4 mt-8">
          <Button
            variant="outline"
            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
            disabled={currentPage === 1}
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            {t('previous')}
          </Button>

          <span className="text-sm text-gray-600">
            {t('pageOf', {
              current: currentPage,
              total: Math.ceil(totalCount / 10),
            })}
          </span>

          <Button
            variant="outline"
            onClick={() => setCurrentPage(prev => prev + 1)}
            disabled={!hasNext}
          >
            {t('next')}
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      )}
    </div>
  );
}
