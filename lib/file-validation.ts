/**
 * File validation using magic bytes (file signatures)
 * Provides secure file type detection by checking actual file content
 * rather than relying on easily-spoofed MIME types or extensions
 */

interface FileSignature {
  extension: string;
  mimeType: string;
  magicBytes: (number | null)[][];
  description: string;
}

// Known file signatures with their magic bytes
const FILE_SIGNATURES: FileSignature[] = [
  {
    extension: 'jpg',
    mimeType: 'image/jpeg',
    magicBytes: [
      [0xff, 0xd8, 0xff, 0xe0], // JPEG JFIF
      [0xff, 0xd8, 0xff, 0xe1], // JPEG EXIF
      [0xff, 0xd8, 0xff, 0xe8], // JPEG SPIFF
      [0xff, 0xd8, 0xff, 0xdb], // JPEG raw
    ],
    description: 'JPEG image',
  },
  {
    extension: 'png',
    mimeType: 'image/png',
    magicBytes: [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
    description: 'PNG image',
  },
  {
    extension: 'webp',
    mimeType: 'image/webp',
    magicBytes: [
      [0x52, 0x49, 0x46, 0x46, null, null, null, null, 0x57, 0x45, 0x42, 0x50], // RIFF????WEBP
    ],
    description: 'WebP image',
  },
  {
    extension: 'pdf',
    mimeType: 'application/pdf',
    magicBytes: [
      [0x25, 0x50, 0x44, 0x46], // %PDF
    ],
    description: 'PDF document',
  },
  {
    extension: 'gif',
    mimeType: 'image/gif',
    magicBytes: [
      [0x47, 0x49, 0x46, 0x38, 0x37, 0x61], // GIF87a
      [0x47, 0x49, 0x46, 0x38, 0x39, 0x61], // GIF89a
    ],
    description: 'GIF image',
  },
];

/**
 * Check if buffer matches a magic byte signature
 */
function matchesSignature(
  buffer: Buffer,
  signature: (number | null)[]
): boolean {
  if (buffer.length < signature.length) {
    return false;
  }

  for (let i = 0; i < signature.length; i++) {
    // null in signature means "any byte"
    if (signature[i] !== null && buffer[i] !== signature[i]) {
      return false;
    }
  }

  return true;
}

/**
 * Validate file content using magic bytes
 */
export function validateFileContent(buffer: Buffer): {
  isValid: boolean;
  detectedType?: {
    extension: string;
    mimeType: string;
    description: string;
  };
  error?: string;
} {
  if (!buffer || buffer.length === 0) {
    return {
      isValid: false,
      error: 'Empty or invalid file content',
    };
  }

  // Check minimum size (need at least 12 bytes for WebP detection)
  if (buffer.length < 12) {
    return {
      isValid: false,
      error: 'File too small to validate',
    };
  }

  // Try to match against known signatures
  for (const fileType of FILE_SIGNATURES) {
    for (const signature of fileType.magicBytes) {
      if (matchesSignature(buffer, signature)) {
        return {
          isValid: true,
          detectedType: {
            extension: fileType.extension,
            mimeType: fileType.mimeType,
            description: fileType.description,
          },
        };
      }
    }
  }

  return {
    isValid: false,
    error: 'Unknown or potentially malicious file type detected',
  };
}

/**
 * Comprehensive file validation combining magic bytes and MIME type validation
 */
export function validateFile(
  buffer: Buffer,
  reportedMimeType: string,
  allowedTypes: string[]
): {
  isValid: boolean;
  detectedType?: {
    extension: string;
    mimeType: string;
    description: string;
  };
  error?: string;
  warnings?: string[];
} {
  const warnings: string[] = [];

  // Step 1: Validate file content using magic bytes
  const contentValidation = validateFileContent(buffer);

  if (!contentValidation.isValid) {
    return {
      isValid: false,
      error: contentValidation.error,
    };
  }

  const detectedType = contentValidation.detectedType!;

  // Step 2: Check if detected type is in allowed types
  if (!allowedTypes.includes(detectedType.mimeType)) {
    return {
      isValid: false,
      error: `File type ${detectedType.description} is not allowed`,
      detectedType,
    };
  }

  // Step 3: Compare reported MIME type with detected type
  if (reportedMimeType !== detectedType.mimeType) {
    warnings.push(
      `MIME type mismatch: reported '${reportedMimeType}' but detected '${detectedType.mimeType}'`
    );
  }

  return {
    isValid: true,
    detectedType,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

/**
 * Get list of supported file types
 */
export function getSupportedFileTypes(): string[] {
  return FILE_SIGNATURES.map(sig => sig.mimeType);
}

/**
 * Security checks for potential threats in file content
 */
export function performSecurityChecks(buffer: Buffer): {
  isSafe: boolean;
  threats: string[];
} {
  const threats: string[] = [];

  // Check for embedded scripts in image files
  const content = buffer.toString('ascii', 0, Math.min(buffer.length, 1024));

  // Look for script tags
  if (/<script[\s>]/i.test(content)) {
    threats.push('Embedded script tag detected');
  }

  // Look for PHP tags
  if (/<\?php/i.test(content)) {
    threats.push('PHP code detected');
  }

  // Look for executable signatures
  if (buffer[0] === 0x4d && buffer[1] === 0x5a) {
    // MZ header (Windows executable)
    threats.push('Windows executable detected');
  }

  if (
    buffer[0] === 0x7f &&
    buffer[1] === 0x45 &&
    buffer[2] === 0x4c &&
    buffer[3] === 0x46
  ) {
    // ELF header
    threats.push('Linux executable detected');
  }

  return {
    isSafe: threats.length === 0,
    threats,
  };
}
