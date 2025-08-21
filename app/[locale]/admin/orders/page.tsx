import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import Link from 'next/link';
import MarkPaidButton from './ui/MarkPaidButton';

export const dynamic = 'force-dynamic';

async function getData() {
  const orders = await prisma.order.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      user: { select: { email: true, name: true } },
      payment: true,
      items: { include: { product: { select: { title: true } } } },
    },
  });
  return orders;
}

export default async function AdminOrdersPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== 'ADMIN') {
    return <div className="p-6">Forbidden</div>;
  }
  const orders = await getData();

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Orders</h1>
      <div className="overflow-x-auto rounded border">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left">
            <tr>
              <th className="p-3">Order ID</th>
              <th className="p-3">User</th>
              <th className="p-3">Status</th>
              <th className="p-3">Payment</th>
              <th className="p-3">Total</th>
              <th className="p-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {orders.map(o => (
              <tr key={o.id} className="border-t">
                <td className="p-3 font-mono">
                  <Link
                    href={`/${'fa'}/order/${o.id}`}
                    className="text-blue-600 underline"
                  >
                    {o.id}
                  </Link>
                </td>
                <td className="p-3">{o.user.name || o.user.email}</td>
                <td className="p-3">{o.status}</td>
                <td className="p-3">
                  {o.payment ? `${o.payment.gateway}:${o.payment.status}` : '—'}
                </td>
                <td className="p-3">{o.totalToman.toLocaleString('fa-IR')}</td>
                <td className="p-3">
                  {o.payment &&
                    o.payment.gateway === 'OFFLINE' &&
                    o.payment.status !== 'PAID' && (
                      <MarkPaidButton orderId={o.id} />
                    )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
