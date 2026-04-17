(function initPluginBridge() {
  function sanitizeText(value) {
    return String(value || "").replace(/[^a-zA-Z0-9_:\-./]/g, "");
  }

  function sanitizeRelativePath(value) {
    const candidate = String(value || "").trim();
    if (!candidate) return "";
    if (candidate.startsWith("http://") || candidate.startsWith("https://") || candidate.startsWith("//")) {
      return "";
    }
    return candidate.replace(/[^a-zA-Z0-9_:\-./?=&%]/g, "");
  }

  function getIntegrationContext() {
    const params = new URLSearchParams(window.location.search);
    const productId = sanitizeText(params.get("productId")) || window.APP_CONFIG.DEFAULT_PRODUCT_ID;
    const nextParam = params.get("next") || params.get("returnTo");

    return {
      source: sanitizeText(params.get("source")),
      extensionId: sanitizeText(params.get("extensionId")),
      productId,
      next: sanitizeRelativePath(nextParam)
    };
  }

  function canTalkToExtension(extensionId) {
    return Boolean(extensionId && window.chrome?.runtime?.sendMessage);
  }

  function renderManualSyncCode(code, mountSelector = "#bridge-status") {
    const mount = document.querySelector(mountSelector);
    if (!mount) return;

    mount.innerHTML = `
      <div class="bridge-fallback">
        <p>Automatic extension sync is unavailable.</p>
        <p><strong>Manual Sync Code:</strong> <code id="manual-sync-code">${code}</code></p>
        <button id="copy-sync-code" type="button">Copy Sync Code</button>
      </div>
    `;

    const copyBtn = document.getElementById("copy-sync-code");
    copyBtn?.addEventListener("click", async () => {
      const codeEl = document.getElementById("manual-sync-code");
      const value = codeEl?.textContent || "";
      await navigator.clipboard.writeText(value);
      copyBtn.textContent = "Copied";
    });
  }

  function sendMessageToExtension(extensionId, payload) {
    return new Promise((resolve, reject) => {
      if (!canTalkToExtension(extensionId)) {
        reject(new Error("Extension messaging unavailable"));
        return;
      }

      window.chrome.runtime.sendMessage(extensionId, payload, (response) => {
        const lastError = window.chrome.runtime.lastError;
        if (lastError) {
          reject(lastError);
          return;
        }
        if (!response?.ok) {
          reject(new Error(response?.error || "Extension rejected message"));
          return;
        }
        resolve(response);
      });
    });
  }

  async function syncAuthToExtension(productId, extensionId) {
    const result = await window.AuthApi.createExtensionExchangeCode(productId);

    try {
      await sendMessageToExtension(extensionId, {
        type: "AUTH_EXCHANGE_CODE",
        exchangeCode: result.exchangeCode,
        productId
      });
      return { synced: true };
    } catch (error) {
      renderManualSyncCode(result.exchangeCode);
      return { synced: false, fallback: true, error: String(error) };
    }
  }

  async function syncAccessToExtension(productId, extensionId) {
    try {
      await sendMessageToExtension(extensionId, {
        type: "ACCESS_REFRESH",
        productId
      });
      return { synced: true };
    } catch (error) {
      return { synced: false, error: String(error) };
    }
  }

  window.PluginBridge = {
    getIntegrationContext,
    canTalkToExtension,
    sendMessageToExtension,
    syncAuthToExtension,
    syncAccessToExtension,
    renderManualSyncCode
  };
})();
