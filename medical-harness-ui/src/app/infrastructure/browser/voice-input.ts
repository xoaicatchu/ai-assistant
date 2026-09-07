export interface SpeechRecognitionAlternativeLike {
  transcript: string;
}

export interface SpeechRecognitionResultLike {
  isFinal: boolean;
  [index: number]: SpeechRecognitionAlternativeLike | undefined;
}

export interface SpeechRecognitionResultListLike {
  readonly length: number;
  [index: number]: SpeechRecognitionResultLike;
}

export interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: SpeechRecognitionResultListLike;
}

export interface SpeechRecognitionErrorEventLike {
  error: string;
}

export interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort?(): void;
}

export interface SpeechRecognitionConstructor {
  new (): SpeechRecognitionLike;
}

export interface SpeechRecognitionHost {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
}

export interface VoiceInputCallbacks {
  onListeningChange: (listening: boolean) => void;
  onTranscript: (draft: string) => void;
  onError: (message: string) => void;
}

interface StoredTranscript {
  text: string;
  isFinal: boolean;
}

type VoiceInputFactory = () => SpeechRecognitionLike | null;

const UNSUPPORTED_MESSAGE = 'Trình duyệt này chưa hỗ trợ nhập bằng giọng nói.';

export function createSpeechRecognition(host: SpeechRecognitionHost | null = readSpeechRecognitionHost()): SpeechRecognitionLike | null {
  const Constructor = host?.SpeechRecognition ?? host?.webkitSpeechRecognition;
  return Constructor ? new Constructor() : null;
}

export function appendVoiceTranscript(baseDraft: string, transcript: string): string {
  const cleanTranscript = transcript.trim();
  if (!cleanTranscript) {
    return baseDraft;
  }

  const cleanBase = baseDraft.trimEnd();
  return cleanBase ? `${cleanBase} ${cleanTranscript}` : cleanTranscript;
}

export function voiceInputErrorMessage(error: string): string {
  switch (error) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'Hãy cho phép quyền microphone để nhập bằng giọng nói.';
    case 'no-speech':
      return 'Không nghe thấy giọng nói. Hãy thử lại.';
    case 'audio-capture':
      return 'Không tìm thấy microphone trên thiết bị.';
    case 'network':
      return 'Không thể kết nối dịch vụ nhận diện giọng nói.';
    case 'language-not-supported':
      return 'Ngôn ngữ tiếng Việt chưa được hỗ trợ trên trình duyệt này.';
    default:
      return 'Không thể nhận diện giọng nói. Hãy thử lại.';
  }
}

export class VoiceInputController {
  private recognition: SpeechRecognitionLike | null = null;
  private callbacks: VoiceInputCallbacks | null = null;
  private baseDraft = '';
  private readonly transcripts = new Map<number, StoredTranscript>();
  private listening = false;

  constructor(private readonly createRecognition: VoiceInputFactory = () => createSpeechRecognition()) {}

  start(baseDraft: string, callbacks: VoiceInputCallbacks): boolean {
    if (this.listening) {
      return true;
    }

    const recognition = this.createRecognition();
    if (!recognition) {
      callbacks.onError(UNSUPPORTED_MESSAGE);
      return false;
    }

    this.recognition = recognition;
    this.callbacks = callbacks;
    this.baseDraft = baseDraft;
    this.transcripts.clear();
    recognition.lang = 'vi-VN';
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onresult = (event) => this.handleResult(event);
    recognition.onerror = (event) => {
      this.setListening(false);
      callbacks.onError(voiceInputErrorMessage(event.error));
      this.cleanup(recognition);
    };
    recognition.onend = () => {
      this.setListening(false);
      this.cleanup(recognition);
    };

    this.setListening(true);
    try {
      recognition.start();
      return true;
    } catch {
      this.setListening(false);
      callbacks.onError('Không thể bắt đầu nhập bằng giọng nói. Hãy thử lại.');
      this.cleanup(recognition);
      return false;
    }
  }

  stop(): void {
    const recognition = this.recognition;
    if (!recognition) {
      return;
    }

    try {
      recognition.stop();
    } catch {
      // The browser may already have ended the recognition session.
    }
    this.setListening(false);
    this.cleanup(recognition);
  }

  destroy(): void {
    const recognition = this.recognition;
    if (!recognition) {
      return;
    }

    recognition.onresult = null;
    recognition.onerror = null;
    recognition.onend = null;
    try {
      recognition.abort?.();
    } catch {
      // Ignore teardown errors while the component is being destroyed.
    }
    this.listening = false;
    this.cleanup(recognition);
  }

  private handleResult(event: SpeechRecognitionEventLike): void {
    const callbacks = this.callbacks;
    if (!callbacks) {
      return;
    }

    for (let index = Math.max(0, event.resultIndex); index < event.results.length; index += 1) {
      const result = event.results[index];
      const transcript = result?.[0]?.transcript?.trim() ?? '';
      if (!transcript) {
        this.transcripts.delete(index);
        continue;
      }
      this.transcripts.set(index, { text: transcript, isFinal: result.isFinal });
    }

    const transcript = [...this.transcripts.entries()]
      .sort(([left], [right]) => left - right)
      .map(([, result]) => result.text)
      .join(' ');
    if (transcript) {
      callbacks.onTranscript(appendVoiceTranscript(this.baseDraft, transcript));
    }
  }

  private setListening(listening: boolean): void {
    if (this.listening === listening) {
      return;
    }
    this.listening = listening;
    this.callbacks?.onListeningChange(listening);
  }

  private cleanup(recognition: SpeechRecognitionLike): void {
    recognition.onresult = null;
    recognition.onerror = null;
    recognition.onend = null;
    if (this.recognition === recognition) {
      this.recognition = null;
    }
    this.callbacks = null;
    this.transcripts.clear();
  }
}

function readSpeechRecognitionHost(): SpeechRecognitionHost | null {
  if (typeof window === 'undefined') {
    return null;
  }

  return window as Window & SpeechRecognitionHost;
}
