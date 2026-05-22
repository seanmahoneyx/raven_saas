# Final Pre-Pilot Audit — Synthesized Backlog

Six parallel audits ran across the codebase. This is the cross-cutting roll-up.
Individual slice reports are in `.audit/01..06-*.md` if you want depth.

---

## Cross-cutting patterns (these single fixes resolve dozens of issues)

### 1. Pagination cap of 50 hits every dropdown and several KPIs ★ pilot-day risk #1

Every `useItems()` / `useCustomers()` / `useParties()` / `useLocations()` / `useInventoryBalances()` / `useLots()` / `useWarehouses()` / `useCycleCounts()` call hits `PAGE_SIZE=50` (`raven/settings.py:255`) with no UI to page past it. Affects:

- **Line-item Item dropdowns**: CreateRFQ, CreatePurchaseOrder, CreateSalesOrder, CreateEstimate, CreateInvoice, PurchaseOrderDetail, RFQDetail, EstimateDetail, SalesOrderDetail, ProductCards, PrintLabels, ItemQuickReport (parallel queries)
- **Customer/Vendor dropdowns**: ItemDetail, ItemFormShell, Pipeline filters
- **Inventory KPIs**: Inventory.tsx renders KPIs ("Items with Stock", "Total On Hand") off the first 50 items — KPIs are silently wrong for any tenant with >50 items
- **Tables without paging UI**: Items, Inventory, ProductCards, CycleCounts, WarehouseLocations (locations and lots)
- **Customer/Vendor filters**: OpenSalesOrders, OpenPurchaseOrders

**Fix:** Either (a) add a `?page_size=` param to each affected hook and route Select components through `SearchableCombobox` (which already paginates), or (b) raise `PAGE_SIZE` for these specific endpoints. Option (a) is the right answer long-term.

### 2. Field-name / enum mismatches between frontend and backend ★ pilot-day risk #2

These are silent-failure bugs that look like everything is working until the data hits the database:

| File:line | What's wrong |
|---|---|
| `CreateRFQ.tsx:43` | Posts `status: 'DRAFT'`; backend accepts only lowercase `'draft'`. **Every RFQ creation fails.** |
| `CreateInvoice.tsx:31-38, 166` | Posts `terms: 'NET_30'`; backend field is `payment_terms` and enum is `NET30` (no underscore). **Every invoice creation fails.** |
| `CreateInvoice.tsx:161-176` + `api/invoicing.ts:7-31` | Frontend Invoice model has `invoice_type: 'AR'\|'AP'` and `party` FK; backend has neither (only `customer`). **Invoice create cascades to NULL customer.** |
| `CreateVendor.tsx:67` | Posts `payable_account`; not in `VendorSerializer.Meta.fields`. **Silently dropped.** UI claims save succeeded. |
| `Invoices.tsx:142+` / `api/invoicing.ts:34-35` | Reads `payment_number`; backend `Payment` model has no such field. Column renders `undefined`. |
| `JournalEntries.tsx:237-242` | Filter offers `manual` type; backend has `standard`. "Manual" returns zero rows always. |
| `InvoiceDetail.tsx:208,417,531` | Tax rate displayed as `parseFloat(rate) * 100` — backend stores rate as percentage (`8.25`). Displays **"825.0%"** on every invoice including print. |

### 3. Empty-handler buttons (dead UI)

| File:line | Button |
|---|---|
| `Shipping.tsx:69` | "New Shipment" / "New BOL" primary CTA |
| `Logistics.tsx:162` | "New LPN" primary CTA |
| `CustomerDetail.tsx:105` | "Locations" KPI tile |
| `VendorDetail.tsx:81` | "Locations" KPI tile |
| `VendorDetail.tsx:213` | "View Timeline" inside RFQs tab |
| `VendorDetail.tsx:206-218` | Entire RFQs tab is a placeholder |

### 4. Route mismatches — links that 404

| File:line | Where it goes | Where it should go |
|---|---|---|
| `Approvals.tsx:74` | `/purchase-orders/${id}` | `/orders/purchase/${id}` |
| `Approvals.tsx:75` | `/orders/${id}` | `/orders/sales/${id}` |
| `Pipeline.tsx:33` | `/orders/purchase` (no id) | `/vendors/open-orders` or detail |
| `Pipeline.tsx:33` | `/design-requests` (loses id) | `/design-requests/:id` |
| `Pipeline.tsx:33` | `/estimates` (loses id) | `/estimates/:id` |
| `CreateRFQ.tsx:110` | `/vendors` after create | `/rfqs` or `/rfqs/:id` |
| `CreateSalesOrder.tsx:374` | `/customers/open-orders` after create | `/orders/sales/:id` |
| `CreatePriceList.tsx:69` | `/customers` after create | `/price-lists/:id` |

### 5. Silent error handling — mutations that swallow failures

Pattern: `catch (error) { console.error(...); /* no toast, no re-throw */ }`. Pilot users see "success" UI then discover data didn't save.

- `Checks.tsx:44-46` (print) and `48-54` (void)
- `OtherNames.tsx:88-95` (save) and `97-103` (delete)
- `Trucks.tsx:31-41` (delete)
- `Users.tsx:67-95` (create / update / delete)
- `FixedAssetDetail.tsx:50-59` (dispose), `FixedAssets.tsx:268-271` (run depreciation)
- `DesignRequestDetail.tsx:225-231` (upload)
- `PurchaseOrderDialog.tsx:174-176`, `VendorDialog.tsx:80-82`
- `RFQs.tsx:61`, `RFQDetail.tsx:155`, `PurchaseOrderDetail.tsx:223,828-832`
- `PriceListDetail.tsx:117`, `CostListDetail.tsx:103`
- `InvoiceDetail.tsx:108-117` (send)
- `Settings.tsx:60-63`, `AccountingSettings.tsx:53`
- `CreateJournalEntry.tsx:106`, `JournalEntryDetail.tsx:35,47`

### 6. Bearer-token PDF/CSV downloads via `window.open`

Auth uses JWT in `Authorization` header (via `api/client.ts` interceptor). `window.open` in a new tab doesn't carry that header → **401** on every download link.

- Reports: `FinancialStatements.tsx:155-174`, `AgingReports.tsx:173,177`, `GrossMargin.tsx:47`, `VendorScorecard.tsx:46`, `ContractUtilization.tsx:39`, `SalesCommission.tsx:49`, `OrdersVsInventory.tsx:48`, `CannedReport.tsx:292,298`
- Documents: `Invoices.tsx:130`, `Estimates.tsx:228`, `Orders.tsx:369`, `EstimateDetail.tsx:228`, `ItemDetail.tsx:273` (spec sheet), `ItemFormShell.tsx:586`

**Fix once, applies everywhere:** add a helper that uses the api client (fetch with auth header) → blob → `URL.createObjectURL` → temporary `<a download>`.

### 7. Missing error / loading states on data fetches

A fetch failure looks identical to an empty result — pilot users can't tell broken from "no data". Worst offenders are reports (a CFO will be confused):

- Reports (all 9): no `isError` branch → blank Card on 500.
- Settings.tsx, AccountingSettings.tsx, Preferences.tsx — `if (isLoading) return null` blanks the page.
- Estimates.tsx, Orders.tsx, OpenSalesOrders.tsx — no loading state on the list table.
- CannedReport.tsx, ItemQuickReport.tsx — same.

### 8. Float equality / float-math on money

- `CreateJournalEntry.tsx:66-73` — `totalDebit === totalCredit` via float. Three lines of $33.33 vs one of $100.00 → entry marked unbalanced. Use cents or epsilon.
- `CreateInvoice.tsx:132-136,392-393` — line totals computed in float, drift from server.
- `Estimates.tsx:189-190`, `Orders.tsx:233,346`, `Invoices.tsx:105+` — money via `parseFloat().toFixed(2)` instead of shared `formatCurrency`.

### 9. Invalid-input validation gaps

- `CreateRFQ.tsx:216,221` — quantity / target price accept negatives.
- `CreateCheck.tsx:251-253` — amount has no `>0` check.
- `CreateCheck.tsx:295` — submit allows missing `bank_account` (will 400).
- `CreateInvoice.tsx:449-471` — qty / unit price as `type="text"`, no `min`.
- `CycleCounts.tsx:309-321` — counted quantity allows negatives.
- `CreateContract.tsx:293` — submits with zero lines silently.
- `CreateEstimate.tsx:55,192` — tax_rate accepts negatives, no clamp.
- `FixedAssetDetail.tsx:381-415` — disposal allows `disposal_method='sold'` + `disposal_amount=$0` with no warning.
- `Settings.tsx:142-149` — Logo URL accepts garbage strings.

### 10. Date / timezone bugs

- `Scheduler.tsx`, `WeekGroup.tsx:28-31,172-175`, `ScheduleView.tsx:22-41` — Uses UTC (`toISOString()`) where local date is needed; "today" wrong in evenings west of UTC.
- `OpenSalesOrders.tsx:139,146` — `new Date(order.order_date)` without `'T00:00:00'`; displayed day shifts in negative-UTC zones.
- `DriverManifest.tsx:32-37` — "today" string set on mount only; wrong if driver leaves page open past midnight.
- `PurchaseOrderDetail.tsx:454` — `format(new Date(order.created_at || order.order_date + 'T00:00:00'))` — string-concat precedence bug; `'' + 'T00:00:00'` = invalid date.

### 11. setTimeout-before-print race

Pattern: `setExpandedState(...); setTimeout(window.print, 100)`. Flaky on slow machines, prints stale state.

- `OpenPurchaseOrders.tsx:147`
- `DesignRequests.tsx:438-441`
- `JournalEntries.tsx:139-142`
- `Vendors.tsx:43` (`_printFilters` state set but never read)

### 12. Native `confirm()` vs shadcn `ConfirmDialog`

Used in `TaxZones.tsx:186,216` and `CycleCounts.tsx:262`. Inconsistent with the rest of the app's polished dialog UX.

---

## Site-specific bugs not covered by cross-cutting fixes

These don't fit a pattern but are real:

- **`DataImport.tsx:154-156`** — Hardcoded slate dark colors → page renders as a black box on the warm/light theme. First-impression killer.
- **`CreateCustomer.tsx:281`** — Duplicate Party record created when inline contacts are added. Should be PATCH on the existing party.
- **`CreateCustomer.tsx:272`** — Contacts entered on the create form are dumped into the customer's notes blob instead of creating real Contact records. The Contact model exists.
- **`SalesOrderDetail.tsx:382`** — Print Form hardcodes `Terms: Net 30` for every customer.
- **`PurchaseOrderDetail.tsx:351`** — Same on the PO side.
- **`ReceivePayment.tsx:52,193-245`** — Asks user to pick `depositAccount`, then never includes it in the create payload. Posting silently uses the default cash account.
- **`Users.tsx (whole)`** — Admin can delete or deactivate themselves with no guard.
- **`Scanner.tsx:55-57,103-153`** — 100ms `setTimeout` focus race causes first character of scan to drop; no debounce / double-scan guard; no audio feedback.
- **`PriorityListView.tsx:142-228`** — Optimistic drag with no `onError` rollback; UI silently drifts from backend on failure until next poll.
- **`Approvals.tsx:88-91`** — "Pending" tab shows my-pending only; "Approved"/"Rejected" tabs show all-tenant data. Inconsistent scoping under the same tab labels.

---

## Triaged punch list (do in this order)

### Tier 1 — Fix before pilot users touch this

1. **Pagination cap** — wire SearchableCombobox into every line-item Item Select (or raise `?page_size=` to a sane number) — kills #1 cross-cutting issue.
2. **Field-name / enum mismatches** — RFQ status casing, Invoice `terms→payment_terms` and `NET_30→NET30`, Invoice AR/AP model reconciliation, Vendor `payable_account`, Payment `payment_number`, JE filter `manual→standard`, Invoice tax rate display.
3. **Dead primary CTAs** — Shipping "New Shipment", Logistics "New LPN".
4. **Wrong post-create navigation** — CreateRFQ, CreateSalesOrder, CreatePriceList.
5. **Approvals.tsx + Pipeline.tsx wrong routes** — convert all to registered routes.
6. **DataImport.tsx theming** — replace slate-* with `--so-*` tokens.
7. **`ReceivePayment.tsx` deposit-account omission** — money posts to wrong GL account.
8. **Users.tsx self-delete guard + error toasts on every mutation.**

### Tier 2 — Strongly recommended, will be noticed within first hour

9. **Unified PDF/CSV download helper** — replace every `window.open(/api/v1/...)` with an authenticated fetch → blob → `<a download>`.
10. **Error states on all reports** — at minimum: `if (isError) return <ErrorCard ... />`.
11. **Silent mutation handlers** — wrap every `mutateAsync` in try/catch with `toast.error(getApiErrorMessage(err, '...'))`.
12. **Invalid-input validation** — negative quantities, negative cycle counts, zero-amount checks, missing bank_account on check, missing lines on contract.
13. **Float-equality JE balance check** — use cents.
14. **CreateCustomer.tsx duplicate Party** — fix to PATCH; also wire inline contacts to real Contact records.
15. **Hardcoded "Net 30" on printed Sales Orders and POs** — pull from `vendor.payment_terms` / `customer.payment_terms`.

### Tier 3 — Polish, do once Tier 1 + 2 are clean

16. Scanner UX (focus race, debounce, audio).
17. Date / timezone helpers everywhere using `lib/dates.ts:parseLocalDate`.
18. Replace `confirm()` with `ConfirmDialog`.
19. Remove `console.error` debug statements.
20. Replace `parseFloat(...).toFixed(2)` with shared `formatCurrency`.
21. Replace `setTimeout(window.print, 100)` with `useLayoutEffect` or a proper print-ready promise.

---

## Estimated effort

| Tier | Items | Engineering days |
|---|---|---|
| Tier 1 | 8 items | 2-3 days |
| Tier 2 | 7 items | 3-4 days |
| Tier 3 | 6 themes | 2-3 days |
| **Total** | | **7-10 days** |

Tier 1 alone gets you to a pilot that won't immediately embarrass.
Tier 1 + 2 gets you to a pilot you'd put in front of a CFO.
Tier 3 is post-pilot polish.
