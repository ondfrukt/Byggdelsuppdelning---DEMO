from flask import Blueprint, request, jsonify
from sqlalchemy import or_
from models import db, Object, ObjectRelation
import logging

logger = logging.getLogger(__name__)
bp = Blueprint('object_relations', __name__, url_prefix='/api/objects')
DEFAULT_RELATION_TYPE = 'relaterad'


def is_file_object(obj):
    type_name = obj.object_type.name if obj and obj.object_type else ''
    return type_name.strip().lower() == 'filobjekt'


def normalize_id_full(value):
    if value is None:
        return ''
    return str(value).strip().lower()


def get_linked_id_fulls(source_id):
    linked_id_fulls = set()
    relations = ObjectRelation.query.filter(
        or_(
            ObjectRelation.source_object_id == source_id,
            ObjectRelation.target_object_id == source_id
        )
    ).all()

    for relation in relations:
        linked_object = relation.target_object if relation.source_object_id == source_id else relation.source_object
        linked_id_full = normalize_id_full(linked_object.id_full if linked_object else None)
        if linked_id_full:
            linked_id_fulls.add(linked_id_full)

    return linked_id_fulls


@bp.route('/<int:id>/relations', methods=['GET'])
def get_relations(id):
    """Get all relations for an object"""
    try:
        Object.query.get_or_404(id)

        relations = ObjectRelation.query.filter(
            or_(
                ObjectRelation.source_object_id == id,
                ObjectRelation.target_object_id == id
            )
        ).all()

        relation_entities = []
        for rel in relations:
            relation_data = rel.to_dict(include_objects=True)
            relation_data['direction'] = 'outgoing' if rel.source_object_id == id else 'incoming'
            relation_entities.append(relation_data)

        return jsonify(relation_entities), 200
    except Exception as e:
        logger.error(f"Error getting relations: {str(e)}")
        return jsonify({'error': 'Failed to get relations'}), 500


@bp.route('/<int:id>/relations', methods=['POST'])
def create_relation(id):
    """Create a new relation"""
    try:
        source_object = Object.query.get_or_404(id)
        data = request.get_json() or {}
        
        # Validate required fields
        if not data.get('target_object_id'):
            return jsonify({'error': 'target_object_id is required'}), 400
        
        # Check if target object exists
        target_object = Object.query.get(data['target_object_id'])
        if not target_object:
            return jsonify({'error': 'Invalid target_object_id'}), 400

        relation_type = (data.get('relation_type') or DEFAULT_RELATION_TYPE).strip().lower() or DEFAULT_RELATION_TYPE

        target_id_full = normalize_id_full(target_object.id_full)
        if target_id_full and target_id_full in get_linked_id_fulls(id):
            return jsonify({'error': f'Relation already exists for full ID: {target_object.id_full}'}), 409

        # Create relation
        relation = ObjectRelation(
            source_object_id=id,
            target_object_id=data['target_object_id'],
            relation_type=relation_type,
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


@bp.route('/<int:id>/relations/<int:relation_id>', methods=['DELETE'])
def delete_relation(id, relation_id):
    """Delete a relation"""
    try:
        # Verify the relation belongs to this object (as source or target)
        relation = ObjectRelation.query.filter(
            ObjectRelation.id == relation_id,
            or_(
                ObjectRelation.source_object_id == id,
                ObjectRelation.target_object_id == id
            )
        ).first_or_404()
        
        db.session.delete(relation)
        db.session.commit()
        
        logger.info(f"Deleted relation {relation_id} from object {id}")
        return jsonify({'message': 'Relation deleted successfully'}), 200
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error deleting relation: {str(e)}")
        return jsonify({'error': 'Failed to delete relation'}), 500


@bp.route('/<int:id>/relations/<int:relation_id>', methods=['PUT'])
def update_relation(id, relation_id):
    """Update a relation"""
    try:
        # Verify the relation belongs to this object
        relation = ObjectRelation.query.filter_by(
            id=relation_id,
            source_object_id=id
        ).first_or_404()
        data = request.get_json()
        
        # Update fields
        if 'description' in data:
            relation.description = data['description']
        
        if 'metadata' in data:
            relation.relation_metadata = data['metadata']
        
        db.session.commit()
        
        logger.info(f"Updated relation {relation_id} for object {id}")
        return jsonify(relation.to_dict(include_objects=True)), 200
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error updating relation: {str(e)}")
        return jsonify({'error': 'Failed to update relation'}), 500


@bp.route('/<int:id>/linked-file-objects', methods=['GET'])
def get_linked_file_objects(id):
    """Get all file objects linked to a non-file object, independent of relation type."""
    try:
        source_object = Object.query.get_or_404(id)
        if is_file_object(source_object):
            return jsonify({'error': 'SOURCE_MUST_BE_NON_FILE_OBJECT'}), 422

        relations = ObjectRelation.query.filter(
            or_(
                ObjectRelation.source_object_id == id,
                ObjectRelation.target_object_id == id
            )
        ).all()

        response = []
        for relation in relations:
            linked = relation.target_object if relation.source_object_id == id else relation.source_object
            if not is_file_object(linked):
                continue

            response.append({
                'relation_id': relation.id,
                'file_object': linked.to_dict(include_data=True),
                'documents_count': len(linked.documents)
            })

        return jsonify(response), 200
    except Exception as e:
        logger.error(f"Error getting linked file objects: {str(e)}")
        return jsonify({'error': 'Failed to get linked file objects'}), 500
