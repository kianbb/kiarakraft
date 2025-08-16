import assert from 'node:assert/strict';

// Tiny SSR smoke tests against production to validate locale correctness.
async function fetchHtml(url: string) {
  const res = await fetch(url, { headers: { 'accept-language': 'en-US,en;q=0.9' } });
  const html = await res.text();
  return html.slice(0, 12000); // cap to avoid huge buffers
}

async function mustInclude(url: string, markers: string[]) {
  const html = await fetchHtml(url);
  for (const m of markers) {
    assert.ok(html.includes(m), `Expected to find marker on ${url}: ${m}`);
  }
  console.log('OK:', url);
}

async function mustNotInclude(url: string, markers: string[]) {
  const html = await fetchHtml(url);
  for (const m of markers) {
    assert.ok(!html.includes(m), `Did not expect marker on ${url}: ${m}`);
  }
  console.log('OK (absent):', url);
}

(async () => {
  // Home pages
  await mustInclude('https://www.kiarakraft.com/en', [
    '<html lang="en" dir="ltr"',
    'Kiara Kraft', // hero title
    'Iranian Handmade Marketplace', // hero subtitle
    'Featured Categories',
    'Explore Products'
  ]);
  await mustNotInclude('https://www.kiarakraft.com/en', [
    'کیارا کرفت',
    'بازار محصولات دستساز ایرانی',
    'دسته‌بندی‌های ویژه',
    'کاوش محصولات'
  ]);

  await mustInclude('https://www.kiarakraft.com/fa', [
    '<html lang="fa" dir="rtl"',
    'کیارا کرفت',
    'بازار محصولات دستساز ایرانی',
    'دسته‌بندی‌های ویژه',
    'کاوش محصولات'
  ]);
  await mustNotInclude('https://www.kiarakraft.com/fa', [
    'Iranian Handmade Marketplace',
    'Featured Categories',
    'Explore Products'
  ]);

  // Explore page headings
    await mustInclude('https://www.kiarakraft.com/en/explore', [
      '<h1', // header present
      'Kiara' // brand appears somewhere
  ]);
  await mustInclude('https://www.kiarakraft.com/fa/explore', [
    'کاوش محصولات',
    'همه دسته‌بندی‌ها'
  ]);

  // One product page per locale (known sample product)
  await mustInclude('https://www.kiarakraft.com/en/product/handmade-ceramic-bowl', [
    '<html lang="en" dir="ltr"',
    'Handmade Ceramic Bowl'
  ]);
  await mustInclude('https://www.kiarakraft.com/fa/product/handmade-ceramic-bowl', [
    '<html lang="fa" dir="rtl"',
    'کاسه سرامیکی دست‌ساز'
  ]);

  console.log('All i18n smoke tests passed');
})();
