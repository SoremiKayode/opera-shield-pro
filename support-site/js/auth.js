(function initAuth() {
  function normalizeAuthPayload(result) {
    const payload = result?.data || result;
    return {
      ...payload,
      token: payload?.token || "",
      user: payload?.user || payload?.data?.user || null
    };
  }

  async function signup(name, email, password) {
    const result = await window.apiRequest("/auth/signup", "POST", { name, email, password });
    return normalizeAuthPayload(result);
  }

  async function login(email, password, productId) {
    const result = await window.apiRequest("/auth/login", "POST", { email, password, productId });
    return normalizeAuthPayload(result);
  }

  async function socialLogin(provider, idToken, productId) {
    const result = await window.apiRequest("/auth/social-login", "POST", { provider, idToken, productId });
    return normalizeAuthPayload(result);
  }

  async function initiateSocialLogin(provider, context = {}) {
    return window.apiRequest("/auth/social-login/initiate", "POST", {
      provider,
      productId: context.productId,
      source: context.source,
      extensionId: context.extensionId,
      next: context.next
    });
  }

  async function getMe() {
    return window.apiRequest("/auth/me", "GET", null, true);
  }

  async function logout() {
    try {
      await window.apiRequest("/auth/logout", "POST", {}, true);
    } finally {
      window.SiteStorage.clearAuth();
    }
  }

  async function createExtensionExchangeCode(productId) {
    return window.apiRequest(
      "/auth/exchange-code/create",
      "POST",
      { productId, target: "extension" },
      true
    );
  }

  window.AuthApi = {
    signup,
    login,
    socialLogin,
    initiateSocialLogin,
    getMe,
    logout,
    createExtensionExchangeCode
  };
})();
