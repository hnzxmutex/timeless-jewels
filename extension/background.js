// Timeless Jewel Preview - Background Service Worker
// Manages extension state, messaging, and shared preview tab lifecycle

// Default settings
const DEFAULT_SETTINGS = {
  enabled: true,
  baseUrl: 'https://hnzxmutex.github.io/timeless-jewels/tree',
  defaultLocation: undefined
};

// ==================== Preview Tab Management ====================

// Track the single preview tab
let previewTabId = null;

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
 * Open or reuse a single preview tab.
 *
 * - First time: create a new tab with full URL search params.
 * - Subsequent times: focus the existing tab and update only the URL hash.
 *   Changing the hash does NOT reload the page, preserving WASM state.
 *   The frontend listens for 'hashchange' and applies the new params instantly.
 */
async function openPreview(baseUrl, params, sendResponse) {
  try {
    // Check if existing preview tab is still alive
    if (previewTabId !== null) {
      try {
        const tab = await chrome.tabs.get(previewTabId);
        // Tab exists — focus it and update only the hash (no page reload)
        const currentUrl = new URL(tab.url);
        const newUrl = currentUrl.origin + currentUrl.pathname + currentUrl.search + buildHash(params);
        await chrome.tabs.update(tab.id, { active: true, url: newUrl });
        await chrome.windows.update(tab.windowId, { focused: true });
        sendResponse({ success: true, tabId: tab.id, reused: true });
        return;
      } catch (e) {
        // Tab was closed — reset and create a new one
        previewTabId = null;
      }
    }

    // First time — create a new tab with full URL params
    const tab = await chrome.tabs.create({ url: buildPreviewUrl(baseUrl, params), active: true });
    previewTabId = tab.id;
    sendResponse({ success: true, tabId: tab.id, reused: false });
  } catch (err) {
    console.error('[Timeless Jewels] Failed to open preview tab:', err);
    sendResponse({ success: false, error: err.message });
  }
}

// Clean up previewTabId when the tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId === previewTabId) {
    previewTabId = null;
  }
});

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

