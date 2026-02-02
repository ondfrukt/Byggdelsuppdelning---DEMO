from flask import Blueprint, request, jsonify, send_file
from werkzeug.utils import secure_filename
from models import db, Object, Document
from utils.validators import sanitize_filename, validate_file_upload
import os
import logging
from datetime import datetime

logger = logging.getLogger(__name__)
bp = Blueprint('documents', __name__, url_prefix='/api/objects')

# Configuration
UPLOAD_FOLDER = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'static', 'uploads')
ALLOWED_EXTENSIONS = {'.pdf', '.png', '.jpg', '.jpeg', '.docx', '.xlsx', '.txt', '.dwg', '.dxf'}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB

# Ensure upload folder exists
os.makedirs(UPLOAD_FOLDER, exist_ok=True)


@bp.route('/<int:id>/documents', methods=['GET'])
def list_documents(id):
    """List all documents for an object"""
    try:
        obj = Object.query.get_or_404(id)
        documents = Document.query.filter_by(object_id=id).all()
        return jsonify([doc.to_dict() for doc in documents]), 200
    except Exception as e:
        logger.error(f"Error listing documents: {str(e)}")
        return jsonify({'error': 'Failed to list documents'}), 500


@bp.route('/<int:id>/documents', methods=['POST'])
def upload_document(id):
    """Upload a document for an object"""
    try:
        obj = Object.query.get_or_404(id)
        
        # Check if file is in request
        if 'file' not in request.files:
            return jsonify({'error': 'No file provided'}), 400
        
        file = request.files['file']
        
        # Check if file is selected
        if file.filename == '':
            return jsonify({'error': 'No file selected'}), 400
        
        # Get file size
        file.seek(0, os.SEEK_END)
        file_size = file.tell()
        file.seek(0)
        
        # Validate file
        is_valid, error_msg = validate_file_upload(
            file.filename,
            file_size,
            allowed_extensions=ALLOWED_EXTENSIONS,
            max_size=MAX_FILE_SIZE
        )
        
        if not is_valid:
            return jsonify({'error': error_msg}), 400
        
        # Generate safe filename
        original_filename = secure_filename(file.filename)
        timestamp = datetime.utcnow().strftime('%Y%m%d_%H%M%S')
        filename = f"{timestamp}_{sanitize_filename(original_filename)}"
        
        # Save file
        file_path = os.path.join(UPLOAD_FOLDER, filename)
        file.save(file_path)
        
        # Determine MIME type
        ext = os.path.splitext(original_filename)[1].lower()
        mime_types = {
            '.pdf': 'application/pdf',
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            '.txt': 'text/plain'
        }
        mime_type = mime_types.get(ext, 'application/octet-stream')
        
        # Create document record
        document = Document(
            object_id=id,
            filename=filename,
            original_filename=original_filename,
            file_path=file_path,
            file_size=file_size,
            mime_type=mime_type,
            uploaded_by=request.form.get('uploaded_by')
        )
        
        db.session.add(document)
        db.session.commit()
        
        logger.info(f"Uploaded document {filename} for object {obj.auto_id}")
        return jsonify(document.to_dict()), 201
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error uploading document: {str(e)}")
        return jsonify({'error': 'Failed to upload document', 'details': str(e)}), 500


@bp.route('/documents/<int:doc_id>/download', methods=['GET'])
def download_document(doc_id):
    """Download a document"""
    try:
        document = Document.query.get_or_404(doc_id)
        
        # Check if file exists
        if not os.path.exists(document.file_path):
            return jsonify({'error': 'File not found'}), 404
        
        return send_file(
            document.file_path,
            as_attachment=True,
            download_name=document.original_filename,
            mimetype=document.mime_type
        )
    except Exception as e:
        logger.error(f"Error downloading document: {str(e)}")
        return jsonify({'error': 'Failed to download document'}), 500


@bp.route('/documents/<int:doc_id>', methods=['DELETE'])
def delete_document(doc_id):
    """Delete a document"""
    try:
        document = Document.query.get_or_404(doc_id)
        
        # Delete file from filesystem
        if os.path.exists(document.file_path):
            os.remove(document.file_path)
        
        # Delete record
        db.session.delete(document)
        db.session.commit()
        
        logger.info(f"Deleted document {document.filename}")
        return jsonify({'message': 'Document deleted successfully'}), 200
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error deleting document: {str(e)}")
        return jsonify({'error': 'Failed to delete document'}), 500
