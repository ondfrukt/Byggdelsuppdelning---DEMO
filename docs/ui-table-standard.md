# UI Table Standard

Detta dokument definierar standardmönstret för tabeller i projektet.

Projektet innehåller fortfarande några äldre tabeller som använder `TableSort` och egen markup. De ska betraktas som legacy och migreras till `SystemTable` eller `TreeTable` när de ändå berörs, inte kopieras som nytt mönster.

---

## Visuell referens

Två demo-tabeller i admin-panelen utgör det godkända utseendet och beteendet för alla nya tabeller i systemet:

| Demo | Flik i admin | Komponent | Användningsfall |
|---|---|---|---|
| **Tabell-demo** | Admin → Tabell-demo | `SystemTable` | Platta listor, sökbara datamängder |
| **Träd-demo** | Admin → Träd-demo | `TreeTable` | Hierarkisk data med förälder–barn-relationer |

Nya tabeller ska matcha dessa i täthet, typografi, färger och interaktionsmönster. Om en ny tabell avviker visuellt från demo-tabellerna ska det motiveras.

---

## Grundregel

- Platt data → `SystemTable` (`static/js/components/system-table.js`)
- Hierarkisk data → `TreeTable` (`static/js/components/tree-table.js`)

`TreeTable` bygger på `SystemTable` och ärver alla dess funktioner.

Undantag ska vara sällsynta och motiveras av ett verkligt tekniskt hinder, inte av bekvämlighet.

---

## Kompakt header

Båda komponenterna renderar automatiskt en kompakt headerrad som innehåller:

- **Sökfält** (global sökning, 200 px bred)
- **Batch-knappar** — visas automatiskt när rader är markerade
- **Kolumner-knapp** — dropdown för att visa/dölja kolumner

Alla dessa element ligger på samma rad. Det finns ingen separat `.filters`-rad.

---

## Obligatoriska standardval

Nya tabeller ska som utgångspunkt ha:

- global sökning (`globalSearch: true`, standard)
- kolumnsökrad (`columnSearch: true`, standard)
- sorterbara headers (`SystemTable`; i `TreeTable` bevaras trädstrukturen och sortering sker inte)
- justerbara kolumnbredder (`resizableColumns: true`, standard)
- omsorterbar kolumnordning (`reorderableColumns: true`, standard)
- kolumnsynlighet (`columnVisibility: true`, standard)

Återanvänd dessa CSS-klasser:

- `table-container`
- `data-table`
- `column-search-row`
- `column-search-input`
- `object-type-badge`

---

## Radmarkering och batch-operationer

Aktiveras med `selectable: true`. Ingen kryssrutekolumn — markering via musklick med modifieringstangenter:

| Klick | Beteende |
|---|---|
| Vanligt klick | Markerar enbart den raden |
| `Ctrl`/`Cmd` + klick | Lägger till / tar bort raden |
| `Shift` + klick | Markerar intervall från ankarpunkten |
| `Shift` + `Ctrl` + klick | Intervall men bevarar befintlig markering |

Markerade rader får klassen `system-table-row-selected` med samma blå färg som objektlistan.

Batch-knappar definieras via `batchActions` och visas automatiskt i headern när minst en rad är markerad.

**Viktiga metoder:**

| Metod | Beskrivning |
|---|---|
| `getSelectedRows()` | Returnerar array med markerade radobjekt |
| `clearSelection()` | Avmarkerar alla rader |
| `selectAllRows()` | Markerar alla synliga rader |
| `onSelectionChange(rows, table)` | Callback vid förändrad markering |

---

## Kolumnsynlighet

Aktivt som standard (`columnVisibility: true`). Användaren kan visa/dölja enskilda kolumner via "Kolumner"-knappen. Valet persisteras i `localStorage` per `tableId`. Minst en kolumn är alltid synlig.

---

## TreeTable — hierarkisk data

`TreeTable` tar hierarkisk data (objekt med `children`-arrayer) och hanterar expand/kollaps, sökning längs trädvägar och hierarkifärgning.

### Expand/kollaps

- Klick på `❯`-ikonen eller var som helst i **namnkolumnen** togglar noden
- **Dubbelklick** på namnkolumnen kollapsar alla direkta barn ett nivå nedanför (deras underträd döljs)
- `Ctrl`/`Shift`-klick reserveras för radmarkering och togglar inte
- Första nivån expanderas automatiskt vid initiering (`defaultExpanded: true`)
- `expandAll()` / `collapseAll()` / `collapseChildren(nodeId)` tillgängliga som publika metoder

### Hierarkifärgning

Rader med barn får orange bakgrundsfärg som mattas av per djupnivå (level 0–3+), definierad i `TreeView.css`. Löv-noder har vit bakgrund.

### Sökning i träd

När sökning är aktiv visas automatiskt alla noder som matchar **eller** har matchande ättlingar. Trädet kollapsas tillbaka när sökningen rensas.

### TreeTable-specifika alternativ

| Option | Standard | Beskrivning |
|---|---|---|
| `nodeId` | `'id'` | Fält som unikt identifierar varje nod |
| `nodeChildren` | `'children'` | Fält som innehåller barnarray |
| `nameField` | Första kolumnens `field` | Kolumn som får indrag och toggle-ikon |
| `indentPx` | `16` | Pixlar per djupnivå |
| `defaultExpanded` | `true` | Expandera första nivån vid start |

---

## Kolumnordning

När det är relevant används denna ordning:

1. `Namn` (alltid först i trädvy — får indrag och toggle)
2. `Typ`
3. `Status`
4. `Ansvarig`
5. `Datum`
6. `Beskrivning / Anteckning`
7. `Actions`

`Actions` tas bara med när raden behöver direkta radåtgärder.

---

## Typvisning

- Typ ska visas som badge, inte som vanlig text.
- Färg ska hämtas via `getObjectTypeColor(typeName)`.

---

## Resize- och strukturkrav

- Kolumnbredder är justerbara och omsorterningsbara som standard
- Kolumnordning, bredder och dolda kolumner persisteras i `localStorage` per `tableId`
- Versionera `tableId` om sparad state inte längre är kompatibel med ny kolumnstruktur

---

## Implementationsregler

- Skriv inte ny one-off-tabellmarkup om `SystemTable` eller `TreeTable` räcker.
- Lägg modulspecifikt beteende i `columns.render`, `onRender` och event delegation.
- Undvik egen sorterings- eller söklogik per modul om inte affärsregler kräver det.
- Om du arbetar i en legacy-tabell med `TableSort`, migrera hellre till `SystemTable` än att bygga vidare.

---

## Exempelanvändning

### Enkel platt tabell (SystemTable)

```js
new SystemTable({
    containerId: 'my-table',
    tableId: 'my-table',
    columns: [
        { field: 'id',     label: 'ID',     className: 'col-id',   width: 80 },
        { field: 'name',   label: 'Namn',   className: 'col-name', width: 220 },
        { field: 'status', label: 'Status', className: 'col-status', width: 120,
          render(row) { return escapeHtml(row.status); }
        }
    ],
    rows,
    emptyText: 'Inga rader hittades'
}).render();
```

### Platt tabell med markering och batch

```js
new SystemTable({
    containerId: 'my-table',
    tableId: 'my-table',
    rowId: 'id',
    selectable: true,
    batchActions: [
        {
            label: 'Ändra status',
            action(selectedRows, table) {
                // utför åtgärd
                table.clearSelection();
            }
        }
    ],
    columns: [...],
    rows
}).render();
```

### Hierarkisk tabell (TreeTable)

```js
new TreeTable({
    containerId: 'my-tree',
    tableId: 'my-tree',
    nodeId: 'id',
    nameField: 'name',
    rowId: 'id',
    selectable: true,
    batchActions: [
        { label: 'Exportera', action(rows) { /* ... */ } }
    ],
    columns: [
        { field: 'name',   label: 'Namn',   className: 'col-name col-tree-name', width: 260 },
        { field: 'type',   label: 'Typ',    className: 'col-type',  width: 130 },
        { field: 'status', label: 'Status', className: 'col-status', width: 120,
          render(row) { return escapeHtml(row.status); }
        }
    ],
    rows   // array med children-arrayer
}).render();
```

### Stänga av funktioner

```js
new SystemTable({
    containerId: 'compact-table',
    globalSearch: false,
    columnSearch: false,
    columnVisibility: false,
    resizableColumns: false,
    reorderableColumns: false,
    columns: [...],
    rows
}).render();
```
