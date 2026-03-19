from flask import Flask, abort, render_template
from flask_cors import CORS
from config import Config
from models import db
from new_database import init_db, seed_data
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
            from migrations.add_object_type_colors import run_migration as run_object_type_color_migration
            run_object_type_color_migration(db)
        except Exception as e:
            logger.warning(f"Object type color migration may have already run: {str(e)}")
        
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

        try:
            from migrations.add_relation_types_table import run_migration as run_relation_types_migration
            run_relation_types_migration(db)
        except Exception as e:
            logger.warning(f"Relation types migration may have already run: {str(e)}")

        try:
            from migrations.add_relation_type_rules_table import run_migration as run_relation_type_rules_migration
            run_relation_type_rules_migration(db)
        except Exception as e:
            logger.warning(f"Relation type rules migration may have already run: {str(e)}")

        try:
            from migrations.add_relation_type_rule_is_allowed import run_migration as run_relation_type_rules_allowed_migration
            run_relation_type_rules_allowed_migration(db)
        except Exception as e:
            logger.warning(f"Relation type rules is_allowed migration may have already run: {str(e)}")

        try:
            from migrations.add_instances_and_relation_limits import run_migration as run_instances_migration
            run_instances_migration(db)
        except Exception as e:
            logger.warning(f"Instances migration may have already run: {str(e)}")

        try:
            from migrations.backfill_relation_type_rule_matrix import run_migration as run_relation_rule_matrix_backfill
            run_relation_rule_matrix_backfill(db)
        except Exception as e:
            logger.warning(f"Relation type rule matrix backfill may have already run: {str(e)}")

        try:
            from migrations.seed_relation_types import run_migration as run_seed_relation_types_migration
            run_seed_relation_types_migration(db)
        except Exception as e:
            logger.warning(f"Relation types seed may have already run: {str(e)}")

        try:
            from migrations.normalize_object_identifiers import run_migration as run_identifier_migration
            run_identifier_migration(db)
        except Exception as e:
            logger.warning(f"Identifier normalization migration may have already run: {str(e)}")

        try:
            from migrations.remove_auto_id_from_objects import run_migration as run_remove_auto_id_migration
            run_remove_auto_id_migration(db)
        except Exception as e:
            logger.warning(f"Remove auto_id migration may have already run: {str(e)}")

        try:
            from migrations.migrate_direct_links_to_relations import run_migration as run_relation_migration
            migrated_count = run_relation_migration(db)
            logger.info(f"Direct-link migration created {migrated_count} relation entities")
        except Exception as e:
            logger.warning(f"Direct-link migration may have already run or has no data: {str(e)}")

        try:
            from migrations.add_managed_lists import run_migration as run_managed_lists_migration
            run_managed_lists_migration(db)
        except Exception as e:
            logger.warning(f"Managed lists migration may have already run: {str(e)}")

        try:
            from migrations.add_managed_list_translations import run_migration as run_managed_list_translations_migration
            run_managed_list_translations_migration(db)
        except Exception as e:
            logger.warning(f"Managed list translations migration may have already run: {str(e)}")

        try:
            from migrations.add_list_administration_core import run_migration as run_list_admin_core_migration
            run_list_admin_core_migration(db)
        except Exception as e:
            logger.warning(f"List administration core migration may have already run: {str(e)}")

        try:
            from migrations.add_managed_list_item_tree_fields import run_migration as run_managed_list_item_tree_fields_migration
            run_managed_list_item_tree_fields_migration(db)
        except Exception as e:
            logger.warning(f"Managed list item tree field migration may have already run: {str(e)}")

        try:
            from migrations.add_managed_list_links import run_migration as run_managed_list_links_migration
            run_managed_list_links_migration(db)
        except Exception as e:
            logger.warning(f"Managed list link migration may have already run: {str(e)}")

        try:
            from migrations.add_field_templates import run_migration as run_field_templates_migration
            run_field_templates_migration(db)
        except Exception as e:
            logger.warning(f"Field templates migration may have already run: {str(e)}")

        try:
            from migrations.seed_field_templates import run_migration as run_seed_field_templates_migration
            run_seed_field_templates_migration(db)
        except Exception as e:
            logger.warning(f"Field templates seed may have already run: {str(e)}")

        try:
            from migrations.add_table_visibility_to_object_fields import run_migration as run_table_visibility_migration
            run_table_visibility_migration(db)
        except Exception as e:
            logger.warning(f"Table visibility migration may have already run: {str(e)}")

        try:
            from migrations.add_detail_visibility_to_object_fields import run_migration as run_detail_visibility_migration
            run_detail_visibility_migration(db)
        except Exception as e:
            logger.warning(f"Detail visibility migration may have already run: {str(e)}")

        try:
            from migrations.add_field_governance import run_migration as run_field_governance_migration
            run_field_governance_migration(db)
        except Exception as e:
            logger.warning(f"Field governance migration may have already run: {str(e)}")

        try:
            from migrations.add_detail_width_to_object_fields import run_migration as run_detail_width_migration
            run_detail_width_migration(db)
        except Exception as e:
            logger.warning(f"Detail width migration may have already run: {str(e)}")

        try:
            from migrations.consolidate_object_fields_to_templates import run_migration as run_field_template_consolidation_migration
            run_field_template_consolidation_migration(db)
        except Exception as e:
            logger.warning(f"Field template consolidation migration may have already run: {str(e)}")

        try:
            from migrations.ensure_required_name_field_on_object_types import run_migration as run_required_name_field_migration
            run_required_name_field_migration(db)
        except Exception as e:
            logger.warning(f"Required namn field migration may have already run: {str(e)}")

        try:
            from migrations.add_connection_part_fields import run_migration as run_connection_part_fields_migration
            run_connection_part_fields_migration(db)
        except Exception as e:
            logger.warning(f"Connection part fields migration may have already run: {str(e)}")

        try:
            from migrations.add_change_management_items import run_migration as run_change_management_migration
            run_change_management_migration(db)
        except Exception as e:
            logger.warning(f"Change management migration may have already run: {str(e)}")

        try:
            from migrations.add_instance_type_fields import run_migration as run_instance_type_fields_migration
            run_instance_type_fields_migration(db)
        except Exception as e:
            logger.warning(f"Instance type fields migration may have already run: {str(e)}")
        
        seed_data(app)

        # Re-run after seed to guarantee canonical 'namn' field on freshly seeded databases.
        try:
            from migrations.ensure_required_name_field_on_object_types import run_migration as run_required_name_field_migration
            run_required_name_field_migration(db)
        except Exception as e:
            logger.warning(f"Required namn field post-seed migration may have already run: {str(e)}")

        try:
            from migrations.add_connection_part_fields import run_migration as run_connection_part_fields_migration
            run_connection_part_fields_migration(db)
        except Exception as e:
            logger.warning(f"Connection part fields post-seed migration may have already run: {str(e)}")

        try:
            from migrations.normalize_object_identifiers import run_migration as run_identifier_migration
            run_identifier_migration(db)
        except Exception as e:
            logger.warning(f"Identifier normalization post-seed migration may have already run: {str(e)}")

        try:
            from migrations.add_instances_and_relation_limits import run_migration as run_instances_migration
            run_instances_migration(db)
        except Exception as e:
            logger.warning(f"Instances post-seed migration may have already run: {str(e)}")

        try:
            from migrations.remove_auto_id_from_objects import run_migration as run_remove_auto_id_migration
            run_remove_auto_id_migration(db)
        except Exception as e:
            logger.warning(f"Remove auto_id post-seed migration may have already run: {str(e)}")

        try:
            from migrations.backfill_relation_type_rule_matrix import run_migration as run_relation_rule_matrix_backfill
            run_relation_rule_matrix_backfill(db)
        except Exception as e:
            logger.warning(f"Relation type rule matrix post-seed backfill may have already run: {str(e)}")

        try:
            from migrations.seed_relation_types import run_migration as run_seed_relation_types_migration
            run_seed_relation_types_migration(db)
        except Exception as e:
            logger.warning(f"Relation defaults post-seed migration may have already run: {str(e)}")

        try:
            from migrations.sync_existing_relation_entity_types import run_migration as run_relation_entity_type_sync_migration
            run_relation_entity_type_sync_migration(db)
        except Exception as e:
            logger.warning(f"Relation entity type sync migration may have already run: {str(e)}")
    
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
