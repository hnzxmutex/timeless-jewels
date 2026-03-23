// Timeless Jewel Preview - Popup Script

document.addEventListener('DOMContentLoaded', () => {
  const baseUrlInput = document.getElementById('baseUrl');
  const defaultLocationInput = document.getElementById('defaultLocation');
  const enabledCheckbox = document.getElementById('enabled');
  const saveBtn = document.getElementById('saveBtn');
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');

  // Load current settings
  chrome.runtime.sendMessage({ type: 'get-settings' }, (settings) => {
    if (settings) {
      baseUrlInput.value = settings.baseUrl || '';
      defaultLocationInput.value = settings.defaultLocation || '';
      enabledCheckbox.checked = settings.enabled !== false;
      updateStatus(settings.enabled !== false);
    }
  });

  // Save settings
  saveBtn.addEventListener('click', () => {
    const settings = {
      enabled: enabledCheckbox.checked,
      baseUrl: baseUrlInput.value.trim() || 'http://localhost:5173/timeless-jewels/tree',
      defaultLocation: defaultLocationInput.value ? parseInt(defaultLocationInput.value) : undefined
    };

    chrome.runtime.sendMessage({ type: 'save-settings', settings }, (response) => {
      if (response?.success) {
        saveBtn.textContent = '✓ Saved!';
        saveBtn.classList.add('saved');
        updateStatus(settings.enabled);

        setTimeout(() => {
          saveBtn.textContent = 'Save Settings';
          saveBtn.classList.remove('saved');
        }, 1500);
      }
    });
  });

  // Toggle quick update
  enabledCheckbox.addEventListener('change', () => {
    updateStatus(enabledCheckbox.checked);
  });

  function updateStatus(enabled) {
    if (enabled) {
      statusDot.classList.add('active');
      statusText.textContent = 'Active — watching for timeless jewels';
    } else {
      statusDot.classList.remove('active');
      statusText.textContent = 'Disabled';
    }
  }
});
