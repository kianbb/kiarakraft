// Check for Plausible analytics script presence in built server output when env is set
// Usage: NEXT_PUBLIC_PLAUSIBLE_DOMAIN=example.com npm run build && npm run check:analytics

import fs from 'node:fs';
import path from 'node:path';

const root = path.join(__dirname, '..');

function scan(dir: string, pattern: RegExp): boolean {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      try {
        if (scan(p, pattern)) return true;
      } catch {}
    } else if (e.isFile()) {
      if (p.endsWith('.rsc') || p.endsWith('.html') || p.endsWith('.js')) {
        try {
          const text = fs.readFileSync(p, 'utf8');
          if (pattern.test(text)) return true;
        } catch {}
      }
    }
  }
  return false;
}

async function main() {
  const plausibleDomain = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN;
  const pattern =
    /<script[^>]*data-domain=\"[^\"]+\"[^>]*src=\"https:\/\/plausible\.io\/js\/script\.js\"/i;
  const serverDir = path.join(root, '.next', 'server');
  const appDir = path.join(serverDir, 'app');

  let found = false;
  for (const d of [serverDir, appDir]) {
    if (fs.existsSync(d)) {
      if (scan(d, pattern)) {
        found = true;
        break;
      }
    }
  }

  console.log(`NEXT_PUBLIC_PLAUSIBLE_DOMAIN=${plausibleDomain || ''}`);
  console.log(`Analytics script present: ${found}`);
  process.exit(found ? 0 : 1);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
