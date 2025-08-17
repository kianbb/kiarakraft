'use server';

import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { uploadImageToCloudinary, validateImageFile, UPLOAD_FOLDER } from '@/lib/cloudinary';
import { revalidateTag } from 'next/cache';

export async function uploadProductImage(formData: FormData) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.email) {
      return { success: false, error: 'Unauthorized' };
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: { sellerProfile: true }
    });

    if (!user || user.role !== 'SELLER' || !user.sellerProfile) {
      return { success: false, error: 'Seller profile required' };
    }

    const file = formData.get('file') as File;
    const productId = formData.get('productId') as string;

    if (!file || !productId) {
      return { success: false, error: 'File and product ID are required' };
    }

    // Verify product ownership
    const product = await prisma.product.findFirst({
      where: {
        id: productId,
        sellerId: user.sellerProfile.id
      }
    });

    if (!product) {
      return { success: false, error: 'Product not found or access denied' };
    }

    // Validate file
    const validation = validateImageFile(file);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    // Convert file to buffer
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Upload to Cloudinary
    const uploadResult = await uploadImageToCloudinary(buffer, {
      folder: `${UPLOAD_FOLDER}/products/${productId}`,
      width: 800,
      height: 800,
      crop: 'limit'
    });

    // Get current max sort order
    const maxSortOrder = await prisma.listingImage.findFirst({
      where: { productId },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true }
    });

    // Save image record to database
    const listingImage = await prisma.listingImage.create({
      data: {
        productId,
        url: uploadResult.secure_url,
        alt: `${product.title} image`,
        sortOrder: (maxSortOrder?.sortOrder || 0) + 1
      }
    });

    // Revalidate product cache
    revalidateTag(`product-${productId}`);
    revalidateTag('products');

    return {
      success: true,
      image: {
        id: listingImage.id,
        url: listingImage.url,
        alt: listingImage.alt,
        sortOrder: listingImage.sortOrder
      }
    };
  } catch (error) {
    console.error('Error uploading product image:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Upload failed' 
    };
  }
}

export async function deleteProductImage(imageId: string, productId: string) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.email) {
      return { success: false, error: 'Unauthorized' };
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: { sellerProfile: true }
    });

    if (!user || user.role !== 'SELLER' || !user.sellerProfile) {
      return { success: false, error: 'Seller profile required' };
    }

    // Verify product ownership and image exists
    const image = await prisma.listingImage.findFirst({
      where: {
        id: imageId,
        product: {
          id: productId,
          sellerId: user.sellerProfile.id
        }
      }
    });

    if (!image) {
      return { success: false, error: 'Image not found or access denied' };
    }

    // Delete from database
    await prisma.listingImage.delete({
      where: { id: imageId }
    });

    // TODO: Delete from Cloudinary (optional, as we have auto-cleanup)
    // Note: You might want to implement this for storage optimization

    // Revalidate cache
    revalidateTag(`product-${productId}`);
    revalidateTag('products');

    return { success: true };
  } catch (error) {
    console.error('Error deleting product image:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Delete failed' 
    };
  }
}

export async function reorderProductImages(productId: string, imageIds: string[]) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.email) {
      return { success: false, error: 'Unauthorized' };
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: { sellerProfile: true }
    });

    if (!user || user.role !== 'SELLER' || !user.sellerProfile) {
      return { success: false, error: 'Seller profile required' };
    }

    // Verify product ownership
    const product = await prisma.product.findFirst({
      where: {
        id: productId,
        sellerId: user.sellerProfile.id
      }
    });

    if (!product) {
      return { success: false, error: 'Product not found or access denied' };
    }

    // Update sort orders in transaction
    await prisma.$transaction(async (tx) => {
      for (let i = 0; i < imageIds.length; i++) {
        await tx.listingImage.update({
          where: { 
            id: imageIds[i],
            productId // Extra safety check
          },
          data: { sortOrder: i + 1 }
        });
      }
    });

    // Revalidate cache
    revalidateTag(`product-${productId}`);
    revalidateTag('products');

    return { success: true };
  } catch (error) {
    console.error('Error reordering product images:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Reorder failed' 
    };
  }
}