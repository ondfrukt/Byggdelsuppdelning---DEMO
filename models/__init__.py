from flask_sqlalchemy import SQLAlchemy
from datetime import datetime

db = SQLAlchemy()

# Import all models
from models.object_type import ObjectType
from models.object_field import ObjectField
from models.object import Object
from models.object_data import ObjectData
from models.relation import ObjectRelation
from models.document import Document

__all__ = [
    'db',
    'ObjectType',
    'ObjectField',
    'Object',
    'ObjectData',
    'ObjectRelation',
    'Document'
]
