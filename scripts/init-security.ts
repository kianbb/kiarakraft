#!/usr/bin/env tsx

/**
 * Security Initialization Script
 * Run this to check security configuration and generate secure secrets
 */

import { generateSecureSecret, validateSecurityConfig } from '../lib/security-config';
import fs from 'fs';
import path from 'path';
import readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

async function main() {
  console.log('🔒 Kiara Kraft Security Initialization\n');
  console.log('This script will help you set up secure configuration.\n');

  // Check current security configuration
  console.log('📋 Checking current security configuration...\n');
  const validation = validateSecurityConfig();

  if (validation.errors.length > 0) {
    console.error('❌ Security Configuration Errors:');
    validation.errors.forEach(error => console.error(`   • ${error}`));
    console.log('');
  }

  if (validation.warnings.length > 0) {
    console.warn('⚠️  Security Configuration Warnings:');
    validation.warnings.forEach(warning => console.warn(`   • ${warning}`));
    console.log('');
  }

  if (validation.suggestions.length > 0) {
    console.log('💡 Suggestions:');
    validation.suggestions.forEach(suggestion => console.log(`   • ${suggestion}`));
    console.log('');
  }

  // Offer to generate secure secrets
  const generateSecrets = await question(
    'Would you like to generate secure secrets? (y/n): '
  );

  if (generateSecrets.toLowerCase() === 'y') {
    console.log('\n🔐 Generating secure secrets...\n');

    const secrets = {
      NEXTAUTH_SECRET: generateSecureSecret(32),
      SEED_TOKEN: generateSecureSecret(32),
    };

    console.log('Generated secrets:\n');
    console.log(`NEXTAUTH_SECRET="${secrets.NEXTAUTH_SECRET}"`);
    console.log(`SEED_TOKEN="${secrets.SEED_TOKEN}"`);
    console.log('');

    // Check if .env.local exists
    const envPath = path.join(process.cwd(), '.env.local');
    const envExists = fs.existsSync(envPath);

    if (envExists) {
      const updateEnv = await question(
        'Would you like to update .env.local with these secrets? (y/n): '
      );

      if (updateEnv.toLowerCase() === 'y') {
        // Read current .env.local
        let envContent = fs.readFileSync(envPath, 'utf-8');

        // Update or add NEXTAUTH_SECRET
        if (envContent.includes('NEXTAUTH_SECRET=')) {
          envContent = envContent.replace(
            /NEXTAUTH_SECRET=.*/,
            `NEXTAUTH_SECRET="${secrets.NEXTAUTH_SECRET}"`
          );
        } else {
          envContent += `\nNEXTAUTH_SECRET="${secrets.NEXTAUTH_SECRET}"`;
        }

        // Update or add SEED_TOKEN
        if (envContent.includes('SEED_TOKEN=')) {
          envContent = envContent.replace(
            /SEED_TOKEN=.*/,
            `SEED_TOKEN="${secrets.SEED_TOKEN}"`
          );
        } else {
          envContent += `\nSEED_TOKEN="${secrets.SEED_TOKEN}"`;
        }

        // Write back
        fs.writeFileSync(envPath, envContent);
        console.log('\n✅ Updated .env.local with secure secrets');
      }
    } else {
      console.log('\n📝 Please add these to your .env.local file manually.');
    }
  }

  // Security checklist
  console.log('\n📋 Security Checklist:\n');
  const checklist = [
    { 
      item: 'NEXTAUTH_SECRET is strong',
      checked: !validation.errors.some(e => e.includes('NEXTAUTH_SECRET'))
    },
    {
      item: 'Database uses SSL',
      checked: process.env.DATABASE_URL?.includes('sslmode=require') || false
    },
    {
      item: 'Production uses HTTPS',
      checked: process.env.NEXTAUTH_URL?.startsWith('https://') || 
               process.env.NODE_ENV !== 'production'
    },
    {
      item: 'Seed endpoint disabled in production',
      checked: process.env.ENABLE_SEED_ENDPOINT !== 'true' || 
               process.env.NODE_ENV !== 'production'
    },
    {
      item: 'Email provider configured',
      checked: !!(process.env.RESEND_API_KEY || process.env.SMTP_HOST)
    },
    {
      item: 'Cloudinary configured for images',
      checked: !!process.env.CLOUDINARY_API_SECRET
    },
  ];

  checklist.forEach(({ item, checked }) => {
    console.log(`${checked ? '✅' : '❌'} ${item}`);
  });

  const passedItems = checklist.filter(c => c.checked).length;
  const totalItems = checklist.length;
  const percentage = Math.round((passedItems / totalItems) * 100);

  console.log(`\n🎯 Security Score: ${passedItems}/${totalItems} (${percentage}%)\n`);

  if (percentage === 100) {
    console.log('🎉 Excellent! Your security configuration is complete.');
  } else if (percentage >= 80) {
    console.log('👍 Good! Your security configuration is mostly complete.');
  } else if (percentage >= 60) {
    console.log('⚠️  Fair. Some important security configurations are missing.');
  } else {
    console.log('❌ Poor. Please address the security issues before deploying.');
  }

  rl.close();
}

main().catch(console.error);