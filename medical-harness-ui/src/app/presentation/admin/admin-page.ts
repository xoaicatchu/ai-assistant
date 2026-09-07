import { Component, signal, type WritableSignal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  LucideHeartPulse,
  LucideRefreshCw,
  LucideServer,
  LucideSettings2,
  LucideShieldCheck,
  LucideX,
} from '@lucide/angular';
import {
  AdminProviderSettings,
  AdminProviderSettingsInput,
  AdminSearchSettings,
  AdminService,
} from '../../infrastructure/http/admin.service';

@Component({
  selector: 'app-admin-page',
  imports: [
    FormsModule,
    LucideHeartPulse,
    LucideRefreshCw,
    LucideServer,
    LucideSettings2,
    LucideShieldCheck,
    LucideX,
  ],
  templateUrl: './admin-page.html',
  styleUrl: './admin-page.css',
})
export class AdminPage {
  protected readonly authenticated = signal(false);
  protected readonly loading = signal(true);
  protected readonly busy = signal(false);
  protected readonly username = signal('');
  protected readonly password = signal('');
  protected readonly error = signal('');
  protected readonly message = signal('');

  protected readonly openAiBaseUrl = signal('');
  protected readonly openAiDefaultModel = signal('');
  protected readonly openAiApiVersion = signal('');
  protected readonly openAiApiKey = signal('');
  protected readonly openAiApiKeyHint = signal<string | null>(null);
  protected readonly clearOpenAiApiKey = signal(false);

  protected readonly anthropicBaseUrl = signal('');
  protected readonly anthropicDefaultModel = signal('');
  protected readonly anthropicApiVersion = signal('');
  protected readonly anthropicApiKey = signal('');
  protected readonly anthropicApiKeyHint = signal<string | null>(null);
  protected readonly clearAnthropicApiKey = signal(false);

  protected readonly searchEnabled = signal(true);
  protected readonly searchUseToolCalling = signal(false);
  protected readonly searchBaseUrl = signal('');
  protected readonly searchMaxResults = signal(5);
  protected readonly searchTimeoutSeconds = signal(30);
  protected readonly searchApiKey = signal('');
  protected readonly searchApiKeyHint = signal<string | null>(null);
  protected readonly clearSearchApiKey = signal(false);

  protected readonly currentPassword = signal('');
  protected readonly newPassword = signal('');

  constructor(private readonly adminService: AdminService) {
    void this.loadSession();
  }

  protected async login(): Promise<void> {
    if (!this.username().trim() || !this.password()) {
      this.error.set('Nhập tên đăng nhập và mật khẩu.');
      return;
    }

    this.busy.set(true);
    this.error.set('');
    this.message.set('');
    try {
      const session = await this.adminService.login(this.username().trim(), this.password());
      this.authenticated.set(session.authenticated);
      this.username.set(session.username ?? this.username().trim());
      this.password.set('');
      if (this.authenticated()) {
        this.replacePath('/admin');
        await this.loadSettings();
      }
    } catch {
      this.error.set('Đăng nhập không thành công. Kiểm tra lại thông tin.');
    } finally {
      this.busy.set(false);
      this.loading.set(false);
    }
  }

  protected async saveSettings(): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    this.message.set('');
    try {
      const saved = await this.adminService.saveSettings({
        openAI: this.providerInput(
          this.openAiBaseUrl(),
          this.openAiDefaultModel(),
          this.openAiApiVersion(),
          this.openAiApiKey(),
          this.clearOpenAiApiKey(),
        ),
        anthropic: this.providerInput(
          this.anthropicBaseUrl(),
          this.anthropicDefaultModel(),
          this.anthropicApiVersion(),
          this.anthropicApiKey(),
          this.clearAnthropicApiKey(),
        ),
        webSearch: {
          enabled: this.searchEnabled(),
          useToolCalling: this.searchUseToolCalling(),
          baseUrl: this.searchBaseUrl(),
          maxResults: this.searchMaxResults(),
          timeoutSeconds: this.searchTimeoutSeconds(),
          apiKey: this.searchApiKey(),
          clearApiKey: this.clearSearchApiKey(),
        },
      });
      this.applySettings(saved);
      this.message.set('Đã lưu cấu hình backend.');
    } catch (caughtError) {
      this.error.set(caughtError instanceof Error ? caughtError.message : 'Không thể lưu cấu hình backend.');
    } finally {
      this.busy.set(false);
    }
  }

  protected async changePassword(): Promise<void> {
    if (!this.currentPassword() || !this.newPassword()) {
      this.error.set('Nhập mật khẩu hiện tại và mật khẩu mới.');
      return;
    }

    this.busy.set(true);
    this.error.set('');
    this.message.set('');
    try {
      await this.adminService.changePassword(this.currentPassword(), this.newPassword());
      this.currentPassword.set('');
      this.newPassword.set('');
      this.message.set('Đã đổi mật khẩu admin.');
    } catch (caughtError) {
      this.error.set(caughtError instanceof Error ? caughtError.message : 'Không thể đổi mật khẩu.');
    } finally {
      this.busy.set(false);
    }
  }

  protected async logout(): Promise<void> {
    this.busy.set(true);
    try {
      await this.adminService.logout();
    } finally {
      this.authenticated.set(false);
      this.loading.set(false);
      this.busy.set(false);
      this.replacePath('/admin/login');
    }
  }

  protected clearOpenAiKey(): void {
    this.openAiApiKey.set('');
    this.clearOpenAiApiKey.set(true);
  }

  protected clearAnthropicKey(): void {
    this.anthropicApiKey.set('');
    this.clearAnthropicApiKey.set(true);
  }

  protected clearSearchKey(): void {
    this.searchApiKey.set('');
    this.clearSearchApiKey.set(true);
  }

  protected backToChat(): void {
    this.replacePath('/');
    globalThis.location?.assign('/');
  }

  private async loadSession(): Promise<void> {
    try {
      const session = await this.adminService.getSession();
      this.authenticated.set(session.authenticated);
      this.username.set(session.username ?? '');
      if (session.authenticated) {
        await this.loadSettings();
      }
    } catch {
      this.error.set('Không thể kết nối tới backend admin.');
    } finally {
      this.loading.set(false);
    }
  }

  private async loadSettings(): Promise<void> {
    const settings = await this.adminService.getSettings();
    this.applySettings(settings);
  }

  private applySettings(settings: {
    openAI: AdminProviderSettings;
    anthropic: AdminProviderSettings;
    webSearch: AdminSearchSettings;
  }): void {
    this.applyProvider(
      settings.openAI,
      this.openAiBaseUrl,
      this.openAiDefaultModel,
      this.openAiApiVersion,
      this.openAiApiKey,
      this.openAiApiKeyHint,
    );
    this.applyProvider(
      settings.anthropic,
      this.anthropicBaseUrl,
      this.anthropicDefaultModel,
      this.anthropicApiVersion,
      this.anthropicApiKey,
      this.anthropicApiKeyHint,
    );
    this.searchEnabled.set(settings.webSearch.enabled);
    this.searchUseToolCalling.set(settings.webSearch.useToolCalling);
    this.searchBaseUrl.set(settings.webSearch.baseUrl);
    this.searchMaxResults.set(settings.webSearch.maxResults);
    this.searchTimeoutSeconds.set(settings.webSearch.timeoutSeconds);
    this.searchApiKey.set('');
    this.searchApiKeyHint.set(settings.webSearch.apiKeyHint);
    this.clearOpenAiApiKey.set(false);
    this.clearAnthropicApiKey.set(false);
    this.clearSearchApiKey.set(false);
  }

  private applyProvider(
    settings: AdminProviderSettings,
    baseUrl: WritableSignal<string>,
    defaultModel: WritableSignal<string>,
    apiVersion: WritableSignal<string>,
    apiKey: WritableSignal<string>,
    keyHint: WritableSignal<string | null>,
  ): void {
    baseUrl.set(settings.baseUrl);
    defaultModel.set(settings.defaultModel);
    apiVersion.set(settings.apiVersion);
    apiKey.set('');
    keyHint.set(settings.apiKeyHint);
  }

  private providerInput(
    baseUrl: string,
    defaultModel: string,
    apiVersion: string,
    apiKey: string,
    clearApiKey: boolean,
  ): AdminProviderSettingsInput {
    return { baseUrl, defaultModel, apiVersion, apiKey, clearApiKey };
  }

  private replacePath(path: string): void {
    try {
      globalThis.history?.replaceState(null, '', path);
    } catch {
      // The admin page remains usable when history APIs are unavailable.
    }
  }
}
