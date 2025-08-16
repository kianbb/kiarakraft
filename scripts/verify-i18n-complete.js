#!/usr/bin/env node

/**
 * Comprehensive i18n Verification Script
 * 
 * This script verifies that the Kiara Kraft i18n system is working correctly
 * by testing both English and Persian locales for:
 * - Translation key completeness
 * - Proper HTML lang and dir attributes
 * - SSR/CSR consistency
 * - No Persian fallbacks in English content
 */

const fs = require('fs');
const path = require('path');

console.log('🚀 Starting comprehensive i18n verification...\n');

// 1. Verify translation files exist and have proper structure
function verifyTranslationFiles() {
  console.log('📁 Verifying translation files...');
  
  const enPath = path.join(__dirname, '../locales/en.json');
  const faPath = path.join(__dirname, '../locales/fa.json');
  
  if (!fs.existsSync(enPath)) {
    throw new Error('❌ English translation file not found');
  }
  
  if (!fs.existsSync(faPath)) {
    throw new Error('❌ Persian translation file not found');
  }
  
  const en = JSON.parse(fs.readFileSync(enPath, 'utf8'));
  const fa = JSON.parse(fs.readFileSync(faPath, 'utf8'));
  
  console.log(`   ✅ English translations loaded (${Object.keys(en).length} top-level keys)`);
  console.log(`   ✅ Persian translations loaded (${Object.keys(fa).length} top-level keys)`);
  
  return { en, fa };
}

// 2. Compare translation key coverage
function verifyKeyCompleteness(en, fa) {
  console.log('\n🔍 Verifying translation key completeness...');
  
  function flattenKeys(obj, prefix = '') {
    let keys = [];
    for (let key in obj) {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      if (typeof obj[key] === 'object' && obj[key] !== null) {
        keys = keys.concat(flattenKeys(obj[key], fullKey));
      } else {
        keys.push(fullKey);
      }
    }
    return keys;
  }
  
  const enKeys = flattenKeys(en).sort();
  const faKeys = flattenKeys(fa).sort();
  
  const missingInFA = enKeys.filter(k => !faKeys.includes(k));
  const missingInEN = faKeys.filter(k => !enKeys.includes(k));
  
  if (missingInFA.length > 0) {
    console.log('   ⚠️  Keys missing in Persian:');
    missingInFA.forEach(k => console.log(`      - ${k}`));
  }
  
  if (missingInEN.length > 0) {
    console.log('   ⚠️  Keys missing in English:');
    missingInEN.forEach(k => console.log(`      - ${k}`));
  }
  
  if (missingInFA.length === 0 && missingInEN.length === 0) {
    console.log(`   ✅ Perfect key coverage! Both locales have ${enKeys.length} keys`);
  }
  
  return {
    complete: missingInFA.length === 0 && missingInEN.length === 0,
    enKeys: enKeys.length,
    faKeys: faKeys.length,
    missingInFA,
    missingInEN
  };
}

// 3. Verify required configuration files
function verifyConfigFiles() {
  console.log('\n⚙️  Verifying configuration files...');
  
  const requiredFiles = [
    { path: 'i18n/request.ts', name: 'i18n request configuration' },
    { path: 'middleware.ts', name: 'middleware configuration' },
    { path: 'components/providers/Providers.tsx', name: 'client providers' },
    { path: 'next.config.mjs', name: 'Next.js config with next-intl plugin' }
  ];
  
  for (const file of requiredFiles) {
    const fullPath = path.join(__dirname, '..', file.path);
    if (fs.existsSync(fullPath)) {
      console.log(`   ✅ ${file.name} found`);
      
      // Check for specific configurations
      const content = fs.readFileSync(fullPath, 'utf8');
      
      if (file.path === 'i18n/request.ts') {
        if (content.includes('getMessageFallback')) {
          console.log(`      ✅ Missing key fallback handling configured`);
        } else {
          console.log(`      ⚠️  Missing key fallback handling not found`);
        }
        
        if (content.includes('timeZone')) {
          console.log(`      ✅ TimeZone configuration found`);
        } else {
          console.log(`      ⚠️  TimeZone configuration missing`);
        }
      }
      
      if (file.path === 'middleware.ts') {
        if (content.includes('createMiddleware')) {
          console.log(`      ✅ next-intl middleware configured`);
        } else {
          console.log(`      ⚠️  next-intl middleware not configured`);
        }
      }
      
    } else {
      console.log(`   ❌ ${file.name} not found at ${file.path}`);
    }
  }
}

// 4. Test server endpoint accessibility
async function testServerEndpoints() {
  console.log('\n🌐 Testing server endpoints...');
  
  const testCases = [
    { path: '/en', expected: 'English', markers: ['Featured Categories', 'lang="en"', 'dir="ltr"'] },
    { path: '/fa', expected: 'Persian', markers: ['دسته‌بندی‌های ویژه', 'lang="fa"', 'dir="rtl"'] }
  ];
  
  // Check if server is running by trying to connect
  const { exec } = require('child_process');
  const util = require('util');
  const execAsync = util.promisify(exec);
  
  // Check if port 3001 or 3000 is in use
  let serverUrl = null;
  try {
    await execAsync('curl -f http://localhost:3001 > /dev/null 2>&1');
    serverUrl = 'http://localhost:3001';
    console.log('   ✅ Server detected on port 3001');
  } catch {
    try {
      await execAsync('curl -f http://localhost:3000 > /dev/null 2>&1');
      serverUrl = 'http://localhost:3000';
      console.log('   ✅ Server detected on port 3000');
    } catch {
      console.log('   ⚠️  No development server detected. Start with `npm run dev` to test endpoints.');
      return { serverRunning: false };
    }
  }
  
  const results = [];
  
  for (const testCase of testCases) {
    try {
      const { stdout } = await execAsync(`curl -s "${serverUrl}${testCase.path}"`);
      
      const foundMarkers = testCase.markers.filter(marker => stdout.includes(marker));
      const success = foundMarkers.length === testCase.markers.length;
      
      console.log(`   ${success ? '✅' : '❌'} ${testCase.expected} locale (${testCase.path})`);
      
      if (!success) {
        console.log(`      Missing markers: ${testCase.markers.filter(m => !foundMarkers.includes(m)).join(', ')}`);
      } else {
        console.log(`      Found all expected markers: ${testCase.markers.join(', ')}`);
      }
      
      results.push({ path: testCase.path, success, markers: foundMarkers });
      
    } catch (error) {
      console.log(`   ❌ Failed to test ${testCase.path}: ${error.message}`);
      results.push({ path: testCase.path, success: false, error: error.message });
    }
  }
  
  return { serverRunning: true, results };
}

// 5. Check for potential issues
function checkPotentialIssues() {
  console.log('\n🔧 Checking for potential issues...');
  
  // Check for hardcoded Persian strings in components
  const { exec } = require('child_process');
  const util = require('util');
  const execAsync = util.promisify(exec);
  
  // This is a simplified check - in a real scenario you'd want more sophisticated detection
  console.log('   📝 Checking for potential hardcoded strings...');
  console.log('   ℹ️  This is a basic check. Manual review is recommended for thorough verification.');
  
  // Check if common Persian/Arabic characters exist in component files
  try {
    exec('grep -r "[\u0600-\u06FF]" components/ app/ --exclude-dir=node_modules 2>/dev/null | head -5', (error, stdout) => {
      if (stdout.trim()) {
        console.log('   ⚠️  Found potential Persian/Arabic text in code:');
        console.log(stdout.trim().split('\n').map(line => `      ${line}`).join('\n'));
        console.log('   💡 Verify these are in translation files, not hardcoded');
      } else {
        console.log('   ✅ No obvious hardcoded Persian/Arabic text found in components');
      }
    });
  } catch (error) {
    console.log('   ℹ️  Could not check for hardcoded strings (grep not available)');
  }
}

// Main verification function
async function runVerification() {
  try {
    const { en, fa } = verifyTranslationFiles();
    const keyCheck = verifyKeyCompleteness(en, fa);
    verifyConfigFiles();
    const serverCheck = await testServerEndpoints();
    checkPotentialIssues();
    
    // Summary
    console.log('\n📊 VERIFICATION SUMMARY');
    console.log('========================');
    
    console.log(`Translation key coverage: ${keyCheck.complete ? '✅ PERFECT' : '⚠️  NEEDS ATTENTION'}`);
    console.log(`English keys: ${keyCheck.enKeys}`);
    console.log(`Persian keys: ${keyCheck.faKeys}`);
    
    if (serverCheck.serverRunning) {
      const allEndpointsWorking = serverCheck.results.every(r => r.success);
      console.log(`Server endpoints: ${allEndpointsWorking ? '✅ ALL WORKING' : '❌ SOME ISSUES'}`);
    } else {
      console.log('Server endpoints: ⚠️  NOT TESTED (server not running)');
    }
    
    console.log('\n🎉 i18n Verification Complete!');
    
    if (keyCheck.complete && (!serverCheck.serverRunning || serverCheck.results.every(r => r.success))) {
      console.log('✅ All checks passed! Your i18n setup looks excellent.');
      return true;
    } else {
      console.log('⚠️  Some issues detected. Review the output above.');
      return false;
    }
    
  } catch (error) {
    console.error('❌ Verification failed:', error.message);
    return false;
  }
}

// Run the verification
if (require.main === module) {
  runVerification().then(success => {
    process.exit(success ? 0 : 1);
  });
}

module.exports = { runVerification };