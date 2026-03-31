from flask import Blueprint, request, jsonify, send_file
from werkzeug.exceptions import HTTPException

try:
    from pypdf import PdfReader
except Exception:  # pragma: no cover - optional dependency handling
    PdfReader = None
from werkzeug.utils import secure_filename
from models import db, Object, Document
from utils.validators import sanitize_filename, validate_file_upload
from extensions import cache, limiter
import io
import os
import logging
from datetime import datetime

logger = logging.getLogger(__name__)
bp = Blueprint('documents', __name__, url_prefix='/api/objects')


@bp.after_request
def invalidate_cache_on_write(response):
    if request.method != 'GET' and response.status_code < 400:
        cache.clear()
    return response


# Configuration
ALLOWED_EXTENSIONS = {
    '.xls', '.xlsx',          # Excel
    '.doc', '.docx',          # Word
    '.pdf',                   # PDF
    '.dwg', '.dxf', '.rvt',   # CAD / BIM
    '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.tif', '.tiff'  # Images
}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB


def is_file_object_type(type_name):
    """Check if an object type should be treated as a file object."""
    normalized = (type_name or '').strip().lower()
    return normalized in {'filobjekt', 'fileobject', 'file object'}


def ensure_file_object_or_422(obj):
    """Validate file ownership rule and return Flask error tuple on violation."""
    object_type_name = obj.object_type.name if obj and obj.object_type else None
    if is_file_object_type(object_type_name):
        return None

    return jsonify({
        'error': 'FILE_OWNER_TYPE_INVALID',
        'message': 'Only FileObject can own documents',
        'object_id': obj.id if obj else None,
        'object_type': object_type_name
    }), 422


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
    """List all documents for an object
    ---
    tags:
      - Documents
    summary: Lista dokument för ett objekt
    parameters:
      - name: id
        in: path
        type: integer
        required: true
        description: Objektets ID (måste vara av typen FileObject)
    responses:
      200:
        description: Lista med dokument
        schema:
          type: array
          items:
            $ref: '#/definitions/Document'
      404:
        description: Objektet hittades inte
        schema:
          $ref: '#/definitions/Error'
      422:
        description: Objektet är inte av typen FileObject
        schema:
          $ref: '#/definitions/Error'
      500:
        description: Serverfel
        schema:
          $ref: '#/definitions/Error'
    """
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
@limiter.limit("20 per minute")
def upload_document(id):
    """Upload a document for an object
    ---
    tags:
      - Documents
    summary: Ladda upp dokument (max 10 MB, rate-limit 20/min)
    consumes:
      - multipart/form-data
    parameters:
      - name: id
        in: path
        type: integer
        required: true
        description: Objektets ID (måste vara av typen FileObject)
      - name: file
        in: formData
        type: file
        required: true
        description: "Tillåtna format: xls, xlsx, doc, docx, pdf, dwg, dxf, rvt, png, jpg, gif, bmp, webp, tif, tiff"
      - name: uploaded_by
        in: formData
        type: string
        required: false
        description: Uppladdad av (valfri text)
    responses:
      201:
        description: Dokument uppladdad
        schema:
          $ref: '#/definitions/Document'
      400:
        description: Valideringsfel (filtyp, storlek)
        schema:
          $ref: '#/definitions/Error'
      404:
        description: Objektet hittades inte
        schema:
          $ref: '#/definitions/Error'
      422:
        description: Objektet är inte av typen FileObject
        schema:
          $ref: '#/definitions/Error'
      500:
        description: Serverfel
        schema:
          $ref: '#/definitions/Error'
    """
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

        file_bytes = file.read()
        file_size = len(file_bytes)

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

        document = Document(
            object_id=id,
            filename=filename,
            original_filename=original_filename,
            file_path=None,
            file_data=file_bytes,
            file_size=file_size,
            mime_type=infer_mime_type(original_filename),
            uploaded_by=request.form.get('uploaded_by')
        )

        db.session.add(document)
        db.session.commit()

        logger.info(f"Uploaded document {filename} for object {obj.id_full}")
        return jsonify(document.to_dict()), 201
    except HTTPException:
        raise
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error uploading document: {str(e)}")
        return jsonify({'error': 'Failed to upload document'}), 500


@bp.route('/documents/<int:doc_id>/download', methods=['GET'])
def download_document(doc_id):
    """Download a document
    ---
    tags:
      - Documents
    summary: Ladda ned dokument
    produces:
      - application/octet-stream
      - application/pdf
    parameters:
      - name: doc_id
        in: path
        type: integer
        required: true
        description: Dokumentets ID
      - name: download
        in: query
        type: boolean
        required: false
        description: Tvinga nedladdning (annars inline för PDF)
      - name: inline
        in: query
        type: boolean
        required: false
        description: Tvinga inline-visning
    responses:
      200:
        description: Filinnehållet
      404:
        description: Dokument eller fil hittades inte
        schema:
          $ref: '#/definitions/Error'
      500:
        description: Serverfel
        schema:
          $ref: '#/definitions/Error'
    """
    try:
        document = Document.query.get_or_404(doc_id)

        if not document.file_data:
            logger.warning(f"Document file_data missing for doc_id={doc_id}")
            return jsonify({'error': 'File not found'}), 404

        filename = (document.original_filename or document.filename or '').lower()
        mime_type = (document.mime_type or '').lower()
        is_pdf = filename.endswith('.pdf') or mime_type == 'application/pdf'

        force_download = request.args.get('download', '').lower() in ('1', 'true', 'yes')
        inline_requested = request.args.get('inline', '').lower() in ('1', 'true', 'yes')
        open_inline = is_pdf and (inline_requested or not force_download)

        return send_file(
            io.BytesIO(document.file_data),
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
    """Return first-page dimensions for PDF preview sizing.
    ---
    tags:
      - Documents
    summary: Hämta PDF-dimensioner för förhandsvisning
    parameters:
      - name: doc_id
        in: path
        type: integer
        required: true
        description: Dokumentets ID (måste vara PDF)
    responses:
      200:
        description: Sidmått för PDF
        schema:
          type: object
          properties:
            document_id:
              type: integer
            page_width:
              type: number
            page_height:
              type: number
            page_ratio:
              type: number
            orientation:
              type: string
              enum: [portrait, landscape, square]
      400:
        description: Dokumentet är inte en PDF
        schema:
          $ref: '#/definitions/Error'
      404:
        description: Dokument eller fil hittades inte
        schema:
          $ref: '#/definitions/Error'
      422:
        description: PDF saknar sidor
        schema:
          $ref: '#/definitions/Error'
      500:
        description: Serverfel
        schema:
          $ref: '#/definitions/Error'
    """
    try:
        document = Document.query.get_or_404(doc_id)
        filename = (document.original_filename or document.filename or '').lower()
        mime_type = (document.mime_type or '').lower()
        is_pdf = filename.endswith('.pdf') or mime_type == 'application/pdf'
        if not is_pdf:
            return jsonify({'error': 'Preview metadata is only available for PDF files'}), 400

        if not document.file_data:
            logger.warning(f"Document file_data missing for preview-meta doc_id={doc_id}")
            return jsonify({'error': 'File not found'}), 404

        if PdfReader is None:
            return jsonify({'error': 'PDF metadata parser is unavailable on server'}), 503

        reader = PdfReader(io.BytesIO(document.file_data), strict=False)
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
    """Delete a document
    ---
    tags:
      - Documents
    summary: Ta bort dokument
    parameters:
      - name: doc_id
        in: path
        type: integer
        required: true
        description: Dokumentets ID
    responses:
      200:
        description: Dokumentet borttaget
        schema:
          type: object
          properties:
            message:
              type: string
      404:
        description: Dokumentet hittades inte
        schema:
          $ref: '#/definitions/Error'
      500:
        description: Serverfel
        schema:
          $ref: '#/definitions/Error'
    """
    try:
        document = Document.query.get_or_404(doc_id)
        stored_filename = document.filename

        db.session.delete(document)
        db.session.commit()

        logger.info(f"Deleted document {stored_filename}")
        return jsonify({'message': 'Document deleted successfully'}), 200
    except HTTPException:
        raise
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error deleting document: {str(e)}")
        return jsonify({'error': 'Failed to delete document'}), 500
