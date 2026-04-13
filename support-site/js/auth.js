(function initAuth() {
  async function signup(name, email, password) {
    return window.apiRequest("/auth/signup", "POST", { name, email, password });
  }

  async function login(email, password, productId) {
    return window.apiRequest("/auth/login", "POST", { email, password, productId });
  }

  async function socialLogin(provider, idToken, productId) {
    return window.apiRequest("/auth/social-login", "POST", { provider, idToken, productId });
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
    getMe,
    logout,
    createExtensionExchangeCode
  };
})();
