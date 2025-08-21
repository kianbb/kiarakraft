import assert from 'node:assert/strict';
import { assessProductForHandcrafted } from '../lib/moderation';

async function testBasicFunctionality() {
  console.log('Testing basic functionality...');

  // Test clearly handcrafted items
  const handcraftedInput = {
    title: 'Handmade Ceramic Bowl',
    description:
      'This beautiful ceramic bowl is handcrafted by skilled artisans using traditional pottery techniques.',
    categorySlug: 'ceramics',
  };

  const handcraftedResult = await assessProductForHandcrafted(handcraftedInput);
  assert.equal(
    handcraftedResult.status,
    'APPROVED',
    'Should approve clearly handcrafted items'
  );
  assert.ok(
    handcraftedResult.confidence! > 50,
    'Should have high confidence for handcrafted items'
  );

  // Test mass-produced items
  const massProducedInput = {
    title: 'Factory Made Plastic Widget',
    description:
      'Mass produced in our factory. Wholesale prices available. Made in China. OEM replica.',
  };

  const massProducedResult =
    await assessProductForHandcrafted(massProducedInput);
  assert.equal(
    massProducedResult.status,
    'REJECTED',
    'Should reject mass-produced items'
  );
  assert.ok(
    massProducedResult.confidence! < 50,
    'Should have low confidence for mass-produced items'
  );

  // Test ambiguous items
  const ambiguousInput = {
    title: 'Nice Product',
    description: 'This is a good quality item.',
  };

  const ambiguousResult = await assessProductForHandcrafted(ambiguousInput);
  assert.equal(
    ambiguousResult.status,
    'REVIEW',
    'Should put ambiguous items under review'
  );
  assert.ok(
    ambiguousResult.confidence! >= 0 && ambiguousResult.confidence! <= 100,
    'Confidence should be between 0-100'
  );

  console.log('✓ Basic functionality tests passed');
}

async function testPersianLanguageSupport() {
  console.log('Testing Persian language support...');

  // Test Persian handcraft keywords
  const persianHandcraft = {
    title: 'سفال دست‌ساز',
    description: 'این سفال کاملاً دست‌ساز و هنری است. صنایع دستی اصیل ایرانی.',
    categorySlug: 'ceramics',
  };

  const persianResult = await assessProductForHandcrafted(persianHandcraft);
  assert.equal(
    persianResult.status,
    'APPROVED',
    'Should approve Persian handcraft items'
  );
  assert.ok(
    persianResult.confidence! > 50,
    'Should have high confidence for Persian handcraft'
  );

  // Test Persian mass-production keywords
  const persianMassProduced = {
    title: 'محصول کارخانه‌ای',
    description: 'تولید انبوه در کارخانه. جنس وارداتی.',
  };

  const persianMassResult =
    await assessProductForHandcrafted(persianMassProduced);
  assert.equal(
    persianMassResult.status,
    'REJECTED',
    'Should reject Persian mass-produced items'
  );

  // Test mixed Persian-English
  const mixedInput = {
    title: 'Handmade سفال',
    description: 'Beautiful دست‌ساز pottery made with care',
  };

  const mixedResult = await assessProductForHandcrafted(mixedInput);
  assert.equal(
    mixedResult.status,
    'APPROVED',
    'Should approve mixed Persian-English handcraft items'
  );

  console.log('✓ Persian language support tests passed');
}

async function testCategoryInfluence() {
  console.log('Testing category influence...');

  const baseInput = {
    title: 'Beautiful Item',
    description: 'Nice quality product',
  };

  const craftCategory = await assessProductForHandcrafted({
    ...baseInput,
    categorySlug: 'ceramics',
  });

  const neutralCategory = await assessProductForHandcrafted({
    ...baseInput,
    categorySlug: 'electronics',
  });

  assert.ok(
    craftCategory.confidence! >= neutralCategory.confidence!,
    'Craft-friendly categories should boost confidence'
  );

  // Test without category
  const noCategoryInput = {
    title: 'Handmade Item',
    description: 'Artisanal product',
  };

  const noCategoryResult = await assessProductForHandcrafted(noCategoryInput);
  assert.ok(noCategoryResult.status, 'Should work without category');
  assert.ok(
    typeof noCategoryResult.confidence === 'number',
    'Should return confidence without category'
  );

  console.log('✓ Category influence tests passed');
}

async function testKeywordScoring() {
  console.log('Testing keyword scoring system...');

  const singleKeyword = await assessProductForHandcrafted({
    title: 'Handmade Item',
    description: 'Nice product',
  });

  const multipleKeywords = await assessProductForHandcrafted({
    title: 'Handmade Artisan Crafted Item',
    description: 'Beautiful handcrafted artisanal pottery',
  });

  assert.ok(
    multipleKeywords.confidence! > singleKeyword.confidence!,
    'Multiple keywords should increase confidence'
  );

  // Test conflicting keywords
  const conflictingInput = {
    title: 'Handmade Factory Product',
    description: 'Mass produced wholesale item but also handcrafted',
  };

  const conflictingResult = await assessProductForHandcrafted(conflictingInput);
  assert.ok(
    typeof conflictingResult.confidence === 'number',
    'Should handle conflicting keywords'
  );
  assert.ok(Array.isArray(conflictingResult.reasons), 'Should provide reasons');
  assert.ok(
    conflictingResult.reasons!.length > 0,
    'Should have non-empty reasons'
  );

  console.log('✓ Keyword scoring tests passed');
}

async function testEdgeCases() {
  console.log('Testing edge cases...');

  // Test empty strings
  const emptyInput = { title: '', description: '' };
  const emptyResult = await assessProductForHandcrafted(emptyInput);
  assert.equal(
    emptyResult.status,
    'REVIEW',
    'Empty input should result in REVIEW'
  );

  // Test long descriptions
  const longDescription = 'handmade '.repeat(100);
  const longInput = { title: 'Test Product', description: longDescription };
  const longResult = await assessProductForHandcrafted(longInput);
  assert.ok(longResult.status, 'Should handle long descriptions');

  // Test special characters
  const specialCharsInput = {
    title: 'Handmade @#$% Item!',
    description: 'Artisan-crafted... with [special] (characters) & symbols!',
  };
  const specialCharsResult =
    await assessProductForHandcrafted(specialCharsInput);
  assert.equal(
    specialCharsResult.status,
    'APPROVED',
    'Should handle special characters'
  );

  // Test case insensitivity
  const upperCase = await assessProductForHandcrafted({
    title: 'HANDMADE ITEM',
    description: 'ARTISAN CRAFTED PRODUCT',
  });

  const lowerCase = await assessProductForHandcrafted({
    title: 'handmade item',
    description: 'artisan crafted product',
  });

  assert.equal(
    upperCase.status,
    lowerCase.status,
    'Should be case insensitive'
  );

  console.log('✓ Edge cases tests passed');
}

async function testConfidenceScoring() {
  console.log('Testing confidence scoring...');

  const testInputs = [
    { title: 'Factory made', description: 'Mass produced wholesale' },
    { title: 'Regular item', description: 'Normal product' },
    { title: 'Handmade pottery', description: 'Artisan crafted ceramic bowl' },
  ];

  for (const input of testInputs) {
    const result = await assessProductForHandcrafted(input);
    assert.ok(result.confidence! >= 0, 'Confidence should be >= 0');
    assert.ok(result.confidence! <= 100, 'Confidence should be <= 100');
  }

  // Test reasons are provided
  const reasonsInput = {
    title: 'Handmade Ceramic Bowl',
    description: 'Factory produced wholesale item',
  };

  const reasonsResult = await assessProductForHandcrafted(reasonsInput);
  assert.ok(
    Array.isArray(reasonsResult.reasons),
    'Should provide reasons array'
  );
  assert.ok(reasonsResult.reasons!.length > 0, 'Should have non-empty reasons');

  console.log('✓ Confidence scoring tests passed');
}

async function testRealWorldScenarios() {
  console.log('Testing real-world scenarios...');

  // Test traditional Persian crafts
  const persianCrafts = [
    {
      title: 'فرش دستباف کاشان',
      description: 'فرش دستباف اصیل کاشان با نقشه‌های سنتی و کیفیت بالا',
      categorySlug: 'textiles',
    },
    {
      title: 'خاتم‌کاری اصفهان',
      description: 'صنایع دستی خاتم‌کاری با طرح‌های سنتی اصفهان',
      categorySlug: 'woodwork',
    },
  ];

  for (const craft of persianCrafts) {
    const result = await assessProductForHandcrafted(craft);
    assert.equal(
      result.status,
      'APPROVED',
      `Should approve traditional Persian craft: ${craft.title}`
    );
    assert.ok(
      result.confidence! > 60,
      `Should have high confidence for: ${craft.title}`
    );
  }

  // Test obvious non-handcraft items
  const massProducedItems = [
    {
      title: 'iPhone 15 Pro Max',
      description: 'Brand new factory sealed Apple iPhone 15 Pro Max',
    },
    {
      title: 'Samsung TV 55 inch',
      description: 'Factory manufactured Samsung smart TV with warranty',
    },
  ];

  for (const item of massProducedItems) {
    const result = await assessProductForHandcrafted(item);
    assert.ok(
      ['REJECTED', 'REVIEW'].includes(result.status),
      `Should reject/review mass-produced: ${item.title}`
    );
  }

  console.log('✓ Real-world scenarios tests passed');
}

async function testAzureAIIntegration() {
  console.log('Testing Azure AI integration...');

  // Test graceful handling when not configured
  const input = { title: 'Test Product', description: 'Test description' };

  try {
    const result = await assessProductForHandcrafted(input);
    assert.ok(result.status, 'Should work without Azure AI configured');
  } catch (error) {
    assert.fail('Should not throw when Azure AI is not configured');
  }

  // Test with mock Azure AI configuration
  const originalEndpoint = process.env.AZURE_AI_ENDPOINT;
  const originalKey = process.env.AZURE_AI_KEY;

  process.env.AZURE_AI_ENDPOINT = 'https://test.cognitiveservices.azure.com/';
  process.env.AZURE_AI_KEY = 'test-key';

  const configuredResult = await assessProductForHandcrafted(input);
  const hasAzureSignal = configuredResult.reasons?.some(reason =>
    reason.toLowerCase().includes('azure ai')
  );
  assert.ok(hasAzureSignal, 'Should include Azure AI signals when configured');

  // Restore original values
  if (originalEndpoint) {
    process.env.AZURE_AI_ENDPOINT = originalEndpoint;
  } else {
    delete process.env.AZURE_AI_ENDPOINT;
  }
  if (originalKey) {
    process.env.AZURE_AI_KEY = originalKey;
  } else {
    delete process.env.AZURE_AI_KEY;
  }

  console.log('✓ Azure AI integration tests passed');
}

async function run() {
  console.log('Running Handcrafted Item Gatekeeping System Tests...\n');

  try {
    await testBasicFunctionality();
    await testPersianLanguageSupport();
    await testCategoryInfluence();
    await testKeywordScoring();
    await testEdgeCases();
    await testConfidenceScoring();
    await testRealWorldScenarios();
    await testAzureAIIntegration();

    console.log('\n🎉 All gatekeeping system tests passed!');
  } catch (error) {
    console.error('❌ Gatekeeping tests failed:', error);
    process.exit(1);
  }
}

run();
