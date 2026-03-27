from dotenv import load_dotenv
load_dotenv()

from flask import Flask, abort, render_template
from flask_cors import CORS
from flask_migrate import Migrate, upgrade
from config import Config
from extensions import cache, limiter
from models import db
from new_database import seed_data
from routes import register_blueprints
import logging
import os
from urllib.parse import urlparse

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
