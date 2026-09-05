import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const configPath = resolve(scriptDirectory, '../public/app-config.js');
const rawApiBaseUrl = process.env.NG_APP_API_BASE_URL?.trim() ?? '';
const isVercel = process.env.VERCEL === '1';
const configuredApiBaseUrl = rawApiBaseUrl.replace(/\/+$/, '');
// Vercel deployments always use the same-origin serverless proxy. This prevents
// a leftover NG_APP_API_BASE_URL variable from silently reintroducing browser CORS.
const apiBaseUrl = isVercel ? '/api' : configuredApiBaseUrl || '/api';

await mkdir(dirname(configPath), { recursive: true });
await writeFile(
  configPath,
  `globalThis.__PROXY_AGENT_CONFIG__ = ${JSON.stringify({ apiBaseUrl, isVercel })};\n`,
  'utf8',
);

if (isVercel) {
  console.log('Generated frontend API config using the Vercel serverless proxy at /api.');
} else if (configuredApiBaseUrl) {
  console.log(`Generated frontend API config for ${apiBaseUrl}.`);
} else {
  console.log('Generated frontend API config using the same-origin /api proxy.');
}
