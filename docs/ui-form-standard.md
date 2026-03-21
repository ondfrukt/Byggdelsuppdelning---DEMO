# UI Formulärstandard

Detta dokument definierar standardmönstret för formulär och datainmatningspaneler i projektet.

---

## Visuell referens

Admin → Formulär-demo är det godkända utseendet och beteendet för alla nya formulär i systemet.

---

## Layout

- **Bredd:** max 860 px (inline-panel), 860 px max-width (modal)
- **Kolumner:** 2-kolumners grid (`grid-template-columns: 1fr 1fr`) via klassen `.form-demo-fields`
- **Kolumnspann:**
  - `form-group-half` — 1 kolumn (hälften)
  - `form-group-full` — 2 kolumner (hela bredden)
  - `form-group-third` — 1 kolumn (används sparsamt)
- Sektionsavdelare (`.form-section-divider`) sträcker sig alltid över hela bredden

---

## Färger och kontrast

- **Formulärbakgrund:** `#f1f5f9` (ljusgrå)
- **Fältbakgrund (inputs, selects, textareas):** `#ffffff` (vit)
- **Kantlinje på fält:** `#cbd5e1`

Regeln: det ska alltid finnas tydlig kontrast mellan formulärets bakgrund och inmatningsfälten.

---

## Kompakt typografi

Formulär använder ett kompaktare typografiläge jämfört med övriga ytor:

| Element | Storlek |
|---|---|
| Formuläret självt | `0.875rem` |
| Labels | `0.8rem` |
| Inputs / selects | `0.85rem`, padding `5px 9px` |
| Hjälptext (`.form-help`) | `0.72rem` |

---

## Fältordning

1. Objekttyp / primär identifierare (full bredd, alltid först)
2. Benämning + Status (halv bredd vardera)
3. Övriga fält i par (halv bredd per fält)
4. Beskrivning / fritext (full bredd)
5. Flervalsfält (full eller halv bredd)
6. Sektionsavdelare: Kategori
7. Sektionsavdelare: Relationer
8. Footer med Avbryt / Spara

---

## Flervalslista (ManagedMultiSelect)

Komponenten `ManagedMultiSelect` används för fält med många valbara alternativ.

**Struktur (alltid):**

```html
<div class="managed-multi-select" data-managed-multi-field="fieldName">
    <select data-managed-multi-hidden="true" multiple>…</select>
    <div class="managed-multi-select-toolbar">
        <input type="text" class="form-control managed-multi-select-search" placeholder="Sök alternativ...">
        <div class="managed-multi-select-actions">
            <button … data-managed-multi-action="select-all">Alla</button>
            <button … data-managed-multi-action="clear">Rensa</button>
        </div>
    </div>
    <div class="managed-multi-select-summary">…badges…</div>
    <div class="managed-multi-select-options">…chips…</div>
</div>
```

**Regler:**
- Sökfältet visas **alltid**, oavsett antal alternativ
- Chip-panelen har `max-height: 200px; overflow-y: auto` — scrollar automatiskt vid många alternativ
- Valda alternativ visas som badges i summary-raden ovanför chip-panelen
- "Inga alternativ matchar sökningen." visas som `.managed-multi-select-no-results` när sökresultatet är tomt

---

## Skapandeflöde (skapa objekt)

Typen väljs **innan** formuläret öppnas, via en dropdown från "Skapa"-knappen:

1. Klick på "Skapa Objekt" → dropdown med alla objekttyper visas
2. Klick på en typ → dropdown stängs, panel öppnas med typens fält direkt
3. Formulärpanelen visar "Skapa [Typnamn]" i rubriken — ingen typväljare i formuläret

Implementeras via `openCreateObjectTypeDropdown(buttonEl)` och `selectCreateObjectType(typeId, typeName)`.

---

## Struktur (CSS-klasser)

| Klass | Syfte |
|---|---|
| `.form-demo-fields` | 2-kolumners grid för fält |
| `.form-demo-form` | Kompakt typografi och grå bakgrund |
| `.form-demo-wrapper` | Yttre begränsning (max-width: 860px) |
| `.form-group-half` | Halvbredskolumn (span 1 av 2) |
| `.form-group-full` | Helbredskolumn (span 2 av 2) |
| `.form-section-divider` | Avdelare med rubriktext |
| `.modal-footer` | Footer med handlingsknapparna |

---

## Implementationsregler

- Skriv inte egna formulärstrukturer om standardklasserna räcker.
- Använd alltid grå bakgrund på formuläret och vita inputs för kontrast.
- Sökfältet i `ManagedMultiSelect` är alltid synligt.
- Typval sker alltid via dropdown *utanför* formuläret, aldrig som ett fält inuti det.
