import { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import ContactForm from '@/components/contact/ContactForm';

export async function generateMetadata({ params }: { params: { locale: string } }): Promise<Metadata> {
  const t = await getTranslations({ locale: params.locale, namespace: 'footer' });
  return {
    title: `${t('contact')} – Kiara Kraft`,
    description: 'Get in touch with Kiara Kraft. We would love to hear from you.'
  };
}

export default function ContactPage() {
  const mail = process.env.CONTACT_RECIPIENT || 'info@kiarakraft.com';
  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-2">Contact Us</h1>
      <p className="text-muted-foreground mb-6">
        We’d love to hear from you. Send us a message and we’ll get back as soon as we can.
      </p>
      <div className="rounded-lg border p-6 bg-card">
        <ContactForm />
        <div className="mt-6 text-sm text-muted-foreground">
          Or email us directly at{' '}
          <a className="text-primary underline" href={`mailto:${mail}`}>{mail}</a>.
        </div>
      </div>
    </div>
  );
}
