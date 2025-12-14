import { Badge } from '@/components/ui/badge';
import { Truck, Package, Globe, MapPin } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Metadata } from 'next';

interface ShippingPolicyPageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({
  params,
}: ShippingPolicyPageProps): Promise<Metadata> {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'shipping' });

  return {
    title: `${t('title')} - Kiara Kraft`,
    description: t('description'),
    robots: 'index, follow',
  };
}

export default async function ShippingPolicyPage({
  params,
}: ShippingPolicyPageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'shipping' });

  const lastUpdated = '2025-08-18';

  return (
    <div className="min-h-screen py-8">
      <div className="container mx-auto px-4 max-w-4xl">
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-4 flex items-center gap-3">
            <Truck className="h-10 w-10 text-primary" />
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

        <div className="mb-8 p-4 bg-primary/10 border border-primary/20 rounded-lg">
          <div className="flex items-start gap-2">
            <Package className="h-4 w-4 text-primary mt-0.5" />
            <p className="text-primary-foreground">{t('shippingNotice')}</p>
          </div>
        </div>

        <div className="prose prose-lg max-w-none">
          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4 flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              {t('domesticShipping')}
            </h2>
            <p className="mb-6">{t('domesticDescription')}</p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="p-4 border rounded-lg text-center">
                <Truck className="h-8 w-8 mx-auto mb-3 text-primary" />
                <h3 className="font-semibold mb-2">{t('expressDelivery')}</h3>
                <p className="text-sm text-muted-foreground mb-3">
                  {t('expressDescription')}
                </p>
                <Badge variant="secondary" className="block mb-2">
                  {t('expressDays')}
                </Badge>
                <Badge variant="outline">
                  50,000 {locale === 'fa' ? 'تومان' : 'Toman'}
                </Badge>
              </div>
              <div className="p-4 border rounded-lg text-center">
                <Package className="h-8 w-8 mx-auto mb-3 text-primary" />
                <h3 className="font-semibold mb-2">{t('standardDelivery')}</h3>
                <p className="text-sm text-muted-foreground mb-3">
                  {t('standardDescription')}
                </p>
                <Badge variant="secondary" className="block mb-2">
                  {t('standardDays')}
                </Badge>
                <Badge variant="outline">
                  30,000 {locale === 'fa' ? 'تومان' : 'Toman'}
                </Badge>
              </div>
              <div className="p-4 border rounded-lg text-center">
                <MapPin className="h-8 w-8 mx-auto mb-3 text-primary" />
                <h3 className="font-semibold mb-2">{t('economyDelivery')}</h3>
                <p className="text-sm text-muted-foreground mb-3">
                  {t('economyDescription')}
                </p>
                <Badge variant="secondary" className="block mb-2">
                  {t('economyDays')}
                </Badge>
                <Badge variant="outline">
                  20,000 {locale === 'fa' ? 'تومان' : 'Toman'}
                </Badge>
              </div>
            </div>

            <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-green-700">
                <strong>{t('freeShipping')}</strong>{' '}
                {t('freeShippingDescription')}
              </p>
            </div>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4 flex items-center gap-2">
              <Globe className="h-5 w-5" />
              {t('internationalShipping')}
            </h2>
            <p className="mb-6">{t('internationalDescription')}</p>

            <div className="space-y-4">
              <div className="flex justify-between items-center p-4 border rounded-lg">
                <div>
                  <h4 className="font-semibold mb-1">{t('middleEast')}</h4>
                  <p className="text-sm text-muted-foreground">
                    {t('middleEastCountries')}
                  </p>
                </div>
                <div className="text-right">
                  <Badge variant="secondary" className="mb-2 block">
                    {t('middleEastDays')}
                  </Badge>
                  <Badge variant="outline">
                    150,000 {locale === 'fa' ? 'تومان' : 'Toman'}
                  </Badge>
                </div>
              </div>
              <div className="flex justify-between items-center p-4 border rounded-lg">
                <div>
                  <h4 className="font-semibold mb-1">{t('europe')}</h4>
                  <p className="text-sm text-muted-foreground">
                    {t('europeCountries')}
                  </p>
                </div>
                <div className="text-right">
                  <Badge variant="secondary" className="mb-2 block">
                    {t('europeDays')}
                  </Badge>
                  <Badge variant="outline">
                    250,000 {locale === 'fa' ? 'تومان' : 'Toman'}
                  </Badge>
                </div>
              </div>
              <div className="flex justify-between items-center p-4 border rounded-lg">
                <div>
                  <h4 className="font-semibold mb-1">{t('northAmerica')}</h4>
                  <p className="text-sm text-muted-foreground">
                    {t('northAmericaCountries')}
                  </p>
                </div>
                <div className="text-right">
                  <Badge variant="secondary" className="mb-2 block">
                    {t('northAmericaDays')}
                  </Badge>
                  <Badge variant="outline">
                    300,000 {locale === 'fa' ? 'تومان' : 'Toman'}
                  </Badge>
                </div>
              </div>
              <div className="flex justify-between items-center p-4 border rounded-lg">
                <div>
                  <h4 className="font-semibold mb-1">{t('restOfWorld')}</h4>
                  <p className="text-sm text-muted-foreground">
                    {t('restOfWorldCountries')}
                  </p>
                </div>
                <div className="text-right">
                  <Badge variant="secondary" className="mb-2 block">
                    {t('restOfWorldDays')}
                  </Badge>
                  <Badge variant="outline">
                    350,000 {locale === 'fa' ? 'تومان' : 'Toman'}
                  </Badge>
                </div>
              </div>
            </div>

            <div className="mt-6 p-4 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-amber-800">
                <strong>{locale === 'fa' ? 'توجه:' : 'Note:'}</strong>{' '}
                {t('customsNote')}
              </p>
            </div>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">
              {t('processingTimes')}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h4 className="font-semibold mb-3">
                  {t('standardProcessing')}
                </h4>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li>
                    <strong>{t('readyMadeItems')}</strong> {t('readyMadeDays')}
                  </li>
                  <li>
                    <strong>{t('customOrders')}</strong> {t('customOrdersDays')}
                  </li>
                  <li>
                    <strong>{t('bulkOrders')}</strong> {t('bulkOrdersDays')}
                  </li>
                </ul>
              </div>

              <div>
                <h4 className="font-semibold mb-3">
                  {t('factorsAffectingProcessing')}
                </h4>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li>{t('artisanAvailability')}</li>
                  <li>{t('productComplexity')}</li>
                  <li>{t('materialSourcing')}</li>
                  <li>{t('seasonalDemand')}</li>
                </ul>
              </div>
            </div>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">
              {t('packagingProtection')}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h4 className="font-semibold mb-3">{t('productProtection')}</h4>
                <ul className="space-y-1 text-sm text-muted-foreground">
                  <li>{t('highQualityPackaging')}</li>
                  <li>{t('cushioningFragile')}</li>
                  <li>{t('waterproofWrapping')}</li>
                  <li>{t('clearLabeling')}</li>
                </ul>
              </div>

              <div>
                <h4 className="font-semibold mb-3">
                  {t('sustainablePackaging')}
                </h4>
                <ul className="space-y-1 text-sm text-muted-foreground">
                  <li>🌱 {t('recycledMaterials')}</li>
                  <li>🌱 {t('biodegradablePackaging')}</li>
                  <li>🌱 {t('minimalPackaging')}</li>
                  <li>🌱 {t('reusableContainers')}</li>
                </ul>
              </div>
            </div>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">
              {t('trackingDelivery')}
            </h2>
            <div className="space-y-4">
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <h4 className="font-semibold text-blue-800 mb-2">
                  {t('domesticTracking')}
                </h4>
                <p className="text-sm text-blue-700">
                  {t('domesticTrackingDescription')}
                </p>
              </div>

              <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                <h4 className="font-semibold text-green-800 mb-2">
                  {t('internationalTracking')}
                </h4>
                <p className="text-sm text-green-700">
                  {t('internationalTrackingDescription')}
                </p>
              </div>

              <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                <h4 className="font-semibold text-amber-800 mb-2">
                  {t('deliveryAttempts')}
                </h4>
                <p className="text-sm text-amber-700">
                  {t('deliveryAttemptsDescription')}
                </p>
              </div>
            </div>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">
              {t('shippingRestrictions')}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h4 className="font-semibold mb-3 text-red-600">
                  {t('prohibitedItems')}
                </h4>
                <ul className="space-y-1 text-sm text-muted-foreground">
                  <li>{t('antiques')}</li>
                  <li>{t('preciousMetals')}</li>
                  <li>{t('culturalHeritage')}</li>
                  <li>{t('hazardousMaterials')}</li>
                  <li>{t('specialPermits')}</li>
                </ul>
              </div>

              <div>
                <h4 className="font-semibold mb-3 text-amber-600">
                  {t('restrictedItems')}
                </h4>
                <ul className="space-y-1 text-sm text-muted-foreground">
                  <li>⚠️ {t('largeTextiles')}</li>
                  <li>⚠️ {t('ceramicItems')}</li>
                  <li>⚠️ {t('foodProducts')}</li>
                  <li>⚠️ {t('plantMaterials')}</li>
                </ul>
              </div>
            </div>
          </section>
        </div>

        <div className="mt-12 p-6 bg-muted/50 border rounded-lg">
          <h2 className="text-xl font-semibold mb-4">{t('shippingSupport')}</h2>
          <p className="text-muted-foreground mb-4">
            {t('supportDescription')}
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2 text-sm">
              <p>
                <strong>{t('generalInquiries')}:</strong>{' '}
                shipping@kiarakraft.com
              </p>
              <p>
                <strong>{t('orderTracking')}:</strong> track@kiarakraft.com
              </p>
              <p>
                <strong>{t('internationalSupport')}:</strong> +98 21 1234 5678
              </p>
            </div>
            <div className="space-y-2 text-sm">
              <p>
                <strong>{t('hours')}:</strong> {t('supportHours')}
              </p>
              <p>
                <strong>{t('responseTime')}:</strong> {t('supportResponseTime')}
              </p>
              <p>
                <strong>{t('emergency')}:</strong> +98 912 345 6789
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
