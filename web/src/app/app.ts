import { Component, ElementRef, OnDestroy, signal, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  LucideArrowUp,
  LucideBot,
  LucideCircleAlert,
  LucideChevronDown,
  LucideHeartPulse,
  LucideLoaderCircle,
  LucideMic,
  LucideMessageCircle,
  LucidePlus,
  LucideRefreshCw,
  LucideServer,
  LucideShare2,
  LucideSettings2,
  LucideShieldCheck,
  LucideSparkles,
  LucideSquare,
  LucideUserRound,
  LucideWifiOff,
  LucideX,
} from '@lucide/angular';
import {
  dismissComposerOnSubmit,
  focusComposerOnDesktop,
  focusConversationAfterAppleSubmit,
  restoreComposerAfterSend,
  shouldSubmitOnEnter,
} from './composer';
import { ChatMessage, ChatService } from './chat.service';
import { ImageAttachment, toChatMessage } from './chat-content';
import {
  buildRequestMessages,
  findAssistantForUser,
  formatAssistantError,
  MessageStatus,
  ViewMessage,
} from './conversation-state';
import {
  loadConversationState,
  saveConversationState,
  type StoredConversation,
} from './conversation-storage';
import { renderMarkdown } from './markdown-renderer';
import {
  createConversationUrl,
  readConversationId,
  type ConversationApiDocument,
  type ConversationApiMessage,
} from './conversation-link';
import {
  allModelOptions,
  modelCapabilitiesForRoute,
  modelLabel,
  type ModelCapabilitySupport,
} from './model-picker';
import { runtimeConfig, setRuntimeApiBaseUrl } from './runtime-config';
import { scrollToBottom, shouldAutoScroll, type ConversationScrollReason } from './scrolling';
import {
  DEFAULT_SETUP_SETTINGS,
  loadSetupSettings,
  saveSetupSettings,
} from './setup-storage';
import { VoiceInputController } from './voice-input';
import { AdminPage } from './admin-page';

type HealthState = 'checking' | 'online' | 'offline' | 'unconfigured';
type ActiveTab = 'chat' | 'setup';

interface ActiveRequest {
  conversationId: number;
  requestId: number;
  userMessageId: number;
  assistantMessageId: number;
  controller: AbortController;
}

type ChatConversation = StoredConversation;

function maxConversationId(conversations: readonly ChatConversation[]): number {
  return conversations.reduce((maxId, conversation) => Math.max(maxId, conversation.id), 0);
}

function maxMessageId(conversations: readonly ChatConversation[]): number {
  return conversations.reduce(
    (maxId, conversation) =>
      conversation.messages.reduce((messageMax, message) => Math.max(messageMax, message.id), maxId),
    0,
  );
}

function maxRequestId(conversations: readonly ChatConversation[]): number {
  return conversations.reduce(
    (maxId, conversation) =>
      conversation.messages.reduce((requestMax, message) => Math.max(requestMax, message.requestId), maxId),
    0,
  );
}

@Component({
  selector: 'app-root',
  imports: [
    AdminPage,
    FormsModule,
    LucideArrowUp,
    LucideBot,
    LucideCircleAlert,
    LucideChevronDown,
    LucideHeartPulse,
    LucideLoaderCircle,
    LucideMic,
    LucideMessageCircle,
    LucidePlus,
    LucideRefreshCw,
    LucideServer,
    LucideShare2,
    LucideSettings2,
    LucideShieldCheck,
    LucideSparkles,
    LucideSquare,
    LucideUserRound,
    LucideWifiOff,
    LucideX,
  ],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App implements OnDestroy {
  @ViewChild('conversation') private conversation?: ElementRef<HTMLElement>;
  @ViewChild('composerInput') private composerInput?: ElementRef<HTMLTextAreaElement>;

  protected readonly isAdminRoute = globalThis.location?.pathname?.startsWith('/admin') ?? false;
  private readonly initialSetup = loadSetupSettings();
  private readonly initialConversationState = loadConversationState();
  private readonly initialSharedConversationId = readConversationId(globalThis.location?.href ?? '');
  protected readonly runtime = runtimeConfig;
  protected readonly brandLabel = 'MEDICAL HARNESS FRAMEWORK';
  protected readonly activeTab = signal<ActiveTab>('chat');
  protected readonly conversations = signal<ChatConversation[]>(this.initialConversationState.conversations);
  protected readonly activeConversationId = signal(this.initialConversationState.activeConversationId);
  protected readonly model = signal(this.initialSetup.selectedModel);
  protected readonly modelOptions = signal(allModelOptions(this.initialSetup.customModels));
  protected readonly gatewayBaseUrl = signal(this.initialSetup.gatewayBaseUrl);
  protected readonly apiKey = signal(this.initialSetup.apiKey);
  protected readonly customModelsText = signal(this.initialSetup.customModels.join('\n'));
  protected readonly setupMessage = signal('');
  protected readonly shareMessage = signal('');
  protected readonly draft = signal('');
  protected readonly pendingImage = signal<ImageAttachment | null>(null);
  protected readonly messages = signal<ViewMessage[]>([
    ...(this.initialConversationState.conversations.find(
      (conversation) => conversation.id === this.initialConversationState.activeConversationId,
    )?.messages ?? []),
  ]);
  protected readonly voiceListening = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly health = signal<HealthState>(
    runtimeConfig.isVercel && !runtimeConfig.apiBaseUrl ? 'unconfigured' : 'checking',
  );

  private readonly activeRequests = new Map<number, ActiveRequest>();
  private requestGeneration = maxRequestId(this.initialConversationState.conversations);
  private composing = false;
  private nextMessageId = maxMessageId(this.initialConversationState.conversations) + 1;
  private nextConversationId = maxConversationId(this.initialConversationState.conversations) + 1;
  private readonly maxImageBytes = 5 * 1024 * 1024;
  private readonly acceptedImageTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
  private readonly voiceInput = new VoiceInputController();

  constructor(private readonly chatService: ChatService) {
    if (this.isAdminRoute) {
      return;
    }

    setRuntimeApiBaseUrl(this.initialSetup.gatewayBaseUrl);
    if (this.initialSharedConversationId) {
      void this.loadSharedConversation(this.initialSharedConversationId);
    }
    void this.checkHealth();
  }

  ngOnDestroy(): void {
    this.persistActiveConversation();
    this.voiceInput.destroy();
  }

  protected async send(): Promise<void> {
    this.voiceInput.stop();
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
    if (!this.canSendImage(selectedModel, image)) {
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
    restoreComposerAfterSend(this.composerInput?.nativeElement);
    focusConversationAfterAppleSubmit(this.conversation?.nativeElement);
    this.error.set('');
    this.shareMessage.set('');
    this.updateActiveConversation(content);

    await this.runRequest(
      this.activeConversationId(),
      requestMessages,
      selectedModel,
      requestId,
      userMessage.id,
      assistantId,
    );
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
    if (!this.canSendImage(selectedModel, originalUser.image ?? null)) {
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
    this.updateActiveConversation();
    this.error.set('');
    this.scrollConversationToBottom();

    await this.runRequest(
      this.activeConversationId(),
      requestMessages,
      selectedModel,
      requestId,
      retriedUser.id,
      retriedAssistant.id,
    );
  }

  protected canRetry(userMessageId: number): boolean {
    const assistant = findAssistantForUser(this.messages(), userMessageId);
    return assistant?.status === 'error' || assistant?.status === 'stopped';
  }

  private async runRequest(
    conversationId: number,
    requestMessages: ChatMessage[],
    selectedModel: string,
    requestId: number,
    userMessageId: number,
    assistantId: number,
  ): Promise<void> {
    const controller = new AbortController();
    this.activeRequests.set(conversationId, {
      conversationId,
      requestId,
      userMessageId,
      assistantMessageId: assistantId,
      controller,
    });
    this.busy.set(true);

    let requestCompleted = false;
    try {
      await this.chatService.stream(selectedModel, requestMessages, controller.signal, (delta) => {
        if (!this.isCurrentRequest(conversationId, requestId, controller)) {
          return;
        }
        this.updateConversationMessages(conversationId, (messages) =>
          messages.map((message) =>
            message.id === assistantId ? { ...message, text: message.text + delta } : message,
          ),
        );
        this.scrollConversationToBottom('response-update');
      });

      if (!this.isCurrentRequest(conversationId, requestId, controller)) {
        return;
      }

      requestCompleted = true;

      const assistant = this.conversationMessages(conversationId).find((message) => message.id === assistantId);
      if (assistant && !assistant.text) {
        this.setAssistantError(conversationId, assistantId, 'Gateway trả về thành công nhưng không có nội dung text.');
      } else if (assistant) {
        this.updateConversationMessages(conversationId, (messages) =>
          messages.map((message) =>
            message.id === assistantId ? { ...message, status: 'complete' } : message,
          ),
        );
      }
    } catch (caughtError) {
      if (!controller.signal.aborted && this.isCurrentRequest(conversationId, requestId, controller)) {
        this.setAssistantError(conversationId, assistantId, this.errorMessage(caughtError));
        requestCompleted = true;
      }
    } finally {
      if (requestCompleted) {
        await this.syncSharedConversation(conversationId);
      }
      if (this.activeRequests.get(conversationId)?.controller === controller) {
        this.activeRequests.delete(conversationId);
        if (this.activeConversationId() === conversationId) {
          this.busy.set(false);
        }
      }
    }
  }

  protected selectTab(tab: ActiveTab): void {
    this.activeTab.set(tab);
    if (tab === 'chat') {
      this.focusComposer();
    } else {
      this.voiceInput.stop();
    }
  }

  protected toggleCustomize(): void {
    this.activeTab.set(this.activeTab() === 'setup' ? 'chat' : 'setup');
    if (this.activeTab() === 'chat') {
      this.focusComposer();
    } else {
      this.voiceInput.stop();
    }
  }

  protected async shareActiveConversation(): Promise<void> {
    this.persistActiveConversation();
    const conversation = this.conversations().find(
      (item) => item.id === this.activeConversationId(),
    );
    if (!conversation) {
      this.shareMessage.set('Chưa có nội dung để tạo link chia sẻ.');
      return;
    }

    const shareMessages = this.shareMessages(conversation.messages);
    if (shareMessages.length === 0) {
      this.shareMessage.set('Chưa có nội dung để tạo link chia sẻ.');
      return;
    }

    let shareId = conversation.shareId;
    try {
      shareId = shareId
        ? shareId
        : await this.chatService.createConversation(conversation.title, shareMessages);
      if (!conversation.shareId) {
        this.setConversationShareId(conversation.id, shareId);
      } else {
        await this.chatService.updateConversation(shareId, conversation.title, shareMessages);
      }
    } catch {
      this.shareMessage.set('Không thể lưu cuộc trò chuyện để tạo link chia sẻ.');
      return;
    }

    const shareUrl = createConversationUrl(shareId, globalThis.location?.href ?? '');
    if (!shareUrl) {
      this.shareMessage.set('Server trả về ID cuộc trò chuyện không hợp lệ.');
      return;
    }

    try {
      if (typeof globalThis.navigator?.share === 'function') {
        await globalThis.navigator.share({
          title: conversation.title,
          text: 'Cuộc trò chuyện từ Clinic Support AI',
          url: shareUrl,
        });
        this.replaceCurrentUrl(shareUrl);
        this.shareMessage.set('Đã mở bảng chia sẻ.');
        return;
      }

      await this.copyToClipboard(shareUrl);
      this.replaceCurrentUrl(shareUrl);
      this.shareMessage.set('Đã sao chép link chia sẻ.');
    } catch (caughtError) {
      if (this.isShareCancellation(caughtError)) {
        return;
      }

      try {
        await this.copyToClipboard(shareUrl);
        this.replaceCurrentUrl(shareUrl);
        this.shareMessage.set('Không mở được bảng chia sẻ; đã sao chép link.');
      } catch {
        this.shareMessage.set('Không thể sao chép link chia sẻ trên thiết bị này.');
      }
    }
  }

  protected createConversation(): void {
    this.voiceInput.stop();
    this.persistActiveConversation();
    const id = this.nextConversationId++;
    this.conversations.update((conversations) => [
      ...conversations,
      { id, title: 'Cuộc trò chuyện mới', messages: [] },
    ]);
    this.activeConversationId.set(id);
    this.messages.set([]);
    this.error.set('');
    this.draft.set('');
    this.pendingImage.set(null);
    this.busy.set(false);
    this.focusComposer();
    this.persistConversations();
  }

  protected selectConversation(id: number): void {
    if (id === this.activeConversationId()) {
      return;
    }

    this.voiceInput.stop();
    this.persistActiveConversation();
    const conversation = this.conversations().find((item) => item.id === id);
    if (!conversation) {
      return;
    }

    this.activeConversationId.set(id);
    this.messages.set([...conversation.messages]);
    this.error.set('');
    this.draft.set('');
    this.pendingImage.set(null);
    this.busy.set(this.activeRequests.has(id));
    this.persistConversations();
    this.scrollConversationToBottom();
    this.focusComposer();
  }

  protected deleteConversation(id: number, event: Event): void {
    event.stopPropagation();
    this.voiceInput.stop();
    const request = this.activeRequests.get(id);
    if (request) {
      request.controller.abort();
      this.activeRequests.delete(id);
    }

    const remaining = this.conversations().filter((conversation) => conversation.id !== id);
    if (remaining.length === 0) {
      this.clear();
      this.conversations.set([{ id: this.activeConversationId(), title: 'Cuộc trò chuyện mới', messages: [] }]);
      this.persistConversations();
      return;
    }

    this.conversations.set(remaining);
    if (id === this.activeConversationId()) {
      const next = remaining[remaining.length - 1];
      this.activeConversationId.set(next.id);
      this.messages.set([...next.messages]);
      this.error.set('');
      this.draft.set('');
      this.pendingImage.set(null);
      this.busy.set(false);
      this.focusComposer();
    }
    this.persistConversations();
  }

  protected saveSetup(): void {
    const saved = saveSetupSettings({
      gatewayBaseUrl: this.gatewayBaseUrl(),
      apiKey: this.apiKey(),
      customModels: this.customModelsText(),
      selectedModel: this.model(),
    });

    setRuntimeApiBaseUrl(saved.gatewayBaseUrl);
    this.gatewayBaseUrl.set(saved.gatewayBaseUrl);
    this.apiKey.set(saved.apiKey);
    this.customModelsText.set(saved.customModels.join('\n'));
    this.modelOptions.set(allModelOptions(saved.customModels));
    this.model.set(saved.selectedModel);
    this.setupMessage.set('Đã lưu tùy chỉnh trên thiết bị này.');
    void this.checkHealth();
  }

  protected resetSetup(): void {
    const defaults = saveSetupSettings(DEFAULT_SETUP_SETTINGS);
    setRuntimeApiBaseUrl(defaults.gatewayBaseUrl);
    this.gatewayBaseUrl.set(defaults.gatewayBaseUrl);
    this.apiKey.set(defaults.apiKey);
    this.customModelsText.set(defaults.customModels.join('\n'));
    this.modelOptions.set(allModelOptions(defaults.customModels));
    this.model.set(defaults.selectedModel);
    this.setupMessage.set('Đã khôi phục tùy chỉnh mặc định.');
    void this.checkHealth();
  }

  protected saveSetupAndOpenChat(): void {
    this.saveSetup();
    this.selectTab('chat');
  }

  protected renderMarkdown(content: string): string {
    return renderMarkdown(content);
  }

  protected modelDisplayLabel(): string {
    return modelLabel(this.model());
  }

  protected selectedModelCapabilitySummary(): string {
    const capabilities = modelCapabilitiesForRoute(this.model());
    return `${modelLabel(this.model())} — Vision: ${this.capabilityStatusLabel(capabilities.vision)}; Tool call: ${this.capabilityStatusLabel(capabilities.toolCalling)}`;
  }

  protected capabilityBadgeLabel(name: string, capability: ModelCapabilitySupport): string {
    return `${name} ${capability === 'supported' ? '✓' : capability === 'unsupported' ? '—' : '?'}`;
  }

  protected capabilityAriaLabel(name: string, capability: ModelCapabilitySupport): string {
    return `${name}: ${this.capabilityStatusLabel(capability)}`;
  }

  protected stop(): void {
    this.stopActiveRequest('Đã dừng phản hồi.');
  }

  protected clear(): void {
    this.voiceInput.stop();
    if (this.busy()) {
      this.stop();
    }
    this.messages.set([]);
    this.updateActiveConversation();
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
      dismissComposerOnSubmit(this.composerInput?.nativeElement);
      void this.send();
    }
  }

  protected toggleVoiceInput(): void {
    if (this.voiceListening()) {
      this.voiceInput.stop();
      return;
    }

    this.error.set('');
    this.voiceInput.start(this.draft(), {
      onListeningChange: (listening) => this.voiceListening.set(listening),
      onTranscript: (draft) => this.draft.set(draft),
      onError: (message) => {
        this.voiceListening.set(false);
        this.error.set(message);
      },
    });
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

  private canSendImage(selectedModel: string, image: ImageAttachment | null): boolean {
    if (!image || modelCapabilitiesForRoute(selectedModel).vision !== 'unsupported') {
      return true;
    }

    this.error.set(
      `Model ${modelLabel(selectedModel)} không hỗ trợ Vision. Hãy chọn model có nhãn Vision để gửi ảnh.`,
    );
    return false;
  }

  private capabilityStatusLabel(capability: ModelCapabilitySupport): string {
    switch (capability) {
      case 'supported':
        return 'Có';
      case 'unsupported':
        return 'Không';
      default:
        return 'Chưa xác định';
    }
  }

  private async loadSharedConversation(shareId: string): Promise<void> {
    try {
      const shared = await this.chatService.getConversation(shareId);
      this.openSharedConversation(shared);
    } catch {
      this.shareMessage.set('Không thể mở cuộc trò chuyện từ link này.');
    }
  }

  private openSharedConversation(shared: ConversationApiDocument): void {
    const importedConversation = this.importSharedConversation(shared);
    const currentConversations = this.conversations();
    const hasOnlyEmptyDefault = currentConversations.length === 1 &&
      currentConversations[0].title === 'Cuộc trò chuyện mới' &&
      currentConversations[0].messages.length === 0;
    this.conversations.set(
      hasOnlyEmptyDefault ? [importedConversation] : [...currentConversations, importedConversation],
    );
    this.activeConversationId.set(importedConversation.id);
    this.messages.set([...importedConversation.messages]);
    this.persistConversations();
    this.shareMessage.set('Đã mở cuộc trò chuyện từ link chia sẻ.');
  }

  private importSharedConversation(shared: ConversationApiDocument): ChatConversation {
    const requestIds = new Map<number, number>();
    const messages = shared.messages.map((message) => {
      let requestId = requestIds.get(message.requestId);
      if (!requestId) {
        requestId = ++this.requestGeneration;
        requestIds.set(message.requestId, requestId);
      }

      return {
        ...message,
        id: this.nextMessageId++,
        requestId,
      };
    });

    return {
      id: this.nextConversationId++,
      title: shared.title,
      shareId: shared.id,
      messages,
    };
  }

  private replaceCurrentUrl(url: string): void {
    try {
      globalThis.history?.replaceState(null, '', url);
    } catch {
      // Updating the address bar is optional; the copied/shared URL remains valid.
    }
  }

  private async copyToClipboard(value: string): Promise<void> {
    if (globalThis.navigator?.clipboard?.writeText) {
      await globalThis.navigator.clipboard.writeText(value);
      return;
    }

    const documentRef = globalThis.document;
    if (!documentRef?.body) {
      throw new Error('Clipboard is unavailable.');
    }

    const textarea = documentRef.createElement('textarea');
    textarea.value = value;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    documentRef.body.appendChild(textarea);
    textarea.select();
    const copied = documentRef.execCommand('copy');
    textarea.remove();
    if (!copied) {
      throw new Error('Clipboard copy failed.');
    }
  }

  private isShareCancellation(error: unknown): boolean {
    return error instanceof DOMException && error.name === 'AbortError';
  }

  private setAssistantError(conversationId: number, assistantId: number, message: string): void {
    this.updateConversationMessages(conversationId, (messages) =>
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
    this.updateActiveConversation();
    this.error.set('');
    this.scrollConversationToBottom('response-update');
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

  private isCurrentRequest(conversationId: number, generation: number, controller: AbortController): boolean {
    return this.requestGeneration >= generation && this.activeRequests.get(conversationId)?.controller === controller && !controller.signal.aborted;
  }

  private stopActiveRequest(message: string): void {
    const conversationId = this.activeConversationId();
    const active = this.activeRequests.get(conversationId);
    if (!active) {
      this.busy.set(false);
      return;
    }

    this.requestGeneration++;
    active.controller.abort();
    this.activeRequests.delete(conversationId);
    this.updateConversationMessages(conversationId, (messages) =>
      messages.map((item) =>
        item.id === active.assistantMessageId
          ? { ...item, text: formatAssistantError(message), status: 'stopped' as MessageStatus }
          : item,
      ),
    );
    this.busy.set(false);
    this.scrollConversationToBottom('response-update');
  }

  private conversationMessages(conversationId: number): ViewMessage[] {
    return this.conversations().find((conversation) => conversation.id === conversationId)?.messages ?? [];
  }

  private updateConversationMessages(
    conversationId: number,
    update: (messages: ViewMessage[]) => ViewMessage[],
  ): void {
    this.conversations.update((conversations) =>
      conversations.map((conversation) =>
        conversation.id === conversationId
          ? { ...conversation, messages: update(conversation.messages) }
          : conversation,
      ),
    );
    if (conversationId === this.activeConversationId()) {
      this.messages.update(update);
    }
    this.persistConversations();
  }

  private scrollConversationToBottom(reason: ConversationScrollReason = 'user-action'): void {
    if (!shouldAutoScroll(reason)) {
      return;
    }

    const scroll = () => {
      const container = this.conversation?.nativeElement;
      if (container) {
        scrollToBottom(container);
      }
    };

    requestAnimationFrame(() => {
      scroll();
      requestAnimationFrame(scroll);
    });
  }

  private persistActiveConversation(): void {
    this.updateActiveConversation();
  }

  private updateActiveConversation(title?: string): void {
    const activeId = this.activeConversationId();
    const currentMessages = [...this.messages()];
    this.conversations.update((conversations) =>
      conversations.map((conversation) =>
        conversation.id === activeId
          ? {
              ...conversation,
              messages: currentMessages,
              title: title ? this.conversationTitle(title) : conversation.title,
            }
          : conversation,
      ),
    );
    this.persistConversations();
  }

  private setConversationShareId(conversationId: number, shareId: string): void {
    this.conversations.update((conversations) => conversations.map((conversation) =>
      conversation.id === conversationId ? { ...conversation, shareId } : conversation,
    ));
    this.persistConversations();
  }

  private async syncSharedConversation(conversationId: number): Promise<void> {
    const conversation = this.conversations().find((item) => item.id === conversationId);
    if (!conversation?.shareId) {
      return;
    }

    const messages = this.shareMessages(conversation.messages);
    if (messages.length === 0) {
      return;
    }

    try {
      await this.chatService.updateConversation(conversation.shareId, conversation.title, messages);
    } catch {
      if (this.activeConversationId() === conversationId) {
        this.shareMessage.set('Không đồng bộ được link conversation mới nhất.');
      }
    }
  }

  private shareMessages(messages: readonly ViewMessage[]): ConversationApiMessage[] {
    return messages
      .filter((message) => Boolean(message.text.trim()))
      .filter((message) => message.role === 'user' || message.status !== 'pending')
      .map(({ id, requestId, role, text, status }) => ({
        id,
        requestId,
        role,
        text,
        status: role === 'user' || status === 'pending' ? 'complete' : status,
      }));
  }

  private persistConversations(): void {
    saveConversationState(this.conversations(), this.activeConversationId());
  }

  private conversationTitle(value: string): string {
    const title = value.trim().replace(/\s+/gu, ' ');
    return title.length > 30 ? `${title.slice(0, 30)}…` : title || 'Cuộc trò chuyện mới';
  }

  private focusComposer(): void {
    requestAnimationFrame(() => focusComposerOnDesktop(this.composerInput?.nativeElement));
  }

}
