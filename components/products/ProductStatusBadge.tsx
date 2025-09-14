'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { CheckCircle, XCircle, Clock, AlertCircle } from 'lucide-react';
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
  const [mounted, setMounted] = useState(false);
  const pollIntervalRef = useRef<NodeJS.Timeout | undefined>(undefined);

  // Mark as mounted after hydration
  useEffect(() => {
    setMounted(true);
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, []);

  // Poll for updates if PENDING (only after mount to avoid hydration issues)
  useEffect(() => {
    // Don't start polling until after mount
    if (!mounted) return;

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
        } catch {
          // Silently handle polling errors to avoid hydration issues
          // Error already handled by try-catch
        }
        return true; // Continue polling
      };

      // Delay initial poll slightly to ensure hydration completes
      const timeoutId = setTimeout(() => {
        pollProduct();

        // Set up interval
        pollIntervalRef.current = setInterval(async () => {
          const shouldContinue = await pollProduct();
          if (!shouldContinue && pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
          }
        }, 3000); // Poll every 3 seconds
      }, 100);

      return () => {
        clearTimeout(timeoutId);
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
        }
        setIsPolling(false);
      };
    }
  }, [
    currentProduct.eligibilityStatus,
    product.id,
    onUpdate,
    isPolling,
    mounted,
  ]);

  // Update when product prop changes
  useEffect(() => {
    setCurrentProduct(product);
  }, [product]);

  // Extract progress from eligibilityReasons
  const getProgress = () => {
    const reasons = currentProduct.eligibilityReasons || '';

    // Convert reasons to string if it's not already (for safety)
    const reasonsStr = typeof reasons === 'string' ? reasons : String(reasons);

    if (
      reasonsStr.includes('Step 3/3') ||
      reasonsStr.includes('Assessing product')
    ) {
      return { step: 3, label: t('aiProcessing.step3'), percent: 90 };
    }
    if (
      reasonsStr.includes('Step 2/3') ||
      reasonsStr.includes('Enhancing product')
    ) {
      return { step: 2, label: t('aiProcessing.step2'), percent: 60 };
    }
    if (
      reasonsStr.includes('Step 1/3') ||
      reasonsStr.includes('Validating product')
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

  // Get localized reason text from bilingual JSON or fallback to plain text
  const getLocalizedReasonText = (
    reasons: string | null | undefined
  ): string => {
    if (!reasons) return '';

    // If it's a PENDING status with progress messages, return as is
    if (currentProduct.eligibilityStatus === 'PENDING') {
      return typeof reasons === 'string' ? reasons : '';
    }

    // Only try to parse JSON for APPROVED/REJECTED statuses
    if (typeof reasons === 'string') {
      // Try to parse as JSON - check for JSON-like structure
      const trimmedReasons = reasons.trim();
      if (trimmedReasons.startsWith('{') && trimmedReasons.endsWith('}')) {
        try {
          const parsed = JSON.parse(trimmedReasons);
          if (parsed && typeof parsed === 'object') {
            // STRICT LANGUAGE SEPARATION
            // Only return content for the current locale, nothing else
            const localizedText = locale === 'fa' ? parsed.fa : parsed.en;

            // Validate that we got the right language
            if (typeof localizedText === 'string' && localizedText.trim()) {
              // For Persian locale, prioritize Persian content
              if (locale === 'fa') {
                // Check if it's predominantly Persian (has Persian chars)
                if (/[\u0600-\u06FF]/.test(localizedText)) {
                  // Check for English contamination (basic Latin letters in words)
                  const englishWords =
                    localizedText.match(/\b[a-zA-Z]{2,}\b/g) || [];
                  // Allow some English (like brand names), but not too much
                  if (englishWords.length <= 2) {
                    return localizedText.trim();
                  }
                }
              } else {
                // For English locale, ensure it's predominantly English
                // Check if there are NO Persian characters (clean English)
                if (!/[\u0600-\u06FF]/.test(localizedText)) {
                  return localizedText.trim();
                }
              }
            }

            // If validation fails, return empty to avoid mixed content
            return '';
          }
        } catch {
          // Not valid JSON, silently fallback
          // Don't use console.warn as it causes hydration issues
        }
      }
    }

    // Fallback: return empty to avoid mixed language display
    return '';
  };

  // Parse rejection reasons - now handles bilingual JSON format
  const parseReasons = (reasons: string | null | undefined): string[] => {
    if (!reasons) return [];

    // Don't try to parse if it's not a string
    if (typeof reasons !== 'string') return [];

    // For PENDING status, don't try to parse as array
    if (currentProduct.eligibilityStatus === 'PENDING') {
      return [];
    }

    const trimmedReasons = reasons.trim();

    // Try to parse as JSON if it looks like JSON
    if (trimmedReasons.startsWith('{') && trimmedReasons.endsWith('}')) {
      try {
        const parsed = JSON.parse(trimmedReasons);
        if (parsed && typeof parsed === 'object') {
          // STRICT LANGUAGE SEPARATION - Only use the current locale
          const localizedReasons = locale === 'fa' ? parsed.fa : parsed.en;

          if (localizedReasons && typeof localizedReasons === 'string') {
            // Language validation - ensure correct language per locale
            if (locale === 'fa') {
              // Persian text should contain Persian characters
              if (!/[\u0600-\u06FF]/.test(localizedReasons)) {
                return []; // No Persian chars, return empty
              }
              // Check for excessive English (more than 2 English words)
              const englishWords =
                localizedReasons.match(/\b[a-zA-Z]{2,}\b/g) || [];
              if (englishWords.length > 2) {
                return []; // Too much English mixed in
              }
            } else {
              // English text should NOT contain Persian characters
              if (/[\u0600-\u06FF]/.test(localizedReasons)) {
                return []; // Has Persian chars, return empty
              }
            }

            // Split by semicolons and clean up
            const reasonsList = localizedReasons
              .split(';')
              .map((r: string) => r.trim())
              .filter((r: string) => r.length > 0 && r !== '.');

            // If we got valid reasons, return them
            if (reasonsList.length > 0) {
              return reasonsList;
            }
          }
        }
      } catch {
        // Not valid JSON, silently fallback
        // Don't use console.warn as it causes hydration issues
      }
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

  // Memoize progress calculation to avoid recalculating during renders
  const progress = useMemo(() => {
    if (currentProduct.eligibilityStatus === 'PENDING') {
      return getProgress();
    }
    return null;
  }, [
    currentProduct.eligibilityStatus,
    currentProduct.eligibilityReasons,
    t,
    getProgress,
  ]);

  // Prepare approval reason text for rendering
  const approvalReasonContent = useMemo(() => {
    if (
      currentProduct.eligibilityStatus !== 'APPROVED' ||
      !currentProduct.eligibilityReasons
    ) {
      return null;
    }

    const reasonText = getLocalizedReasonText(
      currentProduct.eligibilityReasons
    );
    if (!reasonText) return null;

    if (reasonText.includes(';')) {
      const reasons = reasonText
        .split(';')
        .map(r => r.trim())
        .filter(r => r);
      return { type: 'list' as const, reasons };
    }
    return { type: 'text' as const, text: reasonText };
  }, [
    currentProduct.eligibilityStatus,
    currentProduct.eligibilityReasons,
    locale,
    getLocalizedReasonText,
  ]);

  return (
    <>
      {/* Clickable Badge */}
      <Badge
        className="cursor-pointer hover:opacity-80 transition-opacity"
        variant={getStatusVariant()}
        onClick={() => setOpen(true)}
        suppressHydrationWarning
      >
        {getStatusIcon()}
        {t(`eligibility_${currentProduct.eligibilityStatus?.toLowerCase()}`) ||
          currentProduct.eligibilityStatus}
      </Badge>

      {/* Detail Modal - Render consistently to avoid hydration issues */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md" suppressHydrationWarning>
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
                <Clock className="w-16 h-16 text-yellow-500 animate-pulse" />
              )}
            </div>

            {/* Progress Bar for PENDING */}
            {currentProduct.eligibilityStatus === 'PENDING' && progress && (
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
                    {getLocalizedReasonText(
                      currentProduct.eligibilityReasons
                    ) || t('aiProcessing.processingDescription')}
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

                  {approvalReasonContent && (
                    <div>
                      <p className="text-sm font-medium text-green-800 dark:text-green-200 mb-1">
                        {t('aiAssessment')}:
                      </p>
                      <div className="text-sm text-green-700 dark:text-green-300">
                        {approvalReasonContent.type === 'list' ? (
                          <ul className="space-y-1">
                            {approvalReasonContent.reasons.map((reason, i) => (
                              <li key={i} className="flex items-start gap-1">
                                <span className="text-green-600">•</span>
                                <span>{reason}</span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p>{approvalReasonContent.text}</p>
                        )}
                      </div>
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
