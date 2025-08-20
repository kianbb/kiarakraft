#!/usr/bin/env node
require('dotenv').config({ path: '.env.local' });
require('dotenv').config();
const { v2: cloudinary } = require('cloudinary');

cloudinary.config({
  cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const slugs = ['ceramics', 'textiles', 'jewelry', 'woodwork', 'painting'];

async function getPreviousVersionUrl(publicId) {
  try {
    const res = await cloudinary.api.resource(publicId, { versions: true });
    const versions = res && Array.isArray(res.versions) ? res.versions : [];
    const prev = versions[1];
    const curr = versions[0];
    if (!prev && curr && curr.secure_url) return curr.secure_url;
    if (!prev) return null;
    const cloud = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
    if (!cloud) return prev.secure_url || null;
    const v = prev.version ? `v${prev.version}` : null;
    if (!v) return prev.secure_url || null;
    return `https://res.cloudinary.com/${cloud}/image/upload/${v}/${publicId}`;
  } catch (e) {
    console.error('Error fetching versions for', publicId, e && e.message);
    return null;
  }
}

(async () => {
  if (!process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME) {
    console.error('Missing NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME');
    process.exit(1);
  }
  const mapping = {};
  for (const slug of slugs) {
    const publicId = `kiarakraft/categories/${slug}`;
    const url = await getPreviousVersionUrl(publicId);
    if (url) {
      mapping[slug] = url;
      console.log(`✓ ${slug} -> ${url}`);
    } else {
      console.warn(`! No previous for ${slug}`);
    }
    await new Promise(r => setTimeout(r, 150));
  }
  console.log('\nJSON:');
  console.log(JSON.stringify(mapping, null, 2));
})();
