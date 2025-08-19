import * as React from 'react';

interface Props {
  sellerName: string;
  shopName: string;
  action: 'verify' | 'reject';
  notes?: string;
  locale?: 'fa' | 'en';
  dashboardUrl?: string;
}

export default function SellerVerificationEmail({
  sellerName,
  shopName,
  action,
  notes,
  locale = 'fa',
  dashboardUrl = 'https://www.kiarakraft.com/fa/seller'
}: Props) {
  const isFa = locale === 'fa';
  const titleFa = action === 'verify' ? 'تأیید فروشنده' : 'رد تأیید فروشنده';
  const titleEn = action === 'verify' ? 'Seller Verification Approved' : 'Seller Verification Rejected';
  const greetingFa = `سلام ${sellerName || 'فروشنده'} عزیز`;
  const greetingEn = `Hello ${sellerName || 'Seller'},`;
  const bodyFa = action === 'verify'
    ? `پروفایل فروشندگی شما (${shopName}) تأیید شد. اکنون نشان تأیید شده در فروشگاه شما نمایش داده می‌شود.`
    : `در حال حاضر امکان تأیید پروفایل فروشندگی شما (${shopName}) فراهم نشد.`;
  const bodyEn = action === 'verify'
    ? `Your seller profile (${shopName}) has been verified. The verified badge is now visible for your shop.`
    : `We couldn’t approve your seller profile (${shopName}) at this time.`;
  const notesFa = notes ? `یادداشت مدیر: ${notes}` : '';
  const notesEn = notes ? `Admin notes: ${notes}` : '';

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', color: '#111', lineHeight: 1.6 }}>
      <h2>{titleFa} | {titleEn}</h2>
      <p>{greetingFa}</p>
      <p>{greetingEn}</p>
      <p>{isFa ? bodyFa : bodyFa}</p>
      <p>{bodyEn}</p>
      {notes && (
        <>
          <p>{notesFa}</p>
          <p>{notesEn}</p>
        </>
      )}
      <p>
        {isFa ? 'برای مدیریت فروشگاه خود از طریق لینک زیر اقدام کنید:' : 'Manage your shop using the link below:'}
      </p>
      <p>
        <a href={dashboardUrl} target="_blank" rel="noopener noreferrer">{dashboardUrl}</a>
      </p>
      <hr />
      <p style={{ fontSize: 12, color: '#666' }}>Kiara Kraft • Support: noreply@kiarakraft.com</p>
    </div>
  );
}
