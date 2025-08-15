import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { prisma } from '@/lib/db'

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().min(1),
  role: z.enum(['BUYER', 'SELLER']).default('BUYER'),
  // Seller-specific fields
  shopName: z.string().optional(),
  displayName: z.string().optional(),
  bio: z.string().optional(),
  region: z.string().optional()
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email, password, name, role, shopName, displayName, bio, region } = registerSchema.parse(body)

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email }
    })

    if (existingUser) {
      return NextResponse.json(
        { error: 'User already exists' },
        { status: 400 }
      )
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10)

    // Create user with seller profile if role is SELLER
    interface UserCreateData {
      email: string;
      password: string;
      name: string;
      role: string;
      sellerProfile?: {
        create: {
          shopName: string;
          displayName: string;
          bio?: string | null;
          region?: string | null;
        };
      };
    }

    const userData: UserCreateData = {
      email,
      password: hashedPassword,
      name,
      role
    }

    if (role === 'SELLER' && shopName && displayName) {
      userData.sellerProfile = {
        create: {
          shopName,
          displayName,
          bio: bio || null,
          region: region || null
        }
      }
    }

    const user = await prisma.user.create({
      data: userData,
      include: {
        sellerProfile: true
      }
    })

    // Remove password from response
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password: _password, ...userWithoutPassword } = user

    return NextResponse.json({
      message: 'User created successfully',
      user: userWithoutPassword
    })
  } catch (error) {
    console.error('Registration error:', error)
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: error.issues },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}