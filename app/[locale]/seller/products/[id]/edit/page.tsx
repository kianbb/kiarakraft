'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useTranslations } from 'next-intl';
import { useRouter, useParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Edit } from 'lucide-react';
// Type for the form-compatible product data structure
interface FormCompatibleProduct {
  id: string;
  name: string;
  description: string;
  price: number;
  stock: number;
  category: string;
  imageUrl: string;
  tags?: string;
}

const productSchema = z.object({
  name: z.string().min(1, 'Product name is required'),
  description: z.string().min(10, 'Description must be at least 10 characters'),
  price: z.number().min(1, 'Price must be greater than 0'),
  stock: z.number().min(0, 'Stock cannot be negative'),
  category: z.enum(['ceramics', 'textiles', 'jewelry', 'woodwork', 'painting']),
  imageUrl: z.string().url('Must be a valid URL'),
  tags: z.string().optional()
});

type ProductForm = z.infer<typeof productSchema>;

export default function EditProductPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const params = useParams();

  const [isHydrated, setIsHydrated] = useState(false);
  useEffect(() => setIsHydrated(true), []);
  const _t = useTranslations('seller');
  const _tCategories = useTranslations('categories');
  const t = isHydrated ? _t : ((k: string) => k) as (k: string) => string;
  const tCategories = isHydrated ? _tCategories : ((k: string) => k) as (k: string) => string;
  const [updating, setUpdating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [product, setProduct] = useState<FormCompatibleProduct | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    reset,
    formState: { errors }
  } = useForm<ProductForm>({
    resolver: zodResolver(productSchema)
  });

  const fetchProduct = useCallback(async () => {
    try {
      const response = await fetch(`/api/seller/products/${params.id}`);
      if (response.ok) {
        const productData = await response.json();
        setProduct(productData);
        
        // Populate form with existing data
        reset({
          name: productData.name,
          description: productData.description,
          price: productData.price,
          stock: productData.stock,
          category: productData.category,
          imageUrl: productData.imageUrl,
          tags: productData.tags || ''
        });
      } else {
        router.push('/seller/products');
      }
    } catch (error) {
      console.error('Error fetching product:', error);
      router.push('/seller/products');
    } finally {
      setLoading(false);
    }
  }, [params.id, router, reset]);

  useEffect(() => {
    if (status === 'loading') return;
    
    if (!session) {
      router.push('/auth/login');
      return;
    }

    if (session.user?.role !== 'SELLER') {
      router.push('/');
      return;
    }

    fetchProduct();
  }, [session, status, router, params.id, fetchProduct]);

  if (status === 'loading' || loading) {
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

  if (!session || session.user?.role !== 'SELLER' || !product) {
    return null;
  }

  const onSubmit = async (data: ProductForm) => {
    setUpdating(true);
    try {
      const response = await fetch(`/api/seller/products/${params.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });

      if (response.ok) {
        router.push('/seller/products');
      } else {
        alert(t('errorUpdatingProduct'));
      }
    } catch (error) {
      console.error('Error updating product:', error);
      alert(t('errorUpdatingProduct'));
    } finally {
      setUpdating(false);
    }
  };

  const categories = [
    { value: 'ceramics', label: tCategories('ceramics') },
    { value: 'textiles', label: tCategories('textiles') },
    { value: 'jewelry', label: tCategories('jewelry') },
    { value: 'woodwork', label: tCategories('woodwork') },
    { value: 'painting', label: tCategories('painting') }
  ];

  return (
    <div className="min-h-screen py-8">
      <div className="container mx-auto px-4 max-w-2xl">
        <div className="mb-8">
          <Link href="/seller/products" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-4">
            <ArrowLeft className="h-4 w-4" />
            {t('backToProducts')}
          </Link>
          
          <div className="flex items-center gap-3">
            <Edit className="h-8 w-8 text-primary" />
            <div>
              <h1 className="text-3xl font-bold">{t('editProduct')}</h1>
              <p className="text-muted-foreground">{product.name}</p>
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
                <p className="text-sm text-destructive mt-1">{errors.name.message}</p>
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
                <p className="text-sm text-destructive mt-1">{errors.description.message}</p>
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
                  <p className="text-sm text-destructive mt-1">{errors.price.message}</p>
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
                  <p className="text-sm text-destructive mt-1">{errors.stock.message}</p>
                )}
              </div>
            </div>

            <div>
              <Label htmlFor="category">{t('category')}</Label>
              <Select onValueChange={(value) => setValue('category', value as 'ceramics' | 'textiles' | 'jewelry' | 'woodwork' | 'painting')} defaultValue={product.category}>
                <SelectTrigger>
                  <SelectValue placeholder={t('selectCategory')} />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((category) => (
                    <SelectItem key={category.value} value={category.value}>
                      {category.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.category && (
                <p className="text-sm text-destructive mt-1">{errors.category.message}</p>
              )}
            </div>

            <div>
              <Label htmlFor="imageUrl">{t('productImageUrl')}</Label>
              <Input
                id="imageUrl"
                {...register('imageUrl')}
                placeholder="https://images.unsplash.com/photo-..."
              />
              {errors.imageUrl && (
                <p className="text-sm text-destructive mt-1">{errors.imageUrl.message}</p>
              )}
            </div>

            <div>
              <Label htmlFor="tags">{t('productTags')}</Label>
              <Input
                id="tags"
                {...register('tags')}
                placeholder={t('productTagsPlaceholder')}
              />
              <p className="text-xs text-muted-foreground mt-1">{t('tagsHelpText')}</p>
            </div>
          </div>

          <div className="flex gap-4 pt-6 border-t">
            <Link href="/seller/products" className="flex-1">
              <Button variant="outline" className="w-full">
                {t('cancel')}
              </Button>
            </Link>
            <Button type="submit" disabled={updating} className="flex-1">
              {updating ? t('updating') : t('updateProduct')}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}