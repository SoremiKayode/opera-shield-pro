# Support Site Auth/Payment Integration

This folder hosts the static support frontend for Opera Shield Pro, including login/signup, account status, premium upgrade, donation page, and extension sync.

## Production URLs

- API base: `https://api.codesignite.com/api`
- Site base: `https://addblocker.codesignite.com`
- Default product ID: `opera_shield_pro_premium`

Configured in `support-site/js/config.js`.

## Required Query Params

Supported by `auth.html`, `account.html`, `upgrade.html`, and `payment-success.html`:

- `source=extension` (optional): Indicates extension-hosted flow.
- `extensionId=<extension_id>` (optional): Target extension for external messaging.
- `productId=<product_id>` (optional): Defaults to `opera_shield_pro_premium`.
- `next=<relative_path>` or `returnTo=<relative_path>` (optional): Redirect destination after auth.

Example:

`https://addblocker.codesignite.com/auth.html?source=extension&extensionId=<EXTENSION_ID>&productId=opera_shield_pro_premium`

## Payment Flow Notes

- `upgrade.html` is the premium purchase flow (backend-driven create/capture order).
- `paypal.html` is donation-only support (hosted button), not premium entitlement.

## Required Backend Endpoints

All endpoints are relative to `https://api.codesignite.com/api`:

- `POST /auth/signup`
- `POST /auth/login`
- `POST /auth/social-login`
- `GET /auth/me`
- `POST /auth/logout`
- `POST /auth/exchange-code/create`
- `POST /auth/exchange-code/consume`
- `GET /products/:id`
- `GET /payments/check-access`
- `POST /payments/paypal/create-order`
- `POST /payments/paypal/capture-order`
- `GET /payments/history`

## Extension Manifest Change

Add support-site origin to `externally_connectable`:

```json
{
  "externally_connectable": {
    "matches": [
      "https://addblocker.codesignite.com/*"
    ]
  }
}
```

Also implement `chrome.runtime.onMessageExternal` handlers for:

- `AUTH_EXCHANGE_CODE`
- `ACCESS_REFRESH`

## Local Dev Override (Optional)

`js/config.js` supports runtime override via `window.__APP_CONFIG_OVERRIDES` before scripts initialize. Example:

```html
<script>
  window.__APP_CONFIG_OVERRIDES = {
    API_BASE_URL: "http://localhost:5000/api",
    SITE_BASE_URL: "http://localhost:8080/support-site",
    PAYPAL_CLIENT_ID: "<sandbox_public_client_id>"
  };
</script>
```

## Testing Steps

1. Open `https://addblocker.codesignite.com/auth.html` and verify login/signup/social login.
2. Open `https://addblocker.codesignite.com/account.html` and verify profile + access state.
3. Open `https://addblocker.codesignite.com/upgrade.html` and verify product load + PayPal create/capture.
4. Open extension context flow:
   `https://addblocker.codesignite.com/auth.html?source=extension&extensionId=<id>&productId=opera_shield_pro_premium`
5. Verify fallback manual sync code appears when extension messaging is unavailable.
6. Verify no stale endpoints remain (`localhost`, raw EC2 IP, `yourdomain` placeholders).
