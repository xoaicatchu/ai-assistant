import { normalizeGatewayBaseUrl } from './setup-storage';

export interface RuntimeConfig {
  apiBaseUrl: string;
  isVercel: boolean;
}

declare global {
  var __PROXY_AGENT_CONFIG__: Partial<RuntimeConfig> | undefined;
}

const configured = globalThis.__PROXY_AGENT_CONFIG__ ?? {};
const generatedApiBaseUrl = normalizeGatewayBaseUrl(configured.apiBaseUrl);

export const runtimeConfig: RuntimeConfig = {
  apiBaseUrl: generatedApiBaseUrl,
  isVercel: configured.isVercel === true,
};

export function setRuntimeApiBaseUrl(value: string): void {
  runtimeConfig.apiBaseUrl = normalizeGatewayBaseUrl(value) || generatedApiBaseUrl;
}

export function apiUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${runtimeConfig.apiBaseUrl}${normalizedPath}`;
}
