# Relationer i systemet

Detta dokument sammanfattar hur relationer fungerar i systemet: relationsobjekt, parametrar, relationstyper och regler för att upprätta relationer.

## 1. Översikt

Relationer representeras som egna entiteter mellan två objekt:
- `source_object_id` (källa)
- `target_object_id` (mål)
- `relation_type` (typ av relation)

Varje relation är riktad i lagring (`source -> target`), men UI kan visa relationen som inkommande/utgående beroende på vilket objekt man tittar på.

## 2. Datamodell

### 2.1 `ObjectRelation` (faktisk relation)

Fält (modell: `models/relation.py`):
- `id` (int, PK)
- `source_object_id` (int, FK -> `objects.id`, required)
- `target_object_id` (int, FK -> `objects.id`, required)
- `relation_type` (string, required)
- `description` (text, optional)
- `relation_metadata` (json, optional)
- `created_at` (datetime)

Index:
- `idx_source_object_id`
- `idx_target_object_id`
- `idx_relation_type`

### 2.2 `RelationType` (definition av relationstyper)

Fält (modell: `models/relation_type.py`):
- `key` (unik nyckel, t.ex. `has_requirement`)
- `display_name`
- `description`
- `source_object_type_id` (optional typbegränsning)
- `target_object_type_id` (optional typbegränsning)
- `cardinality` (`one_to_one`, `one_to_many`, `many_to_one`, `many_to_many`)
- `is_directed` (bool)
- `is_composition` (bool)
- `inverse_relation_type_id` (optional)

## 3. API för relationer

### 3.1 Hämta relationer för objekt

`GET /api/objects/<id>/relations`

Returnerar relationer där objektet är source eller target. Varje post innehåller även:
- `direction`: `outgoing` eller `incoming` relativt objektet i URL:en.

### 3.2 Skapa en relation (objekt-endpoint)

`POST /api/objects/<id>/relations`

Request body:
- `target_object_id` (required)
- `relation_type` (optional, default: `relaterad`)
- `description` (optional)
- `metadata` (optional, sparas i `relation_metadata`)

### 3.3 Skapa en relation (relation-entity endpoint)

`POST /api/relations`

Request body:
- `source_object_id` eller `objectA_id` (required)
- `target_object_id` eller `objectB_id` (required)
- `relation_type` (optional, default: `relaterad`)
- `description` (optional)
- `metadata` (optional)

### 3.4 Batchskapa relationer

`POST /api/relations/batch`

Request body:
- `sourceId` (required)
- `relations` (required array)

Varje rad i `relations`:
- `targetId` (required)
- `relationType` (optional, default: `relaterad`)
- `metadata` (optional)

Response:
- `created` (skapade relationer)
- `errors` (fel per index)
- `summary` (`requested`, `created`, `failed`)
- HTTP `201` om allt lyckas, annars `207` vid partial success.

## 4. Relationstyper och giltiga SOURCE/TARGET

Följande relationstyper har explicita regler:

| RelationType | SOURCE | TARGET |
|---|---|---|
| `has_requirement` | Any | Requirement |
| `uses_product` | Any | Product |
| `has_document` | Any | Document |
| `references_document` | Any | Document |
| `has_build_up_line` | BuildingPart | BuildUpLine |
| `build_up_line_product` | BuildUpLine | Product |
| `connects` | Connection | BuildingPart |

"Any" betyder att source-typen inte begränsas.

Typmatchning stödjer alias (normaliserat), bl.a.:
- Requirement: `Requirement`, `Kravställning`
- Product: `Product`, `Produkt`
- Document: `Document`, `Filobjekt`, `Ritningsobjekt`, `Dokumentobjekt`
- BuildingPart: `BuildingPart`, `Byggdel`
- BuildUpLine: `BuildUpLine`, `Build Up Line`, `Uppbyggnadsrad`, `Uppbyggnadslinje`
- Connection: `Connection`, `Anslutning`

## 5. Regler vid upprättande av relationer

### 5.1 Grundvalidering

Vid skapande av relation kontrolleras:
- source och target måste finnas
- source och target får inte vara samma objekt (ingen self-relation)
- SOURCE/TARGET måste matcha reglerna för relationstypen (om relationstypen finns i regeluppsättningen)

Vid regelbrott returneras normalt:
- HTTP `422` med förklarande felmeddelande

### 5.2 Dubblettregler

Systemet har två dubblettskydd:
- Exakt dubblett (samma `source_object_id`, `target_object_id`, `relation_type`) stoppas.
- Full-ID skydd (`id_full`): ett source-objekt får inte länkas till flera objekt med samma `id_full`, oavsett relationstyp.

### 5.3 Okända relationstyper

Relationstyper som **inte** finns i den explicita regelmängden ovan blockeras inte av SOURCE/TARGET-valideringen och kan fortfarande skapas (om övriga regler passerar).

## 6. Ta bort och uppdatera relationer

- Ta bort:
  - `DELETE /api/objects/<id>/relations/<relation_id>`
  - `DELETE /api/relations/<relation_id>`
- Uppdatera metadata/beskrivning:
  - `PUT /api/objects/<id>/relations/<relation_id>`

## 7. Praktisk rekommendation

För konsekvent datakvalitet:
- Använd i första hand de definierade relationstyperna i tabellen ovan.
- Undvik fria relationstyper om de inte är medvetet designade och dokumenterade.
- Säkerställ att objektstyperna (`Requirement`, `Product`, osv.) är korrekt namngivna/aliasade i miljön.
