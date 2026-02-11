# UI-spec: Filobjekt vs vanliga objekt

## Princip
UI ska vara enkel för användaren men strikt mot domänregeln:
**filer hanteras endast på filobjekt**.

---

## 1) Detail-panel: skillnader per objekttyp

## A. Vanligt objekt (ej filobjekt)

### Tabs
- Grunddata
- Relationer
- Dokument

### Dokument-flik (layout)
1. **Sektion: Kopplade filobjekt**
   - Lista av filobjektkort:
     - namn, auto-id, revision/status
     - antal filer
     - knappar: *Öppna filobjekt*, *Koppla bort*
2. **Primär-CTA:** `+ Skapa filobjekt`
3. **Sekundär-CTA:** `Koppla befintligt filobjekt`
4. **Ingen direkt drag/drop-upload** i denna vy.

### UX-krav
- Om användare försöker “ladda upp fil” från vanligt objekt: visa guidad modal
  “Skapa filobjekt först” med one-click-flöde.

---

## B. Filobjekt

### Tabs
- Grunddata
- Relationer
- Dokument

### Dokument-flik (layout)
1. **Sektion: Filer på filobjekt**
   - Drag/drop upload
   - fillista med:
     - filnamn
     - typ
     - storlek
     - uppladdad datum/användare
   - actions: *Ladda ner*, *Ta bort*
2. **Sektion: Länkade affärsobjekt (bakåtreferenser)**
   - vilka objekt filobjektet dokumenterar

### UX-krav
- Snabb och tydlig filhantering (bulk upload, progress, fel per fil).

---

## 2) Visuell differentiering

- Badge i header:
  - Filobjekt: `FILOBJEKT` (t.ex. lila/blå accent)
  - Vanligt objekt: `OBJEKT`
- Ikonografi:
  - filobjekt = filikon
  - vanligt objekt = typspecifik ikon
- Tooltip/info:
  - “Filer ägs av filobjekt. Detta objekt länkar endast till filobjekt.”

---

## 3) Dokumentflikens tomtillstånd

### Vanligt objekt
- “Inga filobjekt kopplade än.”
- Knappar: `Skapa filobjekt` och `Koppla befintligt`.

### Filobjekt
- “Inga filer uppladdade än.”
- CTA: `Ladda upp första filen`.

---

## 4) One-click flöde (rekommenderat)

Från vanligt objekt -> klick `Skapa filobjekt`:
1. Modal: namn + valfria metadata + välj filer.
2. Submit kör atomiskt backend-kommando:
   - skapa filobjekt
   - upload filer
   - skapa relation
3. UI återvänder till vanligt objekt med uppdaterad lista.

Detta behåller strikt modell men känns “direkt” för användaren.

---

## 5) Terminologi

- Ersätt “Ritningsobjekt” med “Filobjekt” i:
  - labels
  - knappar
  - tomtillstånd
  - hjälptexter

(Behåll ev. migreringsalias internt under övergångsperiod.)
