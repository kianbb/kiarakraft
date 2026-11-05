import { NextRequest, NextResponse } from 'next/server';
import { isStagingDeployment } from '@/lib/deployment-policy';

export async function POST(request: NextRequest) {
  if (isStagingDeployment()) {
    return NextResponse.json({ error: 'Disabled in staging' }, { status: 503 });
  }
  try {
    // Verify this is from Vercel Cron or admin
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('🔄 FX update triggered via API');

    const { updateFxRates } = await import('@/scripts/fx-update');
    const rates = await updateFxRates();

    return NextResponse.json({
      success: true,
      message: 'FX rates updated successfully',
      rates: rates.map(r => ({
        pair: `${r.base}/${r.counter}`,
        rate: r.rate,
        updated: r.fetchedAt,
      })),
    });
  } catch (error) {
    console.error('API FX update failed:', error);
    return NextResponse.json(
      { error: 'Failed to update FX rates' },
      { status: 500 }
    );
  }
}

// Allow GET for manual testing
export async function GET(request: NextRequest) {
  if (isStagingDeployment()) {
    return NextResponse.json({ error: 'Disabled in staging' }, { status: 503 });
  }
  try {
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { updateFxRates } = await import('@/scripts/fx-update');
    const rates = await updateFxRates();

    return NextResponse.json({
      success: true,
      message: 'FX rates updated successfully (GET)',
      rates: rates.map(r => ({
        pair: `${r.base}/${r.counter}`,
        rate: r.rate,
        updated: r.fetchedAt,
      })),
    });
  } catch (error) {
    console.error('API FX update failed:', error);
    return NextResponse.json(
      { error: 'Failed to update FX rates' },
      { status: 500 }
    );
  }
}
