import assert from 'node:assert/strict';
import { NextRequest, NextResponse } from 'next/server';
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import SellerVerificationEmail from '../lib/email-templates/SellerVerificationEmail';
import { loadRoute } from './helpers/load-route';

type Handler = (request: NextRequest) => Promise<Response>;
type Notification = { to: string; subject: string; react: ReactElement };
type UpdateData = {
  verified: boolean;
  verificationNotes: string;
  verifiedAt: Date | null;
  verifiedBy: string | null;
};

const admin = 'admin-verify@example.invalid';
const seller = 'seller-verify@example.invalid';
const shopName = 'Synthetic private shop name';
const notes = '  Synthetic sensitive verification note  ';
const sellerId = 'synthetic-seller';

async function checkVerification(
  action: 'verify' | 'reject',
  failure?: 'email' | 'update'
) {
  let update: UpdateData | undefined;
  let productsActivated = false;
  let notification: Notification | undefined;
  const entries: unknown[][] = [];
  const capture = (...args: unknown[]) => entries.push(args);
  const route = loadRoute<{ POST: Handler }>(
    'app/api/admin/sellers/verify/route.ts',
    {
      'next/server': { NextResponse },
      '@/lib/auth': { auth: async () => ({ user: { email: admin } }) },
      '@/lib/prisma': {
        prisma: {
          user: {
            findUnique: async () => ({ email: admin, role: 'ADMIN' }),
          },
          sellerProfile: {
            findUnique: async () => ({
              shopName,
              user: { email: seller, name: 'Synthetic seller' },
            }),
            update: async (query: { data: UpdateData }) => {
              if (failure === 'update')
                throw new Error(`Synthetic database exception: ${admin}`);
              update = query.data;
              return { id: sellerId, shopName, ...query.data };
            },
          },
          product: {
            updateMany: async () => {
              productsActivated = true;
            },
          },
        },
      },
      '@/lib/email': {
        sendEmail: async (input: Notification) => {
          notification = input;
          if (failure === 'email')
            throw new Error(`Synthetic email provider exception: ${seller}`);
          return { success: true };
        },
      },
      '@/lib/email-templates/SellerVerificationEmail': SellerVerificationEmail,
      '@/lib/csrf': { withCSRF: (handler: Handler) => handler },
      '@/lib/rateLimit': {
        adminRateLimit: {},
        withRateLimit: (_config: unknown, handler: Handler) => handler,
      },
    },
    {
      console: {
        ...console,
        debug: capture,
        info: capture,
        log: capture,
        warn: capture,
        error: capture,
      },
    }
  );

  const response = await route.POST(
    new NextRequest('http://127.0.0.1/api/admin/sellers/verify', {
      method: 'POST',
      body: JSON.stringify({ sellerId, action, notes }),
    })
  );
  const body = await response.json();
  if (failure === 'update') {
    assert.equal(response.status, 500);
    assert.deepEqual(body, { error: 'Failed to update seller verification' });
    assert.equal(notification, undefined);
    assert.deepEqual(entries, [['Seller verification update failed']]);
    return;
  }

  const approved = action === 'verify';
  assert.ok(update);
  const verifiedAt = update.verifiedAt?.toISOString() ?? null;
  assert.equal(verifiedAt !== null, approved);
  assert.equal(response.status, 200);
  assert.deepEqual(body, {
    success: true,
    message: `Seller ${action}ed successfully`,
    seller: {
      id: sellerId,
      shopName,
      verified: approved,
      verifiedAt,
    },
  });
  assert.equal(update.verified, approved);
  assert.equal(update.verificationNotes, notes.trim());
  assert.equal(update.verifiedBy, approved ? admin : null);
  assert.equal(productsActivated, approved);
  assert.ok(notification);
  assert.deepEqual(Object.keys(notification).sort(), [
    'react',
    'subject',
    'to',
  ]);
  assert.equal(notification.to, seller);
  assert.equal(
    notification.subject,
    approved
      ? 'تایید فروشندگی شما در کیارا کرافت'
      : 'نتیجه بررسی فروشندگی در کیارا کرافت'
  );
  const email = renderToStaticMarkup(notification.react);
  assert.ok(email.includes(approved ? 'تأیید فروشنده' : 'رد تأیید فروشنده'));
  assert.ok(
    email.includes(
      approved ? 'Seller Verification Approved' : 'Seller Verification Rejected'
    )
  );
  assert.ok(email.includes('https://www.kiarakraft.com/fa/seller'));
  assert.ok(!email.includes(notes.trim()));
  assert.ok(!email.includes('Admin notes:'));
  assert.ok(!email.includes('یادداشت مدیر:'));
  assert.deepEqual(entries, [
    [
      approved
        ? 'Seller verification approved and products activated'
        : 'Seller verification rejected',
    ],
    ...(failure === 'email'
      ? [['Seller verification notification failed']]
      : []),
  ]);
}

async function run() {
  await checkVerification('verify');
  await checkVerification('reject', 'email');
  await checkVerification('verify', 'update');
  console.log(
    'Admin seller verification response, notification, and log privacy checks passed'
  );
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
