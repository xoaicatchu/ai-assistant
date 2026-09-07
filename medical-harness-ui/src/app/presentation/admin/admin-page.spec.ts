import { afterEach, describe, expect, it, vi } from 'vitest';
import '@angular/compiler';
import { AdminPage } from './admin-page';
import { AdminService } from '../../infrastructure/http/admin.service';

describe('AdminPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps provider API keys blank while showing only the masked server hint', async () => {
    const service = {
      getSession: vi.fn().mockResolvedValue({ authenticated: true, username: 'admin' }),
      getSettings: vi.fn().mockResolvedValue({
        openAI: {
          baseUrl: 'https://gateway.example/v1',
          defaultModel: 'grok-4.6',
          apiVersion: '',
          hasApiKey: true,
          apiKeyHint: '••••••••',
        },
        anthropic: {
          baseUrl: 'https://api.anthropic.com/v1',
          defaultModel: 'claude-sonnet-4-5',
          apiVersion: '2023-06-01',
          hasApiKey: false,
          apiKeyHint: null,
        },
        webSearch: {
          enabled: true,
          useToolCalling: false,
          baseUrl: 'https://api.tavily.com',
          maxResults: 5,
          timeoutSeconds: 30,
          hasApiKey: false,
          apiKeyHint: null,
        },
      }),
    } as unknown as AdminService;

    const page = new AdminPage(service);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect((page as any).authenticated()).toBe(true);
    expect((page as any).openAiApiKey()).toBe('');
    expect((page as any).openAiApiKeyHint()).toBe('••••••••');
  });

  it('sends login credentials with cookies and never touches localStorage', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ authenticated: true, username: 'admin' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const storage = { getItem: vi.fn(), setItem: vi.fn() };
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('localStorage', storage);

    await new AdminService().login('admin', 'password');

    expect(fetchMock).toHaveBeenCalledWith('/api/admin/login', expect.objectContaining({
      method: 'POST',
      credentials: 'include',
      body: JSON.stringify({ username: 'admin', password: 'password' }),
    }));
    expect(storage.setItem).not.toHaveBeenCalled();
  });
});
