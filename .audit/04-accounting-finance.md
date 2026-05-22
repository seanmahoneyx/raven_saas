# Accounting/Finance Static Audit — Punch List

## SHOWSTOPPERS (block pilot)

**Invoice AR/AP frontend model does not match backend Invoice model**
- `frontend/src/api/invoicing.ts:7-31` — `Invoice` interface declares `invoice_type: 'AR' | 'AP'`, `party: number`, `party_name: string`.
- Backend `apps/invoicing/models.py:90-150` `Invoice` has NO `invoice_type` field, no `party` FK, only a `customer` FK (Customer-only). Serializer at `apps/api/v1/serializers/invoicing.py:42-76` exposes only `customer`/`customer_name`. There are no AP invoices in the backend.
- Consequences: `Invoices.tsx:66, 71, 105-119, 261-265` (AR/AP type column, party column, totalAR/totalAP KPIs) will always show blank party name and "Payable" toggle is meaningless. `CreateInvoice.tsx:161-176` posts `invoice_type` and `party` — the create call will 400 or silently ignore unknown fields and the customer FK will be NULL → DB IntegrityError on creation. **Pilot users will be unable to create invoices.**

**CreateInvoice posts wrong payment-terms enum**
- `frontend/src/pages/CreateInvoice.tsx:31-38, 166` — sends `terms: 'NET_30'` (and `NET_15`, `NET_45`, …).
- Backend choices are `NET30|NET15|NET45|NET60|DUE_ON_RECEIPT|COD` (no underscore) and the field is named `payment_terms`, not `terms` (`apps/invoicing/models.py:116-124, 178-181`). InvoiceDetail.tsx:177 reads `invoice.payment_terms`. → Every Net‑terms invoice created from the UI will fail server validation.

**Payments table reads `payment_number` field that does not exist**
- `frontend/src/pages/Invoices.tsx:142-201` & `api/invoicing.ts:34-35` reference `payment_number`, but backend `Payment` model (`apps/invoicing/models.py:460-525`) and `PaymentSerializer` (`apps/api/v1/serializers/invoicing.py:26-39`) have no such field. The Payments tab column will render `undefined` for every row.

**Receive-Payment screen does not pass the deposit account it asks the user to pick**
- `frontend/src/pages/ReceivePayment.tsx:52, 55-58, 336-348` — collects `depositAccount` via dropdown.
- `handleSaveDraft:193-200` and `handlePostPayment:238-245` build the payload but never include `depositAccount`/`deposit_account`. The GL posting hits the default cash account regardless of the user's choice.

**Journal Entry filter offers a type that backend has never heard of**
- `frontend/src/pages/JournalEntries.tsx:237-242` filter dropdown options: `manual | adjusting | closing | reversing`. Backend `EntryType` choices are `standard | adjusting | closing | reversing` (`apps/accounting/models.py:254-258`). Selecting "Manual" returns zero rows always.

**Journal entry balance check uses float equality**
- `frontend/src/pages/CreateJournalEntry.tsx:66-73` — `totalDebit === totalCredit` using `parseFloat`. Three lines of 33.33 vs one of 100.00 marks the entry as unbalanced and disables Save even though it's balanced to the cent. Use cents/Decimal or epsilon tolerance.

**Journal entry posts with no zero-rejection / single-side guard**
- `CreateJournalEntry.tsx:78-109` — only checks `isBalanced`. Server field errors (closed period, etc.) are hidden behind a generic toast.

**Invoice tax rate displayed wrong**
- `frontend/src/pages/InvoiceDetail.tsx:208, 417, 531` — renders `(parseFloat(invoice.tax_rate) * 100).toFixed(1) + '%'`. Backend stores `tax_rate` as a percentage decimal (e.g. `8.25`), not a ratio. An 8.25% invoice displays as **"825.0%"** in three places, including the print form.

## SHOULD-FIX

**`payment_method` enum case mismatch in the Payment type**
- `frontend/src/api/invoicing.ts:40` declares lowercase but backend stores uppercase. The Method column happens to render OK after a `.replace('_', ' ')`, but TypeScript type lies.

**ReceivePayment hardcodes account inference by name string**
- `ReceivePayment.tsx:56-58` — filters by `a.name?.toLowerCase().includes('bank')` etc. Tenants who name their checking account "Operating Funds" see an empty dropdown.

**ChartOfAccounts hides Balance everywhere except the print/export**
- `ChartOfAccounts.tsx:65-110` — Balance column not in DataTable. Print config tries to print it but `GLAccount` doesn't expose `balance` — printed column is always em-dashes.

**CreateInvoice does not validate Due Date >= Invoice Date**
- `CreateInvoice.tsx:142-157` — only checks presence. Users can pre-date or back-date.
- Lines `132-136 & 392-393` compute `lineAmount = qty * unit_price` in float; high-quantity carton orders drift from server-computed `line_total` by sub-cents.

**CreateInvoice has no minimum quantity / price validation**
- `CreateInvoice.tsx:449-471` — quantity uses `type="text"`, unit price `type="text"`. Both accept negatives, letters, empty → `parseFloat` → `NaN` → 400.

**JournalEntry create/save flow logs errors to console**
- `CreateJournalEntry.tsx:106`, `JournalEntryDetail.tsx:35, 47`; `PriceListDetail.tsx:115`; `CostListDetail.tsx:101`; `AccountingSettings.tsx:53` — `console.error` left in handlers. Server validation invisible to users.

**Invoice "Send" action has no failure detail**
- `InvoiceDetail.tsx:108-117` — `catch {}` then generic toast. Server validation errors appear as "Failed to send invoice".

**InvoiceDetail uses `as any` in PrintForm**
- Line 54, 161-167 — `(location.state as any)`, etc. Float math on money throughout.

**PriceListDetail/CostListDetail localized 4-decimal currency formatter**
- `PriceListDetail.tsx:123-125` and `CostListDetail.tsx:109-111` define a local `formatCurrency` that prints 4 decimals, shadowing the shared 2-decimal helper.

**FixedAssets "Run Depreciation" reports no error handling**
- `FixedAssets.tsx:268-271` — no try/catch, no toast on failure.

**FixedAssets useEffect race: cost change overwrites manual salvage edits**
- `CreateFixedAsset.tsx:75-84` — every cost change overwrites salvage_value. Auto-fill foot-gun.

**FixedAssets dispose dialog allows $0.00 disposal on sold method without warning**
- `FixedAssetDetail.tsx:381-415` — easy to accidentally write off an asset as "sold for $0".

**Fixed asset disposal dialog has no error handling on the mutation**
- `FixedAssetDetail.tsx:50-59`.

**CreatePriceList navigates to /customers instead of /price-lists on success**
- `CreatePriceList.tsx:69`. CreateCostList navigates correctly.

**Price/cost list line items lack ordering & duplicate guard**
- `CreatePriceList.tsx:55-58`, `CreateCostList.tsx:55-58` — `[1: $10, 1: $5]` makes pricing non-deterministic.

**Receive payment validates one direction only**
- `ReceivePayment.tsx:232-235` — doesn't block zero-amount apply. User can post a $0 effective payment.

## NIT

- `Invoices.tsx:130` — PDF download via `window.open` without auth header — verify works with current auth.
- `Invoices.tsx:476` — `storageKey="bills"` leftover from refactor.
- `Invoices.tsx:105, 113, 174, 248, 252, 263-264, 308, 316` — money via `parseFloat().toLocaleString()` instead of shared `formatCurrency`.
- `JournalEntries.tsx:80` — memo truncated at 60 chars with no title attribute.
- `JournalEntries.tsx:139-142` — `setTimeout(window.print, 100)` race.
- `ChartOfAccounts.tsx` — no "Add Account" / "Edit Account" buttons.
- `AccountingSettings.tsx:14` — `useAccounts()` imported from `@/api/settings`, not `@/api/accounting` — verify shape.
- `CreateJournalEntry.tsx:46-54` — entering a debit clears credit only when value is non-empty.
- `CreateFixedAsset.tsx:87-89` — `depreciation_start_date` always overwritten when acquisition_date changes.

### Highest-leverage three fixes
1. Reconcile `Invoice` model: drop AR/AP/party from frontend OR add `invoice_type` + party polymorphism to backend.
2. Fix `payment_terms` enum (`NET_30` → `NET30`) and field name (`terms` → `payment_terms`).
3. Fix tax-rate display — currently shows tax as **100× the real rate** on every invoice detail and print.
