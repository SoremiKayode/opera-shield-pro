(function initAppConfig() {
  const DEFAULTS = {
    API_BASE_URL: "https://api.codesignite.com/api",
    SITE_BASE_URL: "https://addblocker.codesignite.com",
    DEFAULT_PRODUCT_ID: "opera_shield_pro_premium",
    PAYPAL_CLIENT_ID: ""
  };

  const runtimeOverrides = window.__APP_CONFIG_OVERRIDES || {};

  window.APP_CONFIG = {
    ...DEFAULTS,
    ...runtimeOverrides
  };

  window.buildSiteUrl = function buildSiteUrl(path = "") {
    const normalizedPath = String(path || "").replace(/^\/+/, "");
    return `${window.APP_CONFIG.SITE_BASE_URL}/${normalizedPath}`;
  };
})();
