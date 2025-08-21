import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import {
  uploadImageToCloudinary,
  UPLOAD_FOLDER,
  listAssetsInFolder,
} from '@/lib/cloudinary';
import { withCSRF } from '@/lib/csrf';
import { withRateLimit, uploadRateLimit } from '@/lib/rateLimit';
import * as Sentry from '@sentry/nextjs';

export const POST = withRateLimit(
  uploadRateLimit,
  withCSRF(async function (request: NextRequest) {
    try {
      const session = await getServerSession(authOptions);

      if (!session?.user?.email) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      // Attach user context for observability
      Sentry.setUser({ email: session.user.email });

      const user = await prisma.user.findUnique({
        where: { email: session.user.email },
        include: { sellerProfile: true },
      });

      if (!user || user.role !== 'SELLER' || !user.sellerProfile) {
        return NextResponse.json(
          { error: 'Seller profile required' },
          { status: 403 }
        );
      }

      const formData = await request.formData();
      const file = formData.get('file') as File;
      const type = formData.get('type') as string;

      if (!file) {
        return NextResponse.json(
          { error: 'VALIDATION_ERROR', message: 'No file provided' },
          { status: 400 }
        );
      }

      // Validate file type and size
      const allowedTypes = [
        'image/jpeg',
        'image/jpg',
        'image/png',
        'application/pdf',
      ];
      if (!allowedTypes.includes(file.type)) {
        return NextResponse.json(
          {
            error: 'VALIDATION_ERROR',
            message:
              'Invalid file type. Only JPEG, PNG, and PDF files are allowed.',
          },
          { status: 400 }
        );
      }

      const maxSize = 10 * 1024 * 1024; // 10MB for documents
      if (file.size > maxSize) {
        return NextResponse.json(
          {
            error: 'VALIDATION_ERROR',
            message: 'File too large. Maximum 10MB allowed.',
          },
          { status: 400 }
        );
      }

      // Enforce a maximum number of documents per seller (5) by listing Cloudinary folder
      const folderPath = `${UPLOAD_FOLDER}/sellers/${user.sellerProfile.id}/documents`;
      const existing = await listAssetsInFolder(folderPath, 200);
      if (existing.length >= 5) {
        return NextResponse.json(
          { error: 'VALIDATION_ERROR', message: 'Maximum 5 documents allowed' },
          { status: 400 }
        );
      }

      // Convert file to buffer
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);

      // Create secure folder path
      const fileName = `${type || 'document'}-${Date.now()}`;

      // Upload to Cloudinary
      let uploadResult;
      if (file.type === 'application/pdf') {
        // For PDFs, use raw upload
        uploadResult = await new Promise((resolve, reject) => {
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const { cloudinary } = require('@/lib/cloudinary');

          cloudinary.uploader
            .upload_stream(
              {
                folder: folderPath,
                public_id: fileName,
                resource_type: 'raw',
                secure: true,
              },
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (error: any, result: any) => {
                if (error) {
                  console.error('Cloudinary PDF upload error:', error);
                  reject(new Error('Document upload failed'));
                } else if (result) {
                  resolve({
                    public_id: result.public_id,
                    secure_url: result.secure_url,
                    bytes: result.bytes,
                  });
                } else {
                  reject(new Error('Upload failed: No result'));
                }
              }
            )
            .end(buffer);
        });
      } else {
        // For images, use the existing upload function
        uploadResult = await uploadImageToCloudinary(buffer, {
          folder: folderPath,
          public_id: fileName,
        });
      }

      // Update seller profile with docs folder if not set
      if (!user.sellerProfile.docsFolder) {
        await prisma.sellerProfile.update({
          where: { id: user.sellerProfile.id },
          data: { docsFolder: folderPath },
        });
      }

      // Persist document metadata in DB for audit/cleanup
      const uploaded = uploadResult as {
        public_id: string;
        secure_url: string;
        bytes: number;
      };
      // Narrow type to avoid editor errors before Prisma types regenerate
      type SDClient = {
        sellerDocument: {
          create: (args: {
            data: {
              sellerId: string;
              publicId: string;
              url: string;
              mime: string;
              bytes: number;
            };
          }) => Promise<unknown>;
        };
      };
      const sd = prisma as unknown as SDClient;
      try {
        await sd.sellerDocument.create({
          data: {
            sellerId: user.sellerProfile.id,
            publicId: uploaded.public_id,
            url: uploaded.secure_url,
            mime: file.type,
            bytes: uploaded.bytes,
          },
        });
      } catch (e) {
        // Best-effort: don’t fail the upload if audit table isn’t available yet
        console.warn('Persist SellerDocument failed (non-fatal):', e);
      }

      return NextResponse.json({
        success: true,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        url: (uploadResult as any).secure_url,
        type: file.type,
        size: file.size,
        total: existing.length + 1,
      });
    } catch (error) {
      console.error('Error uploading document:', error);
      Sentry.captureException(error);
      return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
    }
  })
);
