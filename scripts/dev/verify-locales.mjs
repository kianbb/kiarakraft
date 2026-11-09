import { readFileSync } from 'node:fs';
import path from 'node:path';
import { root } from './environment.mjs';

function flatten(value, prefix = '', result = {}) {
  for (const [key, entry] of Object.entries(value)) {
    const name = prefix ? `${prefix}.${key}` : key;
    if (entry && typeof entry === 'object' && !Array.isArray(entry))
      flatten(entry, name, result);
    else {
      if (typeof entry !== 'string')
        throw new Error(`Locale value must be a string: ${name}`);
      result[name] = entry;
    }
  }
  return result;
}

try {
  const english = flatten(
    JSON.parse(readFileSync(path.join(root, 'locales/en.json'), 'utf8'))
  );
  const persian = flatten(
    JSON.parse(readFileSync(path.join(root, 'locales/fa.json'), 'utf8'))
  );
  const missing = [
    ...Object.keys(english)
      .filter(key => !(key in persian))
      .map(key => `fa:${key}`),
    ...Object.keys(persian)
      .filter(key => !(key in english))
      .map(key => `en:${key}`),
  ];
  if (missing.length)
    throw new Error(`Missing locale keys: ${missing.join(', ')}`);
  console.log(
    `Locale key sets match (${Object.keys(english).length} each). Rendering is checked separately by test:i18n.`
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
