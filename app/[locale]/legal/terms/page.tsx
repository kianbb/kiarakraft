import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Badge } from '@/components/ui/badge';
import { Scale } from 'lucide-react';

interface TermsPageProps {
  params: { locale: string };
}

export async function generateMetadata({ params: { locale } }: TermsPageProps) {
  const t = await getTranslations({ locale, namespace: 'terms' });

  return {
    title: `${t('title')} - Kiara Kraft`,
    description: t('description'),
    robots: 'index, follow',
  };
}

export default async function TermsOfServicePage({
  params: { locale },
}: TermsPageProps) {
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'terms' });

  return (
    <div className="min-h-screen py-8">
      <div className="container mx-auto px-4 max-w-4xl">
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-4 flex items-center gap-3">
            <Scale className="h-10 w-10 text-primary" />
            {t('title')}
          </h1>
          <div className="flex items-center gap-4 text-muted-foreground">
            <Badge variant="secondary">
              {t('lastUpdated')}: August 18, 2025
            </Badge>
            <span>{t('effectiveDate')}: August 18, 2025</span>
          </div>
        </div>

        <div className="prose prose-lg max-w-none">
          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">
              1. {t('acceptance.title')}
            </h2>
            <p>{t('acceptance.content')}</p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">
              2. {t('definitions.title')}
            </h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <strong>Platform:</strong> {t('definitions.platform')}
              </li>
              <li>
                <strong>User:</strong> {t('definitions.user')}
              </li>
              <li>
                <strong>Seller:</strong> {t('definitions.seller')}
              </li>
              <li>
                <strong>Buyer:</strong> {t('definitions.buyer')}
              </li>
              <li>
                <strong>Content:</strong> {t('definitions.content')}
              </li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">
              3. {t('sellerTerms.title')}
            </h2>
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-medium mb-2">
                  {t('sellerTerms.verification.title')}
                </h3>
                <p>{t('sellerTerms.verification.content')}</p>
              </div>
              <div>
                <h3 className="text-lg font-medium mb-2">
                  {t('sellerTerms.quality.title')}
                </h3>
                <p>{t('sellerTerms.quality.content')}</p>
              </div>
              <div>
                <h3 className="text-lg font-medium mb-2">
                  {t('sellerTerms.commission.title')}
                </h3>
                <p>{t('sellerTerms.commission.content')}</p>
              </div>
            </div>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">
              4. {t('paymentTerms.title')}
            </h2>
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-medium mb-2">
                  {t('paymentTerms.methods.title')}
                </h3>
                <p>{t('paymentTerms.methods.content')}</p>
              </div>
              <div>
                <h3 className="text-lg font-medium mb-2">
                  {t('paymentTerms.processing.title')}
                </h3>
                <p>{t('paymentTerms.processing.content')}</p>
              </div>
              <div>
                <h3 className="text-lg font-medium mb-2">
                  {t('paymentTerms.refunds.title')}
                </h3>
                <p>{t('paymentTerms.refunds.content')}</p>
              </div>
            </div>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">
              5. {t('userConduct.title')}
            </h2>
            <p className="mb-4">{t('userConduct.intro')}</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>{t('userConduct.fraud')}</li>
              <li>{t('userConduct.infringement')}</li>
              <li>{t('userConduct.harassment')}</li>
              <li>{t('userConduct.spam')}</li>
              <li>{t('userConduct.illegal')}</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">
              6. {t('intellectualProperty.title')}
            </h2>
            <p>{t('intellectualProperty.content')}</p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">
              7. {t('privacyPolicy.title')}
            </h2>
            <p>{t('privacyPolicy.content')}</p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">
              8. {t('limitation.title')}
            </h2>
            <p>{t('limitation.content')}</p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">
              9. {t('governingLaw.title')}
            </h2>
            <p>{t('governingLaw.content')}</p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">
              10. {t('changes.title')}
            </h2>
            <p>{t('changes.content')}</p>
          </section>
        </div>

        <div className="mt-12 p-6 bg-muted/50 border rounded-lg">
          <h2 className="text-xl font-semibold mb-4">{t('contact.title')}</h2>
          <p className="text-muted-foreground mb-4">{t('contact.intro')}</p>
          <div className="space-y-2 text-sm">
            <p>
              <strong>{t('contact.email')}:</strong> legal@kiarakraft.com
            </p>
            <p>
              <strong>{t('contact.address')}:</strong>{' '}
              {t('contact.addressValue')}
            </p>
            <p>
              <strong>{t('contact.responseTime')}:</strong>{' '}
              {t('contact.responseTimeValue')}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
