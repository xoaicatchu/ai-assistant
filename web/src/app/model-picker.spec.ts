import { describe, expect, it } from 'vitest';
import {
  MODEL_OPTIONS,
  allModelOptions,
  modelCapabilitiesForRoute,
  modelLabel,
  modelOptionsForServer,
  providerLabel,
  resolveModelForServer,
} from './model-picker';

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

  it('does not re-add removed built-in routes from saved custom models', () => {
    expect(allModelOptions([
      'gpt/gpt-5.6-sol-high-fast',
      'x-ai/grok-4.5',
      'anthropic:claude-sonnet',
    ]).map((option) => option.route)).toEqual([
      'deepseek/deepseek-v4-flash',
      'x-ai/grok-4.6',
      'anthropic:claude-sonnet',
    ]);
  });

  it('exposes the capability matrix for the built-in model routes', () => {
    expect(modelCapabilitiesForRoute('deepseek/deepseek-v4-flash')).toEqual({
      vision: 'unsupported',
      toolCalling: 'supported',
    });
    expect(modelCapabilitiesForRoute('x-ai/grok-4.6')).toEqual({
      vision: 'supported',
      toolCalling: 'supported',
    });
  });

  it('marks custom routes as unknown instead of claiming capabilities', () => {
    expect(allModelOptions(['custom/unknown-model']).at(-1)).toMatchObject({
      capabilities: {
        vision: 'unknown',
        toolCalling: 'unknown',
      },
    });
  });

  it('keeps model options scoped to the selected server', () => {
    expect(modelOptionsForServer('default', ['anthropic:claude-sonnet']).map((option) => option.route)).toEqual([
      'deepseek/deepseek-v4-flash',
      'x-ai/grok-4.6',
    ]);
    expect(modelOptionsForServer('custom', ['anthropic:claude-sonnet']).map((option) => option.route)).toEqual([
      'anthropic:claude-sonnet',
    ]);
  });

  it('falls back to the selected server default when the current model is unavailable', () => {
    expect(resolveModelForServer('custom', 'deepseek/deepseek-v4-flash', ['anthropic:claude-sonnet'])?.route)
      .toBe('anthropic:claude-sonnet');
  });
});
