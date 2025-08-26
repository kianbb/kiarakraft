#!/usr/bin/env tsx
/**
 * Comprehensive Functionality Test Suite
 * Tests all major systems after security implementation
 */

import { execSync } from 'child_process';

interface TestResult {
  name: string;
  passed: boolean;
  duration: number;
  details?: string;
}

async function runTest(name: string, command: string): Promise<TestResult> {
  const start = Date.now();
  try {
    console.log(`🧪 Running ${name}...`);
    const output = execSync(command, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 60000,
    });
    const duration = Date.now() - start;
    console.log(`✅ ${name} completed in ${duration}ms`);
    return { name, passed: true, duration, details: output };
  } catch (error) {
    const duration = Date.now() - start;
    const details = error instanceof Error ? error.message : String(error);
    console.log(`❌ ${name} failed in ${duration}ms`);
    return { name, passed: false, duration, details };
  }
}

async function runAllTests() {
  console.log('🚀 Kiara Kraft - Comprehensive Test Suite');
  console.log('=========================================');
  console.log('Testing all systems after security implementation...\n');

  const tests = [
    { name: 'TypeScript Compilation', command: 'npm run typecheck' },
    { name: 'Production Build', command: 'npm run build' },
    {
      name: 'Core Functionality Tests',
      command: 'npx tsx scripts/test-functionality.ts',
    },
    {
      name: 'Authentication & Security',
      command: 'npx tsx scripts/test-auth.ts',
    },
    {
      name: 'Notification System',
      command: 'npx tsx scripts/test-notifications.ts',
    },
    { name: 'Security Audit', command: 'npx tsx scripts/security-audit.ts' },
    { name: 'Official Test Suite', command: 'npm run test' },
  ];

  const results: TestResult[] = [];
  const startTime = Date.now();

  for (const test of tests) {
    const result = await runTest(test.name, test.command);
    results.push(result);

    // Short pause between tests
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  const totalDuration = Date.now() - startTime;
  const passed = results.filter(r => r.passed).length;
  const total = results.length;

  console.log('\n📊 Final Test Results');
  console.log('=====================');

  results.forEach(result => {
    const status = result.passed ? '✅ PASS' : '❌ FAIL';
    const time = `${result.duration}ms`;
    console.log(`${status} ${result.name.padEnd(25)} (${time})`);

    if (!result.passed && result.details) {
      console.log(`   Error: ${result.details.split('\\n')[0]}`);
    }
  });

  console.log(`\\n🏆 Summary: ${passed}/${total} tests passed`);
  console.log(
    `⏱️  Total execution time: ${(totalDuration / 1000).toFixed(2)}s`
  );

  if (passed === total) {
    console.log('\\n🎉 ALL TESTS PASSED!');
    console.log('🔒 System is secure and production-ready');
    console.log('✨ Kiara Kraft is ready for deployment');
  } else {
    console.log('\\n⚠️  Some tests failed');
    console.log('❗ Review failed tests before deployment');
  }

  return passed === total;
}

runAllTests()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('Fatal error running comprehensive tests:', error);
    process.exit(1);
  });
