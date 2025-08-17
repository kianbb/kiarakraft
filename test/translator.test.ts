import assert from 'node:assert/strict';
import { translateText, translateProductFields } from '../lib/translator';

async function testTranslateText() {
  console.log('Testing translateText function...');

  // Test same language
  const text = 'Hello world';
  const result = await translateText(text, { from: 'en', to: 'en' });
  assert.equal(result, text, 'Same language should return original text');

  // Test empty input
  const emptyResult = await translateText('', { from: 'fa', to: 'en' });
  assert.equal(emptyResult, '', 'Empty input should return empty string');

  // Test Persian to English
  const persianText = 'سفال دست‌ساز زیبا';
  const persianResult = await translateText(persianText, { from: 'fa', to: 'en' });
  assert.equal(typeof persianResult, 'string', 'Should return string');
  assert.ok(persianResult.length > 0, 'Should return non-empty result');

  // Test caching
  const cacheText = 'Test caching';
  const cacheResult1 = await translateText(cacheText, { from: 'en', to: 'fa' });
  const cacheResult2 = await translateText(cacheText, { from: 'en', to: 'fa' });
  assert.equal(cacheResult1, cacheResult2, 'Should cache translation results');

  console.log('✓ translateText tests passed');
}

async function testTranslateProductFields() {
  console.log('Testing translateProductFields function...');

  // Test with Persian content
  const product = {
    title: 'سفال زیبا',
    description: 'این یک سفال دست‌ساز بسیار زیبا است'
  };

  const result = await translateProductFields(product, 'fa', 'en');
  assert.ok('title' in result, 'Should have title property');
  assert.ok('description' in result, 'Should have description property');
  assert.equal(typeof result.title, 'string', 'Title should be string');
  assert.equal(typeof result.description, 'string', 'Description should be string');

  // Test empty fields
  const emptyProduct = { title: '', description: '' };
  const emptyResult = await translateProductFields(emptyProduct, 'fa', 'en');
  assert.equal(emptyResult.title, '', 'Empty title should remain empty');
  assert.equal(emptyResult.description, '', 'Empty description should remain empty');

  console.log('✓ translateProductFields tests passed');
}

async function testPersianDetection() {
  console.log('Testing Persian text detection...');

  const persianText = 'سفال دست‌ساز';
  const englishText = 'Handmade pottery';
  const hasPersianRegex = /[\u0600-\u06FF]/;

  assert.equal(hasPersianRegex.test(persianText), true, 'Should detect Persian text');
  assert.equal(hasPersianRegex.test(englishText), false, 'Should not detect Persian in English text');

  console.log('✓ Persian detection tests passed');
}

async function testErrorHandling() {
  console.log('Testing error handling...');

  // Test that function doesn't throw
  try {
    const result = await translateText('Test text', { from: 'en', to: 'fa' });
    assert.equal(typeof result, 'string', 'Should return string even on errors');
  } catch (error) {
    assert.fail('translateText should not throw errors');
  }

  console.log('✓ Error handling tests passed');
}

async function run() {
  console.log('Running Translation System Tests...\n');

  try {
    await testTranslateText();
    await testTranslateProductFields();
    await testPersianDetection();
    await testErrorHandling();

    console.log('\n🎉 All translation system tests passed!');
  } catch (error) {
    console.error('❌ Translation tests failed:', error);
    process.exit(1);
  }
}

run();