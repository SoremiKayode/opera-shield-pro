# Support Site Auth/Payment Integration

This folder now hosts login, signup, account management, and premium purchase pages for Opera Shield Pro support-site.

## Required Query Params

Supported by `auth.html`, `account.html`, `upgrade.html`, and `payment-success.html`:

- `source=extension` (optional): Indicates extension-hosted flow.
- `extensionId=<extension_id>` (optional): Target extension for external messaging.
- `productId=<product_id>` (optional): Defaults to `opera_shield_pro_premium`.
- `next=<relative_path>` (optional): Redirect destination after auth.

Example:

`auth.html?source=extension&extensionId=<EXTENSION_ID>&productId=opera_shield_pro_premium`

## Frontend Config Needed

Edit `js/config.js`:

- `API_BASE_URL`: Backend API base (`https://api.yourdomain.com/api`).
- `SITE_BASE_URL`: Hosted support-site URL.
- `DEFAULT_PRODUCT_ID`: Product ID used for default entitlement checks.
- `PAYPAL_CLIENT_ID`: Public PayPal client ID for checkout SDK.

## Required Backend Endpoints

- `POST /auth/signup`
- `POST /auth/login`
- `POST /auth/social-login`
- `GET /auth/me`
- `POST /auth/logout`
- `POST /auth/exchange-code/create`
- `GET /products/:id`
- `GET /payments/check-access`
- `POST /payments/paypal/create-order`
- `POST /payments/paypal/capture-order`
- `GET /payments/history`

All URLs above are relative to `API_BASE_URL`.

## Extension Manifest Change

Add support-site origin to `externally_connectable`:

```json
{
  "externally_connectable": {
    "matches": [
      "https://support.yourdomain.com/*"
    ]
  }
}
```

Also implement `chrome.runtime.onMessageExternal` handlers for:

- `AUTH_EXCHANGE_CODE`
- `ACCESS_REFRESH`

## Local Testing

1. Serve repo statically (for example `python3 -m http.server 8080`).
2. Open `support-site/auth.html` and test signup/login.
3. Open `support-site/account.html` and validate `/auth/me` + history.
4. Open `support-site/upgrade.html` and test create/capture order.
5. Open extension flow:
   `auth.html?source=extension&extensionId=<id>&productId=opera_shield_pro_premium`
6. Verify exchange code sync and fallback manual sync code.
