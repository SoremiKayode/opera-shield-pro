(function initApi() {
  const PROTECTED_PAGES = ["/account.html", "/upgrade.html"];

  async function apiRequest(path, method = "GET", body = null, auth = false) {
    const headers = { "Content-Type": "application/json" };
    const token = window.SiteStorage.getToken();

    if (auth && token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(`${window.APP_CONFIG.API_BASE_URL}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined
    });

    const data = await response.json().catch(() => ({}));

    if (response.status === 401) {
      window.SiteStorage.clearAuth();
      const currentPath = window.location.pathname;
      if (PROTECTED_PAGES.some((page) => currentPath.endsWith(page))) {
        const next = encodeURIComponent(window.location.pathname + window.location.search);
        window.location.href = `auth.html?next=${next}`;
      }
    }

    if (!response.ok) {
      throw new Error(data.message || `API request failed: ${response.status}`);
    }

    return data;
  }

  window.apiRequest = apiRequest;
})();
