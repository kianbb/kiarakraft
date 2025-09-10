import { createSafeJsonLd } from '@/lib/seo-sanitizer';

interface StructuredDataProps {
  data: Record<string, unknown>;
}

export function StructuredData({ data }: StructuredDataProps) {
  // Safely sanitize and stringify the data to prevent XSS
  const safeJsonLd = createSafeJsonLd(data);

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: safeJsonLd }}
    />
  );
}
