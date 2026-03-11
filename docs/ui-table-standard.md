# UI Table Standard

This document defines the default table pattern for new modules, views, and modals.

## Goal
Use one shared table behavior and visual style across the system.

## Required Defaults
- Use `SystemTable` for all new tables unless there is a strong technical reason not to.
- Use existing table classes:
  - `table-container`
  - `data-table`
  - `column-search-row`
  - `column-search-input`
  - `object-type-badge`
- Enable by default:
  - Global search input
  - Column search row
  - Sortable headers with indicators (`↕`, `↑`, `↓`)
  - Resizable columns
  - Column reordering by drag-and-drop where the module supports configurable column order

## Resize Standard
Resizable tables must follow the same structural pattern as object-list.

- The rendered `<table>` must include an explicit `<colgroup>` with one `<col>` per visible column.
- Header cells in the first header row must expose `data-column-key`.
- Body cells should expose the same `data-column-key` for consistency and debugging.
- Resizable headers should use the `resizable-column` class.
- Tables with manual column resizing should use fixed-width resizing behavior, not content-driven redistribution across sibling columns.
- Prefer `makeTableColumnsResizable(...)` with:
  - `headerSelector: 'thead tr:first-child th[data-column-key]'`
  - `getColumnKey: (header) => header?.dataset?.columnKey || ''`
  - `fixedLayout: true`
- Persist widths by column key, not by visual index.
- If an existing table structure changes in a way that invalidates old width state, version the storage key instead of trying to reinterpret stale widths.

## Visual Baseline
The current object list is the visual and interaction baseline for system tables.

That means:
- Sticky header row and sticky column search row.
- Compact density with clear horizontal scan lines.
- Selected rows should be visibly highlighted.
- If one row is actively shown in a detail view, it should have a stronger visual state than ordinary multi-selection.
- Column settings panels should open as overlays/popovers above the table, not push table content downward.
- When horizontal scrolling is needed, the table may overflow the container, but it must not introduce artificial empty width after the last column.
- The column being resized must be the only column whose width changes visibly during drag.

## Standard Column Convention
When applicable, use this order:
1. `ID`
2. `Typ`
3. `Namn`
4. `Beskrivning`

Avoid adding an `Actions` column by default. Prefer contextual actions in a detail panel, row detail view, or dedicated toolbar when that keeps the table cleaner.

## Type Display
- Type must be displayed as badge (not plain text).
- Badge color should come from `getObjectTypeColor(typeName)`.

## Reusable Component
File: `static/js/components/system-table.js`

Basic usage example:

```js
const table = new SystemTable({
    containerId: 'my-table-container',
    columns: [
        { field: 'auto_id', label: 'ID', className: 'col-id' },
        { field: 'type', label: 'Typ', className: 'col-type', badge: 'type' },
        { field: 'name', label: 'Namn', className: 'col-name' },
        { field: 'description', label: 'Beskrivning', className: 'col-description' },
    ],
    rows,
    emptyText: 'Inga objekt hittades'
});

table.render();
```

Resizable tables should render markup equivalent to:

```html
<table class="data-table">
    <colgroup>
        <col data-column-key="auto_id">
        <col data-column-key="type">
        <col data-column-key="name">
        <col data-column-key="description">
    </colgroup>
    <thead>
        <tr>
            <th class="resizable-column col-id" data-column-key="auto_id">ID</th>
            <th class="resizable-column col-type" data-column-key="type">Typ</th>
            <th class="resizable-column col-name" data-column-key="name">Namn</th>
            <th class="resizable-column col-description" data-column-key="description">Beskrivning</th>
        </tr>
    </thead>
</table>
```

## Implementation Rules
- Do not create one-off table markup for new features if `SystemTable` can be used.
- Prefer keeping row actions outside the table when a detail panel already exists.
- Avoid custom sorting/search logic per module unless business logic requires it.
- If module-specific behavior is needed, implement it via `columns.render`, `onRender`, and event delegation.
- If columns are configurable, persist both `column_order` and `column_widths`.
- If column selection/configuration is exposed, render it as an overlay anchored to the table toolbar or filter row.
