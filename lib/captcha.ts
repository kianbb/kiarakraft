/**
 * CAPTCHA Implementation
 * Uses Cloudflare Turnstile for bot protection
 * Falls back to honeypot field if Turnstile is not configured
 */

interface TurnstileVerifyResponse {
  success: boolean;
  'error-codes': string[];
  challenge_ts?: string;
  hostname?: string;
}

/**
 * Verify Cloudflare Turnstile CAPTCHA token
 */
export async function verifyTurnstileToken(
  token: string,
  ip?: string
): Promise<{
  success: boolean;
  error?: string;
}> {
  const secret = process.env.TURNSTILE_SECRET_KEY;

  if (!secret) {
    console.warn(
      'Turnstile secret key not configured, skipping CAPTCHA verification'
    );
    return { success: true }; // Allow if not configured (development)
  }

  try {
    const formData = new URLSearchParams();
    formData.append('secret', secret);
    formData.append('response', token);
    if (ip) {
      formData.append('remoteip', ip);
    }

    const response = await fetch(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      {
        method: 'POST',
        body: formData,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );

    const data: TurnstileVerifyResponse = await response.json();

    if (!data.success) {
      console.warn('Turnstile verification failed:', data['error-codes']);
      return {
        success: false,
        error: data['error-codes']?.join(', ') || 'CAPTCHA verification failed',
      };
    }

    return { success: true };
  } catch (error) {
    console.error('Turnstile verification error:', error);
    return {
      success: false,
      error: 'CAPTCHA verification service error',
    };
  }
}

/**
 * Verify honeypot field (invisible to users, filled by bots)
 */
export function verifyHoneypot(honeypotValue: string | undefined): boolean {
  // If honeypot field is filled, it's likely a bot
  if (honeypotValue && honeypotValue.trim() !== '') {
    console.warn('Honeypot field filled, likely bot detected');
    return false;
  }
  return true;
}

/**
 * Check if request appears to be from a bot based on headers
 */
export function checkBotHeaders(headers: Headers): {
  isBot: boolean;
  reason?: string;
} {
  const userAgent = headers.get('user-agent')?.toLowerCase() || '';

  // Common bot user agents
  const botPatterns = [
    'bot',
    'crawler',
    'spider',
    'scraper',
    'curl',
    'wget',
    'python',
    'java/',
    'php/',
    'ruby/',
    'perl/',
    'go-http-client',
  ];

  for (const pattern of botPatterns) {
    if (userAgent.includes(pattern)) {
      return { isBot: true, reason: `Bot user agent detected: ${pattern}` };
    }
  }

  // Check for missing headers that real browsers send
  if (!headers.get('accept-language')) {
    return { isBot: true, reason: 'Missing Accept-Language header' };
  }

  if (!headers.get('accept-encoding')) {
    return { isBot: true, reason: 'Missing Accept-Encoding header' };
  }

  return { isBot: false };
}

/**
 * Combined bot protection check
 */
export async function verifyHumanUser(request: {
  turnstileToken?: string;
  honeypot?: string;
  headers: Headers;
  ip?: string;
}): Promise<{
  isHuman: boolean;
  error?: string;
}> {
  // Check honeypot first (quick check)
  if (!verifyHoneypot(request.honeypot)) {
    return { isHuman: false, error: 'Bot detected via honeypot' };
  }

  // Check headers for obvious bots
  const headerCheck = checkBotHeaders(request.headers);
  if (headerCheck.isBot) {
    return { isHuman: false, error: headerCheck.reason };
  }

  // If Turnstile token provided, verify it
  if (request.turnstileToken) {
    const turnstileResult = await verifyTurnstileToken(
      request.turnstileToken,
      request.ip
    );
    if (!turnstileResult.success) {
      return { isHuman: false, error: turnstileResult.error };
    }
  } else if (
    process.env.NODE_ENV === 'production' &&
    process.env.TURNSTILE_SECRET_KEY
  ) {
    // In production with Turnstile configured, require token
    return { isHuman: false, error: 'CAPTCHA token required' };
  }

  return { isHuman: true };
}
