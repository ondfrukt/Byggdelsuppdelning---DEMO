from flask import Blueprint, request, jsonify
from models import db, Object, ObjectType, ObjectField, ObjectData
from utils.auto_id_generator import generate_auto_id
from utils.validators import validate_object_data
from datetime import datetime, date
from decimal import Decimal
import logging

logger = logging.getLogger(__name__)
bp = Blueprint('objects', __name__, url_prefix='/api/objects')


@bp.route('', methods=['GET'])
def list_objects():
    """List all objects with optional filtering"""
    try:
        # Get filter parameters
        object_type_name = request.args.get('type')
        search = request.args.get('search')
        
        # Build query
        query = Object.query
        
        # Filter by object type
        if object_type_name:
            query = query.join(ObjectType).filter(ObjectType.name == object_type_name)
        
        # Execute query
        objects = query.order_by(Object.created_at.desc()).all()
        
        # Filter by search in data (if needed)
        if search:
            search_lower = search.lower()
            filtered_objects = []
            for obj in objects:
                # Search in auto_id
                if search_lower in obj.auto_id.lower():
                    filtered_objects.append(obj)
                    continue
                # Search in data values
                for od in obj.object_data:
                    if od.value_text and search_lower in od.value_text.lower():
                        filtered_objects.append(obj)
                        break
            objects = filtered_objects
        
        return jsonify([obj.to_dict(include_data=True) for obj in objects]), 200
    except Exception as e:
        logger.error(f"Error listing objects: {str(e)}")
        return jsonify({'error': 'Failed to list objects'}), 500


@bp.route('/<int:id>', methods=['GET'])
def get_object(id):
    """Get a specific object with all data and relations"""
    try:
        obj = Object.query.get_or_404(id)
        return jsonify(obj.to_dict(include_data=True, include_relations=True, include_documents=True)), 200
    except Exception as e:
        logger.error(f"Error getting object: {str(e)}")
        return jsonify({'error': 'Failed to get object'}), 500


@bp.route('', methods=['POST'])
def create_object():
    """Create a new object with dynamic data"""
    try:
        data = request.get_json()
        
        # Validate required fields
        if not data.get('object_type_id'):
            return jsonify({'error': 'object_type_id is required'}), 400
        
        # Get object type
        object_type = ObjectType.query.get(data['object_type_id'])
        if not object_type:
            return jsonify({'error': 'Invalid object_type_id'}), 400
        
        # Get object data
        object_data = data.get('data', {})
        
        # Validate object data against fields
        is_valid, errors = validate_object_data(object_type.fields, object_data)
        if not is_valid:
            return jsonify({'error': 'Validation failed', 'details': errors}), 400
        
        # Generate auto ID
        auto_id = generate_auto_id(object_type.name)
        
        # Create object
        obj = Object(
            object_type_id=object_type.id,
            auto_id=auto_id,
            created_by=data.get('created_by')
        )
        
        db.session.add(obj)
        db.session.flush()
        
        # Add object data
        for field in object_type.fields:
            field_name = field.field_name
            value = object_data.get(field_name)
            
            if value is not None and value != '':
                obj_data = ObjectData(
                    object_id=obj.id,
                    field_id=field.id
                )
                
                # Set value based on field type
                if field.field_type == 'number':
                    # Handle both string and numeric input
                    if isinstance(value, (int, float)):
                        obj_data.value_number = Decimal(str(value))
                    else:
                        obj_data.value_number = Decimal(value)
                elif field.field_type == 'date':
                    if isinstance(value, str):
                        obj_data.value_date = datetime.fromisoformat(value.replace('Z', '+00:00')).date()
                    else:
                        obj_data.value_date = value
                elif field.field_type == 'boolean':
                    obj_data.value_boolean = bool(value)
                else:
                    obj_data.value_text = str(value)
                
                db.session.add(obj_data)
        
        db.session.commit()
        
        logger.info(f"Created object: {obj.auto_id}")
        return jsonify(obj.to_dict(include_data=True)), 201
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error creating object: {str(e)}")
        return jsonify({'error': 'Failed to create object', 'details': str(e)}), 500


@bp.route('/<int:id>', methods=['PUT'])
def update_object(id):
    """Update an object's data"""
    try:
        obj = Object.query.get_or_404(id)
        data = request.get_json()
        
        # Get object data
        object_data = data.get('data', {})
        
        # Validate object data against fields
        is_valid, errors = validate_object_data(obj.object_type.fields, object_data)
        if not is_valid:
            return jsonify({'error': 'Validation failed', 'details': errors}), 400
        
        # Update object data
        for field in obj.object_type.fields:
            field_name = field.field_name
            value = object_data.get(field_name)
            
            # Find existing object data
            existing = ObjectData.query.filter_by(
                object_id=obj.id,
                field_id=field.id
            ).first()
            
            if value is not None and value != '':
                if not existing:
                    existing = ObjectData(
                        object_id=obj.id,
                        field_id=field.id
                    )
                    db.session.add(existing)
                
                # Update value based on field type
                if field.field_type == 'number':
                    existing.value_number = Decimal(str(value))
                    existing.value_text = None
                    existing.value_date = None
                    existing.value_boolean = None
                elif field.field_type == 'date':
                    if isinstance(value, str):
                        existing.value_date = datetime.fromisoformat(value.replace('Z', '+00:00')).date()
                    else:
                        existing.value_date = value
                    existing.value_text = None
                    existing.value_number = None
                    existing.value_boolean = None
                elif field.field_type == 'boolean':
                    existing.value_boolean = bool(value)
                    existing.value_text = None
                    existing.value_number = None
                    existing.value_date = None
                else:
                    existing.value_text = str(value)
                    existing.value_number = None
                    existing.value_date = None
                    existing.value_boolean = None
                
                existing.updated_at = datetime.utcnow()
            elif existing:
                # Remove if value is empty
                db.session.delete(existing)
        
        obj.updated_at = datetime.utcnow()
        db.session.commit()
        
        logger.info(f"Updated object: {obj.auto_id}")
        return jsonify(obj.to_dict(include_data=True)), 200
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error updating object: {str(e)}")
        return jsonify({'error': 'Failed to update object', 'details': str(e)}), 500


@bp.route('/<int:id>', methods=['DELETE'])
def delete_object(id):
    """Delete an object"""
    try:
        obj = Object.query.get_or_404(id)
        auto_id = obj.auto_id
        
        db.session.delete(obj)
        db.session.commit()
        
        logger.info(f"Deleted object: {auto_id}")
        return jsonify({'message': 'Object deleted successfully'}), 200
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error deleting object: {str(e)}")
        return jsonify({'error': 'Failed to delete object'}), 500
