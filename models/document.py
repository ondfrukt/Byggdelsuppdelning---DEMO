from models import db
from datetime import datetime
import os



def infer_document_type(filename):
    """Infer standardized document type from file extension."""
    ext = os.path.splitext(filename or '')[1].lower()

    type_map = {
        '.xls': 'Excel',
        '.xlsx': 'Excel',
        '.doc': 'Word',
        '.docx': 'Word',
        '.pdf': 'PDF',
        '.dwg': 'CAD (DWG)',
        '.dxf': 'CAD (DXF)',
        '.rvt': 'Revit',
        '.png': 'Bild',
        '.jpg': 'Bild',
        '.jpeg': 'Bild',
        '.gif': 'Bild',
        '.bmp': 'Bild',
        '.webp': 'Bild',
        '.tif': 'Bild',
        '.tiff': 'Bild'
    }

    return type_map.get(ext, 'Övrigt')

class Document(db.Model):
    """Document model - stores file attachments for objects"""
    __tablename__ = 'documents'
    
    id = db.Column(db.Integer, primary_key=True)
    object_id = db.Column(db.Integer, db.ForeignKey('objects.id', ondelete='CASCADE'), nullable=False)
    filename = db.Column(db.String(255), nullable=False)
    original_filename = db.Column(db.String(255), nullable=False)
    file_path = db.Column(db.String(500), nullable=False)
    file_size = db.Column(db.Integer)
    mime_type = db.Column(db.String(100))
    uploaded_at = db.Column(db.DateTime, default=datetime.utcnow)
    uploaded_by = db.Column(db.String(100))
    
    # Relationships
    object = db.relationship('Object', back_populates='documents')
    
    def to_dict(self):
        return {
            'id': self.id,
            'object_id': self.object_id,
            'filename': self.filename,
            'original_filename': self.original_filename,
            'file_size': self.file_size,
            'mime_type': self.mime_type,
            'uploaded_at': self.uploaded_at.isoformat() if self.uploaded_at else None,
            'uploaded_by': self.uploaded_by,
            'document_type': infer_document_type(self.original_filename or self.filename)
        }
