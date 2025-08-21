'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowLeft, Settings, Save, Info } from 'lucide-react';
import { formatDate } from '@/lib/utils';

interface SellerProfileData {
  id: string;
  shopName: string;
  displayName: string;
  bio?: string;
  avatarUrl?: string;
  phone?: string;
  address?: string;
  website?: string;
  verified: boolean;
  createdAt: string | Date;
}

const settingsSchema = z.object({
  shopName: z.string().min(1, 'Shop name is required').max(100),
  displayName: z.string().min(1, 'Display name is required').max(100),
  bio: z.string().max(500, 'Bio must be less than 500 characters').optional(),
  avatarUrl: z
    .string()
    .optional()
    .refine(
      val => !val || val === '' || /^https?:\/\/.+/.test(val),
      'Must be a valid URL'
    ),
  phone: z.string().optional(),
  address: z.string().optional(),
  website: z
    .string()
    .optional()
    .refine(
      val => !val || val === '' || /^https?:\/\/.+/.test(val),
      'Must be a valid URL'
    ),
});

type SettingsForm = z.infer<typeof settingsSchema>;

export default function SellerSettingsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [isHydrated, setIsHydrated] = useState(false);
  useEffect(() => setIsHydrated(true), []);
  const _t = useTranslations('seller');
  const t = isHydrated ? _t : (((k: string) => k) as (k: string) => string);

  const [updating, setUpdating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<SellerProfileData | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<SettingsForm>({
    resolver: zodResolver(settingsSchema),
  });

  const fetchProfile = useCallback(async () => {
    try {
      const response = await fetch('/api/seller/profile');
      if (response.ok) {
        const profileData = await response.json();
        setProfile(profileData);

        reset({
          shopName: profileData.shopName || '',
          displayName: profileData.displayName || '',
          bio: profileData.bio || '',
          avatarUrl: profileData.avatarUrl || '',
          phone: profileData.phone || '',
          address: profileData.address || '',
          website: profileData.website || '',
        });
      }
    } catch (error) {
      console.error('Error fetching profile:', error);
    } finally {
      setLoading(false);
    }
  }, [reset]);

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

    fetchProfile();
  }, [session, status, router, fetchProfile]);

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

  if (!session || session.user?.role !== 'SELLER' || !profile) {
    return null;
  }

  const onSubmit = async (data: SettingsForm) => {
    setUpdating(true);
    try {
      const response = await fetch('/api/seller/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (response.ok) {
        const updatedProfile = await response.json();
        setProfile(updatedProfile);
        alert(t('profileUpdated'));
      } else {
        alert(t('errorUpdatingProfile'));
      }
    } catch (error) {
      console.error('Error updating profile:', error);
      alert(t('errorUpdatingProfile'));
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div className="min-h-screen py-8">
      <div className="container mx-auto px-4 max-w-4xl">
        <div className="mb-8">
          <Link
            href="/seller"
            className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-4"
          >
            <ArrowLeft className="h-4 w-4" />
            {t('backToDashboard')}
          </Link>

          <div className="flex items-center gap-3">
            <Settings className="h-8 w-8 text-primary" />
            <div>
              <h1 className="text-3xl font-bold">{t('shopSettings')}</h1>
              <p className="text-muted-foreground">
                {t('manageYourStorefront')}
              </p>
            </div>
          </div>
        </div>

        {/* V3-S1 Preview Notice */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-8">
          <div className="flex items-start gap-3">
            <Info className="h-5 w-5 text-blue-600 mt-0.5" />
            <div>
              <h3 className="font-medium text-blue-900">
                V3-S1 Foundation Preview
              </h3>
              <p className="text-sm text-blue-700 mt-1">
                This is the foundation for V3-S1 Seller Storefronts. The full
                implementation with public shop pages will be available after
                database migration includes: shop handles, banner images, and
                public storefront URLs.
              </p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
          {/* Shop Identity */}
          <div className="bg-white rounded-lg border p-6">
            <h2 className="text-xl font-semibold mb-4">{t('shopIdentity')}</h2>
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="shopName">{t('shopName')}</Label>
                  <Input
                    id="shopName"
                    {...register('shopName')}
                    placeholder="My Artisan Shop"
                  />
                  {errors.shopName && (
                    <p className="text-sm text-destructive mt-1">
                      {errors.shopName.message}
                    </p>
                  )}
                </div>

                <div>
                  <Label htmlFor="displayName">{t('displayName')}</Label>
                  <Input
                    id="displayName"
                    {...register('displayName')}
                    placeholder="John Doe"
                  />
                  {errors.displayName && (
                    <p className="text-sm text-destructive mt-1">
                      {errors.displayName.message}
                    </p>
                  )}
                </div>
              </div>

              <div>
                <Label htmlFor="bio">{t('bio')}</Label>
                <textarea
                  id="bio"
                  {...register('bio')}
                  placeholder={t('bioPlaceholder')}
                  className="w-full min-h-[120px] px-3 py-2 border border-input rounded-md resize-none"
                  maxLength={500}
                />
                {errors.bio && (
                  <p className="text-sm text-destructive mt-1">
                    {errors.bio.message}
                  </p>
                )}
                <p className="text-sm text-gray-500 mt-1">
                  This will be displayed on your public shop page (coming in
                  V3-S1)
                </p>
              </div>
            </div>
          </div>

          {/* Visual Branding */}
          <div className="bg-white rounded-lg border p-6">
            <h2 className="text-xl font-semibold mb-4">
              {t('visualBranding')}
            </h2>
            <div className="space-y-4">
              <div>
                <Label htmlFor="avatarUrl">{t('profileImage')}</Label>
                <Input
                  id="avatarUrl"
                  {...register('avatarUrl')}
                  placeholder="https://example.com/avatar.jpg"
                  type="url"
                />
                {errors.avatarUrl && (
                  <p className="text-sm text-destructive mt-1">
                    {errors.avatarUrl.message}
                  </p>
                )}
                <p className="text-sm text-gray-500 mt-1">
                  Profile image for your shop. Recommended size: 200x200px
                </p>
              </div>

              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="font-medium text-gray-700 mb-2">
                  Coming in V3-S1:
                </h3>
                <ul className="text-sm text-gray-600 space-y-1">
                  <li>• Shop banner images (1200x400px recommended)</li>
                  <li>• Custom shop handles (yourshop.kiarakraft.com)</li>
                  <li>• Public storefront pages</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Contact Information */}
          <div className="bg-white rounded-lg border p-6">
            <h2 className="text-xl font-semibold mb-4">{t('contactInfo')}</h2>
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="phone">{t('phone')}</Label>
                  <Input
                    id="phone"
                    {...register('phone')}
                    placeholder="+98 912 345 6789"
                  />
                  {errors.phone && (
                    <p className="text-sm text-destructive mt-1">
                      {errors.phone.message}
                    </p>
                  )}
                </div>

                <div>
                  <Label htmlFor="website">{t('website')}</Label>
                  <Input
                    id="website"
                    {...register('website')}
                    placeholder="https://example.com"
                  />
                  {errors.website && (
                    <p className="text-sm text-destructive mt-1">
                      {errors.website.message}
                    </p>
                  )}
                </div>
              </div>

              <div>
                <Label htmlFor="address">{t('address')}</Label>
                <Input
                  id="address"
                  {...register('address')}
                  placeholder={t('addressPlaceholder')}
                />
                {errors.address && (
                  <p className="text-sm text-destructive mt-1">
                    {errors.address.message}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Account Info */}
          <div className="bg-white rounded-lg border p-6">
            <h3 className="font-semibold mb-4">{t('accountInfo')}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 bg-gray-50 rounded-lg">
                <div className="text-sm text-muted-foreground">
                  {t('email')}
                </div>
                <div className="font-medium">{session.user?.email}</div>
              </div>
              <div className="p-4 bg-gray-50 rounded-lg">
                <div className="text-sm text-muted-foreground">
                  {t('memberSince')}
                </div>
                <div className="font-medium">
                  {formatDate(profile.createdAt)}
                </div>
              </div>
            </div>
          </div>

          {/* Form Actions */}
          <div className="flex gap-4 pt-6 border-t">
            <Link href="/seller" className="flex-1">
              <Button variant="outline" className="w-full">
                {t('cancel')}
              </Button>
            </Link>
            <Button type="submit" disabled={updating} className="flex-1">
              <Save className="h-4 w-4 mr-2" />
              {updating ? t('updating') : t('saveSettings')}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
