(function initPayments() {
  function getProduct(productId) {
    return window.apiRequest(`/products/${encodeURIComponent(productId)}`);
  }

  function checkAccess(userId, productId) {
    const query = `userId=${encodeURIComponent(userId)}&productId=${encodeURIComponent(productId)}`;
    return window.apiRequest(`/payments/check-access?${query}`, "GET", null, true);
  }

  function createPaypalOrder(productId) {
    return window.apiRequest("/payments/paypal/create-order", "POST", { productId }, true);
  }

  function capturePaypalOrder(productId, orderId) {
    return window.apiRequest("/payments/paypal/capture-order", "POST", { productId, orderId }, true);
  }

  function getPaymentHistory() {
    return window.apiRequest("/payments/history", "GET", null, true);
  }

  window.PaymentApi = {
    getProduct,
    checkAccess,
    createPaypalOrder,
    capturePaypalOrder,
    getPaymentHistory
  };
})();
