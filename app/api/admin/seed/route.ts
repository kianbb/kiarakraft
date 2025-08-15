import { NextRequest, NextResponse } from 'next/server';
import { seedProduction } from '@/prisma/seed-production';

export async function POST(request: NextRequest) {
  try {
    // Basic security check - only allow in development or with a specific header
    const authHeader = request.headers.get('x-seed-token');
    const isDevelopment = process.env.NODE_ENV === 'development';
    const validToken = process.env.SEED_TOKEN;
    
    if (!isDevelopment && (!authHeader || !validToken || authHeader !== validToken)) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    console.log('🌱 Starting production seed via API...');
    const result = await seedProduction();
    
    return NextResponse.json({
      success: true,
      apiMessage: 'Production database seeded successfully',
      ...result
    });
    
  } catch (error) {
    console.error('❌ Seed API failed:', error);
    return NextResponse.json(
      { 
        error: 'Failed to seed database',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'Use POST to seed the production database',
    usage: 'POST /api/admin/seed with x-seed-token header'
  });
}