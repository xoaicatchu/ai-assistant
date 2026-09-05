import { describe, expect, it } from 'vitest';
import { MODEL_OPTIONS, allModelOptions, modelLabel, providerLabel } from './model-picker';

describe('model picker labels', () => {
  it('turns a routed model into a compact display label', () => {
    expect(modelLabel('x-ai/grok-4.6')).toBe('Grok 4.6');
    expect(providerLabel('x-ai/grok-4.6')).toBe('OpenAI-compatible');
  });

  it('keeps custom model routes readable', () => {
    expect(modelLabel('gpt/gpt-5.6-sol-high-fast')).toBe('GPT-5.6 Sol High Fast');
    expect(providerLabel('gpt/gpt-5.6-sol-high-fast')).toBe('OpenAI-compatible');
  });

  it('exposes only the four configured model routes', () => {
    expect(MODEL_OPTIONS.map((option) => option.route)).toEqual([
      'gpt/gpt-5.6-sol-high-fast',
      'deepseek/deepseek-v4-flash',
      'x-ai/grok-4.5',
      'x-ai/grok-4.6',
    ]);
  });

  it('merges saved custom routes without duplicating built-in models', () => {
    expect(allModelOptions(['x-ai/grok-4.6', 'anthropic:claude-sonnet', 'anthropic:claude-sonnet']).map((option) => option.route)).toEqual([
      'gpt/gpt-5.6-sol-high-fast',
      'deepseek/deepseek-v4-flash',
      'x-ai/grok-4.5',
      'x-ai/grok-4.6',
      'anthropic:claude-sonnet',
    ]);
    expect(allModelOptions(['anthropic:claude-sonnet']).at(-1)).toMatchObject({
      label: 'Claude Sonnet',
      provider: 'Anthropic',
    });
  });
});
