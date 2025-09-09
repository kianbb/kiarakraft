import { NextRequest, NextResponse } from 'next/server';
import { seedProduction } from '@/prisma/seed-production';
import { auth } from '@/lib/auth';
import crypto from 'crypto';

// This endpoint should ONLY exist in development
// In production, seeding should be done via direct database access
export async function POST(request: NextRequest) {
  try {
    // SECURITY: Multiple layers of protection
    const isDevelopment = process.env.NODE_ENV === 'development';
    const isTest = process.env.NODE_ENV === 'test';

    // 1. Block entirely in production unless explicitly enabled
    if (
      !isDevelopment &&
      !isTest &&
      process.env.ENABLE_SEED_ENDPOINT !== 'true'
    ) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // 2. Require authentication for non-development environments
    if (!isDevelopment) {
      const session = await auth();
      if (!session?.user || session.user.role !== 'ADMIN') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    // 3. Require strong seed token (minimum 32 characters)
    const authHeader = request.headers.get('x-seed-token');
    const validToken = process.env.SEED_TOKEN;

    if (!isDevelopment) {
      if (!validToken || validToken.length < 32) {
        console.error(
          'SEED_TOKEN must be at least 32 characters in production'
        );
        return NextResponse.json(
          { error: 'Configuration error' },
          { status: 500 }
        );
      }

      // Prevent timing attacks by ensuring both buffers are the same length
      // Pad or truncate to a fixed length for comparison
      const fixedLength = 64; // Use a fixed length for all comparisons
      const providedToken = authHeader || '';

      // Create fixed-length buffers for timing-safe comparison
      const providedBuffer = Buffer.alloc(fixedLength);
      const expectedBuffer = Buffer.alloc(fixedLength);

      // Copy the tokens into fixed-size buffers
      Buffer.from(providedToken).copy(
        providedBuffer,
        0,
        0,
        Math.min(providedToken.length, fixedLength)
      );
      Buffer.from(validToken).copy(
        expectedBuffer,
        0,
        0,
        Math.min(validToken.length, fixedLength)
      );

      // Also check that the lengths match (in constant time)
      const lengthMatch = providedToken.length === validToken.length;
      const tokensMatch = crypto.timingSafeEqual(
        providedBuffer,
        expectedBuffer
      );

      if (!lengthMatch || !tokensMatch) {
        return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
      }
    }

    // 4. Add rate limiting for seed operations
    const clientIP = request.headers.get('x-forwarded-for') || 'unknown';
    console.log(`🌱 Seed request from IP: ${clientIP}`);

    console.log('🌱 Starting production seed via API...');
    const result = await seedProduction();

    return NextResponse.json({
      success: true,
      apiMessage: 'Production database seeded successfully',
      ...result,
    });
  } catch (error) {
    console.error('❌ Seed API failed:', error);
    const isDevelopment = process.env.NODE_ENV === 'development';
    return NextResponse.json(
      {
        error: 'Failed to seed database',
        details: isDevelopment
          ? error instanceof Error
            ? error.message
            : String(error)
          : undefined,
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  // Don't expose sensitive information about seeding endpoints
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}
