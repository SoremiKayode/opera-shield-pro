(function () {
  let pickerEnabled = false;
  let hoverBox = null;
  let infoBox = null;
  let currentTarget = null;
  let mutationObserver = null;

  function send(message) {
    try { chrome.runtime.sendMessage(message, () => void chrome.runtime.lastError); } catch {}
  }

  function uniqueSelector(el) {
    if (!(el instanceof Element)) return '';
    if (el.id) return '#' + CSS.escape(el.id);
    const parts = [];
    let node = el;
    while (node && node.nodeType === 1 && parts.length < 4) {
      let part = node.tagName.toLowerCase();
      const classes = Array.from(node.classList || []).filter(Boolean).slice(0, 2);
      if (classes.length) part += '.' + classes.map(v => CSS.escape(v)).join('.');
      const parent = node.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter(child => child.tagName === node.tagName);
        if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(node) + 1})`;
      }
      parts.unshift(part);
      node = node.parentElement;
    }
    return parts.join(' > ');
  }

  function ensurePickerUi() {
    if (!hoverBox) {
      hoverBox = document.createElement('div');
      hoverBox.id = 'osp-picker-hover';
      hoverBox.style.cssText = 'position:fixed;z-index:2147483646;border:2px solid #5b3df5;background:rgba(91,61,245,0.12);pointer-events:none;display:none;';
      document.documentElement.appendChild(hoverBox);
    }
    if (!infoBox) {
      infoBox = document.createElement('div');
      infoBox.id = 'osp-picker-info';
      infoBox.style.cssText = 'position:fixed;z-index:2147483647;left:16px;bottom:16px;max-width:420px;background:#111827;color:#fff;padding:10px 12px;border-radius:12px;font:12px/1.4 system-ui,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.35);display:none;';
      document.documentElement.appendChild(infoBox);
    }
  }

  function showHover(target) {
    if (!pickerEnabled || !(target instanceof Element)) return;
    ensurePickerUi();
    const rect = target.getBoundingClientRect();
    hoverBox.style.display = 'block';
    hoverBox.style.top = rect.top + 'px';
    hoverBox.style.left = rect.left + 'px';
    hoverBox.style.width = rect.width + 'px';
    hoverBox.style.height = rect.height + 'px';
    infoBox.style.display = 'block';
    infoBox.textContent = 'Click to hide: ' + uniqueSelector(target) + '  |  Esc to cancel';
  }

  function stopPicker() {
    pickerEnabled = false;
    currentTarget = null;
    if (hoverBox) hoverBox.style.display = 'none';
    if (infoBox) infoBox.style.display = 'none';
  }

  function onMouseMove(event) {
    if (!pickerEnabled) return;
    currentTarget = event.target;
    showHover(currentTarget);
  }

  function onClick(event) {
    if (!pickerEnabled) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    const selector = uniqueSelector(event.target);
    if (selector) {
      send({ type: 'ELEMENT_PICKED', selector, pageUrl: location.href });
      injectSelector(selector);
    }
    stopPicker();
  }

  function onKeyDown(event) {
    if (event.key === 'Escape' && pickerEnabled) {
      send({ type: 'CANCEL_ELEMENT_PICKER', tabId: -1 });
      stopPicker();
    }
  }

  function injectSelector(selector) {
    let style = document.getElementById('osp-cosmetic-style');
    if (!style) {
      style = document.createElement('style');
      style.id = 'osp-cosmetic-style';
      (document.head || document.documentElement).appendChild(style);
    }
    const existing = style.textContent ? style.textContent + '\n' : '';
    style.textContent = existing + selector + '{display:none !important;visibility:hidden !important;}';
  }

  function applySelectors(selectors) {
    if (!selectors || !selectors.length) return;
    const css = Array.from(new Set(selectors.filter(Boolean))).join(',\n');
    if (!css) return;
    let style = document.getElementById('osp-cosmetic-style');
    if (!style) {
      style = document.createElement('style');
      style.id = 'osp-cosmetic-style';
      (document.head || document.documentElement).appendChild(style);
    }
    style.textContent = css + '{display:none !important;visibility:hidden !important;}';
  }

  function removeOverlayLikeElements() {
    const selectors = [
      '[class*="overlay"]',
      '[id*="overlay"]',
      '[class*="modal"]',
      '[id*="modal"]',
      '[class*="popup"]',
      '[id*="popup"]',
      '[class*="newsletter"]',
      '[data-ad]'
    ];
    document.querySelectorAll(selectors.join(',')).forEach(el => {
      if (!(el instanceof HTMLElement)) return;
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      const isLarge = rect.width > Math.min(window.innerWidth * 0.3, 280) && rect.height > 90;
      const isBlocking = style.position === 'fixed' || style.position === 'sticky' || Number(style.zIndex) >= 999;
      if (isLarge && isBlocking) el.style.setProperty('display', 'none', 'important');
    });
    document.documentElement.style.removeProperty('overflow');
    if (document.body) document.body.style.removeProperty('overflow');
  }

  function removeStickyBanners() {
    document.querySelectorAll('[class*="sticky"], [class*="banner"], [id*="sticky"], [id*="banner"]').forEach(el => {
      if (!(el instanceof HTMLElement)) return;
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      if ((style.position === 'fixed' || style.position === 'sticky') && rect.height > 60 && rect.width > window.innerWidth * 0.45) {
        el.style.setProperty('display', 'none', 'important');
      }
    });
  }

  function removeInlinePopups() {
    document.querySelectorAll('iframe[src*="ad"], iframe[src*="doubleclick"], [class*="sponsor"], [class*="advert"]').forEach(el => {
      if (el instanceof HTMLElement) el.style.setProperty('display', 'none', 'important');
    });
  }

  function runScriptlets(scriptlets) {
    (scriptlets || []).forEach(item => {
      if (item.name === 'overlay-buster') removeOverlayLikeElements();
      else if (item.name === 'sticky-banner-buster') removeStickyBanners();
      else if (item.name === 'remove-inpage-popups') removeInlinePopups();
      else if (item.name === 'custom' && item.body) {
        try { new Function(item.body)(); } catch {}
      }
    });
  }

  function startObserver() {
    if (mutationObserver) return;
    mutationObserver = new MutationObserver(() => {
      removeOverlayLikeElements();
      removeStickyBanners();
      removeInlinePopups();
    });
    mutationObserver.observe(document.documentElement, { childList: true, subtree: true });
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'ELEMENT_PICKER_MODE') {
      pickerEnabled = !!message.enabled;
      if (pickerEnabled) ensurePickerUi();
      else stopPicker();
      sendResponse({ ok: true });
      return;
    }
  });

  document.addEventListener('mousemove', onMouseMove, true);
  document.addEventListener('click', onClick, true);
  document.addEventListener('keydown', onKeyDown, true);

  chrome.runtime.sendMessage({ type: 'GET_CONTENT_CONFIG', pageUrl: location.href }, response => {
    const data = response && response.data;
    if (!data || !data.enabled || data.allowlisted) return;
    if (data.cosmeticBlockingEnabled) applySelectors(data.selectors || []);
    if (data.scriptletsEnabled) {
      const run = () => {
        runScriptlets(data.scriptlets || []);
        startObserver();
      };
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, { once: true });
      else run();
    }
    if (data.pickerEnabled) pickerEnabled = true;
  });
})();
