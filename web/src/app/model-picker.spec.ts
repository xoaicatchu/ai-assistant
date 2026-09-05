import { describe, expect, it } from 'vitest';
import { MODEL_OPTIONS, allModelOptions, modelLabel, providerLabel } from './model-picker';

describe('model picker labels', () => {
  it('turns a routed model into a compact display label', () => {
    expect(modelLabel('x-ai/grok-4.6')).toBe('Grok 4.6');
    expect(providerLabel('x-ai/grok-4.6')).toBe('OpenAI-compatible');
  });

  it('keeps custom model routes readable', () => {
    expect(modelLabel('custom/fast-chat')).toBe('Custom Fast Chat');
    expect(providerLabel('custom/fast-chat')).toBe('OpenAI-compatible');
  });

  it('exposes only the two available built-in model routes', () => {
    expect(MODEL_OPTIONS.map((option) => option.route)).toEqual([
      'deepseek/deepseek-v4-flash',
      'x-ai/grok-4.6',
    ]);
  });

  it('merges saved custom routes without duplicating built-in models', () => {
    expect(allModelOptions(['x-ai/grok-4.6', 'anthropic:claude-sonnet', 'anthropic:claude-sonnet']).map((option) => option.route)).toEqual([
      'deepseek/deepseek-v4-flash',
      'x-ai/grok-4.6',
      'anthropic:claude-sonnet',
    ]);
    expect(allModelOptions(['anthropic:claude-sonnet']).at(-1)).toMatchObject({
      label: 'Claude Sonnet',
      provider: 'Anthropic',
    });
  });
});
