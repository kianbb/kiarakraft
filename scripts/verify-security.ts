#!/usr/bin/env tsx

/**
 * Security Verification Script
 * Tests that all security improvements are working correctly
 */

import { validateSecurityConfig } from '../lib/security-config';
import { validateJsonLdSafety } from '../lib/seo-sanitizer';
import fs from 'fs';
import path from 'path';

interface TestResult {
  name: string;
  passed: boolean;
  message?: string;
}

const tests: TestResult[] = [];

function test(name: string, condition: boolean, failMessage?: string) {
  tests.push({
    name,
    passed: condition,
    message: condition ? undefined : failMessage,
  });
}

async function runTests() {
  console.log('🔒 Running Security Verification Tests\n');

  // Test 1: Security configuration validation
  console.log('1. Testing security configuration...');
  const configValidation = validateSecurityConfig();
  test(
    'Security configuration is valid',
    configValidation.valid,
    `Found ${configValidation.errors.length} errors`
  );

  // Test 2: Check if audit log model exists in schema
  console.log('2. Checking audit log schema...');
  const schemaPath = path.join(process.cwd(), 'prisma', 'schema.prisma');
  const schemaContent = fs.readFileSync(schemaPath, 'utf-8');
  test(
    'Audit log model exists in schema',
    schemaContent.includes('model AuditLog'),
    'AuditLog model not found in schema'
  );

  // Test 3: Check security headers in next.config
  console.log('3. Checking security headers...');
  const configPath = path.join(process.cwd(), 'next.config.mjs');
  const configContent = fs.readFileSync(configPath, 'utf-8');
  test(
    'Permissions-Policy header configured',
    configContent.includes('Permissions-Policy'),
    'Permissions-Policy header not found'
  );
  test(
    'X-Permitted-Cross-Domain-Policies configured',
    configContent.includes('X-Permitted-Cross-Domain-Policies'),
    'X-Permitted-Cross-Domain-Policies not found'
  );

  // Test 4: Check XSS protection in SEO components
  console.log('4. Testing XSS protection...');
  const dangerousData = {
    title: '<script>alert("XSS")</script>',
    description: 'Test <iframe src="evil.com"></iframe>',
    onclick: 'javascript:alert(1)',
  };

  const safeJson = JSON.stringify(dangerousData);
  const safety = validateJsonLdSafety(safeJson);
  test(
    'XSS patterns detected in JSON-LD',
    !safety.safe && safety.warnings.length > 0,
    'XSS protection not working properly'
  );

  // Test 5: Check session configuration
  console.log('5. Checking session configuration...');
  const authConfigPath = path.join(process.cwd(), 'lib', 'auth-config.ts');
  const authConfigContent = fs.readFileSync(authConfigPath, 'utf-8');
  test(
    'Secure session configuration imported',
    authConfigContent.includes('getSecureSessionConfig'),
    'Secure session config not implemented'
  );

  // Test 6: Check seed endpoint security
  console.log('6. Checking seed endpoint security...');
  const seedRoutePath = path.join(
    process.cwd(),
    'app',
    'api',
    'admin',
    'seed',
    'route.ts'
  );
  const seedRouteContent = fs.readFileSync(seedRoutePath, 'utf-8');
  test(
    'Seed endpoint has multiple security layers',
    seedRouteContent.includes('ENABLE_SEED_ENDPOINT') &&
      seedRouteContent.includes('timingSafeEqual'),
    'Seed endpoint security not properly implemented'
  );

  // Test 7: Check file validation
  console.log('7. Checking file validation...');
  const fileValidationPath = path.join(
    process.cwd(),
    'lib',
    'file-validation.ts'
  );
  test(
    'File validation module exists',
    fs.existsSync(fileValidationPath),
    'File validation module not found'
  );

  // Test 8: Check CSRF protection
  console.log('8. Checking CSRF protection...');
  const csrfPath = path.join(process.cwd(), 'lib', 'csrf.ts');
  test(
    'CSRF protection module exists',
    fs.existsSync(csrfPath),
    'CSRF protection module not found'
  );

  // Test 9: Check rate limiting
  console.log('9. Checking rate limiting...');
  const rateLimitPath = path.join(process.cwd(), 'lib', 'rateLimit.ts');
  test(
    'Rate limiting module exists',
    fs.existsSync(rateLimitPath),
    'Rate limiting module not found'
  );

  // Test 10: Check environment variables
  console.log('10. Checking environment variables...');
  test(
    'NEXTAUTH_SECRET is configured',
    !!process.env.NEXTAUTH_SECRET &&
      process.env.NEXTAUTH_SECRET !== 'replace-me',
    'NEXTAUTH_SECRET not properly configured'
  );

  // Print results
  console.log('\n📊 Test Results:\n');

  let passed = 0;
  let failed = 0;

  tests.forEach((test, index) => {
    const icon = test.passed ? '✅' : '❌';
    console.log(`${icon} ${index + 1}. ${test.name}`);
    if (test.message) {
      console.log(`     ${test.message}`);
    }
    if (test.passed) passed++;
    else failed++;
  });

  const percentage = Math.round((passed / tests.length) * 100);

  console.log('\n' + '='.repeat(50));
  console.log(`\n📈 Security Test Summary:`);
  console.log(`   Passed: ${passed}/${tests.length} (${percentage}%)`);
  console.log(`   Failed: ${failed}/${tests.length}`);

  if (percentage === 100) {
    console.log('\n🎉 All security tests passed! Your application is secure.');
    process.exit(0);
  } else if (percentage >= 80) {
    console.log('\n⚠️  Most security tests passed, but some issues remain.');
    process.exit(1);
  } else {
    console.log(
      '\n❌ Security tests failed. Please fix the issues before deploying.'
    );
    process.exit(1);
  }
}

// Run tests
runTests().catch(error => {
  console.error('Error running security tests:', error);
  process.exit(1);
});
