import { request } from "undici";

async function check(url: string, mustContain: string) {
  const res = await request(url);
  const html = (await res.body.text()).slice(0, 4000);
  if (!html.includes(mustContain)) {
    throw new Error(`SSR check failed for ${url}. Could not find: ${mustContain}`);
  }
  console.log("OK:", url);
}

(async () => {
  const slug = process.env.TEST_SLUG || "handmade-ceramic-bowl"; // adjust
  await check(`https://www.kiarakraft.com/fa/product/${slug}`, "کاسه سرامیکی دست‌ساز");
})();