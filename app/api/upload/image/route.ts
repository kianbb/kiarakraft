import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { cloudinary, UPLOAD_FOLDER, type UploadResult } from '@/lib/cloudinary';
import { validateCSRF } from '@/lib/csrf';
import { withRateLimit, uploadRateLimit } from '@/lib/rateLimit';
import { isStagingDeployment } from '@/lib/deployment-policy';
import {
  ProductImageInputError,
  readImageMultipart,
  readProductImage,
} from '@/lib/product-image-input';

export const runtime = 'nodejs';

async function uploadHandler(request: NextRequest): Promise<NextResponse> {
  try {
    // Security validations
    if (!validateCSRF(request)) {
      return NextResponse.json(
        { error: 'Invalid request origin' },
        { status: 403 }
      );
    }

    const session = await auth();
    if (!session?.user || !['SELLER', 'ADMIN'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check Cloudinary config
    if (
      !process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME ||
      !process.env.CLOUDINARY_API_KEY ||
      !process.env.CLOUDINARY_API_SECRET
    ) {
      console.error('Missing Cloudinary configuration');
      return NextResponse.json(
        { error: 'Image upload not configured' },
        { status: 500 }
      );
    }

    const formData = await readImageMultipart(request);
    const files = formData.getAll('file');
    if (files.length !== 1) {
      return NextResponse.json(
        { error: 'Exactly one image file is required' },
        { status: 400 }
      );
    }
    const buffer = await readProductImage(files[0]);

    // Upload to Cloudinary
    const uploadResult = await new Promise<UploadResult>((resolve, reject) => {
      cloudinary.uploader
        .upload_stream(
          {
            folder: UPLOAD_FOLDER,
            resource_type: 'image',
            transformation: [
              { quality: 'auto:good' },
              { fetch_format: 'auto' },
            ],
          },
          (error, result) => {
            if (error) {
              reject(error);
            } else if (result) {
              resolve({
                public_id: result.public_id,
                secure_url: result.secure_url,
                width: result.width,
                height: result.height,
                format: result.format,
                bytes: result.bytes,
              });
            } else {
              reject(new Error('Upload result is undefined'));
            }
          }
        )
        .end(buffer);
    });

    return NextResponse.json({
      success: true,
      url: uploadResult.secure_url,
      publicId: uploadResult.public_id,
      width: uploadResult.width,
      height: uploadResult.height,
      format: uploadResult.format,
      size: uploadResult.bytes,
    });
  } catch (error) {
    if (error instanceof ProductImageInputError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }
    console.error('Product image upload failed');
    return NextResponse.json(
      {
        error: 'Upload failed. Please try again.',
      },
      { status: 500 }
    );
  }
}

const limitedUpload = withRateLimit(uploadRateLimit, uploadHandler);

export async function POST(request: NextRequest): Promise<Response> {
  if (isStagingDeployment()) {
    return NextResponse.json(
      { error: 'Image uploads are disabled in staging' },
      { status: 403 }
    );
  }
  return limitedUpload(request);
}
