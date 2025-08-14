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
import { ArrowLeft, User, Save } from 'lucide-react';
import { formatDate } from '@/lib/utils';

// Type for the seller profile data structure
interface SellerProfileData {
  id: string;
  email: string;
  name?: string;
  bio?: string;
  phone?: string;
  address?: string;
  website?: string;
  createdAt: string | Date;
}

const profileSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  bio: z.string().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  website: z.string().optional().refine((val) => !val || val === '' || /^https?:\/\/.+/.test(val), 'Must be a valid URL')
});

type ProfileForm = z.infer<typeof profileSchema>;

export default function SellerProfilePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const t = useTranslations('seller');
  const [updating, setUpdating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<SellerProfileData | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors }
  } = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema)
  });

  const fetchProfile = useCallback(async () => {
    try {
      const response = await fetch('/api/seller/profile');
      if (response.ok) {
        const profileData = await response.json();
        setProfile(profileData);
        
        // Populate form with existing data
        reset({
          name: profileData.name || '',
          bio: profileData.bio || '',
          phone: profileData.phone || '',
          address: profileData.address || '',
          website: profileData.website || ''
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

  const onSubmit = async (data: ProfileForm) => {
    setUpdating(true);
    try {
      const response = await fetch('/api/seller/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
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
      <div className="container mx-auto px-4 max-w-2xl">
        <div className="mb-8">
          <Link href="/seller" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-4">
            <ArrowLeft className="h-4 w-4" />
            {t('backToDashboard')}
          </Link>
          
          <div className="flex items-center gap-3">
            <User className="h-8 w-8 text-primary" />
            <div>
              <h1 className="text-3xl font-bold">{t('profile')}</h1>
              <p className="text-muted-foreground">{t('manageYourProfile')}</p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <div className="space-y-4">
            <div>
              <Label htmlFor="name">{t('fullName')}</Label>
              <Input
                id="name"
                {...register('name')}
                placeholder={t('fullNamePlaceholder')}
              />
              {errors.name && (
                <p className="text-sm text-destructive mt-1">{errors.name.message}</p>
              )}
            </div>

            <div>
              <Label htmlFor="bio">{t('bio')}</Label>
              <textarea
                id="bio"
                {...register('bio')}
                placeholder={t('bioPlaceholder')}
                className="w-full min-h-[120px] px-3 py-2 border border-input rounded-md resize-none"
              />
              {errors.bio && (
                <p className="text-sm text-destructive mt-1">{errors.bio.message}</p>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="phone">{t('phone')}</Label>
                <Input
                  id="phone"
                  {...register('phone')}
                  placeholder="+98 912 345 6789"
                />
                {errors.phone && (
                  <p className="text-sm text-destructive mt-1">{errors.phone.message}</p>
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
                  <p className="text-sm text-destructive mt-1">{errors.website.message}</p>
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
                <p className="text-sm text-destructive mt-1">{errors.address.message}</p>
              )}
            </div>
          </div>

          {/* Profile Stats */}
          <div className="pt-6 border-t">
            <h3 className="font-semibold mb-4">{t('accountInfo')}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 bg-gray-50 rounded-lg">
                <div className="text-sm text-muted-foreground">{t('email')}</div>
                <div className="font-medium">{profile.email}</div>
              </div>
              <div className="p-4 bg-gray-50 rounded-lg">
                <div className="text-sm text-muted-foreground">{t('memberSince')}</div>
                <div className="font-medium">{formatDate(profile.createdAt)}</div>
              </div>
            </div>
          </div>

          <div className="flex gap-4 pt-6 border-t">
            <Link href="/seller" className="flex-1">
              <Button variant="outline" className="w-full">
                {t('cancel')}
              </Button>
            </Link>
            <Button type="submit" disabled={updating} className="flex-1">
              <Save className="h-4 w-4 mr-2" />
              {updating ? t('updating') : t('updateProfile')}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}