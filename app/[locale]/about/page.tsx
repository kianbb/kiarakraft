import { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

export async function generateMetadata({ params }: { params: { locale: string } }): Promise<Metadata> {
  const t = await getTranslations({ locale: params.locale, namespace: 'footer' });
  return {
    title: `${t('about')} – Kiara Kraft`,
    description: 'Learn about Kiara Kraft and our mission to support Iranian artisans.'
  };
}

export default function AboutPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-2">About Kiara Kraft</h1>
      <p className="text-muted-foreground mb-6">
        We are a marketplace dedicated to celebrating and supporting Iranian artisans and their craft.
      </p>
      <div className="prose dark:prose-invert">
        <p>
          Kiara Kraft connects buyers with authentic, handmade Iranian goods, ensuring fair opportunities for
          artisans while providing buyers with quality and meaningful products.
        </p>
      </div>
      <p className="mt-8 text-xs text-muted-foreground">Last updated: August 20, 2025</p>
    </div>
  );
}
