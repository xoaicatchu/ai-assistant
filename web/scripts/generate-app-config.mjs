import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const configPath = resolve(scriptDirectory, '../public/app-config.js');
const rawApiBaseUrl = process.env.NG_APP_API_BASE_URL?.trim() ?? '';
const isVercel = process.env.VERCEL === '1';
const configuredApiBaseUrl = rawApiBaseUrl.replace(/\/+$/, '');
const apiBaseUrl = configuredApiBaseUrl || (isVercel ? '/api' : '');

await mkdir(dirname(configPath), { recursive: true });
await writeFile(
  configPath,
  `globalThis.__PROXY_AGENT_CONFIG__ = ${JSON.stringify({ apiBaseUrl, isVercel })};\n`,
  'utf8',
);

if (configuredApiBaseUrl) {
  console.log(`Generated frontend API config for ${apiBaseUrl}.`);
} else if (isVercel) {
  console.log('Generated frontend API config using the Vercel serverless proxy at /api.');
} else {
  console.log('Generated frontend API config using the relative API path.');
}
