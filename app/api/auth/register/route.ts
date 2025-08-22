import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { withRateLimit, authRateLimit } from '@/lib/rateLimit';

const registerSchema = z.object({
  email: z.string().email(),
  password: z
    .string()
    .min(12, 'Password must be at least 12 characters long')
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/,
      'Password must contain at least one lowercase letter, one uppercase letter, one number, and one special character'
    ),
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

      // Create user with seller profile if role is SELLER
      interface UserCreateData {
        email: string;
        password: string;
        name: string;
        role: string;
        sellerProfile?: {
          create: {
            handle: string;
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
        role,
      };

      if (role === 'SELLER' && shopName && displayName) {
        // Generate unique handle from shop name
        const baseHandle = shopName
          .toLowerCase()
          .replace(/[^a-z0-9\u0600-\u06FF]/g, '') // Keep alphanumeric and Persian chars
          .substring(0, 20);

        let handle = baseHandle;
        let counter = 1;

        // Ensure handle is unique
        while (await prisma.sellerProfile.findUnique({ where: { handle } })) {
          handle = `${baseHandle}${counter}`;
          counter++;
        }

        userData.sellerProfile = {
          create: {
            handle,
            shopName,
            displayName,
            bio: bio || null,
            region: region || null,
          },
        };
      }

      const user = await prisma.user.create({
        data: userData,
        include: {
          sellerProfile: true,
        },
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
