from flask import Blueprint, request, jsonify
from models import db, ViewConfiguration, ObjectType, ObjectField
import logging

logger = logging.getLogger(__name__)
bp = Blueprint('view_config', __name__, url_prefix='/api/view-config')


@bp.route('/tree-display', methods=['GET'])
def get_tree_display_config():
    """Get tree display configuration for all object types"""
    try:
        configs = ViewConfiguration.query.all()
        
        # Get all object types
        object_types = ObjectType.query.all()
        
        # Build response with all object types and their configs
        result = {}
        for obj_type in object_types:
            config = next((c for c in configs if c.object_type_id == obj_type.id), None)
            result[obj_type.name] = {
                'object_type_id': obj_type.id,
                'object_type_name': obj_type.name,
                'tree_view_name_field': config.tree_view_name_field if config else None,
                'available_fields': [
                    {
                        'field_name': field.field_name,
                        'display_name': field.display_name or field.field_name
                    }
                    for field in sorted(obj_type.fields, key=lambda f: f.display_order or 999)
                ]
            }
        
        return jsonify(result), 200
    except Exception as e:
        logger.error(f"Error getting tree display config: {str(e)}")
        return jsonify({'error': 'Failed to get tree display config'}), 500


@bp.route('/tree-display', methods=['PUT'])
def update_tree_display_config():
    """Update tree display configuration for object types"""
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({'error': 'Request body is required'}), 400
        
        updated_configs = []
        
        # Process each object type config in the request
        for object_type_name, config_data in data.items():
            object_type_id = config_data.get('object_type_id')
            tree_view_name_field = config_data.get('tree_view_name_field')
            
            if not object_type_id:
                continue
            
            # Check if object type exists
            object_type = ObjectType.query.get(object_type_id)
            if not object_type:
                logger.warning(f"Object type {object_type_id} not found")
                continue
            
            # Check if field exists for this object type (if specified and not "ID")
            if tree_view_name_field and tree_view_name_field != 'ID':
                field = ObjectField.query.filter_by(
                    object_type_id=object_type_id,
                    field_name=tree_view_name_field
                ).first()
                if not field:
                    logger.warning(f"Field {tree_view_name_field} not found for object type {object_type_id}")
                    continue
            
            # Find or create config
            config = ViewConfiguration.query.filter_by(object_type_id=object_type_id).first()
            
            if config:
                # Update existing config
                config.tree_view_name_field = tree_view_name_field
            else:
                # Create new config
                config = ViewConfiguration(
                    object_type_id=object_type_id,
                    tree_view_name_field=tree_view_name_field
                )
                db.session.add(config)
            
            updated_configs.append(config)
        
        db.session.commit()
        
        return jsonify({
            'message': 'Tree display configuration updated successfully',
            'configs': [config.to_dict() for config in updated_configs]
        }), 200
        
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error updating tree display config: {str(e)}")
        return jsonify({'error': 'Failed to update tree display config'}), 500
