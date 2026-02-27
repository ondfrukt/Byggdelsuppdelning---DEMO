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
            from migrations.migrate_direct_links_to_relations import run_migration as run_relation_migration
            migrated_count = run_relation_migration(db)
            logger.info(f"Direct-link migration created {migrated_count} relation entities")
        except Exception as e:
            logger.warning(f"Direct-link migration may have already run or has no data: {str(e)}")

        try:
            from migrations.add_building_part_categories import run_migration as run_building_part_category_migration
            run_building_part_category_migration(db)
        except Exception as e:
            logger.warning(f"Building part categories migration may have already run: {str(e)}")

        try:
            from migrations.add_managed_lists import run_migration as run_managed_lists_migration
            run_managed_lists_migration(db)
        except Exception as e:
            logger.warning(f"Managed lists migration may have already run: {str(e)}")

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
            from migrations.add_managed_lists import run_migration as run_managed_lists_migration
            run_managed_lists_migration(db)
        except Exception as e:
            logger.warning(f"Managed lists post-seed migration may have already run: {str(e)}")

        try:
            from migrations.normalize_object_identifiers import run_migration as run_identifier_migration
            run_identifier_migration(db)
        except Exception as e:
            logger.warning(f"Identifier normalization post-seed migration may have already run: {str(e)}")

        try:
            from migrations.seed_relation_types import run_migration as run_seed_relation_types_migration
            run_seed_relation_types_migration(db)
        except Exception as e:
            logger.warning(f"Relation types post-seed may have already run: {str(e)}")

        try:
            from migrations.seed_field_templates import run_migration as run_seed_field_templates_migration
            run_seed_field_templates_migration(db)
        except Exception as e:
            logger.warning(f"Field templates post-seed may have already run: {str(e)}")

        try:
            from migrations.consolidate_object_fields_to_templates import run_migration as run_field_template_consolidation_migration
            run_field_template_consolidation_migration(db)
        except Exception as e:
            logger.warning(f"Field template consolidation post-seed may have already run: {str(e)}")
    
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
