import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Badge } from '@/components/ui/badge';
import { Shield } from 'lucide-react';

interface PrivacyPageProps {
  params: { locale: string };
}

export async function generateMetadata({ params: { locale } }: PrivacyPageProps) {
  const t = await getTranslations({ locale, namespace: 'privacy' });
  
  return {
    title: `${t('title')} - Kiara Kraft`,
    description: t('description'),
    robots: 'index, follow',
  };
}

export default async function PrivacyPolicyPage({ params: { locale } }: PrivacyPageProps) {
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'privacy' });

  return (
    <div className="min-h-screen py-8">
      <div className="container mx-auto px-4 max-w-4xl">
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-4 flex items-center gap-3">
            <Shield className="h-10 w-10 text-primary" />
            {t('title')}
          </h1>
          <div className="flex items-center gap-4 text-muted-foreground">
            <Badge variant="secondary">{t('lastUpdated')}: August 18, 2025</Badge>
            <span>{t('effectiveDate')}: August 18, 2025</span>
          </div>
        </div>

        <div className="prose prose-lg max-w-none">
          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">1. {t('informationCollect.title')}</h2>
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-medium mb-2">{t('informationCollect.personal.title')}</h3>
                <p>{t('informationCollect.personal.content')}</p>
              </div>
              <div>
                <h3 className="text-lg font-medium mb-2">{t('informationCollect.usage.title')}</h3>
                <p>{t('informationCollect.usage.content')}</p>
              </div>
              <div>
                <h3 className="text-lg font-medium mb-2">{t('informationCollect.device.title')}</h3>
                <p>{t('informationCollect.device.content')}</p>
              </div>
            </div>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">2. {t('howWeUse.title')}</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>{t('howWeUse.process')}</li>
              <li>{t('howWeUse.communicate')}</li>
              <li>{t('howWeUse.improve')}</li>
              <li>{t('howWeUse.prevent')}</li>
              <li>{t('howWeUse.marketing')}</li>
              <li>{t('howWeUse.comply')}</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">3. {t('informationSharing.title')}</h2>
            <p className="mb-4">{t('informationSharing.intro')}</p>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Sellers:</strong> {t('informationSharing.sellers')}</li>
              <li><strong>Service Providers:</strong> {t('informationSharing.serviceProviders')}</li>
              <li><strong>Legal Authorities:</strong> {t('informationSharing.legal')}</li>
              <li><strong>Business Transfers:</strong> {t('informationSharing.business')}</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">4. {t('dataSecurity.title')}</h2>
            <p className="mb-4">{t('dataSecurity.intro')}</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>{t('dataSecurity.ssl')}</li>
              <li>{t('dataSecurity.secure')}</li>
              <li>{t('dataSecurity.monitoring')}</li>
              <li>{t('dataSecurity.training')}</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">5. {t('yourRights.title')}</h2>
            <p className="mb-4">{t('yourRights.intro')}</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>{t('yourRights.access')}</li>
              <li>{t('yourRights.correct')}</li>
              <li>{t('yourRights.delete')}</li>
              <li>{t('yourRights.export')}</li>
              <li>{t('yourRights.optOut')}</li>
              <li>{t('yourRights.restrict')}</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">6. {t('cookies.title')}</h2>
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-medium mb-2">{t('cookies.essential.title')}</h3>
                <p>{t('cookies.essential.content')}</p>
              </div>
              <div>
                <h3 className="text-lg font-medium mb-2">{t('cookies.analytics.title')}</h3>
                <p>{t('cookies.analytics.content')}</p>
              </div>
              <div>
                <h3 className="text-lg font-medium mb-2">{t('cookies.marketing.title')}</h3>
                <p>{t('cookies.marketing.content')}</p>
              </div>
            </div>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">7. {t('childrens.title')}</h2>
            <p>
              {t('childrens.content')}
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">8. {t('international.title')}</h2>
            <p>
              {t('international.content')}
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">9. {t('policyChanges.title')}</h2>
            <p>
              {t('policyChanges.content')}
            </p>
          </section>
        </div>

        <div className="mt-12 p-6 bg-muted/50 border rounded-lg">
          <h2 className="text-xl font-semibold mb-4">{t('contact.title')}</h2>
          <p className="text-muted-foreground mb-4">
            {t('contact.intro')}
          </p>
          <div className="space-y-2 text-sm">
            <p><strong>{t('contact.email')}:</strong> privacy@kiarakraft.com</p>
            <p><strong>{t('contact.phone')}:</strong> +98 21 1234 5678</p>
            <p><strong>{t('contact.address')}:</strong> {t('contact.addressValue')}</p>
            <p><strong>{t('contact.responseTime')}:</strong> {t('contact.responseTimeValue')}</p>
          </div>
        </div>
      </div>
    </div>
  );
}