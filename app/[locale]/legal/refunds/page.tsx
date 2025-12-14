import { Badge } from '@/components/ui/badge';
import { RefreshCw, AlertTriangle } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Metadata } from 'next';

interface RefundsPolicyPageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({
  params,
}: RefundsPolicyPageProps): Promise<Metadata> {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'refunds' });

  return {
    title: `${t('title')} - Kiara Kraft`,
    description: t('description'),
    robots: 'index, follow',
  };
}

export default async function RefundPolicyPage({
  params,
}: RefundsPolicyPageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'refunds' });

  const lastUpdated = '2025-08-18';

  return (
    <div className="min-h-screen py-8">
      <div className="container mx-auto px-4 max-w-4xl">
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-4 flex items-center gap-3">
            <RefreshCw className="h-10 w-10 text-primary" />
            {t('title')}
          </h1>
          <div className="flex items-center gap-4 text-muted-foreground">
            <Badge variant="secondary">
              {t('lastUpdated')}: {lastUpdated}
            </Badge>
            <span>
              {t('effectiveDate')}: {lastUpdated}
            </span>
          </div>
        </div>

        <div className="mb-8 p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5" />
            <p className="text-amber-700">{t('timelineNotice')}</p>
          </div>
        </div>

        <div className="prose prose-lg max-w-none">
          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">
              {t('refundTimeline')}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <div className="p-4 border border-blue-200 bg-blue-50 rounded-lg text-center">
                <h3 className="font-semibold mb-2">1. {t('request')}</h3>
                <p className="text-sm">{t('requestPeriod')}</p>
              </div>
              <div className="p-4 border border-yellow-200 bg-yellow-50 rounded-lg text-center">
                <h3 className="font-semibold mb-2">2. {t('review')}</h3>
                <p className="text-sm">{t('reviewPeriod')}</p>
              </div>
              <div className="p-4 border border-green-200 bg-green-50 rounded-lg text-center">
                <h3 className="font-semibold mb-2">3. {t('decision')}</h3>
                <p className="text-sm">{t('decisionPeriod')}</p>
              </div>
              <div className="p-4 border border-purple-200 bg-purple-50 rounded-lg text-center">
                <h3 className="font-semibold mb-2">4. {t('processing')}</h3>
                <p className="text-sm">{t('processingPeriod')}</p>
              </div>
            </div>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">
              {t('eligibleForRefund')}
            </h2>
            <div className="space-y-3">
              <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                <h3 className="font-semibold text-green-800 mb-1">
                  {t('defectiveProducts')}
                </h3>
                <p className="text-sm text-green-700">
                  {t('defectiveDescription')}
                </p>
              </div>
              <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                <h3 className="font-semibold text-green-800 mb-1">
                  {t('shippingDamage')}
                </h3>
                <p className="text-sm text-green-700">
                  {t('shippingDamageDescription')}
                </p>
              </div>
              <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                <h3 className="font-semibold text-green-800 mb-1">
                  {t('significantlyMisdescribed')}
                </h3>
                <p className="text-sm text-green-700">
                  {t('significantlyMisdescribedDescription')}
                </p>
              </div>
              <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                <h3 className="font-semibold text-green-800 mb-1">
                  {t('notReceived')}
                </h3>
                <p className="text-sm text-green-700">
                  {t('notReceivedDescription')}
                </p>
              </div>
            </div>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">
              {t('notEligibleForRefund')}
            </h2>
            <div className="space-y-3">
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                <h3 className="font-semibold text-red-800 mb-1">
                  {t('customOrders')}
                </h3>
                <p className="text-sm text-red-700">
                  {t('customOrdersDescription')}
                </p>
              </div>
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                <h3 className="font-semibold text-red-800 mb-1">
                  {t('usedItems')}
                </h3>
                <p className="text-sm text-red-700">
                  {t('usedItemsDescription')}
                </p>
              </div>
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                <h3 className="font-semibold text-red-800 mb-1">
                  {t('finalSaleItems')}
                </h3>
                <p className="text-sm text-red-700">
                  {t('finalSaleItemsDescription')}
                </p>
              </div>
            </div>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">
              {t('howToRequestRefund')}
            </h2>
            <div className="space-y-4">
              <div className="flex gap-4 p-4 border rounded-lg">
                <div className="w-8 h-8 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-sm font-bold">
                  1
                </div>
                <div>
                  <h4 className="font-semibold mb-2">
                    {t('contactCustomerService')}
                  </h4>
                  <p className="text-sm text-muted-foreground">
                    {t('contactDescription')}
                  </p>
                </div>
              </div>
              <div className="flex gap-4 p-4 border rounded-lg">
                <div className="w-8 h-8 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-sm font-bold">
                  2
                </div>
                <div>
                  <h4 className="font-semibold mb-2">
                    {t('provideDocumentation')}
                  </h4>
                  <p className="text-sm text-muted-foreground">
                    {t('documentationDescription')}
                  </p>
                </div>
              </div>
              <div className="flex gap-4 p-4 border rounded-lg">
                <div className="w-8 h-8 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-sm font-bold">
                  3
                </div>
                <div>
                  <h4 className="font-semibold mb-2">{t('waitForReview')}</h4>
                  <p className="text-sm text-muted-foreground">
                    {t('waitDescription')}
                  </p>
                </div>
              </div>
              <div className="flex gap-4 p-4 border rounded-lg">
                <div className="w-8 h-8 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-sm font-bold">
                  4
                </div>
                <div>
                  <h4 className="font-semibold mb-2">
                    {t('returnIfApproved')}
                  </h4>
                  <p className="text-sm text-muted-foreground">
                    {t('returnDescription')}
                  </p>
                </div>
              </div>
            </div>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">
              {t('specialConditions')}
            </h2>
            <div className="space-y-4">
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <h4 className="font-semibold text-blue-800 mb-2">
                  {t('handmadeVariations')}
                </h4>
                <p className="text-sm text-blue-700">
                  {t('handmadeVariationsDescription')}
                </p>
              </div>
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                <h4 className="font-semibold text-amber-800 mb-2">
                  {t('internationalOrders')}
                </h4>
                <p className="text-sm text-amber-700">
                  {t('internationalOrdersDescription')}
                </p>
              </div>
            </div>
          </section>
        </div>

        <div className="mt-12 p-6 bg-muted/50 border rounded-lg">
          <h2 className="text-xl font-semibold mb-4">{t('needHelp')}</h2>
          <p className="text-muted-foreground mb-4">
            {t('needHelpDescription')}
          </p>
          <div className="space-y-2 text-sm">
            <p>
              <strong>{t('email')}:</strong> refunds@kiarakraft.com
            </p>
            <p>
              <strong>{t('phone')}:</strong> +98 21 1234 5678
            </p>
            <p>
              <strong>{t('hours')}:</strong> {t('hoursValue')}
            </p>
            <p>
              <strong>{t('responseTime')}:</strong> {t('responseTimeValue')}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
