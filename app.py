from flask import Flask, render_template
from flask_cors import CORS
from config import Config
from models import db
from new_database import init_db, seed_data
from routes import register_blueprints
import logging
import os

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

def create_app():
    """Application factory pattern"""
    app = Flask(__name__)
    app.config.from_object(Config)
    
    # Enable CORS
    CORS(app)
    
    # Initialize database
    db.init_app(app)
    
    # Create tables and seed data
    with app.app_context():
        init_db(app)
        
        # Run migrations
        try:
            from migrations.add_id_prefix_and_field_columns import run_migration
            run_migration(db)
        except Exception as e:
            logger.warning(f"Migration may have already run: {str(e)}")
        
        try:
            from migrations.add_view_configurations import run_migration as run_view_config_migration
            run_view_config_migration(db)
        except Exception as e:
            logger.warning(f"View configuration migration may have already run: {str(e)}")
        
        try:
            from migrations.add_list_view_columns import run_migration as run_list_view_migration
            run_list_view_migration(db)
        except Exception as e:
            logger.warning(f"List view columns migration may have already run: {str(e)}")
        
        try:
            from migrations.add_metadata_fields import run_migration as run_metadata_migration
            run_metadata_migration(db)
        except Exception as e:
            logger.warning(f"Metadata fields migration may have already run: {str(e)}")
        
        seed_data(app)
    
    # Register blueprints
    register_blueprints(app)
    
    # Main route - serve the SPA
    @app.route('/')
    def index():
        return render_template('index.html')
    
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
