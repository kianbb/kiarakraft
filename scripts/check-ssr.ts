#!/usr/bin/env ts-node

/**
 * SSR Check Script
 * 
 * Verifies that product pages are properly server-side rendered by:
 * 1. Fetching a real product URL from production
 * 2. Asserting that the HTML contains the product title (not just a loading state)
 * 3. Checking for proper meta tags and structured data
 */

import { JSDOM } from 'jsdom';

const PRODUCTION_URL = 'https://www.kiarakraft.com';

// Known product slugs to test (from production seed data)
const TEST_PRODUCT_SLUGS = [
  'handmade-ceramic-bowl',
  'kurdish-handwoven-kilim',
  'silver-turquoise-necklace'
];

interface SSRCheckResult {
  url: string;
  success: boolean;
  hasTitle: boolean;
  hasMeta: boolean;
  hasStructuredData: boolean;
  productTitle?: string;
  error?: string;
}

async function checkProductSSR(productSlug: string, locale: string = 'en'): Promise<SSRCheckResult> {
  const url = `${PRODUCTION_URL}/${locale}/product/${productSlug}`;
  
  try {
    console.log(`🔍 Checking SSR for: ${url}`);
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; SSR-Checker/1.0)'
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const html = await response.text();
    const dom = new JSDOM(html);
    const document = dom.window.document;
    
    // Check for product title in HTML (not just metadata)
    const h1 = document.querySelector('h1');
    const productTitle = h1?.textContent?.trim();
    const hasTitle = !!productTitle && productTitle !== 'Loading...' && productTitle !== '';
    
    // Check for meta tags
    const titleMeta = document.querySelector('title')?.textContent;
    const descriptionMeta = document.querySelector('meta[name="description"]')?.getAttribute('content');
    const ogTitle = document.querySelector('meta[property="og:title"]')?.getAttribute('content');
    const hasMeta = !!(titleMeta && descriptionMeta && ogTitle);
    
    // Check for structured data (JSON-LD)
    const structuredData = document.querySelector('script[type="application/ld+json"]');
    const hasStructuredData = !!structuredData;
    
    const success = hasTitle && hasMeta;
    
    console.log(`${success ? '✅' : '❌'} ${url}`);
    console.log(`   Title: ${productTitle || 'NOT FOUND'}`);
    console.log(`   Meta: ${hasMeta ? 'Present' : 'Missing'}`);
    console.log(`   Structured Data: ${hasStructuredData ? 'Present' : 'Missing'}`);
    
    return {
      url,
      success,
      hasTitle,
      hasMeta,
      hasStructuredData,
      productTitle
    };
    
  } catch (error) {
    console.log(`❌ ${url} - Error: ${error instanceof Error ? error.message : String(error)}`);
    
    return {
      url,
      success: false,
      hasTitle: false,
      hasMeta: false,
      hasStructuredData: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

async function main() {
  console.log('🚀 Starting SSR Check for Kiara Kraft Product Pages\n');
  
  const results: SSRCheckResult[] = [];
  
  // Test both English and Persian locales
  for (const locale of ['en', 'fa']) {
    console.log(`\n📍 Testing ${locale.toUpperCase()} locale:`);
    
    for (const slug of TEST_PRODUCT_SLUGS) {
      const result = await checkProductSSR(slug, locale);
      results.push(result);
      
      // Add delay to avoid overwhelming the server
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  
  // Summary
  console.log('\n📊 Summary:');
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  
  console.log(`✅ Successful: ${successful.length}/${results.length}`);
  console.log(`❌ Failed: ${failed.length}/${results.length}`);
  
  if (failed.length > 0) {
    console.log('\n💥 Failed URLs:');
    failed.forEach(result => {
      console.log(`   ${result.url} - ${result.error || 'SSR validation failed'}`);
    });
  }
  
  // Exit with error code if any tests failed
  process.exit(failed.length > 0 ? 1 : 0);
}

if (require.main === module) {
  main().catch(console.error);
}

export { checkProductSSR, SSRCheckResult };