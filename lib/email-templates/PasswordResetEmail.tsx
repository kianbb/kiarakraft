import React from 'react';

interface PasswordResetEmailProps {
  userName: string;
  resetUrl: string;
  locale: string;
}

export default function PasswordResetEmail({
  userName,
  resetUrl,
  locale,
}: PasswordResetEmailProps) {
  const isRTL = locale === 'fa';
  const direction = isRTL ? 'rtl' : 'ltr';

  const content = {
    fa: {
      title: 'بازیابی رمز عبور',
      greeting: `سلام ${userName}`,
      intro: 'درخواست بازیابی رمز عبور برای حساب کاربری شما دریافت شد.',
      instruction: 'برای تنظیم رمز عبور جدید، روی دکمه زیر کلیک کنید:',
      buttonText: 'بازیابی رمز عبور',
      warning: 'اگر شما این درخواست را نداده‌اید، این ایمیل را نادیده بگیرید.',
      expiry: 'این لینک تا ۱ ساعت معتبر است.',
      footer: 'با تشکر،\nتیم کیارا کرافت',
      note: 'اگر روی دکمه کلیک نمی‌توانید، لینک زیر را کپی کرده و در مرورگر خود وارد کنید:',
    },
    en: {
      title: 'Password Reset',
      greeting: `Hello ${userName}`,
      intro:
        'We received a request to reset your password for your Kiara Kraft account.',
      instruction: 'Click the button below to set a new password:',
      buttonText: 'Reset Password',
      warning:
        'If you did not request this password reset, please ignore this email.',
      expiry: 'This link will expire in 1 hour.',
      footer: 'Best regards,\nThe Kiara Kraft Team',
      note: 'If you cannot click the button, copy and paste the following link into your browser:',
    },
  };

  const t = content[locale as keyof typeof content] || content.en;

  return (
    <html dir={direction}>
      {/* eslint-disable-next-line @next/next/no-head-element */}
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>{t.title}</title>
      </head>
      <body
        style={{
          fontFamily: isRTL ? 'Tahoma, Arial, sans-serif' : 'Arial, sans-serif',
          margin: 0,
          padding: 0,
          backgroundColor: '#f7f7f7',
          direction,
        }}
      >
        <table
          style={{
            width: '100%',
            maxWidth: '600px',
            margin: '0 auto',
            backgroundColor: '#ffffff',
            borderRadius: '8px',
            overflow: 'hidden',
            boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
          }}
        >
          {/* Header */}
          <tr>
            <td
              style={{
                padding: '40px 40px 20px',
                backgroundColor: '#3b82f6',
                color: '#ffffff',
                textAlign: 'center',
              }}
            >
              <h1
                style={{
                  margin: 0,
                  fontSize: '24px',
                  fontWeight: 'bold',
                  letterSpacing: '0.5px',
                }}
              >
                کیارا کرافت
              </h1>
              <p
                style={{
                  margin: '8px 0 0',
                  fontSize: '14px',
                  opacity: 0.9,
                }}
              >
                Kiara Kraft
              </p>
            </td>
          </tr>

          {/* Content */}
          <tr>
            <td style={{ padding: '40px' }}>
              <h2
                style={{
                  margin: '0 0 20px',
                  fontSize: '20px',
                  color: '#1f2937',
                  textAlign: isRTL ? 'right' : 'left',
                }}
              >
                {t.greeting}
              </h2>

              <p
                style={{
                  margin: '0 0 20px',
                  fontSize: '16px',
                  lineHeight: '1.6',
                  color: '#4b5563',
                  textAlign: isRTL ? 'right' : 'left',
                }}
              >
                {t.intro}
              </p>

              <p
                style={{
                  margin: '0 0 30px',
                  fontSize: '16px',
                  lineHeight: '1.6',
                  color: '#4b5563',
                  textAlign: isRTL ? 'right' : 'left',
                }}
              >
                {t.instruction}
              </p>

              {/* Reset Button */}
              <div style={{ textAlign: 'center', margin: '30px 0' }}>
                <a
                  href={resetUrl}
                  style={{
                    display: 'inline-block',
                    padding: '16px 32px',
                    backgroundColor: '#3b82f6',
                    color: '#ffffff',
                    textDecoration: 'none',
                    borderRadius: '6px',
                    fontSize: '16px',
                    fontWeight: 'bold',
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  {t.buttonText}
                </a>
              </div>

              {/* Warning */}
              <div
                style={{
                  padding: '20px',
                  backgroundColor: '#fef3c7',
                  borderRadius: '6px',
                  margin: '30px 0',
                  border: '1px solid #f59e0b',
                }}
              >
                <p
                  style={{
                    margin: '0 0 10px',
                    fontSize: '14px',
                    color: '#92400e',
                    textAlign: isRTL ? 'right' : 'left',
                  }}
                >
                  <strong>{t.warning}</strong>
                </p>
                <p
                  style={{
                    margin: 0,
                    fontSize: '14px',
                    color: '#92400e',
                    textAlign: isRTL ? 'right' : 'left',
                  }}
                >
                  {t.expiry}
                </p>
              </div>

              {/* Manual Link */}
              <p
                style={{
                  margin: '20px 0',
                  fontSize: '14px',
                  color: '#6b7280',
                  textAlign: isRTL ? 'right' : 'left',
                }}
              >
                {t.note}
              </p>

              <p
                style={{
                  margin: '10px 0 20px',
                  fontSize: '14px',
                  color: '#3b82f6',
                  wordBreak: 'break-all',
                  textAlign: isRTL ? 'right' : 'left',
                }}
              >
                {resetUrl}
              </p>
            </td>
          </tr>

          {/* Footer */}
          <tr>
            <td
              style={{
                padding: '30px 40px',
                backgroundColor: '#f9fafb',
                borderTop: '1px solid #e5e7eb',
              }}
            >
              <p
                style={{
                  margin: 0,
                  fontSize: '14px',
                  color: '#6b7280',
                  textAlign: isRTL ? 'right' : 'left',
                  whiteSpace: 'pre-line',
                }}
              >
                {t.footer}
              </p>
            </td>
          </tr>
        </table>

        {/* Bottom spacing */}
        <div style={{ height: '40px' }}></div>
      </body>
    </html>
  );
}
