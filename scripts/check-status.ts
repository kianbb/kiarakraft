// Simple status check for two URLs and whether the HTML contains NEXT_NOT_FOUND
// Usage: npm run check:status

import { setTimeout as delay } from 'node:timers/promises'
import { fetch } from 'undici'

const BASE = process.env.BASE_URL || 'https://www.kiarakraft.com';
const targets = [
  {
  url: `${BASE}/fa/product/handmade-ceramic-bowl`,
    expect: 200,
    label: 'existing product (expect 200)'
  },
  {
  url: `${BASE}/fa/product/nonexistent-product-123`,
    expect: 404,
    label: 'nonexistent product (expect 404)'
  }
]

async function check(url: string) {
  const res = await fetch(url, { redirect: 'manual' })
  const text = await res.text()
  const hasNotFoundMarker = text.includes('NEXT_NOT_FOUND')
  return { status: res.status, hasNotFoundMarker }
}

async function main() {
  let exitCode = 0
  for (const t of targets) {
    try {
      const { status, hasNotFoundMarker } = await check(t.url)
      const ok = status === t.expect
      if (!ok) exitCode = 1
      console.log(`${t.label}:`)
      console.log(`  URL: ${t.url}`)
      console.log(`  Status: ${status} (expected ${t.expect}) ${ok ? 'OK' : 'MISMATCH'}`)
      console.log(`  Contains NEXT_NOT_FOUND: ${hasNotFoundMarker}`)
      // Small delay to be polite
      await delay(100)
    } catch (err: any) {
      exitCode = 1
      console.error(`Error fetching ${t.url}:`, err?.message || err)
    }
  }
  process.exit(exitCode)
}

main()
