import { Component, ElementRef, signal, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  LucideArrowUp,
  LucideBot,
  LucideCircleAlert,
  LucideChevronDown,
  LucideLoaderCircle,
  LucideMessageCircle,
  LucidePaperclip,
  LucideRefreshCw,
  LucideServer,
  LucideSettings2,
  LucideShieldCheck,
  LucideSparkles,
  LucideSquare,
  LucideWifi,
  LucideWifiOff,
  LucideX,
} from '@lucide/angular';
import { shouldSubmitOnEnter } from './composer';
import { ChatMessage, ChatService } from './chat.service';
import { ImageAttachment, toChatMessage } from './chat-content';
import {
  buildRequestMessages,
  findAssistantForUser,
  formatAssistantError,
  MessageStatus,
  ViewMessage,
} from './conversation-state';
import { renderMarkdown } from './markdown-renderer';
import { allModelOptions } from './model-picker';
import { runtimeConfig, setRuntimeApiBaseUrl } from './runtime-config';
import { scrollToBottom } from './scrolling';
import {
  DEFAULT_SETUP_SETTINGS,
  loadSetupSettings,
  saveSetupSettings,
} from './setup-storage';

type HealthState = 'checking' | 'online' | 'offline' | 'unconfigured';
type ActiveTab = 'chat' | 'setup';

interface ActiveRequest {
  requestId: number;
  userMessageId: number;
  assistantMessageId: number;
  controller: AbortController;
}

@Component({
  selector: 'app-root',
  imports: [
    FormsModule,
    LucideArrowUp,
    LucideBot,
    LucideCircleAlert,
    LucideChevronDown,
    LucideLoaderCircle,
    LucideMessageCircle,
    LucidePaperclip,
    LucideRefreshCw,
    LucideServer,
    LucideSettings2,
    LucideShieldCheck,
    LucideSparkles,
    LucideSquare,
    LucideWifi,
    LucideWifiOff,
    LucideX,
  ],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  @ViewChild('conversation') private conversation?: ElementRef<HTMLElement>;

  private readonly initialSetup = loadSetupSettings();
  protected readonly runtime = runtimeConfig;
  protected readonly activeTab = signal<ActiveTab>('chat');
  protected readonly model = signal(this.initialSetup.selectedModel);
  protected readonly modelOptions = signal(allModelOptions(this.initialSetup.customModels));
  protected readonly gatewayBaseUrl = signal(this.initialSetup.gatewayBaseUrl);
  protected readonly customModelsText = signal(this.initialSetup.customModels.join('\n'));
  protected readonly setupMessage = signal('');
  protected readonly draft = signal('');
  protected readonly pendingImage = signal<ImageAttachment | null>(null);
  protected readonly messages = signal<ViewMessage[]>([]);
  protected readonly streamEnabled = signal(true);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly health = signal<HealthState>(
    runtimeConfig.isVercel && !runtimeConfig.apiBaseUrl ? 'unconfigured' : 'checking',
  );

  private activeRequest: ActiveRequest | null = null;
  private requestGeneration = 0;
  private composing = false;
  private nextMessageId = 1;
  private readonly maxImageBytes = 5 * 1024 * 1024;
  private readonly acceptedImageTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

  constructor(private readonly chatService: ChatService) {
    setRuntimeApiBaseUrl(this.initialSetup.gatewayBaseUrl);
    void this.checkHealth();
  }

  protected async send(): Promise<void> {
    const content = this.draft().trim();
    const image = this.pendingImage();
    const selectedModel = this.model().trim();

    if (!content && !image) {
      return;
    }
    if (this.busy()) {
      this.stopActiveRequest('Đã dừng để gửi câu mới.');
    }
    if (!selectedModel) {
      this.error.set('Hãy nhập model trước khi gửi.');
      return;
    }

    const requestMessages = buildRequestMessages(this.messages());
    requestMessages.push(toChatMessage('user', content, image?.dataUrl));

    const requestId = ++this.requestGeneration;
    const userMessage: ViewMessage = {
      id: this.nextMessageId++,
      requestId,
      role: 'user',
      text: content,
      status: 'complete',
      image: image ?? undefined,
    };
    const assistantId = this.nextMessageId++;
    this.messages.update((messages) => [
      ...messages,
      userMessage,
      { id: assistantId, requestId, role: 'assistant', text: '', status: 'pending' },
    ]);
    this.scrollConversationToBottom();
    this.draft.set('');
    this.pendingImage.set(null);
    this.error.set('');

    await this.runRequest(requestMessages, selectedModel, requestId, userMessage.id, assistantId);
  }

  protected async retryMessage(userMessageId: number): Promise<void> {
    const originalUser = this.messages().find(
      (message) => message.id === userMessageId && message.role === 'user',
    );
    const originalAssistant = originalUser ? findAssistantForUser(this.messages(), userMessageId) : null;
    if (
      !originalUser ||
      !originalAssistant ||
      !['error', 'stopped'].includes(originalAssistant.status)
    ) {
      return;
    }

    if (this.busy()) {
      this.stopActiveRequest('Đã dừng để gửi lại tin nhắn.');
    }

    const selectedModel = this.model().trim();
    if (!selectedModel) {
      this.error.set('Hãy nhập model trước khi gửi lại.');
      return;
    }

    const requestId = ++this.requestGeneration;
    const remainingMessages = this.messages().filter((message) => message.requestId !== originalUser.requestId);
    const requestMessages = buildRequestMessages(remainingMessages);
    requestMessages.push(toChatMessage('user', originalUser.text, originalUser.image?.dataUrl));

    const retriedUser: ViewMessage = { ...originalUser, requestId, status: 'complete' };
    const retriedAssistant: ViewMessage = {
      ...originalAssistant,
      requestId,
      text: '',
      status: 'pending',
    };
    this.messages.set([...remainingMessages, retriedUser, retriedAssistant]);
    this.error.set('');
    this.scrollConversationToBottom();

    await this.runRequest(requestMessages, selectedModel, requestId, retriedUser.id, retriedAssistant.id);
  }

  protected canRetry(userMessageId: number): boolean {
    const assistant = findAssistantForUser(this.messages(), userMessageId);
    return assistant?.status === 'error' || assistant?.status === 'stopped';
  }

  private async runRequest(
    requestMessages: ChatMessage[],
    selectedModel: string,
    requestId: number,
    userMessageId: number,
    assistantId: number,
  ): Promise<void> {
    const controller = new AbortController();
    this.activeRequest = { requestId, userMessageId, assistantMessageId: assistantId, controller };
    this.busy.set(true);

    try {
      if (this.streamEnabled()) {
        await this.chatService.stream(selectedModel, requestMessages, controller.signal, (delta) => {
          if (!this.isCurrentRequest(requestId, controller)) {
            return;
          }
          this.messages.update((messages) =>
            messages.map((message) =>
              message.id === assistantId ? { ...message, text: message.text + delta } : message,
            ),
          );
          this.scrollConversationToBottom();
        });
      } else {
        const response = await this.chatService.complete(selectedModel, requestMessages, controller.signal);
        if (!this.isCurrentRequest(requestId, controller)) {
          return;
        }
        this.messages.update((messages) =>
          messages.map((message) =>
            message.id === assistantId ? { ...message, text: response } : message,
          ),
        );
        this.scrollConversationToBottom();
      }

      if (!this.isCurrentRequest(requestId, controller)) {
        return;
      }

      const assistant = this.messages().find((message) => message.id === assistantId);
      if (assistant && !assistant.text) {
        this.setAssistantError(assistantId, 'Gateway trả về thành công nhưng không có nội dung text.');
      } else if (assistant) {
        this.messages.update((messages) =>
          messages.map((message) =>
            message.id === assistantId ? { ...message, status: 'complete' } : message,
          ),
        );
      }
    } catch (caughtError) {
      if (!controller.signal.aborted && this.isCurrentRequest(requestId, controller)) {
        this.setAssistantError(assistantId, this.errorMessage(caughtError));
      }
    } finally {
      if (this.activeRequest?.controller === controller) {
        this.activeRequest = null;
        this.busy.set(false);
      }
    }
  }

  protected selectTab(tab: ActiveTab): void {
    this.activeTab.set(tab);
  }

  protected saveSetup(): void {
    const saved = saveSetupSettings({
      gatewayBaseUrl: this.gatewayBaseUrl(),
      customModels: this.customModelsText(),
      selectedModel: this.model(),
    });

    setRuntimeApiBaseUrl(saved.gatewayBaseUrl);
    this.gatewayBaseUrl.set(saved.gatewayBaseUrl);
    this.customModelsText.set(saved.customModels.join('\n'));
    this.modelOptions.set(allModelOptions(saved.customModels));
    this.model.set(saved.selectedModel);
    this.setupMessage.set('Đã lưu setup trên thiết bị này.');
    void this.checkHealth();
  }

  protected resetSetup(): void {
    const defaults = saveSetupSettings(DEFAULT_SETUP_SETTINGS);
    setRuntimeApiBaseUrl(defaults.gatewayBaseUrl);
    this.gatewayBaseUrl.set(defaults.gatewayBaseUrl);
    this.customModelsText.set(defaults.customModels.join('\n'));
    this.modelOptions.set(allModelOptions(defaults.customModels));
    this.model.set(defaults.selectedModel);
    this.setupMessage.set('Đã khôi phục setup mặc định.');
    void this.checkHealth();
  }

  protected saveSetupAndOpenChat(): void {
    this.saveSetup();
    this.selectTab('chat');
  }

  protected renderMarkdown(content: string): string {
    return renderMarkdown(content);
  }

  protected stop(): void {
    this.stopActiveRequest('Đã dừng phản hồi.');
  }

  protected clear(): void {
    if (this.busy()) {
      this.stop();
    }
    this.messages.set([]);
    this.error.set('');
  }

  protected async checkHealth(): Promise<void> {
    if (runtimeConfig.isVercel && !runtimeConfig.apiBaseUrl) {
      this.health.set('unconfigured');
      return;
    }

    this.health.set('checking');
    try {
      await this.chatService.health(new AbortController().signal);
      this.health.set('online');
    } catch {
      this.health.set('offline');
    }
  }

  protected onComposerKeydown(event: KeyboardEvent): void {
    if (shouldSubmitOnEnter(event, this.composing)) {
      event.preventDefault();
      void this.send();
    }
  }

  protected onComposerCompositionStart(): void {
    this.composing = true;
  }

  protected onComposerCompositionEnd(): void {
    this.composing = false;
  }

  protected async onComposerPaste(event: ClipboardEvent): Promise<void> {
    const imageItem = Array.from(event.clipboardData?.items ?? []).find((item) =>
      item.type.startsWith('image/'),
    );
    if (!imageItem) {
      return;
    }

    event.preventDefault();
    const file = imageItem.getAsFile();
    if (file) {
      await this.attachImage(file);
    }
  }

  protected async onImageSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) {
      await this.attachImage(file);
    }
    input.value = '';
  }

  protected removeImage(): void {
    this.pendingImage.set(null);
  }

  protected healthLabel(): string {
    switch (this.health()) {
      case 'online':
        return 'Gateway online';
      case 'offline':
        return 'Gateway offline';
      case 'unconfigured':
        return 'Thiếu API URL';
      default:
        return 'Đang kiểm tra';
    }
  }

  private errorMessage(caughtError: unknown): string {
    return caughtError instanceof Error ? caughtError.message : 'Không thể kết nối tới gateway.';
  }

  private setAssistantError(assistantId: number, message: string): void {
    this.messages.update((messages) =>
      messages.map((item) => {
        if (item.id !== assistantId) {
          return item;
        }

        const errorBlock = `> **Lỗi:** ${message}`;
        return {
          ...item,
          text: item.text ? `${item.text}\n\n${errorBlock}` : errorBlock,
          status: 'error',
        };
      }),
    );
    this.error.set('');
    this.scrollConversationToBottom();
  }

  private async attachImage(file: File): Promise<void> {
    if (!this.acceptedImageTypes.has(file.type)) {
      this.error.set('Chỉ hỗ trợ ảnh JPG, PNG, WEBP hoặc GIF.');
      return;
    }
    if (file.size > this.maxImageBytes) {
      this.error.set('Ảnh tối đa 5 MB để tránh request quá lớn.');
      return;
    }

    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('Không thể đọc ảnh từ clipboard.'));
        reader.readAsDataURL(file);
      });
      this.pendingImage.set({ dataUrl, name: file.name || 'pasted-image', type: file.type });
      this.error.set('');
    } catch (caughtError) {
      this.error.set(this.errorMessage(caughtError));
    }
  }

  private isCurrentRequest(generation: number, controller: AbortController): boolean {
    return this.requestGeneration === generation && this.activeRequest?.controller === controller && !controller.signal.aborted;
  }

  private stopActiveRequest(message: string): void {
    const active = this.activeRequest;
    if (!active) {
      this.busy.set(false);
      return;
    }

    this.requestGeneration++;
    active.controller.abort();
    this.activeRequest = null;
    this.messages.update((messages) =>
      messages.map((item) =>
        item.id === active.assistantMessageId
          ? { ...item, text: formatAssistantError(message), status: 'stopped' as MessageStatus }
          : item,
      ),
    );
    this.busy.set(false);
    this.scrollConversationToBottom();
  }

  private scrollConversationToBottom(): void {
    requestAnimationFrame(() => {
      const container = this.conversation?.nativeElement;
      if (container) {
        scrollToBottom(container);
      }
    });
  }
}
