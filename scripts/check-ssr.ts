import { request } from "undici";

async function check(url: string, mustContain: string, shouldExist: boolean = true) {
  const res = await request(url);
  const html = (await res.body.text()).slice(0, 4000);
  
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
  const res = await request(shirazUrl);
  const html = (await res.body.text()).slice(0, 4000);
  
  if (html.includes("Loading...")) {
    console.log("WARNING:", shirazUrl, "- Shows loading state instead of content");
  } else if (html.includes("پتوی گبه شیرازی")) {
    console.log("OK:", shirazUrl);
  } else if (html.includes("این محصول یافت نشد")) {
    console.log("OK (404):", shirazUrl);
  } else {
    console.log("UNKNOWN STATE:", shirazUrl, "- Neither loading, content, nor 404");
  }
})();