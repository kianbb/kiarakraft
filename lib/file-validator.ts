/**
 * File Upload Security Validator
 * Validates file types by checking magic numbers (file signatures)
 */

// Common file type magic numbers (first bytes of files)
const FILE_SIGNATURES: Record<
  string,
  {
    signatures: Array<{ bytes: number[]; offset?: number }>;
    extensions: string[];
    mimeTypes: string[];
    maxSize?: number; // Max size in bytes
  }
> = {
  JPEG: {
    signatures: [{ bytes: [0xff, 0xd8, 0xff] }],
    extensions: ['jpg', 'jpeg', 'jpe', 'jfif'],
    mimeTypes: ['image/jpeg'],
    maxSize: 10 * 1024 * 1024, // 10MB
  },
  PNG: {
    signatures: [{ bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] }],
    extensions: ['png'],
    mimeTypes: ['image/png'],
    maxSize: 10 * 1024 * 1024, // 10MB
  },
  GIF: {
    signatures: [
      { bytes: [0x47, 0x49, 0x46, 0x38, 0x37, 0x61] }, // GIF87a
      { bytes: [0x47, 0x49, 0x46, 0x38, 0x39, 0x61] }, // GIF89a
    ],
    extensions: ['gif'],
    mimeTypes: ['image/gif'],
    maxSize: 5 * 1024 * 1024, // 5MB for GIFs
  },
  WEBP: {
    signatures: [
      { bytes: [0x52, 0x49, 0x46, 0x46], offset: 0 }, // RIFF
      { bytes: [0x57, 0x45, 0x42, 0x50], offset: 8 }, // WEBP
    ],
    extensions: ['webp'],
    mimeTypes: ['image/webp'],
    maxSize: 10 * 1024 * 1024, // 10MB
  },
  PDF: {
    signatures: [
      { bytes: [0x25, 0x50, 0x44, 0x46] }, // %PDF
    ],
    extensions: ['pdf'],
    mimeTypes: ['application/pdf'],
    maxSize: 20 * 1024 * 1024, // 20MB for PDFs
  },
  // Block potentially dangerous file types
  EXE: {
    signatures: [
      { bytes: [0x4d, 0x5a] }, // MZ
    ],
    extensions: ['exe', 'dll', 'com', 'bat', 'cmd'],
    mimeTypes: ['application/x-msdownload', 'application/x-msdos-program'],
    maxSize: 0, // Block executables
  },
  ZIP: {
    signatures: [
      { bytes: [0x50, 0x4b, 0x03, 0x04] }, // PK..
      { bytes: [0x50, 0x4b, 0x05, 0x06] }, // PK.. (empty)
      { bytes: [0x50, 0x4b, 0x07, 0x08] }, // PK.. (spanned)
    ],
    extensions: ['zip', 'jar', 'apk', 'docx', 'xlsx', 'pptx'],
    mimeTypes: ['application/zip', 'application/x-zip-compressed'],
    maxSize: 50 * 1024 * 1024, // 50MB for archives
  },
};

// Allowed file types for product images
const ALLOWED_IMAGE_TYPES = ['JPEG', 'PNG', 'GIF', 'WEBP'];

// Blocked file types (dangerous)
const BLOCKED_FILE_TYPES = ['EXE'];

/**
 * Check if buffer matches a file signature
 */
function matchesSignature(
  buffer: Buffer,
  signature: { bytes: number[]; offset?: number }
): boolean {
  const offset = signature.offset || 0;

  if (buffer.length < offset + signature.bytes.length) {
    return false;
  }

  for (let i = 0; i < signature.bytes.length; i++) {
    if (buffer[offset + i] !== signature.bytes[i]) {
      return false;
    }
  }

  return true;
}

/**
 * Detect file type from buffer using magic numbers
 */
export function detectFileType(buffer: Buffer): {
  type: string | null;
  mimeType: string | null;
  isAllowed: boolean;
  isBlocked: boolean;
} {
  for (const [fileType, config] of Object.entries(FILE_SIGNATURES)) {
    // Check all signatures for this file type
    const matches = config.signatures.every(sig =>
      matchesSignature(buffer, sig)
    );

    if (matches) {
      return {
        type: fileType,
        mimeType: config.mimeTypes[0],
        isAllowed: ALLOWED_IMAGE_TYPES.includes(fileType),
        isBlocked: BLOCKED_FILE_TYPES.includes(fileType),
      };
    }
  }

  return {
    type: null,
    mimeType: null,
    isAllowed: false,
    isBlocked: true, // Unknown files are blocked by default
  };
}

/**
 * Validate uploaded file
 */
export async function validateFile(
  buffer: Buffer,
  filename: string,
  declaredMimeType?: string
): Promise<{
  isValid: boolean;
  reason?: string;
  fileType?: string;
  actualMimeType?: string;
  suggestedExtension?: string;
}> {
  // Check file size first
  const maxSize = 10 * 1024 * 1024; // 10MB default max
  if (buffer.length > maxSize) {
    return {
      isValid: false,
      reason: `File too large: ${Math.round(buffer.length / 1024 / 1024)}MB (max: ${maxSize / 1024 / 1024}MB)`,
    };
  }

  // Check magic numbers
  const detected = detectFileType(buffer);

  if (detected.isBlocked) {
    return {
      isValid: false,
      reason: detected.type
        ? `File type not allowed: ${detected.type}`
        : 'Unknown or potentially dangerous file type',
    };
  }

  if (!detected.isAllowed) {
    return {
      isValid: false,
      reason: `File type not supported for upload: ${detected.type || 'unknown'}`,
    };
  }

  // Verify declared MIME type matches detected type
  if (declaredMimeType && detected.mimeType) {
    const normalizedDeclared = declaredMimeType
      .toLowerCase()
      .split(';')[0]
      .trim();
    const normalizedDetected = detected.mimeType.toLowerCase();

    if (normalizedDeclared !== normalizedDetected) {
      console.warn(
        `MIME type mismatch: declared=${normalizedDeclared}, detected=${normalizedDetected}`
      );
      // This is suspicious but not always malicious (browsers sometimes get it wrong)
    }
  }

  // Check file extension
  const extension = filename.split('.').pop()?.toLowerCase();
  if (detected.type && extension) {
    const config = FILE_SIGNATURES[detected.type];
    if (!config.extensions.includes(extension)) {
      console.warn(
        `Extension mismatch: file has .${extension} but detected as ${detected.type}`
      );
    }
  }

  // Additional checks for specific file types
  if (detected.type === 'ZIP') {
    // Could scan for nested executables here
    console.warn('ZIP file uploaded - contents not scanned');
  }

  return {
    isValid: true,
    fileType: detected.type!,
    actualMimeType: detected.mimeType!,
    suggestedExtension: detected.type
      ? FILE_SIGNATURES[detected.type].extensions[0]
      : undefined,
  };
}

/**
 * Validate image file specifically
 */
export async function validateImageFile(
  buffer: Buffer,
  filename: string
): Promise<{
  isValid: boolean;
  reason?: string;
  dimensions?: { width: number; height: number };
  format?: string;
}> {
  // First do general file validation
  const fileValidation = await validateFile(buffer, filename);

  if (!fileValidation.isValid) {
    return fileValidation;
  }

  // Check if it's actually an image type
  if (!ALLOWED_IMAGE_TYPES.includes(fileValidation.fileType || '')) {
    return {
      isValid: false,
      reason: `Not a valid image file: ${fileValidation.fileType}`,
    };
  }

  // Additional image-specific checks could go here
  // (e.g., using sharp to get dimensions, check for image bombs, etc.)

  return {
    isValid: true,
    format: fileValidation.fileType,
  };
}

/**
 * Sanitize filename to prevent path traversal attacks
 */
export function sanitizeFilename(filename: string): string {
  // Remove path separators and null bytes
  let sanitized = filename
    .replace(/[\/\\]/g, '_') // Replace path separators
    .replace(/\0/g, '') // Remove null bytes
    .replace(/\.{2,}/g, '.') // Replace multiple dots
    .trim();

  // Remove leading dots (hidden files)
  while (sanitized.startsWith('.')) {
    sanitized = sanitized.substring(1);
  }

  // Ensure filename isn't empty
  if (!sanitized || sanitized === '') {
    sanitized = 'unnamed';
  }

  // Limit length
  const maxLength = 255;
  if (sanitized.length > maxLength) {
    const ext = sanitized.split('.').pop();
    const nameWithoutExt = sanitized.substring(0, sanitized.lastIndexOf('.'));
    sanitized =
      nameWithoutExt.substring(0, maxLength - (ext?.length || 0) - 1) +
      '.' +
      ext;
  }

  return sanitized;
}

/**
 * Generate secure random filename
 */
export function generateSecureFilename(originalFilename: string): string {
  const sanitized = sanitizeFilename(originalFilename);
  const ext = sanitized.split('.').pop()?.toLowerCase() || 'bin';
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 15);

  return `${timestamp}-${random}.${ext}`;
}

// Export for testing
export { FILE_SIGNATURES, matchesSignature };
