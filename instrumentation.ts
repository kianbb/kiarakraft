/**
 * Next.js Instrumentation
 * This file runs once when the server starts, before any requests are handled
 * Used for initialization tasks like security configuration validation
 */

export async function register() {
  // Only run on server-side in Node.js runtime
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    console.log('🔐 Initializing security configuration...');

    try {
      // Dynamic import to avoid build-time issues with crypto module
      const { initializeSecurityConfig } = await import(
        '@/lib/security-config'
      );

      // Validate security configuration at startup
      initializeSecurityConfig();
      console.log('✅ Security configuration initialized');
    } catch (error) {
      console.error('❌ Failed to initialize security configuration:', error);
      // Don't throw in production to prevent startup failures
      // but log the error for monitoring
      if (process.env.NODE_ENV === 'production') {
        console.error(
          '⚠️  CRITICAL: Running with potentially insecure configuration'
        );
      } else {
        // In development, we can be more strict
        throw error;
      }
    }

    // Log environment mode
    console.log(
      `🚀 Server started in ${process.env.NODE_ENV || 'development'} mode`
    );
  }
}
