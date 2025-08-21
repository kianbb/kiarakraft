'use client';

export default function Analytics() {
  if (
    process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN &&
    process.env.NODE_ENV === 'production'
  ) {
    return (
      <script
        defer
        data-domain={process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN}
        src="https://plausible.io/js/script.js"
      />
    );
  }
  return null;
}
