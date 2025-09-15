import sharp from 'sharp';
import fetch from 'node-fetch';

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

    // Fetch the image
    const response = await fetch(imageUrl);

    if (!response.ok) {
      console.error('Failed to fetch image:', response.status);
      return null;
    }

    const buffer = Buffer.from(await response.arrayBuffer());

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
    const response = await fetch(imageUrl);

    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.status}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
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
