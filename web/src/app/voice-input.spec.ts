import { describe, expect, it, vi } from 'vitest';
import {
  appendVoiceTranscript,
  createSpeechRecognition,
  type SpeechRecognitionEventLike,
  type SpeechRecognitionLike,
  VoiceInputController,
  voiceInputErrorMessage,
} from './voice-input';

class FakeRecognition implements SpeechRecognitionLike {
  lang = '';
  continuous = false;
  interimResults = false;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null = null;
  onerror: ((event: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  start = vi.fn();
  stop = vi.fn();
}

function resultEvent(
  results: Array<{ transcript: string; isFinal: boolean }>,
  resultIndex = 0,
): SpeechRecognitionEventLike {
  return {
    resultIndex,
    results: results.map((result) => ({
      isFinal: result.isFinal,
      0: { transcript: result.transcript },
    })) as unknown as SpeechRecognitionEventLike['results'],
  };
}

describe('createSpeechRecognition', () => {
  it('prefers the standard SpeechRecognition constructor', () => {
    class StandardRecognition extends FakeRecognition {}

    const recognition = createSpeechRecognition({ SpeechRecognition: StandardRecognition });

    expect(recognition).toBeInstanceOf(StandardRecognition);
  });

  it('supports the Safari webkitSpeechRecognition constructor', () => {
    class SafariRecognition extends FakeRecognition {}

    const recognition = createSpeechRecognition({ webkitSpeechRecognition: SafariRecognition });

    expect(recognition).toBeInstanceOf(SafariRecognition);
  });
});

describe('VoiceInputController', () => {
  it('appends interim and final speech without duplicating an updated result', () => {
    const recognition = new FakeRecognition();
    const onTranscript = vi.fn();
    const controller = new VoiceInputController(() => recognition);

    expect(controller.start('Xin chào', {
      onListeningChange: vi.fn(),
      onTranscript,
      onError: vi.fn(),
    })).toBe(true);

    recognition.onresult?.(resultEvent([{ transcript: 'bạn', isFinal: false }]));
    expect(onTranscript).toHaveBeenLastCalledWith('Xin chào bạn');

    recognition.onresult?.(resultEvent([
      { transcript: 'bạn', isFinal: true },
      { transcript: 'khỏe không', isFinal: false },
    ]));
    expect(onTranscript).toHaveBeenLastCalledWith('Xin chào bạn khỏe không');

    recognition.onresult?.(resultEvent([
      { transcript: 'bạn', isFinal: true },
      { transcript: 'khỏe không', isFinal: false },
    ]));
    expect(onTranscript).toHaveBeenLastCalledWith('Xin chào bạn khỏe không');
    expect(onTranscript).toHaveBeenCalledTimes(3);
  });

  it('configures Vietnamese continuous recognition and stops cleanly', () => {
    const recognition = new FakeRecognition();
    const onListeningChange = vi.fn();
    const controller = new VoiceInputController(() => recognition);

    controller.start('', {
      onListeningChange,
      onTranscript: vi.fn(),
      onError: vi.fn(),
    });

    expect(recognition.lang).toBe('vi-VN');
    expect(recognition.continuous).toBe(true);
    expect(recognition.interimResults).toBe(true);
    expect(recognition.start).toHaveBeenCalledOnce();
    expect(onListeningChange).toHaveBeenLastCalledWith(true);

    controller.stop();

    expect(recognition.stop).toHaveBeenCalledOnce();
    expect(onListeningChange).toHaveBeenLastCalledWith(false);
  });

  it('reports unsupported browsers and microphone permission errors', () => {
    const onError = vi.fn();
    const controller = new VoiceInputController(() => null);

    expect(controller.start('', {
      onListeningChange: vi.fn(),
      onTranscript: vi.fn(),
      onError,
    })).toBe(false);
    expect(onError).toHaveBeenCalledWith('Trình duyệt này chưa hỗ trợ nhập bằng giọng nói.');
    expect(voiceInputErrorMessage('not-allowed')).toBe('Hãy cho phép quyền microphone để nhập bằng giọng nói.');
  });
});

describe('appendVoiceTranscript', () => {
  it('adds a clean separator to an existing draft', () => {
    expect(appendVoiceTranscript('Đã có chữ', ' nói thêm')).toBe('Đã có chữ nói thêm');
    expect(appendVoiceTranscript('Đã có chữ ', 'nói thêm')).toBe('Đã có chữ nói thêm');
    expect(appendVoiceTranscript('', 'nói thêm')).toBe('nói thêm');
  });
});
