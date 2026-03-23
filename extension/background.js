// Timeless Jewel Preview - Background Service Worker
// Manages extension state, messaging, and shared preview tab lifecycle

// Default settings
const DEFAULT_SETTINGS = {
  enabled: true,
  baseUrl: 'https://hnzxmutex.github.io/timeless-jewels/tree',
  defaultLocation: undefined
};

// ==================== Preview Tab Management ====================

/**
 * Build a hash string from params for updating an existing tab.
 * Using hash (#) instead of search params (?) avoids page reload.
 * The SvelteKit page listens for 'hashchange' and applies the new params.
 */
function buildHash(params) {
  const parts = [];
  if (params.jewel !== undefined) parts.push(`jewel=${params.jewel}`);
  if (params.conqueror !== undefined) parts.push(`conqueror=${encodeURIComponent(params.conqueror)}`);
  if (params.seed !== undefined) parts.push(`seed=${params.seed}`);
  if (params.location !== undefined) parts.push(`location=${params.location}`);
  return '#' + parts.join('&');
}

/**
 * Build the full preview URL with search params (for first-time tab creation).
 */
function buildPreviewUrl(baseUrl, params) {
  const url = new URL(baseUrl);
  if (params.jewel !== undefined) url.searchParams.set('jewel', params.jewel);
  if (params.conqueror !== undefined) url.searchParams.set('conqueror', params.conqueror);
  if (params.seed !== undefined) url.searchParams.set('seed', params.seed);
  if (params.location !== undefined) url.searchParams.set('location', params.location);
  url.searchParams.set('mode', 'seed');
  return url.toString();
}

/**
 * Find an existing preview tab by URL matching.
 * Works across Service Worker restarts, tab merges, and manual opens.
 * Returns the most recently accessed matching tab, or null.
 */
async function findPreviewTab(baseUrl) {
  // Build a match pattern: e.g. "https://hnzxmutex.github.io/timeless-jewels/tree*"
  const url = new URL(baseUrl);
  const matchPattern = url.origin + url.pathname + '*';
  const tabs = await chrome.tabs.query({ url: matchPattern });
  if (tabs.length === 0) return null;
  // Prefer the most recently accessed tab if multiple exist
  tabs.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0));
  return tabs[0];
}

/**
 * Open or reuse a single preview tab.
 *
 * Uses URL-based tab discovery instead of in-memory tab ID tracking.
 * This survives Service Worker restarts, tab group merges, and even
 * tabs the user opened manually.
 *
 * - If a matching tab exists: focus it and update only the URL hash (no reload).
 * - Otherwise: create a new tab with full URL search params.
 */
async function openPreview(baseUrl, params, sendResponse) {
  try {
    const existing = await findPreviewTab(baseUrl);
    if (existing) {
      // Tab exists — focus it and update only the hash (no page reload)
      const currentUrl = new URL(existing.url);
      const newUrl = currentUrl.origin + currentUrl.pathname + currentUrl.search + buildHash(params);
      await chrome.tabs.update(existing.id, { active: true, url: newUrl });
      await chrome.windows.update(existing.windowId, { focused: true });
      sendResponse({ success: true, tabId: existing.id, reused: true });
      return;
    }

    // No matching tab — create a new one
    const tab = await chrome.tabs.create({ url: buildPreviewUrl(baseUrl, params), active: true });
    sendResponse({ success: true, tabId: tab.id, reused: false });
  } catch (err) {
    console.error('[Timeless Jewels] Failed to open preview tab:', err);
    sendResponse({ success: false, error: err.message });
  }
}

// ==================== Settings ====================

// Initialize default settings on install
chrome.runtime.onInstalled.addListener(async () => {
  const stored = await chrome.storage.sync.get('settings');
  if (!stored.settings) {
    await chrome.storage.sync.set({ settings: DEFAULT_SETTINGS });
  } else {
    // Migrate: if baseUrl still points to old addresses, update to new GitHub Pages
    if (stored.settings.baseUrl === 'https://vilsol.github.io/timeless-jewels/tree'
        || stored.settings.baseUrl === 'http://localhost:5173/timeless-jewels/tree') {
      stored.settings.baseUrl = DEFAULT_SETTINGS.baseUrl;
      await chrome.storage.sync.set({ settings: stored.settings });
      console.log('[Timeless Jewels] Migrated baseUrl to new GitHub Pages');
    }
  }
});

// ==================== Message Router ====================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'get-settings') {
    chrome.storage.sync.get('settings').then((result) => {
      sendResponse(result.settings || DEFAULT_SETTINGS);
    });
    return true; // Keep channel open for async response
  }

  if (message.type === 'save-settings') {
    chrome.storage.sync.set({ settings: message.settings }).then(() => {
      sendResponse({ success: true });
      // Notify all content scripts of settings change
      chrome.tabs.query({ url: ['*://www.pathofexile.com/trade/*', '*://pathofexile.com/trade/*', '*://poe.game.qq.com/trade/*'] }, (tabs) => {
        tabs.forEach((tab) => {
          chrome.tabs.sendMessage(tab.id, { type: 'settings-updated', settings: message.settings });
        });
      });
    });
    return true;
  }

  if (message.type === 'open-preview') {
    openPreview(message.baseUrl, message.params, sendResponse);
    return true; // async
  }
});

