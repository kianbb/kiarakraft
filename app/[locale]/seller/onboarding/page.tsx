'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useTranslations, useLocale } from 'next-intl';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
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
import {
  CheckCircle,
  ArrowRight,
  ArrowLeft,
  Shield,
  Upload,
  User,
  MapPin,
} from 'lucide-react';
import { toast } from 'sonner';

const IRAN_PROVINCES = [
  'تهران',
  'اصفهان',
  'فارس',
  'خراسان رضوی',
  'خوزستان',
  'مازندران',
  'کرمان',
  'آذربایجان شرقی',
  'آذربایجان غربی',
  'گیلان',
  'کردستان',
  'همدان',
  'قزوین',
  'زنجان',
  'لرستان',
  'البرز',
  'کرمانشاه',
  'گلستان',
  'یزد',
  'سمنان',
  'قم',
  'مرکزی',
  'هرمزگان',
  'چهارمحال و بختیاری',
  'کهگیلویه و بویراحمد',
  'بوشهر',
  'ایلام',
  'سیستان و بلوچستان',
  'خراسان شمالی',
  'خراسان جنوبی',
  'اردبیل',
];

const profileSchema = z.object({
  shopName: z.string().min(2, 'Shop name must be at least 2 characters'),
  displayName: z.string().min(2, 'Display name must be at least 2 characters'),
  bio: z
    .string()
    .min(20, 'Bio must be at least 20 characters')
    .max(500, 'Bio must be less than 500 characters'),
  website: z.string().url('Must be a valid URL').optional().or(z.literal('')),
});

const contactSchema = z.object({
  phone: z.string().min(10, 'Phone number is required'),
  province: z.string().min(1, 'Province is required'),
  city: z.string().min(2, 'City is required'),
  address: z.string().min(10, 'Address must be at least 10 characters'),
});

const verificationSchema = z.object({
  nationalId: z
    .string()
    .min(8, 'National ID is required')
    .max(20, 'National ID too long'),
  agreeToTerms: z
    .boolean()
    .refine(val => val === true, 'You must agree to terms'),
});

type ProfileForm = z.infer<typeof profileSchema>;
type ContactForm = z.infer<typeof contactSchema>;
type VerificationForm = z.infer<typeof verificationSchema>;

export default function SellerOnboardingPage() {
  const locale = useLocale();
  const { data: session, status } = useSession();
  const router = useRouter();
  const [isHydrated, setIsHydrated] = useState(false);
  useEffect(() => setIsHydrated(true), []);
  const _t = useTranslations('seller');
  const t = isHydrated ? _t : (((k: string) => k) as (k: string) => string);

  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [uploadedDocs, setUploadedDocs] = useState<string[]>([]);

  // Step 1: Profile
  const {
    register: registerProfile,
    handleSubmit: handleProfileSubmit,
    formState: { errors: profileErrors },
    watch: watchProfile,
  } = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
  });

  // Step 2: Contact
  const {
    register: registerContact,
    handleSubmit: handleContactSubmit,
    setValue: setContactValue,
    formState: { errors: contactErrors },
    watch: watchContact,
  } = useForm<ContactForm>({
    resolver: zodResolver(contactSchema),
  });

  // Step 3: Verification
  const {
    register: registerVerification,
    handleSubmit: handleVerificationSubmit,
    formState: { errors: verificationErrors },
  } = useForm<VerificationForm>({
    resolver: zodResolver(verificationSchema),
  });

  useEffect(() => {
    if (status === 'loading') return;

    if (!session) {
      router.push(`/${locale}/auth/login`);
      return;
    }

    if (session.user?.role !== 'SELLER') {
      router.push(`/${locale}/`);
      return;
    }
  }, [session, status, router]);

  const handleDocumentUpload = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setLoading(true);
    try {
      const arr = Array.from(files);
      const baseCount = uploadedDocs.length;
      for (let i = 0; i < arr.length; i++) {
        const file = arr[i];
        const formData = new FormData();
        formData.append('file', file);
        formData.append('type', 'verification');

        const response = await fetch(
          `/api/seller/documents/upload?count=${baseCount + i}`,
          {
            method: 'POST',
            body: formData,
          }
        );

        if (response.ok) {
          const result = await response.json();
          setUploadedDocs(prev => [...prev, result.url]);
          toast.success('Document uploaded successfully');
        } else {
          let msg = 'Failed to upload document';
          try {
            const err = await response.json();
            msg = err?.message || msg;
          } catch {}
          toast.error(msg);
        }
      }
    } catch (error) {
      console.error('Upload error:', error);
      toast.error('Upload failed');
    } finally {
      setLoading(false);
    }
  };

  const onProfileSubmit = (data: ProfileForm) => {
    console.log('Profile data:', data);
    setCurrentStep(2);
  };

  const onContactSubmit = (data: ContactForm) => {
    console.log('Contact data:', data);
    setCurrentStep(3);
  };

  const onVerificationSubmit = async (data: VerificationForm) => {
    setLoading(true);
    try {
      const profileData = watchProfile();
      const contactData = watchContact();

      const completeData = {
        ...profileData,
        ...contactData,
        nationalId: data.nationalId,
        uploadedDocs,
      };

      const response = await fetch('/api/seller/onboarding/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(completeData),
      });

      if (response.ok) {
        toast.success('Onboarding completed! Pending verification.');
        router.push(`/${locale}/seller`);
      } else {
        const error = await response.json();
        toast.error(error.message || 'Failed to complete onboarding');
      }
    } catch (error) {
      console.error('Onboarding error:', error);
      toast.error('Failed to complete onboarding');
    } finally {
      setLoading(false);
    }
  };

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
    return null;
  }

  const steps = [
    {
      number: 1,
      title: t('profileInfo'),
      icon: User,
      completed: currentStep > 1,
    },
    {
      number: 2,
      title: t('contactInfo'),
      icon: MapPin,
      completed: currentStep > 2,
    },
    { number: 3, title: t('verification'), icon: Shield, completed: false },
  ];

  return (
    <div className="min-h-screen py-8">
      <div className="container mx-auto px-4 max-w-2xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-4">{t('sellerOnboarding')}</h1>
          <p className="text-muted-foreground">{t('onboardingDescription')}</p>
        </div>

        {/* Progress Steps */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            {steps.map((step, index) => {
              const Icon = step.icon;
              const isActive = currentStep === step.number;
              const isCompleted = step.completed;

              return (
                <div key={step.number} className="flex items-center">
                  <div
                    className={`
                    flex items-center justify-center w-10 h-10 rounded-full border-2 
                    ${
                      isCompleted
                        ? 'bg-green-500 border-green-500 text-white'
                        : isActive
                          ? 'bg-primary border-primary text-primary-foreground'
                          : 'border-gray-300 text-gray-400'
                    }
                  `}
                  >
                    {isCompleted ? (
                      <CheckCircle className="h-5 w-5" />
                    ) : (
                      <Icon className="h-5 w-5" />
                    )}
                  </div>

                  <div className="ml-3">
                    <div
                      className={`text-sm font-medium ${isActive || isCompleted ? 'text-foreground' : 'text-muted-foreground'}`}
                    >
                      {step.title}
                    </div>
                  </div>

                  {index < steps.length - 1 && (
                    <div
                      className={`mx-6 h-0.5 w-16 ${isCompleted ? 'bg-green-500' : 'bg-gray-300'}`}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Step Content */}
        <div className="bg-white rounded-lg border p-6">
          {currentStep === 1 && (
            <form
              onSubmit={handleProfileSubmit(onProfileSubmit)}
              className="space-y-6"
            >
              <div className="text-center mb-6">
                <User className="h-12 w-12 mx-auto text-primary mb-4" />
                <h2 className="text-xl font-semibold">
                  {t('profileInformation')}
                </h2>
                <p className="text-muted-foreground">
                  {t('profileInfoDescription')}
                </p>
              </div>

              <div>
                <Label htmlFor="shopName">{t('shopName')} *</Label>
                <Input
                  id="shopName"
                  {...registerProfile('shopName')}
                  placeholder={t('shopNamePlaceholder')}
                />
                {profileErrors.shopName && (
                  <p className="text-sm text-destructive mt-1">
                    {profileErrors.shopName.message}
                  </p>
                )}
              </div>

              <div>
                <Label htmlFor="displayName">{t('displayName')} *</Label>
                <Input
                  id="displayName"
                  {...registerProfile('displayName')}
                  placeholder={t('displayNamePlaceholder')}
                />
                {profileErrors.displayName && (
                  <p className="text-sm text-destructive mt-1">
                    {profileErrors.displayName.message}
                  </p>
                )}
              </div>

              <div>
                <Label htmlFor="bio">{t('bio')} *</Label>
                <textarea
                  id="bio"
                  {...registerProfile('bio')}
                  placeholder={t('bioPlaceholder')}
                  className="w-full min-h-[120px] px-3 py-2 border border-input rounded-md resize-none"
                />
                {profileErrors.bio && (
                  <p className="text-sm text-destructive mt-1">
                    {profileErrors.bio.message}
                  </p>
                )}
              </div>

              <div>
                <Label htmlFor="website">{t('website')}</Label>
                <Input
                  id="website"
                  {...registerProfile('website')}
                  placeholder="https://your-website.com"
                />
                {profileErrors.website && (
                  <p className="text-sm text-destructive mt-1">
                    {profileErrors.website.message}
                  </p>
                )}
              </div>

              <div className="flex justify-end">
                <Button type="submit">
                  {t('next')} <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </div>
            </form>
          )}

          {currentStep === 2 && (
            <form
              onSubmit={handleContactSubmit(onContactSubmit)}
              className="space-y-6"
            >
              <div className="text-center mb-6">
                <MapPin className="h-12 w-12 mx-auto text-primary mb-4" />
                <h2 className="text-xl font-semibold">
                  {t('contactInformation')}
                </h2>
                <p className="text-muted-foreground">
                  {t('contactInfoDescription')}
                </p>
              </div>

              <div>
                <Label htmlFor="phone">{t('phoneNumber')} *</Label>
                <Input
                  id="phone"
                  {...registerContact('phone')}
                  placeholder="09123456789"
                />
                {contactErrors.phone && (
                  <p className="text-sm text-destructive mt-1">
                    {contactErrors.phone.message}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="province">{t('province')} *</Label>
                  <Select
                    onValueChange={value => setContactValue('province', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t('selectProvince')} />
                    </SelectTrigger>
                    <SelectContent>
                      {IRAN_PROVINCES.map(province => (
                        <SelectItem key={province} value={province}>
                          {province}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {contactErrors.province && (
                    <p className="text-sm text-destructive mt-1">
                      {contactErrors.province.message}
                    </p>
                  )}
                </div>

                <div>
                  <Label htmlFor="city">{t('city')} *</Label>
                  <Input
                    id="city"
                    {...registerContact('city')}
                    placeholder={t('cityPlaceholder')}
                  />
                  {contactErrors.city && (
                    <p className="text-sm text-destructive mt-1">
                      {contactErrors.city.message}
                    </p>
                  )}
                </div>
              </div>

              <div>
                <Label htmlFor="address">{t('address')} *</Label>
                <textarea
                  id="address"
                  {...registerContact('address')}
                  placeholder={t('addressPlaceholder')}
                  className="w-full min-h-[80px] px-3 py-2 border border-input rounded-md resize-none"
                />
                {contactErrors.address && (
                  <p className="text-sm text-destructive mt-1">
                    {contactErrors.address.message}
                  </p>
                )}
              </div>

              <div className="flex justify-between">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setCurrentStep(1)}
                >
                  <ArrowLeft className="h-4 w-4 mr-2" /> {t('back')}
                </Button>
                <Button type="submit">
                  {t('next')} <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </div>
            </form>
          )}

          {currentStep === 3 && (
            <form
              onSubmit={handleVerificationSubmit(onVerificationSubmit)}
              className="space-y-6"
            >
              <div className="text-center mb-6">
                <Shield className="h-12 w-12 mx-auto text-primary mb-4" />
                <h2 className="text-xl font-semibold">{t('verification')}</h2>
                <p className="text-muted-foreground">
                  {t('verificationDescription')}
                </p>
              </div>

              <div>
                <Label htmlFor="nationalId">{t('nationalId')} *</Label>
                <Input
                  id="nationalId"
                  {...registerVerification('nationalId')}
                  placeholder={t('nationalIdPlaceholder')}
                  type="password"
                />
                {verificationErrors.nationalId && (
                  <p className="text-sm text-destructive mt-1">
                    {verificationErrors.nationalId.message}
                  </p>
                )}
                <p className="text-xs text-muted-foreground mt-1">
                  {t('nationalIdPrivacyNote')}
                </p>
              </div>

              <div>
                <Label>{t('supportingDocuments')}</Label>
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                  <input
                    type="file"
                    accept=".jpg,.jpeg,.png,.pdf"
                    multiple
                    onChange={handleDocumentUpload}
                    className="hidden"
                    id="docs-upload"
                  />
                  <Upload className="h-8 w-8 mx-auto text-gray-400 mb-2" />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      document.getElementById('docs-upload')?.click()
                    }
                    disabled={loading}
                  >
                    {loading ? t('uploading') : t('uploadDocuments')}
                  </Button>
                  <p className="text-sm text-muted-foreground mt-2">
                    {t('documentsNote')}
                  </p>
                </div>

                {uploadedDocs.length > 0 && (
                  <div className="mt-4">
                    <p className="text-sm font-medium mb-2">
                      {t('uploadedDocuments')}:
                    </p>
                    <ul className="space-y-1">
                      {uploadedDocs.map((doc, index) => (
                        <li
                          key={index}
                          className="text-sm text-green-600 flex items-center"
                        >
                          <CheckCircle className="h-4 w-4 mr-2" />
                          {t('document')} {index + 1}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="agreeToTerms"
                  {...registerVerification('agreeToTerms')}
                  className="rounded"
                />
                <Label htmlFor="agreeToTerms" className="text-sm">
                  {t('agreeToTerms')}{' '}
                  <Link
                    href={`/${locale}/legal/terms`}
                    className="text-primary underline"
                  >
                    {t('termsAndConditions')}
                  </Link>
                </Label>
              </div>
              {verificationErrors.agreeToTerms && (
                <p className="text-sm text-destructive">
                  {verificationErrors.agreeToTerms.message}
                </p>
              )}

              <div className="flex justify-between">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setCurrentStep(2)}
                >
                  <ArrowLeft className="h-4 w-4 mr-2" /> {t('back')}
                </Button>
                <Button type="submit" disabled={loading}>
                  {loading ? t('submitting') : t('completeOnboarding')}
                </Button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
