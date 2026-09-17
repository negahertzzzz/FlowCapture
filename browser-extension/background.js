const BRIDGE_URL = 'http://127.0.0.1:41789';

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && message.type === 'FLOWCAPTURE_DOM_CLICK') {
    fetch(`${BRIDGE_URL}/browser-event`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(message.data)
    })
      .then((res) => res.json())
      .then((data) => sendResponse({ success: true, data }))
      .catch((err) => sendResponse({ success: false, error: err.message }));

    return true; // Keep message channel open for async response
  }

  if (message && message.type === 'FLOWCAPTURE_CHECK_STATUS') {
    fetch(`${BRIDGE_URL}/health`, { method: 'GET' })
      .then((res) => res.json())
      .then((data) => sendResponse({ connected: true, data }))
      .catch(() => sendResponse({ connected: false }));

    return true;
  }
});
