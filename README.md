# Byggdelssystem - Flexibelt Byggnadsinformationssystem

Sandlådeprojekt för Mockup av ett PLM-system. Ej till för aktivt bruk

## 🚀 Live Demo

**[Se live-demo här](https://byggdelsuppdelning-demo.onrender.com)**

*Notera: Vid första besöket kan det ta 30-60 sekunder att starta på Render's gratis tier.*

## 📋 Översikt

Byggdelssystemet är ett BIM-liknande informationshanteringssystem som ger användaren full flexibilitet att:

- **Skapa egna objekttyper** - Definiera nya typer av objekt med anpassade metadatafält
- **Hantera byggdelar** - Skapa, redigera och organisera byggnadselement
- **Koppla samman objekt** - Dynamiska relationer mellan alla typer av objekt
- **Dokumentera** - Bifoga filer och dokument till objekt
- **Sök och filtrera** - Snabb åtkomst till all information
- **Administrera** - Anpassa systemet efter behov genom admin-gränssnittet

## ✨ Kärnfunktioner

### Flexibel Objekthantering
- ✅ **7 förkonfigurerade objekttyper**: Byggdel, Produkt, Kravställning, Anslutning, Ritningsobjekt, Egenskap, Anvisning
- ✅ **Skapa egna objekttyper** med anpassade fält
- ✅ **Dynamiska formulär** genereras automatiskt baserat på fältdefinitioner
- ✅ **Auto-genererade ID:n** (BYG-001, PROD-023, etc.)
- ✅ **Versionshantering** med created_at/updated_at

### Metadatafält
- ✅ **8 fälttyper**: text, textarea, number, date, select, file, boolean, json
- ✅ **Obligatoriska fält** med validering
- ✅ **Dropdown-alternativ** för select-fält
- ✅ **Anpassad sortering** av fält

### Relationshantering
- ✅ **Flexibla kopplingar** mellan alla objekttyper
- ✅ **Fördefinierade relationstyper**: har_egenskap, har_krav, har_produkt, har_anslutning, har_anvisning, ansluter_objekt_1/2
- ✅ **Beskrivningar** på relationer
- ✅ **Navigering** mellan relaterade objekt

### Dokumenthantering
- ✅ **Filuppladdning** (PDF, PNG, JPG, DOCX, XLSX)
- ✅ **Drag-and-drop** support
- ✅ **Nedladdning** av bifogade filer
- ✅ **Max 10MB** per fil
- ✅ **MIME-type** detektion

### Admin-gränssnitt
- ✅ **Objekttyphantering** - Skapa, redigera, ta bort typer
- ✅ **Fälthantering** - Lägg till, redigera, ta bort fält
- ✅ **System-skydd** - System-typer kan inte tas bort
- ✅ **Valideringsregler** för dataintegritet

### Sökning & Filtrering
- ✅ **Global sökning** över alla objekt
- ✅ **Filter** per objekttyp
- ✅ **Färgkodning** för visuell identifiering

## 🛠️ Teknisk Stack

### Backend
- **Python 3.10+**
- **Flask 3.0** - Web framework
- **SQLAlchemy** - ORM med flexibel datamodell
- **PostgreSQL** - Relationsdatabas med JSONB-support
- **Werkzeug** - Filuppladdning
- **Gunicorn** - Production WSGI server

### Frontend
- **HTML5** - Semantisk struktur
- **CSS3** - Modern styling med färgkodning
- **Vanilla JavaScript (ES6+)** - Modulär arkitektur utan ramverk
- **Fetch API** - RESTful kommunikation
- **Dynamic Forms** - Genereras från metadata

### Hosting
- **Render.com** - Cloud platform
- **PostgreSQL** - Hanterad databas

## 📊 Datamodell

### ObjectTypes (Objekttyper) - META-tabell
```sql
- id: SERIAL PRIMARY KEY
- name: VARCHAR(100) UNIQUE (Ex: 'Byggdel', 'Produkt')
- description: TEXT
- icon: VARCHAR(50) (Font Awesome icon)
- created_at: TIMESTAMP
- is_system: BOOLEAN (true = kan inte raderas)
```

### ObjectFields (Metadatafält)
```sql
- id: SERIAL PRIMARY KEY
- object_type_id: FK → ObjectTypes
- field_name: VARCHAR(100) (Ex: 'Namn', 'Beskrivning')
- field_type: VARCHAR(50) (text, textarea, number, date, select, etc.)
- field_options: JSONB (för select-alternativ)
- is_required: BOOLEAN
- display_order: INTEGER
```

### Objects (Alla objekt)
```sql
- id: SERIAL PRIMARY KEY
- object_type_id: FK → ObjectTypes
- auto_id: VARCHAR(50) UNIQUE (Ex: 'BYG-001')
- created_at: TIMESTAMP
- updated_at: TIMESTAMP
- created_by: VARCHAR(100)
- status: VARCHAR(50) DEFAULT 'In work' ('In work', 'Released', 'Obsolete', 'Canceled')
- version: VARCHAR(20) DEFAULT '001' (Versionsnummer, t.ex. '001', '002')
- main_id: VARCHAR(50) (Rot-ID för objektgrupp, t.ex. 'PROD-001')
- id_full: VARCHAR(100) (Kombinerar main_id och version, t.ex. 'PROD-001.001')
```

### ObjectData (Flexibel metadata)
```sql
- id: SERIAL PRIMARY KEY
- object_id: FK → Objects
- field_id: FK → ObjectFields
- value_text: TEXT
- value_number: DECIMAL(15,4)
- value_date: DATE
- value_boolean: BOOLEAN
- value_json: JSONB
UNIQUE(object_id, field_id)
```

### ObjectRelations (Relationsobjekt)
```sql
- id: SERIAL PRIMARY KEY
- source_object_id: FK → Objects   # objectA_id
- target_object_id: FK → Objects   # objectB_id
- relation_type: VARCHAR(100)
- description: TEXT
- relation_metadata: JSONB

# API aliaser:
# objectA_id, objectA_type, objectB_id, objectB_type
INDEX: source_object_id, target_object_id, relation_type
```

### Documents (Dokument)
```sql
- id: SERIAL PRIMARY KEY
- object_id: FK → Objects
- filename: VARCHAR(255)
- original_filename: VARCHAR(255)
- file_path: VARCHAR(500)
- file_size: INTEGER
- mime_type: VARCHAR(100)
- uploaded_at: TIMESTAMP
```

## 🔌 API Dokumentation

### ObjectTypes
```bash
GET    /api/object-types              # Lista alla objekttyper
POST   /api/object-types              # Skapa ny objekttyp
GET    /api/object-types/{id}         # Hämta objekttyp med fält
PUT    /api/object-types/{id}         # Uppdatera objekttyp
DELETE /api/object-types/{id}         # Ta bort objekttyp

# Field Management
GET    /api/object-types/{id}/fields  # Lista fält
POST   /api/object-types/{id}/fields  # Lägg till fält
PUT    /api/fields/{id}               # Uppdatera fält
DELETE /api/fields/{id}               # Ta bort fält
```

### Objects
```bash
GET    /api/objects                   # Lista objekt (?type=Byggdel&search=text)
POST   /api/objects                   # Skapa objekt
GET    /api/objects/{id}              # Hämta objekt med data och relationer
PUT    /api/objects/{id}              # Uppdatera objekt
DELETE /api/objects/{id}              # Ta bort objekt
```

### Relations (relationsobjekt)
```bash
# Objektspecifika relationer (inkommande + utgående)
GET    /api/objects/{id}/relations
POST   /api/objects/{id}/relations
PUT    /api/objects/{id}/relations/{relation_id}
DELETE /api/objects/{id}/relations/{relation_id}

# Generell relation-API
GET    /api/relations                  # Lista alla relationer
GET    /api/relations?object_id={id}   # Filtrera relationer för objekt
POST   /api/relations                  # Skapa relation med objectA_id/objectB_id
POST   /api/relations/batch            # Batch-koppla flera targetId från sourceId
DELETE /api/relations/{relation_id}
```

### Relation-panel (batch-koppling)
- Knappen **"Lägg till relation"** öppnar en modal/overlay som täcker ~90% av UI:t.
- Panelen har sök, objekttypsfilter och tabell (class=`table-container`) där kolumner anpassas per vald objekttyp.
- Rader kan läggas i en **korg** (max 200), tas bort igen och kopplas i ett batch-anrop.
- Under korgen finns formulär för gemensam relationstyp och metadata.
- Modal stöder stängning via **X**, **Avbryt**, klick utanför och **ESC**, samt fokuslås för tangentbordsanvändning.

### Documents
```bash
GET    /api/objects/{id}/documents    # Lista dokument
POST   /api/objects/{id}/documents    # Ladda upp (multipart/form-data)
GET    /api/documents/{id}/download   # Ladda ner
DELETE /api/documents/{id}            # Ta bort
```


Relationer traverseras nu från båda håll i både API och frontend (objektpanel + trädvy), vilket ersätter behovet av direkta barn/förälder-kopplingar i objekten.

### Search & Stats
```bash
GET    /api/search?q=text&type=Byggdel&field=Namn
GET    /api/stats                     # Statistik per objekttyp
```

### Exempel: Skapa objekt med dynamisk data
```bash
curl -X POST https://your-app.onrender.com/api/objects \
  -H "Content-Type: application/json" \
  -d '{
    "object_type_id": 1,
    "data": {
      "Namn": "Yttervägg typ 2",
      "Beskrivning": "Tvåskikts träregelvägg"
    }
  }'
```

## 💻 Lokal Utveckling

### Förutsättningar
- Python 3.10 eller senare
- PostgreSQL (lokal installation eller Docker)
- Git

### Installation

1. **Klona repository**
```bash
git clone https://github.com/ondfrukt/Byggdelsuppdelning---DEMO.git
cd Byggdelsuppdelning---DEMO
```

2. **Skapa virtuell miljö**
```bash
python -m venv venv
source venv/bin/activate  # macOS/Linux
# eller
venv\Scripts\activate  # Windows
```

3. **Installera dependencies**
```bash
pip install -r requirements.txt
```

4. **Konfigurera miljövariabler**
```bash
export DATABASE_URL=postgresql://localhost/byggdel_demo
export SECRET_KEY=your-secret-key-here
export FLASK_ENV=development
```

5. **Skapa databas**
```bash
createdb byggdel_demo
```

6. **Kör applikationen**
```bash
python app.py
```

7. **Öppna i webbläsare**
```
http://localhost:5000
```

## 🚀 Deployment till Render.com

### Steg 1: Skapa PostgreSQL-databas
1. Logga in på [Render.com](https://render.com)
2. Klicka **"New +"** → **"PostgreSQL"**
3. Namnge: `byggdel-db`
4. Välj **Free** tier
5. Kopiera **"Internal Database URL"**

### Steg 2: Skapa Web Service
1. Klicka **"New +"** → **"Web Service"**
2. Anslut GitHub repository
3. Konfigurera:
   - **Name**: `byggdelssystem`
   - **Runtime**: Python 3
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `gunicorn app:app`

### Steg 3: Environment Variables
| Key | Value |
|-----|-------|
| `DATABASE_URL` | (Internal Database URL från Steg 1) |
| `SECRET_KEY` | (Generera med: `python -c "import secrets; print(secrets.token_hex(32))"`) |
| `FLASK_ENV` | `production` |

### Steg 4: Deploy
Klicka **"Create Web Service"** och vänta 3-5 minuter.

## 📁 Projektstruktur

```
/
├── app.py                          # Flask app entry point
├── config.py                       # Konfiguration
├── new_database.py                 # Databas-setup och seed-data
├── requirements.txt
├── runtime.txt
├── models/                         # SQLAlchemy-modeller
│   ├── __init__.py
│   ├── object_type.py
│   ├── object_field.py
│   ├── object.py
│   ├── object_data.py
│   ├── relation.py
│   └── document.py
├── routes/                         # API routes
│   ├── __init__.py
│   ├── object_types.py
│   ├── objects.py
│   ├── object_relations.py
│   ├── documents.py
│   └── search.py
├── utils/                          # Verktyg
│   ├── auto_id_generator.py
│   └── validators.py
├── templates/
│   └── index.html
└── static/
    ├── css/
    │   └── style.css
    ├── js/
    │   ├── api.js
    │   ├── app.js
    │   ├── utils.js
    │   ├── components/
    │   │   ├── object-list.js
    │   │   ├── object-detail.js
    │   │   ├── object-form.js
    │   │   ├── relation-manager.js
    │   │   └── file-upload.js
    │   └── admin/
    │       └── object-type-manager.js
    └── uploads/                    # Uppladdade filer
```

## 🧪 Demo-data

Vid första körningen skapas automatiskt:

### 7 Objekttyper (System)
1. **Byggdel** - Byggnadselement (blå)
2. **Produkt** - Produkter och artiklar (grön)
3. **Kravställning** - Krav och specifikationer (röd)
4. **Anslutning** - Kopplingar mellan byggdelar (orange)
5. **Ritningsobjekt** - Ritningar och dokument (lila)
6. **Egenskap** - Egenskaper och värden (turkos)
7. **Anvisning** - Instruktioner (mörkgrå)

### Exempel-objekt
- 3 Byggdelar (Yttervägg, Bjälklag, Grund)
- 6 Egenskaper (U-värde, Brand, Ljud, etc.)
- 4 Kravställningar
- 5 Produkter
- 2 Anslutningar
- 2 Anvisningar

### Relationer
Kompletta exempel på hur objekt kopplas samman.

## 🎨 Design & UX

### Färgkodning per Objekttyp
```css
Byggdel:       #3498db (blå)
Produkt:       #2ecc71 (grön)
Kravställning: #e74c3c (röd)
Anslutning:    #f39c12 (orange)
Ritningsobjekt:#9b59b6 (lila)
Egenskap:      #1abc9c (turkos)
Anvisning:     #34495e (mörkgrå)
```

### Ikoner (Font Awesome)
- Byggdel: `fa-building`
- Produkt: `fa-box`
- Kravställning: `fa-clipboard-check`
- Anslutning: `fa-link`
- Ritningsobjekt: `fa-file-pdf`
- Egenskap: `fa-tag`
- Anvisning: `fa-book`

## 🔒 Säkerhet

- ✅ SQL Injection-skydd via SQLAlchemy ORM
- ✅ XSS-skydd med HTML escaping
- ✅ CORS konfigurerat
- ✅ Input-validering på både klient och server
- ✅ Säker filuppladdning med whitelist
- ✅ CodeQL security scan (0 alerts)

## 🚧 Framtida Förbättringar

### Planerade Features
- [ ] Användarautentisering & roller
- [ ] Behörighetshantering per objekttyp
- [ ] Komplett ändringshistorik
- [ ] Versionshantering av objekt
- [ ] Export/Import (CSV, Excel, JSON)
- [ ] Visualisering (grafer för relationer)
- [ ] Email-notifikationer
- [ ] Avancerad rapportgenerering
- [ ] Real-time collaboration
- [ ] S3-kompatibel fillagring

## 📝 Användningsexempel

### Skapa en ny Byggdel
1. Gå till **"Objekt"** i menyn
2. Välj **"Byggdel"** i dropdown
3. Klicka **"Skapa nytt objekt"**
4. Fyll i namn och beskrivning
5. Klicka **"Spara"**

### Lägg till Egenskaper
1. Öppna byggdelen
2. Gå till fliken **"Relationer"**
3. Klicka **"Lägg till relation"**
4. Välj typ: **"har_egenskap"**
5. Välj egenskap från listan
6. Klicka **"Lägg till"**

### Ladda upp Dokument
1. Öppna objektet
2. Gå till fliken **"Dokument"**
3. Dra och släpp fil eller klicka för att välja
4. Filen laddas upp automatiskt

### Skapa Anpassad Objekttyp (Admin)
1. Gå till **"Admin"** i menyn
2. Klicka **"Skapa objekttyp"**
3. Ange namn och beskrivning
4. Klicka **"Spara"**
5. Lägg till fält med **"Lägg till fält"**
6. Definiera fälttyp och alternativ

## 📞 Support

Vid frågor eller problem:
1. Kontrollera denna README
2. Kolla Render logs
3. Öppna en GitHub Issue

## 👥 Bidrag

Förslag och förbättringar är välkomna! Öppna en issue eller pull request.

## 📄 Licens

Detta är ett demonstrationsprojekt. Fri att använda för utbildning och utveckling.

---

**Byggd med ❤️ för att demonstrera flexibel byggnadsinformationshantering**
