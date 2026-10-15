---
name: google-sheets
description: Use the official Google Sheets API client in MTMS application code while keeping the local development MCP strictly read-only; covers credentials, scopes, safe reads/writes, and validation.
---

# MTMS Google Sheets Integration

Use this skill whenever implementing or reviewing Google Sheets access in MTMS.

## Source of truth

- Application code: `src/lib/google_ecosystem/google-sheets-api.ts`.
- Local developer MCP: `src/lib/google_ecosystem/google-sheets-mcp.ts`.
- Setup and usage documentation: `src/lib/google_ecosystem/README.md`.

## Application API

- Use the official `googleapis` package and the existing server-only module. Do not add hand-rolled Google OAuth/token or REST request logic to application features.
- Keep the module server-only. Never import it into a Client Component or expose service-account credentials/tokens to the browser.
- `readSheetRange` uses the readonly Sheets scope. `updateSheetRange` requests the broader Sheets scope only when invoked.
- Keep explicit bounded A1 ranges and the current 250-row maximum; preserve schema validation and the existing update options.
- Any application write path must independently enforce session authentication, authorization to the relevant data, input/domain validation, and appropriate error handling. A server-only helper is not an authorization boundary.

## Credentials and access

- Configure `GOOGLE_APPLICATION_CREDENTIALS` to point to a service-account JSON file held outside version control or mounted through the deployment secret mechanism.
- Never commit credentials, print their content, include tokens in errors, or copy credentials into documentation. Keep the repository ignore rules in place.
- Enable Google Sheets API and share the target spreadsheet with the service-account identity. Viewer is sufficient for reads; Editor is required for writes.
- Never assume Editor access is present. Confirm it with the owner before any write test.

## MCP boundary

- The local `mtms-google-sheets` MCP is a development context tool and must remain read-only with `spreadsheets.readonly` scope.
- Do not add write tools to MCP, reuse the application write scope for MCP, or describe MCP as the application data access layer.

## Safe verification

- Validate code using Biome, `pnpm tsc --noEmit`, and relevant unit tests.
- Prefer mocked tests for application read/write behavior. Do not execute writes against production/business data as a test.
- A live write test requires explicit approval and a designated nonproduction spreadsheet or an approved disposable range. Explain that Google Sheets updates are not transactional across ranges and may overwrite existing values.
- For implementation details and examples, read `src/lib/google_ecosystem/README.md`.

## Review checklist

- [ ] Application API uses `googleapis` through the existing server-only helper.
- [ ] MCP remains readonly and is not granted write scope/tools.
- [ ] Credentials are external to Git and are not logged or exposed.
- [ ] Read/write range and payload validation remain bounded.
- [ ] Write callers enforce authz and have explicit safe test coverage.
