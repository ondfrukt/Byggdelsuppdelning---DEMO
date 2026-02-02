from flask import Flask, render_template
from flask_cors import CORS
from config import Config
from models import db
from database import init_db, seed_data
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
        seed_data(app)
    
    # Register blueprints
    register_blueprints(app)
    
    # Main route - serve the SPA
    @app.route('/')
    def index():
        return render_template('index.html')
    
    @app.route('/health')
    def health():
        return {'status': 'healthy', 'message': 'Application is running'}, 200
    
    logger.info("PLM Demo Application started successfully")
    
    return app

# Create the app instance
app = create_app()

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=False)
