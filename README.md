# Byggdelssystem

Demoprojekt för ett objektbaserat informationssystem med fokus på byggdelar, relationer, filobjekt och styrd administration. Projektet är byggt i Flask + vanilla JavaScript och fungerar som en flexibel sandlåda för datamodellering, UI-flöden och adminstyrning.

## Systemet i korthet

Systemet kretsar kring objekt av olika typer. Varje objekttyp kan ha egna fält, egen färg, egna listkolumner och egna relationsregler. Funktionaliteten täcker idag bland annat:

- objektregister med konfigurerbara metadatafält
- trädvyer för `byggdelar`, `utrymmen` och `system`
- relationshantering med relationstyper och regelmatris
- filobjekt där endast filobjekt får äga uppladdade filer
- richtextfält med TinyMCE och fallback-editor
- administrerade listor med hierarkier, översättningar och fältbindningar
- fältmallar och styrning av obligatoriska/systemstyrda fält
- change management med change-poster och påverkade objekt
- konfigurerbara tabellvyer via den gemensamma `SystemTable`-komponenten

## Huvudvyer i UI

- `Trädvy`: hierarkisk vy av objekt, grupperad utifrån vald trädlogik.
- `Objekt`: tabellvy för vanliga objekt med filter, kolumnsökning, bulk-redigering och detaljpanel.
- `Filobjekt`: separat arbetsyta för dokumentbärande objekt.
- `Change Management`: register och detaljvy för CRQ/CO/RO samt påverkade objekt.
- `Admin`: objekttyper, listor, fältmallar och relationsregler.

## Centrala domänregler

- Alla objekt har `main_id`, `version` och normaliserat `id_full`.
- Varje objekttyp måste ha ett namnfält (`namn`), och systemet säkerställer det via migrationer och adminlogik.
- Relationer lagras som egna entiteter mellan två objekt, inte som inbäddade barnlistor.
- Endast objekt av typen `FileObject` eller `Filobjekt` får äga dokument i `documents`-tabellen.
- Vanliga objekt kopplas till filer indirekt genom relationer till filobjekt.
- Styrda listor kan bindas till fält och användas som enkel- eller multival.

## Teknik

### Backend

- Python 3.10+
- Flask
- Flask-SQLAlchemy
- Flask-CORS
- SQLite lokalt som fallback, PostgreSQL i drift
- `pypdf` för PDF-previewmetadata

### Frontend

- server-renderad HTML
- vanilla JavaScript
- gemensamma komponenter i `static/js/components/`
- `SystemTable` som standard för nya tabeller

## Seedad standarddata

Vid ny uppsättning seedas standarddata från [defaults/plm-defaults.json](/workspaces/Byggdelsuppdelning---DEMO/defaults/plm-defaults.json). Filen innehåller i nuläget 13 fördefinierade objekttyper:

- `Assembly`
- `Connection`
- `FileObject`
- `Instruction`
- `Module`
- `Product`
- `Property`
- `Requirement`
- `Space`
- `System`
- `Technical Chapter`
- `TCBL`
- `Technical Specification`

Utöver objekttyper seedas även fält, relationstyper, relationsregler och exempeldata.

## Viktiga API-ytor

Det här är inte en fullständig API-spec, men de viktigaste grupperna är:

- `/api/object-types`: CRUD för objekttyper och fält
- `/api/objects`: objekt, detaljdata, träddata och vyanpassad listning
- `/api/objects/<id>/relations`: objektspecifika relationer
- `/api/relations`: generella relationsentiteter, inklusive batchskapande
- `/api/objects/<id>/documents`: dokument på filobjekt
- `/api/objects/<id>/linked-file-objects`: länkade filobjekt för vanliga objekt
- `/api/managed-lists` och `/api/lists`: styrda listor, listnoder, import/export och bindningar
- `/api/field-templates`: återanvändbara fältmallar
- `/api/relation-type-rules`: regelmatris för tillåtna käll-/målpar
- `/api/change-management`: change-poster och impacts
- `/api/view-config`: kolumn- och trädkonfiguration
- `/api/search`, `/api/stats`, `/api/health`

Se också [docs/relations-overview.md](/workspaces/Byggdelsuppdelning---DEMO/docs/relations-overview.md), [docs/ui-table-standard.md](/workspaces/Byggdelsuppdelning---DEMO/docs/ui-table-standard.md) och [docs/richtext-tinymce-customizations.md](/workspaces/Byggdelsuppdelning---DEMO/docs/richtext-tinymce-customizations.md).

## Lokal utveckling

### Krav

- Python 3.10 eller senare

### Starta lokalt

```bash
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python app.py
```

Appen använder `plm.db` i repots rot om `DATABASE_URL` inte är satt.

Alternativt kan devserver-skriptet användas:

```bash
./scripts/dev-server.sh ensure
```

Nyttiga kommandon:

```bash
./scripts/dev-server.sh status
./scripts/dev-server.sh logs
python scripts/export_defaults_from_db.py
```

## Konfiguration

Miljövariabler som används mest:

- `DATABASE_URL`
- `SECRET_KEY`
- `RENDER_GIT_BRANCH`
- `MAIN_DATABASE_URL`

Om `RENDER_GIT_BRANCH=develop` kan appen konfigureras att återanvända huvuddatabasen via `MAIN_DATABASE_URL`.

## Projektstruktur

```text
app.py
config.py
models/
routes/
defaults/
migrations/
static/js/
static/css/
templates/
scripts/
tests/
```

Några viktiga filer:

- [app.py](/workspaces/Byggdelsuppdelning---DEMO/app.py): appfactory, migrationer och seedning
- [config.py](/workspaces/Byggdelsuppdelning---DEMO/config.py): miljö- och databasinställningar
- [templates/index.html](/workspaces/Byggdelsuppdelning---DEMO/templates/index.html): huvud-UI
- [static/js/app.js](/workspaces/Byggdelsuppdelning---DEMO/static/js/app.js): vyväxling och globala UI-flöden
- [static/js/components/system-table.js](/workspaces/Byggdelsuppdelning---DEMO/static/js/components/system-table.js): standardtabell

## Dokumentation i repot

- [docs/relations-overview.md](/workspaces/Byggdelsuppdelning---DEMO/docs/relations-overview.md): relationer, regler och filobjektskopplingar
- [docs/ui-table-standard.md](/workspaces/Byggdelsuppdelning---DEMO/docs/ui-table-standard.md): obligatorisk tabellstandard för nya tabeller
- [docs/richtext-tinymce-customizations.md](/workspaces/Byggdelsuppdelning---DEMO/docs/richtext-tinymce-customizations.md): richtextlösningen och TinyMCE-anpassningar

## Status

Projektet är ett demo- och utvecklingssystem, inte ett färdigt produktionssystem. Dokumentationen försöker beskriva nuläget i koden snarare än historiska mellanlägen eller framtidsplaner.
