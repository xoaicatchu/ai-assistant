import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const configPath = resolve(scriptDirectory, '../public/app-config.js');
const rawApiBaseUrl = process.env.NG_APP_API_BASE_URL?.trim() ?? '';
const rawBackendUrl = process.env.NG_APP_BACKEND_URL?.trim() ?? '';
const isVercel = process.env.VERCEL === '1';
const configuredApiBaseUrl = rawApiBaseUrl.replace(/\/+$/, '');
const configuredBackendUrl = rawBackendUrl.replace(/\/+$/, '');
// NG_APP_API_BASE_URL remains an explicit model-gateway override. When the
// frontend is deployed separately, NG_APP_BACKEND_URL is the backend origin
// used for the default gateway and conversation/admin APIs.
const defaultApiBaseUrl = configuredBackendUrl || configuredApiBaseUrl || '/api';
const apiBaseUrl = configuredApiBaseUrl || defaultApiBaseUrl;
const serverApiBaseUrl = configuredBackendUrl || '/api';

await mkdir(dirname(configPath), { recursive: true });
await writeFile(
  configPath,
  `globalThis.__PROXY_AGENT_CONFIG__ = ${JSON.stringify({ apiBaseUrl, serverApiBaseUrl, isVercel })};\n`,
  'utf8',
);

if (configuredBackendUrl) {
  console.log(`Generated frontend API config for backend ${configuredBackendUrl}.`);
} else if (isVercel) {
  console.log('Generated frontend API config using the same-origin /api backend.');
} else if (configuredApiBaseUrl) {
  console.log(`Generated frontend API config for ${apiBaseUrl}.`);
} else {
  console.log('Generated frontend API config using the same-origin /api proxy.');
}
