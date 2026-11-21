import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import {
  isSellerDocumentCollectionEnabled,
  isSellerIdentityCollectionEnabled,
} from '@/lib/deployment-policy';
import SellerOnboardingForm from './onboarding-form';

export default async function SellerOnboardingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const session = await auth();
  if (!session?.user) redirect(`/${locale}/auth/login`);
  if (session.user.role !== 'SELLER') redirect(`/${locale}/`);

  if (isSellerIdentityCollectionEnabled())
    return (
      <SellerOnboardingForm
        documentsEnabled={isSellerDocumentCollectionEnabled()}
      />
    );

  const t = await getTranslations({ locale, namespace: 'seller' });
  return (
    <main className="container mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-4 text-3xl font-bold">{t('sellerOnboarding')}</h1>
      <p className="mb-4 text-muted-foreground">
        {t('manualVerificationDescription')}
      </p>
      <Link
        href={`/${locale}/seller/profile`}
        className="text-primary underline"
      >
        {t('updateProfile')}
      </Link>
    </main>
  );
}
