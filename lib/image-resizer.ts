import sharp from 'sharp';
import fetch from 'node-fetch';
import { validateURL } from './url-validator';

/**
 * Resize image to 1024x1024 maintaining aspect ratio with padding if needed
 * @param imageUrl - URL of the image to resize
 * @returns Base64 encoded resized image
 */
export async function resizeImageTo1024(
  imageUrl: string
): Promise<string | null> {
  try {
    console.log('📐 Resizing image to 1024x1024...');

    // SECURITY: Validate URL to prevent SSRF attacks
    const validation = await validateURL(imageUrl);
    if (!validation.isValid) {
      console.error('Image URL validation failed:', validation.reason);
      return null;
    }

    // Use sanitized URL to prevent credential/fragment leaks
    const safeUrl = validation.sanitizedURL || imageUrl;

    // SECURITY: Re-validate DNS before fetch to prevent TOCTOU attacks
    // This prevents DNS rebinding where DNS changes between validation and fetch
    const preValidation = await validateURL(safeUrl);
    if (!preValidation.isValid) {
      console.error('Pre-fetch validation failed:', preValidation.reason);
      return null;
    }

    // Fetch the image with timeout
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000); // 10 second timeout

    const response = await fetch(safeUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'KiaraKraft/1.0', // Identify our service
      },
      redirect: 'manual', // Don't follow redirects automatically
    }).finally(() => clearTimeout(timeout));

    if (!response.ok) {
      console.error('Failed to fetch image:', response.status);
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();

    // SECURITY: Check size before creating buffer to prevent memory exhaustion
    const MAX_IMAGE_SIZE = 50 * 1024 * 1024; // 50MB max
    if (arrayBuffer.byteLength > MAX_IMAGE_SIZE) {
      console.error(
        `Image too large: ${arrayBuffer.byteLength} bytes (max: ${MAX_IMAGE_SIZE})`
      );
      return null;
    }

    const buffer = Buffer.from(arrayBuffer);

    // Resize image to 1024x1024 with white background padding
    const resizedBuffer = await sharp(buffer)
      .resize(1024, 1024, {
        fit: 'contain', // Maintain aspect ratio and add padding
        background: { r: 255, g: 255, b: 255, alpha: 1 }, // White background
        position: 'center', // Center the image
      })
      .jpeg({ quality: 90 }) // Convert to JPEG with high quality
      .toBuffer();

    // Return as base64 data URL
    const base64 = resizedBuffer.toString('base64');
    return `data:image/jpeg;base64,${base64}`;
  } catch (error) {
    console.error('Image resizing failed:', error);
    return null;
  }
}

/**
 * Resize image from buffer to 1024x1024
 * @param buffer - Image buffer
 * @returns Base64 encoded resized image
 */
export async function resizeImageBufferTo1024(
  buffer: Buffer
): Promise<string | null> {
  try {
    console.log('📐 Resizing image buffer to 1024x1024...');

    // Resize image to 1024x1024 with white background padding
    const resizedBuffer = await sharp(buffer)
      .resize(1024, 1024, {
        fit: 'contain', // Maintain aspect ratio and add padding
        background: { r: 255, g: 255, b: 255, alpha: 1 }, // White background
        position: 'center', // Center the image
      })
      .jpeg({ quality: 90 }) // Convert to JPEG with high quality
      .toBuffer();

    // Return as base64 data URL
    const base64 = resizedBuffer.toString('base64');
    return `data:image/jpeg;base64,${base64}`;
  } catch (error) {
    console.error('Image buffer resizing failed:', error);
    return null;
  }
}

/**
 * Get image metadata
 * @param imageUrl - URL of the image
 * @returns Image metadata including dimensions
 */
export async function getImageMetadata(imageUrl: string) {
  try {
    // SECURITY: Validate URL to prevent SSRF attacks
    const validation = await validateURL(imageUrl);
    if (!validation.isValid) {
      throw new Error(`Image URL validation failed: ${validation.reason}`);
    }

    const safeUrl = validation.sanitizedURL || imageUrl;

    // SECURITY: Re-validate before fetch (DNS rebinding protection)
    const preFetchValidation = await validateURL(safeUrl);
    if (!preFetchValidation.isValid) {
      throw new Error(
        `Pre-fetch validation failed: ${preFetchValidation.reason}`
      );
    }

    // Fetch with timeout and security headers
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(safeUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'KiaraKraft/1.0',
      },
      redirect: 'manual',
    }).finally(() => clearTimeout(timeout));

    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();

    // SECURITY: Validate size before creating buffer
    const MAX_SIZE = 50 * 1024 * 1024; // 50MB
    if (arrayBuffer.byteLength > MAX_SIZE) {
      throw new Error(`Image too large: ${arrayBuffer.byteLength} bytes`);
    }

    const buffer = Buffer.from(arrayBuffer);
    const metadata = await sharp(buffer).metadata();

    return {
      width: metadata.width,
      height: metadata.height,
      format: metadata.format,
      size: buffer.length,
    };
  } catch (error) {
    console.error('Failed to get image metadata:', error);
    return null;
  }
}
