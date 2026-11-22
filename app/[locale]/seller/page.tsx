import { connection } from 'next/server';
import { isSellerIdentityCollectionEnabled } from '@/lib/deployment-policy';
import SellerDashboard from './seller-dashboard';

export default async function SellerDashboardPage() {
  await connection();
  return (
    <SellerDashboard
      identityCollectionEnabled={isSellerIdentityCollectionEnabled()}
    />
  );
}
