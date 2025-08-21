'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

interface ContactFormProps {
  locale: string;
}

export default function ContactForm({}: ContactFormProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const t = useTranslations('contact');

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    setLoading(true);

    const form = e.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries()) as Record<
      string,
      string
    >;

    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || t('errorMessage'));
      setSuccess(true);
      form.reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errorMessage'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <form className="space-y-4" onSubmit={onSubmit}>
      <div>
        <label className="block text-sm font-medium mb-1" htmlFor="name">
          {t('name')}
        </label>
        <input
          id="name"
          name="name"
          required
          className="w-full rounded-md border px-3 py-2 bg-background"
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1" htmlFor="email">
          {t('email')}
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          className="w-full rounded-md border px-3 py-2 bg-background"
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1" htmlFor="message">
          {t('message')}
        </label>
        <textarea
          id="message"
          name="message"
          required
          rows={5}
          className="w-full rounded-md border px-3 py-2 bg-background"
        />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {success && (
        <p className="text-sm text-green-600">{t('successMessage')}</p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-60"
      >
        {loading ? t('sending') : t('send')}
      </button>
    </form>
  );
}
