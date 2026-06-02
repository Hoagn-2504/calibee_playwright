# Test Framework Structure

This suite is organized so specs stay focused on behavior while shared setup lives in reusable layers.

- `fixtures/`: Playwright fixtures, such as `adminPage`, that prepare browser state for tests.
- `pages/`: Page Object classes for stable UI actions and locators.
- `support/`: Shared environment config and cross-page helpers.
- `data/`: Static test data and route/header expectations.
- `*.spec.js`: Test scenarios only. Keep assertions and test flow here, not low-level setup.

Guidelines:

- Prefer fixtures and page objects over copying login/setup code into specs.
- Prefer deterministic test data. Use random data only when explicitly configured.
- Prefer Playwright auto-waiting assertions over `waitForTimeout`.
- Keep DOM fallback code isolated in helpers when the admin UI requires it.
