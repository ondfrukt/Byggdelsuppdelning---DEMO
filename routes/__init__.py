from flask import Blueprint

# Import new blueprints from route modules
from routes.object_types import bp as object_types_bp
from routes.objects import bp as objects_bp
from routes.object_relations import bp as object_relations_bp
from routes.documents import bp as documents_bp
from routes.search import bp as search_bp

def register_blueprints(app):
    """Register all blueprints with the Flask app"""
    app.register_blueprint(object_types_bp)
    app.register_blueprint(objects_bp)
    app.register_blueprint(object_relations_bp)
    app.register_blueprint(documents_bp)
    app.register_blueprint(search_bp)
