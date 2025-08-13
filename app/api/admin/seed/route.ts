import { NextRequest, NextResponse } from 'next/server'
import { seedProduction } from '@/prisma/seed-production'

// Track if seeding has been run
let hasBeenSeeded = false

export async function POST(request: NextRequest) {
  try {
    // Check for required token header
    const seedToken = request.headers.get('x-seed-token')
    const expectedToken = process.env.ADMIN_SEED_TOKEN

    if (!expectedToken) {
      return NextResponse.json(
        { error: 'ADMIN_SEED_TOKEN not configured' },
        { status: 500 }
      )
    }

    if (!seedToken || seedToken !== expectedToken) {
      return NextResponse.json(
        { error: 'Invalid or missing x-seed-token header' },
        { status: 401 }
      )
    }

    // Check if already seeded (one-time protection)
    if (hasBeenSeeded) {
      return NextResponse.json(
        { 
          error: 'Seeding has already been completed once. Restart the application to seed again.',
          message: 'This is a safety measure to prevent accidental duplicate seeding.'
        },
        { status: 409 }
      )
    }

    console.log('🔐 Admin seed endpoint accessed with valid token')
    
    // Run the seeding
    const result = await seedProduction()
    
    // Mark as seeded
    hasBeenSeeded = true
    
    console.log('✅ Production seeding completed via admin endpoint')
    
    return NextResponse.json({
      success: true,
      result,
      timestamp: new Date().toISOString(),
      warning: 'This endpoint will not work again until application restart'
    })

  } catch (error) {
    console.error('❌ Admin seed endpoint error:', error)
    
    return NextResponse.json(
      { 
        error: 'Seeding failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

// Only allow POST method
export async function GET() {
  return NextResponse.json(
    { error: 'Method not allowed. Use POST with x-seed-token header.' },
    { status: 405 }
  )
}