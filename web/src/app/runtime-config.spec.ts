import { afterEach, describe, expect, it } from 'vitest';
import { apiUrl, runtimeConfig, setRuntimeApiBaseUrl } from './runtime-config';

describe('runtime config', () => {
  afterEach(() => {
    setRuntimeApiBaseUrl('');
  });

  it('updates the API URL used by the chat service at runtime', () => {
    setRuntimeApiBaseUrl('https://api.example.com///');

    expect(runtimeConfig.apiBaseUrl).toBe('https://api.example.com');
    expect(apiUrl('/health')).toBe('https://api.example.com/health');
  });

  it('falls back to the generated URL for invalid setup input', () => {
    setRuntimeApiBaseUrl('ftp://api.example.com');

    expect(runtimeConfig.apiBaseUrl).toBe('');
  });
});
