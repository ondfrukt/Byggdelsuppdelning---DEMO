from flask import Blueprint, request, jsonify
from models import db, Object, ObjectRelation
import logging

logger = logging.getLogger(__name__)
bp = Blueprint('object_relations', __name__, url_prefix='/api/objects')


@bp.route('/<int:id>/relations', methods=['GET'])
def get_relations(id):
    """Get all relations for an object"""
    try:
        obj = Object.query.get_or_404(id)
        
        # Get all relations where this object is the source
        relations = ObjectRelation.query.filter_by(source_object_id=id).all()
        
        # Group by relation type
        grouped = {}
        for rel in relations:
            if rel.relation_type not in grouped:
                grouped[rel.relation_type] = []
            grouped[rel.relation_type].append(rel.to_dict(include_objects=True))
        
        return jsonify(grouped), 200
    except Exception as e:
        logger.error(f"Error getting relations: {str(e)}")
        return jsonify({'error': 'Failed to get relations'}), 500


@bp.route('/<int:id>/relations', methods=['POST'])
def create_relation(id):
    """Create a new relation"""
    try:
        source_object = Object.query.get_or_404(id)
        data = request.get_json()
        
        # Validate required fields
        if not data.get('target_object_id') or not data.get('relation_type'):
            return jsonify({'error': 'target_object_id and relation_type are required'}), 400
        
        # Check if target object exists
        target_object = Object.query.get(data['target_object_id'])
        if not target_object:
            return jsonify({'error': 'Invalid target_object_id'}), 400
        
        # Create relation
        relation = ObjectRelation(
            source_object_id=id,
            target_object_id=data['target_object_id'],
            relation_type=data['relation_type'],
            description=data.get('description'),
            relation_metadata=data.get('metadata')
        )
        
        db.session.add(relation)
        db.session.commit()
        
        logger.info(f"Created relation from {source_object.auto_id} to {target_object.auto_id}")
        return jsonify(relation.to_dict(include_objects=True)), 201
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error creating relation: {str(e)}")
        return jsonify({'error': 'Failed to create relation'}), 500


@bp.route('/relations/<int:relation_id>', methods=['DELETE'])
def delete_relation(relation_id):
    """Delete a relation"""
    try:
        relation = ObjectRelation.query.get_or_404(relation_id)
        
        db.session.delete(relation)
        db.session.commit()
        
        logger.info(f"Deleted relation {relation_id}")
        return jsonify({'message': 'Relation deleted successfully'}), 200
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error deleting relation: {str(e)}")
        return jsonify({'error': 'Failed to delete relation'}), 500


@bp.route('/relations/<int:relation_id>', methods=['PUT'])
def update_relation(relation_id):
    """Update a relation"""
    try:
        relation = ObjectRelation.query.get_or_404(relation_id)
        data = request.get_json()
        
        # Update fields
        if 'description' in data:
            relation.description = data['description']
        
        if 'metadata' in data:
            relation.relation_metadata = data['metadata']
        
        db.session.commit()
        
        logger.info(f"Updated relation {relation_id}")
        return jsonify(relation.to_dict(include_objects=True)), 200
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error updating relation: {str(e)}")
        return jsonify({'error': 'Failed to update relation'}), 500
