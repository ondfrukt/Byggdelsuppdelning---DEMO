from flask_sqlalchemy import SQLAlchemy
from datetime import datetime

db = SQLAlchemy()

# Import all models
from models.object_type import ObjectType
from models.object_field import ObjectField
from models.object import Object
from models.object_data import ObjectData
from models.relation import ObjectRelation
from models.relation_type import RelationType
from models.relation_type_rule import RelationTypeRule
from models.document import Document
from models.view_configuration import ViewConfiguration
from models.managed_list import ManagedList
from models.managed_list_item import ManagedListItem
from models.managed_list_link import ManagedListLink
from models.managed_list_item_link import ManagedListItemLink
from models.field_list_binding import FieldListBinding
from models.field_template import FieldTemplate
from models.object_field_override import ObjectFieldOverride
from models.change_management_item import ChangeManagementItem
from models.change_management_impact import ChangeManagementImpact

__all__ = [
    'db',
    'ObjectType',
    'ObjectField',
    'Object',
    'ObjectData',
    'ObjectRelation',
    'RelationType',
    'RelationTypeRule',
    'Document',
    'ViewConfiguration',
    'ManagedList',
    'ManagedListItem',
    'ManagedListLink',
    'ManagedListItemLink',
    'FieldListBinding',
    'FieldTemplate',
    'ObjectFieldOverride',
    'ChangeManagementItem',
    'ChangeManagementImpact'
]
