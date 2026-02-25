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

## Standard Column Convention
When applicable, use this order:
1. `ID`
2. `Typ`
3. `Namn`
4. `Beskrivning`
5. `Actions`

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
        {
            field: 'actions',
            label: '',
            className: 'col-actions',
            sortable: false,
            searchable: false,
            render: (row) => `<button class="btn-icon btn-danger" data-id="${row.id}">🗑️</button>`
        }
    ],
    rows,
    emptyText: 'Inga objekt hittades'
});

table.render();
```

## Implementation Rules
- Do not create one-off table markup for new features if `SystemTable` can be used.
- Keep action buttons in a dedicated action column.
- Avoid custom sorting/search logic per module unless business logic requires it.
- If module-specific behavior is needed, implement it via `columns.render`, `onRender`, and event delegation.
