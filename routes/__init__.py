from flask import Blueprint

# Import new blueprints from route modules
from routes.object_types import bp as object_types_bp
from routes.objects import bp as objects_bp
from routes.object_relations import bp as object_relations_bp
from routes.documents import bp as documents_bp
from routes.search import bp as search_bp
from routes.stats import stats_bp
from routes.view_config import bp as view_config_bp
from routes.relation_entities import bp as relation_entities_bp
from routes.building_part_categories import bp as building_part_categories_bp
from routes.managed_lists import bp as managed_lists_bp

def register_blueprints(app):
    """Register all blueprints with the Flask app"""
    app.register_blueprint(object_types_bp)
    app.register_blueprint(objects_bp)
    app.register_blueprint(object_relations_bp)
    app.register_blueprint(documents_bp)
    app.register_blueprint(search_bp)
    app.register_blueprint(stats_bp, url_prefix='/api')
    app.register_blueprint(view_config_bp)
    app.register_blueprint(relation_entities_bp)
    app.register_blueprint(building_part_categories_bp)
    app.register_blueprint(managed_lists_bp)
