
# 🐞 Bug 1

## Typ
- [x] Bug
- [ ] Förbättring
- [ ] Ny funktion

---
## Sammanfattning
Det går inte att redigera ett objekt 
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
---
## Steg att reproducera
1. Öppna sidan `Objekt`
2. Klicka på: `PROD-005`
4. Klicka på: `Redigera`
5. Se fel

## Frontend
- Komponent / sida: `Objekt`
- Synligt felmeddelande: `Kunde inte ladda objekt`
- Console-error (kopiera):  
  `api.js:23 
   GET https://byggdelsuppdelning-demo.onrender.com/api/object-types/undefined 404 (Not Found)
  fetchAPI	@	api.js:23
  getById	@	api.js:65
  editObject	@	app.js:208
  await in editObject		
  onclick	@	(index):1`
  `api.js:40  API Error: Error: Server error: 404 
    at fetchAPI (api.js:29:19)
    at async editObject (app.js:208:26)`
  `app.js:232  Failed to load object for editing: Error: Server error: 404 
    at fetchAPI (api.js:29:19)
    at async editObject (app.js:208:26)`

# 🐞 Bug 3

## Typ
- [x] Bug
- [ ] Förbättring
- [ ] Ny funktion

---
## Sammanfattning
Det går inte att skapa ett nytt objekt
---
## Mål (förväntat beteende)
- När jag klickar på knappen `Skapa Objekt`
- Fyller i alla fält
- Och trycker på `spara`
- Så skapas ett nytt objekt

---
## Verklighet (faktiskt beteende)
<!-- Vad händer istället -->
Ex:
- Felmeddelande visas: `Fyll i alla obligatoriska fält`
---
## Steg att reproducera
1. Gå till: `Objekt`
2. Klicka på: `Skapa Objekt`
3. Fyll i valfri data i alla fält
4. Klicka på `spara
5. Se felmeddelande.

## Frontend
- Komponent / sida: `Objekt`
- Synligt felmeddelande: `Validation failed`
- Console-error (kopiera):
`api.js:23 
 POST https://byggdelsuppdelning-demo.onrender.com/api/objects 400 (Bad Request)
fetchAPI	@	api.js:23
create	@	api.js:126
saveObject	@	app.js:265
onsubmit	@	(index):84`
`api.js:40  API Error: Error: Validation failed
    at fetchAPI (api.js:35:19)
    at async saveObject (app.js:265:13)`
`app.js:282  Failed to save object: Error: Validation failed
    at fetchAPI (api.js:35:19)
    at async saveObject (app.js:265:13)`
  



