# UI Table Standard

Detta dokument definierar standardmönstret för tabeller i projektet.

Projektet innehåller fortfarande några äldre tabeller som använder `TableSort` och egen markup. De ska betraktas som legacy och migreras till `SystemTable` när de ändå berörs, inte kopieras som nytt mönster.

## Grundregel

Alla nya tabeller i moduler, vyer och modaler ska byggas med `SystemTable`.

Fil:

- [static/js/components/system-table.js](/workspaces/Byggdelsuppdelning---DEMO/static/js/components/system-table.js)

Undantag ska vara sällsynta och motiveras av ett verkligt tekniskt hinder, inte av bekvämlighet.

## Obligatoriska standardval

Nya tabeller ska som utgångspunkt ha:

- global sökning
- kolumnsökrad
- sorterbara headers med indikatorer

Återanvänd dessa CSS-klasser:

- `table-container`
- `data-table`
- `column-search-row`
- `column-search-input`
- `object-type-badge`

## Kolumnordning

När det är relevant används denna ordning:

1. `ID`
2. `Typ`
3. `Namn`
4. `Beskrivning`
5. `Actions`

`Actions` ska bara tas med när raden faktiskt behöver direkta radåtgärder. Om en detaljpanel eller separat arbetsyta redan bär interaktionen är det ofta bättre att utelämna kolumnen.

## Typvisning

- Typ ska visas som badge, inte som vanlig text.
- Färg ska hämtas via `getObjectTypeColor(typeName)`.

## Resize- och strukturkrav

Tabeller som har kolumnbredder eller konfigurerbar kolumnordning ska följa samma grundstruktur som objektlistan:

- rendera ett explicit `<colgroup>`
- sätt `data-column-key` på headerceller
- använd samma kolumnnyckel konsekvent för lagrad state
- versionera `tableId` eller lagringsnyckel om gamla kolumninställningar inte längre är kompatibla

Om manuell resize används ska beteendet vara fixed-layout-liknande: den kolumn som dras är den som synligt ändrar bredd.

`SystemTable` är nu standard även för detta:

- kolumnbredder är justerbara som standard
- kolumner är flyttbara som standard
- både kolumnordning och bredder persisteras via tabellens state

Om en modul måste använda egen resize- eller drag/drop-logik ska det vara ett aktivt undantag och standardbeteendet stängas av med `resizableColumns: false` och/eller `reorderableColumns: false`.

## Visuell baseline

Objektlistan är projektets visuella referens för tabeller. Det innebär normalt:

- sticky header
- sticky kolumnsökrad
- kompakt densitet
- tydlig markering av vald rad
- overlays eller popovers för kolumninställningar i stället för att trycka ner tabellen

## Implementationsregler

- Skriv inte ny one-off-tabellmarkup om `SystemTable` räcker.
- Lägg modulspecifikt beteende i `columns.render`, `onRender` och event delegation.
- Undvik egen sorterings- eller söklogik per modul om inte affärsregler kräver det.
- Om kolumner är konfigurerbara ska både ordning och bredder kunna persistenteras.
- Om du arbetar i en legacy-tabell med `TableSort`, migrera hellre till `SystemTable` än att bygga vidare på det äldre mönstret.

## Minimal exempelanvändning

```js
const table = new SystemTable({
    containerId: 'my-table',
    columns: [
        { field: 'id_full', label: 'ID', className: 'col-id', width: 120 },
        { field: 'type', label: 'Typ', className: 'col-type', badge: 'type', width: 140 },
        { field: 'name', label: 'Namn', className: 'col-name', width: 220 },
        { field: 'description', label: 'Beskrivning', className: 'col-description', width: 320 }
    ],
    rows,
    emptyText: 'Inga rader hittades'
});

table.render();
```
