// Timeless Jewel Preview - Content Script
// Injected into POE trade pages (CN + Global) to detect timeless jewels and provide preview

(function () {
  'use strict';

  // ==================== Configuration ====================

  let settings = {
    enabled: true,
    baseUrl: 'https://hnzxmutex.github.io/timeless-jewels/tree',
    defaultLocation: undefined
  };

  // ==================== Conqueror ↔ Jewel Type Mapping ====================

  // Reverse mapping: conqueror lowercase name → { jewelType, displayName }
  // jewelType matches frontend WASM data.TimelessJewels IDs
  // MUST match all conquerors from Go source: data/jewels.go TimelessJewelConquerors
  const CONQUEROR_TO_JEWEL = {
    // Glorious Vanity (光辉的虚空) → type 1
    xibaqua:  { jewelType: 1, displayName: 'Xibaqua' },
    zerphi:   { jewelType: 1, displayName: 'Zerphi' },
    ahuana:   { jewelType: 1, displayName: 'Ahuana' },
    doryani:  { jewelType: 1, displayName: 'Doryani' },
    // Lethal Pride (致命的骄傲) → type 2
    kaom:     { jewelType: 2, displayName: 'Kaom' },
    rakiata:  { jewelType: 2, displayName: 'Rakiata' },
    kiloava:  { jewelType: 2, displayName: 'Kiloava' },
    akoya:    { jewelType: 2, displayName: 'Akoya' },
    // Brutal Restraint (残暴的约束) → type 3
    deshret:  { jewelType: 3, displayName: 'Deshret' },
    balbala:  { jewelType: 3, displayName: 'Balbala' },
    asenath:  { jewelType: 3, displayName: 'Asenath' },
    nasima:   { jewelType: 3, displayName: 'Nasima' },
    // Militant Faith (坚信的信仰) → type 4
    venarius: { jewelType: 4, displayName: 'Venarius' },
    maxarius: { jewelType: 4, displayName: 'Maxarius' },
    dominus:  { jewelType: 4, displayName: 'Dominus' },
    avarius:  { jewelType: 4, displayName: 'Avarius' },
    // Elegant Hubris (优雅的狂妄) → type 5
    cadiro:   { jewelType: 5, displayName: 'Cadiro' },
    victario: { jewelType: 5, displayName: 'Victario' },
    chitus:   { jewelType: 5, displayName: 'Chitus' },
    caspiro:  { jewelType: 5, displayName: 'Caspiro' },
    // Heroic Tragedy (英雄的悲剧) → type 6
    vorana:   { jewelType: 6, displayName: 'Vorana' },
    uhtred:   { jewelType: 6, displayName: 'Uhtred' },
    medved:   { jewelType: 6, displayName: 'Medved' }
  };

  // Jewel type ID → English name (for display)
  const JEWEL_NAMES = {
    1: 'Glorious Vanity',
    2: 'Lethal Pride',
    3: 'Brutal Restraint',
    4: 'Militant Faith',
    5: 'Elegant Hubris',
    6: 'Heroic Tragedy'
  };

  // ==================== State ====================

  let observer = null;

  // ==================== Settings ====================

  function loadSettings() {
    chrome.runtime.sendMessage({ type: 'get-settings' }, (response) => {
      if (response) {
        settings = { ...settings, ...response };
      }
      if (settings.enabled) {
        init();
      }
    });
  }

  // Listen for settings updates from popup
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'settings-updated') {
      settings = { ...settings, ...message.settings };
      if (settings.enabled) {
        init();
      } else {
        cleanup();
      }
    }
  });

  // ==================== Preview via Background (Shared Tab) ====================

  // Flow:
  //   1. content.js → background: open-preview (with params)
  //   2. background: if tab exists → focus + chrome.scripting.executeScript(postMessage)
  //      background: if tab new → chrome.tabs.create with URL params (first load)
  //   3. Preview page's handleMessage() picks up 'timeless-jewels-update' — no reload

  /**
   * Send preview request to background script, which will open/reuse a single
   * preview tab shared across all trade pages.
   */
  function showPreview(params) {
    chrome.runtime.sendMessage({
      type: 'open-preview',
      params: params,
      baseUrl: settings.baseUrl
    }, (response) => {
      if (response?.success) {
        console.log('[Timeless Jewels] Preview tab ready:', response.reused ? 'reused' : 'created');
      } else {
        console.warn('[Timeless Jewels] Failed to open preview:', response);
      }
    });
  }

  // ==================== Item Detection (data-field driven) ====================

  /**
   * Extract jewel info from a trade listing row using the data-field attribute.
   *
   * DOM structure (CN & Global share the same layout):
   *   .row[data-id]
   *     └─ .middle
   *          └─ .itemPopupContainer
   *               └─ .itemBoxContent
   *                    └─ .content
   *                         └─ .explicitMod
   *                              └─ span.lc.s[data-field="stat.explicit.pseudo_timeless_jewel_{conqueror}"]
   *                                   textContent contains the seed number
   *
   * @param {Element} row - A .row[data-id] element
   * @returns {{ jewelType: number, conqueror: string, seed: number, jewelName: string } | null}
   */
  function extractJewelInfo(row) {
    // Find the timeless jewel data-field span
    const tjSpan = row.querySelector('span[data-field*="pseudo_timeless_jewel_"]');
    if (!tjSpan) return null;

    const dataField = tjSpan.getAttribute('data-field');
    if (!dataField) return null;

    // Extract conqueror name from: "stat.explicit.pseudo_timeless_jewel_{conqueror}"
    const match = dataField.match(/pseudo_timeless_jewel_(\w+)$/);
    if (!match) return null;

    const conquerorLower = match[1].toLowerCase();
    const mapping = CONQUEROR_TO_JEWEL[conquerorLower];
    if (!mapping) return null;

    // Extract seed from the span text content
    // CN example: "用 24580 枚金币纪念维多里奥"  → 24580
    // EN example: "Commissioned 24580 coins..."   → 24580
    // The seed is a numeric value in the text (up to 160000 for Elegant Hubris)
    const text = tjSpan.textContent || '';
    const seedMatch = text.match(/(\d+)/);
    if (!seedMatch) return null;

    const seed = parseInt(seedMatch[1], 10);
    // Minimum seed across all jewel types is 100, maximum is 160000 (Elegant Hubris)
    if (seed < 100 || seed > 160000) return null;

    return {
      jewelType: mapping.jewelType,
      conqueror: mapping.displayName,
      seed: seed,
      jewelName: JEWEL_NAMES[mapping.jewelType]
    };
  }

  // ==================== DOM Injection ====================

  /**
   * Inject preview buttons into timeless jewel listings.
   * Scans all unprocessed .row[data-id] elements within .resultset.
   */
  function processItemListings() {
    // Also try broader selector in case .resultset is not the direct parent
    let rows = document.querySelectorAll('.resultset .row[data-id]:not([data-tj-processed])');
    if (rows.length === 0) {
      // Fallback: try matching .row[data-id] inside .results container
      rows = document.querySelectorAll('.results .row[data-id]:not([data-tj-processed])');
    }
    if (rows.length === 0) {
      // Last resort: any .row with data-id that has a timeless jewel span
      rows = document.querySelectorAll('.row[data-id]:not([data-tj-processed])');
    }

    console.log(`[Timeless Jewels] Processing ${rows.length} unprocessed rows`);

    rows.forEach((row) => {
      row.setAttribute('data-tj-processed', 'true');

      const info = extractJewelInfo(row);
      if (!info) {
        console.log('[Timeless Jewels] Row skipped (no jewel info):', row.getAttribute('data-id')?.substring(0, 8));
        return;
      }
      console.log(`[Timeless Jewels] Found: ${info.jewelName} — ${info.conqueror} seed ${info.seed}`);

      // Find .middle container for button injection
      const middleEl = row.querySelector('.middle');
      if (!middleEl) return;

      // Create button container div
      const btnWrapper = document.createElement('div');
      btnWrapper.className = 'tj-preview-wrapper';

      const btn = document.createElement('button');
      btn.className = 'tj-preview-btn';
      btn.innerHTML = `⏳ Preview <span class="tj-preview-detail">${info.conqueror} · ${info.seed}</span>`;
      btn.title = `Preview ${info.jewelName} — Seed: ${info.seed}, Conqueror: ${info.conqueror}`;

      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        showPreview({
          jewel: info.jewelType,
          conqueror: info.conqueror,
          seed: info.seed,
          location: settings.defaultLocation
        });
      });

      btnWrapper.appendChild(btn);

      // Insert after .itemPopupContainer (inside .middle)
      const itemPopup = middleEl.querySelector('.itemPopupContainer');
      if (itemPopup && itemPopup.nextSibling) {
        middleEl.insertBefore(btnWrapper, itemPopup.nextSibling);
      } else if (itemPopup) {
        middleEl.appendChild(btnWrapper);
      } else {
        // Fallback: append to .middle
        middleEl.appendChild(btnWrapper);
      }
    });
  }

  // ==================== MutationObserver ====================

  let debounceTimer = null;

  function startObserving() {
    if (observer) return;

    // Process any existing items on the page
    processItemListings();

    // Prefer observing .resultset if it exists, then .results, otherwise fall back to body
    const targetNode = document.querySelector('.resultset')
      || document.querySelector('.results')
      || document.body;
    console.log('[Timeless Jewels] Observer attached to:', targetNode.tagName, targetNode.className || '(body)');

    observer = new MutationObserver((mutations) => {
      let hasNewNodes = false;
      for (const mutation of mutations) {
        if (mutation.addedNodes.length > 0) {
          hasNewNodes = true;
          break;
        }
      }
      if (hasNewNodes) {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(processItemListings, 300);
      }
    });

    observer.observe(targetNode, {
      childList: true,
      subtree: true
    });

    // If we attached to body initially and .resultset/.results appears later,
    // re-attach to the more specific target
    if (targetNode === document.body) {
      const recheckTimer = setInterval(() => {
        const resultset = document.querySelector('.resultset') || document.querySelector('.results');
        if (resultset) {
          console.log('[Timeless Jewels] Found result container, re-attaching observer to:', resultset.className);
          clearInterval(recheckTimer);
          observer.disconnect();
          observer = null;
          startObserving();
        }
      }, 2000);

      // Stop rechecking after 60s
      setTimeout(() => clearInterval(recheckTimer), 60000);
    }
  }

  // ==================== Search Button Trigger ====================

  /**
   * Attach click listener to the search button to re-render preview buttons.
   * The search button refreshes the result list, so we need to re-process items.
   */
  function attachSearchButtonListener() {
    const searchBtn = document.querySelector('.controls .search-btn');
    if (searchBtn && !searchBtn.hasAttribute('data-tj-listener')) {
      searchBtn.setAttribute('data-tj-listener', 'true');
      searchBtn.addEventListener('click', () => {
        console.log('[Timeless Jewels] Search button clicked, re-processing listings...');
        // Clear processed flags to allow re-injection
        document.querySelectorAll('[data-tj-processed]').forEach((el) => {
          el.removeAttribute('data-tj-processed');
        });
        // Wait for new results to load, then re-process
        setTimeout(processItemListings, 500);
      });
      console.log('[Timeless Jewels] Search button listener attached');
    }
  }

  // ==================== Lifecycle ====================

  function init() {
    console.log('[Timeless Jewels] Extension initialized');
    startObserving();
    attachSearchButtonListener();
    
    // Re-attach search button listener if the button appears later
    const recheckSearchBtn = setInterval(() => {
      attachSearchButtonListener();
    }, 2000);
    
    // Stop rechecking after 60s
    setTimeout(() => clearInterval(recheckSearchBtn), 60000);
  }

  function cleanup() {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    clearTimeout(debounceTimer);
    // Remove all injected elements
    document.querySelectorAll('.tj-preview-wrapper').forEach((el) => el.remove());
    document.querySelectorAll('[data-tj-processed]').forEach((el) => {
      el.removeAttribute('data-tj-processed');
    });
  }

  // ==================== Bootstrap ====================

  loadSettings();
})();
