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
}

export function ExploreFilters({ initialSearch, initialCategory, initialSort, locale }: ExploreFiltersProps) {
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

  const categories = [
    { value: 'all', label: t('filters.allCategories') },
    { value: 'ceramics', label: tCategories('ceramics') },
    { value: 'textiles', label: tCategories('textiles') },
    { value: 'jewelry', label: tCategories('jewelry') },
    { value: 'woodwork', label: tCategories('woodwork') },
    { value: 'painting', label: tCategories('painting') }
  ];

  const sortOptions = [
    { value: 'newest', label: t('filters.newest') },
    { value: 'oldest', label: t('filters.oldest') },
    { value: 'price_low', label: t('filters.priceLowToHigh') },
    { value: 'price_high', label: t('filters.priceHighToLow') },
    { value: 'popular', label: t('filters.popular') }
  ];

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
            placeholder={t('searchPlaceholder')}
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
              <SelectValue placeholder={t('filters.selectCategory')} />
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
            {t('clearFilters')}
          </Button>
        )}
      </div>
    </div>
  );
}