import { Component, ElementRef, HostListener, OnDestroy, signal, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  LucideArrowUp,
  LucideBot,
  LucideCircleAlert,
  LucideChevronDown,
  LucideCopy,
  LucideHeartPulse,
  LucideLoaderCircle,
  LucideMic,
  LucideMessageCircle,
  LucideMoon,
  LucidePencil,
  LucidePlus,
  LucideRefreshCw,
  LucideServer,
  LucideShare2,
  LucideSettings2,
  LucideShieldCheck,
  LucideSparkles,
  LucideSquare,
  LucideSun,
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
} from '../../infrastructure/ui/composer';
import { ChatMessage, ChatService, ConversationCreated, ConversationRequestError } from '../../infrastructure/http/chat.service';
import { ImageAttachment, toChatMessage } from '../../domain/chat/chat-content';
import {
  buildRequestMessages,
  formatAssistantError,
  MessageStatus,
  ViewMessage,
} from '../../domain/conversation/conversation-state';
import {
  loadConversationState,
  saveConversationState,
  type StoredConversation,
} from '../../infrastructure/storage/conversation-storage';
import { renderMarkdown } from '../../infrastructure/ui/markdown-renderer';
import { sanitizeAssistantText } from '../../domain/chat/assistant-text';
import {
  createConversationUrl,
  createOpaqueConversationId,
  readConversationId,
  type ConversationApiDocument,
  type ConversationApiMessage,
} from '../../domain/conversation/conversation-link';
import {
  modelOptionsForServer,
  modelCapabilitiesForRoute,
  modelLabel,
  modelSupportsVision,
  resolveModelForServer,
  type ModelServer,
  type ModelCapabilitySupport,
} from '../../domain/model/model-picker';
import { apiUrl, runtimeConfig, setRuntimeApiBaseUrl } from '../../infrastructure/http/runtime-config';
import {
  isPageNearBottom,
  restorePageScrollPosition,
  savePageScrollPosition,
  scrollPageToBottom,
  shouldAutoScroll,
  type ConversationScrollReason,
} from '../../infrastructure/ui/scrolling';
import { loadAutoScrollPreference, saveAutoScrollPreference } from '../../infrastructure/ui/scroll-preference';
import {
  DEFAULT_SETUP_SETTINGS,
  loadSetupSettings,
  normalizeGatewayBaseUrl,
  saveSetupSettings,
  type SetupSettings,
} from '../../infrastructure/browser/setup-storage';
import { VoiceInputController } from '../../infrastructure/browser/voice-input';
import { AdminPage } from '../admin/admin-page';
import { loadTheme, saveTheme } from '../../infrastructure/browser/theme';
import { ChatUseCases } from '../../application/chat/chat-use-cases';

type HealthState = 'checking' | 'online' | 'offline' | 'unconfigured';
type ActiveTab = 'chat' | 'setup';
type MessageActionTone = 'success' | 'error';
type SharedRouteState = 'none' | 'loading' | 'loaded' | 'missing' | 'error';
type ServerChoice = 'default' | 'custom';

interface MessageActionFeedback {
  text: string;
  tone: MessageActionTone;
}

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

function modelServerForGateway(baseUrl: string): ModelServer {
  const normalized = baseUrl.trim().replace(/\/+$/u, '');
  return normalized === '' || normalized === '/api' ? 'default' : 'custom';
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
    LucideCopy,
    LucideHeartPulse,
    LucideLoaderCircle,
    LucideMic,
    LucideMessageCircle,
    LucideMoon,
    LucidePencil,
    LucidePlus,
    LucideRefreshCw,
    LucideServer,
    LucideShare2,
    LucideSettings2,
    LucideShieldCheck,
    LucideSparkles,
    LucideSquare,
    LucideSun,
    LucideUserRound,
    LucideWifiOff,
    LucideX,
  ],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App implements OnDestroy {
  private readonly chatUseCases: ChatUseCases;
  @ViewChild('conversation') private conversation?: ElementRef<HTMLElement>;
  @ViewChild('composerInput') private composerInput?: ElementRef<HTMLTextAreaElement>;
  @ViewChild('editQuestionInput') private editQuestionInput?: ElementRef<HTMLTextAreaElement>;

  protected readonly isAdminRoute = globalThis.location?.pathname?.startsWith('/admin') ?? false;
  private readonly initialSetup = loadSetupSettings();
  private readonly initialConversationState = loadConversationState();
  private readonly initialSharedConversationId = readConversationId(globalThis.location?.href ?? '');
  protected readonly runtime = runtimeConfig;
  protected readonly brandLabel = 'MEDICAL HARNESS FRAMEWORK';
  protected readonly darkMode = signal(loadTheme() === 'dark');
  protected readonly activeTab = signal<ActiveTab>('chat');
  protected readonly serverMenuOpen = signal(false);
  protected readonly serverHealth = signal<Record<ModelServer, HealthState>>({
    default: 'checking',
    custom: 'unconfigured',
  });
  protected readonly sharedRouteState = signal<SharedRouteState>(
    this.initialSharedConversationId ? 'loading' : 'none',
  );
  protected readonly sharedRouteMessage = signal(
    this.initialSharedConversationId ? 'Đang mở cuộc trò chuyện…' : '',
  );
  protected readonly conversations = signal<ChatConversation[]>(this.initialConversationState.conversations);
  protected readonly activeConversationId = signal(this.initialConversationState.activeConversationId);
  protected readonly model = signal(
    resolveModelForServer(
      modelServerForGateway(this.initialSetup.gatewayBaseUrl),
      this.initialSetup.selectedModel,
      this.initialSetup.customModels,
    )?.route ?? '',
  );
  protected readonly modelOptions = signal(modelOptionsForServer(
    modelServerForGateway(this.initialSetup.gatewayBaseUrl),
    this.initialSetup.customModels,
  ));
  protected readonly gatewayBaseUrl = signal(this.initialSetup.gatewayBaseUrl);
  protected readonly customGatewayBaseUrl = signal(this.initialSetup.customGatewayBaseUrl);
  protected readonly apiKey = signal(this.initialSetup.apiKey);
  protected readonly customModelsText = signal(this.initialSetup.customModels.join('\n'));
  protected readonly setupMessage = signal('');
  protected readonly shareMessage = signal('');
  protected readonly messageActionFeedback = signal<Record<number, MessageActionFeedback>>({});
  protected readonly draft = signal('');
  protected readonly autoScroll = signal(loadAutoScrollPreference());
  protected readonly editingMessageId = signal<number | null>(null);
  protected readonly editingDraft = signal('');
  protected readonly pendingImage = signal<ImageAttachment | null>(null);
  protected readonly messages = signal<ViewMessage[]>(this.initialSharedConversationId
    ? []
    : [...(this.initialConversationState.conversations.find(
        (conversation) => conversation.id === this.initialConversationState.activeConversationId,
      )?.messages ?? [])]);
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
  private readonly desktopConversationTabs = 5;
  private readonly mobileConversationTabs = 3;
  private readonly acceptedImageTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
  private readonly voiceInput = new VoiceInputController();
  private readonly serverConversationCreates = new Map<number, Promise<string | null>>();
  private autoScrollFramePending = false;

  constructor(private readonly chatService: ChatService) {
    this.chatUseCases = new ChatUseCases(chatService);
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
    if (this.isSharedRouteBlocked() || this.isSharedConversationReadOnly()) {
      return;
    }

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
    if (!this.modelOptions().some((option) => option.route === selectedModel)) {
      const fallback = this.modelOptions()[0];
      if (fallback) {
        this.model.set(fallback.route);
        this.error.set(
          `Model ${modelLabel(selectedModel)} không thuộc server hiện tại. Đã chuyển sang ${fallback.label}.`,
        );
      } else {
        this.error.set('Server hiện tại chưa có model hợp lệ. Hãy mở Customize để thêm model.');
      }
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
    const conversationId = this.activeConversationId();
    // Allocate the server record before the gateway request starts. This keeps
    // the URL reloadable even while the assistant is still streaming.
    void this.ensureServerConversation(conversationId);

    await this.runRequest(
      conversationId,
      requestMessages,
      selectedModel,
      requestId,
      userMessage.id,
      assistantId,
    );
  }

  @HostListener('document:keydown', ['$event'])
  protected onGlobalKeydown(event: KeyboardEvent): void {
    if (this.isAdminRoute) {
      return;
    }

    const key = event.key.toLowerCase();
    const hasCommandModifier = event.ctrlKey || event.metaKey;
    if (hasCommandModifier && !event.altKey && !event.shiftKey && key === 'n') {
      event.preventDefault();
      this.createConversation();
      return;
    }

    if (hasCommandModifier && !event.altKey && !event.shiftKey && key === 'w') {
      event.preventDefault();
      this.deleteConversation(this.activeConversationId(), event);
      return;
    }

    if (hasCommandModifier && !event.altKey && !event.shiftKey && key === 'k') {
      event.preventDefault();
      this.focusComposer();
      return;
    }

    if (key === 'escape') {
      this.serverMenuOpen.set(false);
      if (this.editingMessageId() !== null) {
        this.cancelEditingMessage();
      }
      return;
    }

    if (key === '/' && !hasCommandModifier && !event.altKey && !event.shiftKey && !this.isEditableTarget(event.target)) {
      event.preventDefault();
      this.focusComposer();
    }
  }

  @HostListener('window:scroll')
  protected onWindowScroll(): void {
    savePageScrollPosition();
  }

  protected toggleTheme(): void {
    const nextTheme = this.darkMode() ? 'light' : 'dark';
    this.darkMode.set(nextTheme === 'dark');
    saveTheme(nextTheme);
  }

  protected toggleAutoScroll(): void {
    const nextValue = !this.autoScroll();
    this.autoScroll.set(nextValue);
    saveAutoScrollPreference(nextValue);
  }

  protected async replayAssistantMessage(assistantMessageId: number): Promise<void> {
    if (this.isSharedConversationReadOnly()) {
      return;
    }
    const context = this.replayContext(assistantMessageId);
    if (!context) {
      return;
    }

    await this.replayRequest(context.user, context.assistant);
  }

  protected startEditingMessage(messageId: number): void {
    if (this.isSharedRouteBlocked() || this.isSharedConversationReadOnly()) {
      return;
    }

    const message = this.messages().find((item) => item.id === messageId && item.role === 'user');
    if (!message) {
      return;
    }

    if (this.busy()) {
      this.stopActiveRequest('Đã dừng phản hồi để sửa câu hỏi.');
    }
    this.error.set('');
    this.editingMessageId.set(messageId);
    this.editingDraft.set(message.text);
    requestAnimationFrame(() => this.editQuestionInput?.nativeElement.focus());
  }

  protected cancelEditingMessage(): void {
    this.editingMessageId.set(null);
    this.editingDraft.set('');
  }

  protected onEditQuestionKeydown(event: KeyboardEvent, messageId: number): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.cancelEditingMessage();
      return;
    }

    if (shouldSubmitOnEnter(event, this.composing)) {
      event.preventDefault();
      void this.submitEditedMessage(messageId);
    }
  }

  protected async submitEditedMessage(messageId: number): Promise<void> {
    if (this.isSharedRouteBlocked() || this.isSharedConversationReadOnly()) {
      return;
    }

    const user = this.messages().find((item) => item.id === messageId && item.role === 'user');
    const text = this.editingDraft().trim();
    if (!user || (!text && !user.image)) {
      this.error.set('Câu hỏi không được để trống.');
      return;
    }

    const assistant = this.messages().find(
      (item) => item.role === 'assistant' && item.requestId === user.requestId,
    ) ?? {
      id: this.nextMessageId++,
      requestId: user.requestId,
      role: 'assistant' as const,
      text: '',
      status: 'error' as const,
    };
    this.editingMessageId.set(null);
    this.editingDraft.set('');
    await this.replayRequest(user, assistant, text);
  }

  protected canReplayAssistant(assistantMessageId: number): boolean {
    return !this.isSharedConversationReadOnly() && this.replayContext(assistantMessageId) !== null;
  }

  private replayContext(assistantMessageId: number): {
    user: ViewMessage;
    assistant: ViewMessage;
  } | null {
    const messages = this.messages();
    const assistantIndex = messages.findIndex(
      (message) => message.id === assistantMessageId && message.role === 'assistant',
    );
    if (assistantIndex < 0) {
      return null;
    }

    const assistant = messages[assistantIndex];
    if (assistant.status === 'pending' || !['complete', 'error', 'stopped'].includes(assistant.status)) {
      return null;
    }

    const user = messages
      .slice(0, assistantIndex)
      .find((message) => message.role === 'user' && message.requestId === assistant.requestId);
    return user ? { user, assistant } : null;
  }

  private async replayRequest(
    originalUser: ViewMessage,
    originalAssistant: ViewMessage,
    replacementText = originalUser.text,
  ): Promise<void> {
    if (this.isSharedRouteBlocked() || this.isSharedConversationReadOnly()) {
      return;
    }
    if (this.busy()) {
      this.stopActiveRequest(
        replacementText === originalUser.text
          ? 'Đã dừng để tạo lại câu trả lời.'
          : 'Đã dừng để sửa câu hỏi.',
      );
    }

    const selectedModel = this.model().trim();
    if (!selectedModel) {
      this.error.set('Hãy nhập model trước khi tạo lại câu trả lời.');
      return;
    }
    if (!this.canSendImage(selectedModel, originalUser.image ?? null)) {
      return;
    }

    const currentMessages = this.messages();
    const userIndex = currentMessages.findIndex((message) => message.id === originalUser.id);
    if (userIndex < 0) {
      return;
    }

    const requestId = ++this.requestGeneration;
    const remainingMessages = currentMessages.slice(0, userIndex);
    const requestMessages = buildRequestMessages(remainingMessages);
    requestMessages.push(toChatMessage('user', replacementText, originalUser.image?.dataUrl));

    const retriedUser: ViewMessage = {
      ...originalUser,
      requestId,
      text: replacementText,
      status: 'complete',
    };
    const retriedAssistant: ViewMessage = {
      ...originalAssistant,
      requestId,
      text: '',
      status: 'pending',
    };
    this.messages.set([...remainingMessages, retriedUser, retriedAssistant]);
    this.messageActionFeedback.update((feedback) => {
      const next = { ...feedback };
      delete next[originalAssistant.id];
      return next;
    });
    this.updateActiveConversation(userIndex === 0 ? replacementText : undefined);
    this.error.set('');
    this.shareMessage.set('');
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

    let rawAssistantText = '';
    try {
      await this.chatUseCases.stream(selectedModel, requestMessages, controller.signal, (delta) => {
        if (!this.isCurrentRequest(conversationId, requestId, controller)) {
          return;
        }
        rawAssistantText += delta;
        const visibleText = sanitizeAssistantText(rawAssistantText);
        this.updateConversationMessages(conversationId, (messages) =>
          messages.map((message) =>
            message.id === assistantId ? { ...message, text: visibleText } : message,
          ),
        );
        this.scrollConversationToBottom('response-update');
      }, (recoveredText) => {
        if (!this.isCurrentRequest(conversationId, requestId, controller)) {
          return;
        }
        rawAssistantText = recoveredText;
        this.updateConversationMessages(conversationId, (messages) =>
          messages.map((message) =>
            message.id === assistantId ? { ...message, text: sanitizeAssistantText(recoveredText) } : message,
          ),
        );
      });

      if (!this.isCurrentRequest(conversationId, requestId, controller)) {
        return;
      }

      const assistant = this.conversationMessages(conversationId).find((message) => message.id === assistantId);
      const sanitizedAssistantText = assistant ? sanitizeAssistantText(assistant.text) : '';
      if (assistant && !sanitizedAssistantText) {
        this.setAssistantError(conversationId, assistantId, 'Gateway trả về thành công nhưng không có nội dung text.');
      } else if (assistant) {
        this.updateConversationMessages(conversationId, (messages) =>
          messages.map((message) =>
            message.id === assistantId
              ? { ...message, text: sanitizedAssistantText, status: 'complete' }
              : message,
          ),
        );
      }
    } catch (caughtError) {
      if (!controller.signal.aborted && this.isCurrentRequest(conversationId, requestId, controller)) {
        this.setAssistantError(conversationId, assistantId, this.errorMessage(caughtError));
      }
    } finally {
      if (this.activeRequests.get(conversationId)?.controller === controller) {
        this.activeRequests.delete(conversationId);
        if (this.activeConversationId() === conversationId) {
          this.busy.set(false);
        }
      }
      await this.syncConversationToServer(conversationId);
    }
  }

  protected selectTab(tab: ActiveTab): void {
    this.serverMenuOpen.set(false);
    this.activeTab.set(tab);
    if (tab === 'chat') {
      this.focusComposer();
    } else {
      this.voiceInput.stop();
    }
  }

  protected toggleCustomize(): void {
    this.serverMenuOpen.set(false);
    this.activeTab.set(this.activeTab() === 'setup' ? 'chat' : 'setup');
    if (this.activeTab() === 'chat') {
      this.focusComposer();
    } else {
      this.voiceInput.stop();
    }
  }

  protected toggleServerMenu(): void {
    this.serverMenuOpen.update((open) => !open);
    if (!this.serverMenuOpen()) {
      return;
    }

    void this.checkAllServerHealth();
  }

  protected closeServerMenu(): void {
    this.serverMenuOpen.set(false);
  }

  protected isUsingDefaultServer(): boolean {
    return this.isDefaultGatewayUrl(this.gatewayBaseUrl());
  }

  protected hasCustomServer(): boolean {
    return !this.isDefaultGatewayUrl(this.customGatewayBaseUrl());
  }

  protected customServerLabel(): string {
    const activeGateway = this.gatewayBaseUrl().trim();
    const value = (this.isDefaultGatewayUrl(activeGateway) ? this.customGatewayBaseUrl() : activeGateway).trim();
    if (!value || this.isDefaultGatewayUrl(value)) {
      return 'Chưa cấu hình';
    }

    try {
      const url = new URL(value, globalThis.location?.origin ?? 'http://localhost');
      return `${url.host}${url.pathname === '/' ? '' : url.pathname}`;
    } catch {
      return value;
    }
  }

  protected selectedEndpointLabel(): string {
    return this.absoluteEndpointLabel(this.modelEndpoint());
  }

  protected serverEndpointLabel(server: ModelServer): string {
    if (server === 'default') {
      return this.absoluteEndpointLabel('/api/v1/chat/completions');
    }

    const base = normalizeGatewayBaseUrl(this.customGatewayBaseUrl());
    if (!base) {
      return 'Chưa cấu hình';
    }

    const endpoint = base.endsWith('/v1')
      ? `${base}/chat/completions`
      : `${base}/v1/chat/completions`;
    return this.absoluteEndpointLabel(endpoint);
  }

  private absoluteEndpointLabel(endpoint: string): string {
    try {
      const origin = globalThis.location?.origin ?? 'http://localhost';
      return new URL(endpoint, origin).toString();
    } catch {
      return endpoint;
    }
  }

  protected serverHealthState(server: ModelServer): HealthState {
    return this.serverHealth()[server];
  }

  protected switchServer(choice: ServerChoice): void {
    const currentGateway = this.gatewayBaseUrl().trim();
    const rememberedCustom = this.customGatewayBaseUrl().trim();
    const customGateway = this.isDefaultGatewayUrl(currentGateway)
      ? rememberedCustom
      : currentGateway;
    const normalizedCustomGateway = normalizeGatewayBaseUrl(customGateway);

    if (choice === 'custom' && this.isDefaultGatewayUrl(normalizedCustomGateway)) {
      this.openCustomizeFromServerMenu();
      this.setupMessage.set('Base URL tùy chỉnh chưa hợp lệ. Kiểm tra lại trong Customize.');
      return;
    }

    this.applySetupSettings(
      saveSetupSettings({
        gatewayBaseUrl: choice === 'default' ? '' : normalizedCustomGateway,
        customGatewayBaseUrl: normalizedCustomGateway,
        apiKey: this.apiKey(),
        customModels: this.customModelsText(),
        selectedModel: this.model(),
      }),
      choice === 'default' ? 'Đã chuyển sang server gốc.' : 'Đã chuyển sang server tùy chỉnh.',
    );
    this.serverMenuOpen.set(false);
  }

  protected openCustomizeFromServerMenu(): void {
    this.serverMenuOpen.set(false);
    this.activeTab.set('setup');
    this.voiceInput.stop();
  }

  protected async copyAssistantMessage(messageId: number): Promise<void> {
    const message = this.messages().find((item) => item.id === messageId && item.role === 'assistant');
    const text = message ? sanitizeAssistantText(message.text) : '';
    if (!text.trim()) {
      return;
    }

    try {
      await this.copyToClipboard(text);
      this.setMessageActionFeedback(messageId, 'Đã sao chép câu trả lời.', 'success');
    } catch {
      this.setMessageActionFeedback(messageId, 'Không thể sao chép câu trả lời trên thiết bị này.', 'error');
    }
  }

  protected async shareActiveConversation(messageId?: number): Promise<void> {
    const feedbackMessageId = messageId ?? this.latestAssistantMessageId();
    this.persistActiveConversation();
    const conversation = this.conversations().find(
      (item) => item.id === this.activeConversationId(),
    );
    if (!conversation) {
      this.setMessageActionFeedback(feedbackMessageId, 'Chưa có nội dung để tạo link chia sẻ.', 'error');
      return;
    }

    const conversationMessages = this.conversationMessagesForApi(conversation.messages);
    if (conversationMessages.length === 0) {
      this.setMessageActionFeedback(feedbackMessageId, 'Chưa có nội dung để tạo link chia sẻ.', 'error');
      return;
    }

    if (conversation.isPublic && conversation.serverId && !conversation.serverToken) {
      const publicUrl = createConversationUrl(conversation.serverId, globalThis.location?.href ?? '');
      if (!publicUrl) {
        this.setMessageActionFeedback(feedbackMessageId, 'Conversation có ID không hợp lệ.', 'error');
        return;
      }

      await this.deliverShareUrl(conversation.title, publicUrl, feedbackMessageId);
      return;
    }

    let serverId: string | null = null;
    try {
      serverId = await this.ensureServerConversation(conversation.id, feedbackMessageId);
      if (!serverId) {
        if (feedbackMessageId !== undefined) {
          this.setMessageActionFeedback(
            feedbackMessageId,
            'Không thể lưu cuộc trò chuyện để tạo link chia sẻ.',
            'error',
          );
        }
        return;
      }

      const latestConversation = this.conversations().find((item) => item.id === conversation.id);
      if (!latestConversation) {
        this.setMessageActionFeedback(feedbackMessageId, 'Chưa có nội dung để tạo link chia sẻ.', 'error');
        return;
      }
      const latestMessages = this.conversationMessagesForApi(latestConversation.messages);
      const ownerToken = latestConversation.serverToken;
      await this.chatUseCases.updateConversation(
        serverId,
        latestConversation.title,
        latestMessages,
        ownerToken,
      );
      await this.chatUseCases.publishConversation(serverId, ownerToken);
      this.setConversationPublic(conversation.id, true);
      this.markConversationSynced(conversation.id);
    } catch (caughtError) {
      if (!this.isMissingConversationError(caughtError)) {
        this.setMessageActionFeedback(feedbackMessageId, this.shareFailureMessage(caughtError), 'error');
        return;
      }

      this.rotateServerIdentity(conversation.id);
      serverId = await this.ensureServerConversation(conversation.id, feedbackMessageId);
      const recoveredConversation = this.conversations().find((item) => item.id === conversation.id);
      const recoveredToken = recoveredConversation?.serverToken;
      if (!serverId || !recoveredConversation || !recoveredToken) {
        this.setMessageActionFeedback(feedbackMessageId, 'Không thể lưu cuộc trò chuyện để tạo link chia sẻ.', 'error');
        return;
      }

      try {
        const recoveredMessages = this.conversationMessagesForApi(recoveredConversation.messages);
        await this.chatUseCases.updateConversation(
          serverId,
          recoveredConversation.title,
          recoveredMessages,
          recoveredToken,
        );
        await this.chatUseCases.publishConversation(serverId, recoveredToken);
        this.setConversationPublic(conversation.id, true);
        this.markConversationSynced(conversation.id);
      } catch (recoveryError) {
        this.setMessageActionFeedback(feedbackMessageId, this.shareFailureMessage(recoveryError), 'error');
        return;
      }
    }

    const shareUrl = createConversationUrl(serverId, globalThis.location?.href ?? '');
    if (!shareUrl) {
      this.setMessageActionFeedback(feedbackMessageId, 'Server trả về ID cuộc trò chuyện không hợp lệ.', 'error');
      return;
    }

    await this.deliverShareUrl(conversation.title, shareUrl, feedbackMessageId);
  }

  private async deliverShareUrl(title: string, shareUrl: string, messageId: number | null): Promise<void> {
    try {
      if (typeof globalThis.navigator?.share === 'function') {
        await globalThis.navigator.share({
          title,
          text: 'Cuộc trò chuyện từ Clinic Support AI',
          url: shareUrl,
        });
        this.replaceCurrentUrl(shareUrl);
        this.setMessageActionFeedback(messageId, 'Đã mở bảng chia sẻ.', 'success');
        return;
      }

      await this.copyToClipboard(shareUrl);
      this.replaceCurrentUrl(shareUrl);
      this.setMessageActionFeedback(messageId, 'Đã sao chép link chia sẻ.', 'success');
    } catch (caughtError) {
      if (this.isShareCancellation(caughtError)) {
        return;
      }

      try {
        await this.copyToClipboard(shareUrl);
        this.replaceCurrentUrl(shareUrl);
        this.setMessageActionFeedback(messageId, 'Không mở được bảng chia sẻ; đã sao chép link.', 'success');
      } catch {
        this.setMessageActionFeedback(messageId, 'Không thể sao chép link chia sẻ trên thiết bị này.', 'error');
      }
    }
  }

  protected canCreateConversation(): boolean {
    return !this.isSharedRouteBlocked() &&
      this.conversations().length < this.conversationTabLimit();
  }

  protected canShowNewConversationButton(): boolean {
    return this.conversations().length < this.conversationTabLimit();
  }

  private conversationTabLimit(): number {
    const viewportWidth = globalThis.innerWidth;
    return typeof viewportWidth === 'number' && viewportWidth > 0 && viewportWidth <= 700
      ? this.mobileConversationTabs
      : this.desktopConversationTabs;
  }

  protected isConversationActive(id: number): boolean {
    return this.sharedRouteState() !== 'loading' &&
      this.sharedRouteState() !== 'missing' &&
      this.sharedRouteState() !== 'error' &&
      id === this.activeConversationId();
  }

  protected createConversation(): void {
    this.voiceInput.stop();
    if (!this.canCreateConversation()) {
      return;
    }

    this.persistActiveConversation();
    const id = this.nextConversationId++;
    const conversation = {
      id,
      title: 'Cuộc trò chuyện mới',
      messages: [],
    };
    this.conversations.update((conversations) => [
      ...conversations,
      conversation,
    ]);
    this.activeConversationId.set(id);
    this.messages.set([]);
    this.error.set('');
    this.draft.set('');
    this.pendingImage.set(null);
    this.busy.set(false);
    this.sharedRouteState.set('none');
    this.sharedRouteMessage.set('');
    this.focusComposer();
  }

  protected selectConversation(id: number): void {
    const conversation = this.conversations().find((item) => item.id === id);
    if (!conversation) {
      return;
    }
    if (
      id === this.activeConversationId() &&
      !['loading', 'missing', 'error'].includes(this.sharedRouteState())
    ) {
      return;
    }

    this.voiceInput.stop();
    if (!this.isSharedRouteBlocked() && !this.isSharedConversationReadOnly()) {
      this.persistActiveConversation();
    }

    const selected = conversation;
    this.activeConversationId.set(id);
    this.messages.set([...selected.messages]);
    this.error.set('');
    this.draft.set('');
    this.pendingImage.set(null);
    this.busy.set(this.activeRequests.has(id));
    this.sharedRouteState.set('none');
    this.sharedRouteMessage.set('');
    this.scrollConversationToBottom();
    this.focusComposer();
    this.replaceConversationUrl(selected.serverId);
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
      const replacement = {
        id: this.activeConversationId(),
        title: 'Cuộc trò chuyện mới',
        messages: [],
      };
      this.conversations.set([replacement]);
      this.sharedRouteState.set('none');
      this.sharedRouteMessage.set('');
      this.replaceCurrentUrl(this.chatRootUrl());
      return;
    }

    this.conversations.set(remaining);
    if (id === this.activeConversationId()) {
      const next = remaining[remaining.length - 1];
      this.activeConversationId.set(next.id);
      this.messages.set([...next.messages]);
      this.sharedRouteState.set('none');
      this.sharedRouteMessage.set('');
      this.error.set('');
      this.draft.set('');
      this.pendingImage.set(null);
      this.busy.set(false);
      this.focusComposer();
      this.replaceConversationUrl(next.serverId);
    }
    this.persistConversations();
  }

  protected saveSetup(): void {
    const currentGateway = this.gatewayBaseUrl().trim();
    const saved = saveSetupSettings({
      gatewayBaseUrl: currentGateway,
      customGatewayBaseUrl: this.isDefaultGatewayUrl(currentGateway)
        ? this.customGatewayBaseUrl()
        : currentGateway,
      apiKey: this.apiKey(),
      customModels: this.customModelsText(),
      selectedModel: this.model(),
    });

    this.applySetupSettings(saved, 'Đã lưu tùy chỉnh trên thiết bị này.');
  }

  protected resetSetup(): void {
    const defaults = saveSetupSettings(DEFAULT_SETUP_SETTINGS);
    this.applySetupSettings(defaults, 'Đã khôi phục tùy chỉnh mặc định.');
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

  protected modelEndpoint(): string {
    return apiUrl('/v1/chat/completions');
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

    await this.checkHealthForServer(this.selectedServer());
  }

  private async checkAllServerHealth(): Promise<void> {
    await Promise.allSettled([
      this.checkHealthForServer('default'),
      ...(this.hasCustomServer() ? [this.checkHealthForServer('custom')] : []),
    ]);
  }

  private async checkHealthForServer(server: ModelServer): Promise<void> {
    const baseUrl = server === 'default' ? '' : this.customGatewayBaseUrl();
    this.serverHealth.update((states) => ({ ...states, [server]: 'checking' }));
    if (server === this.selectedServer()) {
      this.health.set('checking');
    }
    try {
      await this.chatUseCases.health(new AbortController().signal, baseUrl);
      this.serverHealth.update((states) => ({ ...states, [server]: 'online' }));
      if (server === this.selectedServer()) {
        this.health.set('online');
      }
    } catch {
      this.serverHealth.update((states) => ({ ...states, [server]: 'offline' }));
      if (server === this.selectedServer()) {
        this.health.set('offline');
      }
    }
  }

  protected onComposerKeydown(event: KeyboardEvent): void {
    if (shouldSubmitOnEnter(event, this.composing)) {
      event.preventDefault();
      dismissComposerOnSubmit(this.composerInput?.nativeElement);
      void this.send();
    }
  }

  protected onModelChange(route: string): void {
    this.model.set(route);
    if (!modelSupportsVision(route) && this.pendingImage()) {
      this.pendingImage.set(null);
      this.error.set('Đã bỏ ảnh đính kèm vì model này không hỗ trợ Vision.');
    }
  }

  protected modelSupportsVision(): boolean {
    return modelSupportsVision(this.model());
  }

  protected toggleVoiceInput(): void {
    if (this.isSharedConversationReadOnly()) {
      return;
    }
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
    if (this.isSharedConversationReadOnly()) {
      event.preventDefault();
      return;
    }
    const imageItem = Array.from(event.clipboardData?.items ?? []).find((item) =>
      item.type.startsWith('image/'),
    );
    if (!imageItem) {
      return;
    }

    if (!this.modelSupportsVision()) {
      event.preventDefault();
      this.error.set('Model hiện tại không hỗ trợ Vision nên không thể dán ảnh.');
      return;
    }

    event.preventDefault();
    const file = imageItem.getAsFile();
    if (file) {
      await this.attachImage(file);
    }
  }

  protected async onImageSelected(event: Event): Promise<void> {
    if (this.isSharedConversationReadOnly()) {
      return;
    }
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file && this.modelSupportsVision()) {
      await this.attachImage(file);
    } else if (file) {
      this.error.set('Model hiện tại không hỗ trợ Vision nên không thể đính kèm ảnh.');
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

  protected serverHealthLabel(server: ModelServer): string {
    switch (this.serverHealth()[server]) {
      case 'online':
        return 'Online';
      case 'offline':
        return 'Offline';
      case 'unconfigured':
        return 'Chưa cấu hình';
      default:
        return 'Đang kiểm tra';
    }
  }

  private errorMessage(caughtError: unknown): string {
    return caughtError instanceof Error ? caughtError.message : 'Không thể kết nối tới gateway.';
  }

  private canSendImage(selectedModel: string, image: ImageAttachment | null): boolean {
    const vision = modelCapabilitiesForRoute(selectedModel).vision;
    if (!image || vision === 'supported') {
      return true;
    }

    this.error.set(
      vision === 'unsupported'
        ? `Model ${modelLabel(selectedModel)} không hỗ trợ Vision. Hãy chọn model có nhãn Vision để gửi ảnh.`
        : `Chưa xác định model ${modelLabel(selectedModel)} có hỗ trợ Vision. Hãy chọn model có nhãn Vision để gửi ảnh.`,
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
    const localConversation = this.conversations().find(
      (conversation) => conversation.serverId === shareId,
    );
    if (localConversation && !localConversation.isPublic && !localConversation.serverToken) {
      this.activeConversationId.set(localConversation.id);
      this.messages.set([...localConversation.messages]);
      this.sharedRouteState.set('loaded');
      this.sharedRouteMessage.set('Cuộc trò chuyện này chỉ được xem.');
      this.persistConversations();
      restorePageScrollPosition();
      return;
    }

    try {
      const shared = localConversation?.serverToken
        ? await this.chatUseCases.getConversation(shareId, localConversation.serverToken)
        : await this.chatUseCases.getConversation(shareId);
      if (this.sharedRouteState() !== 'loading') {
        return;
      }
      this.openSharedConversation(shared);
    } catch (caughtError) {
      if (this.sharedRouteState() !== 'loading') {
        return;
      }
      this.messages.set([]);
      this.error.set('');
      if (this.isMissingConversationError(caughtError)) {
        this.sharedRouteState.set('missing');
        this.sharedRouteMessage.set('Không tìm thấy cuộc trò chuyện từ liên kết này.');
      } else {
        this.sharedRouteState.set('error');
        this.sharedRouteMessage.set('Không thể tải cuộc trò chuyện từ liên kết này.');
      }
    }
  }

  private openSharedConversation(shared: ConversationApiDocument): void {
    const importedConversation = this.importSharedConversation(shared);
    const currentConversations = this.conversations();
    const existingConversation = currentConversations.find(
      (conversation) => conversation.serverId === shared.id,
    );
    const hasOnlyEmptyDefault = currentConversations.length === 1 &&
      currentConversations[0].title === 'Cuộc trò chuyện mới' &&
      currentConversations[0].messages.length === 0;
    const nextConversation = existingConversation
      ? {
          ...importedConversation,
          id: existingConversation.id,
          serverToken: existingConversation.serverToken,
          ...(existingConversation.serverToken
            ? { serverSyncedFingerprint: this.conversationFingerprint(importedConversation) }
            : {}),
        }
      : importedConversation;
    this.conversations.set(
      existingConversation
        ? currentConversations.map((conversation) =>
            conversation.id === existingConversation.id ? nextConversation : conversation,
          )
        : hasOnlyEmptyDefault
          ? [importedConversation]
          : [...currentConversations, importedConversation],
    );
    this.activeConversationId.set(nextConversation.id);
    this.messages.set([...nextConversation.messages]);
    this.sharedRouteState.set('loaded');
    this.sharedRouteMessage.set(nextConversation.canEdit
      ? ''
      : 'Cuộc trò chuyện đã chia sẻ — chỉ được xem.');
    this.persistConversations();
    this.shareMessage.set('Đã mở cuộc trò chuyện từ link chia sẻ.');
    restorePageScrollPosition();
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
      serverId: shared.id,
      isPublic: shared.isPublic === true,
      canEdit: shared.canEdit === true,
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

        return {
          ...item,
          text: formatAssistantError(message),
          status: 'error',
        };
      }),
    );
    this.updateActiveConversation();
    this.error.set('');
    this.scrollConversationToBottom('response-update');
  }

  private async attachImage(file: File): Promise<void> {
    if (!this.modelSupportsVision()) {
      this.error.set('Model hiện tại không hỗ trợ Vision nên không thể đính kèm ảnh.');
      return;
    }

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
    if (this.isSharedRouteBlocked() || this.isSharedConversationReadOnly()) {
      return;
    }

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
    if (!this.autoScroll() || !shouldAutoScroll(reason)) {
      return;
    }

    if (reason === 'response-update' && !isPageNearBottom()) {
      return;
    }

    if (this.autoScrollFramePending) {
      return;
    }

    this.autoScrollFramePending = true;

    const scroll = () => {
      this.autoScrollFramePending = false;
      scrollPageToBottom(reason === 'user-action');
    };

    requestAnimationFrame(() => {
      scroll();
      requestAnimationFrame(scroll);
    });
  }

  private persistActiveConversation(): void {
    if (this.isSharedRouteBlocked() || this.isSharedConversationReadOnly()) {
      return;
    }

    this.updateActiveConversation();
  }

  private updateActiveConversation(title?: string): void {
    if (this.isSharedRouteBlocked() || this.isSharedConversationReadOnly()) {
      return;
    }

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

  private replaceConversationUrl(serverId: string | null | undefined): void {
    if (!serverId) {
      return;
    }

    const url = createConversationUrl(serverId, globalThis.location?.href ?? '');
    if (url) {
      this.replaceCurrentUrl(url);
    }
  }

  private setConversationServerIdentity(
    conversationId: number,
    created: ConversationCreated,
  ): void {
    this.conversations.update((conversations) => conversations.map((conversation) =>
      conversation.id === conversationId
        ? {
            ...conversation,
            serverId: created.id,
            serverToken: created.ownerToken,
            isPublic: created.isPublic === true,
            serverSyncedFingerprint: this.conversationFingerprint(conversation),
          }
        : conversation,
    ));
    this.persistConversations();
    if (this.activeConversationId() === conversationId) {
      this.replaceConversationUrl(created.id);
    }
  }

  private setConversationPublic(conversationId: number, isPublic: boolean): void {
    this.conversations.update((conversations) => conversations.map((conversation) =>
      conversation.id === conversationId ? { ...conversation, isPublic } : conversation,
    ));
    this.persistConversations();
  }

  private markConversationSynced(conversationId: number): void {
    const conversation = this.conversations().find((item) => item.id === conversationId);
    if (!conversation) {
      return;
    }

    const serverSyncedFingerprint = this.conversationFingerprint(conversation);
    this.conversations.update((conversations) => conversations.map((item) =>
      item.id === conversationId ? { ...item, serverSyncedFingerprint } : item,
    ));
    this.persistConversations();
  }

  private hasUnsyncedLocalChanges(conversation: ChatConversation): boolean {
    return !conversation.serverSyncedFingerprint ||
      conversation.serverSyncedFingerprint !== this.conversationFingerprint(conversation);
  }

  private conversationFingerprint(conversation: ChatConversation): string {
    return JSON.stringify({
      title: conversation.title,
      messages: this.conversationMessagesForApi(conversation.messages),
    });
  }

  private rotateServerIdentity(conversationId: number): string | null {
    const serverId = createOpaqueConversationId();
    let found = false;
    this.conversations.update((conversations) => conversations.map((conversation) => {
      if (conversation.id !== conversationId) {
        return conversation;
      }

      found = true;
      return {
        ...conversation,
        serverId,
        serverToken: undefined,
        isPublic: undefined,
        serverSyncedFingerprint: undefined,
      };
    }));
    if (!found) {
      return null;
    }

    this.persistConversations();
    if (this.activeConversationId() === conversationId) {
      this.replaceConversationUrl(serverId);
    }
    return serverId;
  }

  private async ensureServerConversation(
    conversationId: number,
    feedbackMessageId?: number | null,
  ): Promise<string | null> {
    const conversation = this.conversations().find((item) => item.id === conversationId);
    if (!conversation) {
      return null;
    }
    if (conversation.serverId && (conversation.serverToken || conversation.canEdit)) {
      return conversation.serverId;
    }

    const existingRequest = this.serverConversationCreates.get(conversationId);
    if (existingRequest) {
      return existingRequest;
    }

    const request = (async (): Promise<string | null> => {
      const current = this.conversations().find((item) => item.id === conversationId);
      if (!current) {
        return null;
      }

      const messages = this.conversationMessagesForApi(current.messages);
      try {
        const created = await this.chatUseCases.createConversation(
          current.title,
          messages,
          current.serverId,
        );
        this.setConversationServerIdentity(conversationId, created);
        return created.id;
      } catch (caughtError) {
        if (feedbackMessageId !== undefined && this.activeConversationId() === conversationId) {
          this.setMessageActionFeedback(
            feedbackMessageId,
            this.shareFailureMessage(caughtError),
            'error',
          );
        }
        return null;
      }
    })();

    this.serverConversationCreates.set(conversationId, request);
    try {
      return await request;
    } finally {
      if (this.serverConversationCreates.get(conversationId) === request) {
        this.serverConversationCreates.delete(conversationId);
      }
    }
  }

  private chatRootUrl(): string {
    try {
      const url = new URL(globalThis.location?.href ?? '');
      url.pathname = '/';
      url.search = '';
      url.hash = '';
      return url.toString();
    } catch {
      return '/';
    }
  }

  private async syncConversationToServer(conversationId: number): Promise<void> {
    if (this.isSharedRouteBlocked() || this.isSharedConversationReadOnly()) {
      return;
    }

    const serverId = await this.ensureServerConversation(conversationId);
    if (!serverId) {
      return;
    }

    const conversation = this.conversations().find((item) => item.id === conversationId);
    if (!conversation) {
      return;
    }

    try {
      await this.chatUseCases.updateConversation(
        serverId,
        conversation.title,
        this.conversationMessagesForApi(conversation.messages),
        conversation.serverToken,
      );
      this.markConversationSynced(conversationId);
    } catch {
      // Chat remains usable when persistence is temporarily unavailable. The
      // explicit Share action still reports the storage error to the user.
    }
  }

  private conversationMessagesForApi(messages: readonly ViewMessage[]): ConversationApiMessage[] {
    return messages
      .filter((message) => Boolean(message.text.trim()))
      .filter((message) => message.role === 'user' || message.status !== 'pending')
      .map(({ id, requestId, role, text, status }) => ({
        id,
        requestId,
        role,
        text: role === 'assistant' ? sanitizeAssistantText(text) : text,
        status: role === 'user' || status === 'pending' ? 'complete' : status,
      }))
      .filter((message) => Boolean(message.text.trim()));
  }

  private isMissingConversationError(error: unknown): boolean {
    return error instanceof ConversationRequestError && error.status === 404;
  }

  private applySetupSettings(settings: SetupSettings, message: string): void {
    setRuntimeApiBaseUrl(settings.gatewayBaseUrl);
    this.gatewayBaseUrl.set(settings.gatewayBaseUrl);
    this.customGatewayBaseUrl.set(settings.customGatewayBaseUrl);
    this.apiKey.set(settings.apiKey);
    this.customModelsText.set(settings.customModels.join('\n'));
    this.modelOptions.set(modelOptionsForServer(this.selectedServer(), settings.customModels));
    this.model.set(resolveModelForServer(this.selectedServer(), settings.selectedModel, settings.customModels)?.route ?? '');
    this.setupMessage.set(message);
    void this.checkHealth();
  }

  private isDefaultGatewayUrl(value: string): boolean {
    const normalized = value.trim().replace(/\/+$/u, '');
    return normalized === '' || normalized === '/api';
  }

  private selectedServer(): ModelServer {
    return this.isDefaultGatewayUrl(this.gatewayBaseUrl()) ? 'default' : 'custom';
  }

  protected isSharedRouteBlocked(): boolean {
    const state = this.sharedRouteState();
    return state === 'loading' || state === 'missing' || state === 'error';
  }

  protected isSharedConversationReadOnly(): boolean {
    const conversation = this.conversations().find(
      (item) => item.id === this.activeConversationId(),
    );
    return this.initialSharedConversationId !== null &&
      this.sharedRouteState() === 'loaded' &&
      conversation?.canEdit !== true;
  }

  private shareFailureMessage(error: unknown): string {
    if (error instanceof ConversationRequestError && error.message) {
      return error.message;
    }

    return 'Không thể lưu cuộc trò chuyện để tạo link chia sẻ.';
  }

  private latestAssistantMessageId(): number | null {
    return [...this.messages()]
      .reverse()
      .find((message) => message.role === 'assistant' && Boolean(message.text.trim()))?.id ?? null;
  }

  private setMessageActionFeedback(
    messageId: number | null | undefined,
    text: string,
    tone: MessageActionTone,
  ): void {
    this.shareMessage.set(text);
    if (messageId === null || messageId === undefined) {
      return;
    }

    this.messageActionFeedback.update((feedback) => ({
      ...feedback,
      [messageId]: { text, tone },
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

  private isEditableTarget(target: EventTarget | null): boolean {
    const element = target as (HTMLElement & { isContentEditable?: boolean }) | null;
    if (!element) {
      return false;
    }

    return Boolean(element.isContentEditable) || ['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName);
  }

}
