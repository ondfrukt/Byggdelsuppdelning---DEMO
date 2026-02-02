from flask import Blueprint

# Import blueprints from route modules
from routes.products import products_bp
from routes.components import components_bp
from routes.bom import bom_bp
from routes.relations import relations_bp
from routes.stats import stats_bp

def register_blueprints(app):
    """Register all blueprints with the Flask app"""
    app.register_blueprint(products_bp, url_prefix='/api')
    app.register_blueprint(components_bp, url_prefix='/api')
    app.register_blueprint(bom_bp, url_prefix='/api')
    app.register_blueprint(relations_bp, url_prefix='/api')
    app.register_blueprint(stats_bp, url_prefix='/api')
