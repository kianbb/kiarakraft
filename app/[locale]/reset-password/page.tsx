'use client';

import { useState, useEffect, Suspense } from 'react';
import { useTranslations } from 'next-intl';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Shield,
  Eye,
  EyeOff,
  CheckCircle,
  XCircle,
  ArrowLeft,
} from 'lucide-react';
import { toast } from 'sonner';

const resetPasswordSchema = z
  .object({
    password: z.string().min(8, 'Password must be at least 8 characters long'),
    confirmPassword: z.string().min(1, 'Password confirmation is required'),
  })
  .refine(data => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
  });

type ResetPasswordForm = z.infer<typeof resetPasswordSchema>;

interface TokenValidationResult {
  valid: boolean;
  email?: string;
  expiresAt?: string;
  error?: string;
}

function ResetPasswordContent() {
  const [tokenValid, setTokenValid] = useState<boolean | null>(null);
  const [userEmail, setUserEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);

  const t = useTranslations('auth');
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const locale = params.locale as string;
  const token = searchParams.get('token');

  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
  } = useForm<ResetPasswordForm>({
    resolver: zodResolver(resetPasswordSchema),
  });

  const password = watch('password', '');

  // Validate token on component mount
  useEffect(() => {
    if (!token) {
      setTokenValid(false);
      return;
    }

    const validateToken = async () => {
      try {
        const response = await fetch(
          `/api/auth/reset-password?token=${encodeURIComponent(token)}`
        );
        const result: TokenValidationResult = await response.json();

        if (result.valid) {
          setTokenValid(true);
          setUserEmail(result.email || '');
        } else {
          setTokenValid(false);
          toast.error(result.error || 'Invalid or expired reset token');
        }
      } catch (error) {
        console.error('Token validation error:', error);
        setTokenValid(false);
        toast.error('Error validating reset token');
      }
    };

    validateToken();
  }, [token]);

  const onSubmit = async (data: ResetPasswordForm) => {
    if (!token) {
      toast.error('Reset token is missing');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          token,
          password: data.password,
          confirmPassword: data.confirmPassword,
        }),
      });

      const result = await response.json();

      if (response.ok) {
        setResetSuccess(true);
        toast.success(result.message);
      } else {
        toast.error(result.error || 'An error occurred. Please try again.');
      }
    } catch (error) {
      console.error('Reset password error:', error);
      toast.error('Network error. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleBackToLogin = () => {
    router.push(`/${locale}/auth/login`);
  };

  // Loading state while validating token
  if (tokenValid === null) {
    return (
      <div className="min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full space-y-8">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-sm text-gray-600">{t('validatingToken')}</p>
          </div>
        </div>
      </div>
    );
  }

  // Invalid token state
  if (tokenValid === false) {
    return (
      <div className="min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full space-y-8">
          <div className="text-center">
            <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-red-100">
              <XCircle className="h-8 w-8 text-red-600" />
            </div>
            <h2 className="mt-6 text-3xl font-bold text-gray-900">
              {t('invalidToken')}
            </h2>
            <p className="mt-2 text-sm text-gray-600">
              {t('invalidTokenDescription')}
            </p>
          </div>

          <div className="space-y-4">
            <Button
              type="button"
              className="w-full"
              onClick={() => router.push(`/${locale}/forgot-password`)}
            >
              {t('requestNewResetLink')}
            </Button>

            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={handleBackToLogin}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              {t('backToLogin')}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Success state
  if (resetSuccess) {
    return (
      <div className="min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full space-y-8">
          <div className="text-center">
            <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-green-100">
              <CheckCircle className="h-8 w-8 text-green-600" />
            </div>
            <h2 className="mt-6 text-3xl font-bold text-gray-900">
              {t('passwordResetSuccess')}
            </h2>
            <p className="mt-2 text-sm text-gray-600">
              {t('passwordResetSuccessDescription')}
            </p>
          </div>

          <Button type="button" className="w-full" onClick={handleBackToLogin}>
            {t('signInNow')}
          </Button>
        </div>
      </div>
    );
  }

  // Reset password form
  return (
    <div className="min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-blue-100">
            <Shield className="h-8 w-8 text-blue-600" />
          </div>
          <h2 className="mt-6 text-3xl font-bold text-gray-900">
            {t('resetPassword')}
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            {t('resetPasswordFor')} <strong>{userEmail}</strong>
          </p>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleSubmit(onSubmit)}>
          <div className="space-y-4">
            <div>
              <Label htmlFor="password">{t('newPassword')}</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  className={`pr-10 ${errors.password ? 'border-red-500' : ''}`}
                  placeholder={t('enterNewPassword')}
                  {...register('password')}
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 pr-3 flex items-center"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4 text-gray-400" />
                  ) : (
                    <Eye className="h-4 w-4 text-gray-400" />
                  )}
                </button>
              </div>
              {errors.password && (
                <p className="mt-1 text-sm text-red-600">
                  {errors.password.message}
                </p>
              )}

              {/* Password strength indicator */}
              {password && (
                <div className="mt-2">
                  <div className="flex space-x-1">
                    {[1, 2, 3, 4].map(level => (
                      <div
                        key={level}
                        className={`h-1 w-1/4 rounded ${
                          password.length >= level * 2
                            ? level <= 2
                              ? 'bg-red-500'
                              : level === 3
                                ? 'bg-yellow-500'
                                : 'bg-green-500'
                            : 'bg-gray-200'
                        }`}
                      />
                    ))}
                  </div>
                  <p className="text-xs text-gray-600 mt-1">
                    {password.length < 8 && t('passwordTooShort')}
                    {password.length >= 8 &&
                      password.length < 12 &&
                      t('passwordWeak')}
                    {password.length >= 12 && t('passwordStrong')}
                  </p>
                </div>
              )}
            </div>

            <div>
              <Label htmlFor="confirmPassword">{t('confirmPassword')}</Label>
              <div className="relative">
                <Input
                  id="confirmPassword"
                  type={showConfirmPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  className={`pr-10 ${errors.confirmPassword ? 'border-red-500' : ''}`}
                  placeholder={t('confirmNewPassword')}
                  {...register('confirmPassword')}
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 pr-3 flex items-center"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                >
                  {showConfirmPassword ? (
                    <EyeOff className="h-4 w-4 text-gray-400" />
                  ) : (
                    <Eye className="h-4 w-4 text-gray-400" />
                  )}
                </button>
              </div>
              {errors.confirmPassword && (
                <p className="mt-1 text-sm text-red-600">
                  {errors.confirmPassword.message}
                </p>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? t('resetting') : t('resetPassword')}
            </Button>

            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={handleBackToLogin}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              {t('backToLogin')}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      }
    >
      <ResetPasswordContent />
    </Suspense>
  );
}
