'use client';

import { useTranslations } from 'next-intl';
import { useState, useEffect } from 'react';
import { Clock, Search, Filter } from 'lucide-react';

interface SearchStatsProps {
  query?: string;
  totalResults: number;
  hasFilters: boolean;
  processingTime: number;
  locale: string;
}

export function SearchStats({
  query,
  totalResults,
  hasFilters,
  processingTime,
}: SearchStatsProps) {
  const [isHydrated, setIsHydrated] = useState(false);
  useEffect(() => setIsHydrated(true), []);
  const _t = useTranslations('explore');
  const t = isHydrated ? _t : (((k: string) => k) as (k: string) => string);

  if (!isHydrated) return null;

  const hasQuery = Boolean(query?.trim());

  return (
    <div className="mb-6 p-4 bg-gray-50 rounded-lg border">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          {/* Results Count */}
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm">
              {hasQuery
                ? t('searchResultsCount', {
                    count: totalResults,
                    query: query || '',
                  })
                : t('resultsCount', { count: totalResults })}
            </span>
          </div>

          {/* Filter Indicator */}
          {hasFilters && (
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-blue-600" />
              <span className="text-sm text-blue-600">
                {t('filtersApplied')}
              </span>
            </div>
          )}
        </div>

        {/* Processing Time */}
        {processingTime > 0 && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            <span>{t('searchTime', { time: processingTime.toFixed(2) })}</span>
          </div>
        )}
      </div>

      {/* Search Quality Indicators */}
      {hasQuery && totalResults > 0 && (
        <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
          <span>
            {totalResults === 1
              ? t('exactMatch')
              : totalResults > 100
                ? t('manyResults')
                : t('goodResults')}
          </span>
        </div>
      )}
    </div>
  );
}
