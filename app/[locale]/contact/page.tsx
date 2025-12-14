import { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import ContactForm from '@/components/contact/ContactForm';

interface ContactPageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({
  params,
}: ContactPageProps): Promise<Metadata> {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'contact' });

  return {
    title: `${t('title')} – Kiara Kraft`,
    description: t('description'),
  };
}

export default async function ContactPage({ params }: ContactPageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'contact' });

  const mail = process.env.CONTACT_RECIPIENT || 'info@kiarakraft.com';

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-2">{t('title')}</h1>
      <p className="text-muted-foreground mb-6">{t('subtitle')}</p>
      <div className="rounded-lg border p-6 bg-card">
        <ContactForm locale={locale} />
        <div className="mt-6 text-sm text-muted-foreground">
          {t('emailDirectly')}{' '}
          <a className="text-primary underline" href={`mailto:${mail}`}>
            {mail}
          </a>
          .
        </div>
      </div>
    </div>
  );
}
