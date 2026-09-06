import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_SETUP_SETTINGS,
  loadSetupSettings,
  normalizeGatewayBaseUrl,
  normalizeModelRoutes,
  saveSetupSettings,
} from './setup-storage';

describe('setup storage', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
    });
  });

  it('returns safe defaults when no saved setup exists', () => {
    expect(loadSetupSettings()).toEqual(DEFAULT_SETUP_SETTINGS);
    expect(DEFAULT_SETUP_SETTINGS.selectedModel).toBe('deepseek/deepseek-v4-flash');
  });

  it('normalizes a saved setup and removes duplicate custom routes', () => {
    const storage = {
      getItem: vi.fn(() =>
        JSON.stringify({
          gatewayBaseUrl: ' https://api.example.com/// ',
          apiKey: '  sk-test  ',
          customModels: [' custom/model ', '', 'custom/model', 'another:model'],
          selectedModel: 'custom/model',
        }),
      ),
      setItem: vi.fn(),
    };
    vi.stubGlobal('localStorage', storage);

    expect(loadSetupSettings()).toEqual({
      gatewayBaseUrl: 'https://api.example.com',
      customGatewayBaseUrl: 'https://api.example.com',
      apiKey: 'sk-test',
      customModels: ['custom/model', 'another:model'],
      selectedModel: 'custom/model',
    });
  });

  it('falls back to defaults for malformed storage and invalid URLs', () => {
    vi.stubGlobal('localStorage', { getItem: vi.fn(() => '{broken'), setItem: vi.fn() });

    expect(loadSetupSettings()).toEqual(DEFAULT_SETUP_SETTINGS);
    expect(normalizeGatewayBaseUrl('ftp://example.com')).toBe('');
    expect(normalizeGatewayBaseUrl('not a url')).toBe('');
  });

  it('migrates the previous Grok default to DeepSeek when it was never explicitly saved', () => {
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => JSON.stringify({ selectedModel: 'x-ai/grok-4.6' })),
      setItem: vi.fn(),
    });

    expect(loadSetupSettings().selectedModel).toBe('deepseek/deepseek-v4-flash');
  });

  it('preserves Grok when the saved setup explicitly selected it', () => {
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => JSON.stringify({
        selectedModel: 'x-ai/grok-4.6',
        selectedModelExplicit: true,
      })),
      setItem: vi.fn(),
    });

    expect(loadSetupSettings().selectedModel).toBe('x-ai/grok-4.6');
  });

  it('normalizes URL and model route input before saving', () => {
    const storage = { getItem: vi.fn(() => null), setItem: vi.fn() };
    vi.stubGlobal('localStorage', storage);

    const saved = saveSetupSettings({
      gatewayBaseUrl: 'http://localhost:5030///',
      apiKey: ' sk-test ',
      customModels: [' foo/bar ', 'foo/bar', ''],
      selectedModel: 'foo/bar',
    });

    expect(saved.gatewayBaseUrl).toBe('http://localhost:5030');
    expect(saved.customGatewayBaseUrl).toBe('http://localhost:5030');
    expect(saved.apiKey).toBe('sk-test');
    expect(saved.customModels).toEqual(['foo/bar']);
    expect(storage.setItem).toHaveBeenCalledOnce();
  });

  it('keeps the last custom server available after switching back to the default server', () => {
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => JSON.stringify({
        gatewayBaseUrl: '',
        customGatewayBaseUrl: 'http://127.0.0.1:8045/v1',
      })),
      setItem: vi.fn(),
    });

    expect(loadSetupSettings().gatewayBaseUrl).toBe('');
    expect(loadSetupSettings().customGatewayBaseUrl).toBe('http://127.0.0.1:8045/v1');
  });

  it('normalizes multiline model routes', () => {
    expect(normalizeModelRoutes('foo/bar\n\nfoo/bar\r\nbaz:model')).toEqual(['foo/bar', 'baz:model']);
  });

  it('removes retired built-in routes from saved custom models', () => {
    expect(normalizeModelRoutes([
      'gpt/gpt-5.6-sol-high-fast',
      'x-ai/grok-4.5',
      'anthropic:claude-sonnet',
    ])).toEqual(['anthropic:claude-sonnet']);
  });
});
