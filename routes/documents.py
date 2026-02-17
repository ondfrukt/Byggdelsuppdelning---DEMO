from flask import Blueprint, request, jsonify, send_file
from werkzeug.exceptions import HTTPException

try:
    from pypdf import PdfReader
except Exception:  # pragma: no cover - optional dependency handling
    PdfReader = None
from werkzeug.utils import secure_filename
from models import db, Object, Document
from utils.validators import sanitize_filename, validate_file_upload
import os
import logging
from datetime import datetime

logger = logging.getLogger(__name__)
bp = Blueprint('documents', __name__, url_prefix='/api/objects')

# Configuration
PROJECT_ROOT = os.path.dirname(os.path.dirname(__file__))
UPLOAD_FOLDER = os.path.join(PROJECT_ROOT, 'static', 'uploads')
ALLOWED_EXTENSIONS = {
    '.xls', '.xlsx',          # Excel
    '.doc', '.docx',          # Word
    '.pdf',                   # PDF
    '.dwg', '.dxf', '.rvt',   # CAD / BIM
    '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.tif', '.tiff'  # Images
}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB

# Ensure upload folder exists
os.makedirs(UPLOAD_FOLDER, exist_ok=True)


def is_file_object_type(type_name):
    """Check if an object type should be treated as a file object."""
    normalized = (type_name or '').strip().lower()
    return normalized == 'filobjekt'


def ensure_file_object_or_422(obj):
    """Validate file ownership rule and return Flask error tuple on violation."""
    object_type_name = obj.object_type.name if obj and obj.object_type else None
    if is_file_object_type(object_type_name):
        return None

    return jsonify({
        'error': 'FILE_OWNER_TYPE_INVALID',
        'message': 'Only Filobjekt can own documents',
        'object_id': obj.id if obj else None,
        'object_type': object_type_name
    }), 422


def get_document_storage_candidates(document):
    """Generate possible storage paths for a document.

    Supports both legacy absolute/relative file_path values and current storage
    where only filename is persisted in the DB.
    """
    candidates = []

    if document.file_path:
        if os.path.isabs(document.file_path):
            candidates.append(document.file_path)
        else:
            # Legacy relative paths may be project-root based or upload-folder based.
            candidates.append(os.path.join(PROJECT_ROOT, document.file_path))
            candidates.append(os.path.join(UPLOAD_FOLDER, document.file_path))
            basename = os.path.basename(document.file_path)
            if basename:
                candidates.append(os.path.join(UPLOAD_FOLDER, basename))

    if document.filename:
        candidates.append(os.path.join(UPLOAD_FOLDER, document.filename))

    # Keep order, remove duplicates
    unique = []
    seen = set()
    for path in candidates:
        normalized = os.path.normpath(path)
        if normalized not in seen:
            seen.add(normalized)
            unique.append(normalized)

    return unique


def resolve_document_storage_path(document):
    """Return the first existing storage path for a document."""
    for candidate in get_document_storage_candidates(document):
        if os.path.exists(candidate):
            return candidate

    # Return preferred fallback path for messages/consistency.
    return os.path.join(UPLOAD_FOLDER, document.filename)


def infer_mime_type(filename):
    ext = os.path.splitext(filename or '')[1].lower()
    mime_types = {
        '.pdf': 'application/pdf',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.bmp': 'image/bmp',
        '.webp': 'image/webp',
        '.tif': 'image/tiff',
        '.tiff': 'image/tiff',
        '.doc': 'application/msword',
        '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        '.xls': 'application/vnd.ms-excel',
        '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        '.dwg': 'application/acad',
        '.dxf': 'image/vnd.dxf',
        '.rvt': 'application/octet-stream'
    }
    return mime_types.get(ext, 'application/octet-stream')


@bp.route('/<int:id>/documents', methods=['GET'])
def list_documents(id):
    """List all documents for an object"""
    try:
        obj = Object.query.get_or_404(id)
        file_object_error = ensure_file_object_or_422(obj)
        if file_object_error:
            return file_object_error

        documents = Document.query.filter_by(object_id=id).all()
        return jsonify([doc.to_dict() for doc in documents]), 200
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error listing documents: {str(e)}")
        return jsonify({'error': 'Failed to list documents'}), 500


@bp.route('/<int:id>/documents', methods=['POST'])
def upload_document(id):
    """Upload a document for an object"""
    try:
        obj = Object.query.get_or_404(id)
        file_object_error = ensure_file_object_or_422(obj)
        if file_object_error:
            return file_object_error

        if 'file' not in request.files:
            return jsonify({'error': 'No file provided'}), 400

        file = request.files['file']

        if file.filename == '':
            return jsonify({'error': 'No file selected'}), 400

        file.seek(0, os.SEEK_END)
        file_size = file.tell()
        file.seek(0)

        is_valid, error_msg = validate_file_upload(
            file.filename,
            file_size,
            allowed_extensions=ALLOWED_EXTENSIONS,
            max_size=MAX_FILE_SIZE
        )

        if not is_valid:
            return jsonify({'error': error_msg}), 400

        original_filename = secure_filename(file.filename)
        timestamp = datetime.utcnow().strftime('%Y%m%d_%H%M%S')
        filename = f"{timestamp}_{sanitize_filename(original_filename)}"

        storage_path = os.path.join(UPLOAD_FOLDER, filename)
        file.save(storage_path)

        document = Document(
            object_id=id,
            filename=filename,
            original_filename=original_filename,
            # Persist relative storage reference to avoid deploy path coupling.
            file_path=filename,
            file_size=file_size,
            mime_type=infer_mime_type(original_filename),
            uploaded_by=request.form.get('uploaded_by')
        )

        db.session.add(document)
        db.session.commit()

        logger.info(f"Uploaded document {filename} for object {obj.auto_id}")
        return jsonify(document.to_dict()), 201
    except HTTPException:
        raise
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error uploading document: {str(e)}")
        return jsonify({'error': 'Failed to upload document', 'details': str(e)}), 500


@bp.route('/documents/<int:doc_id>/download', methods=['GET'])
def download_document(doc_id):
    """Download a document"""
    try:
        document = Document.query.get_or_404(doc_id)
        filename = (document.original_filename or document.filename or '').lower()
        mime_type = (document.mime_type or '').lower()
        is_pdf = filename.endswith('.pdf') or mime_type == 'application/pdf'

        force_download = request.args.get('download', '').lower() in ('1', 'true', 'yes')
        inline_requested = request.args.get('inline', '').lower() in ('1', 'true', 'yes')
        open_inline = is_pdf and (inline_requested or not force_download)

        storage_path = resolve_document_storage_path(document)

        if not os.path.exists(storage_path):
            logger.warning(f"Document file missing for doc_id={doc_id}, expected={storage_path}, candidates={get_document_storage_candidates(document)}")
            return jsonify({'error': 'File not found'}), 404

        return send_file(
            storage_path,
            as_attachment=not open_inline,
            download_name=document.original_filename,
            mimetype=document.mime_type
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error downloading document: {str(e)}")
        return jsonify({'error': 'Failed to download document'}), 500


@bp.route('/documents/<int:doc_id>/preview-meta', methods=['GET'])
def document_preview_meta(doc_id):
    """Return first-page dimensions for PDF preview sizing."""
    try:
        document = Document.query.get_or_404(doc_id)
        filename = (document.original_filename or document.filename or '').lower()
        mime_type = (document.mime_type or '').lower()
        is_pdf = filename.endswith('.pdf') or mime_type == 'application/pdf'
        if not is_pdf:
            return jsonify({'error': 'Preview metadata is only available for PDF files'}), 400

        storage_path = resolve_document_storage_path(document)
        if not os.path.exists(storage_path):
            logger.warning(
                "Document file missing for preview-meta doc_id=%s, expected=%s, candidates=%s",
                doc_id,
                storage_path,
                get_document_storage_candidates(document),
            )
            return jsonify({'error': 'File not found'}), 404

        if PdfReader is None:
            return jsonify({'error': 'PDF metadata parser is unavailable on server'}), 503

        reader = PdfReader(storage_path, strict=False)
        if not reader.pages:
            return jsonify({'error': 'PDF contains no pages'}), 422

        first_page = reader.pages[0]
        media_box = first_page.mediabox
        width = float(media_box.width)
        height = float(media_box.height)
        ratio = (width / height) if height else 1.0

        if ratio > 1.05:
            orientation = 'landscape'
        elif ratio < 0.95:
            orientation = 'portrait'
        else:
            orientation = 'square'

        return jsonify({
            'document_id': document.id,
            'page_width': width,
            'page_height': height,
            'page_ratio': ratio,
            'orientation': orientation
        }), 200
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting preview metadata: {str(e)}")
        return jsonify({'error': 'Failed to get preview metadata'}), 500


@bp.route('/documents/<int:doc_id>', methods=['DELETE'])
def delete_document(doc_id):
    """Delete a document"""
    try:
        document = Document.query.get_or_404(doc_id)

        removed_paths = []
        for candidate in get_document_storage_candidates(document):
            if os.path.exists(candidate):
                os.remove(candidate)
                removed_paths.append(candidate)

        db.session.delete(document)
        db.session.commit()

        logger.info(f"Deleted document {document.filename}; removed_files={removed_paths}")
        return jsonify({'message': 'Document deleted successfully'}), 200
    except HTTPException:
        raise
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error deleting document: {str(e)}")
        return jsonify({'error': 'Failed to delete document'}), 500
