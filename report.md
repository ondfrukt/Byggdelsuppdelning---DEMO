# Granskning: objektstyper, filer och referensintegritet

## Scope och metod
Denna granskning baseras på kod- och schemaspår i repositoryt (modeller, routes, seed/migrations och frontend-komponenter).

Analyserade huvudfiler:
- `models/document.py`, `models/object.py`, `models/object_type.py`, `models/relation.py`
- `routes/documents.py`, `routes/objects.py`, `routes/object_relations.py`
- `static/js/components/file-upload.js`, `static/js/components/object-detail-panel.js`, `static/js/api.js`
- `new_database.py`

---

## 1) Nuvarande status (As-Is)

### 1.1 Datamodell

**Styrkor**
- Filer lagras centralt i tabellen `documents`.
- `documents.object_id` har FK till `objects.id`, vilket ger grundläggande ägarskap mot ett objekt.

**Problem mot målbild**
- Ägarskapet är kopplat till **vilket objekt som helst** (`documents.object_id -> objects.id`), inte explicit till filobjekt.
- Ingen constraint/triggermekanism säkerställer att `documents.object_id` pekar på objekt av typen `Filobjekt`.
- Historisk typbenämning `Ritningsobjekt` finns kvar i seed (`new_database.py`) och i UI-logik.
- Det finns ingen explicit länkmodell/tabell som semantiskt låser relationen till `other_object -> filobjekt`; istället används generell `object_relations` utan typregler.

### 1.2 API

**Styrkor**
- Dokumentuppladdning och hämtning finns i dedikerad route (`/api/objects/<id>/documents`).
- Relationer mellan objekt hanteras via `/api/objects/<id>/relations`.

**Problem mot målbild**
- `POST /api/objects/<id>/documents` accepterar uppladdning för valfritt objekt-id, ingen kontroll mot objekttyp.
- `GET /api/objects/<id>/documents` listar direkta filer för valfritt objekt.
- Relation-API är generiskt och tillåter länkar utan domänregler (kan skapa relationer som bryter önskad semantik).

### 1.3 UI/UX

**Styrkor**
- UI har redan ett arbetssätt för dokumentobjekt/ritningsobjekt i `file-upload.js`: skapa dokumentobjekt, ladda upp fil(er) på det objektet, koppla relation.
- Dokumentflödet innehåller funktioner för att koppla befintliga dokumentobjekt.

**Problem mot målbild**
- UI visar fortfarande “Filer på aktuellt objekt”, vilket signalerar att vanliga objekt kan äga filer direkt.
- Typidentifiering bygger på namnmatchning (`ritning`/`dokument`) istället för canonical typ-ID/flagga.
- Detail/documents-layout är inte strikt uppdelad mellan “vanligt objekt” och “filobjekt”, utan blandar direkta filer + länkade objekt.

---

## 2) Identifierade regelbrott / risker

### Regel 1: Endast filobjekt får äga filer
- **Status:** Ej garanterad i DB och API.
- **Konsekvens:** Risk för referensintegritetsbrott vid framtida API/UI-förändringar, svag datakvalitet.

### Regel 2: Andra objekt får endast referera via filobjekt
- **Status:** Delvis uppfylld i modern UI-flow, men ej enforce:ad i DB/API.
- **Konsekvens:** Möjlighet att fortsätta skapa direkta filer på vanliga objekt.

### Regel 3: UI särskiljer filobjekt och vanliga objekt
- **Status:** Delvis; men språk, visning och åtkomster är fortfarande blandade.
- **Konsekvens:** Otydligt för användare, högre risk för felaktig användning.

---

## 3) Rekommenderad målarkitektur (To-Be)

1. **Filägarskap hårdlåses i DB**
   - `documents.filobjekt_id` (FK -> `objects.id`) ersätter `object_id`.
   - Trigger validerar att `filobjekt_id` refererar till objekt av typen `Filobjekt`.

2. **Länkar går endast via filobjekt**
   - Fortsätt med `object_relations`, men enforce med trigger:
     - För relationstyp `dokumenterar` ska ena sidan vara `Filobjekt`, andra sidan **inte** `Filobjekt`.

3. **Canonical typ**
   - Byt namn `Ritningsobjekt` -> `Filobjekt`.
   - Inför stabil teknisk markör (rekommenderat): `object_types.code = 'FILE_OBJECT'` (unik), så logik inte är beroende av språk/namn.

4. **API separation**
   - Dokument-endpoints riktas mot filobjekt.
   - Vanliga objekt får endast länka/avlänka filobjekt.

5. **UI separation**
   - Vanligt objekt: dokumentflik visar *länkade filobjekt* (+ snabbåtgärder att skapa/koppla).
   - Filobjekt: dokumentflik visar *fysiska filer* (upload/download/delete) + metadata.

---

## 4) Datamigreringsplan (översikt)

1. Skapa/uppdatera objekttyp `Filobjekt` (rename från `Ritningsobjekt`).
2. Identifiera alla `documents` där ägarobjekt **inte** är filobjekt.
3. Skapa ett nytt filobjekt per felaktigt ägd fil (eller per ägarobjekt, beroende på affärsregel).
4. Flytta filägarskap: `documents.filobjekt_id = nytt_filobjekt.id`.
5. Skapa relation `original_owner --(dokumenterar)--> nytt_filobjekt`.
6. Lägg på constraints/triggers som blockerar framtida avvikelser.

Detaljerad SQL finns i `migration.sql` och `ddl_changes.sql`.

---

## 5) Identifieringsfrågor (för pre-run i produktion)

Kör innan migrering:
- Hur många dokument ägs idag av icke-filobjekt?
- Finns dokument med null/trasig FK?
- Finns relationer som är `dokumenterar` men saknar filobjekt på ena sidan?

Dessa kontroller finns som SQL i `migration.sql` (audit-sektion).

---

## 6) Slutsats

Nuvarande implementation är nära en bra domänmodell men saknar hårda garantier i databasen och ett konsekvent API/UI-kontrakt. Med föreslagna DDL-regler, migrering och UI/API-separering uppnås:
- stark referensintegritet,
- tydlig spårbarhet objekt -> filobjekt -> filer,
- bättre användarupplevelse utan att kompromissa med datakvalitet.
