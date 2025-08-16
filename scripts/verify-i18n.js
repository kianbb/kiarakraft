#!/usr/bin/env node

/**
 * i18n Verification Script
 * Tests both English and Persian locales to ensure proper translation rendering
 */

const { execSync } = require('child_process');

const SERVER_URL = process.env.NEXT_URL || 'http://localhost:3001';

const tests = [
  {
    name: 'English Locale Navigation',
    url: `${SERVER_URL}/en`,
    shouldContain: ['Home', 'Explore', 'Kiara Kraft'],
    shouldNotContain: ['خانه', 'کاوش', 'کیارا کرفت']
  },
  {
    name: 'English Locale Auth Buttons',
    url: `${SERVER_URL}/en`,
    shouldContain: ['Login', 'Register'],
    shouldNotContain: ['ورود', 'ثبت‌نام']
  },
  {
    name: 'English Locale HTML Lang',
    url: `${SERVER_URL}/en`,
    shouldContain: ['<html lang="en" dir="ltr"'],
    shouldNotContain: ['<html lang="fa" dir="rtl"']
  },
  {
    name: 'Persian Locale Navigation',
    url: `${SERVER_URL}/fa`,
    shouldContain: ['خانه', 'کاوش', 'کیارا کرفت'],
    shouldNotContain: ['Home', 'Explore', 'Kiara Kraft']
  },
  {
    name: 'Persian Locale HTML Lang',
    url: `${SERVER_URL}/fa`,
    shouldContain: ['<html lang="fa" dir="rtl"'],
    shouldNotContain: ['<html lang="en" dir="ltr"']
  }
];

async function runTest(test) {
  try {
    console.log(`Testing: ${test.name}`);
    
    const response = execSync(`curl -s "${test.url}"`, { encoding: 'utf8' });
    
    let passed = true;
    let details = [];

    // Check required content
    for (const content of test.shouldContain) {
      if (!response.includes(content)) {
        passed = false;
        details.push(`✗ Missing: "${content}"`);
      } else {
        details.push(`✓ Found: "${content}"`);
      }
    }

    // Check forbidden content
    for (const content of test.shouldNotContain) {
      if (response.includes(content)) {
        passed = false;
        details.push(`✗ Should not contain: "${content}"`);
      } else {
        details.push(`✓ Correctly absent: "${content}"`);
      }
    }

    console.log(`${passed ? '✅' : '❌'} ${test.name}: ${passed ? 'PASSED' : 'FAILED'}`);
    if (!passed || process.env.VERBOSE) {
      details.forEach(detail => console.log(`  ${detail}`));
    }
    console.log('');

    return passed;
  } catch (error) {
    console.log(`❌ ${test.name}: ERROR - ${error.message}`);
    console.log('');
    return false;
  }
}

async function main() {
  console.log('🔍 Starting i18n Verification Tests\n');
  
  let totalTests = tests.length;
  let passedTests = 0;

  for (const test of tests) {
    const passed = await runTest(test);
    if (passed) passedTests++;
  }

  console.log(`📊 Results: ${passedTests}/${totalTests} tests passed`);
  
  if (passedTests === totalTests) {
    console.log('🎉 All i18n tests passed!');
    process.exit(0);
  } else {
    console.log('⚠️  Some i18n tests failed. Please check the output above.');
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { tests, runTest };