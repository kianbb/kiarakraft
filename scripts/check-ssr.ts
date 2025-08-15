async function check(url: string, mustContain: string, shouldExist: boolean = true) {
  const res = await fetch(url);
  const html = (await res.text()).slice(0, 4000);
  
  if (shouldExist) {
    if (!html.includes(mustContain)) {
      throw new Error(`SSR check failed for ${url}. Could not find: ${mustContain}`);
    }
    console.log("OK:", url);
  } else {
    // Expect 404 page with known marker
    if (html.includes("این محصول یافت نشد") || html.includes("Product not found")) {
      console.log("OK (404):", url);
    } else {
      throw new Error(`Expected 404 page for ${url} but got normal content`);
    }
  }
}

(async () => {
  // Test working product (handmade-ceramic-bowl)
  await check(`https://www.kiarakraft.com/fa/product/handmade-ceramic-bowl`, "کاسه سرامیکی دست‌ساز");
  
  // Test shiraz-gabbeh-blanket - check if it shows loading state or works
  const shirazUrl = `https://www.kiarakraft.com/fa/product/shiraz-gabbeh-blanket`;
  const res = await fetch(shirazUrl);
  const html = (await res.text()).slice(0, 4000);
  
  if (html.includes("Loading...")) {
    console.log("WARNING:", shirazUrl, "- Shows loading state instead of content");
  } else if (html.includes("پتوی گبه شیرازی")) {
    console.log("OK:", shirazUrl);
  } else if (html.includes("این محصول یافت نشد")) {
    console.log("OK (404):", shirazUrl);
  } else {
    console.log("UNKNOWN STATE:", shirazUrl, "- Neither loading, content, nor 404");
  }
  
  // Test English locale for translation issue
  console.log("\n--- English Locale Translation Test ---");
  const enRes = await fetch("https://www.kiarakraft.com/en?v=" + Date.now());
  const enHtml = (await enRes.text()).slice(0, 8000);
  
  if (enHtml.includes('lang="en"')) {
    console.log("✅ HTML lang correctly set to English");
  } else {
    console.log("❌ HTML lang not set to English");
  }
  
  const farsiMatches = (enHtml.match(/خانه|کاوش|ورود|ثبت‌نام/g) || []).length;
  const englishMatches = (enHtml.match(/Home|Explore|Login|Register/g) || []).length;
  
  console.log(`📊 Translation analysis: ${englishMatches} English vs ${farsiMatches} Farsi navigation elements`);
  
  if (farsiMatches === 0 && englishMatches > 0) {
    console.log("✅ English navigation working correctly");
  } else if (farsiMatches > englishMatches) {
    console.log("❌ ISSUE: More Farsi than English navigation elements");
  } else {
    console.log("⚠️  Mixed state: Both English and Farsi elements present");
  }
})();