(function initStorage() {
  const KEYS = {
    token: "osp_token",
    user: "osp_user",
    currentProduct: "osp_current_product"
  };

  function saveAuth(token, user) {
    localStorage.setItem(KEYS.token, token || "");
    localStorage.setItem(KEYS.user, JSON.stringify(user || {}));
  }

  function getToken() {
    return localStorage.getItem(KEYS.token) || "";
  }

  function getUser() {
    const raw = localStorage.getItem(KEYS.user);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function clearAuth() {
    localStorage.removeItem(KEYS.token);
    localStorage.removeItem(KEYS.user);
  }

  function saveCurrentProduct(productId) {
    if (!productId) return;
    localStorage.setItem(KEYS.currentProduct, productId);
  }

  function getCurrentProduct() {
    return localStorage.getItem(KEYS.currentProduct) || window.APP_CONFIG.DEFAULT_PRODUCT_ID;
  }

  window.SiteStorage = {
    saveAuth,
    getToken,
    getUser,
    clearAuth,
    saveCurrentProduct,
    getCurrentProduct
  };
})();
