
# 🐞 Bug 1

## Typ
- [x] Bug
- [ ] Förbättring
- [ ] Ny funktion

---
## Sammanfattning
Det går inte att redigera vissa objekt
---
## Mål (förväntat beteende)
<!-- Vad ska hända när allt fungerar korrekt -->
Ex:

- När jag klickar på knappen "Redigera" vill jag få upp objektets egenskaper och där jag har möjligehet att redigera dem"
- Alla befintliga värden ska vara ifyllda
- Det ska sedan gå att spara de ändrade egenskaperna

---
## Verklighet (faktiskt beteende)
<!-- Vad händer istället -->
Ex:
- Felmeddelande visas: "Kunde inte ladda objektet"
- För objektstyperna `Kravställning`, `egenskap`, 
---
## Steg att reproducera
1. Öppna sidan `Objekt`
2. Klicka på: `KRAV-004`
4. Klicka på: `Redigera`
5. Se fel

## Frontend
- Komponent / sida: `Objekt`
- Synligt felmeddelande: `Kunde inte ladda objekt`
- Console-error (kopiera):  
  `app.js:240  Failed to load object for editing: TypeError: optionsString.split is not a function
    at ObjectFormComponent.parseOptions (object-form.js:178:34)
    at ObjectFormComponent.renderField (object-form.js:134:38)
    at object-form.js:29:56
    at Array.map (<anonymous>)
    at ObjectFormComponent.render (object-form.js:29:38)
    at async editObject (app.js:232:9)`
  

# 🐞 Bug 3

## Typ
- [x] Bug
- [ ] Förbättring
- [ ] Ny funktion

---
## Sammanfattning
Det går inte att skapa vissa objektstyper eller vissa typer skapas men tillsammans med felmeddelanden:
---
## Mål (förväntat beteende)
- När jag klickar på knappen `Skapa Objekt`
- Fyller i alla fält som objektstypen har
- Och trycker på `spara`
- Så skapas ett nytt objekt

---
## Verklighet (faktiskt beteende)
<!-- Vad händer istället -->
Fel 1:
- Felmeddelande visas: `Field 'Kategori' must be one of:` (för objektstypen `byggdel, Rumstyp, `)
- Console-error (kopiera):
`api.js:23 
 POST https://byggdelsuppdelning-demo.onrender.com/api/objects 400 (Bad Request)
fetchAPI	@	api.js:23
create	@	api.js:131
saveObject	@	app.js:283
onsubmit	@	(index):84`
`API Error: Error: Validation failed
    at fetchAPI (api.js:35:27)
    at async saveObject (app.js:283:13)
fetchAPI	@	api.js:45
await in fetchAPI		
create	@	api.js:131
saveObject	@	app.js:283
onsubmit	@	(index):84`
`app.js:300 
 Failed to save object: Error: Validation failed
    at fetchAPI (api.js:35:27)
    at async saveObject (app.js:283:13)
saveObject	@	app.js:300
await in saveObject		
onsubmit	@	(index):84`
`
## Steg att reproducera
1. Gå till: `Objekt`
2. Klicka på: `Skapa Objekt`
3. Fyll i valfri data i alla fält
4. Klicka på `spara
5. Se felmeddelande.

Fel 2:
- Felmeddelande visas: `Kund inte ladda objektet`
- Console-error (kopiera):
`api.js:23 
 GET https://byggdelsuppdelning-demo.onrender.com/api/objects/23 500 (Internal Server Error)
fetchAPI	@	api.js:23
getById	@	api.js:127
render	@	object-detail.js:18
refresh	@	object-detail.js:199
saveObject	@	app.js:297
await in saveObject		
onsubmit	@	(index):84
api.js:45 
 API Error: Error: Failed to get object
    at fetchAPI (api.js:35:27)
    at async ObjectDetailComponent.render (object-detail.js:18:27)
    at async ObjectDetailComponent.refresh (object-detail.js:199:9)
    at async saveObject (app.js:297:13)
fetchAPI	@	api.js:45
await in fetchAPI		
getById	@	api.js:127
render	@	object-detail.js:18
refresh	@	object-detail.js:199
saveObject	@	app.js:297
await in saveObject		
onsubmit	@	(index):84
object-detail.js:66 
 Failed to load object: Error: Failed to get object
    at fetchAPI (api.js:35:27)
    at async ObjectDetailComponent.render (object-detail.js:18:27)
    at async ObjectDetailComponent.refresh (object-detail.js:199:9)
    at async saveObject (app.js:297:13)
render	@	object-detail.js:66
await in render		
refresh	@	object-detail.js:199
saveObject	@	app.js:297
await in saveObject		
onsubmit	@	(index):84`

## Steg att reproducera
1. Gå till: `Objekt`
2. Klicka på: `Skapa Objekt`
3. Fyll i valfri data i alla fält
4. Klicka på `spara
5. Se felmeddelande.

Fel 3:
- När jag väljer `objektyp` i dialogrutan `skapa objekt` och väljer typen `egenskap`
- Så visas i consolen följande fel:
`object-form.js:178  Uncaught (in promise) TypeError: optionsString.split is not a function
    at ObjectFormComponent.parseOptions (object-form.js:178:34)
    at ObjectFormComponent.renderField (object-form.js:134:38)
    at object-form.js:29:56
    at Array.map (<anonymous>)
    at ObjectFormComponent.render (object-form.js:29:38)
    at async typeSelect.onchange (app.js:196:25)`
- Inga fält ska fyllas i för detta objekt i dialogrutan
- och när jag trycker på `spara` får jag meddelandet `Formulär ej tillgängligt`

---
## Steg att reproducera
1. Gå till: `Objekt`
2. Klicka på: `Skapa Objekt`
3. Fyll i valfri data i alla fält
4. Klicka på `spara
5. Se felmeddelande.
  



