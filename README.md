# Opera Shield Pro

Opera Shield Pro is a privacy-first blocker extension focused on fast page loads, fewer tracking requests, and less on-page visual noise.

## What’s in this repository

- Core extension source (current package).
- Hosted support website source under `support-site/` (GitHub Pages ready).
- Chrome Web Store listing copy and submission assets checklist under `store/`.

## Local extension loading (Opera)

1. Open `opera://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select this repository folder.

## Hosted support website deployment

This repo includes a GitHub Pages workflow at `.github/workflows/pages.yml`.

1. Push to your GitHub repository.
2. In GitHub, go to **Settings → Pages**.
3. Set source to **GitHub Actions**.
4. Run the `Deploy support site to GitHub Pages` workflow.

The site publishes from `support-site/` and includes:

- Support landing page
- Setup instructions
- FAQ
- Contact/support form mailto link
- Privacy policy page


## Packaged download artifact

The support page uses a placeholder zip URL (`https://example.com/opera-shield-pro-extension.zip`). Replace it with your final hosted artifact URL (for example, a GitHub Release asset) before submission.

## Chrome Web Store preparation

Use these files before submission:

- `store/chrome-web-store-listing.md`
- `store/submission-checklist.md`

They contain optimized copy, metadata, assets guidance, and policy notes for listing quality.

## Important compatibility note

Current extension code is Manifest V2 style. Chrome Web Store requires Manifest V3 for new submissions. Use the checklist to plan MV3 migration before upload.
