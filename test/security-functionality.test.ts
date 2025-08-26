#!/usr/bin/env tsx
/**
 * Security Functionality Tests
 * Verify that all security fixes are working correctly
 */

import {
  validateFileContent,
  performSecurityChecks,
} from '../lib/file-validation';

import {
  sanitizeAndValidate,
  detectThreats,
  SanitizationLevel,
  escapeHtml,
  stripHtml,
} from '../lib/input-sanitization';

import {
  validatePasswordComplexity,
  validateEmail,
} from '../lib/auth-security';

console.log('🔒 Starting Security Functionality Tests...\n');

// Test 1: File Validation with Magic Bytes
console.log('📁 Testing File Validation...');
function testFileValidation(): boolean {
  let passed = 0;
  let total = 0;

  // Test JPEG detection
  total++;
  const jpegBuffer = Buffer.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
  ]);
  const jpegResult = validateFileContent(jpegBuffer);
  if (
    jpegResult.isValid &&
    jpegResult.detectedType?.mimeType === 'image/jpeg'
  ) {
    console.log('✅ JPEG magic bytes detection working');
    passed++;
  } else {
    console.log('❌ JPEG magic bytes detection failed');
  }

  // Test PNG detection
  total++;
  const pngBuffer = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
  ]);
  const pngResult = validateFileContent(pngBuffer);
  if (pngResult.isValid && pngResult.detectedType?.mimeType === 'image/png') {
    console.log('✅ PNG magic bytes detection working');
    passed++;
  } else {
    console.log('❌ PNG magic bytes detection failed');
  }

  // Test malicious file rejection
  total++;
  const maliciousBuffer = Buffer.from([
    0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc, 0xde, 0xf0,
  ]);
  const maliciousResult = validateFileContent(maliciousBuffer);
  if (!maliciousResult.isValid) {
    console.log('✅ Malicious file correctly rejected');
    passed++;
  } else {
    console.log('❌ Malicious file was not rejected');
  }

  // Test security checks
  total++;
  const phpBuffer = Buffer.from('<?php echo "malicious code"; ?>', 'utf8');
  const securityCheck = performSecurityChecks(phpBuffer);
  if (
    !securityCheck.isSafe &&
    securityCheck.threats.some(t => t.includes('PHP'))
  ) {
    console.log('✅ PHP code threat detection working');
    passed++;
  } else {
    console.log('❌ PHP code threat detection failed');
  }

  console.log(`File Validation: ${passed}/${total} tests passed\n`);
  return passed === total;
}

// Test 2: Input Sanitization
console.log('🧹 Testing Input Sanitization...');
function testInputSanitization(): boolean {
  let passed = 0;
  let total = 0;

  // Test XSS prevention
  total++;
  const xssInput = '<script>alert("xss")</script>Hello World';
  const sanitized = sanitizeAndValidate(xssInput, {
    sanitizationLevel: SanitizationLevel.STRICT,
    detectThreats: true,
  });
  if (sanitized.isValid && !sanitized.sanitized.includes('<script>')) {
    console.log('✅ XSS script tags removed from input');
    passed++;
  } else {
    console.log('❌ XSS script tags not properly removed');
  }

  // Test threat detection
  total++;
  const sqlInput = "'; DROP TABLE users; --";
  const threatResult = detectThreats(sqlInput);
  if (
    !threatResult.isSafe &&
    threatResult.threats.some(t => t.type === 'sql_injection')
  ) {
    console.log('✅ SQL injection threat detection working');
    passed++;
  } else {
    console.log('❌ SQL injection threat detection failed');
  }

  // Test HTML escaping
  total++;
  const htmlInput = '<div>Test & "quotes" \'apostrophes\'</div>';
  const escaped = escapeHtml(htmlInput);
  if (
    escaped.includes('&lt;div&gt;') &&
    escaped.includes('&amp;') &&
    escaped.includes('&quot;')
  ) {
    console.log('✅ HTML escaping working correctly');
    passed++;
  } else {
    console.log('❌ HTML escaping failed');
  }

  // Test HTML stripping
  total++;
  const htmlToStrip = '<p><strong>Bold</strong> and <em>italic</em> text</p>';
  const stripped = stripHtml(htmlToStrip);
  if (
    stripped === 'Bold and italic text' ||
    (stripped.includes('Bold') && !stripped.includes('<'))
  ) {
    console.log('✅ HTML stripping working correctly');
    passed++;
  } else {
    console.log('❌ HTML stripping failed');
    console.log(`Expected clean text, got: "${stripped}"`);
  }

  console.log(`Input Sanitization: ${passed}/${total} tests passed\n`);
  return passed === total;
}

// Test 3: Password Validation
console.log('🔐 Testing Password Validation...');
function testPasswordValidation(): boolean {
  let passed = 0;
  let total = 0;

  // Test weak password rejection
  total++;
  const weakPassword = validatePasswordComplexity('123456');
  if (!weakPassword.valid && weakPassword.errors.length > 0) {
    console.log('✅ Weak password correctly rejected');
    passed++;
  } else {
    console.log('❌ Weak password was not rejected');
  }

  // Test strong password acceptance
  total++;
  const strongPassword = validatePasswordComplexity('SecurePass123!');
  if (strongPassword.valid) {
    console.log('✅ Strong password correctly accepted');
    passed++;
  } else {
    console.log('❌ Strong password was rejected:', strongPassword.errors);
  }

  // Test password requirements
  total++;
  const noUppercase = validatePasswordComplexity('securepass123');
  if (
    !noUppercase.valid &&
    noUppercase.errors.some(e => e.includes('uppercase'))
  ) {
    console.log('✅ Missing uppercase requirement detected');
    passed++;
  } else {
    console.log('❌ Missing uppercase requirement not detected');
  }

  // Test common pattern detection
  total++;
  const commonPattern = validatePasswordComplexity('Password123');
  if (
    !commonPattern.valid &&
    commonPattern.errors.some(e => e.includes('common patterns'))
  ) {
    console.log('✅ Common password pattern detected');
    passed++;
  } else {
    console.log('❌ Common password pattern not detected');
  }

  console.log(`Password Validation: ${passed}/${total} tests passed\n`);
  return passed === total;
}

// Test 4: Email Validation
console.log('📧 Testing Email Validation...');
function testEmailValidation(): boolean {
  let passed = 0;
  let total = 0;

  // Test valid email
  total++;
  const validEmail = validateEmail('user@example.com');
  if (validEmail) {
    console.log('✅ Valid email accepted');
    passed++;
  } else {
    console.log('❌ Valid email rejected');
  }

  // Test invalid email
  total++;
  const invalidEmail = validateEmail('invalid-email');
  if (!invalidEmail) {
    console.log('✅ Invalid email rejected');
    passed++;
  } else {
    console.log('❌ Invalid email accepted');
  }

  // Test email with special characters
  total++;
  const specialEmail = validateEmail('user+tag@sub.example.com');
  if (specialEmail) {
    console.log('✅ Email with special characters accepted');
    passed++;
  } else {
    console.log('❌ Email with special characters rejected');
  }

  console.log(`Email Validation: ${passed}/${total} tests passed\n`);
  return passed === total;
}

// Test 5: Integration Tests
console.log('🔗 Testing Security Integration...');
function testSecurityIntegration(): boolean {
  let passed = 0;
  let total = 0;

  // Test complete product validation flow
  total++;
  const productTitle = sanitizeAndValidate(
    'My <script>alert("xss")</script> Product',
    {
      maxLength: 200,
      minLength: 3,
      sanitizationLevel: SanitizationLevel.STRICT,
      allowEmpty: false,
      detectThreats: true,
    }
  );

  if (
    productTitle.isValid &&
    !productTitle.sanitized.includes('<script>') &&
    productTitle.sanitized.includes('My') &&
    productTitle.sanitized.includes('Product')
  ) {
    console.log('✅ Product title sanitization working end-to-end');
    passed++;
  } else {
    console.log('❌ Product title sanitization failed');
    console.log('Sanitized:', productTitle.sanitized);
    console.log('Errors:', productTitle.errors);
  }

  // Test contact form validation
  total++;
  const contactMessage = sanitizeAndValidate(
    'Hello! Please help with <img src="x" onerror="alert(1)"> issue',
    {
      maxLength: 2000,
      minLength: 10,
      sanitizationLevel: SanitizationLevel.STRICT,
      allowEmpty: false,
      detectThreats: true,
    }
  );

  if (
    contactMessage.isValid &&
    !contactMessage.sanitized.includes('onerror') &&
    contactMessage.sanitized.includes('Hello')
  ) {
    console.log('✅ Contact message sanitization working end-to-end');
    passed++;
  } else {
    console.log('❌ Contact message sanitization failed');
  }

  console.log(`Security Integration: ${passed}/${total} tests passed\n`);
  return passed === total;
}

// Run all tests
async function runAllTests() {
  console.log('🚀 Running Comprehensive Security Tests...\n');

  const results = {
    fileValidation: testFileValidation(),
    inputSanitization: testInputSanitization(),
    passwordValidation: testPasswordValidation(),
    emailValidation: testEmailValidation(),
    securityIntegration: testSecurityIntegration(),
  };

  const totalTests = Object.keys(results).length;
  const passedTests = Object.values(results).filter(Boolean).length;

  console.log('📊 FINAL RESULTS:');
  console.log('==================');

  Object.entries(results).forEach(([test, passed]) => {
    const icon = passed ? '✅' : '❌';
    const status = passed ? 'PASSED' : 'FAILED';
    console.log(`${icon} ${test}: ${status}`);
  });

  console.log('==================');
  console.log(`Overall: ${passedTests}/${totalTests} test suites passed`);

  if (passedTests === totalTests) {
    console.log('🎉 ALL SECURITY TESTS PASSED! 🎉');
    console.log('✅ All security fixes are working correctly');
  } else {
    console.log('⚠️  Some security tests failed');
    console.log('❗ Please review the failed tests above');
  }

  return passedTests === totalTests;
}

// Execute tests
runAllTests()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('❌ Test execution failed:', error);
    process.exit(1);
  });
