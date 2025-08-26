import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { withRateLimit, authRateLimit } from '@/lib/rateLimit';
import { validatePasswordComplexity, validateEmail } from '@/lib/auth-security';

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters long'),
  name: z.string().min(1),
  role: z.enum(['BUYER', 'SELLER']).default('BUYER'),
  // Seller-specific fields
  shopName: z.string().optional(),
  displayName: z.string().optional(),
  bio: z.string().optional(),
  region: z.string().optional(),
});

export const POST = withRateLimit(
  authRateLimit,
  async function (request: NextRequest) {
    try {
      const body = await request.json();
      const {
        email,
        password,
        name,
        role,
        shopName,
        displayName,
        bio,
        region,
      } = registerSchema.parse(body);

      // Validate email format
      if (!validateEmail(email)) {
        return NextResponse.json(
          { error: 'Invalid email format' },
          { status: 400 }
        );
      }

      // Validate password complexity
      const passwordValidation = validatePasswordComplexity(password);
      if (!passwordValidation.valid) {
        return NextResponse.json(
          {
            error: 'Password does not meet security requirements',
            details: passwordValidation.errors,
          },
          { status: 400 }
        );
      }

      // Check if user already exists
      const existingUser = await prisma.user.findUnique({
        where: { email },
      });

      if (existingUser) {
        return NextResponse.json(
          { error: 'User already exists' },
          { status: 400 }
        );
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);

      // Build data object; if SELLER ensure sellerProfile.create has handle
      const user = await prisma.user.create({
        data: {
          email,
          password: hashedPassword,
          name,
          role,
          ...(role === 'SELLER' && shopName && displayName
            ? {
                sellerProfile: {
                  create: {
                    shopName,
                    displayName,
                    bio: bio || null,
                    region: region || null,
                    handle:
                      (shopName || displayName)
                        .toLowerCase()
                        .replace(/[^a-z0-9-]+/g, '-')
                        .slice(0, 30) || `shop-${Date.now()}`,
                  },
                },
              }
            : {}),
        },
        include: { sellerProfile: true },
      });

      // Remove password from response
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { password: _password, ...userWithoutPassword } = user;

      return NextResponse.json({
        message: 'User created successfully',
        user: userWithoutPassword,
      });
    } catch (error) {
      console.error('Registration error:', error);

      if (error instanceof z.ZodError) {
        return NextResponse.json(
          { error: 'Invalid input', details: error.issues },
          { status: 400 }
        );
      }

      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  }
);
