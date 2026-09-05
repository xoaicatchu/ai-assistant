export interface ModelOption {
  route: string;
  label: string;
  provider: string;
  description: string;
}

const REMOVED_MODEL_ROUTES = new Set([
  'gpt/gpt-5.6-sol-high-fast',
  'x-ai/grok-4.5',
]);

export const MODEL_OPTIONS: readonly ModelOption[] = [
  {
    route: 'deepseek/deepseek-v4-flash',
    label: 'DeepSeek V4 Flash',
    provider: 'OpenAI-compatible',
    description: 'Nhẹ, nhanh cho kiểm tra gateway',
  },
  {
    route: 'x-ai/grok-4.6',
    label: 'Grok 4.6',
    provider: 'OpenAI-compatible',
    description: 'Nhanh, phù hợp cho chat và web search',
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
      description: 'Custom model route',
    });
    knownRoutes.add(route);
  }

  return options;
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
