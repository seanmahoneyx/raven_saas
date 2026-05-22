# Sales Flow — Punch List

## SHOWSTOPPERS

- `frontend/src/pages/CreateCustomer.tsx:281` — When inline Contacts are added, the form calls `createParty.mutateAsync()` a SECOND time (POST `/parties/`), creating a duplicate Party record. Should be `useUpdateParty` / PATCH. Fires a second "Party created" toast.
- `frontend/src/pages/CreateCustomer.tsx:272` — Comment says "Store contacts in party notes (until Contact model exists)" but the Contact model DOES exist (used in `ContactDetail.tsx` and `useContacts`). Contacts entered on the create form are dumped into a notes blob, not real Contact records, so they don't show up on the customer's Contacts tab.
- `frontend/src/pages/CreateSalesOrder.tsx:374` — After creating a NEW sales order (not from estimate), the page navigates to `/customers/open-orders`. User lands on an unrelated list instead of the SO they just created. Estimate flow at line 372 navigates correctly.
- `frontend/src/pages/SalesOrderDetail.tsx:382` — PrintForm has `{ label: 'Terms', value: 'Net 30' }` hardcoded. Every printed sales order says "Net 30" regardless of the customer's actual payment terms.
- `frontend/src/pages/CreateEstimate.tsx:48-49, 67-70`, `EstimateDetail.tsx:86-87, 91-92`, `CreateContract.tsx:36-38, 51-59`, `CreateSalesOrder.tsx:92-95, 129-137`, `SalesOrderDetail.tsx:104-108` — `useItems()`, `useCustomers()`, `useLocations()`, `useUnitsOfMeasure()` all called without filters/search; line-item Item Select dropdowns render only the first page (25-50 rows). On a real catalog, most items cannot be selected.
- `frontend/src/pages/CustomerDetail.tsx:105` — "Locations" KPI tile has `onClick: () => {}` — clicking does nothing.

## SHOULD-FIX

- `frontend/src/pages/Estimates.tsx:51` — No loading or error state for `useEstimates()`; blank table while request is in flight.
- `frontend/src/pages/Orders.tsx:91-94` — No loading/error state for sales or purchase order tables.
- `frontend/src/pages/OpenSalesOrders.tsx:24` — Same; KPI cards show "0" before data arrives, reads as "no orders" until refetch.
- `frontend/src/pages/Contracts.tsx:332, 633, 648-649` — Print/export column key is `expiration_date` but actual field on `Contract` is `end_date` (`types/api.ts:739`).
- `frontend/src/pages/CreateContract.tsx:147, 180` — Customer field shows `*` and submit disables when empty, but neither the `SearchableCombobox` nor `Issue Date` use any `required` attribute / validation. Customer Blanket PO, Start Date, End Date silently allow any value.
- `frontend/src/pages/CreateEstimate.tsx:55, 192` — `tax_rate` defaults to `'0.00'` and is a free number input; nothing prevents negative or absurd values, no tenant-level "default tax rate".
- `frontend/src/pages/CreateEstimate.tsx:67-75` — `customerLocations` is derived by client-side filtering first page of `/locations/`. If a customer's locations sit beyond page 1, Ship To / Bill To are empty. Pass `partyId` to `useLocations(customer.party)`.
- `frontend/src/pages/CreateCustomer.tsx:404, 187-298` — `credit_limit`, contact `email`, customer `main_email` accept any text; no positive-number assertion on credit_limit (`Number()` of "abc" becomes `NaN`).
- `frontend/src/pages/CreateCustomer.tsx:493, 568` — Inline location and contact "Name *" labeled required but have no `required` attribute or client-side validation.
- `frontend/src/pages/EstimateDetail.tsx:511` — "Convert" submenu uses `onMouseDown` instead of `onClick`. With `onBlur` timeout at 484, works on mouse but is keyboard-inaccessible.
- `frontend/src/pages/EstimateDetail.tsx:960` — Mobile FAB "Convert to SO" passes whole `estimate` object as `state.fromEstimate`, but receiving `CreateSalesOrder` expects flat `{ id, customer, lines: [...] }` shape. Mobile path leaves new SO without prefilled customer/lines.
- `frontend/src/pages/CreateContract.tsx:293` — Submit button disables only when `!formData.customer`; lines with no quantity/item silently filtered out (line 96) and submits empty `lines: []` payload with no warning.
- `frontend/src/pages/CreateEstimate.tsx:133` — Submit payload uses `as any`; catch on 137-143 only surfaces first key — line-level errors hidden.
- `frontend/src/pages/CreateSalesOrder.tsx:284-290` — Fire-and-forget `api.get('/items/.../similar/')` swallows all errors with `.catch(() => {})`.
- `frontend/src/pages/OpenSalesOrders.tsx:51` — Customer filter compares `order.customer_name` as a string — case sensitive — and the dropdown is built from the same un-paginated list (line 100).
- `frontend/src/pages/CustomerDetail.tsx:46-53` — Sub-customer query uses `params: { party__parent: customer?.party }` — verify the backend filter accepts that exact name.
- `frontend/src/pages/CreateSalesOrder.tsx:382` — Backend errors stringified as `${firstKey}: ${msg[firstKey]}` — renders Django serializer keys ("non_field_errors:") to the user.

## NIT

- `frontend/src/pages/CustomerDetail.tsx:67` — Local `const contacts =` shadows imported semantic.
- `frontend/src/pages/EstimateDetail.tsx:183`, `ContractDetail.tsx:285`, `SalesOrderDetail.tsx:254` — `console.error('Failed to save ...', error)` left alongside the toast.
- Many `as any` casts on form payloads / row maps; type drift waiting to happen.
- `Dashboard.tsx:211, 265` — `formatter={((v) => ...) as any}` on Recharts tooltips.
- `CreateCustomer.tsx:131` — `country: 'USA'` hardcoded default.
- `Estimates.tsx:228`, `Orders.tsx:369`, `EstimateDetail.tsx:228` — `window.open('/api/v1/.../pdf/', '_blank')` assumes Django session auth + same-origin; pilot user in a tab with stale session opens a JSON error.
- `CreateSalesOrder.tsx:357` — `priority: 5` hardcoded.
- `CreateEstimate.tsx:23-24` — Locally-defined `dangerBtnClass`/`dangerBtnStyle`.
- `Estimates.tsx:189-190` — Total cell does `parseFloat(...).toFixed(2)` without `formatCurrency`; displays "1234.50" instead of "$1,234.50".
- `OpenSalesOrders.tsx:139, 146` — `new Date(order.order_date)` without `+ 'T00:00:00'`; in negative-UTC zones the displayed day shifts.
- `Orders.tsx:233, 346` — Same untreated-as-decimal `parseFloat(...).toFixed(2)`.
