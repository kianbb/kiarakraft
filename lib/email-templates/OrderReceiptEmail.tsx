import React from 'react';

interface OrderItem {
  productTitle: string;
  quantity: number;
  unitPriceToman: number;
}

interface OrderReceiptEmailProps {
  userName: string;
  orderId: string;
  items: OrderItem[];
  totalToman: number;
  shippingAddress: {
    fullName: string;
    address1: string;
    address2?: string;
    city: string;
    province: string;
    postalCode: string;
    phone: string;
  };
  paymentMethod: string;
  locale: string;
}

export default function OrderReceiptEmail({
  userName,
  orderId,
  items,
  totalToman,
  shippingAddress,
  paymentMethod,
  locale,
}: OrderReceiptEmailProps) {
  const isRTL = locale === 'fa';
  const direction = isRTL ? 'rtl' : 'ltr';

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat(locale === 'fa' ? 'fa-IR' : 'en-US', {
      style: 'decimal',
      minimumFractionDigits: 0,
    }).format(price);
  };

  const content = {
    fa: {
      title: 'رسید سفارش',
      greeting: `سلام ${userName}`,
      intro: 'سفارش شما با موفقیت پردازش شد. جزئیات سفارش:',
      orderNumber: 'شماره سفارش',
      orderItems: 'اقلام سفارش',
      product: 'محصول',
      quantity: 'تعداد',
      price: 'قیمت',
      total: 'جمع کل',
      shippingInfo: 'اطلاعات ارسال',
      paymentInfo: 'اطلاعات پرداخت',
      paymentMethod: 'روش پرداخت',
      nextSteps: 'مراحل بعدی',
      nextStepsText:
        'سفارش شما در حال پردازش است و به زودی ارسال خواهد شد. ایمیل تأیید ارسال را دریافت خواهید کرد.',
      footer: 'با تشکر از خرید شما،\nتیم کیارا کرافت',
      currency: 'تومان',
    },
    en: {
      title: 'Order Receipt',
      greeting: `Hello ${userName}`,
      intro: 'Your order has been successfully processed. Order details:',
      orderNumber: 'Order Number',
      orderItems: 'Order Items',
      product: 'Product',
      quantity: 'Quantity',
      price: 'Price',
      total: 'Total',
      shippingInfo: 'Shipping Information',
      paymentInfo: 'Payment Information',
      paymentMethod: 'Payment Method',
      nextSteps: 'Next Steps',
      nextStepsText:
        'Your order is being processed and will be shipped soon. You will receive a shipping confirmation email.',
      footer: 'Thank you for your purchase,\nThe Kiara Kraft Team',
      currency: 'Toman',
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
            maxWidth: '700px',
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
                backgroundColor: '#059669',
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
                  margin: '0 0 30px',
                  fontSize: '16px',
                  lineHeight: '1.6',
                  color: '#4b5563',
                  textAlign: isRTL ? 'right' : 'left',
                }}
              >
                {t.intro}
              </p>

              {/* Order Number */}
              <div
                style={{
                  padding: '20px',
                  backgroundColor: '#f0fdf4',
                  borderRadius: '6px',
                  margin: '20px 0',
                  border: '1px solid #22c55e',
                }}
              >
                <p
                  style={{
                    margin: 0,
                    fontSize: '16px',
                    color: '#166534',
                    textAlign: isRTL ? 'right' : 'left',
                  }}
                >
                  <strong>
                    {t.orderNumber}: {orderId}
                  </strong>
                </p>
              </div>

              {/* Order Items */}
              <h3
                style={{
                  margin: '30px 0 20px',
                  fontSize: '18px',
                  color: '#1f2937',
                  textAlign: isRTL ? 'right' : 'left',
                }}
              >
                {t.orderItems}
              </h3>

              <table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  margin: '20px 0',
                  border: '1px solid #e5e7eb',
                  borderRadius: '6px',
                  overflow: 'hidden',
                }}
              >
                <thead>
                  <tr style={{ backgroundColor: '#f9fafb' }}>
                    <th
                      style={{
                        padding: '12px 16px',
                        textAlign: isRTL ? 'right' : 'left',
                        fontSize: '14px',
                        fontWeight: 'bold',
                        color: '#374151',
                        borderBottom: '1px solid #e5e7eb',
                      }}
                    >
                      {t.product}
                    </th>
                    <th
                      style={{
                        padding: '12px 16px',
                        textAlign: 'center',
                        fontSize: '14px',
                        fontWeight: 'bold',
                        color: '#374151',
                        borderBottom: '1px solid #e5e7eb',
                      }}
                    >
                      {t.quantity}
                    </th>
                    <th
                      style={{
                        padding: '12px 16px',
                        textAlign: isRTL ? 'left' : 'right',
                        fontSize: '14px',
                        fontWeight: 'bold',
                        color: '#374151',
                        borderBottom: '1px solid #e5e7eb',
                      }}
                    >
                      {t.price}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, index) => (
                    <tr
                      key={index}
                      style={{
                        borderBottom:
                          index < items.length - 1
                            ? '1px solid #f3f4f6'
                            : 'none',
                      }}
                    >
                      <td
                        style={{
                          padding: '12px 16px',
                          fontSize: '14px',
                          color: '#374151',
                          textAlign: isRTL ? 'right' : 'left',
                        }}
                      >
                        {item.productTitle}
                      </td>
                      <td
                        style={{
                          padding: '12px 16px',
                          fontSize: '14px',
                          color: '#374151',
                          textAlign: 'center',
                        }}
                      >
                        {formatPrice(item.quantity)}
                      </td>
                      <td
                        style={{
                          padding: '12px 16px',
                          fontSize: '14px',
                          color: '#374151',
                          textAlign: isRTL ? 'left' : 'right',
                        }}
                      >
                        {formatPrice(item.unitPriceToman * item.quantity)}{' '}
                        {t.currency}
                      </td>
                    </tr>
                  ))}
                  {/* Total Row */}
                  <tr
                    style={{ backgroundColor: '#f9fafb', fontWeight: 'bold' }}
                  >
                    <td
                      style={{
                        padding: '16px',
                        fontSize: '16px',
                        color: '#1f2937',
                        textAlign: isRTL ? 'right' : 'left',
                        borderTop: '2px solid #e5e7eb',
                      }}
                    >
                      {t.total}
                    </td>
                    <td
                      style={{
                        padding: '16px',
                        borderTop: '2px solid #e5e7eb',
                      }}
                    ></td>
                    <td
                      style={{
                        padding: '16px',
                        fontSize: '16px',
                        color: '#1f2937',
                        textAlign: isRTL ? 'left' : 'right',
                        borderTop: '2px solid #e5e7eb',
                      }}
                    >
                      {formatPrice(totalToman)} {t.currency}
                    </td>
                  </tr>
                </tbody>
              </table>

              {/* Shipping Information */}
              <h3
                style={{
                  margin: '30px 0 15px',
                  fontSize: '18px',
                  color: '#1f2937',
                  textAlign: isRTL ? 'right' : 'left',
                }}
              >
                {t.shippingInfo}
              </h3>

              <div
                style={{
                  padding: '20px',
                  backgroundColor: '#f8fafc',
                  borderRadius: '6px',
                  border: '1px solid #e2e8f0',
                }}
              >
                <p
                  style={{
                    margin: '0 0 8px',
                    fontSize: '14px',
                    color: '#475569',
                    textAlign: isRTL ? 'right' : 'left',
                  }}
                >
                  <strong>{shippingAddress.fullName}</strong>
                  <br />
                  {shippingAddress.address1}
                  <br />
                  {shippingAddress.address2 && (
                    <>
                      {shippingAddress.address2}
                      <br />
                    </>
                  )}
                  {shippingAddress.city}, {shippingAddress.province}
                  <br />
                  {shippingAddress.postalCode}
                  <br />
                  {shippingAddress.phone}
                </p>
              </div>

              {/* Payment Information */}
              <h3
                style={{
                  margin: '30px 0 15px',
                  fontSize: '18px',
                  color: '#1f2937',
                  textAlign: isRTL ? 'right' : 'left',
                }}
              >
                {t.paymentInfo}
              </h3>

              <div
                style={{
                  padding: '20px',
                  backgroundColor: '#f8fafc',
                  borderRadius: '6px',
                  border: '1px solid #e2e8f0',
                }}
              >
                <p
                  style={{
                    margin: 0,
                    fontSize: '14px',
                    color: '#475569',
                    textAlign: isRTL ? 'right' : 'left',
                  }}
                >
                  <strong>{t.paymentMethod}:</strong> {paymentMethod}
                </p>
              </div>

              {/* Next Steps */}
              <h3
                style={{
                  margin: '30px 0 15px',
                  fontSize: '18px',
                  color: '#1f2937',
                  textAlign: isRTL ? 'right' : 'left',
                }}
              >
                {t.nextSteps}
              </h3>

              <p
                style={{
                  margin: '0 0 20px',
                  fontSize: '14px',
                  lineHeight: '1.6',
                  color: '#6b7280',
                  textAlign: isRTL ? 'right' : 'left',
                }}
              >
                {t.nextStepsText}
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
