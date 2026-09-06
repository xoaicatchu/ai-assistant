import { afterEach, describe, expect, it } from 'vitest';
import { apiUrl, runtimeConfig, serverApiUrl, setRuntimeApiBaseUrl } from './runtime-config';

describe('runtime config', () => {
  afterEach(() => {
    setRuntimeApiBaseUrl('');
  });

  it('updates the API URL used by the chat service at runtime', () => {
    setRuntimeApiBaseUrl('https://api.example.com///');

    expect(runtimeConfig.apiBaseUrl).toBe('https://api.example.com');
    expect(apiUrl('/health')).toBe('https://api.example.com/health');
    expect(serverApiUrl('/conversations')).toBe('https://api.example.com/api/conversations');
  });

  it('falls back to the generated URL for invalid setup input', () => {
    setRuntimeApiBaseUrl('ftp://api.example.com');

    expect(runtimeConfig.apiBaseUrl).toBe('/api');
  });

  it('uses the same-origin proxy by default while allowing a custom backend on Vercel', () => {
    const originalIsVercel = runtimeConfig.isVercel;
    runtimeConfig.isVercel = true;

    setRuntimeApiBaseUrl('https://aishop24h.com');

    expect(runtimeConfig.apiBaseUrl).toBe('https://aishop24h.com');
    expect(apiUrl('/health')).toBe('https://aishop24h.com/health');
    expect(serverApiUrl('/conversations')).toBe('https://aishop24h.com/api/conversations');

    setRuntimeApiBaseUrl('');
    expect(runtimeConfig.apiBaseUrl).toBe('/api');
    expect(apiUrl('/health')).toBe('/api/health');
    expect(serverApiUrl('/conversations')).toBe('/api/conversations');

    runtimeConfig.isVercel = originalIsVercel;
  });
});
