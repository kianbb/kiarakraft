'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, X } from 'lucide-react';

interface ExploreFiltersProps {
  initialSearch: string;
  initialCategory: string;
  initialSort: string;
  locale: string;
  // Optional precomputed texts/options from the server for SSR-friendly output
  precomputed?: {
    searchPlaceholder: string;
    clearFilters: string;
    selectCategory: string;
    categories: { value: string; label: string }[];
    sortOptions: { value: string; label: string }[];
  };
}

export function ExploreFilters({ initialSearch, initialCategory, initialSort, locale, precomputed }: ExploreFiltersProps) {
  const [isHydrated, setIsHydrated] = useState(false);
  useEffect(() => setIsHydrated(true), []);

  const _t = useTranslations('explore');
  const _tCategories = useTranslations('categories');
  // When not hydrated, prefer server-provided texts to avoid showing translation keys in SSR
  const t = isHydrated ? _t : ((k: string) => k) as (k: string) => string;
  const tCategories = isHydrated ? _tCategories : ((k: string) => k) as (k: string) => string;
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const [searchTerm, setSearchTerm] = useState(initialSearch);
  const [selectedCategory, setSelectedCategory] = useState(initialCategory);
  const [sortBy, setSortBy] = useState(initialSort);

  // Build categories and sort options.
  // Use precomputed values on the server (before hydration), and live translations after hydration.
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
        { value: 'price_low', label: t('filters.priceLowToHigh') },
        { value: 'price_high', label: t('filters.priceHighToLow') },
        { value: 'popular', label: t('filters.popular') }
      ]
    : precomputed.sortOptions;

  const updateFilters = (updates: Record<string, string>) => {
    const params = new URLSearchParams(searchParams.toString());
    
    // Update with new values
    Object.entries(updates).forEach(([key, value]) => {
      if (value && value !== 'all') {
        params.set(key, value);
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
    updateFilters({ search: searchTerm });
  };

  const handleCategoryChange = (value: string) => {
    setSelectedCategory(value);
    updateFilters({ category: value, sort: sortBy });
  };

  const handleSortChange = (value: string) => {
    setSortBy(value);
    updateFilters({ sort: value, category: selectedCategory });
  };

  const clearAllFilters = () => {
    setSearchTerm('');
    setSelectedCategory('all');
    setSortBy('newest');
    router.push(`/${locale}/explore`);
  };

  const hasActiveFilters = searchTerm || selectedCategory !== 'all' || sortBy !== 'newest';

  return (
    <div className="mb-8 space-y-4">
      {/* Search Bar */}
      <form onSubmit={handleSearch} className="relative">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
          <Input
            type="text"
            placeholder={isHydrated || !precomputed ? t('searchPlaceholder') : precomputed.searchPlaceholder}
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
                updateFilters({ search: '' });
              }}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </form>

      {/* Filters Row */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1">
          <Select value={selectedCategory} onValueChange={handleCategoryChange}>
            <SelectTrigger>
              <SelectValue placeholder={isHydrated || !precomputed ? t('filters.selectCategory') : precomputed.selectCategory} />
            </SelectTrigger>
            <SelectContent>
              {categories.map((category) => (
                <SelectItem key={category.value} value={category.value}>
                  {category.label}
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

        {hasActiveFilters && (
          <Button variant="outline" onClick={clearAllFilters} className="shrink-0">
            <X className="h-4 w-4 mr-2" />
            {isHydrated || !precomputed ? t('clearFilters') : precomputed.clearFilters}
          </Button>
        )}
      </div>
    </div>
  );
}