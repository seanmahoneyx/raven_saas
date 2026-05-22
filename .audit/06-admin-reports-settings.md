# Punch List — Admin / Reports / Settings Audit

## SHOWSTOPPERS

- **`frontend/src/pages/admin/DataImport.tsx:77-83`** — `handleFileSelect` (and drag-drop at 67-75) has **no file-size validation**. 500MB CSV gets shoveled into FormData. Cap to ~5MB client-side.
- **`frontend/src/pages/admin/DataImport.tsx:67-75`** — `handleDrop` silently rejects non-CSV drops (no toast). Drag `.xlsx` → nothing happens.
- **`frontend/src/pages/admin/DataImport.tsx:154-156`** — Uses hard-coded slate/blue dark colors (`text-white`, `text-slate-400`, `bg-slate-900`) while the rest of the app uses `--so-*` warm-neutral tokens. **On the warm/light theme this page renders as a black box.** Highly visible.
- **`frontend/src/pages/reports/ReportsDashboard.tsx:25`** — "Sales Commission" appears under "Financial Statements & Analysis" but is visible to non-admins. Exposes per-rep totals and commission earned across the company. Gate behind `is_staff`.
- **`frontend/src/pages/reports/ItemQuickReport.tsx:349-351`** — Catch block is `catch {}` with comment "silently fail for PDF download errors." User clicks Download PDF, nothing happens, no error.

## SHOULD-FIX

- **`frontend/src/pages/admin/AdminHub.tsx:52-53`** — `usePageTitle('Settings')` while route is `/admin` — collides with `/settings` (My Company). Rename "Admin" / "Administration".
- **`frontend/src/pages/reports/ReportsDashboard.tsx:22`** — "Gross Margin" card and "Gross Margin Detail" point at different paths/columns. Pilot users confused.
- **`frontend/src/pages/reports/ReportsDashboard.tsx:42`** — "Vendor Performance" and "Vendor Scorecard" appear to be two different presentations of similar data.
- **`frontend/src/pages/reports/FinancialStatements.tsx:155-174`** — `handleDownloadPdf` builds URLs like `/api/v1/reports/...` and uses `window.open`. App uses Bearer tokens via interceptor — opens 401. Same in **AgingReports.tsx:173,177**, **GrossMargin.tsx:47**, **VendorScorecard.tsx:46**, **ContractUtilization.tsx:39**, **SalesCommission.tsx:49**, **OrdersVsInventory.tsx:48**, **CannedReport.tsx:292,298**.
- **`frontend/src/pages/admin/DataImport.tsx:120-138`** — Success: no toast. Failure: uses `alert()` (line 136). Replace with `toast.error()`.
- **`frontend/src/pages/admin/TaxZones.tsx:186, 216`** — Uses bare `confirm()` for destructive deletes. Inconsistent with shadcn dialog pattern.
- **`frontend/src/pages/admin/TaxZones.tsx:131-137`** — Loading state returns separate JSX block, loses the header.
- **`frontend/src/pages/admin/TaxZones.tsx:121`** — Multiplies stored `zone.rate` by 100 for display, divides by 100 on save. Verify backend semantics. No validation that rate > 0 or ≤ 100.
- **`frontend/src/pages/admin/UserAuditReport.tsx:177`** — `key={idx}` instead of stable key.
- **`frontend/src/pages/admin/UserAuditReport.tsx:36-43`** — No error rendering on audit query failure.
- **`frontend/src/pages/Settings.tsx:60-63`** — `console.error(error)` left in production. Same in `AccountingSettings.tsx:53`.
- **`frontend/src/pages/Settings.tsx:46-51`** — Spreads `settings` fields without null-coalescing; null fields pass `null` to controlled `<Input>`.
- **`frontend/src/pages/Settings.tsx:142-149`** — "Logo URL" field has no URL validation.
- **`frontend/src/pages/Settings.tsx (entire)`** — No error rendering if `useSettings()` fails. Page sits forever on "Loading settings…".
- **`frontend/src/pages/AccountingSettings.tsx (entire)`** — Same. No "no accounts available" state.
- **`frontend/src/pages/settings/Preferences.tsx:44`** — `if (isLoading) return null` — page **blanks out**. Pilot user thinks the page is broken.
- **`frontend/src/pages/Users.tsx:76, 87`** — `Record<string, any>` and `as any` cast on update payload.
- **`frontend/src/pages/Users.tsx:91-95`** — Delete handler has no error toast. Modal closes silently on failure.
- **`frontend/src/pages/Users.tsx:67-72, 74-89`** — Create/update mutations have no try/catch.
- **`frontend/src/pages/Users.tsx (whole)`** — **No protection against current user deleting/deactivating themselves.** Admin can lock themselves out.
- **`frontend/src/pages/Users.tsx:97-99`** — `handleToggleActive` has no confirmation or feedback.
- **`frontend/src/pages/reports/CannedReport.tsx:290-299`** — `handleExportCsv` and `handleDownloadPdf` open URL in new window. **No loading indicator** for a 30-second report PDF.
- **`frontend/src/pages/reports/CannedReport.tsx (entire)`** — `useQuery` at line 284 has no `isError` rendering. 500 looks identical to "no data".
- **`frontend/src/pages/reports/FinancialStatements.tsx (all 4 tabs)`** — No `isError` handling. **Pilot CFO will ask "why is this blank?"**
- **`frontend/src/pages/reports/AgingReports.tsx:280-282`** — Same: no error branch.
- **`frontend/src/pages/reports/GrossMargin.tsx:233`** — Same.
- **`frontend/src/pages/reports/ContractUtilization.tsx (whole)`** — Same.
- **`frontend/src/pages/reports/VendorScorecard.tsx (whole)`** — Same.
- **`frontend/src/pages/reports/SalesCommission.tsx (whole)`** — Same.
- **`frontend/src/pages/reports/OrdersVsInventory.tsx (whole)`** — Same.
- **`frontend/src/pages/reports/ItemQuickReport.tsx:248`** — `useItems()` no args; if tenant has 5,000 items dropdown loads them all.

## NIT

- `AdminHub.tsx:13-50` — Six cards listed but two are duplicated by sidebar nav (Users, Data Import, Tax Zones).
- `AdminHub.tsx:69` — Cards have `cursor-pointer` but no keyboard handling.
- `DataImport.tsx:33-42` — Verify backend route `/admin/import/gl-opening-balances/` exists.
- `TaxZones.tsx:168` — Verify `success` variant exists in your Badge component.
- `UserAuditReport.tsx:178` — `ACTION_STYLES[entry.action] || ACTION_STYLES.Changed` — verify casing.
- `Settings.tsx:9` — `import { toast }` but error path also logs to console.
- `Users.tsx:26-27` — `dangerBtnClass`/`dangerBtnStyle` defined inline; promote to `components/ui/button-styles.ts`.
- `ReportsDashboard.tsx` — No global search / favorites for 19-card grid.
- `CannedReport.tsx:228` — Comment says PO statuses same as SO; verify.
- `ItemQuickReport.tsx:138-141, 162-164, 184-187` — Optional chaining `?.toFixed(2)` renders "undefined" if backend returns `null`.
- `ItemQuickReport.tsx:23-25` — `fmtDateCell` uses string splitting on ISO date; if backend returns ISO with timezone this breaks.

## Top 3 Pilot-Day Risks

1. **DataImport.tsx theme bug** — entire page renders dark slate on warm/light theme. First impression killer.
2. **No error states across nearly every report** — empty result and broken endpoint look identical.
3. **Users.tsx self-delete + silent mutation failures** — admin can lock themselves out; failed creates/updates leave dialog open with no feedback.
