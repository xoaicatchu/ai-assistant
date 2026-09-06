export type ModelCapabilitySupport = 'supported' | 'unsupported' | 'unknown';

export interface ModelCapabilities {
  vision: ModelCapabilitySupport;
  toolCalling: ModelCapabilitySupport;
}

export interface ModelOption {
  route: string;
  label: string;
  provider: string;
  description: string;
  capabilities: ModelCapabilities;
}

export type ModelServer = 'default' | 'custom';

const REMOVED_MODEL_ROUTES = new Set([
  'gpt/gpt-5.6-sol-high-fast',
  'x-ai/grok-4.5',
]);

const MODEL_CAPABILITIES: Record<string, ModelCapabilities> = {
  'deepseek/deepseek-v4-flash': { vision: 'unsupported', toolCalling: 'supported' },
  'deepseek-v4-flash': { vision: 'unsupported', toolCalling: 'supported' },
  'deepseek/deepseek-v4-flash-vision-exp': { vision: 'supported', toolCalling: 'supported' },
  'deepseek-v4-flash-vision-exp': { vision: 'supported', toolCalling: 'supported' },
  'x-ai/grok-4.6': { vision: 'supported', toolCalling: 'supported' },
  'grok-4.6': { vision: 'supported', toolCalling: 'supported' },
};

export function modelCapabilitiesForRoute(route: string): ModelCapabilities {
  const capabilities = MODEL_CAPABILITIES[normalizeRoute(route)];
  return capabilities ? { ...capabilities } : { vision: 'unknown', toolCalling: 'unknown' };
}

export function modelSupportsVision(route: string): boolean {
  return modelCapabilitiesForRoute(route).vision === 'supported';
}

export const MODEL_OPTIONS: readonly ModelOption[] = [
  {
    route: 'deepseek/deepseek-v4-flash',
    label: 'DeepSeek V4 Flash',
    provider: 'OpenAI-compatible',
    description: 'Text + tool call; không nhận ảnh',
    capabilities: modelCapabilitiesForRoute('deepseek/deepseek-v4-flash'),
  },
  {
    route: 'x-ai/grok-4.6',
    label: 'Grok 4.6',
    provider: 'OpenAI-compatible',
    description: 'Vision + tool call; phù hợp cho chat và web search',
    capabilities: modelCapabilitiesForRoute('x-ai/grok-4.6'),
  },
];

export function allModelOptions(customModels: readonly string[] = []): ModelOption[] {
  const options = [...MODEL_OPTIONS];
  const knownRoutes = new Set(options.map((option) => option.route));

  for (const rawRoute of customModels) {
    const route = rawRoute.trim();
    if (!route || knownRoutes.has(route) || isRemovedModelRoute(route)) {
      continue;
    }

    options.push({
      route,
      label: modelLabel(route),
      provider: providerLabel(route),
      description: 'Custom model route; capability chưa xác định',
      capabilities: modelCapabilitiesForRoute(route),
    });
    knownRoutes.add(route);
  }

  return options;
}

export function modelOptionsForServer(
  server: ModelServer,
  customModels: readonly string[] = [],
): ModelOption[] {
  if (server === 'default') {
    return [...MODEL_OPTIONS];
  }

  return allModelOptions(customModels).filter((option) => !MODEL_OPTIONS.some((builtIn) => builtIn.route === option.route));
}

export function resolveModelForServer(
  server: ModelServer,
  selectedRoute: string,
  customModels: readonly string[] = [],
): ModelOption | undefined {
  const options = modelOptionsForServer(server, customModels);
  return options.find((option) => option.route === selectedRoute.trim()) ?? options[0];
}

export function isRemovedModelRoute(route: string): boolean {
  return REMOVED_MODEL_ROUTES.has(route.trim().toLowerCase());
}

export function modelLabel(route: string): string {
  const value = route.trim();
  const known = MODEL_OPTIONS.find((option) => option.route === value);
  if (known) {
    return known.label;
  }

  const model = value.includes(':') ? value.slice(value.indexOf(':') + 1) : value;
  return model
    .split(/[\/_-]/u)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ') || 'Chọn model';
}

export function providerLabel(route: string): string {
  return route.trim().toLowerCase().startsWith('anthropic:') ? 'Anthropic' : 'OpenAI-compatible';
}

export function optionForRoute(route: string): ModelOption | undefined {
  return MODEL_OPTIONS.find((option) => option.route === route.trim());
}

function normalizeRoute(route: string): string {
  const value = route.trim().toLowerCase();
  const separator = value.indexOf(':');
  return separator > 0 ? value.slice(separator + 1).trim() : value;
}
