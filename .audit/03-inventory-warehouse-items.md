# Inventory / Warehouse / Items Slice — Punch List

## SHOWSTOPPERS

- **`frontend/src/pages/Shipping.tsx:69`** — Primary "New Shipment" / "New BOL" button has `onClick: () => {}`. Pilot users tap the most visible CTA and nothing happens.
- **`frontend/src/pages/Inventory.tsx:43`** — `useItems()` called with no `page_size`. Backend `PAGE_SIZE = 50`. The page iterates `allItems` for KPIs ("Items with Stock", "Total On Hand", "On Open SO/PO pallet counts"). **For any tenant with >50 items, KPIs are wrong and items beyond row 50 are invisible.**
- **`frontend/src/pages/Items.tsx:43, 414`** — Same root cause. Header says `{itemsData?.results?.length ?? 0} total` — a tenant with 200 active items sees "50 total" with no way to page.
- **`frontend/src/pages/ProductCards.tsx:20-26`** — Item search dropdown paginated at 50. Items beyond 50 alphabetically can never be selected.
- **`frontend/src/pages/warehouse/PrintLabels.tsx:64`** — Search `enabled: itemSearch.length >= 1` fires request on every keystroke with no debounce. Same applies to ProductCards.
- **`frontend/src/pages/ItemDetail.tsx:102`** — `useParties({ party_type: 'VENDOR' })` is unbounded, populates the "Add Vendor" Select. Tenant with >50 vendors can't select vendor #51+.
- **`frontend/src/components/items/ItemFormShell.tsx:323`** — Same `useParties({ party_type: 'CUSTOMER' })` for Customer Select inside item form. Item creation can't reach customers past row 50.
- **`frontend/src/components/items/ItemFormShell.tsx:531-535, 572-575`** — `createBoxItem.mutateAsync(corrugatedPayload as any)` and `updateBoxItem.mutateAsync({...} as any)` — `as any` hiding real type mismatches. Combined with catch-all error handler (615-623), nested validation errors render as `corrugated_details: [object Object]`.

## SHOULD-FIX

- **`frontend/src/pages/Items.tsx:75-85`** — `handleConfirmDelete` swallows API error and toasts a generic "Failed to delete item." Doesn't surface server-side reason (e.g., "item is referenced by open SO").
- **`frontend/src/pages/Items.tsx (whole file)`** — No error state rendering. `useItems` failure leaves page on loading skeleton or "0 total". Same in Inventory, Shipping, UnitOfMeasure, WarehouseLocations, ProductCards, PrintLabels.
- **`frontend/src/pages/ItemDetail.tsx:273`** — "Spec Sheet" button uses `window.open('/api/v1/items/${item.id}/spec_sheet/', '_blank')`. App uses JWT in headers (via interceptor in `api/client.ts`) — opening in a new tab won't include the auth header → 401. Same pattern at ItemFormShell.tsx:586.
- **`frontend/src/components/items/ItemFormShell.tsx:485-501`** — `extra_info_lines: formData.extra_info` is sent on every submission with synthetic client-side `id` values (extraInfoIdRef counter at 308) that don't match server-side IDs. On edit, likely creates duplicates or rejects.
- **`frontend/src/pages/warehouse/Scanner.tsx:55-57`** — `useEffect` calls `setTimeout(() => inputRef.current?.focus(), 100)` on every step change. Barcode scanners often blast input before focus arrives, dropping the first character.
- **`frontend/src/pages/warehouse/Scanner.tsx:103-153`** — `handleScan` has no debounce. Barcode scanners can double-fire `handleKeyDown` (165-175). No protection against scanning the same code twice in flight.
- **`frontend/src/pages/warehouse/Scanner.tsx (whole)`** — No "scan failed" audio/haptic feedback. Only a red error block at the bottom (377-381). Warehouse users on handhelds need a buzz or beep.
- **`frontend/src/pages/warehouse/Scanner.tsx:155-163`** — `handleQtySubmit` accepts any positive float but doesn't validate against `expected_quantity` or check source stock. Backend fails at confirm time after the user has scanned multiple fields.
- **`frontend/src/pages/warehouse/CycleCounts.tsx:69-77`** — `useCycleCounts()` treats `data.results ?? data` as the array. If paginated, only first 50 counts ever show. No pagination UI.
- **`frontend/src/pages/warehouse/CycleCounts.tsx:262`** — Uses `window.confirm()` for "There are variances. Finalize and apply adjustments?" — inconsistent with the app's `ConfirmDialog` pattern.
- **`frontend/src/pages/warehouse/CycleCounts.tsx:309-321`** — Count input has no min/max, no decimal validation, allows negative numbers.
- **`frontend/src/pages/warehouse/PrintLabels.tsx:73-99`** — Validates `qty < 1 || qty > 300` via toast, but `parseInt(labelQty) || 1` silently defaults to 1 on bad input, masking what was actually requested.
- **`frontend/src/pages/warehouse/PrintLabels.tsx:94, 120`** — `catch { toast.error('Failed to generate labels') }` swallows underlying error. Backend errors hidden.
- **`frontend/src/pages/warehouse/WarehouseLocations.tsx:26-27`** — Locations and Lots both paginated at 50 with no UI to page through. A 100-bin warehouse already overflows.
- **`frontend/src/pages/Inventory.tsx:165-177`** — Pallet KPIs compute `Math.ceil(qty / upp)` summed across items but silently `return sum` when `units_per_pallet` is missing. Items missing pallet config undercount with no indicator.
- **`frontend/src/pages/Inventory.tsx:81-83`** — `accessorKey: 'division'` cell renders the slug `non_stockable` via CSS `capitalize` → "Non_stockable". Items.tsx:128-145 has a proper label map — reuse it.
- **`frontend/src/pages/ItemDetail.tsx:122-126`** — `useEffect` calls `trackView.mutate(...)` with eslint-disable; mutation on remount is OK but suppression masks future bugs.
- **`frontend/src/pages/ItemDetail.tsx:402-433`** — Inline `<div className="fixed inset-0 ...">` modal for revision bump dialog bypasses shared `Dialog` component — no focus trap, no Escape-to-close, no overlay click-to-close.
- **`frontend/src/components/items/ItemFormShell.tsx:592-609`** — Companion item creation (Print Plate / Steel) sends `sku: ''` with `division: 'tooling'` but no `box_type`. If backend defaults to corrugated/RSC, fails validation. All errors merged into parent error.
- **`frontend/src/components/items/ItemFormShell.tsx:516-529`** — Dimension fields sent as raw strings (could be "12-3/8" fraction). `handleDimBlur` (424-433) converts on blur but only updates display, not submitted value if user submits via Enter without blurring.
- **`frontend/src/components/items/ItemFormShell.tsx:1038`** — Colors-printed input has `max="8"` HTML attr but no JS clamp. User types 99 → renders 99 ink color inputs.
- **`frontend/src/pages/Inventory.tsx:147`** — `(row.getValue('status') as string).toLowerCase()` assumes status non-null. Null status crashes table render.
- **`frontend/src/pages/Shipping.tsx:31, 32, 46`** — `format(new Date(...))` throws "Invalid time value" if date is null/malformed.

## NIT

- **`frontend/src/pages/ItemDetail.tsx:32`** — Several `as any` casts in mutation calls.
- **`frontend/src/components/items/ItemFormShell.tsx:452`** — `set = (field: keyof FormData, value: any)`.
- **`frontend/src/pages/warehouse/Scanner.tsx:96, 149`** and **CycleCounts.tsx:145, 160, 173** — `err: any` in catches.
- **`frontend/src/pages/ItemDetail.tsx:206`** — `data-print-hide` wraps the whole detail page including toolbar — the entire page is hidden on print except product card at line 1113.
- **`frontend/src/pages/warehouse/CycleCounts.tsx:343`** — `parseFloat(line.counted_quantity!).toLocaleString()` uses non-null assertion.
- **`frontend/src/pages/warehouse/PrintLabels.tsx:1, 11`** — Imports `Tabs` from `@/components/ui/tabs` (radix wrapper) but rest of warehouse pages use `FolderTabs`. Stylistic inconsistency.
- **`frontend/src/pages/warehouse/CycleCounts.tsx:226`** — Loading state is plain text rather than the slice's `TableSkeleton`.

## CLEAN

- **`frontend/src/pages/CreateItem.tsx`** and **`frontend/src/pages/RequestItem.tsx`** — Thin wrappers around ItemFormShell.
- **`frontend/src/pages/UnitOfMeasure.tsx`** — Clean.

## Key Findings Summary

1. The **biggest pilot risk** is the silent 50-row pagination cap. `useItems()`, `useParties()`, `useInventoryBalances()`, `useInventoryLots()`, `useWarehouseLocations()`, `useLots()`, `useCycleCounts()` and `useWarehouses()` all paginate at 50 with no UI. Affects KPIs, dropdowns (vendor/customer select on item edit), and table contents.
2. **Shipping.tsx:69** has a dead primary CTA — most obvious visual bug.
3. **Scanner.tsx** has no debounce/double-scan protection and a 100ms setTimeout focus race.
4. **PrintLabels/ProductCards search** fires on every keystroke with no debounce.
5. **CycleCounts.tsx** allows negative counts and uses native `confirm()`.
