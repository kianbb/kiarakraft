import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
  cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export { cloudinary };

export const UPLOAD_FOLDER = 'kiarakraft';

export interface UploadResult {
  public_id: string;
  secure_url: string;
  width: number;
  height: number;
  format: string;
  bytes: number;
}

export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
export const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

export function validateImageFile(file: File): { valid: boolean; error?: string } {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return { valid: false, error: 'Invalid file type. Only JPEG, PNG, and WebP are allowed.' };
  }
  
  if (file.size > MAX_FILE_SIZE) {
    return { valid: false, error: 'File size too large. Maximum 5MB allowed.' };
  }
  
  return { valid: true };
}

export async function uploadImageToCloudinary(
  buffer: Buffer,
  options: {
    folder?: string;
    public_id?: string;
    width?: number;
    height?: number;
    crop?: string;
  } = {}
): Promise<UploadResult> {
  return new Promise((resolve, reject) => {
    const uploadOptions = {
      folder: options.folder || UPLOAD_FOLDER,
      resource_type: 'image' as const,
      format: 'auto',
      quality: 'auto:good',
      fetch_format: 'auto',
      secure: true,
      ...options,
    };

    cloudinary.uploader.upload_stream(
      uploadOptions,
      (error, result) => {
        if (error) {
          console.error('Cloudinary upload error:', error);
          reject(new Error('Image upload failed'));
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
          reject(new Error('Upload failed: No result'));
        }
      }
    ).end(buffer);
  });
}

// Try to derive Cloudinary public_id from a secure_url. This handles optional version segments.
export function extractPublicIdFromUrl(url: string): string | null {
  try {
    // Example: https://res.cloudinary.com/<cloud>/image/upload/v1699999999/kiarakraft/products/123/abcde123.webp
    const uploadIdx = url.indexOf('/upload/');
    if (uploadIdx === -1) return null;
    let path = url.substring(uploadIdx + '/upload/'.length);
    // Remove query string if any
    const qIdx = path.indexOf('?');
    if (qIdx !== -1) path = path.substring(0, qIdx);
    // Strip transformation segments if present (they appear before version or public id and contain commas and/or slashes without file extension)
    // Cloudinary transformation strings don't start with 'v' followed by digits. If path starts with 'v1234/' that's version, keep going.
    // If path starts with something like 'c_fill,w_800/...', drop until next '/'
    if (/^[a-z_][^/]*\//.test(path) && !/^v\d+\//.test(path)) {
      path = path.substring(path.indexOf('/') + 1);
    }
    // Remove version if present
    if (/^v\d+\//.test(path)) {
      path = path.replace(/^v\d+\//, '');
    }
    // Remove file extension
    const lastDot = path.lastIndexOf('.');
    if (lastDot > -1) path = path.substring(0, lastDot);
    return path;
  } catch {
    return null;
  }
}

export async function deleteImageFromCloudinary(publicIdOrUrl: string): Promise<boolean> {
  try {
    const publicId = publicIdOrUrl.includes('/upload/')
      ? extractPublicIdFromUrl(publicIdOrUrl) ?? ''
      : publicIdOrUrl;
    if (!publicId) return false;
    const res = await cloudinary.uploader.destroy(publicId, { invalidate: true });
    return res?.result === 'ok' || res?.result === 'not found';
  } catch (e) {
    console.error('Cloudinary destroy error:', e);
    return false;
  }
}