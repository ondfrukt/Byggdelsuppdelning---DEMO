# Relationer i systemet

Det här dokumentet beskriver nuläget för relationsmodellen i projektet: hur relationer lagras, hur regler tillämpas och hur filobjekt kopplas till vanliga objekt.

## Översikt

Relationer lagras som egna rader i `object_relations`. Varje relation är riktad i databasen:

- `source_object_id`
- `target_object_id`
- `relation_type`
- `description`
- `relation_metadata`

I API och UI kan samma relation visas som `outgoing` eller `incoming` beroende på vilket objekt som är aktivt.

## Modeller

### `ObjectRelation`

Modell: [models/relation.py](/workspaces/Byggdelsuppdelning---DEMO/models/relation.py)

Ansvar:

- lagra den faktiska kopplingen mellan två objekt
- exponera aliaserna `objectA_id` och `objectB_id` i API-svar
- bära valfri metadata och beskrivning

### `RelationType`

Modell: [models/relation_type.py](/workspaces/Byggdelsuppdelning---DEMO/models/relation_type.py)

Ansvar:

- beskriva tillgängliga relationstyper
- lagra semantik som `cardinality`, `is_directed` och eventuell invers relation
- kunna begränsa relationstypen till specifika käll- eller måltyper

### `RelationTypeRule`

Modell: [models/relation_type_rule.py](/workspaces/Byggdelsuppdelning---DEMO/models/relation_type_rule.py)

Ansvar:

- definiera vilken relationstyp som gäller mellan en viss källa och ett visst mål
- markera om paret är tillåtet eller spärrat via `is_allowed`
- fungera som den praktiska regelmatrisen som admin arbetar med

## Viktig runtime-logik

Reglerna appliceras främst i:

- [routes/object_relations.py](/workspaces/Byggdelsuppdelning---DEMO/routes/object_relations.py)
- [routes/relation_entities.py](/workspaces/Byggdelsuppdelning---DEMO/routes/relation_entities.py)
- [routes/relation_type_rules.py](/workspaces/Byggdelsuppdelning---DEMO/routes/relation_type_rules.py)
- [routes/relation_type_rules_api.py](/workspaces/Byggdelsuppdelning---DEMO/routes/relation_type_rules_api.py)

Det finns två nivåer av styrning:

1. `enforce_pair_relation_type(...)`
Väljer eller verifierar vilken relationstyp som får användas för ett specifikt källa/mål-par.

2. `validate_relation_type_scope(...)`
Kontrollerar att vald relationstyp överensstämmer med typbegränsningarna för relationstypen.

## API

### Hämta relationer för ett objekt

`GET /api/objects/<id>/relations`

Returnerar både inkommande och utgående relationer, med ett extra fält:

- `direction`: `incoming` eller `outgoing`

### Skapa relation via objekt-endpoint

`POST /api/objects/<id>/relations`

Body:

- `target_object_id`
- `relation_type` valfritt, annars används standard eller förvald regel
- `description` valfritt
- `metadata` valfritt

### Uppdatera eller ta bort relation

- `PUT /api/objects/<id>/relations/<relation_id>`
- `DELETE /api/objects/<id>/relations/<relation_id>`

### Generell relation-endpoint

- `GET /api/relations`
- `GET /api/relations?object_id=<id>`
- `POST /api/relations`
- `DELETE /api/relations/<relation_id>`

`POST /api/relations` accepterar både:

- `source_object_id` / `target_object_id`
- `objectA_id` / `objectB_id`

### Batchskapande

`POST /api/relations/batch`

Body:

- `sourceId`
- `relations[]`

Varje rad i `relations` kan innehålla:

- `targetId`
- `relationType`
- `metadata`

Svaret innehåller:

- `created`
- `errors`
- `summary`

HTTP-status blir `201` när allt lyckas och `207` när batchen innehåller både lyckade och misslyckade rader.

## Valideringar

Vid skapande av relationer gäller i praktiken följande:

- käll- och målobjekt måste finnas
- self-relations stoppas
- relationstypen kan tvingas av regelmatrisen för käll-/målparet
- relationstypens egna scope-regler måste matcha objektstyperna
- exakta dubbletter stoppas
- samma källa får inte länkas till flera mål med samma `id_full`

Det sista skyddet är avsiktligt hårt och gäller även om relationstyperna skiljer sig åt.

## Filobjekt och dokumentrelationer

Projektet använder en tydlig domänregel:

- endast filobjekt får äga uppladdade filer i `documents`
- andra objekt får nå filer genom relationer till filobjekt

Relevant endpoint:

`GET /api/objects/<id>/linked-file-objects`

Den används för att hämta filobjekt som är kopplade till ett vanligt objekt. Om källobjektet självt är ett filobjekt returneras `422`.

## Praktiska rekommendationer

- Skapa eller uppdatera relationsregler i admin i stället för att förlita dig på fria relationstyper.
- Utgå från `RelationTypeRule`-matrisen när nya objektfamiljer införs.
- Dokumentflöden ska modelleras via filobjekt, inte genom att vanliga objekt äger dokument direkt.
