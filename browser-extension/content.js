(() => {
  if (window.__flowcapture_injected) return;
  window.__flowcapture_injected = true;

  function findInteractiveElement(el) {
    if (!el || el === document.body || el === document.documentElement) return el;
    const interactive = el.closest(
      'button, a, input, select, textarea, [role="button"], [role="link"], [role="menuitem"], [role="tab"], [role="checkbox"], [role="radio"], [role="switch"], [tabindex]:not([tabindex="-1"]), summary'
    );
    return interactive || el;
  }

  function getElementText(el) {
    if (!el) return '';
    // Priority 1: aria-label
    const ariaLabel = el.getAttribute('aria-label');
    if (ariaLabel && ariaLabel.trim()) return ariaLabel.trim();

    // Priority 2: title attribute
    const title = el.getAttribute('title');
    if (title && title.trim()) return title.trim();

    // Priority 3: placeholder
    const placeholder = el.getAttribute('placeholder');
    if (placeholder && placeholder.trim()) return placeholder.trim();

    // Priority 4: alt (images / svg icons)
    const alt = el.getAttribute('alt');
    if (alt && alt.trim()) return alt.trim();

    // Priority 5: value on buttons only. The value of text/password fields is what the
    // user typed, so it is never read.
    const inputType = (el.getAttribute('type') || '').toLowerCase();
    const isButtonLike =
      el.tagName === 'BUTTON' ||
      (el.tagName === 'INPUT' && ['button', 'submit', 'reset'].includes(inputType));
    if (isButtonLike && el.value && el.value.trim()) {
      return el.value.trim();
    }

    // Typed content of editable fields is never sent (e.g. textarea / contenteditable).
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable) {
      const label = el.labels && el.labels[0] && el.labels[0].innerText;
      if (label && label.trim()) return label.trim().replace(/\s+/g, ' ').slice(0, 100);
      const name = el.getAttribute('name');
      return name && name.trim() ? name.trim() : '';
    }

    // Priority 6: innerText or textContent
    const inner = (el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ');
    if (inner && inner.length <= 100) {
      return inner;
    } else if (inner && inner.length > 100) {
      return inner.slice(0, 97) + '...';
    }

    // Priority 7: name attribute
    const name = el.getAttribute('name');
    if (name && name.trim()) return name.trim();

    // Priority 8: id
    if (el.id && el.id.trim()) return el.id.trim();

    return '';
  }

  function getElementSelector(el) {
    if (!el || el === document.body || el === document.documentElement) return '';
    if (el.id) {
      return `#${CSS.escape(el.id)}`;
    }
    const tag = el.tagName.toLowerCase();
    const className = (typeof el.className === 'string' && el.className.trim())
      ? el.className.trim().split(/\s+/).filter(c => !c.includes(':') && c.length < 30).slice(0, 2).map(c => `.${CSS.escape(c)}`).join('')
      : '';
    return `${tag}${className}`;
  }

  window.addEventListener(
    'click',
    (event) => {
      try {
        const rawTarget = event.target;
        const target = findInteractiveElement(rawTarget);
        if (!target) return;

        const rect = target.getBoundingClientRect();
        const text = getElementText(target);
        const tag = target.tagName ? target.tagName.toUpperCase() : 'UNKNOWN';
        const inputType = target.getAttribute ? target.getAttribute('type') : null;
        const role = target.getAttribute ? target.getAttribute('role') : null;
        const selector = getElementSelector(target);
        const elementId = target.id || null;
        const name = target.getAttribute ? target.getAttribute('name') : null;

        const payload = {
          tag,
          text,
          input_type: inputType,
          role,
          url: window.location.href,
          page_title: document.title || window.location.hostname,
          selector,
          element_id: elementId,
          name,
          // CSS pixels; FlowCapture converts them to physical pixels with device_pixel_ratio
          // (Windows scaling at 125–150 % would otherwise shift every match).
          x: Math.round(typeof event.screenX === 'number' ? event.screenX : (event.clientX + window.screenX)),
          y: Math.round(typeof event.screenY === 'number' ? event.screenY : (event.clientY + window.screenY)),
          device_pixel_ratio: window.devicePixelRatio || 1,
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          timestamp_ms: Date.now()
        };

        // Send to background service worker
        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
          chrome.runtime.sendMessage({ type: 'FLOWCAPTURE_DOM_CLICK', data: payload }, () => {
            // Check for error in case extension reloaded
            if (chrome.runtime.lastError) {
              // Direct fallback fetch if background is sleeping
              sendDirect(payload);
            }
          });
        } else {
          sendDirect(payload);
        }
      } catch (err) {
        // Silently catch in content script
      }
    },
    true // Capture phase
  );

  function sendDirect(payload) {
    try {
      fetch('http://127.0.0.1:41789/browser-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        mode: 'cors'
      }).catch(() => {});
    } catch (_) {}
  }
})();
