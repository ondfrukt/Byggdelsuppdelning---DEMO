# PLM Demo System

Ett fullstack Product Lifecycle Management (PLM) demonstrationssystem byggt med Flask och PostgreSQL. Systemet visar produktdatahantering, BOM-strukturer (Bill of Materials) och produktrelationer.

![PLM Demo System](https://img.shields.io/badge/Status-Production-green)
![Python](https://img.shields.io/badge/Python-3.10-blue)
![Flask](https://img.shields.io/badge/Flask-3.0-lightgrey)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Latest-blue)

## 🚀 Live Demo

**[Se live-demo här](https://byggdelsuppdelning-demo.onrender.com)** *(Uppdatera med din Render URL)*

*Notera: Vid första besöket kan det ta 30-60 sekunder att starta på Render's gratis tier.*

## 📋 Översikt

PLM (Product Lifecycle Management) hanterar hela livscykeln för produkter från koncept till obsolescens. Detta demosystem visar:

- **Produktdatahantering** - Skapa, redigera och hantera produkter med versionshantering och statusflöde
- **BOM (Bill of Materials)** - Definiera vilka komponenter som ingår i varje produkt med kvantiteter
- **Komponentbibliotek** - Centraliserad hantering av återanvändbara komponenter
- **Produktrelationer** - Visualisera samband mellan produkter (består av, varianter, ersättningar)
- **Sökning & Filtrering** - Snabb åtkomst till produkter och komponenter
- **Responsiv Design** - Fungerar på desktop, tablet och mobil

## ✨ Funktioner

### Produkthantering
- ✅ CRUD-operationer (Create, Read, Update, Delete)
- ✅ Statusflöde: Koncept → Under utveckling → Godkänd → Obsolete
- ✅ Versionshantering
- ✅ Artikelnummer och beskrivningar
- ✅ Sök- och filterfunktioner

### BOM (Bill of Materials)
- ✅ Lägg till komponenter till produkter
- ✅ Ange kvantiteter och positioner
- ✅ Anteckningar per komponent
- ✅ Översikt över alla ingående delar

### Komponenthantering
- ✅ Återanvändbara komponenter
- ✅ Kategorisering (Mekanik, Elektronik, Material, Programvara)
- ✅ Specifikationer och enheter
- ✅ Se var komponenter används

### Produktrelationer
- ✅ **Består av** - Produkthierarki
- ✅ **Variant av** - Produktvarianter
- ✅ **Ersätter** - Versionshantering
- ✅ **Ersätts av** - Deprecated produkter

### Dashboard
- ✅ Översiktsstatistik
- ✅ Produkter per status
- ✅ Senast uppdaterade produkter
- ✅ Snabblänkar

## 🛠️ Teknisk Stack

### Backend
- **Python 3.10+**
- **Flask 3.0** - Web framework
- **SQLAlchemy** - ORM för databashantering
- **PostgreSQL** - Relationsdatabas
- **Gunicorn** - Production WSGI server

### Frontend
- **HTML5** - Struktur
- **CSS3** - Modern styling med CSS Grid & Flexbox
- **Vanilla JavaScript (ES6+)** - Interaktivitet utan ramverk
- **Fetch API** - RESTful kommunikation

### Hosting
- **Render.com** - Cloud platform
- **PostgreSQL** - Hanterad databas

## 📊 Datamodell

### Products (Produkter)
```sql
- id: Primary Key
- name: Produktnamn
- article_number: Unikt artikelnummer
- version: Version (t.ex. "1.0", "2.5")
- status: Koncept | Under utveckling | Godkänd | Obsolete
- description: Beskrivning
- created_at: Skapad datum
- updated_at: Uppdaterad datum
```

### Components (Komponenter)
```sql
- id: Primary Key
- name: Komponentnamn
- type: Mekanik | Elektronik | Programvara | Material
- specifications: Tekniska specifikationer
- unit: Enhet (st, kg, meter, liter)
- created_at: Skapad datum
```

### BOM (Bill of Materials)
```sql
- id: Primary Key
- product_id: Foreign Key → Products
- component_id: Foreign Key → Components
- quantity: Kvantitet
- position: Sorteringsposition
- notes: Anteckningar
```

### Product_Relations (Produktrelationer)
```sql
- id: Primary Key
- parent_product_id: Foreign Key → Products
- child_product_id: Foreign Key → Products
- relation_type: består_av | variant_av | ersätter | ersätts_av
- description: Beskrivning
```

## 🔌 API Dokumentation

### Health Check
```bash
GET /api/health
```

### Products
```bash
GET    /api/products              # Lista alla produkter
GET    /api/products?status=Godkänd&search=cykel
GET    /api/products/{id}         # Hämta specifik produkt
POST   /api/products              # Skapa produkt
PUT    /api/products/{id}         # Uppdatera produkt
DELETE /api/products/{id}         # Ta bort produkt
```

### Components
```bash
GET    /api/components            # Lista alla komponenter
GET    /api/components?type=Elektronik
GET    /api/components/{id}       # Hämta specifik komponent
POST   /api/components            # Skapa komponent
PUT    /api/components/{id}       # Uppdatera komponent
DELETE /api/components/{id}       # Ta bort komponent
```

### BOM
```bash
GET    /api/products/{id}/bom     # Hämta BOM för produkt
POST   /api/products/{id}/bom     # Lägg till i BOM
PUT    /api/bom/{id}              # Uppdatera BOM-rad
DELETE /api/bom/{id}              # Ta bort från BOM
```

### Relations
```bash
GET    /api/products/{id}/relations  # Hämta relationer
POST   /api/products/{id}/relations  # Skapa relation
DELETE /api/relations/{id}           # Ta bort relation
```

### Statistics
```bash
GET    /api/stats                 # Hämta statistik
```

### Exempel: Skapa produkt
```bash
curl -X POST https://your-app.onrender.com/api/products \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Min Produkt",
    "article_number": "PROD-001",
    "version": "1.0",
    "status": "Koncept",
    "description": "En testprodukt"
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

# Windows
venv\Scripts\activate

# macOS/Linux
source venv/bin/activate
```

3. **Installera dependencies**
```bash
pip install -r requirements.txt
```

4. **Konfigurera miljövariabler**
```bash
# Windows
set DATABASE_URL=postgresql://localhost/plm_demo
set SECRET_KEY=your-secret-key-here
set FLASK_ENV=development

# macOS/Linux
export DATABASE_URL=postgresql://localhost/plm_demo
export SECRET_KEY=your-secret-key-here
export FLASK_ENV=development
```

5. **Skapa databas**
```bash
# PostgreSQL
createdb plm_demo

# Eller via psql
psql -c "CREATE DATABASE plm_demo;"
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

### Steg 1: Förberedelser
1. Pusha din kod till GitHub
2. Logga in på [Render.com](https://render.com)

### Steg 2: Skapa PostgreSQL-databas
1. Klicka **"New +"** → **"PostgreSQL"**
2. Namnge databasen: `plm-demo-db`
3. Välj **Free** tier
4. Klicka **"Create Database"**
5. Kopiera **"Internal Database URL"** (används i nästa steg)

### Steg 3: Skapa Web Service
1. Klicka **"New +"** → **"Web Service"**
2. Anslut ditt GitHub repository
3. Konfigurera:
   - **Name**: `plm-demo`
   - **Region**: Frankfurt (EU Central)
   - **Branch**: `main`
   - **Runtime**: Python 3
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `gunicorn app:app`
   - **Instance Type**: Free

### Steg 4: Environment Variables
Lägg till följande under **"Environment"**:

| Key | Value |
|-----|-------|
| `DATABASE_URL` | (Klistra in Internal Database URL från Steg 2) |
| `SECRET_KEY` | (Generera med: `python -c "import secrets; print(secrets.token_hex(32))"`) |
| `FLASK_ENV` | `production` |

### Steg 5: Deploy
1. Klicka **"Create Web Service"**
2. Vänta 3-5 minuter medan Render bygger och deployas
3. När status är **"Live"** - din app är redo! 🎉

### Steg 6: Verifiera
1. Klicka på URL:en (t.ex. `https://plm-demo-xxxx.onrender.com`)
2. Databasen initialiseras automatiskt med seed-data vid första körningen
3. Testa funktionaliteten

### Troubleshooting

**Problem: "Application failed to respond"**
- Kontrollera att `DATABASE_URL` är korrekt satt
- Verifiera att PostgreSQL-databasen körs
- Kolla loggar under "Logs" i Render dashboard

**Problem: "Module not found"**
- Säkerställ att `requirements.txt` innehåller alla dependencies
- Triggera en rebuild

**Problem: Långsam första laddning**
- Detta är normalt för Render's free tier (cold start)
- Efter första laddningen är appen snabbare

## 📁 Projektstruktur

```
/
├── app.py                      # Flask-applikation (entry point)
├── config.py                   # Konfiguration
├── models.py                   # SQLAlchemy-modeller
├── database.py                 # Databas-setup och seed-data
├── requirements.txt            # Python dependencies
├── runtime.txt                 # Python version
├── .gitignore                  # Git ignore-regler
├── README.md                   # Denna fil
├── routes/                     # API routes
│   ├── __init__.py
│   ├── products.py
│   ├── components.py
│   ├── bom.py
│   ├── relations.py
│   └── stats.py
├── templates/                  # HTML templates
│   └── index.html
└── static/                     # Statiska filer
    ├── css/
    │   ├── style.css
    │   └── components.css
    └── js/
        ├── api.js
        ├── app.js
        ├── products.js
        ├── components.js
        ├── bom.js
        ├── relations.js
        └── utils.js
```

## 🧪 Demo-data

Vid första körningen skapas automatiskt exempel-data:

### Produkter (7 st)
- Cykel Modell X (Godkänd)
- Elcykel Pro (Under utveckling)
- Cykelram Standard (Godkänd)
- Cykelram Carbon (Under utveckling)
- Hjulset 28" (Godkänd)
- Elmotorkit 250W (Godkänd)
- Cykel Modell X - Gammal (Obsolete)

### Komponenter (12 st)
- Stålrör, Aluminiumrör, Kolfiberark
- Hjul, Bromssystem, Växelsystem
- Elmotor, Batteri, Styrdator
- Sadel, Pedaler

### BOM & Relationer
- Kompletta BOM-strukturer för alla produkter
- Produktrelationer som visar hierarki och varianter

## 🎨 Design & UX

### Färgkodning
- 🟦 **Koncept** - Grå (idéstadiet)
- 🔵 **Under utveckling** - Blå (aktivt arbete)
- 🟢 **Godkänd** - Grön (klar för produktion)
- 🔴 **Obsolete** - Röd (utgången)

### Responsiv Design
- **Desktop** (>768px) - Full funktionalitet med sidobar
- **Tablet** (768px) - Anpassad layout
- **Mobil** (<768px) - Touch-optimerad

## 🔒 Säkerhet

- ✅ SQL Injection-skydd via SQLAlchemy ORM
- ✅ CORS konfigurerat
- ✅ Environment variables för känslig data
- ✅ Input-validering på API-nivå
- ✅ Error handling utan att exponera systemdetaljer

## 🚧 Framtida Förbättringar

### Planerade Features
- [ ] Användarautentisering & behörigheter
- [ ] Dokumenthantering (PDF, bilder)
- [ ] Komplett versionshistorik med ändringslogg
- [ ] Change management workflow
- [ ] Visualiseringar (grafer för BOM-träd)
- [ ] Export/Import (CSV, Excel, JSON)
- [ ] Avancerad sökning med filter
- [ ] Email-notifikationer
- [ ] Aktivitetslogg
- [ ] Rapportgenerering

### Tekniska Förbättringar
- [ ] Enhetstester (pytest)
- [ ] Integrationstester
- [ ] CI/CD pipeline
- [ ] Docker support
- [ ] Redis för caching
- [ ] API rate limiting
- [ ] GraphQL endpoint
- [ ] WebSocket för realtidsuppdateringar

## 📝 Licens

Detta är ett demonstrationsprojekt. Fri att använda för utbildning och utveckling.

## 👥 Författare

Skapat som en demonstration av fullstack PLM-system.

## 🤝 Bidra

Förslag och förbättringar är välkomna! Öppna en issue eller pull request.

## 📞 Support

Vid frågor eller problem:
1. Kontrollera README:n
2. Kolla Render logs
3. Öppna en GitHub Issue

---

**Byggd med ❤️ för att demonstrera modern PLM-hantering**
