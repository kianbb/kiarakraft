'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Search, X, Filter, DollarSign, Shield } from 'lucide-react';

interface SearchFacets {
  categories: Array<{ id: string; name: string; count: number }>;
  priceRanges: Array<{ min: number; max: number; count: number }>;
  verifiedSellers: number;
}

interface ExploreFiltersProps {
  initialSearch: string;
  initialCategory: string;
  initialSort: string;
  initialMinPrice?: string;
  initialMaxPrice?: string;
  initialVerified?: boolean;
  locale: string;
  facets?: SearchFacets;
  precomputed?: {
    searchPlaceholder: string;
    clearFilters: string;
    selectCategory: string;
    priceRange: string;
    verifiedOnly: string;
    categories: { value: string; label: string }[];
    sortOptions: { value: string; label: string }[];
  };
}

export function ExploreFilters({ 
  initialSearch, 
  initialCategory, 
  initialSort, 
  initialMinPrice,
  initialMaxPrice,
  initialVerified,
  locale, 
  facets,
  precomputed 
}: ExploreFiltersProps) {
  const [isHydrated, setIsHydrated] = useState(false);
  useEffect(() => setIsHydrated(true), []);

  const _t = useTranslations('explore');
  const _tCategories = useTranslations('categories');
  const t = isHydrated ? _t : ((k: string) => k) as (k: string) => string;
  const tCategories = isHydrated ? _tCategories : ((k: string) => k) as (k: string) => string;
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const [searchTerm, setSearchTerm] = useState(initialSearch);
  const [selectedCategory, setSelectedCategory] = useState(initialCategory);
  const [sortBy, setSortBy] = useState(initialSort);
  const [minPrice, setMinPrice] = useState(initialMinPrice || '');
  const [maxPrice, setMaxPrice] = useState(initialMaxPrice || '');
  const [verifiedOnly, setVerifiedOnly] = useState(initialVerified || false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Build categories and sort options
  const categories = isHydrated || !precomputed
    ? [
        { value: 'all', label: t('filters.allCategories') },
        { value: 'ceramics', label: tCategories('ceramics') },
        { value: 'textiles', label: tCategories('textiles') },
        { value: 'jewelry', label: tCategories('jewelry') },
        { value: 'woodwork', label: tCategories('woodwork') },
        { value: 'painting', label: tCategories('painting') }
      ]
    : precomputed.categories;

  const sortOptions = isHydrated || !precomputed
    ? [
        { value: 'newest', label: t('filters.newest') },
        { value: 'oldest', label: t('filters.oldest') },
        { value: 'price_asc', label: t('filters.priceLowToHigh') },
        { value: 'price_desc', label: t('filters.priceHighToLow') },
        { value: 'relevance', label: t('filters.relevance') }
      ]
    : precomputed.sortOptions;

  const updateFilters = (updates: Record<string, string | boolean | undefined>) => {
    const params = new URLSearchParams(searchParams.toString());
    
    // Update with new values
    Object.entries(updates).forEach(([key, value]) => {
      if (value !== undefined && value !== '' && value !== false && value !== 'all') {
        params.set(key, String(value));
      } else {
        params.delete(key);
      }
    });
    
    // Reset to first page when filters change
    params.delete('page');
    
    const queryString = params.toString();
    const newUrl = `/${locale}/explore${queryString ? `?${queryString}` : ''}`;
    
    router.push(newUrl);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    updateFilters({ q: searchTerm });
  };

  const handleCategoryChange = (value: string) => {
    setSelectedCategory(value);
    updateFilters({ category: value });
  };

  const handleSortChange = (value: string) => {
    setSortBy(value);
    updateFilters({ sort: value });
  };

  const handlePriceFilter = () => {
    updateFilters({ 
      minPrice: minPrice || undefined,
      maxPrice: maxPrice || undefined
    });
  };

  const handleVerifiedToggle = () => {
    const newVerified = !verifiedOnly;
    setVerifiedOnly(newVerified);
    updateFilters({ verified: newVerified ? 'true' : undefined });
  };

  const clearAllFilters = () => {
    setSearchTerm('');
    setSelectedCategory('all');
    setSortBy('newest');
    setMinPrice('');
    setMaxPrice('');
    setVerifiedOnly(false);
    router.push(`/${locale}/explore`);
  };

  const hasActiveFilters = searchTerm || selectedCategory !== 'all' || 
    sortBy !== 'newest' || minPrice || maxPrice || verifiedOnly;

  const activeFilterCount = [
    searchTerm,
    selectedCategory !== 'all' ? selectedCategory : null,
    minPrice || maxPrice ? 'price' : null,
    verifiedOnly ? 'verified' : null
  ].filter(Boolean).length;

  return (
    <div className="mb-8 space-y-4">
      {/* Search Bar */}
      <form onSubmit={handleSearch} className="relative">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
          <Input
            type="text"
            placeholder={isHydrated || !precomputed ? t('searchPlaceholder') : precomputed?.searchPlaceholder}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 pr-4 py-2"
          />
          {searchTerm && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="absolute right-2 top-1/2 transform -translate-y-1/2 h-6 w-6 p-0"
              onClick={() => {
                setSearchTerm('');
                updateFilters({ q: '' });
              }}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </form>

      {/* Basic Filters Row */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1">
          <Select value={selectedCategory} onValueChange={handleCategoryChange}>
            <SelectTrigger>
              <SelectValue placeholder={isHydrated || !precomputed ? t('filters.selectCategory') : precomputed?.selectCategory} />
            </SelectTrigger>
            <SelectContent>
              {categories.map((category) => (
                <SelectItem key={category.value} value={category.value}>
                  {category.label}
                  {facets?.categories.find(c => c.id === category.value)?.count && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      ({facets.categories.find(c => c.id === category.value)?.count})
                    </span>
                  )}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        
        <div className="flex-1">
          <Select value={sortBy} onValueChange={handleSortChange}>
            <SelectTrigger>
              <SelectValue placeholder={t('filters.sortBy')} />
            </SelectTrigger>
            <SelectContent>
              {sortOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button
          variant="outline"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="shrink-0"
        >
          <Filter className="h-4 w-4 mr-2" />
          {t('filters.advanced')}
          {activeFilterCount > 0 && (
            <Badge variant="secondary" className="ml-2 text-xs">
              {activeFilterCount}
            </Badge>
          )}
        </Button>

        {hasActiveFilters && (
          <Button variant="outline" onClick={clearAllFilters} className="shrink-0">
            <X className="h-4 w-4 mr-2" />
            {isHydrated || !precomputed ? t('clearFilters') : precomputed?.clearFilters}
          </Button>
        )}
      </div>

      {/* Advanced Filters */}
      {showAdvanced && (
        <div className="p-4 bg-gray-50 rounded-lg border space-y-4">
          <h3 className="font-medium text-sm">{t('filters.advanced')}</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Price Range */}
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <DollarSign className="h-4 w-4" />
                {t('filters.priceRange')}
              </label>
              <div className="flex gap-2">
                <Input
                  type="number"
                  placeholder={t('filters.minPrice')}
                  value={minPrice}
                  onChange={(e) => setMinPrice(e.target.value)}
                  className="flex-1"
                />
                <span className="self-center text-muted-foreground">-</span>
                <Input
                  type="number"
                  placeholder={t('filters.maxPrice')}
                  value={maxPrice}
                  onChange={(e) => setMaxPrice(e.target.value)}
                  className="flex-1"
                />
                <Button variant="outline" size="sm" onClick={handlePriceFilter}>
                  {t('apply')}
                </Button>
              </div>
              {facets?.priceRanges && facets.priceRanges.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {facets.priceRanges.map((range, index) => (
                    <Button
                      key={index}
                      variant="ghost"
                      size="sm"
                      className="text-xs h-6 px-2"
                      onClick={() => {
                        setMinPrice(String(range.min));
                        setMaxPrice(String(range.max));
                        updateFilters({ 
                          minPrice: String(range.min),
                          maxPrice: String(range.max)
                        });
                      }}
                    >
                      {range.min.toLocaleString()}-{range.max.toLocaleString()} ({range.count})
                    </Button>
                  ))}
                </div>
              )}
            </div>

            {/* Verified Sellers */}
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <Shield className="h-4 w-4" />
                {t('filters.trustAndSafety')}
              </label>
              <div className="flex items-center gap-2">
                <Button
                  variant={verifiedOnly ? "default" : "outline"}
                  size="sm"
                  onClick={handleVerifiedToggle}
                  className="flex items-center gap-2"
                >
                  <Shield className="h-3 w-3" />
                  {t('filters.verifiedSellers')}
                  {facets?.verifiedSellers && (
                    <span className="text-xs">({facets.verifiedSellers})</span>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Active Filters Display */}
      {hasActiveFilters && (
        <div className="flex flex-wrap gap-2">
          {searchTerm && (
            <Badge variant="secondary" className="flex items-center gap-1">
              <Search className="h-3 w-3" />
              {searchTerm}
              <Button
                variant="ghost"
                size="sm"
                className="h-4 w-4 p-0 ml-1"
                onClick={() => {
                  setSearchTerm('');
                  updateFilters({ q: '' });
                }}
              >
                <X className="h-3 w-3" />
              </Button>
            </Badge>
          )}
          
          {selectedCategory !== 'all' && (
            <Badge variant="secondary" className="flex items-center gap-1">
              {categories.find(c => c.value === selectedCategory)?.label}
              <Button
                variant="ghost"
                size="sm"
                className="h-4 w-4 p-0 ml-1"
                onClick={() => handleCategoryChange('all')}
              >
                <X className="h-3 w-3" />
              </Button>
            </Badge>
          )}

          {(minPrice || maxPrice) && (
            <Badge variant="secondary" className="flex items-center gap-1">
              <DollarSign className="h-3 w-3" />
              {minPrice || '0'} - {maxPrice || '∞'}
              <Button
                variant="ghost"
                size="sm"
                className="h-4 w-4 p-0 ml-1"
                onClick={() => {
                  setMinPrice('');
                  setMaxPrice('');
                  updateFilters({ minPrice: undefined, maxPrice: undefined });
                }}
              >
                <X className="h-3 w-3" />
              </Button>
            </Badge>
          )}

          {verifiedOnly && (
            <Badge variant="secondary" className="flex items-center gap-1">
              <Shield className="h-3 w-3" />
              {t('filters.verified')}
              <Button
                variant="ghost"
                size="sm"
                className="h-4 w-4 p-0 ml-1"
                onClick={handleVerifiedToggle}
              >
                <X className="h-3 w-3" />
              </Button>
            </Badge>
          )}
        </div>
      )}
    </div>
  );
}