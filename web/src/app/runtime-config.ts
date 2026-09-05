import { normalizeGatewayBaseUrl } from './setup-storage';

export interface RuntimeConfig {
  apiBaseUrl: string;
  isVercel: boolean;
}

declare global {
  var __PROXY_AGENT_CONFIG__: Partial<RuntimeConfig> | undefined;
}

const configured = globalThis.__PROXY_AGENT_CONFIG__ ?? {};
const generatedIsVercel = configured.isVercel === true;
const generatedApiBaseUrl = generatedIsVercel
  ? '/api'
  : normalizeGatewayBaseUrl(configured.apiBaseUrl) || '/api';

export const runtimeConfig: RuntimeConfig = {
  apiBaseUrl: generatedApiBaseUrl,
  isVercel: generatedIsVercel,
};

export function setRuntimeApiBaseUrl(value: string): void {
  if (runtimeConfig.isVercel) {
    runtimeConfig.apiBaseUrl = '/api';
    return;
  }

  runtimeConfig.apiBaseUrl = normalizeGatewayBaseUrl(value) || '/api';
}

export function apiUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${runtimeConfig.apiBaseUrl}${normalizedPath}`;
}
