# Logistics / Scheduling / Design — Audit Punch List

## SHOWSTOPPERS

- **`frontend/src/pages/Logistics.tsx:162`** — "New LPN" primary header button has empty `onClick: () => {}`. Click does nothing.
- **`frontend/src/pages/Approvals.tsx:74-79`** (`getOrderLink`) — All three branches link to non-registered routes:
  - `purchaseorder` -> `/purchase-orders/${id}` (route is `/orders/purchase/:id`)
  - `salesorder` -> `/orders/${id}` (route is `/orders/sales/:id`)
  - `pricelisthead` -> `/price-lists/${id}` (OK)
  Clicking the order title in an approval row navigates to a blank/404.
- **`frontend/src/pages/Pipeline.tsx:33` (`getCardRoute`)** — Several cases route to list pages without an ID:
  - `'shipment'` -> `/shipping` (loses ID)
  - `'inventory_lot'` -> `/orders/purchase` (not a valid route)
  - `'design_request'` -> `/design-requests` (loses ID; `/design-requests/:id` exists)
  - `'estimate'` -> `/estimates` (loses ID; `/estimates/:id` exists)
- **`frontend/src/pages/Scheduler.tsx:35-40`** — Error state renders bare `Error loading scheduler: {error?.message}` with no retry button and no shell chrome. If API is briefly down, pilot users hit a dead end.
- **`frontend/src/components/priority-list/PriorityListView.tsx:142-228` (handleDragEnd)** — Optimistic drag operations call `moveLineToDate` / `reorderInBin` before the API mutation, but `moveMutation` / `reorderMutation` have **no `onError` rollback**. Lines "jump back" on next poll silently.

## SHOULD-FIX

- **`frontend/src/pages/Scheduler.tsx:57`** — Header tooltip says "Double-click for details" but no `onDoubleClick` handler in ScheduleView/ManifestLine for opening OrderDetailModal. Either implement or remove the hint.
- **`frontend/src/pages/Scheduler.tsx:63-76`** — When WS is down, no fallback messaging that user may see stale data. Red dot with no context.
- **`frontend/src/components/scheduler/useSchedulerMutations.ts:96-100`** — Source/dest cell "clean" markers use hard-coded `setTimeout(..., 2000)` to clear dirty state. Race-prone.
- **`frontend/src/components/scheduler/ScheduleView.tsx:22-41` (`getWeekBands`)** — Uses `new Date()` then `.toISOString().slice(0,10)` for "today". UTC, so PST evenings mark wrong day. `lib/dates.ts` has `parseLocalDate`. Same issue in `WeekGroup.tsx:28-31`.
- **`frontend/src/components/scheduler/WeekGroup.tsx:172-175`** — Constructs `new Date(d + 'T12:00:00Z')` and calls `getUTCDay()`. Brittle.
- **`frontend/src/pages/Pipeline.tsx:125-140`** — Customer/Vendor filters are free-text "Customer ID" `<input>`s. Pilot users won't memorize numeric IDs.
- **`frontend/src/pages/Pipeline.tsx:82`** — `isError` never checked → no error UI.
- **`frontend/src/pages/Pipeline.tsx:94-97`** — Four parallel `useItems({lifecycle_status: …})` fire only when Items tab active, but no loading skeleton.
- **`frontend/src/pages/Approvals.tsx:88-91`** — Inconsistent scoping: "Pending" tab shows `pendingApprovals` (my pending only), but "approved"/"rejected" tabs show all-tenant approvals.
- **`frontend/src/pages/Approvals.tsx:171-176`** — No error state for `useAllApprovals`.
- **`frontend/src/pages/NotificationHub.tsx:60`** — `useAllApprovals()` with no filter fetches everything, then renders unbounded.
- **`frontend/src/pages/NotificationHub.tsx:131-167`** — Each task shows `{t.content_type_model} #{t.object_id}` but is not clickable.
- **`frontend/src/pages/NotificationHub.tsx:194`** — Amount rendered as `${parseFloat(a.amount).toLocaleString()}` not via shared `formatCurrency`.
- **`frontend/src/pages/CreateDesignRequest.tsx:144`** — `createMutation.mutateAsync(payload as any)`. Cast strips type-checking. Also `catch (err: any)` manually crawls `err.response.data` instead of using `getApiErrorMessage()`.
- **`frontend/src/pages/DesignRequestDetail.tsx:185, 205`** — `as any` casts on update payloads.
- **`frontend/src/pages/DesignRequestDetail.tsx:147-164`** — When `isEditing` flips on, if the design request refreshes mid-edit (polling/WS), unsaved edits are clobbered.
- **`frontend/src/pages/DesignRequestDetail.tsx:225-231`** (`handleFileUpload`) — No `onError` shown for upload failure.
- **`frontend/src/pages/DesignRequestDetail.tsx:719`** — `fileInputRef` declared but never used to trigger dialog programmatically.
- **`frontend/src/pages/DesignRequestDetail.tsx:308`** — Customer name click navigates even when `designRequest.customer` is null.
- **`frontend/src/pages/DesignRequests.tsx:166-167`** — `pendingCount` and `myWorkCount` reflect only first paginated page.
- **`frontend/src/pages/DesignRequests.tsx:438-441`** — `handleFilteredPrint` uses `setTimeout(window.print, 100)` to allow state flush. Fragile.
- **`frontend/src/pages/PriorityList.tsx:91-93`** — "From {date}" label with no "to" range; confusing alongside infinite scroll.
- **`frontend/src/components/priority-list/PriorityListView.tsx:50`** — Inline type cast instead of using `Vendor` from `@/types/api`; verify `open_po_count` actually emits on the serializer.

## NIT

- **`frontend/src/pages/Trucks.tsx:28`** — No loading or error state on the table.
- **`frontend/src/pages/Trucks.tsx:31-41`** — `handleConfirmDelete` swallows the error and toasts generic "Failed to delete truck".
- **`frontend/src/pages/DesignRequestDetail.tsx:189, 208, 843, 935`** and **`frontend/src/pages/DesignRequests.tsx:89`** — `console.error` calls left in production code paths.
- **`frontend/src/components/priority-list/AllotmentConfigModal.tsx:73`** and **`OverridePopover.tsx:64, 85`** — Same `console.error` pattern; no user-facing toast on failure.
- **`frontend/src/pages/CreateDesignRequest.tsx:21`** — `STYLE_OPTIONS` uses `'Other'` while `DesignRequestDetail.tsx:51` uses `'OTHER'`. Casing inconsistency.
- **`frontend/src/pages/CreateDesignRequest.tsx:131`** — `customer: customer ? Number(customer) : null` posts `null` instead of omitting the key.
- **`frontend/src/pages/Approvals.tsx:75-77`** — String literals not extracted to a constant; no fallback handler.
- **`frontend/src/pages/DriverManifest.tsx:48`** — `manifest.stops.every((s) => s.arrived_at === null)` — should use `!s.arrived_at`.
- **`frontend/src/pages/DriverManifest.tsx:32-37`** — `today` string formatted only on first render; if driver leaves page past midnight, date is wrong.
- **`frontend/src/components/scheduler/useSchedulerStore.ts:1537, 1658, 1757`** — `console.log` dev-gated by `import.meta.env.DEV`. Noisy but not a bug.
- **`frontend/src/pages/PriorityList.tsx:14-127`** — No loading/error state at the page level.

## CLEAN

- **`frontend/src/pages/DriverManifest.tsx`** — Loading/error/empty all handled cleanly.
