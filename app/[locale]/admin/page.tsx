import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import {
  CreditCard,
  Users,
  Truck,
  Star,
  RotateCcw,
  ShoppingBag,
} from 'lucide-react';

export default async function AdminDashboard({
  params: { locale },
}: {
  params: { locale: string };
}) {
  const session = await auth();
  const t = await getTranslations('admin');

  if (!session || session.user?.role !== 'ADMIN') {
    redirect('/');
  }

  // Fetch real stats
  const [pendingSellers, activeOrders, pendingPayments, openReturns] =
    await Promise.all([
      prisma.sellerProfile.count({
        where: {
          verified: false,
        },
      }),
      prisma.order.count({
        where: {
          status: {
            in: ['PENDING', 'PROCESSING', 'PAID'],
          },
        },
      }),
      prisma.payment.count({
        where: {
          status: 'PENDING',
        },
      }),
      prisma.returnRequest.count({
        where: {
          status: {
            in: ['REQUESTED', 'APPROVED'],
          },
        },
      }),
    ]);

  const adminSections = [
    {
      title: t('sellerVerification'),
      description: t('sellerVerificationDesc'),
      href: `/${locale}/admin/sellers`,
      icon: Users,
      color: 'bg-blue-500',
    },
    {
      title: t('ordersManagement'),
      description: t('ordersManagementDesc'),
      href: `/${locale}/admin/orders`,
      icon: ShoppingBag,
      color: 'bg-green-500',
    },
    {
      title: t('paymentsTitle'),
      description: t('paymentsDesc'),
      href: `/${locale}/admin/payments`,
      icon: CreditCard,
      color: 'bg-purple-500',
    },
    {
      title: t('shippingTitle'),
      description: t('shippingDesc'),
      href: `/${locale}/admin/shipping`,
      icon: Truck,
      color: 'bg-orange-500',
    },
    {
      title: t('reviewsTitle'),
      description: t('reviewsDesc'),
      href: `/${locale}/admin/reviews`,
      icon: Star,
      color: 'bg-yellow-500',
    },
    {
      title: t('returnsTitle'),
      description: t('returnsDesc'),
      href: `/${locale}/admin/returns`,
      icon: RotateCcw,
      color: 'bg-red-500',
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground">
            {t('dashboard')}
          </h1>
          <p className="text-muted-foreground mt-2">
            {t('welcomeBack')}, {session.user.name || session.user.email}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {adminSections.map(section => {
            const Icon = section.icon;
            return (
              <Link
                key={section.href}
                href={section.href}
                className="block group"
              >
                <div className="bg-card border border-border rounded-lg p-6 hover:shadow-lg transition-shadow">
                  <div className="flex items-start space-x-4 rtl:space-x-reverse">
                    <div
                      className={`${section.color} rounded-lg p-3 text-white`}
                    >
                      <Icon className="h-6 w-6" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-lg text-card-foreground group-hover:text-primary transition-colors">
                        {section.title}
                      </h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        {section.description}
                      </p>
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>

        <div className="mt-12 bg-card border border-border rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">{t('quickStats')}</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="text-center">
              <p className="text-3xl font-bold text-primary">
                {pendingSellers}
              </p>
              <p className="text-sm text-muted-foreground">
                {t('pendingSellers')}
              </p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold text-primary">{activeOrders}</p>
              <p className="text-sm text-muted-foreground">
                {t('activeOrders')}
              </p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold text-primary">
                {pendingPayments}
              </p>
              <p className="text-sm text-muted-foreground">
                {t('pendingPayments')}
              </p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold text-primary">{openReturns}</p>
              <p className="text-sm text-muted-foreground">
                {t('openReturns')}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
