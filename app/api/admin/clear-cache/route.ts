import { NextResponse } from 'next/server';
import { revalidateTag, revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';

export async function POST() {
  try {
    // Check if user is admin
    const session = await auth();
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Revalidate all product-related caches
    revalidateTag('products');
    revalidateTag('categories');
    revalidateTag('sellers');

    // Revalidate the explore page paths
    revalidatePath('/fa/explore');
    revalidatePath('/en/explore');
    revalidatePath('/explore');

    return NextResponse.json({
      message: 'Cache cleared successfully',
      tags: ['products', 'categories', 'sellers'],
      paths: ['/fa/explore', '/en/explore'],
    });
  } catch (error) {
    console.error('Error clearing cache:', error);
    return NextResponse.json(
      { error: 'Failed to clear cache' },
      { status: 500 }
    );
  }
}
