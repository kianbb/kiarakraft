'use client';

import { useState, useEffect } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  CheckCircle,
  XCircle,
  Clock,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import { ProductWithRelations } from '@/types/database';

interface ProductStatusBadgeProps {
  product: ProductWithRelations;
  onUpdate?: (product: ProductWithRelations) => void;
}

export function ProductStatusBadge({
  product,
  onUpdate,
}: ProductStatusBadgeProps) {
  const t = useTranslations('seller');
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [currentProduct, setCurrentProduct] = useState(product);
  const [isPolling, setIsPolling] = useState(false);

  // Poll for updates if PENDING
  useEffect(() => {
    if (currentProduct.eligibilityStatus === 'PENDING' && !isPolling) {
      setIsPolling(true);

      const pollProduct = async () => {
        try {
          const res = await fetch(`/api/seller/products/${product.id}`);
          if (res.ok) {
            const updated = await res.json();
            setCurrentProduct(updated);

            // If status changed from PENDING, notify parent
            if (updated.eligibilityStatus !== 'PENDING') {
              onUpdate?.(updated);
              setIsPolling(false);
              return false; // Stop polling
            }
          }
        } catch (error) {
          console.error('Error polling product status:', error);
        }
        return true; // Continue polling
      };

      // Initial poll
      pollProduct();

      // Set up interval
      const interval = setInterval(async () => {
        const shouldContinue = await pollProduct();
        if (!shouldContinue) {
          clearInterval(interval);
        }
      }, 3000); // Poll every 3 seconds

      return () => {
        clearInterval(interval);
        setIsPolling(false);
      };
    }
  }, [currentProduct.eligibilityStatus, product.id, onUpdate, isPolling]);

  // Update when product prop changes
  useEffect(() => {
    setCurrentProduct(product);
  }, [product]);

  // Extract progress from eligibilityReasons
  const getProgress = () => {
    const reasons = currentProduct.eligibilityReasons || '';

    if (reasons.includes('Step 3/3') || reasons.includes('Assessing product')) {
      return { step: 3, label: t('aiProcessing.step3'), percent: 90 };
    }
    if (reasons.includes('Step 2/3') || reasons.includes('Enhancing product')) {
      return { step: 2, label: t('aiProcessing.step2'), percent: 60 };
    }
    if (
      reasons.includes('Step 1/3') ||
      reasons.includes('Validating product')
    ) {
      return { step: 1, label: t('aiProcessing.step1'), percent: 30 };
    }

    // Check for completed states
    if (
      currentProduct.eligibilityStatus === 'APPROVED' ||
      currentProduct.eligibilityStatus === 'REJECTED'
    ) {
      return { step: 3, label: t('aiProcessing.complete'), percent: 100 };
    }

    return { step: 0, label: t('aiProcessing.starting'), percent: 5 };
  };

  const progress = getProgress();

  // Get localized reason text from bilingual JSON or fallback to plain text
  const getLocalizedReasonText = (
    reasons: string | null | undefined
  ): string => {
    if (!reasons) return '';

    try {
      const parsed = JSON.parse(reasons);
      if (parsed && typeof parsed === 'object') {
        return parsed[locale] || parsed.en || reasons;
      }
    } catch {
      // Not JSON, return as is
    }

    return reasons;
  };

  // Parse rejection reasons - now handles bilingual JSON format
  const parseReasons = (reasons: string | null | undefined) => {
    if (!reasons) return [];

    // Try to parse as JSON first (new format)
    try {
      const parsed = JSON.parse(reasons);
      if (parsed && typeof parsed === 'object') {
        // Get the appropriate language based on locale
        const localizedReasons = parsed[locale] || parsed.en || '';
        if (localizedReasons) {
          return localizedReasons
            .split(/[;•\n]/)
            .map((r: string) => r.trim())
            .filter((r: string) => r.length > 0);
        }
      }
    } catch {
      // If not JSON, fall back to old format
    }

    // Fall back to old format (plain string with separators)
    const parts = reasons
      .split(/[;•\n]/)
      .map(r => r.trim())
      .filter(r => r.length > 0);

    // If it's a single long string with "reasons:", split after that
    if (parts.length === 1 && reasons.includes('reasons:')) {
      const afterReasons = reasons.split('reasons:')[1];
      if (afterReasons) {
        return afterReasons
          .split(/[;•\n]/)
          .map(r => r.trim())
          .filter(r => r.length > 0);
      }
    }

    return parts;
  };

  const getStatusVariant = () => {
    switch (currentProduct.eligibilityStatus) {
      case 'APPROVED':
        return 'default';
      case 'REJECTED':
        return 'destructive';
      case 'PENDING':
      default:
        return 'secondary';
    }
  };

  const getStatusIcon = () => {
    switch (currentProduct.eligibilityStatus) {
      case 'APPROVED':
        return <CheckCircle className="w-3 h-3 mr-1" />;
      case 'REJECTED':
        return <XCircle className="w-3 h-3 mr-1" />;
      case 'PENDING':
        return <Clock className="w-3 h-3 mr-1 animate-pulse" />;
      default:
        return null;
    }
  };

  return (
    <>
      {/* Clickable Badge */}
      <Badge
        className="cursor-pointer hover:opacity-80 transition-opacity"
        variant={getStatusVariant()}
        onClick={() => setOpen(true)}
      >
        {getStatusIcon()}
        {t(`eligibility_${currentProduct.eligibilityStatus?.toLowerCase()}`) ||
          currentProduct.eligibilityStatus}
      </Badge>

      {/* Detail Modal */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('productReviewStatus')}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Status Icon */}
            <div className="flex justify-center">
              {currentProduct.eligibilityStatus === 'APPROVED' && (
                <CheckCircle className="w-16 h-16 text-green-500" />
              )}
              {currentProduct.eligibilityStatus === 'REJECTED' && (
                <XCircle className="w-16 h-16 text-red-500" />
              )}
              {currentProduct.eligibilityStatus === 'PENDING' && (
                <div className="relative">
                  <Clock className="w-16 h-16 text-yellow-500 animate-pulse" />
                  {isPolling && (
                    <RefreshCw className="absolute -bottom-2 -right-2 w-4 h-4 text-muted-foreground animate-spin" />
                  )}
                </div>
              )}
            </div>

            {/* Progress Bar for PENDING */}
            {currentProduct.eligibilityStatus === 'PENDING' && (
              <div className="space-y-3">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="font-medium">
                      {t('aiProcessing.step')} {progress.step}{' '}
                      {t('aiProcessing.of')} 3
                    </span>
                    <span className="text-muted-foreground">
                      {progress.percent}%
                    </span>
                  </div>
                  <Progress value={progress.percent} className="h-2" />
                </div>

                <div className="bg-muted/50 rounded-lg p-3">
                  <p className="text-sm font-medium mb-1">{progress.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {currentProduct.eligibilityReasons ||
                      t('aiProcessing.processingDescription')}
                  </p>
                </div>

                <div className="text-xs text-center text-muted-foreground">
                  {t('aiProcessing.autoRefresh')}
                </div>
              </div>
            )}

            {/* Approval Details */}
            {currentProduct.eligibilityStatus === 'APPROVED' && (
              <div className="space-y-3">
                <div className="bg-green-50 dark:bg-green-950/30 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle className="w-5 h-5 text-green-600" />
                    <span className="font-semibold text-green-900 dark:text-green-100">
                      {t('productApproved')}
                    </span>
                  </div>

                  {currentProduct.eligibilityConfidence && (
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-sm text-green-800 dark:text-green-200">
                        {t('aiConfidence')}:
                      </span>
                      <div className="flex items-center gap-1">
                        <div className="w-24 bg-green-200 dark:bg-green-800 rounded-full h-2">
                          <div
                            className="bg-green-600 h-2 rounded-full transition-all"
                            style={{
                              width: `${currentProduct.eligibilityConfidence}%`,
                            }}
                          />
                        </div>
                        <span className="text-sm font-medium text-green-800 dark:text-green-200">
                          {currentProduct.eligibilityConfidence}%
                        </span>
                      </div>
                    </div>
                  )}

                  {currentProduct.eligibilityReasons && (
                    <div>
                      <p className="text-sm font-medium text-green-800 dark:text-green-200 mb-1">
                        {t('aiAssessment')}:
                      </p>
                      <p className="text-sm text-green-700 dark:text-green-300">
                        {getLocalizedReasonText(
                          currentProduct.eligibilityReasons
                        )}
                      </p>
                    </div>
                  )}
                </div>

                <div className="bg-blue-50 dark:bg-blue-950/30 rounded-lg p-3">
                  <p className="text-sm text-blue-800 dark:text-blue-200">
                    <strong>{t('nextSteps')}:</strong> {t('approvedNextSteps')}
                  </p>
                </div>
              </div>
            )}

            {/* Rejection Details */}
            {currentProduct.eligibilityStatus === 'REJECTED' && (
              <div className="space-y-3">
                <div className="bg-red-50 dark:bg-red-950/30 rounded-lg p-4">
                  <div className="flex items-start gap-2 mb-3">
                    <AlertCircle className="w-5 h-5 text-red-600 mt-0.5" />
                    <div className="flex-1">
                      <p className="font-semibold text-red-900 dark:text-red-100 mb-2">
                        {t('rejectionReasons')}:
                      </p>

                      {currentProduct.eligibilityConfidence && (
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-sm text-red-700 dark:text-red-300">
                            {t('aiConfidence')}:
                          </span>
                          <span className="text-sm font-medium text-red-800 dark:text-red-200">
                            {currentProduct.eligibilityConfidence}%
                          </span>
                        </div>
                      )}

                      <ul className="space-y-2">
                        {parseReasons(currentProduct.eligibilityReasons).map(
                          (reason: string, i: number) => (
                            <li
                              key={i}
                              className="text-sm flex items-start gap-2"
                            >
                              <span className="text-red-500 mt-0.5">•</span>
                              <span className="text-red-700 dark:text-red-300">
                                {reason}
                              </span>
                            </li>
                          )
                        )}
                      </ul>
                    </div>
                  </div>
                </div>

                <div className="bg-yellow-50 dark:bg-yellow-950/30 rounded-lg p-4">
                  <p className="text-sm text-yellow-800 dark:text-yellow-200">
                    <strong>{t('whatToDo')}:</strong> {t('rejectedNextSteps')}
                  </p>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
