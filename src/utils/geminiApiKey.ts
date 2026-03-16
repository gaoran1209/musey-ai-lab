export const GEMINI_API_KEY_STORAGE_KEY = 'gemini_api_key';

export function getStoredGeminiApiKey() {
  if (typeof window === 'undefined') {
    return '';
  }

  return localStorage.getItem(GEMINI_API_KEY_STORAGE_KEY)?.trim() || '';
}

export function setStoredGeminiApiKey(apiKey: string) {
  const nextKey = apiKey.trim();

  if (!nextKey) {
    localStorage.removeItem(GEMINI_API_KEY_STORAGE_KEY);
    return '';
  }

  localStorage.setItem(GEMINI_API_KEY_STORAGE_KEY, nextKey);
  return nextKey;
}
