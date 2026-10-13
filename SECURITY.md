# Security policy

## Reporting a vulnerability

Please report privately using GitHub's "Report a vulnerability" (Security tab of this repository). Do not open a public issue for security problems. Expect an acknowledgement within a few days; this is a volunteer project.

## Scope and design

- No server, no accounts, no telemetry. Holdings and settings stay in `chrome.storage`; see [PRIVACY.md](PRIVACY.md).
- Permissions are `storage`, `alarms`, four price-API hosts, and a content script on all pages that renders the strip and does not read page content.
- The optional Finnhub key is encrypted with AES-256-GCM (PBKDF2-SHA-256, 600,000 iterations); only derived unlock material is kept, in session storage readable by extension pages only.
- Extension-page CSP: `script-src 'self'`, restricted `connect-src`, `object-src`, `base-uri`, `form-action` and frames. Tests pin the CSP and the host list.
- Messages to the service worker are checked by sender; CSV import is size- and shape-capped.

## Dependencies

There are no runtime dependencies. Dev dependencies are pinned in `package-lock.json`; run `npm run audit:deps`.

## Known limitations

- Finnhub requires the key as a URL `token=` parameter. It is sent only to `https://finnhub.io`.
- The unlock code protects the key at rest in the browser profile; it does not defend against malware running as the user.
