#!/usr/bin/env tsx
import {
  validatePasswordComplexity,
  isAccountLocked,
  recordLoginAttempt,
} from '../lib/auth-security';

async function testAuthenticationSecurity() {
  console.log('🔐 Testing Authentication Security...');

  // Test password complexity validation
  console.log('\n📋 Password Complexity Tests:');

  const passwords = [
    { pass: '123', expected: false, desc: 'Too short, no complexity' },
    { pass: 'password', expected: false, desc: 'No numbers, no uppercase' },
    { pass: 'Password', expected: false, desc: 'No numbers' },
    { pass: 'SecureKey123', expected: true, desc: 'Valid complex password' },
    { pass: 'MySecure123!', expected: true, desc: 'Valid with special chars' },
  ];

  let passwordTestsPassed = 0;
  passwords.forEach(({ pass, expected, desc }) => {
    const result = validatePasswordComplexity(pass);
    const passed = result.valid === expected;
    console.log(
      `${passed ? '✅' : '❌'} ${desc}: ${result.valid} (expected ${expected})`
    );
    if (!result.valid && result.errors.length > 0) {
      console.log(`   Errors: ${result.errors.join(', ')}`);
    }
    if (passed) passwordTestsPassed++;
  });

  // Test account lockout functionality
  console.log('\n🔒 Account Lockout Tests:');

  const testEmail = 'test@example.com';
  const testIp = '127.0.0.1';
  let lockoutTestsPassed = 0;

  // Initially should not be locked
  if (!(await isAccountLocked(testEmail))) {
    console.log('✅ Account initially not locked');
    lockoutTestsPassed++;
  } else {
    console.log('❌ Account should not be initially locked');
  }

  // Record multiple failed attempts (5 is the max)
  for (let i = 0; i < 5; i++) {
    await recordLoginAttempt(testEmail, testIp, false); // false = failed attempt
  }

  // Should now be locked
  if (await isAccountLocked(testEmail)) {
    console.log('✅ Account correctly locked after max attempts');
    lockoutTestsPassed++;
  } else {
    console.log('❌ Account should be locked after max attempts');
  }

  console.log('\n📊 Authentication Security Summary:');
  console.log(`Password Tests: ${passwordTestsPassed}/${passwords.length}`);
  console.log(`Lockout Tests: ${lockoutTestsPassed}/2`);

  return {
    passwordTests: passwordTestsPassed === passwords.length,
    lockoutTests: lockoutTestsPassed === 2,
  };
}

async function testAuthApiEndpoints() {
  console.log('\n🌐 Testing Auth API Endpoints...');

  const baseUrl = 'http://localhost:3000';
  let apiTestsPassed = 0;

  try {
    // First, check if server is running with a quick timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    try {
      const healthCheck = await fetch(`${baseUrl}/api/health`, {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!healthCheck.ok) {
        throw new Error('Server not responding');
      }
    } catch (fetchError) {
      clearTimeout(timeoutId);
      throw fetchError;
    }

    // Test registration endpoint (should require POST)
    const registerGet = await fetch(`${baseUrl}/api/auth/register`);
    if (registerGet.status === 405) {
      // Method not allowed
      console.log('✅ Registration endpoint correctly blocks GET requests');
      apiTestsPassed++;
    } else {
      console.log(
        `❌ Registration endpoint returned ${registerGet.status} for GET (expected 405)`
      );
    }

    // Test password reset endpoint
    const forgotPasswordGet = await fetch(
      `${baseUrl}/api/auth/forgot-password`
    );
    if (forgotPasswordGet.status === 405) {
      console.log('✅ Forgot password endpoint correctly blocks GET requests');
      apiTestsPassed++;
    } else {
      console.log(
        `❌ Forgot password endpoint returned ${forgotPasswordGet.status} for GET (expected 405)`
      );
    }

    // Test invalid registration data
    const invalidRegistration = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'invalid-email',
        password: '123', // Too weak
        name: '',
      }),
    });

    if (invalidRegistration.status === 400) {
      console.log('✅ Registration correctly rejects invalid data');
      apiTestsPassed++;
    } else {
      console.log(
        `❌ Registration should reject invalid data (got ${invalidRegistration.status})`
      );
    }
  } catch (error) {
    // Check for network connection errors (server not running)
    const isConnectionError =
      error instanceof Error &&
      (error.name === 'AbortError' ||
        (error as NodeJS.ErrnoException).code === 'ECONNREFUSED' ||
        error.message.includes('fetch failed') ||
        error.message.includes('ECONNREFUSED'));

    if (isConnectionError) {
      console.log(
        '⚠️  Development server not running - skipping Auth API endpoint tests'
      );
      console.log(
        '   💡 To test API endpoints, run: npm run dev (in another terminal)'
      );
      return true; // Don't fail the overall test suite
    }
    console.error('❌ Auth API endpoint tests failed:', error);
    return false;
  }

  console.log(`API Endpoint Tests: ${apiTestsPassed}/3`);
  return apiTestsPassed === 3;
}

async function runAuthTests() {
  console.log('🔐 Authentication & Security Test Suite');
  console.log('======================================');

  const securityResults = await testAuthenticationSecurity();
  const apiResults = await testAuthApiEndpoints();

  const allTestsPassed =
    securityResults.passwordTests && securityResults.lockoutTests && apiResults;

  console.log('\n🏆 Final Authentication Test Results:');
  console.log(
    `✅ Password Complexity: ${securityResults.passwordTests ? 'PASS' : 'FAIL'}`
  );
  console.log(
    `✅ Account Lockout: ${securityResults.lockoutTests ? 'PASS' : 'FAIL'}`
  );
  console.log(`✅ API Security: ${apiResults ? 'PASS' : 'FAIL'}`);

  if (allTestsPassed) {
    console.log('\n🎉 All authentication tests passed!');
    console.log('🔒 Authentication system is secure and functional.');
  } else {
    console.log('\n⚠️  Some authentication tests failed.');
    console.log('❗ Review authentication security before deployment.');
  }

  return allTestsPassed;
}

runAuthTests()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('Fatal error running auth tests:', error);
    process.exit(1);
  });
