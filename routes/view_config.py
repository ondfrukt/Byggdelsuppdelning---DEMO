from flask import Blueprint, request, jsonify
from models import db, ViewConfiguration, ObjectType, ObjectField
import logging

logger = logging.getLogger(__name__)
bp = Blueprint('view_config', __name__, url_prefix='/api/view-config')

# Constants
DEFAULT_DISPLAY_ORDER = 999
DEFAULT_COLUMNS = ['auto_id', 'object_type', 'created_at']  # Default columns for list view


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
                    for field in sorted(obj_type.fields, key=lambda f: f.display_order or DEFAULT_DISPLAY_ORDER)
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


@bp.route('/list-view', methods=['GET'])
def get_list_view_config():
    """Get list view configuration for all object types"""
    try:
        configs = ViewConfiguration.query.all()
        
        # Get all object types
        object_types = ObjectType.query.all()
        
        # Build response with all object types and their configs
        result = {}
        for obj_type in object_types:
            config = next((c for c in configs if c.object_type_id == obj_type.id), None)
            
            # Get all available fields for this object type
            available_fields = [
                {
                    'field_name': field.field_name,
                    'display_name': field.display_name or field.field_name,
                    'field_type': field.field_type,
                    'is_table_visible': field.is_table_visible
                }
                for field in sorted(obj_type.fields, key=lambda f: f.display_order or DEFAULT_DISPLAY_ORDER)
                if field.is_table_visible
            ]
            
            # Build default visible columns if not configured
            visible_columns = config.visible_columns if config and config.visible_columns else None
            if not visible_columns:
                # Default: show ID, first 3 metadata fields, and created_at
                visible_columns = []
                visible_columns.append({'field_name': 'auto_id', 'visible': True, 'width': 120})
                for i, field in enumerate(available_fields[:3]):
                    visible_columns.append({
                        'field_name': field['field_name'],
                        'visible': True,
                        'width': 150
                    })
                visible_columns.append({'field_name': 'created_at', 'visible': True, 'width': 150})
            
            column_order = config.column_order if config and config.column_order else None
            if not column_order:
                # Default order: ID, metadata fields, created_at
                column_order = ['auto_id'] + [f['field_name'] for f in available_fields[:3]] + ['created_at']
            
            result[obj_type.name] = {
                'object_type_id': obj_type.id,
                'object_type_name': obj_type.name,
                'visible_columns': visible_columns,
                'column_order': column_order,
                'column_widths': config.column_widths if config and config.column_widths else {},
                'available_fields': available_fields
            }
        
        return jsonify(result), 200
    except Exception as e:
        logger.error(f"Error getting list view config: {str(e)}")
        return jsonify({'error': 'Failed to get list view config'}), 500


@bp.route('/list-view', methods=['PUT'])
def update_list_view_config():
    """Update list view configuration for object types"""
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({'error': 'Request body is required'}), 400
        
        updated_configs = []
        
        # Process each object type config in the request
        for object_type_name, config_data in data.items():
            object_type_id = config_data.get('object_type_id')
            visible_columns = config_data.get('visible_columns')
            column_order = config_data.get('column_order')
            column_widths = config_data.get('column_widths')
            
            if not object_type_id:
                continue
            
            # Check if object type exists
            object_type = ObjectType.query.get(object_type_id)
            if not object_type:
                logger.warning(f"Object type {object_type_id} not found")
                continue
            
            # Find or create config
            config = ViewConfiguration.query.filter_by(object_type_id=object_type_id).first()
            
            if config:
                # Update existing config
                if visible_columns is not None:
                    config.visible_columns = visible_columns
                if column_order is not None:
                    config.column_order = column_order
                if column_widths is not None:
                    config.column_widths = column_widths
            else:
                # Create new config
                config = ViewConfiguration(
                    object_type_id=object_type_id,
                    visible_columns=visible_columns,
                    column_order=column_order,
                    column_widths=column_widths
                )
                db.session.add(config)
            
            updated_configs.append(config)
        
        db.session.commit()
        
        return jsonify({
            'message': 'List view configuration updated successfully',
            'configs': [config.to_dict() for config in updated_configs]
        }), 200
        
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error updating list view config: {str(e)}")
        return jsonify({'error': 'Failed to update list view config'}), 500


@bp.route('/list-view/<int:object_type_id>', methods=['GET'])
def get_list_view_config_by_type(object_type_id):
    """Get list view configuration for a specific object type"""
    try:
        # Check if object type exists
        object_type = ObjectType.query.get(object_type_id)
        if not object_type:
            return jsonify({'error': 'Object type not found'}), 404
        
        config = ViewConfiguration.query.filter_by(object_type_id=object_type_id).first()
        
        # Get all available fields for this object type
        available_fields = [
            {
                'field_name': field.field_name,
                'display_name': field.display_name or field.field_name,
                'field_type': field.field_type,
                'is_table_visible': field.is_table_visible
            }
            for field in sorted(object_type.fields, key=lambda f: f.display_order or DEFAULT_DISPLAY_ORDER)
            if field.is_table_visible
        ]
        
        # Build default visible columns if not configured
        visible_columns = config.visible_columns if config and config.visible_columns else None
        if not visible_columns:
            visible_columns = []
            visible_columns.append({'field_name': 'auto_id', 'visible': True, 'width': 120})
            for i, field in enumerate(available_fields[:3]):
                visible_columns.append({
                    'field_name': field['field_name'],
                    'visible': True,
                    'width': 150
                })
            visible_columns.append({'field_name': 'created_at', 'visible': True, 'width': 150})
        
        column_order = config.column_order if config and config.column_order else None
        if not column_order:
            column_order = ['auto_id'] + [f['field_name'] for f in available_fields[:3]] + ['created_at']
        
        result = {
            'object_type_id': object_type.id,
            'object_type_name': object_type.name,
            'visible_columns': visible_columns,
            'column_order': column_order,
            'column_widths': config.column_widths if config and config.column_widths else {},
            'available_fields': available_fields
        }
        
        return jsonify(result), 200
    except Exception as e:
        logger.error(f"Error getting list view config for type {object_type_id}: {str(e)}")
        return jsonify({'error': 'Failed to get list view config'}), 500
