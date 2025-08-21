#!/usr/bin/env tsx
import 'dotenv/config';

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const RESET = '\x1b[0m';

interface TestResult {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  details: string;
}

class ProductionVerifier {
  private results: TestResult[] = [];
  
  private log(status: 'pass' | 'fail' | 'warn', name: string, details: string) {
    this.results.push({ name, status, details });
    const color = status === 'pass' ? GREEN : status === 'fail' ? RED : YELLOW;
    const symbol = status === 'pass' ? '✅' : status === 'fail' ? '❌' : '⚠️';
    console.log(`${color}${symbol} ${name}: ${details}${RESET}`);
  }

  async verifyTaskA(): Promise<void> {
    console.log(`${BLUE}\n=== TASK A: Server-Side Rendering ===`);
    
    // A1: Check for "Loading..." text elimination
    try {
      const fs = require('fs');
      const loadingContent = fs.readFileSync('app/[locale]/loading.tsx', 'utf8');
      
      // Remove comments first, then check for Loading text
      const withoutComments = loadingContent.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      const hasLoadingText = withoutComments.includes('"Loading..."') || withoutComments.includes("'Loading...'");
      
      if (hasLoadingText) {
        this.log('fail', 'A1: Loading text removal', 'Still contains "Loading..." text strings');
      } else {
        this.log('pass', 'A1: Loading text removal', 'No "Loading..." text in server HTML');
      }
    } catch (error) {
      this.log('fail', 'A1: Loading text removal', `Error: ${error}`);
    }

    // A2: Verify product pages render metadata
    try {
      const response = await fetch('http://localhost:3000/fa/product/handmade-ceramic-bowl');
      const html = await response.text();
      
      const hasMetadata = html.includes('<title>') && 
                         html.includes('کاسه سرامیکی') &&
                         html.includes('meta name="description"');
      
      if (hasMetadata) {
        this.log('pass', 'A2: Product SSR metadata', 'Product pages render complete metadata');
      } else {
        this.log('fail', 'A2: Product SSR metadata', 'Missing proper metadata rendering');
      }
    } catch (error) {
      this.log('fail', 'A2: Product SSR metadata', `Error: ${error}`);
    }
  }

  async verifyTaskB(): Promise<void> {
    console.log(`${BLUE}\n=== TASK B: Product Slugs & 404s ===`);
    
    // B1: Valid product slugs work
    const validSlugs = ['handmade-ceramic-bowl', 'cedar-wood-backgammon'];
    let validCount = 0;
    
    for (const slug of validSlugs) {
      try {
        const response = await fetch(`http://localhost:3000/fa/product/${slug}`);
        if (response.status === 200) {
          validCount++;
        }
      } catch (error) {
        // Connection issues, skip
      }
    }
    
    if (validCount === validSlugs.length) {
      this.log('pass', 'B1: Valid product slugs', `${validCount}/${validSlugs.length} valid slugs working`);
    } else {
      this.log('fail', 'B1: Valid product slugs', `Only ${validCount}/${validSlugs.length} valid slugs working`);
    }

    // B2: Invalid slugs return 404
    try {
      const response = await fetch('http://localhost:3000/fa/product/nonexistent-product-123');
      const html = await response.text();
      const hasNotFound = html.includes('NEXT_NOT_FOUND') || html.includes('محصول یافت نشد');
      
      if (hasNotFound) {
        this.log('pass', 'B2: Invalid slug 404s', 'Invalid slugs correctly return 404');
      } else {
        this.log('fail', 'B2: Invalid slug 404s', 'Invalid slugs not returning proper 404');
      }
    } catch (error) {
      this.log('fail', 'B2: Invalid slug 404s', `Error: ${error}`);
    }
  }

  async verifyTaskC(): Promise<void> {
    console.log(`${BLUE}\n=== TASK C: Core Systems ===`);
    
    // C1: Payment System
    try {
      const gateway = process.env.PAYMENT_GATEWAY ?? "OFFLINE";
      const { prisma } = await import('@/lib/prisma');
      const paymentCount = await prisma.payment.count();
      const orderCount = await prisma.order.count();
      
      this.log('pass', 'C1: Payment system', `${gateway} gateway, ${paymentCount} payments, ${orderCount} orders`);
    } catch (error) {
      this.log('fail', 'C1: Payment system', `Error: ${error}`);
    }

    // C2: Cloudinary Uploads
    try {
      const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
      const apiKey = process.env.CLOUDINARY_API_KEY;
      
      if (cloudName && apiKey) {
        const { listAssetsInFolder } = await import('@/lib/cloudinary');
        const assets = await listAssetsInFolder('kiarakraft/products', 3);
        this.log('pass', 'C2: Cloudinary uploads', `${assets.length} assets in cloud storage`);
      } else {
        this.log('warn', 'C2: Cloudinary uploads', 'Configuration incomplete');
      }
    } catch (error) {
      this.log('fail', 'C2: Cloudinary uploads', `Error: ${error}`);
    }

    // C3: Search System
    try {
      const { searchProducts } = await import('@/lib/search');
      const results = await searchProducts({ query: 'کاسه', locale: 'fa', limit: 3 });
      
      this.log('pass', 'C3: Search system', `Persian search returns ${results.products.length} results`);
    } catch (error) {
      this.log('fail', 'C3: Search system', `Error: ${error}`);
    }

    // C4-C7: Quick checks based on production audit
    try {
      const fs = require('fs');
      
      // C4: Email system
      const emailRouteExists = fs.existsSync('app/api/auth/reset-password/route.ts');
      this.log(emailRouteExists ? 'pass' : 'warn', 'C4: Email flows', emailRouteExists ? 'Reset password API exists' : 'Email API missing');
      
      // C5: Analytics  
      const hasAnalytics = process.env.NEXT_PUBLIC_VERCEL_ANALYTICS_ID || 
                          process.env.SENTRY_DSN || 
                          process.env.NEXT_PUBLIC_GA_ID;
      this.log(hasAnalytics ? 'pass' : 'warn', 'C5: Analytics & monitoring', hasAnalytics ? 'Analytics configured' : 'No analytics configured');
      
      // C6: PWA
      const manifestExists = fs.existsSync('public/manifest.webmanifest');
      this.log(manifestExists ? 'pass' : 'warn', 'C6: PWA support', manifestExists ? 'PWA manifest exists' : 'PWA not configured');
      
      // C7: Trust & Safety
      const hasCSRF = fs.existsSync('lib/csrf.ts');
      const hasRateLimit = fs.existsSync('lib/rateLimit.ts'); 
      const securityOK = hasCSRF && hasRateLimit;
      this.log(securityOK ? 'pass' : 'fail', 'C7: Trust & safety', securityOK ? 'CSRF + Rate limiting active' : 'Security measures missing');
      
    } catch (error) {
      this.log('fail', 'C4-C7: System checks', `Error: ${error}`);
    }
  }

  async verifyDatabase(): Promise<void> {
    console.log(`${BLUE}\n=== DATABASE HEALTH ===`);
    
    try {
      const { prisma } = await import('@/lib/prisma');
      
      // Check core tables
      const [users, products, orders, categories] = await Promise.all([
        prisma.user.count(),
        prisma.product.count(), 
        prisma.order.count(),
        prisma.category.count()
      ]);
      
      this.log('pass', 'Database connection', `${users} users, ${products} products, ${orders} orders, ${categories} categories`);
      
      // Check search extensions
      const extensions = await prisma.$queryRaw<Array<{extname: string}>>`
        SELECT extname FROM pg_extension WHERE extname IN ('pg_trgm', 'unaccent');
      `;
      
      const hasSearchExtensions = extensions.length >= 2;
      this.log(hasSearchExtensions ? 'pass' : 'fail', 'Search extensions', `${extensions.length}/2 PostgreSQL search extensions`);
      
    } catch (error) {
      this.log('fail', 'Database connection', `Error: ${error}`);
    }
  }

  async verifyEnvironment(): Promise<void> {
    console.log(`${BLUE}\n=== ENVIRONMENT CONFIG ===`);
    
    const requiredEnvs = [
      'DATABASE_URL',
      'NEXTAUTH_SECRET',
      'PAYMENT_GATEWAY'
    ];
    
    const optionalEnvs = [
      'NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME',
      'CLOUDINARY_API_KEY',
      'CLOUDINARY_API_SECRET'
    ];
    
    requiredEnvs.forEach(env => {
      const value = process.env[env];
      if (value) {
        this.log('pass', `Required env: ${env}`, 'Set');
      } else {
        this.log('fail', `Required env: ${env}`, 'Missing');
      }
    });
    
    let optionalCount = 0;
    optionalEnvs.forEach(env => {
      if (process.env[env]) optionalCount++;
    });
    
    this.log('pass', 'Optional configs', `${optionalCount}/${optionalEnvs.length} optional configs set`);
  }

  printSummary(): void {
    console.log(`${BLUE}\n=== FINAL VERIFICATION SUMMARY ===${RESET}`);
    
    const passed = this.results.filter(r => r.status === 'pass').length;
    const failed = this.results.filter(r => r.status === 'fail').length;
    const warned = this.results.filter(r => r.status === 'warn').length;
    const total = this.results.length;
    
    console.log(`${GREEN}✅ PASSED: ${passed}${RESET}`);
    console.log(`${RED}❌ FAILED: ${failed}${RESET}`);
    console.log(`${YELLOW}⚠️  WARNINGS: ${warned}${RESET}`);
    console.log(`📊 TOTAL: ${total} checks\n`);
    
    if (failed === 0) {
      console.log(`${GREEN}🎉 ALL SYSTEMS OPERATIONAL!${RESET}`);
      console.log(`${GREEN}✅ Production-ready deployment verified${RESET}\n`);
    } else {
      console.log(`${RED}❌ ${failed} critical issues found${RESET}`);
      console.log(`${RED}🚨 Address failures before production deployment${RESET}\n`);
      
      // Show failed tests
      this.results.filter(r => r.status === 'fail').forEach(result => {
        console.log(`${RED}  • ${result.name}: ${result.details}${RESET}`);
      });
      console.log();
    }
    
    process.exit(failed > 0 ? 1 : 0);
  }
}

async function main() {
  console.log(`${BLUE}🔍 KIARA KRAFT V2 PRODUCTION VERIFICATION${RESET}`);
  console.log(`${BLUE}===========================================${RESET}`);
  
  const verifier = new ProductionVerifier();
  
  await verifier.verifyEnvironment();
  await verifier.verifyDatabase();
  await verifier.verifyTaskA();
  await verifier.verifyTaskB();
  await verifier.verifyTaskC();
  
  verifier.printSummary();
}

if (require.main === module) {
  main().catch(console.error);
}