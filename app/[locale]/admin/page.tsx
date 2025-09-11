import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import Link from 'next/link';
import {
  CreditCard,
  Users,
  Truck,
  Star,
  RotateCcw,
  ShoppingBag,
} from 'lucide-react';

export default async function AdminDashboard() {
  const session = await auth();

  if (!session || session.user?.role !== 'ADMIN') {
    redirect('/');
  }

  const adminSections = [
    {
      title: 'Seller Verification',
      description: 'Review and approve new seller applications',
      href: '/admin/sellers',
      icon: Users,
      color: 'bg-blue-500',
    },
    {
      title: 'Orders Management',
      description: 'View and manage all customer orders',
      href: '/admin/orders',
      icon: ShoppingBag,
      color: 'bg-green-500',
    },
    {
      title: 'Payments',
      description: 'Track and manage payment transactions',
      href: '/admin/payments',
      icon: CreditCard,
      color: 'bg-purple-500',
    },
    {
      title: 'Shipping',
      description: 'Manage shipping and tracking information',
      href: '/admin/shipping',
      icon: Truck,
      color: 'bg-orange-500',
    },
    {
      title: 'Reviews',
      description: 'Moderate product reviews and ratings',
      href: '/admin/reviews',
      icon: Star,
      color: 'bg-yellow-500',
    },
    {
      title: 'Returns',
      description: 'Handle return and refund requests',
      href: '/admin/returns',
      icon: RotateCcw,
      color: 'bg-red-500',
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground">
            Admin Dashboard
          </h1>
          <p className="text-muted-foreground mt-2">
            Welcome back, {session.user.name || session.user.email}
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
                  <div className="flex items-start space-x-4">
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
          <h2 className="text-xl font-semibold mb-4">Quick Stats</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="text-center">
              <p className="text-3xl font-bold text-primary">-</p>
              <p className="text-sm text-muted-foreground">Pending Sellers</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold text-primary">-</p>
              <p className="text-sm text-muted-foreground">Active Orders</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold text-primary">-</p>
              <p className="text-sm text-muted-foreground">Pending Payments</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold text-primary">-</p>
              <p className="text-sm text-muted-foreground">Open Returns</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
