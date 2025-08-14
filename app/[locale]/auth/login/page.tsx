'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter, usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required')
});

type LoginForm = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const pathname = usePathname();
  const locale = pathname.split('/')[1] || 'fa';
  const t = useTranslations('auth');
  
  // Debug logging
  console.log('🔍 LOGIN PAGE DEBUG:', {
    pathname,
    locale,
    timestamp: new Date().toISOString(),
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'SSR'
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const {
    register,
    handleSubmit,
    formState: { errors }
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema)
  });

  const onSubmit = async (data: LoginForm) => {
    try {
      setIsLoading(true);
      setError('');

      const result = await signIn('credentials', {
        email: data.email,
        password: data.password,
        redirect: false
      });

      if (result?.error) {
        setError('Invalid email or password');
      } else {
        // Redirect to the previous page or home
        const callbackUrl = new URLSearchParams(window.location.search).get('callbackUrl');
        router.push(callbackUrl || `/${locale}`);
        router.refresh();
      }
    } catch {
      setError('An error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Add visible debug indicator
  console.log('🎨 LOGIN COMPONENT RENDERING');
  
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      {/* Debug banner - remove after fixing */}
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        backgroundColor: '#ef4444',
        color: 'white',
        padding: '8px',
        textAlign: 'center',
        fontSize: '12px',
        zIndex: 9999
      }}>
        🐛 DEBUG: Login page loaded at {new Date().toLocaleTimeString()} | 
        <a href={`/${locale}/auth/login/debug`} style={{ color: '#fbbf24', textDecoration: 'underline' }}>
          Debug Info
        </a>
      </div>
      
      <div className="max-w-md w-full space-y-8 p-8" style={{ marginTop: '40px' }}>
        <div className="text-center">
          <h2 className="text-3xl font-bold text-foreground">
            {t('login')}
          </h2>
          <p className="mt-2 text-muted-foreground">
            Sign in to your account
          </p>
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

          <div>
            <Button
              type="submit"
              className="w-full"
              disabled={isLoading}
            >
              {isLoading ? 'Signing in...' : t('login')}
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