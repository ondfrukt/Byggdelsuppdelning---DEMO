from flask import Blueprint, request, jsonify
from models import db, Object, ObjectType, ObjectData
from sqlalchemy import or_
import logging

logger = logging.getLogger(__name__)
bp = Blueprint('search', __name__, url_prefix='/api')


@bp.route('/search', methods=['GET'])
def search():
    """Search across all objects"""
    try:
        # Get search parameters
        query_string = request.args.get('q', '').strip()
        object_type_name = request.args.get('type')
        field_name = request.args.get('field')
        
        if not query_string:
            return jsonify([]), 200
        
        # Build base query
        query = Object.query
        
        # Filter by object type if specified
        if object_type_name:
            query = query.join(ObjectType).filter(ObjectType.name == object_type_name)
        
        # Get all objects
        objects = query.all()
        
        # Filter by search term
        results = []
        query_lower = query_string.lower()
        
        for obj in objects:
            # Check auto_id
            if query_lower in obj.auto_id.lower():
                results.append(obj)
                continue
            
            # Check object data
            for od in obj.object_data:
                # If field is specified, only search in that field
                if field_name and od.field and od.field.field_name != field_name:
                    continue
                
                # Search in text values
                if od.value_text and query_lower in od.value_text.lower():
                    results.append(obj)
                    break
        
        # Remove duplicates while preserving order
        seen = set()
        unique_results = []
        for obj in results:
            if obj.id not in seen:
                seen.add(obj.id)
                unique_results.append(obj)
        
        return jsonify([obj.to_dict(include_data=True) for obj in unique_results]), 200
    except Exception as e:
        logger.error(f"Error searching: {str(e)}")
        return jsonify({'error': 'Search failed'}), 500


@bp.route('/stats', methods=['GET'])
def stats():
    """Get statistics about objects"""
    try:
        # Count objects per type
        object_types = ObjectType.query.all()
        stats_data = {
            'total_objects': Object.query.count(),
            'by_type': {}
        }
        
        for ot in object_types:
            count = Object.query.filter_by(object_type_id=ot.id).count()
            stats_data['by_type'][ot.name] = count
        
        return jsonify(stats_data), 200
    except Exception as e:
        logger.error(f"Error getting stats: {str(e)}")
        return jsonify({'error': 'Failed to get statistics'}), 500
