"""Utility functions for category-based requirement inheritance."""
from models.object_category_assignment import ObjectCategoryAssignment
from models.category_node import CategoryNode
from models.relation import ObjectRelation


def get_inherited_requirements(object_id: int, db_session) -> list:
    """
    Return all requirements and guidance that apply to an object,
    including those inherited via the category hierarchy.

    Returns a list of dicts:
        {
            "requirement": <Object>,        # the requirement/guidance object
            "inherited": bool,              # False = direct, True = via category
            "inherited_from": <CategoryNode | None>
        }

    Ordering: direct requirements first, then inherited from nearest ancestor to root.
    """
    seen_requirement_ids = set()
    results = []

    # --- 1. Direct has_requirement relations ---
    direct_relations = ObjectRelation.query.filter_by(
        source_object_id=object_id,
        relation_type='has_requirement',
    ).all()
    for rel in direct_relations:
        req_obj = rel.target_object
        if req_obj and req_obj.id not in seen_requirement_ids:
            seen_requirement_ids.add(req_obj.id)
            results.append({
                'requirement': req_obj,
                'inherited': False,
                'inherited_from': None,
            })

    # --- 2. Inherited via category hierarchy ---
    assignments = ObjectCategoryAssignment.query.filter_by(object_id=object_id).all()
    for assignment in assignments:
        node = assignment.category_node
        if node is None:
            continue

        # Build ancestor chain: node itself, then its ancestors from nearest to root
        chain = [node] + list(reversed(node.get_ancestors()))

        for ancestor in chain:
            # Find applies_to_category relations targeting this ancestor node
            # These are stored in object_relations where target_object_id is the node's
            # object-system id. Since CategoryNode is a standalone table, we query
            # ObjectRelation by relation_type and look up via the ancestor id stored
            # in a convention: source is a requirement object, target is the category node
            # represented in object_relations by its id as target_object_id.
            # NOTE: because CategoryNode is a separate table and not an Object, this
            # query looks for relations where metadata or target carries the category node id.
            # We store these as: source=requirement_object_id, target=category_node_id
            # using a dedicated convention in object_relations.relation_metadata.
            # For now we use a direct filter on category_node_id via source/target pattern.
            inherited_relations = ObjectRelation.query.filter_by(
                relation_type='applies_to_category',
            ).all()
            for rel in inherited_relations:
                # The target_object_id encodes the category node id via relation_metadata
                metadata = rel.relation_metadata or {}
                if metadata.get('category_node_id') == ancestor.id:
                    req_obj = rel.source_object
                    if req_obj and req_obj.id not in seen_requirement_ids:
                        seen_requirement_ids.add(req_obj.id)
                        results.append({
                            'requirement': req_obj,
                            'inherited': True,
                            'inherited_from': ancestor,
                        })

    return results


def get_category_breadcrumb(node_id: int) -> list:
    """
    Return breadcrumb list from root to the given CategoryNode (inclusive).

    Returns a list of dicts: [{"id", "code", "name", "level"}, ...]
    """
    node = CategoryNode.query.get(node_id)
    if node is None:
        return []
    ancestors = node.get_ancestors()
    chain = ancestors + [node]
    return [
        {'id': n.id, 'code': n.code, 'name': n.name, 'level': n.level}
        for n in chain
    ]


def get_all_descendant_node_ids(node_id: int) -> set:
    """Return set of all descendant CategoryNode IDs for a given node (recursive)."""
    node = CategoryNode.query.get(node_id)
    if node is None:
        return set()
    return node.get_descendant_ids()
