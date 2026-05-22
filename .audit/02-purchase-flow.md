# Purchase Flow Audit — Pilot Punch List

## SHOWSTOPPERS

- `frontend/src/pages/CreateRFQ.tsx:43` — Initial form state sets `status: 'DRAFT'` (uppercase), but backend `RFQ.RFQ_STATUS_CHOICES` (`apps/orders/models.py:649`) only accepts lowercase (`draft`, `sent`, etc.). Any new RFQ submission will fail with a 400 validation error.
- `frontend/src/pages/CreateRFQ.tsx:110` — On successful RFQ creation, navigates to `/vendors` instead of `/rfqs` or `/rfqs/:id`. User loses context and the new RFQ.
- `frontend/src/pages/CreateVendor.tsx:67` — Posts `payable_account` to `/vendors/`, but `VendorSerializer.Meta.fields` (`apps/api/v1/serializers/parties.py:90-100`) does not list `payable_account`. Field is silently dropped, the UI claims it was saved, then bills will fall back to tenant default.
- `frontend/src/components/orders/PurchaseOrderDialog.tsx:151` — `ship_to: Number(formData.ship_to)` produces `NaN` if the user opens the dialog from `Orders.tsx` and forgets the warehouse; `priority: Number(formData.priority)` and the integer `vendor` cast share the same flaw. Combined with the swallow at line 174-176 (`console.error` only) the user gets no feedback.
- `frontend/src/pages/CreatePurchaseOrder.tsx:193` — `ship_to: Number(formData.ship_to)` posts `NaN` when the warehouse dropdown was left blank. There is no `required` check on `ship_to` before submit and the submit button is only disabled while pending — user can create POs that 500/400 with cryptic error.
- `frontend/src/pages/CreateRFQ.tsx:38` — `useItems()` (no `page_size`) caps the line-item dropdown at backend default of 50 records (`raven/settings.py:255 PAGE_SIZE=50`). On a real catalog the user cannot find most items. Same issue in `CreatePurchaseOrder.tsx:63`, `PurchaseOrderDetail.tsx:105`, `RFQDetail.tsx:73`, and `PurchaseOrderDialog.tsx:68`. This is the single most likely "live demo embarrassment."

## SHOULD-FIX

- `frontend/src/pages/VendorDetail.tsx:76-77` — Both "Open PO Total" and "Open POs" KPIs navigate to `/orders?tab=purchase`, which is generic for the whole tenant and not filtered by this vendor. Misleading drill-down.
- `frontend/src/pages/VendorDetail.tsx:81` — "Locations" KPI uses `onClick: () => {}` (empty handler). It's clickable but does nothing.
- `frontend/src/pages/VendorDetail.tsx:213` — "View Timeline" button has empty stub onClick with TODO-style comment. Dead button rendered inside the "RFQs" tab.
- `frontend/src/pages/VendorDetail.tsx:206-218` — The entire RFQs tab is a placeholder ("RFQ history is available in the timeline above.") with no actual RFQ data.
- `frontend/src/pages/RFQDetail.tsx:794-797` — Activity card hardcodes "No activity recorded" with no fetch; in PurchaseOrderDetail activity is loaded via `/history/purchaseorder/:id/` but RFQDetail never wires its equivalent.
- `frontend/src/pages/PurchaseOrderDetail.tsx:351` — Print form hardcodes `{ label: 'Terms', value: 'Net 30' }`. Should pull from the vendor's `payment_terms`. Will print "Net 30" for every vendor.
- `frontend/src/pages/OpenPurchaseOrders.tsx:147` — `handleFilteredPrint` ignores the actual filter selections — just calls `window.print()` 100ms later. Confusing UX.
- `frontend/src/pages/CreateVendor.tsx:71-79` — Error handling does `err: any`, then peels `.response.data` manually — does not use the shared `getApiErrorMessage()` from `lib/errors.ts`. Same pattern in `CreateRFQ.tsx:111-119`, `CreatePurchaseOrder.tsx:205-213`, `CreateCheck.tsx:89-97`. Nested validation errors render as `"lines: [object Object]"`.
- `frontend/src/pages/CreateRFQ.tsx:51` — RFQ submit allows zero lines. No client validation.
- `frontend/src/pages/CreateRFQ.tsx:216, 221` — Quantity and target-price `<Input type="number">` accept negatives, no `min="0"` enforcement.
- `frontend/src/pages/CreateCheck.tsx:251-253` — Amount field allows arbitrary values; no check that `parseFloat(amount) > 0`.
- `frontend/src/pages/CreateCheck.tsx:295` — Submit requires `payee_name && amount && check_date` but does NOT require `bank_account`. A check with no bank account will 400.
- `frontend/src/pages/Checks.tsx:44-46` — `handlePrint` has no try/catch and no toast — silent failure.
- `frontend/src/pages/Checks.tsx:48-54` — `handleVoidConfirm` no error handling; if void 500s the dialog still closes claiming success.
- `frontend/src/pages/OtherNames.tsx:88-95` — `handleSave` has no try/catch. If create/update fails the dialog still closes (line 94 unconditional) with no toast.
- `frontend/src/pages/OtherNames.tsx:97-103` — `handleConfirmDelete` no error handling.
- `frontend/src/components/orders/PurchaseOrderDialog.tsx:174-176` — `catch (error) { console.error(...) }` — silent swallow with `console.error` in production code. Same in `components/parties/VendorDialog.tsx:80-82`.
- `frontend/src/pages/RFQs.tsx:61` — `console.error('Failed to delete RFQ:', error)` left in production handler.
- `frontend/src/pages/RFQDetail.tsx:155`, `PurchaseOrderDetail.tsx:223` — `console.error` left behind in save handlers.
- `frontend/src/pages/PurchaseOrderDetail.tsx:828-832` — Delete confirm `onConfirm` awaits `deletePO.mutateAsync` then navigates — no try/catch. If delete fails (e.g. PO has bills attached), the dialog throws, user is stuck.
- `frontend/src/pages/Vendors.tsx:43` — `_printFilters` state is set but never read.
- `frontend/src/pages/OpenPurchaseOrders.tsx:84-94` — Inside a `useMemo` (for `groupedOrders`) the code calls `setExpandedGroups(currentExpanded)` — a setState during render. React 18 will warn.
- `frontend/src/pages/CreatePurchaseOrder.tsx:82, 203` — `as any` casts on copyData.lines and the create payload; payload uses `line_number: idx + 1` while backend convention sets `(idx+1)*10`.
- `frontend/src/pages/CreatePurchaseOrder.tsx:56` — `(location.state as any)?.copyFrom` — `any` cast in critical path.

## NIT

- `frontend/src/pages/CreateRFQ.tsx:37, 39, 53` — `useLocations()` and `useUnitsOfMeasure()` are fetched but `locationsData` is filtered locally; duplicated in `CreatePurchaseOrder.tsx:89`.
- `frontend/src/pages/RFQs.tsx:189-193` — Status filter options list `cancelled` with label "Closed" — inconsistent with the rest of the app (badges say "Cancelled").
- `frontend/src/pages/RFQDetail.tsx:367` — `onBlur={() => setTimeout(() => setConvertMenuOpen(false), 150)}` — fragile dropdown close logic.
- `frontend/src/pages/PurchaseOrderDetail.tsx:454` — `format(new Date(order.created_at || order.order_date + 'T00:00:00'), ...)` — string concat precedence bug; when `created_at` is null `'' + 'T00:00:00'` becomes invalid date.
- `frontend/src/components/orders/PurchaseOrderDialog.tsx` — entire file (428 lines) appears partially-superseded by full-page `CreatePurchaseOrder.tsx`; only `Orders.tsx` still references it. Has `priority` field, page does not — code drift.
- `frontend/src/pages/CreateCheck.tsx:28-34` — Fetches accounts with no `page_size` param — also subject to default-50 truncation.
- `frontend/src/pages/VendorDetail.tsx:42` — `eslint-disable-line react-hooks/exhaustive-deps` on trackView effect.

## CLEAN

- `frontend/src/pages/Vendors.tsx` — list/grid behavior is solid; loading and empty states wired.
- `frontend/src/pages/OtherNames.tsx` — clean form layout (apart from silent error handling).

## Key references
- Backend RFQ statuses (lowercase): `apps/orders/models.py:649-655`
- VendorSerializer fields (missing `payable_account`): `apps/api/v1/serializers/parties.py:88-100`
- Default API page size 50: `raven/settings.py:255`
- Frontend item fetch (no page_size): `frontend/src/api/items.ts:16-24`
