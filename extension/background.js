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
 * Open or reuse a single preview tab.
 *
 * - First time: create a new tab with full URL params so the page initializes correctly.
 * - Subsequent times: focus the existing tab and inject a postMessage via
 *   chrome.scripting.executeScript to update params WITHOUT reloading the page.
 *   This preserves WASM state, user settings, scroll position, etc.
 */
async function openPreview(baseUrl, params, sendResponse) {
  try {
    // Check if existing preview tab is still alive
    if (previewTabId !== null) {
      try {
        const tab = await chrome.tabs.get(previewTabId);
        // Tab exists — focus it
        await chrome.tabs.update(tab.id, { active: true });
        await chrome.windows.update(tab.windowId, { focused: true });

        // Inject a tiny script to postMessage the new params into the page
        // The SvelteKit page already listens for 'timeless-jewels-update' messages
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          world: 'MAIN',
          func: (p) => {
            window.postMessage({
              type: 'timeless-jewels-update',
              jewel: p.jewel,
              conqueror: p.conqueror,
              seed: p.seed,
              location: p.location
            }, '*');
          },
          args: [params]
        });

        sendResponse({ success: true, tabId: tab.id, reused: true });
        return;
      } catch (e) {
        // Tab was closed or scripting failed — reset and create a new one
        previewTabId = null;
      }
    }

    // First time — build URL with params so the page initializes correctly
    const url = new URL(baseUrl);
    if (params.jewel !== undefined) url.searchParams.set('jewel', params.jewel);
    if (params.conqueror !== undefined) url.searchParams.set('conqueror', params.conqueror);
    if (params.seed !== undefined) url.searchParams.set('seed', params.seed);
    if (params.location !== undefined) url.searchParams.set('location', params.location);
    url.searchParams.set('mode', 'seed');

    const tab = await chrome.tabs.create({ url: url.toString(), active: true });
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
    // Migrate: if baseUrl still points to the old GitHub Pages, update to new one
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

