# Relationer I Systemet

Det här dokumentet förklarar hur relationer fungerar i systemet idag, vilka typer som finns och vilka inställningar varje typ har.

Målet är att göra det lätt att förstå skillnaden mellan:

- semantiska relationer: vad två objekt betyder i förhållande till varandra
- strukturella relationer: hur ett objekt är uppbyggt av andra objekt

## Kort Förklaring

Systemet använder två olika modeller:

- `ObjectRelation`
  Används för semantiska kopplingar som `has_document` eller `connects_to`.
- `Instance`
  Är den tekniska modellen för strukturella relationer som `assembly_to_product`, `space_to_module`, `subsys_to_product` eller `sys_to_subsys`.

En enkel tumregel:

- om relationen beskriver betydelse eller spårbarhet, använd `ObjectRelation`
- om relationen beskriver parent/child eller uppbyggnad, använd en strukturell relation som tekniskt lagras som `Instance`

## Viktiga Begrepp

### Kategori

- `semantisk`
  Typen beskriver betydelse, spårbarhet eller logisk koppling.
- `strukturell`
  Typen beskriver uppbyggnad, innehåll eller parent/child-struktur.

### Kardinalitet

Kardinalitet beskriver hur många objekt som får kopplas till varandra.

- `many_to_many`
  Många objekt får kopplas till många andra objekt.
- framtida exempel:
  `one_to_many`, `one_to_one`

I nuläget använder alla semantiska relationstyper `many_to_many`.

### Riktning

Riktning beskriver om relationen har ett tydligt håll.

- `riktad`
  Vi skiljer på källa och mål, till exempel "objektet har dokument".
- `oriktad`
  Kopplingen är symmetrisk, till exempel "objekt A connects_to objekt B".

### Komposition

Komposition beskriver om relationen betyder att ett objekt äger eller består av ett annat.

- `ja`
  Relationen uttrycker stark uppbyggnad eller ägarskap.
- `nej`
  Relationen är bara en koppling utan sådant ägarskap.

Om `komposition = ja` betyder det i praktiken att child-objektet ses som en del av parent-objektets uppbyggnad, inte bara som något det råkar vara kopplat till.

Det brukar innebära följande:

- parent och child hör logiskt ihop som helhet och del
- child finns i relationen för att bygga upp parent, inte bara för att refereras
- om man visar strukturträd eller hierarkier bör child ligga under parent
- relationen kan i framtiden få starkare regler kring arv, livscykel, validering eller borttagning

Exempel där `ja` hade varit rimligt:

- en modul består av flera assemblies
- ett space innehåller en modul som del av sin uppbyggnad
- en assembly består av flera produkter eller under-assemblies

Exempel där `nej` är mer rimligt:

- ett objekt länkar till ett dokument
- ett objekt hänvisar till ett annat objekt
- två objekt är anslutna till varandra men inget av dem äger det andra

Kort sagt:

- `komposition = ja` betyder "det här är en del-av-relation"
- `komposition = nej` betyder "det här är en vanlig koppling"

I nuläget är alla semantiska relationstyper markerade som `nej`.

### Scope

Scope beskriver om en typ är begränsad till vissa objekttyper.

- `Alla`
  Typen får användas mellan alla objekttyper, om inte regelmatrisen begränsar den.
- specifik objekttyp
  Typen är låst till en viss source-, target-, parent- eller child-typ.

I nuläget är de semantiska relationstyperna generella och de strukturella relationstyperna definieras genom `parent_scope` och `child_scope`.

## Var Metadata Ligger

Kategorin ligger idag på typnivå, inte på varje enskild relationsrad.

- semantiska typer lagras i `RelationType` via fältet `category`
- strukturella relationstyper definieras i `utils/instance_types.py`
- enskilda `ObjectRelation`-rader har inte ett eget `category`-fält
- enskilda `Instance`-rader har inte heller ett eget `category`-fält

## Semantiska Relationstyper

Semantiska relationstyper används i `ObjectRelation.relation_type`.

Källor:

- [models/relation.py](/workspaces/Byggdelsuppdelning---DEMO/models/relation.py)
- [models/relation_type.py](/workspaces/Byggdelsuppdelning---DEMO/models/relation_type.py)
- [migrations/seed_relation_types.py](/workspaces/Byggdelsuppdelning---DEMO/migrations/seed_relation_types.py)

### Översikt

| Key | Namn | Kategori | Kardinalitet | Riktning | Komposition | Source-scope | Target-scope | Beskrivning |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `references_object` | References Object | `semantisk` | `many_to_many` | `riktad` | `nej` | `Alla` | `Alla` | Generisk semantisk spårbarhetsrelation mellan två objekt. |
| `has_requirement` | Has Requirement | `semantisk` | `many_to_many` | `riktad` | `nej` | `Alla` | `Alla` | Länkar ett objekt till ett krav som styr, begränsar eller specificerar det. |
| `has_document` | Has Document | `semantisk` | `many_to_many` | `riktad` | `nej` | `Alla` | `Alla` | Länkar ett objekt till ett dokument som beskriver, verifierar eller följer med objektet. |
| `has_property` | Has Property | `semantisk` | `many_to_many` | `riktad` | `nej` | `Alla` | `Alla` | Länkar ett objekt till en egenskap, karakteristik eller attributdefinition. |
| `connects_to` | Connects To | `semantisk` | `many_to_many` | `oriktad` | `nej` | `Alla` | `Alla` | Länkar två objekt genom en fysisk eller logisk koppling utan att uttrycka hierarki eller ägarskap. |

### Vad Alla Semantiska Typer Har Gemensamt

- de används i `ObjectRelation`
- de kan visas i admin som relationstyper
- de valideras mot regelmatrisen för objekttypspar
- de beskriver inte uppbyggnad, utan betydelse eller koppling

## Strukturella Relationstyper

Strukturella relationstyper används i `Instance.instance_type`.

Källor:

- [models/instance.py](/workspaces/Byggdelsuppdelning---DEMO/models/instance.py)
- [utils/instance_types.py](/workspaces/Byggdelsuppdelning---DEMO/utils/instance_types.py)

### Översikt

| Key | Namn | Kategori | Parent-scope | Child-scope | Riktning | Beskrivning |
| --- | --- | --- | --- | --- | --- | --- |
| `assembly_to_product` | Assembly -> Product | `strukturell` | `Assembly` | `Product` | `riktad` | En `Assembly` innehåller eller placerar en `Product` som strukturell child. |
| `assembly_to_assembly` | Assembly -> Assembly | `strukturell` | `Assembly` | `Assembly` | `riktad` | En `Assembly` byggs upp av en eller flera child-assemblies. |
| `connection_to_product` | Connection -> Product | `strukturell` | `Connection` | `Product` | `riktad` | En `Connection` placerar en `Product` i ett anslutningssammanhang. |
| `module_to_assembly` | Module -> Assembly | `strukturell` | `Module` | `Assembly` | `riktad` | En `Module` byggs upp av en eller flera `Assembly`-instanser. |
| `space_to_product` | Space -> Product | `strukturell` | `Space` | `Product` | `riktad` | Ett `Space` innehåller eller hostar en `Product`-instans. |
| `space_to_assembly` | Space -> Assembly | `strukturell` | `Space` | `Assembly` | `riktad` | Ett `Space` innehåller eller hostar en `Assembly`-instans. |
| `space_to_module` | Space -> Module | `strukturell` | `Space` | `Module` | `riktad` | Ett `Space` innehåller eller hostar en `Module`-instans. |
| `subsys_to_product` | SubSys -> Product | `strukturell` | `SubSys` | `Product` | `riktad` | Ett `SubSys` innehåller eller hostar en `Product`-instans. |
| `sys_to_subsys` | Sys -> SubSys | `strukturell` | `Sys` | `SubSys` | `riktad` | Ett `Sys` innehåller eller hostar en `SubSys`-instans. |

### Vad Alla Strukturella Relationstyper Har Gemensamt

- de används i `Instance`
- de beskriver alltid en parent/child-relation
- de är strukturella, inte semantiska
- de definieras i kod i stället för att seedas som vanliga semantiska relationstyper

## Fälten På Själva Relationerna

### `ObjectRelation`

Används för semantiska relationer.

Viktiga fält:

- `id`
- `source_object_id`
- `target_object_id`
- `relation_type`
- `max_targets_per_source`
- `max_sources_per_target`

### `Instance`

Används för strukturella relationer.

Viktiga fält:

- `id`
- `parent_object_id`
- `child_object_id`
- `instance_type`
- `quantity`
- `unit`
- `formula`
- `role`
- `position`
- `waste_factor`
- `installation_sequence`
- `optional`
- `metadata_json`

## Hur Admin Tänker Kring Typer

I admin visas idag semantiska relationstyper och strukturella relationstyper tillsammans i listor och dropdowns, men de representerar fortfarande två olika saker:

- relationstyper hör till den semantiska modellen
- strukturella relationstyper hör till den strukturella modellen

Det är därför viktigt att läsa kolumnen `kategori` när man väljer typ.

## Praktiska Exempel

### När Du Ska Använda `ObjectRelation`

Exempel:

- en produkt `has_document` ett datablad
- en modul `has_requirement` ett krav
- två objekt `connects_to` varandra
- ett objekt `references_object` ett annat objekt

### När Du Ska Använda En Strukturell Relation

Exempel:

- en `Assembly` innehåller en `Product`
- en `Module` byggs upp av en `Assembly`
- ett `Space` innehåller en `Module`

Tekniskt lagras dessa relationer som `Instance`.

## Sammanfattning

Om man ska förstå systemet snabbt räcker det att komma ihåg detta:

- `ObjectRelation` = semantisk koppling
- strukturell relation = uppbyggnad mellan parent och child
- `Instance` = den tekniska modellen för strukturell relation
- `semantisk` och `strukturell` är metadata på typnivå
- semantiska typer har inställningar som kardinalitet, riktning och komposition
- strukturella relationstyper har inställningar som parent-scope och child-scope
