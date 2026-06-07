import { STORAGE_ERROR_EVENT } from "../utils/helpers";

const HIDDEN_PROMPTS_KEY = "novelsmith-hidden-prompts";
const OVERRIDE_PROMPTS_KEY = "novelsmith-override-prompts";

// Load list of hidden built-in prompt IDs
export function loadHiddenPromptIds(): string[] {
  try {
    const raw = localStorage.getItem(HIDDEN_PROMPTS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as string[];
  } catch {
    return [];
  }
}

export function saveHiddenPromptIds(ids: string[]) {
  try {
    localStorage.setItem(HIDDEN_PROMPTS_KEY, JSON.stringify(ids));
  } catch (error) {
    console.error("Novelsmith hidden prompts write failed:", error);
    window.dispatchEvent(new CustomEvent(STORAGE_ERROR_EVENT, { detail: { key: HIDDEN_PROMPTS_KEY } }));
  }
}

// Load override prompts (custom prompts that override built-in ones by same ID)
export function loadOverridePrompts() {
  try {
    const raw = localStorage.getItem(OVERRIDE_PROMPTS_KEY);
    if (!raw) return [] as Array<{ id: string; title: string; category: string; description: string; content: string }>;
    return JSON.parse(raw) as Array<{ id: string; title: string; category: string; description: string; content: string }>;
  } catch {
    return [];
  }
}

export function saveOverridePrompts(overrides: Array<{ id: string; title: string; category: string; description: string; content: string }>) {
  try {
    localStorage.setItem(OVERRIDE_PROMPTS_KEY, JSON.stringify(overrides));
  } catch (error) {
    console.error("Novelsmith override prompts write failed:", error);
    window.dispatchEvent(new CustomEvent(STORAGE_ERROR_EVENT, { detail: { key: OVERRIDE_PROMPTS_KEY } }));
  }
}

// Reset all prompt customizations (hidden + overrides)
export function resetAllPromptDefaults() {
  localStorage.removeItem(HIDDEN_PROMPTS_KEY);
  localStorage.removeItem(OVERRIDE_PROMPTS_KEY);
}
