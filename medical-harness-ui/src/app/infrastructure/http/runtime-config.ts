import { normalizeGatewayBaseUrl } from '../browser/setup-storage';

export interface RuntimeConfig {
  apiBaseUrl: string;
  serverApiBaseUrl: string;
  defaultApiBaseUrl: string;
  isVercel: boolean;
}

declare global {
  var __PROXY_AGENT_CONFIG__: Partial<RuntimeConfig> | undefined;
}

const configured = globalThis.__PROXY_AGENT_CONFIG__ ?? {};
const generatedIsVercel = configured.isVercel === true;
const generatedApiBaseUrl = normalizeGatewayBaseUrl(configured.apiBaseUrl) || '/api';
const generatedServerApiBaseUrl = normalizeGatewayBaseUrl(configured.serverApiBaseUrl)
  || generatedApiBaseUrl;

export const runtimeConfig: RuntimeConfig = {
  apiBaseUrl: generatedApiBaseUrl,
  serverApiBaseUrl: generatedServerApiBaseUrl,
  defaultApiBaseUrl: generatedApiBaseUrl,
  isVercel: generatedIsVercel,
};

export function setRuntimeApiBaseUrl(value: string): void {
  runtimeConfig.apiBaseUrl = normalizeGatewayBaseUrl(value) || runtimeConfig.defaultApiBaseUrl;
}

export function apiUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return joinBasePath(runtimeConfig.apiBaseUrl, normalizedPath);
}

export function serverApiUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const baseUrl = runtimeConfig.serverApiBaseUrl.replace(/\/+$/u, '');
  if (baseUrl === '' || baseUrl === '/') {
    return `/api${normalizedPath}`;
  }

  const serverBaseUrl = stripVersionPath(baseUrl);
  return serverBaseUrl === '/api' || serverBaseUrl.endsWith('/api')
    ? `${serverBaseUrl}${normalizedPath}`
    : `${serverBaseUrl}/api${normalizedPath}`;
}

function joinBasePath(baseUrl: string, normalizedPath: string): string {
  const normalizedBase = baseUrl.replace(/\/+$/u, '');
  if (!normalizedBase) {
    return normalizedPath;
  }

  if (isVersionPath(normalizedBase) && normalizedPath === '/v1') {
    return normalizedBase;
  }

  if (isVersionPath(normalizedBase) && normalizedPath.startsWith('/v1/')) {
    return `${normalizedBase}${normalizedPath.slice('/v1'.length)}`;
  }

  return `${normalizedBase}${normalizedPath}`;
}

function stripVersionPath(baseUrl: string): string {
  return isVersionPath(baseUrl) ? baseUrl.slice(0, -'/v1'.length) || '/' : baseUrl;
}

function isVersionPath(baseUrl: string): boolean {
  return baseUrl === '/v1' || baseUrl.endsWith('/v1');
}
