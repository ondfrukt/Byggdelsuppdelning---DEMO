from dotenv import load_dotenv
load_dotenv()

from flask import Flask, abort, render_template
from flask_cors import CORS
from flask_migrate import Migrate, upgrade
from flasgger import Swagger
from config import Config
from extensions import cache, limiter
from models import db
from new_database import seed_data
from routes import register_blueprints
import logging
import os
from urllib.parse import urlparse

SWAGGER_CONFIG = {
    "headers": [],
    "specs": [
        {
            "endpoint": "apispec",
            "route": "/apispec.json",
            "rule_filter": lambda rule: rule.rule.startswith("/api/"),
            "model_filter": lambda tag: True,
        }
    ],
    "static_url_path": "/flasgger_static",
    "swagger_ui": True,
    "specs_route": "/api/docs/",
}

SWAGGER_TEMPLATE = {
    "swagger": "2.0",
    "info": {
        "title": "Byggdelsuppdelning API",
        "description": (
            "REST API för Byggdelsuppdelning – ett PLM-system (Product Lifecycle Management) "
            "för hantering av byggdelar, objekttyper, relationer, dokument, klassificering "
            "och ändringshantering. Alla endpoints börjar med `/api/`."
        ),
        "version": "1.0.0",
        "contact": {
            "name": "Ondfrukt",
            "url": "https://github.com/ondfrukt/byggdelsuppdelning---demo",
        },
    },
    "basePath": "/",
    "schemes": ["https", "http"],
    "consumes": ["application/json"],
    "produces": ["application/json"],
    "securityDefinitions": {},
    "tags": [
        {"name": "Object Types", "description": "Hantering av objekttyper och deras fält"},
        {"name": "Objects", "description": "Hantering av objekt (instanser av objekttyper)"},
        {"name": "Object Relations", "description": "Relationer mellan objekt"},
        {"name": "Documents", "description": "Filuppladdning och dokumenthantering"},
        {"name": "Instances", "description": "Strukturella förälder/barn-kopplingar"},
        {"name": "Relations", "description": "Direkta relations-entiteter"},
        {"name": "Managed Lists", "description": "Hanterade listor och deras element"},
        {"name": "Field Templates", "description": "Mallar för fältdefinitioner"},
        {"name": "Relation Type Rules", "description": "Regler för tillåtna relationstyper"},
        {"name": "Change Management", "description": "Ändringsärenden och påverkade objekt"},
        {"name": "Classification Systems", "description": "Klassificeringssystem"},
        {"name": "Category Nodes", "description": "Kategorinoder i klassificeringshierarkier"},
        {"name": "Object Category Assignments", "description": "Kopplingar mellan objekt och kategorier"},
        {"name": "View Configuration", "description": "Konfiguration av vyer i gränssnittet"},
        {"name": "Search & Stats", "description": "Sökning och statistik"},
    ],
    "definitions": {
        "Error": {
            "type": "object",
            "properties": {
                "error": {"type": "string", "description": "Felmeddelande"}
            }
        },
        "ObjectType": {
            "type": "object",
            "properties": {
                "id": {"type": "integer"},
                "name": {"type": "string"},
                "description": {"type": "string"},
                "icon": {"type": "string"},
                "id_prefix": {"type": "string"},
                "color": {"type": "string"},
                "is_system": {"type": "boolean"},
                "fields": {"type": "array", "items": {"$ref": "#/definitions/ObjectField"}}
            }
        },
        "ObjectField": {
            "type": "object",
            "properties": {
                "id": {"type": "integer"},
                "object_type_id": {"type": "integer"},
                "field_name": {"type": "string"},
                "display_name": {"type": "string"},
                "field_type": {
                    "type": "string",
                    "enum": ["text", "number", "date", "boolean", "select", "computed"]
                },
                "is_required": {"type": "boolean"},
                "is_table_visible": {"type": "boolean"},
                "is_detail_visible": {"type": "boolean"},
                "display_order": {"type": "integer"},
                "detail_width": {"type": "string", "enum": ["full", "half", "third"]},
                "field_options": {"type": "object"},
                "help_text": {"type": "string"}
            }
        },
        "Object": {
            "type": "object",
            "properties": {
                "id": {"type": "integer"},
                "id_full": {"type": "string", "description": "Unikt sammansatt ID (t.ex. PROD-1.v1)"},
                "main_id": {"type": "string"},
                "version": {"type": "string"},
                "object_type_id": {"type": "integer"},
                "object_type": {"type": "string"},
                "status": {"type": "string"},
                "created_at": {"type": "string", "format": "date-time"},
                "updated_at": {"type": "string", "format": "date-time"},
                "data": {"type": "object", "description": "Fältvärden (nyckel = fältnamn)"}
            }
        },
        "ObjectRelation": {
            "type": "object",
            "properties": {
                "id": {"type": "integer"},
                "source_object_id": {"type": "integer"},
                "target_object_id": {"type": "integer"},
                "relation_type": {"type": "string"},
                "description": {"type": "string"},
                "relation_metadata": {"type": "object"},
                "created_at": {"type": "string", "format": "date-time"},
                "direction": {
                    "type": "string",
                    "enum": ["incoming", "outgoing"],
                    "description": "Sätts när relationer hämtas för ett specifikt objekt"
                }
            }
        },
        "Document": {
            "type": "object",
            "properties": {
                "id": {"type": "integer"},
                "object_id": {"type": "integer"},
                "filename": {"type": "string"},
                "original_filename": {"type": "string"},
                "file_size": {"type": "integer"},
                "mime_type": {"type": "string"},
                "uploaded_by": {"type": "string"},
                "created_at": {"type": "string", "format": "date-time"}
            }
        },
        "Instance": {
            "type": "object",
            "properties": {
                "id": {"type": "integer"},
                "parent_object_id": {"type": "integer"},
                "child_object_id": {"type": "integer"},
                "instance_type": {"type": "string"},
                "quantity": {"type": "number"},
                "unit": {"type": "string"},
                "waste_factor": {"type": "number"},
                "installation_sequence": {"type": "integer"},
                "optional": {"type": "boolean"},
                "role": {"type": "string"},
                "position": {"type": "string"},
                "formula": {"type": "string"},
                "metadata_json": {"type": "object"}
            }
        },
        "FieldTemplate": {
            "type": "object",
            "properties": {
                "id": {"type": "integer"},
                "template_name": {"type": "string"},
                "field_name": {"type": "string"},
                "display_name": {"type": "string"},
                "field_type": {"type": "string"},
                "field_options": {"type": "object"},
                "is_required": {"type": "boolean"},
                "lock_required_setting": {"type": "boolean"},
                "force_presence_on_all_objects": {"type": "boolean"},
                "is_table_visible": {"type": "boolean"},
                "help_text": {"type": "string"},
                "is_active": {"type": "boolean"}
            }
        },
        "ManagedList": {
            "type": "object",
            "properties": {
                "id": {"type": "integer"},
                "name": {"type": "string"},
                "description": {"type": "string"},
                "language_codes": {"type": "array", "items": {"type": "string"}},
                "is_active": {"type": "boolean"},
                "items": {"type": "array", "items": {"$ref": "#/definitions/ManagedListItem"}}
            }
        },
        "ManagedListItem": {
            "type": "object",
            "properties": {
                "id": {"type": "integer"},
                "list_id": {"type": "integer"},
                "value": {"type": "string"},
                "value_translations": {"type": "object"},
                "parent_item_id": {"type": "integer"},
                "sort_order": {"type": "integer"},
                "is_active": {"type": "boolean"},
                "node_metadata": {"type": "object"}
            }
        },
        "RelationTypeRule": {
            "type": "object",
            "properties": {
                "id": {"type": "integer"},
                "source_object_type_id": {"type": "integer"},
                "target_object_type_id": {"type": "integer"},
                "source_object_type_name": {"type": "string"},
                "target_object_type_name": {"type": "string"},
                "relation_type": {"type": "string"},
                "is_allowed": {"type": "boolean"}
            }
        },
        "ChangeManagementItem": {
            "type": "object",
            "properties": {
                "id": {"type": "integer"},
                "item_type": {"type": "string", "enum": ["CRQ", "CO", "RO"]},
                "title": {"type": "string"},
                "description": {"type": "string"},
                "status": {"type": "string"},
                "created_at": {"type": "string", "format": "date-time"}
            }
        },
        "ChangeManagementImpact": {
            "type": "object",
            "properties": {
                "id": {"type": "integer"},
                "change_item_id": {"type": "integer"},
                "object_id": {"type": "integer"},
                "impact_action": {
                    "type": "string",
                    "enum": ["to_be_replaced", "cancellation"]
                }
            }
        },
        "ClassificationSystem": {
            "type": "object",
            "properties": {
                "id": {"type": "integer"},
                "name": {"type": "string"},
                "description": {"type": "string"},
                "version": {"type": "string"},
                "is_active": {"type": "boolean"},
                "node_count": {"type": "integer"}
            }
        },
        "CategoryNode": {
            "type": "object",
            "properties": {
                "id": {"type": "integer"},
                "system_id": {"type": "integer"},
                "parent_id": {"type": "integer"},
                "code": {"type": "string"},
                "name": {"type": "string"},
                "description": {"type": "string"},
                "level": {"type": "integer"},
                "sort_order": {"type": "integer"}
            }
        },
        "ObjectCategoryAssignment": {
            "type": "object",
            "properties": {
                "id": {"type": "integer"},
                "object_id": {"type": "integer"},
                "category_node_id": {"type": "integer"},
                "is_primary": {"type": "boolean"},
                "category_node": {"$ref": "#/definitions/CategoryNode"}
            }
        }
    }
}

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def sanitize_database_uri(uri):
    """Return DB URI without credentials for safe display in templates."""
    if not uri:
        return "okänd"
    parsed = urlparse(uri)
    if not parsed.scheme:
        return uri
    host = parsed.hostname or "okänd-host"
    port = f":{parsed.port}" if parsed.port else ""
    db_name = (parsed.path or "/").lstrip("/") or "okänd-databas"
    return f"{parsed.scheme}://{host}{port}/{db_name}"

def create_app():
    """Application factory pattern"""
    app = Flask(__name__)
    app.config.from_object(Config)
    app.config['TEMPLATES_AUTO_RELOAD'] = True
    app.jinja_env.auto_reload = True

    # Enable CORS - restrict to configured origins in production
    cors_origins = os.environ.get('CORS_ORIGINS', '*')
    origins = [o.strip() for o in cors_origins.split(',')] if cors_origins != '*' else '*'
    CORS(app, origins=origins)

    # Initialize database, migrations, cache and rate limiter
    db.init_app(app)
    Migrate(app, db)
    cache.init_app(app, config={'CACHE_TYPE': 'SimpleCache', 'CACHE_DEFAULT_TIMEOUT': 300})
    limiter.init_app(app)
    Swagger(app, config=SWAGGER_CONFIG, template=SWAGGER_TEMPLATE)

    with app.app_context():
        migrations_dir = os.path.join(os.path.dirname(__file__), 'migrations')
        if os.path.exists(migrations_dir):
            upgrade()
        seed_data(app)

    # Register blueprints
    register_blueprints(app)

    # Main route - serve the SPA
    @app.route('/')
    def index():
        return render_template('index.html')

    @app.route('/testsida')
    def testsida():
        branch_name = (
            os.environ.get('RENDER_GIT_BRANCH')
            or os.environ.get('BRANCH_NAME')
            or 'lokal'
        )
        if branch_name.lower() not in {'develop', 'lokal', 'local'}:
            abort(404)
        using_main_database = branch_name.lower() == 'develop' and bool(os.environ.get('MAIN_DATABASE_URL'))
        return render_template(
            'testsida.html',
            branch_name=branch_name,
            database_uri=sanitize_database_uri(app.config.get('SQLALCHEMY_DATABASE_URI')),
            using_main_database=using_main_database,
        )

    @app.route('/health')
    def health():
        return {'status': 'healthy', 'message': 'Byggdelssystem is running'}, 200

    logger.info("Byggdelssystem Application started successfully")

    return app

# Create the app instance
app = create_app()

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=False)
