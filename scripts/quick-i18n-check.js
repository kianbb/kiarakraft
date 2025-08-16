#!/usr/bin/env node

/**
 * Quick i18n Verification Script
 * 
 * A simplified version for regular checks during development
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 Quick i18n verification...\n');

// Check translation key parity
function checkTranslationParity() {
  const en = JSON.parse(fs.readFileSync('./locales/en.json', 'utf8'));
  const fa = JSON.parse(fs.readFileSync('./locales/fa.json', 'utf8'));
  
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
  
  const enKeys = flattenKeys(en);
  const faKeys = flattenKeys(fa);
  
  const missingInFA = enKeys.filter(k => !faKeys.includes(k));
  const missingInEN = faKeys.filter(k => !enKeys.includes(k));
  
  if (missingInFA.length === 0 && missingInEN.length === 0) {
    console.log(`✅ Translation keys: ${enKeys.length} keys in sync`);
    return true;
  } else {
    console.log(`❌ Translation key mismatch:`);
    if (missingInFA.length > 0) {
      console.log(`   Missing in Persian: ${missingInFA.join(', ')}`);
    }
    if (missingInEN.length > 0) {
      console.log(`   Missing in English: ${missingInEN.join(', ')}`);
    }
    return false;
  }
}

// Quick endpoint test
async function quickEndpointTest() {
  const { exec } = require('child_process');
  const util = require('util');
  const execAsync = util.promisify(exec);
  
  try {
    // Try port 3001 first, then 3000
    let serverUrl = null;
    try {
      await execAsync('curl -f http://localhost:3001 > /dev/null 2>&1');
      serverUrl = 'http://localhost:3001';
    } catch {
      await execAsync('curl -f http://localhost:3000 > /dev/null 2>&1');
      serverUrl = 'http://localhost:3000';
    }
    
    // Test both locales
    const enTest = await execAsync(`curl -s "${serverUrl}/en" | grep -c "Featured Categories"`);
    const faTest = await execAsync(`curl -s "${serverUrl}/fa" | grep -c "دسته‌بندی‌های ویژه"`);
    
    if (enTest.stdout.trim() === '1' && faTest.stdout.trim() === '1') {
      console.log('✅ Server endpoints: Both locales working');
      return true;
    } else {
      console.log('❌ Server endpoints: Translation issues detected');
      return false;
    }
  } catch (error) {
    console.log('⚠️  Server endpoints: Not tested (server not running)');
    return null;
  }
}

// Run checks
async function main() {
  const keyCheck = checkTranslationParity();
  const endpointCheck = await quickEndpointTest();
  
  console.log('\n' + '='.repeat(40));
  
  if (keyCheck && (endpointCheck === null || endpointCheck)) {
    console.log('🎉 i18n system is healthy!');
    process.exit(0);
  } else {
    console.log('⚠️  Issues detected in i18n system');
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}