from flask import Blueprint, request, jsonify
from sqlalchemy import or_
from models import db, Object, ObjectRelation
from routes.relation_type_rules import (
    validate_relation_type_scope,
    enforce_pair_relation_type,
    normalize_relation_direction,
)
import logging

logger = logging.getLogger(__name__)
bp = Blueprint('object_relations', __name__, url_prefix='/api/objects')
DEFAULT_RELATION_TYPE = 'references_object'



def is_file_object(obj):
    type_name = obj.object_type.name if obj and obj.object_type else ''
    return type_name.strip().lower() in {'filobjekt', 'fileobject', 'file object'}


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
    """Get all relations for an object
    ---
    tags:
      - Object Relations
    summary: Hämta relationer för ett objekt
    parameters:
      - name: id
        in: path
        type: integer
        required: true
        description: Objektets ID
    responses:
      200:
        description: Lista med relationer (inkl. riktning)
        schema:
          type: array
          items:
            $ref: '#/definitions/ObjectRelation'
      404:
        description: Objektet hittades inte
        schema:
          $ref: '#/definitions/Error'
      500:
        description: Serverfel
        schema:
          $ref: '#/definitions/Error'
    """
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
    """Create a new relation from an object
    ---
    tags:
      - Object Relations
    summary: Skapa relation från ett objekt
    parameters:
      - name: id
        in: path
        type: integer
        required: true
        description: Källobjektets ID
      - in: body
        name: body
        required: true
        schema:
          type: object
          required:
            - target_object_id
          properties:
            target_object_id:
              type: integer
              description: Målobjektets ID
            relation_type:
              type: string
              description: Relationstyp (default auto)
            description:
              type: string
            metadata:
              type: object
    responses:
      201:
        description: Relation skapad
        schema:
          $ref: '#/definitions/ObjectRelation'
      400:
        description: Valideringsfel
        schema:
          $ref: '#/definitions/Error'
      404:
        description: Objekt hittades inte
        schema:
          $ref: '#/definitions/Error'
      409:
        description: Relation finns redan
        schema:
          $ref: '#/definitions/Error'
      422:
        description: Relationstyp inte tillåten
        schema:
          $ref: '#/definitions/Error'
      500:
        description: Serverfel
        schema:
          $ref: '#/definitions/Error'
    """
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

        relation_type = (data.get('relation_type') or 'auto').strip().lower() or 'auto'
        relation_type, source_object, target_object, _ = normalize_relation_direction(
            relation_type=relation_type,
            source_object=source_object,
            target_object=target_object,
        )

        relation_type, pair_type_error = enforce_pair_relation_type(
            relation_type=relation_type,
            source_object=source_object,
            target_object=target_object,
            fallback=DEFAULT_RELATION_TYPE
        )
        if pair_type_error:
            return jsonify({'error': pair_type_error}), 422

        relation_scope_error = validate_relation_type_scope(relation_type, source_object, target_object)
        if relation_scope_error:
            return jsonify({'error': relation_scope_error}), 422

        canonical_source_id = source_object.id
        canonical_target_id = target_object.id
        target_id_full = normalize_id_full(target_object.id_full)
        if target_id_full and target_id_full in get_linked_id_fulls(canonical_source_id):
            return jsonify({'error': f'Relation already exists for full ID: {target_object.id_full}'}), 409

        # Create relation
        relation = ObjectRelation(
            source_object_id=canonical_source_id,
            target_object_id=canonical_target_id,
            relation_type=relation_type,
            description=data.get('description'),
            relation_metadata=data.get('metadata')
        )
        
        db.session.add(relation)
        db.session.commit()
        
        logger.info(f"Created relation from {source_object.id_full} to {target_object.id_full}")
        return jsonify(relation.to_dict(include_objects=True)), 201
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error creating relation: {str(e)}")
        return jsonify({'error': 'Failed to create relation'}), 500


@bp.route('/<int:id>/relations/<int:relation_id>', methods=['DELETE'])
def delete_relation(id, relation_id):
    """Delete a relation from an object
    ---
    tags:
      - Object Relations
    summary: Ta bort relation från ett objekt
    parameters:
      - name: id
        in: path
        type: integer
        required: true
        description: Objektets ID
      - name: relation_id
        in: path
        type: integer
        required: true
        description: Relationens ID
    responses:
      200:
        description: Relation borttagen
        schema:
          type: object
          properties:
            message:
              type: string
      404:
        description: Relation hittades inte för detta objekt
        schema:
          $ref: '#/definitions/Error'
      500:
        description: Serverfel
        schema:
          $ref: '#/definitions/Error'
    """
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
    """Update a relation for an object
    ---
    tags:
      - Object Relations
    summary: Uppdatera relation
    parameters:
      - name: id
        in: path
        type: integer
        required: true
        description: Källobjektets ID
      - name: relation_id
        in: path
        type: integer
        required: true
        description: Relationens ID
      - in: body
        name: body
        required: true
        schema:
          type: object
          properties:
            description:
              type: string
            metadata:
              type: object
    responses:
      200:
        description: Uppdaterad relation
        schema:
          $ref: '#/definitions/ObjectRelation'
      404:
        description: Hittades inte
        schema:
          $ref: '#/definitions/Error'
      500:
        description: Serverfel
        schema:
          $ref: '#/definitions/Error'
    """
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
    """Get all file objects linked to a non-file object, independent of relation type.
    ---
    tags:
      - Object Relations
    summary: Hämta länkade filobjekt
    parameters:
      - name: id
        in: path
        type: integer
        required: true
        description: Objektets ID (måste INTE vara FileObject)
    responses:
      200:
        description: Lista med länkade filobjekt
        schema:
          type: array
          items:
            type: object
            properties:
              relation_id:
                type: integer
              file_object:
                $ref: '#/definitions/Object'
              documents_count:
                type: integer
      422:
        description: Källobjektet är ett FileObject
        schema:
          $ref: '#/definitions/Error'
      500:
        description: Serverfel
        schema:
          $ref: '#/definitions/Error'
    """
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
