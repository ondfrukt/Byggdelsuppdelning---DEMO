"""CRUD + tree navigation API for CategoryNode."""
import logging

from flask import Blueprint, jsonify, request
from sqlalchemy.orm import joinedload, subqueryload

from extensions import cache
from models import db
from models.category_node import CategoryNode, VALID_LEVELS
from models.classification_system import ClassificationSystem
from models.object_category_assignment import ObjectCategoryAssignment

logger = logging.getLogger(__name__)
bp = Blueprint('category_nodes', __name__, url_prefix='/api/category-nodes')


@bp.after_request
def invalidate_cache_on_write(response):
    if request.method != 'GET' and response.status_code < 400:
        cache.clear()
    return response

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _normalize_parent_id(value):
    if value in (None, '', 'null', 'None'):
        return None
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return None
    return parsed if parsed > 0 else None


def _validate_parent(node, parent_id, system_id, exclude_id=None):
    """Return error string or None if parent is valid."""
    if parent_id is None:
        return None
    parent = db.session.get(CategoryNode, parent_id)
    if parent is None:
        return f'parent_id {parent_id} not found'
    if parent.system_id != system_id:
        return 'parent node must belong to the same classification system'
    if node is not None:
        # Circular reference check
        if parent_id == exclude_id:
            return 'cannot set node as its own parent'
        descendant_ids = node.get_descendant_ids()
        if parent_id in descendant_ids:
            return 'cannot move a node to one of its own descendants (circular reference)'
    return None


# ---------------------------------------------------------------------------
# GET /api/category-nodes
# ---------------------------------------------------------------------------
@bp.route('', methods=['GET'])
def list_nodes():
    """List category nodes
    ---
    tags:
      - Category Nodes
    summary: Lista kategorinoder
    parameters:
      - name: system_id
        in: query
        type: integer
        required: false
        description: Filtrera på klassificeringssystem
      - name: level
        in: query
        type: integer
        required: false
        description: Filtrera på nivå
      - name: parent_id
        in: query
        type: integer
        required: false
        description: Filtrera på föräldernod-ID
    responses:
      200:
        description: Lista med kategorinoder
        schema:
          type: array
          items:
            $ref: '#/definitions/CategoryNode'
      400:
        description: Valideringsfel
        schema:
          $ref: '#/definitions/Error'
    """
    query = CategoryNode.query

    system_id = request.args.get('system_id')
    if system_id:
        try:
            query = query.filter_by(system_id=int(system_id))
        except ValueError:
            return jsonify({'error': 'system_id must be an integer'}), 400

    level = request.args.get('level')
    if level:
        try:
            lv = int(level)
            if lv not in VALID_LEVELS:
                return jsonify({'error': f'level must be one of {VALID_LEVELS}'}), 400
            query = query.filter_by(level=lv)
        except ValueError:
            return jsonify({'error': 'level must be an integer'}), 400

    parent_id_raw = request.args.get('parent_id')
    if parent_id_raw is not None:
        if parent_id_raw.lower() in ('null', 'none', ''):
            query = query.filter(CategoryNode.parent_id.is_(None))
        else:
            try:
                query = query.filter_by(parent_id=int(parent_id_raw))
            except ValueError:
                return jsonify({'error': 'parent_id must be an integer or "null"'}), 400

    include_children = request.args.get('include_children', 'false').lower() in ('1', 'true', 'yes')
    nodes = query.order_by(CategoryNode.sort_order, CategoryNode.code).all()
    return jsonify([n.to_dict(include_children=include_children) for n in nodes]), 200


# ---------------------------------------------------------------------------
# POST /api/category-nodes
# ---------------------------------------------------------------------------
@bp.route('', methods=['POST'])
def create_node():
    """Create a category node
    ---
    tags:
      - Category Nodes
    summary: Skapa kategorinod
    consumes:
      - application/json
    parameters:
      - in: body
        name: body
        required: true
        schema:
          type: object
          required:
            - name
            - system_id
          properties:
            system_id:
              type: integer
              description: Klassificeringssystemets ID
            parent_id:
              type: integer
              description: Föräldernod-ID (null för rotnod)
            code:
              type: string
              description: Klassificeringskod
            name:
              type: string
              description: Nodens namn
            description:
              type: string
            sort_order:
              type: integer
    responses:
      201:
        description: Nod skapad
        schema:
          $ref: '#/definitions/CategoryNode'
      400:
        description: Valideringsfel
        schema:
          $ref: '#/definitions/Error'
      404:
        description: Föräldernod eller system hittades inte
        schema:
          $ref: '#/definitions/Error'
    """
    data = request.get_json()
    if not data:
        return jsonify({'error': 'Request body is required'}), 400

    code = (data.get('code') or '').strip() or None
    name = (data.get('name') or '').strip()
    if not name:
        return jsonify({'error': 'name is required'}), 400

    system_id = data.get('system_id')
    if not system_id:
        return jsonify({'error': 'system_id is required'}), 400
    if not db.session.get(ClassificationSystem, system_id):
        return jsonify({'error': f'classification system {system_id} not found'}), 400

    level = data.get('level')
    if level is None:
        return jsonify({'error': 'level is required'}), 400
    try:
        level = int(level)
    except (TypeError, ValueError):
        return jsonify({'error': 'level must be an integer'}), 400
    if level not in VALID_LEVELS:
        return jsonify({'error': f'level must be one of {VALID_LEVELS}'}), 400

    parent_id = _normalize_parent_id(data.get('parent_id'))

    # Validate parent relationship
    err = _validate_parent(None, parent_id, system_id)
    if err:
        return jsonify({'error': err}), 400
    if level == 1 and parent_id is not None:
        return jsonify({'error': 'parent_id must be null for level-1 nodes'}), 400
    if level > 1 and parent_id is None:
        return jsonify({'error': f'parent_id is required for level-{level} nodes'}), 400
    if parent_id is not None:
        parent = db.session.get(CategoryNode, parent_id)
        if parent.level != level - 1:
            return jsonify({'error': f'parent node must be at level {level - 1}'}), 400

    # Unique code check within system (only if code is provided)
    if code:
        existing = CategoryNode.query.filter_by(system_id=system_id, code=code).first()
        if existing:
            return jsonify({'error': f"code '{code}' already exists in this classification system"}), 409

    node = CategoryNode(
        system_id=system_id,
        parent_id=parent_id,
        code=code,
        name=name,
        level=level,
        description=(data.get('description') or '').strip() or None,
        sort_order=int(data.get('sort_order', 0)),
        is_active=bool(data.get('is_active', True)),
    )
    db.session.add(node)
    db.session.commit()
    logger.info("Created CategoryNode id=%s code=%s level=%s", node.id, node.code, node.level)
    return jsonify(node.to_dict()), 201


# ---------------------------------------------------------------------------
# GET /api/category-nodes/batch?ids=1,2,3
# ---------------------------------------------------------------------------
@bp.route('/batch', methods=['GET'])
def get_nodes_batch():
    """Return {id: {name, path_string}} for a list of node IDs in one request.
    ---
    tags:
      - Category Nodes
    summary: Hämta flera noder och deras sökvägar
    parameters:
      - name: ids
        in: query
        type: string
        required: true
        description: Kommaseparerade nod-ID:n (t.ex. 1,2,3)
    responses:
      200:
        description: Karta med nod-ID som nyckel
        schema:
          type: object
          additionalProperties:
            type: object
            properties:
              name:
                type: string
              path_string:
                type: string
                description: "Fullständig sökväg (t.ex. Bygg › Stomme › Betong)"
    """
    raw = request.args.get('ids', '')
    node_ids = []
    for part in raw.split(','):
        part = part.strip()
        if part:
            try:
                node_ids.append(int(part))
            except ValueError:
                pass

    if not node_ids:
        return jsonify({}), 200

    # Load all requested nodes in one query
    nodes_by_id = {
        n.id: n
        for n in CategoryNode.query.filter(CategoryNode.id.in_(node_ids)).all()
    }

    # Walk up the ancestor chain level by level until all parents are loaded.
    # Categories are typically 2-3 levels deep so this is 1-2 extra queries.
    known_ids = set(nodes_by_id.keys())
    pending_parent_ids = {
        n.parent_id for n in nodes_by_id.values() if n.parent_id and n.parent_id not in known_ids
    }
    while pending_parent_ids:
        parents = CategoryNode.query.filter(CategoryNode.id.in_(pending_parent_ids)).all()
        for p in parents:
            nodes_by_id[p.id] = p
        known_ids.update(p.id for p in parents)
        pending_parent_ids = {
            p.parent_id for p in parents if p.parent_id and p.parent_id not in known_ids
        }

    def _path_string(node):
        chain = [node.name]
        current = node
        for _ in range(20):  # guard against cycles
            if not current.parent_id:
                break
            parent = nodes_by_id.get(current.parent_id)
            if not parent:
                break
            chain.append(parent.name)
            current = parent
        chain.reverse()
        return ' › '.join(chain)

    result = {}
    for node_id in node_ids:
        node = nodes_by_id.get(node_id)
        if node:
            result[node_id] = {
                'name': node.name,
                'path_string': _path_string(node),
            }

    return jsonify(result), 200


# ---------------------------------------------------------------------------
# GET /api/category-nodes/<id>
# ---------------------------------------------------------------------------
@bp.route('/<int:node_id>', methods=['GET'])
def get_node(node_id):
    """Get a single category node
    ---
    tags:
      - Category Nodes
    summary: Hämta kategorinod
    parameters:
      - name: node_id
        in: path
        type: integer
        required: true
        description: Nodens ID
      - name: include_path
        in: query
        type: boolean
        default: false
        required: false
        description: Inkludera fullständig sökväg
    responses:
      200:
        description: Kategorinoden
        schema:
          $ref: '#/definitions/CategoryNode'
      404:
        description: Hittades inte
        schema:
          $ref: '#/definitions/Error'
    """
    node = CategoryNode.query.get_or_404(node_id)
    include_path = request.args.get('include_path', 'false').lower() in ('1', 'true', 'yes')
    result = node.to_dict()
    if include_path:
        ancestors = node.get_ancestors()  # root → parent order
        path_names = [a.name for a in ancestors] + [node.name]
        result['path'] = path_names
        result['path_string'] = ' › '.join(path_names)
    return jsonify(result), 200


# ---------------------------------------------------------------------------
# PUT /api/category-nodes/<id>
# ---------------------------------------------------------------------------
@bp.route('/<int:node_id>', methods=['PUT'])
def update_node(node_id):
    """Update a category node
    ---
    tags:
      - Category Nodes
    summary: Uppdatera kategorinod
    parameters:
      - name: node_id
        in: path
        type: integer
        required: true
        description: Nodens ID
      - in: body
        name: body
        required: true
        schema:
          type: object
          properties:
            code:
              type: string
            name:
              type: string
            description:
              type: string
            sort_order:
              type: integer
            is_active:
              type: boolean
    responses:
      200:
        description: Uppdaterad nod
        schema:
          $ref: '#/definitions/CategoryNode'
      400:
        description: Valideringsfel
        schema:
          $ref: '#/definitions/Error'
      404:
        description: Hittades inte
        schema:
          $ref: '#/definitions/Error'
    """
    node = CategoryNode.query.get_or_404(node_id)
    data = request.get_json()
    if not data:
        return jsonify({'error': 'Request body is required'}), 400

    if 'code' in data:
        code = (data['code'] or '').strip() or None
        if code:
            existing = CategoryNode.query.filter(
                CategoryNode.system_id == node.system_id,
                CategoryNode.code == code,
                CategoryNode.id != node_id,
            ).first()
            if existing:
                return jsonify({'error': f"code '{code}' already exists in this classification system"}), 409
        node.code = code

    if 'name' in data:
        name = (data['name'] or '').strip()
        if not name:
            return jsonify({'error': 'name cannot be empty'}), 400
        node.name = name

    if 'description' in data:
        node.description = (data['description'] or '').strip() or None
    if 'sort_order' in data:
        node.sort_order = int(data.get('sort_order', 0))
    if 'is_active' in data:
        node.is_active = bool(data['is_active'])

    db.session.commit()
    return jsonify(node.to_dict()), 200


# ---------------------------------------------------------------------------
# DELETE /api/category-nodes/<id>
# ---------------------------------------------------------------------------
@bp.route('/<int:node_id>', methods=['DELETE'])
def delete_node(node_id):
    """Delete a category node
    ---
    tags:
      - Category Nodes
    summary: Ta bort kategorinod
    parameters:
      - name: node_id
        in: path
        type: integer
        required: true
        description: Nodens ID
    responses:
      200:
        description: Nod borttagen
        schema:
          type: object
          properties:
            message:
              type: string
      404:
        description: Hittades inte
        schema:
          $ref: '#/definitions/Error'
      409:
        description: Noden har barn eller kopplade objekt
        schema:
          $ref: '#/definitions/Error'
    """
    node = CategoryNode.query.get_or_404(node_id)

    if node.children:
        return jsonify({
            'error': 'Cannot delete a node that has child nodes. Remove children first.'
        }), 409

    active_assignments = ObjectCategoryAssignment.query.filter_by(category_node_id=node_id).count()
    if active_assignments > 0:
        return jsonify({
            'error': f'Cannot delete node — {active_assignments} object(s) are classified under it.'
        }), 409

    db.session.delete(node)
    db.session.commit()
    logger.info("Deleted CategoryNode id=%s", node_id)
    return jsonify({'message': 'Category node deleted'}), 200


# ---------------------------------------------------------------------------
# GET /api/category-nodes/object-tree
# ---------------------------------------------------------------------------
@bp.route('/object-tree', methods=['GET'])
@cache.cached(timeout=60, query_string=True)
def object_tree():
    """Return category nodes with assigned objects and their direct relations as children.
    ---
    tags:
      - Category Nodes
    summary: Hämta kategorinodträd med objekt (cachad 60 s)
    parameters:
      - name: system_name
        in: query
        type: string
        required: true
        description: Klassificeringssystemets namn
    responses:
      200:
        description: Noder med objekt och barn
        schema:
          type: array
          items:
            type: object
    """
    from models import Object as ObjModel, ObjectRelation, ObjectData

    system_name = (request.args.get('system_name') or '').strip()
    if not system_name:
        return jsonify([]), 200

    system = ClassificationSystem.query.filter(
        db.func.lower(ClassificationSystem.name) == system_name.lower()
    ).first()
    if not system:
        logger.warning('object_tree: no classification system named %r', system_name)
        return jsonify([]), 200

    # Load ALL nodes for this system in one query (no lazy child traversal)
    all_nodes = (
        CategoryNode.query
        .filter_by(system_id=system.id)
        .order_by(CategoryNode.sort_order, CategoryNode.code)
        .all()
    )
    if not all_nodes:
        return jsonify([]), 200

    all_node_ids = [n.id for n in all_nodes]

    # Pre-build children lookup to avoid n.children lazy loads
    children_by_parent: dict = {}
    for n in all_nodes:
        if n.parent_id:
            children_by_parent.setdefault(n.parent_id, []).append(n)

    # Batch-load all assignments
    assignment_rows = (
        db.session.query(
            ObjectCategoryAssignment.category_node_id,
            ObjectCategoryAssignment.object_id,
        )
        .filter(ObjectCategoryAssignment.category_node_id.in_(all_node_ids))
        .all()
    )

    primary_obj_ids = list({row.object_id for row in assignment_rows})
    objects_map: dict = {}

    if primary_obj_ids:
        # Eager-load object_type and object_data in the same round-trip set
        objs = (
            ObjModel.query
            .filter(ObjModel.id.in_(primary_obj_ids))
            .options(
                joinedload(ObjModel.object_type),
                subqueryload(ObjModel.object_data).joinedload(ObjectData.field),
            )
            .all()
        )
        objects_map = {obj.id: obj for obj in objs}

    # Batch-load source relations
    relations_by_source: dict = {}
    if primary_obj_ids:
        relation_rows = (
            db.session.query(
                ObjectRelation.source_object_id,
                ObjectRelation.target_object_id,
                ObjectRelation.relation_type,
            )
            .filter(ObjectRelation.source_object_id.in_(primary_obj_ids))
            .all()
        )
        for rel in relation_rows:
            relations_by_source.setdefault(rel.source_object_id, []).append(
                (rel.target_object_id, rel.relation_type)
            )

    # Batch-load related target objects not already in objects_map
    all_related_ids = {
        tid
        for targets in relations_by_source.values()
        for tid, _ in targets
        if tid not in objects_map
    }
    if all_related_ids:
        related_objs = (
            ObjModel.query
            .filter(ObjModel.id.in_(all_related_ids))
            .options(
                joinedload(ObjModel.object_type),
                subqueryload(ObjModel.object_data).joinedload(ObjectData.field),
            )
            .all()
        )
        for obj in related_objs:
            objects_map[obj.id] = obj

    # Group primary objects by node_id
    objects_by_node: dict = {}
    for row in assignment_rows:
        obj = objects_map.get(row.object_id)
        if obj:
            objects_by_node.setdefault(row.category_node_id, []).append(obj)

    def _obj_dict(obj):
        data = obj.data or {}
        name = (
            data.get('Namn') or data.get('naam') or data.get('namn') or
            data.get('Name') or data.get('name') or
            obj.id_full or str(obj.id)
        )
        return {
            'id': str(obj.id),
            'id_full': obj.id_full or '',
            'name': str(name),
            'type': obj.object_type.name if obj.object_type else '',
            'created_at': obj.created_at.isoformat() if obj.created_at else None,
            'data': dict(data),
            'files': [],
            'file_count': 0,
        }

    def _is_file_type(type_name):
        normalized = (type_name or '').strip().lower().replace(' ', '')
        return normalized in {'filobjekt', 'fileobject'}

    def _build_obj_node(obj):
        node = _obj_dict(obj)
        related = sorted(
            (
                objects_map[tid]
                for tid, _ in relations_by_source.get(obj.id, [])
                if tid in objects_map and objects_map[tid].object_type
                and not _is_file_type(objects_map[tid].object_type.name)
            ),
            key=lambda o: o.id_full or ''
        )
        node['children'] = [_obj_dict(r) | {'children': []} for r in related]
        return node

    def _build_cat_node(cat_node):
        # Use pre-built lookup instead of cat_node.children (avoids lazy loads)
        child_cat_nodes = children_by_parent.get(cat_node.id, [])
        children = [_build_cat_node(c) for c in child_cat_nodes]
        for obj in sorted(objects_by_node.get(cat_node.id, []), key=lambda o: o.id_full or ''):
            if obj and obj.object_type and not _is_file_type(obj.object_type.name):
                children.append(_build_obj_node(obj))
        return {
            'id': f'cat-{cat_node.id}',
            'name': cat_node.name,
            'type': 'category_node',
            'children': children,
        }

    root_nodes = [n for n in all_nodes if n.parent_id is None]
    result = [_build_cat_node(n) for n in root_nodes]
    return jsonify(result), 200


# ---------------------------------------------------------------------------
# GET /api/category-nodes/<id>/tree
# ---------------------------------------------------------------------------
@bp.route('/<int:node_id>/tree', methods=['GET'])
def get_tree(node_id):
    """Get a category node tree rooted at this node
    ---
    tags:
      - Category Nodes
    summary: Hämta nodträd
    parameters:
      - name: node_id
        in: path
        type: integer
        required: true
        description: Rotnodensins ID
    responses:
      200:
        description: Noden med alla descendanter
        schema:
          $ref: '#/definitions/CategoryNode'
      404:
        description: Hittades inte
        schema:
          $ref: '#/definitions/Error'
    """
    node = CategoryNode.query.get_or_404(node_id)
    return jsonify(node.to_dict(include_children=True)), 200


# ---------------------------------------------------------------------------
# GET /api/category-nodes/<id>/ancestors
# ---------------------------------------------------------------------------
@bp.route('/<int:node_id>/ancestors', methods=['GET'])
def get_ancestors(node_id):
    """Get all ancestors of a category node
    ---
    tags:
      - Category Nodes
    summary: Hämta förfäder till en nod
    parameters:
      - name: node_id
        in: path
        type: integer
        required: true
        description: Nodens ID
    responses:
      200:
        description: Lista med förfäder (rot → förälder)
        schema:
          type: array
          items:
            $ref: '#/definitions/CategoryNode'
      404:
        description: Hittades inte
        schema:
          $ref: '#/definitions/Error'
    """
    node = CategoryNode.query.get_or_404(node_id)
    ancestors = node.get_ancestors()
    return jsonify([a.to_dict() for a in ancestors]), 200


# ---------------------------------------------------------------------------
# POST /api/category-nodes/<id>/move
# ---------------------------------------------------------------------------
@bp.route('/<int:node_id>/move', methods=['POST'])
def move_node(node_id):
    """Move a category node to a new parent
    ---
    tags:
      - Category Nodes
    summary: Flytta kategorinod
    parameters:
      - name: node_id
        in: path
        type: integer
        required: true
        description: Nodens ID
      - in: body
        name: body
        required: true
        schema:
          type: object
          required:
            - new_parent_id
          properties:
            new_parent_id:
              type: integer
              description: Ny föräldernod-ID (null för rotnod)
    responses:
      200:
        description: Nod flyttad
        schema:
          $ref: '#/definitions/CategoryNode'
      400:
        description: Valideringsfel (t.ex. cirkulär referens)
        schema:
          $ref: '#/definitions/Error'
      404:
        description: Hittades inte
        schema:
          $ref: '#/definitions/Error'
    """
    node = CategoryNode.query.get_or_404(node_id)
    data = request.get_json()
    if not data:
        return jsonify({'error': 'Request body is required'}), 400

    new_parent_id = _normalize_parent_id(data.get('new_parent_id'))

    if node.level == 1 and new_parent_id is not None:
        return jsonify({'error': 'Level-1 nodes cannot have a parent'}), 400
    if node.level > 1 and new_parent_id is None:
        return jsonify({'error': f'parent_id is required for level-{node.level} nodes'}), 400

    if new_parent_id is not None:
        new_parent = db.session.get(CategoryNode, new_parent_id)
        if new_parent is None:
            return jsonify({'error': f'new_parent_id {new_parent_id} not found'}), 400
        if new_parent.system_id != node.system_id:
            return jsonify({'error': 'New parent must belong to the same classification system'}), 400
        if new_parent.level != node.level - 1:
            return jsonify({'error': f'New parent must be at level {node.level - 1}'}), 400

        err = _validate_parent(node, new_parent_id, node.system_id, exclude_id=node_id)
        if err:
            return jsonify({'error': err}), 400

    node.parent_id = new_parent_id
    db.session.commit()
    logger.info("Moved CategoryNode id=%s to parent_id=%s", node_id, new_parent_id)
    return jsonify(node.to_dict()), 200
