"""CRUD + tree navigation API for CategoryNode."""
import logging

from flask import Blueprint, jsonify, request

from models import db
from models.category_node import CategoryNode, VALID_LEVELS
from models.classification_system import ClassificationSystem
from models.object_category_assignment import ObjectCategoryAssignment

logger = logging.getLogger(__name__)
bp = Blueprint('category_nodes', __name__, url_prefix='/api/category-nodes')

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
    parent = CategoryNode.query.get(parent_id)
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
    data = request.get_json()
    if not data:
        return jsonify({'error': 'Request body is required'}), 400

    code = (data.get('code') or '').strip()
    name = (data.get('name') or '').strip()
    if not code:
        return jsonify({'error': 'code is required'}), 400
    if not name:
        return jsonify({'error': 'name is required'}), 400

    system_id = data.get('system_id')
    if not system_id:
        return jsonify({'error': 'system_id is required'}), 400
    if not ClassificationSystem.query.get(system_id):
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
        parent = CategoryNode.query.get(parent_id)
        if parent.level != level - 1:
            return jsonify({'error': f'parent node must be at level {level - 1}'}), 400

    # Unique code check within system
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
# GET /api/category-nodes/<id>
# ---------------------------------------------------------------------------
@bp.route('/<int:node_id>', methods=['GET'])
def get_node(node_id):
    node = CategoryNode.query.get_or_404(node_id)
    return jsonify(node.to_dict()), 200


# ---------------------------------------------------------------------------
# PUT /api/category-nodes/<id>
# ---------------------------------------------------------------------------
@bp.route('/<int:node_id>', methods=['PUT'])
def update_node(node_id):
    node = CategoryNode.query.get_or_404(node_id)
    data = request.get_json()
    if not data:
        return jsonify({'error': 'Request body is required'}), 400

    if 'code' in data:
        code = (data['code'] or '').strip()
        if not code:
            return jsonify({'error': 'code cannot be empty'}), 400
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
def object_tree():
    """Return category nodes with assigned objects and their direct relations as children."""
    from models import Object as ObjModel, ObjectRelation

    system_name = (request.args.get('system_name') or '').strip()
    if not system_name:
        return jsonify([]), 200

    system = ClassificationSystem.query.filter(
        db.func.lower(ClassificationSystem.name) == system_name.lower()
    ).first()
    if not system:
        logger.warning('object_tree: no classification system named %r', system_name)
        return jsonify([]), 200

    # Load root nodes; children are lazy-loaded via relationship
    root_nodes = (
        CategoryNode.query
        .filter_by(system_id=system.id, parent_id=None)
        .order_by(CategoryNode.sort_order, CategoryNode.code)
        .all()
    )

    # Collect all node IDs in the system tree
    all_node_ids = []

    def _collect_ids(nodes):
        for n in nodes:
            all_node_ids.append(n.id)
            _collect_ids(n.children)

    _collect_ids(root_nodes)
    if not all_node_ids:
        return jsonify([]), 200

    # Batch-load all assignments for this system's nodes
    assignment_rows = (
        db.session.query(
            ObjectCategoryAssignment.category_node_id,
            ObjectCategoryAssignment.object_id,
        )
        .filter(ObjectCategoryAssignment.category_node_id.in_(all_node_ids))
        .all()
    )

    # Batch-load primary objects (assigned to nodes)
    primary_obj_ids = list({row.object_id for row in assignment_rows})
    objects_map = {}
    if primary_obj_ids:
        objs = ObjModel.query.filter(ObjModel.id.in_(primary_obj_ids)).all()
        objects_map = {obj.id: obj for obj in objs}

    # Batch-load direct relations where a primary object is the source
    relations_by_source = {}  # source_id -> [target_id, ...]
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

    # Batch-load all related (target) objects not already in objects_map
    all_related_ids = {
        tid
        for targets in relations_by_source.values()
        for tid, _ in targets
        if tid not in objects_map
    }
    if all_related_ids:
        related_objs = ObjModel.query.filter(ObjModel.id.in_(all_related_ids)).all()
        for obj in related_objs:
            objects_map[obj.id] = obj

    # Group primary objects by node_id
    objects_by_node = {}
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
        }

    def _build_obj_node(obj):
        node = _obj_dict(obj)
        # Attach direct related objects as children (sorted by id_full)
        related = sorted(
            (
                objects_map[tid]
                for tid, _ in relations_by_source.get(obj.id, [])
                if tid in objects_map and objects_map[tid].object_type
            ),
            key=lambda o: o.id_full or ''
        )
        node['children'] = [_obj_dict(r) | {'children': []} for r in related]
        return node

    def _build_cat_node(cat_node):
        children = [_build_cat_node(c) for c in cat_node.children]
        for obj in sorted(objects_by_node.get(cat_node.id, []), key=lambda o: o.id_full or ''):
            if obj and obj.object_type:
                children.append(_build_obj_node(obj))
        return {
            'id': f'cat-{cat_node.id}',
            'name': cat_node.name,
            'type': 'category_node',
            'children': children,
        }

    result = [_build_cat_node(n) for n in root_nodes]
    return jsonify(result), 200


# ---------------------------------------------------------------------------
# GET /api/category-nodes/<id>/tree
# ---------------------------------------------------------------------------
@bp.route('/<int:node_id>/tree', methods=['GET'])
def get_tree(node_id):
    node = CategoryNode.query.get_or_404(node_id)
    return jsonify(node.to_dict(include_children=True)), 200


# ---------------------------------------------------------------------------
# GET /api/category-nodes/<id>/ancestors
# ---------------------------------------------------------------------------
@bp.route('/<int:node_id>/ancestors', methods=['GET'])
def get_ancestors(node_id):
    node = CategoryNode.query.get_or_404(node_id)
    ancestors = node.get_ancestors()
    return jsonify([a.to_dict() for a in ancestors]), 200


# ---------------------------------------------------------------------------
# POST /api/category-nodes/<id>/move
# ---------------------------------------------------------------------------
@bp.route('/<int:node_id>/move', methods=['POST'])
def move_node(node_id):
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
        new_parent = CategoryNode.query.get(new_parent_id)
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
