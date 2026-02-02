
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
1. Gå till: `PROD-005`
2. Klicka på objekt: ``
3. Klicka på: `Redigera`
4. Se fel

---
## Objekt / Kontext
- Objekttyp: `Produkt`
- Objekt-ID (om känt): `PROD-005`
---

## Frontend
- Komponent / sida: `Objekt/grunddata`
- Synligt felmeddelande: `Kunde inte ladda objekt`
- Console-error (kopiera):  
  `Failed to load object for editing: SyntaxError: Unexpected token '<', "<!doctype "... is not valid JSON
editObject	@	app.js:232
await in editObject		
onclick	@	(index):1`

# 🐞 Bug 2

## Typ
- [x] Bug
- [ ] Förbättring
- [ ] Ny funktion

---
## Sammanfattning
Det går inte att spara en ändrad egenskap i en objektstyp
---
## Mål (förväntat beteende)
<!-- Vad ska hända när allt fungerar korrekt -->
Ex:
- När jag öppnar en objektstyp och väljer ett fält
- Jag bockar i rutan för obligatoriskt fält
- jag trycker på spara och justeringen ändras så fältet blir obligatoriskt

---
## Verklighet (faktiskt beteende)
<!-- Vad händer istället -->
Ex:
- Felmeddelande visas när jag trycker på `spara`
---
## Steg att reproducera
1. Gå till: `Admin`
2. Klicka på objektstypen: `Anslutning`
3. Klicka på fältet: `Beskrivning`
4. Klicka på `spara`
5. Se felmeddelande

---
## Objekt / Kontext
- Objekttyp: `Anslutning`
- Objekt-fält `Beskrivning`
---

## Frontend
- Komponent / sida: `Admin/objektstyper/fält`
- Synligt felmeddelande: `Unexpected token '<', "<!doctype "... is not valid JSON`
- Console-error (kopiera):
`PUT https://byggdelsuppdelning-demo.onrender.com/api/object-types/4/fields/11 404 (Not Found)
fetchAPI	@	api.js:23
updateField	@	api.js:89
saveField	@	object-type-manager.js:335
onsubmit	@	(index):186`
`API Error: SyntaxError: Unexpected token '<', "<!doctype "... is not valid JSON
fetchAPI	@	api.js:32
await in fetchAPI		
updateField	@	api.js:89
saveField	@	object-type-manager.js:335
onsubmit	@	(index):186`
`Failed to save field: SyntaxError: Unexpected token '<', "<!doctype "... is not valid JSON
saveField	@	object-type-manager.js:343
await in saveField		
onsubmit	@	(index):186
`

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
<!-- Vad ska hända när allt fungerar korrekt -->
Ex:

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



