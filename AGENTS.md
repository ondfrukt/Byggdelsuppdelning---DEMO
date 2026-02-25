# AGENTS

## Table Pattern (Mandatory)
- All new tables in modules, views, and modals must use the shared `SystemTable` component (`static/js/components/system-table.js`).
- Default behavior required:
  - global search
  - column search row
  - sortable headers with indicators
- Reuse existing table CSS classes:
  - `table-container`
  - `data-table`
  - `column-search-row`
  - `column-search-input`
  - `object-type-badge`
- Type values must be rendered as badges using `getObjectTypeColor(typeName)`.
- Prefer standard column order when applicable: `ID`, `Typ`, `Namn`, `Beskrivning`, `Actions`.
- Do not create one-off table implementations unless explicitly requested.

## Codex Workflow
When implementing a new table:
1. Check `docs/ui-table-standard.md`.
2. Implement with `SystemTable`.
3. Add only module-specific behavior via `columns.render`, `onRender`, and event delegation.
