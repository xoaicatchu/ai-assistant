import { Injectable } from '@angular/core';
import { serverApiUrl } from './runtime-config';

export interface AdminSession {
  authenticated: boolean;
  username?: string | null;
}

export interface AdminProviderSettings {
  baseUrl: string;
  defaultModel: string;
  apiVersion: string;
  hasApiKey: boolean;
  apiKeyHint: string | null;
}

export interface AdminSearchSettings {
  enabled: boolean;
  useToolCalling: boolean;
  baseUrl: string;
  maxResults: number;
  timeoutSeconds: number;
  hasApiKey: boolean;
  apiKeyHint: string | null;
}

export interface AdminSettings {
  openAI: AdminProviderSettings;
  anthropic: AdminProviderSettings;
  webSearch: AdminSearchSettings;
}

export interface AdminProviderSettingsInput {
  baseUrl: string;
  defaultModel: string;
  apiVersion: string;
  apiKey: string;
  clearApiKey: boolean;
}

export interface AdminSearchSettingsInput {
  enabled: boolean;
  useToolCalling: boolean;
  baseUrl: string;
  maxResults: number;
  timeoutSeconds: number;
  apiKey: string;
  clearApiKey: boolean;
}

export interface AdminSettingsInput {
  openAI: AdminProviderSettingsInput;
  anthropic: AdminProviderSettingsInput;
  webSearch: AdminSearchSettingsInput;
}

@Injectable({ providedIn: 'root' })
export class AdminService {
  async getSession(): Promise<AdminSession> {
    const response = await this.request('/admin/session', { method: 'GET' });
    return (await response.json()) as AdminSession;
  }

  async login(username: string, password: string): Promise<AdminSession> {
    const response = await this.request('/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    return (await response.json()) as AdminSession;
  }

  async logout(): Promise<void> {
    await this.request('/admin/logout', { method: 'POST' });
  }

  async getSettings(): Promise<AdminSettings> {
    const response = await this.request('/admin/settings', { method: 'GET' });
    return (await response.json()) as AdminSettings;
  }

  async saveSettings(settings: AdminSettingsInput): Promise<AdminSettings> {
    const response = await this.request('/admin/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    });
    return (await response.json()) as AdminSettings;
  }

  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    await this.request('/admin/password', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
  }

  private async request(path: string, init: RequestInit): Promise<Response> {
    const response = await fetch(serverApiUrl(path), { ...init, credentials: 'include' });
    if (!response.ok) {
      throw new Error(await this.readError(response));
    }
    return response;
  }

  private async readError(response: Response): Promise<string> {
    const fallback = `Admin request failed with HTTP ${response.status}.`;
    const text = await response.text();
    if (!text) {
      return fallback;
    }

    try {
      const payload = JSON.parse(text) as { error?: { message?: string } };
      return payload.error?.message || fallback;
    } catch {
      return text;
    }
  }
}
