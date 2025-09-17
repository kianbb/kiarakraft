'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useTranslations, useLocale } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ImageUpload, type UploadedImage } from '@/components/ui/image-upload';
import { ArrowLeft, Package } from 'lucide-react';

const productSchema = z.object({
  name: z.string().min(1, 'Product name is required'),
  description: z.string().min(10, 'Description must be at least 10 characters'),
  price: z.number().min(1, 'Price must be greater than 0'),
  stock: z.number().min(0, 'Stock cannot be negative'),
  category: z.enum(['ceramics', 'textiles', 'jewelry', 'woodwork', 'painting']),
  tags: z.string().optional(),
  images: z
    .array(
      z.object({
        url: z.string().url({ message: 'Invalid URL format' }),
        alt: z.string().optional(),
        sortOrder: z.number(),
      })
    )
    .min(1, 'At least one image is required'),
});

type ProductForm = z.infer<typeof productSchema>;

export default function NewProductPage() {
  const locale = useLocale();
  const { data: session, status } = useSession();
  const router = useRouter();
  const [isHydrated, setIsHydrated] = useState(false);
  useEffect(() => setIsHydrated(true), []);
  const _t = useTranslations('seller');
  const _tCategories = useTranslations('categories');
  const t = isHydrated ? _t : (((k: string) => k) as (k: string) => string);
  const tCategories = isHydrated
    ? _tCategories
    : (((k: string) => k) as (k: string) => string);
  const [creating, setCreating] = useState(false);
  const [images, setImages] = useState<UploadedImage[]>([]);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<ProductForm>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      images: [],
    },
  });

  // Update form when images change
  useEffect(() => {
    setValue(
      'images',
      images.map(img => ({
        url: img.url,
        alt: img.alt,
        sortOrder: img.sortOrder,
      }))
    );
  }, [images, setValue]);

  if (status === 'loading') {
    return (
      <div className="min-h-screen py-8">
        <div className="container mx-auto px-4">
          <div className="animate-pulse">
            <div className="bg-gray-200 h-8 rounded mb-8"></div>
            <div className="bg-gray-200 h-96 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  if (!session || session.user?.role !== 'SELLER') {
    router.push(`/${locale}/auth/login`);
    return null;
  }

  const handleProductCreate = async (data: ProductForm, withAI: boolean) => {
    setCreating(true);
    try {
      const response = await fetch('/api/seller/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, useAI: withAI }),
      });

      if (response.ok) {
        router.push(`/${locale}/seller/products`);
      } else {
        const errorData = await response.json();
        console.error('Product creation error:', errorData);

        // Build detailed error message
        let errorMessage = t('errorCreatingProduct');
        if (errorData.error) {
          errorMessage = errorData.error;
        }
        if (errorData.details) {
          errorMessage += '\n\n' + errorData.details;
        }

        // Add field-specific errors if any
        if (errorData.fields) {
          const fieldErrors = Object.entries(errorData.fields)
            .filter(([, error]) => error)
            .map(([field, error]) => `${field}: ${error}`)
            .join('\n');
          if (fieldErrors) {
            errorMessage += '\n\n' + 'Field errors:\n' + fieldErrors;
          }
        }

        alert(errorMessage);
      }
    } catch (error) {
      console.error('Error creating product:', error);
      alert(
        t('errorCreatingProduct') +
          '\n\n' +
          (error instanceof Error ? error.message : 'Unknown error')
      );
    } finally {
      setCreating(false);
    }
  };

  // Default form submission (for Enter key)
  const onSubmit = (data: ProductForm) => {
    handleProductCreate(data, true); // Default to with AI
  };

  const categories = [
    { value: 'ceramics', label: tCategories('ceramics') },
    { value: 'textiles', label: tCategories('textiles') },
    { value: 'jewelry', label: tCategories('jewelry') },
    { value: 'woodwork', label: tCategories('woodwork') },
    { value: 'painting', label: tCategories('painting') },
  ];

  return (
    <div className="min-h-screen py-8">
      <div className="container mx-auto px-4 max-w-2xl">
        <div className="mb-8">
          <Link
            href={`/${locale}/seller/products`}
            className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-4"
          >
            <ArrowLeft className="h-4 w-4" />
            {t('backToProducts')}
          </Link>

          <div className="flex items-center gap-3">
            <Package className="h-8 w-8 text-primary" />
            <div>
              <h1 className="text-3xl font-bold">{t('addProduct')}</h1>
              <p className="text-muted-foreground">
                {t('addProductDescription')}
              </p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <div className="space-y-4">
            <div>
              <Label htmlFor="name">{t('productTitle')}</Label>
              <Input
                id="name"
                {...register('name')}
                placeholder={t('productTitlePlaceholder')}
              />
              {errors.name && (
                <p className="text-sm text-destructive mt-1">
                  {errors.name.message}
                </p>
              )}
            </div>

            <div>
              <Label htmlFor="description">{t('productDescription')}</Label>
              <textarea
                id="description"
                {...register('description')}
                placeholder={t('productDescriptionPlaceholder')}
                className="w-full min-h-[120px] px-3 py-2 border border-input rounded-md resize-none"
              />
              {errors.description && (
                <p className="text-sm text-destructive mt-1">
                  {errors.description.message}
                </p>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="price">{t('productPrice')}</Label>
                <Input
                  id="price"
                  type="number"
                  min="0"
                  step="1000"
                  {...register('price', { valueAsNumber: true })}
                  placeholder="0"
                />
                {errors.price && (
                  <p className="text-sm text-destructive mt-1">
                    {errors.price.message}
                  </p>
                )}
              </div>

              <div>
                <Label htmlFor="stock">{t('productStock')}</Label>
                <Input
                  id="stock"
                  type="number"
                  min="0"
                  {...register('stock', { valueAsNumber: true })}
                  placeholder="0"
                />
                {errors.stock && (
                  <p className="text-sm text-destructive mt-1">
                    {errors.stock.message}
                  </p>
                )}
              </div>
            </div>

            <div>
              <Label htmlFor="category">{t('category')}</Label>
              <Select
                onValueChange={value =>
                  setValue(
                    'category',
                    value as
                      | 'ceramics'
                      | 'textiles'
                      | 'jewelry'
                      | 'woodwork'
                      | 'painting'
                  )
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('selectCategory')} />
                </SelectTrigger>
                <SelectContent>
                  {categories.map(category => (
                    <SelectItem key={category.value} value={category.value}>
                      {category.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.category && (
                <p className="text-sm text-destructive mt-1">
                  {errors.category.message}
                </p>
              )}
            </div>

            <div>
              <Label>{t('productImages')}</Label>
              <ImageUpload
                images={images}
                onImagesChange={setImages}
                maxImages={8}
                disabled={creating}
              />
              {errors.images && (
                <p className="text-sm text-destructive mt-1">
                  {errors.images.message}
                </p>
              )}
            </div>

            <div>
              <Label htmlFor="tags">{t('productTags')}</Label>
              <Input
                id="tags"
                {...register('tags')}
                placeholder={t('productTagsPlaceholder')}
              />
              <p className="text-xs text-muted-foreground mt-1">
                {t('tagsHelpText')}
              </p>
            </div>
          </div>

          <div className="flex gap-4 pt-6 border-t">
            <Link href={`/${locale}/seller/products`}>
              <Button variant="outline" type="button">
                {t('cancel')}
              </Button>
            </Link>
            <div className="flex-1 flex gap-2">
              <Button
                type="button"
                variant="secondary"
                disabled={creating}
                onClick={() => {
                  handleSubmit(data => handleProductCreate(data, false))();
                }}
                className="flex-1"
              >
                {creating
                  ? t('creating')
                  : t('createProductNoAI') || 'Submit without AI'}
              </Button>
              <Button
                type="button"
                disabled={creating}
                onClick={() => {
                  handleSubmit(data => handleProductCreate(data, true))();
                }}
                className="flex-1 bg-primary hover:bg-primary/90"
              >
                {creating
                  ? t('creating')
                  : t('createProductWithAI') || 'Submit with AI ✨'}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
