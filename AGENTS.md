# AGENTS

## Table Pattern (Mandatory)
- Flat data → `SystemTable` (`static/js/components/system-table.js`)
- Hierarchical/tree data → `TreeTable` (`static/js/components/tree-table.js`)
- `TreeTable` extends `SystemTable` and inherits all its features.
- Default behavior (all on by default, disable explicitly if not needed):
  - global search
  - column search row
  - sortable headers (SystemTable only; TreeTable preserves tree order)
  - resizable columns
  - reorderable columns
  - column visibility toggle
- Row selection and batch operations: use `selectable: true` + `batchActions`. No checkboxes — Ctrl/Cmd+click toggles, Shift+click selects range, plain click selects single row.
- In TreeTable: clicking anywhere on the name cell of a parent row expands/collapses it. Ctrl/Shift clicks are reserved for selection.
- Reuse existing table CSS classes:
  - `table-container`, `data-table`, `column-search-row`, `column-search-input`, `object-type-badge`
  - TreeTable also uses: `tree-table`, `tree-node`, `tree-toggle`, `tree-spacer`, `tree-cell-content`, `tree-label`
- Type values must be rendered as badges using `getObjectTypeColor(typeName)`.
- Preferred column order: `Namn` (first in tree), `Typ`, `Status`, `Ansvarig`, `Datum`, `Beskrivning`, `Actions`.
- Do not create one-off table implementations unless explicitly requested.
- **Visual standard**: Admin → Tabell-demo (flat) and Admin → Träd-demo (tree) are the approved visual reference. New tables must match these in density, typography and interaction.

## Form / Panel Pattern (Mandatory)
- See full standard: `docs/ui-form-standard.md`
- **Visual standard**: Admin → Formulär-demo is the approved visual reference for all forms and create/edit panels.
- Layout: 2-column grid (`.form-demo-fields`), gray background (`#f1f5f9`), white inputs (`#ffffff`, border `#cbd5e1`).
- Field width: `form-group-half` (1 col), `form-group-full` (2 cols). Full-width for type selector, description, section dividers.
- `ManagedMultiSelect`: always include the search row (`.managed-multi-select-search` inside toolbar). Never omit it regardless of option count.
- **Type selection flow**: Object type is chosen via a dropdown on the "Skapa"-button *before* the form opens. The form panel itself never contains a type selector field.

## Codex Workflow
When implementing a new table:
1. Check `docs/ui-table-standard.md`.
2. Choose `SystemTable` (flat) or `TreeTable` (hierarchical).
3. Add only module-specific behavior via `columns.render`, `onRender`, and event delegation.

When implementing a new form/panel:
1. Check `docs/ui-form-standard.md`.
2. Use `.form-demo-fields` grid with `form-group-half` / `form-group-full`.
3. Apply gray form background + white inputs for contrast.
