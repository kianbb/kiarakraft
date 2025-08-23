async function fetchWithRetries(url: string, attempts = 3, delayMs = 800) {
  let lastErr: unknown;
  for (let i = 1; i <= attempts; i++) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml',
          'Accept-Language': 'fa-IR,fa;q=0.9,en;q=0.8',
        },
        // Ensure no cached edge artifact
        cache: 'no-store' as const,
      });
      return res;
    } catch (err) {
      lastErr = err;
      if (i < attempts) await new Promise(r => setTimeout(r, delayMs * i));
    }
  }
  throw lastErr;
}

function summarize(html: string, max = 600) {
  const snippet = html.slice(0, max).replace(/\s+/g, ' ').trim();
  return snippet.length < html.length ? snippet + '…' : snippet;
}

async function check(
  url: string,
  mustContain: string,
  shouldExist: boolean = true
) {
  const res = await fetchWithRetries(url);
  const status = res.status;
  const html = await res.text();

  if (!res.ok) {
    throw new Error(`SSR check HTTP error ${status} for ${url}`);
  }

  if (shouldExist) {
    if (!html.includes(mustContain)) {
      // Provide diagnostics: show whether a looser match is present
      const looseKey = mustContain.split(' ').slice(0, 2).join(' '); // first two words
      const hasLoose = html.includes(looseKey);
      const debug = process.env.SSR_CHECK_DEBUG
        ? `\n--- DEBUG START ---\nStatus: ${status}\nLength(full): ${html.length}\nFirst 600 chars: ${summarize(html)}\nContains loose("${looseKey}"): ${hasLoose}\nExact index: ${html.indexOf(mustContain)}\nLoose index: ${html.indexOf(looseKey)}\n--- DEBUG END ---`
        : '';
      throw new Error(
        `SSR check failed for ${url}. Could not find exact text: ${mustContain}${debug}`
      );
    }
    console.log('OK:', url);
  } else {
    // Expect 404 page with known marker
    if (
      html.includes('این محصول یافت نشد') ||
      html.includes('Product not found')
    ) {
      console.log('OK (404):', url);
    } else {
      throw new Error(
        `Expected 404 page for ${url} but got normal content (status ${status})`
      );
    }
  }
}

(async () => {
  // Test working product (handmade-ceramic-bowl)
  await check(
    `https://www.kiarakraft.com/fa/product/handmade-ceramic-bowl`,
    'کاسه سرامیکی دست‌ساز'
  );

  // Test shiraz-gabbeh-blanket - check if it shows loading state or works
  const shirazUrl = `https://www.kiarakraft.com/fa/product/shiraz-gabbeh-blanket`;
  const res = await fetch(shirazUrl);
  const html = (await res.text()).slice(0, 4000);

  if (html.includes('Loading...')) {
    console.log(
      'WARNING:',
      shirazUrl,
      '- Shows loading state instead of content'
    );
  } else if (html.includes('پتوی گبه شیرازی')) {
    console.log('OK:', shirazUrl);
  } else if (html.includes('این محصول یافت نشد')) {
    console.log('OK (404):', shirazUrl);
  } else {
    console.log(
      'UNKNOWN STATE:',
      shirazUrl,
      '- Neither loading, content, nor 404'
    );
  }
})();
