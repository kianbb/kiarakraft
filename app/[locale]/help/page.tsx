import { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

export async function generateMetadata({ params }: { params: { locale: string } }): Promise<Metadata> {
  const t = await getTranslations({ locale: params.locale, namespace: 'footer' });
  return {
    title: `${t('help')} – Kiara Kraft`,
    description: 'Help center: FAQs and support options for Kiara Kraft.'
  };
}

export default function HelpPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-2">Help</h1>
      <p className="text-muted-foreground mb-6">
        Find answers to common questions and ways to contact support.
      </p>
      <div className="space-y-4">
        <details className="rounded-md border p-4">
          <summary className="font-medium">How do I place an order?</summary>
          <p className="mt-2 text-sm text-muted-foreground">Browse products, add to cart, and follow checkout steps.</p>
        </details>
        <details className="rounded-md border p-4">
          <summary className="font-medium">What payment methods are supported?</summary>
          <p className="mt-2 text-sm text-muted-foreground">See options on the checkout page; offline transfer may be available.</p>
        </details>
      </div>
      <p className="mt-8 text-xs text-muted-foreground">Last updated: August 20, 2025</p>
    </div>
  );
}
