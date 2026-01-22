# Plan: Fix Top Drop Zone Reordering in Scheduler

## Problem Statement

When dragging an order card and dropping it in the "Drop here" zone **above** an existing card in a calendar cell, the order does not get placed above the existing cards. Instead, the reshuffling/reordering doesn't happen correctly.

## Root Cause Analysis

After analyzing the code, I've identified the following issues:

### Issue 1: Drop Zone Only Shows When Hovering Entire Cell (Minor)

The top drop zone visibility in `CalendarCell.tsx:257` depends on:
```tsx
{isDragActive && hasContent && isValidDropTarget && (
```

This is correct - the zone is visible. However, the `hoveredCellId` prop is passed but never used for drop zone visibility. This is actually fine since we want zones visible in any valid drop cell.

### Issue 2: **MAIN BUG** - Collision Detection Returns Cell Instead of Top Zone

Looking at the collision detection in `Scheduler.tsx:98-106`:

```tsx
// Prioritize cell-top and cell-bottom drop zones (use pointerWithin for precision)
const topZoneCollision = pointerCollisions.find((c) => String(c.id).startsWith('cell-top-'))
if (topZoneCollision) {
  return [topZoneCollision]
}
```

The `pointerWithin` collision detection requires the **cursor** to be strictly inside the drop zone element. However, when dragging a card, the **cursor** may be positioned at the top-left of the drag overlay (near the drag handle), NOT at the center or where the user visually expects.

When dropping near the top of a cell:
1. The drag overlay might visually be over the top zone
2. But the pointer (cursor) might still be inside the **main cell area** or even over an order card
3. The collision detection finds `cell-` (main cell) collision via `rectIntersection` first

### Issue 3: Collision Priority Check Order

The collision detection checks in this order:
1. `order-drop-*` (pointerWithin) - for order-on-order drops
2. `run-drop-*` (pointerWithin) - for run drops
3. `unscheduled` (pointerWithin)
4. `cell-top-*` (pointerWithin) ← **Too strict for small zones**
5. `cell-bottom-*` (pointerWithin) ← **Too strict for small zones**
6. `cell-*` (rectIntersection) ← **Catches most drops**

The issue is that `cell-top-*` uses `pointerWithin` which is very strict. The top zone is only 32px tall (`min-h-[32px]`), so unless the cursor is precisely inside it, the collision won't register.

### Issue 4: When Top Zone IS Detected, Logic Should Work

The drop handling logic in `Scheduler.tsx:578-612` looks correct:
- It builds `targetCellOrders` excluding the dragged order
- For `position === 'top'`, it creates `[draggedOrder, ...targetCellOrders]`
- It assigns sequences as `(index + 1) * 1000`

So the backend logic appears correct - the issue is that **the top zone collision is rarely triggered** due to strict pointer detection.

## Solution

### Fix: Use `rectIntersection` for Top/Bottom Zone Detection

Change the collision detection to use `rectIntersection` (more lenient) for top/bottom zones instead of `pointerWithin`. This will detect the drop zone when the dragged element overlaps it, not just when the cursor is inside it.

**BUT** we need to be careful about priority. If we use `rectIntersection` for both zones and the cell, we need a smart way to pick which one.

### Proposed Solution: Hybrid Approach

1. First check for `pointerWithin` collisions for order/run targets (keep strict for merging)
2. For cell-related drops, collect ALL rect collisions involving `cell-`, `cell-top-`, `cell-bottom-`
3. **Pick the zone based on cursor Y-position relative to the cell**:
   - If cursor is in the top ~40px of the cell → prefer `cell-top-*` if present
   - If cursor is in the bottom ~40px of the cell → prefer `cell-bottom-*` if present
   - Otherwise → use main `cell-*`

Actually, simpler approach:

### Simpler Solution: Increase Zone Priority with rectIntersection

Change lines 98-107 in `Scheduler.tsx` to:

```tsx
// For cell zones, check rect intersection (more lenient) but prioritize zones over main cell
const topZoneRect = rectCollisions.find((c) => String(c.id).startsWith('cell-top-'))
if (topZoneRect) {
  return [topZoneRect]
}

const bottomZoneRect = rectCollisions.find((c) => String(c.id).startsWith('cell-bottom-'))
if (bottomZoneRect) {
  return [bottomZoneRect]
}
```

This means if the dragged element overlaps with a top or bottom zone AT ALL, those zones will be prioritized. The zones are small (32px), so only when actually near top/bottom will they trigger.

## Implementation Steps

1. **Modify `Scheduler.tsx`** - Update the `orderFirstCollision` function:
   - Keep `pointerWithin` for order-drop-*, run-drop-*, and unscheduled targets
   - Switch to `rectIntersection` for `cell-top-*` and `cell-bottom-*` zones
   - Keep `rectIntersection` for main `cell-*` (lower priority)

2. **Test the changes**:
   - Drag an order from unscheduled to a cell with existing orders
   - Drop in the TOP zone - verify order appears first (lowest sequence)
   - Drop in the BOTTOM zone - verify order appears last (highest sequence)
   - Drop on the main cell (middle) - verify order appends (current behavior)
   - Verify order-on-order drops still work for creating runs
   - Verify dragging between cells still works

## Files to Modify

- `frontend/src/pages/Scheduler.tsx` - Lines 98-119 (collision detection function)

## Code Change

```tsx
// BEFORE (lines 98-119):
// Prioritize cell-top and cell-bottom drop zones (use pointerWithin for precision)
const topZoneCollision = pointerCollisions.find((c) => String(c.id).startsWith('cell-top-'))
if (topZoneCollision) {
  return [topZoneCollision]
}

const bottomZoneCollision = pointerCollisions.find((c) => String(c.id).startsWith('cell-bottom-'))
if (bottomZoneCollision) {
  return [bottomZoneCollision]
}

// Otherwise return the first rect collision (cell)
if (rectCollisions.length > 0) {
  // Prefer cell droppables over nested elements (but not the zone-specific ones)
  const cellCollision = rectCollisions.find((c) => {
    const id = String(c.id)
    return id.startsWith('cell-') && !id.startsWith('cell-top-') && !id.startsWith('cell-bottom-')
  })
  if (cellCollision) {
    return [cellCollision]
  }
  return [rectCollisions[0]]
}


// AFTER:
// For cell zones, use rectIntersection (more lenient) to detect when drag overlay
// overlaps with the zone. Prioritize zones over main cell for correct reordering.
const topZoneRect = rectCollisions.find((c) => String(c.id).startsWith('cell-top-'))
if (topZoneRect) {
  return [topZoneRect]
}

const bottomZoneRect = rectCollisions.find((c) => String(c.id).startsWith('cell-bottom-'))
if (bottomZoneRect) {
  return [bottomZoneRect]
}

// Otherwise return the main cell collision
if (rectCollisions.length > 0) {
  const cellCollision = rectCollisions.find((c) => {
    const id = String(c.id)
    return id.startsWith('cell-') && !id.startsWith('cell-top-') && !id.startsWith('cell-bottom-')
  })
  if (cellCollision) {
    return [cellCollision]
  }
  return [rectCollisions[0]]
}
```

## Risk Assessment

- **Low risk**: The change only affects collision detection priority
- **No backend changes needed**: The API already supports batch updates with sequences
- **Backwards compatible**: Existing behavior for order-on-order and cell drops is preserved
