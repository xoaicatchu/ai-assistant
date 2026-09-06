import { isRemovedModelRoute, MODEL_OPTIONS } from '../../domain/model/model-picker';

const STORAGE_KEY = 'medical-harness-agent.setup.v1';
const LEGACY_DEFAULT_MODEL = 'x-ai/grok-4.6';

export interface SetupSettings {
  gatewayBaseUrl: string;
  customGatewayBaseUrl: string;
  apiKey: string;
  customModels: string[];
  selectedModel: string;
}

export interface SetupSettingsInput {
  gatewayBaseUrl?: string | null;
  customGatewayBaseUrl?: string | null;
  apiKey?: string | null;
  customModels?: string | string[] | null;
  selectedModel?: string | null;
}

export const DEFAULT_SETUP_SETTINGS: SetupSettings = {
  gatewayBaseUrl: '',
  customGatewayBaseUrl: '',
  apiKey: '',
  customModels: [],
  selectedModel: 'deepseek/deepseek-v4-flash',
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
    if (route && !isRemovedModelRoute(route) && !routes.includes(route)) {
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
    const parsed = JSON.parse(stored) as SetupSettingsInput & { selectedModelExplicit?: boolean };
    const normalized = normalizeSetup(parsed);
    return parsed.selectedModelExplicit === true || parsed.selectedModel?.trim() !== LEGACY_DEFAULT_MODEL
      ? normalized
      : { ...normalized, selectedModel: DEFAULT_SETUP_SETTINGS.selectedModel };
  } catch {
    return cloneDefaults();
  }
}

export function saveSetupSettings(settings: SetupSettingsInput): SetupSettings {
  const normalized = normalizeSetup(settings);

  try {
    globalThis.localStorage?.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...normalized, selectedModelExplicit: true }),
    );
  } catch {
    // Browser storage can be unavailable in private mode or when disabled.
  }

  return normalized;
}

function normalizeSetup(settings: SetupSettingsInput): SetupSettings {
  const customModels = normalizeModelRoutes(settings.customModels);
  const gatewayBaseUrl = normalizeGatewayBaseUrl(settings.gatewayBaseUrl);
  const customGatewayBaseUrl = normalizeGatewayBaseUrl(settings.customGatewayBaseUrl) || gatewayBaseUrl;
  const apiKey = settings.apiKey?.trim() ?? '';
  const selectedModel = settings.selectedModel?.trim() ?? '';
  const availableRoutes = new Set([
    ...MODEL_OPTIONS.map((option) => option.route),
    ...customModels,
  ]);

  return {
    gatewayBaseUrl,
    customGatewayBaseUrl,
    apiKey,
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
    customGatewayBaseUrl: DEFAULT_SETUP_SETTINGS.customGatewayBaseUrl,
    apiKey: DEFAULT_SETUP_SETTINGS.apiKey,
    customModels: [...DEFAULT_SETUP_SETTINGS.customModels],
    selectedModel: DEFAULT_SETUP_SETTINGS.selectedModel,
  };
}
