#!/usr/bin/env npx tsx

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Stub rates - in production, this would fetch from a real FX API
const STUB_RATES = {
  'IRR-USD': 0.000024, // 1 IRR = 0.000024 USD (approx 42,000 IRR per USD)
  'IRR-EUR': 0.000022, // 1 IRR = 0.000022 EUR (approx 45,500 IRR per EUR)
};

/**
 * Updates FX rates from external API or stub data
 */
async function updateFxRates() {
  try {
    console.log('🔄 Updating FX rates...');

    const fxEndpoint = process.env.FX_API_ENDPOINT;
    let rates = STUB_RATES;

    // If FX API endpoint is provided, fetch real rates
    if (fxEndpoint) {
      try {
        console.log(`📡 Fetching rates from ${fxEndpoint}`);
        const response = await fetch(fxEndpoint);
        if (response.ok) {
          const data = await response.json();
          // Assuming the API returns { 'IRR-USD': rate, 'IRR-EUR': rate }
          rates = data;
        } else {
          console.warn('⚠️  FX API failed, using stub rates');
        }
      } catch (error) {
        console.warn('⚠️  FX API error, using stub rates:', error);
      }
    } else {
      console.log('📊 Using stub FX rates (set FX_API_ENDPOINT for real data)');
    }

    // Update USD rate
    await prisma.fxRate.upsert({
      where: { base_counter: { base: 'IRR', counter: 'USD' } },
      create: {
        base: 'IRR',
        counter: 'USD',
        rate: rates['IRR-USD'],
        fetchedAt: new Date(),
      },
      update: {
        rate: rates['IRR-USD'],
        fetchedAt: new Date(),
      },
    });

    // Update EUR rate
    await prisma.fxRate.upsert({
      where: { base_counter: { base: 'IRR', counter: 'EUR' } },
      create: {
        base: 'IRR',
        counter: 'EUR',
        rate: rates['IRR-EUR'],
        fetchedAt: new Date(),
      },
      update: {
        rate: rates['IRR-EUR'],
        fetchedAt: new Date(),
      },
    });

    console.log('✅ FX rates updated successfully');
    console.log(`   • IRR to USD: ${rates['IRR-USD']}`);
    console.log(`   • IRR to EUR: ${rates['IRR-EUR']}`);

    // Return updated rates for verification
    const updatedRates = await prisma.fxRate.findMany({
      where: { base: 'IRR' },
      orderBy: { counter: 'asc' },
    });

    return updatedRates;
  } catch (error) {
    console.error('❌ Failed to update FX rates:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run if called directly
if (require.main === module) {
  updateFxRates()
    .then(rates => {
      console.log('\n📈 Current rates in database:');
      rates.forEach(rate => {
        console.log(
          `   ${rate.base}/${rate.counter}: ${rate.rate} (updated: ${rate.fetchedAt.toISOString()})`
        );
      });
      process.exit(0);
    })
    .catch(error => {
      console.error('💥 Script failed:', error);
      process.exit(1);
    });
}

export { updateFxRates };
