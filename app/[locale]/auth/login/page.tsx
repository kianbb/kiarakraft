'use client';

import { useState, useEffect } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

// Schema will be constructed inside the component to allow localized messages

// Type is defined after schema within component

export default function LoginPage() {
  const router = useRouter();

  const [isHydrated, setIsHydrated] = useState(false);
  useEffect(() => setIsHydrated(true), []);
  const _locale = useLocale();
  const _t = useTranslations('auth');
  const locale = isHydrated ? _locale : 'en';
  const t = isHydrated ? _t : (((k: string) => k) as (k: string) => string);
  const loginSchema = z.object({
    email: z.string().email(t('invalidEmail')),
    password: z.string().min(1, t('passwordRequired')),
  });
  type LoginForm = z.infer<typeof loginSchema>;

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginForm) => {
    try {
      setIsLoading(true);
      setError('');

      const result = await signIn('credentials', {
        email: data.email,
        password: data.password,
        redirect: false,
      });

      if (result?.error) {
        // Always show specific error for wrong credentials
        // NextAuth v5 returns "CredentialsSignin" for auth failures
        setError(t('invalidCredentials'));
      } else if (result?.ok === false) {
        // Handle other types of failures
        setError(t('invalidCredentials'));
      } else {
        // Redirect to the previous page or home
        const callbackUrl = new URLSearchParams(window.location.search).get(
          'callbackUrl'
        );
        router.push(callbackUrl || `/${locale}`);
        router.refresh();
      }
    } catch (error) {
      console.log('[LOGIN DEBUG] Exception during login:', error);
      setError(t('loginFailed'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="max-w-md w-full space-y-8 p-8">
        <div className="text-center">
          <h2 className="text-3xl font-bold text-foreground">{t('login')}</h2>
          <p className="mt-2 text-muted-foreground">{t('loginSubtitle')}</p>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleSubmit(onSubmit)}>
          {error && (
            <div className="bg-destructive/10 border border-destructive/20 text-destructive px-4 py-3 rounded">
              {error}
            </div>
          )}

          <div className="space-y-4">
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
                autoComplete="current-password"
                {...register('password')}
                className="mt-1"
              />
              {errors.password && (
                <p className="mt-1 text-sm text-destructive">
                  {errors.password.message}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="text-sm">
              <Link
                href={`/${locale}/forgot-password`}
                className="font-medium text-primary hover:text-primary/80"
              >
                {t('forgotPassword')}?
              </Link>
            </div>
          </div>

          <div>
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? t('signingIn') : t('login')}
            </Button>
          </div>

          <div className="text-center">
            <p className="text-muted-foreground">
              {t('dontHaveAccount')}{' '}
              <Link
                href={`/${locale}/auth/register`}
                className="font-medium text-primary hover:text-primary/80"
              >
                {t('register')}
              </Link>
            </p>
          </div>
        </form>
      </div>
    </div>
  );
}
