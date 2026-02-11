# API-förändringar för filobjekt-modellen

## Mål
- Endast filobjekt får äga filer.
- Vanliga objekt får endast referera till filer via relation till filobjekt.

---

## 1) Endpoint-policy

### Behåll men skärp

#### `POST /api/objects/{objectId}/documents`
- **Ny regel:** `objectId` måste vara objekt av typen `Filobjekt` (eller `object_types.code='FILE_OBJECT'`).
- **Vid fel typ:** returnera `422 Unprocessable Entity`.
- **Felpayload (förslag):**
```json
{
  "error": "FILE_OWNER_TYPE_INVALID",
  "message": "Only Filobjekt can own documents",
  "object_id": 123,
  "object_type": "Byggdel"
}
```

#### `GET /api/objects/{objectId}/documents`
- **Ny regel:** tillåten enbart för filobjekt.
- För vanliga objekt används ny endpoint för länkade filobjekt (se nedan).

#### `DELETE /api/objects/documents/{documentId}`
- Tillåten, men validera att dokumentets ägare fortfarande är filobjekt (defensivt).

---

## 2) Nya/justerade endpoints för vanliga objekt

### Hämta dokument via filobjekt-länkning

#### `GET /api/objects/{objectId}/linked-file-objects`
- Returnerar filobjekt länkade till ett vanligt objekt via `relation_type='dokumenterar'`.

**Svar (förslag):**
```json
[
  {
    "relation_id": 9001,
    "file_object": {
      "id": 501,
      "auto_id": "FIL-001",
      "data": {"Namn": "Ritning A-01"}
    },
    "documents_count": 3
  }
]
```

### Länka filobjekt till vanligt objekt

#### `POST /api/objects/{objectId}/linked-file-objects`
- Request: `{ "file_object_id": 501 }`
- Server skapar relation `objectId --(dokumenterar)--> file_object_id`.
- Validering:
  - `objectId` får **inte** vara filobjekt.
  - `file_object_id` måste vara filobjekt.
  - Relation får inte dubblas.

### Avlänka filobjekt

#### `DELETE /api/objects/{objectId}/linked-file-objects/{relationId}`
- Tar bort relation, men påverkar inte dokumentfilerna.

---

## 3) Batchflöde för smidig UX

För att minimera användarsteg i UI:

#### `POST /api/objects/{objectId}/linked-file-objects:create-with-upload`
- Multipart request:
  - metadata för nytt filobjekt
  - 1..N filer
- Servern gör atomiskt:
  1) skapa filobjekt
  2) ladda upp filer på filobjekt
  3) skapa relation från vanligt objekt till filobjekt
- Returnerar både filobjekt, relation och dokumentlista.

---

## 4) Felhantering och statuskoder

- `400`: valideringsfel i payload.
- `404`: objekt eller dokument saknas.
- `409`: relation eller resurs finns redan.
- `422`: domänregelbrott (t.ex. icke-filobjekt försöker äga fil).
- `500`: oväntat serverfel.

Standardisera felkod i `error`-fält för stabil frontend-logik.

---

## 5) Bakåtkompatibilitet

1. Introducera nya endpoints parallellt.
2. Logga användning av legacy-endpoints (varning i serverlogg när objekt inte är filobjekt).
3. Efter migrering och UI-utrullning: stäng legacy-beteende med `422`.

---

## 6) Kodändringar (översikt)

- `routes/documents.py`
  - Lägg till kontroll `is_file_object(object_id)` i `GET/POST`.
- `routes/object_relations.py`
  - Lägg till dedikerade valideringar och hjälpendpoints för filobjektlänkning.
- `models/document.py`
  - Byt `object_id` -> `filobjekt_id` i model och serializer.

