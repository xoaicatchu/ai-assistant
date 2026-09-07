import { afterEach, describe, expect, it } from 'vitest';
import { apiUrl, runtimeConfig, serverApiUrl, setRuntimeApiBaseUrl } from './runtime-config';

describe('runtime config', () => {
  afterEach(() => {
    setRuntimeApiBaseUrl('');
  });

  it('updates only the model API URL used by the chat service at runtime', () => {
    setRuntimeApiBaseUrl('https://api.example.com///');

    expect(runtimeConfig.apiBaseUrl).toBe('https://api.example.com');
    expect(apiUrl('/health')).toBe('https://api.example.com/health');
    expect(serverApiUrl('/conversations')).toBe('/api/conversations');
  });

  it('falls back to the generated URL for invalid setup input', () => {
    setRuntimeApiBaseUrl('ftp://api.example.com');

    expect(runtimeConfig.apiBaseUrl).toBe(runtimeConfig.defaultApiBaseUrl);
  });

  it('keeps server APIs on the generated backend while allowing a custom model endpoint', () => {
    const originalIsVercel = runtimeConfig.isVercel;
    runtimeConfig.isVercel = true;

    setRuntimeApiBaseUrl('https://aishop24h.com');

    expect(runtimeConfig.apiBaseUrl).toBe('https://aishop24h.com');
    expect(apiUrl('/health')).toBe('https://aishop24h.com/health');
    expect(serverApiUrl('/conversations')).toBe('/api/conversations');

    setRuntimeApiBaseUrl('');
    expect(runtimeConfig.apiBaseUrl).toBe(runtimeConfig.defaultApiBaseUrl);
    expect(apiUrl('/health')).toBe(`${runtimeConfig.defaultApiBaseUrl}/health`);
    expect(serverApiUrl('/conversations')).toBe('/api/conversations');

    runtimeConfig.isVercel = originalIsVercel;
  });

  it('supports a local OpenAI-compatible base URL that already includes /v1', () => {
    setRuntimeApiBaseUrl('http://127.0.0.1:8045/v1///');

    expect(runtimeConfig.apiBaseUrl).toBe('http://127.0.0.1:8045/v1');
    expect(apiUrl('/v1/chat/completions')).toBe('http://127.0.0.1:8045/v1/chat/completions');
    expect(apiUrl('/v1/models')).toBe('http://127.0.0.1:8045/v1/models');
    expect(serverApiUrl('/conversations')).toBe('/api/conversations');
  });
});
