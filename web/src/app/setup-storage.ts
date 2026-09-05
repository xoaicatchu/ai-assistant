import { MODEL_OPTIONS } from './model-picker';

const STORAGE_KEY = 'medical-harness-agent.setup.v1';

export interface SetupSettings {
  gatewayBaseUrl: string;
  customModels: string[];
  selectedModel: string;
}

export interface SetupSettingsInput {
  gatewayBaseUrl?: string | null;
  customModels?: string | string[] | null;
  selectedModel?: string | null;
}

export const DEFAULT_SETUP_SETTINGS: SetupSettings = {
  gatewayBaseUrl: '',
  customModels: [],
  selectedModel: 'x-ai/grok-4.6',
};

export function normalizeGatewayBaseUrl(value: string | null | undefined): string {
  const rawValue = value?.trim() ?? '';
  if (!rawValue) {
    return '';
  }

  if (rawValue.startsWith('/') && !rawValue.startsWith('//')) {
    return rawValue.replace(/\/+$/u, '') || '/';
  }

  try {
    const url = new URL(rawValue);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return '';
    }

    const path = url.pathname.replace(/\/+$/u, '');
    return `${url.origin}${path}`;
  } catch {
    return '';
  }
}

export function normalizeModelRoutes(value: string | string[] | null | undefined): string[] {
  const values = Array.isArray(value) ? value : (value ?? '').split(/\r?\n/u);
  const routes: string[] = [];

  for (const item of values) {
    const route = item.trim();
    if (route && !routes.includes(route)) {
      routes.push(route);
    }
  }

  return routes;
}

export function loadSetupSettings(): SetupSettings {
  const stored = readStorage();
  if (!stored) {
    return cloneDefaults();
  }

  try {
    return normalizeSetup(JSON.parse(stored) as SetupSettingsInput);
  } catch {
    return cloneDefaults();
  }
}

export function saveSetupSettings(settings: SetupSettingsInput): SetupSettings {
  const normalized = normalizeSetup(settings);

  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(normalized));
  } catch {
    // Browser storage can be unavailable in private mode or when disabled.
  }

  return normalized;
}

function normalizeSetup(settings: SetupSettingsInput): SetupSettings {
  const customModels = normalizeModelRoutes(settings.customModels);
  const gatewayBaseUrl = normalizeGatewayBaseUrl(settings.gatewayBaseUrl);
  const selectedModel = settings.selectedModel?.trim() ?? '';
  const availableRoutes = new Set([
    ...MODEL_OPTIONS.map((option) => option.route),
    ...customModels,
  ]);

  return {
    gatewayBaseUrl,
    customModels,
    selectedModel: availableRoutes.has(selectedModel)
      ? selectedModel
      : DEFAULT_SETUP_SETTINGS.selectedModel,
  };
}

function readStorage(): string | null {
  try {
    return globalThis.localStorage?.getItem(STORAGE_KEY) ?? null;
  } catch {
    return null;
  }
}

function cloneDefaults(): SetupSettings {
  return {
    gatewayBaseUrl: DEFAULT_SETUP_SETTINGS.gatewayBaseUrl,
    customModels: [...DEFAULT_SETUP_SETTINGS.customModels],
    selectedModel: DEFAULT_SETUP_SETTINGS.selectedModel,
  };
}
