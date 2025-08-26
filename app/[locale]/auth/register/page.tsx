'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

// Defined after schema within component

export default function RegisterPage() {
  const router = useRouter();
  const [isHydrated, setIsHydrated] = useState(false);
  useEffect(() => setIsHydrated(true), []);
  const _t = useTranslations('auth');
  const _locale = useLocale();
  const locale = isHydrated ? _locale : 'en';
  const t = isHydrated ? _t : (((k: string) => k) as (k: string) => string);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  // Build localized schema after translations are available
  const registerSchema = z
    .object({
      name: z.string().min(1, t('nameRequired')),
      email: z.string().email(t('invalidEmail')),
      password: z
        .string()
        .min(
          8,
          t('passwordMin8') || 'Password must be at least 8 characters long'
        )
        .regex(
          /[a-z]/,
          t('passwordLowercase') ||
            'Password must contain at least one lowercase letter'
        )
        .regex(
          /[A-Z]/,
          t('passwordUppercase') ||
            'Password must contain at least one uppercase letter'
        )
        .regex(
          /[0-9]/,
          t('passwordNumber') || 'Password must contain at least one number'
        )
        .refine(
          password => {
            // Check for common patterns
            const commonPatterns = [
              /(..)\1{2,}/, // 3+ repeated characters
              /123456|654321|qwerty|password|admin/i, // Common sequences
            ];
            return !commonPatterns.some(pattern => pattern.test(password));
          },
          {
            message:
              t('passwordCommon') ||
              'Password contains common patterns that are not secure',
          }
        ),
      confirmPassword: z.string(),
      role: z.enum(['BUYER', 'SELLER']),
      // Seller fields
      shopName: z.string().optional(),
      displayName: z.string().optional(),
      bio: z.string().optional(),
      region: z.string().optional(),
    })
    .refine(data => data.password === data.confirmPassword, {
      message: t('passwordsNotMatch'),
      path: ['confirmPassword'],
    })
    .superRefine((data, ctx) => {
      if (data.role === 'SELLER') {
        if (!data.shopName?.trim()) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['shopName'],
            message: t('shopNameRequired') || 'Shop name is required',
          });
        }
        if (!data.displayName?.trim()) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['displayName'],
            message: t('displayNameRequired') || 'Display name is required',
          });
        }
      }
    });
  type RegisterForm = z.infer<typeof registerSchema>;

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      role: 'BUYER',
    },
  });

  const watchRole = watch('role');

  const onSubmit = async (data: RegisterForm) => {
    try {
      setIsLoading(true);
      setError('');

      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      const result = await response.json();

      if (!response.ok) {
        // Prefer server-provided detailed messages when available (Zod issues)
        const details: Array<{ message?: string }> | undefined =
          result?.details;
        if (Array.isArray(details) && details.length > 0) {
          const first = details[0]?.message?.toString();
          setError(first || result.error || t('registrationFailed'));
        } else if (typeof result?.error === 'string') {
          setError(result.error);
        } else {
          setError(t('registrationFailed'));
        }
        return;
      }

      setSuccess(true);
      setTimeout(() => {
        router.push(`/${locale}/auth/login`);
      }, 2000);
    } catch {
      setError(t('registrationFailed'));
    } finally {
      setIsLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="max-w-md w-full space-y-8 p-8 text-center">
          <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded">
            {t('registrationSuccess')}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background py-12">
      <div className="max-w-md w-full space-y-8 p-8">
        <div className="text-center">
          <h2 className="text-3xl font-bold text-foreground">
            {t('register')}
          </h2>
          <p className="mt-2 text-muted-foreground">{t('registerSubtitle')}</p>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleSubmit(onSubmit)}>
          {error && (
            <div className="bg-destructive/10 border border-destructive/20 text-destructive px-4 py-3 rounded">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <Label htmlFor="name">{t('name')}</Label>
              <Input
                id="name"
                type="text"
                autoComplete="name"
                {...register('name')}
                className="mt-1"
              />
              {errors.name && (
                <p className="mt-1 text-sm text-destructive">
                  {errors.name.message}
                </p>
              )}
            </div>

            <div>
              <Label htmlFor="email">{t('email')}</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                {...register('email')}
                className="mt-1"
              />
              {errors.email && (
                <p className="mt-1 text-sm text-destructive">
                  {errors.email.message}
                </p>
              )}
            </div>

            <div>
              <Label htmlFor="password">{t('password')}</Label>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                {...register('password')}
                className="mt-1"
              />
              <div className="mt-1 text-xs text-muted-foreground space-y-1">
                <p>{t('passwordRequirements')}:</p>
                <ul className="list-disc list-inside space-y-0.5">
                  <li>{t('passwordMin8')}</li>
                  <li>{t('passwordLowercase')}</li>
                  <li>{t('passwordUppercase')}</li>
                  <li>{t('passwordNumber')}</li>
                  <li>{t('passwordNoCommon')}</li>
                </ul>
              </div>
              {errors.password && (
                <p className="mt-1 text-sm text-destructive">
                  {errors.password.message}
                </p>
              )}
            </div>

            <div>
              <Label htmlFor="confirmPassword">{t('confirmPassword')}</Label>
              <Input
                id="confirmPassword"
                type="password"
                autoComplete="new-password"
                {...register('confirmPassword')}
                className="mt-1"
              />
              {errors.confirmPassword && (
                <p className="mt-1 text-sm text-destructive">
                  {errors.confirmPassword.message}
                </p>
              )}
            </div>

            <div>
              <Label htmlFor="role">{t('role')}</Label>
              <select
                id="role"
                {...register('role')}
                className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <option value="BUYER">{t('buyer')}</option>
                <option value="SELLER">{t('seller')}</option>
              </select>
            </div>

            {watchRole === 'SELLER' && (
              <>
                <div>
                  <Label htmlFor="shopName">{t('shopName')}</Label>
                  <Input
                    id="shopName"
                    type="text"
                    {...register('shopName')}
                    className="mt-1"
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="displayName">{t('displayName')}</Label>
                  <Input
                    id="displayName"
                    type="text"
                    {...register('displayName')}
                    className="mt-1"
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="region">{t('region')}</Label>
                  <Input
                    id="region"
                    type="text"
                    {...register('region')}
                    className="mt-1"
                    placeholder={t('regionPlaceholder')}
                  />
                </div>

                <div>
                  <Label htmlFor="bio">{t('bio')}</Label>
                  <textarea
                    id="bio"
                    {...register('bio')}
                    className="mt-1 flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    placeholder={t('bioPlaceholder')}
                  />
                </div>
              </>
            )}
          </div>

          <div>
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? t('creating') : t('register')}
            </Button>
          </div>

          <div className="text-center">
            <p className="text-muted-foreground">
              {t('alreadyHaveAccount')}{' '}
              <Link
                href={`/${locale}/auth/login`}
                className="font-medium text-primary hover:text-primary/80"
              >
                {t('login')}
              </Link>
            </p>
          </div>
        </form>
      </div>
    </div>
  );
}
