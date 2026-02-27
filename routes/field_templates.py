from flask import Blueprint, jsonify, request
from models import db, FieldTemplate
import logging

logger = logging.getLogger(__name__)
bp = Blueprint('field_templates', __name__, url_prefix='/api/field-templates')


def normalize_template_name(value):
    return str(value or '').strip()


def normalize_field_name(value):
    return str(value or '').strip().lower()


def normalize_translations(value):
    if not isinstance(value, dict):
        return {}

    normalized = {}
    for key, text in value.items():
        locale = str(key or '').strip().lower()
        if not locale:
            continue
        normalized[locale] = str(text or '').strip()
    return normalized


def validate_field_template_payload(data, template_id=None):
    template_name = normalize_template_name(data.get('template_name'))
    field_name = normalize_field_name(data.get('field_name'))
    field_type = str(data.get('field_type') or '').strip()

    if not template_name:
        return 'template_name is required'
    if not field_name:
        return 'field_name is required'
    if not field_type:
        return 'field_type is required'

    name_query = FieldTemplate.query.filter_by(template_name=template_name)
    if template_id is not None:
        name_query = name_query.filter(FieldTemplate.id != template_id)
    if name_query.first():
        return 'Template with this name already exists'

    return None


@bp.route('', methods=['GET'])
def list_field_templates():
    try:
        include_inactive = request.args.get('include_inactive', 'false').lower() == 'true'
        query = FieldTemplate.query
        if not include_inactive:
            query = query.filter(FieldTemplate.is_active.is_(True))

        items = query.order_by(FieldTemplate.template_name.asc()).all()
        return jsonify([item.to_dict() for item in items]), 200
    except Exception as e:
        logger.error(f"Error listing field templates: {str(e)}")
        return jsonify({'error': 'Failed to list field templates'}), 500


@bp.route('', methods=['POST'])
def create_field_template():
    try:
        data = request.get_json() or {}
        validation_error = validate_field_template_payload(data)
        if validation_error:
            return jsonify({'error': validation_error}), 400

        item = FieldTemplate(
            template_name=normalize_template_name(data.get('template_name')),
            field_name=normalize_field_name(data.get('field_name')),
            display_name=data.get('display_name'),
            display_name_translations=normalize_translations(data.get('display_name_translations')),
            field_type=str(data.get('field_type')).strip(),
            field_options=data.get('field_options'),
            is_required=bool(data.get('is_required', False)),
            lock_required_setting=bool(data.get('lock_required_setting', False)),
            force_presence_on_all_objects=bool(data.get('force_presence_on_all_objects', False)),
            is_table_visible=bool(data.get('is_table_visible', True)),
            help_text=data.get('help_text'),
            help_text_translations=normalize_translations(data.get('help_text_translations')),
            is_active=bool(data.get('is_active', True))
        )
        db.session.add(item)
        db.session.commit()
        return jsonify(item.to_dict()), 201
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error creating field template: {str(e)}")
        return jsonify({'error': 'Failed to create field template'}), 500


@bp.route('/<int:template_id>', methods=['PUT'])
def update_field_template(template_id):
    try:
        item = FieldTemplate.query.get_or_404(template_id)
        data = request.get_json() or {}

        validation_error = validate_field_template_payload(data, template_id=template_id)
        if validation_error:
            return jsonify({'error': validation_error}), 400

        item.template_name = normalize_template_name(data.get('template_name'))
        item.field_name = normalize_field_name(data.get('field_name'))
        item.display_name = data.get('display_name')
        item.display_name_translations = normalize_translations(data.get('display_name_translations'))
        item.field_type = str(data.get('field_type')).strip()
        item.field_options = data.get('field_options')
        item.is_required = bool(data.get('is_required', False))
        item.lock_required_setting = bool(data.get('lock_required_setting', False))
        item.force_presence_on_all_objects = bool(data.get('force_presence_on_all_objects', False))
        item.is_table_visible = bool(data.get('is_table_visible', True))
        item.help_text = data.get('help_text')
        item.help_text_translations = normalize_translations(data.get('help_text_translations'))
        if 'is_active' in data:
            item.is_active = bool(data.get('is_active'))

        db.session.commit()
        return jsonify(item.to_dict()), 200
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error updating field template: {str(e)}")
        return jsonify({'error': 'Failed to update field template'}), 500


@bp.route('/<int:template_id>', methods=['DELETE'])
def delete_field_template(template_id):
    try:
        item = FieldTemplate.query.get_or_404(template_id)
        db.session.delete(item)
        db.session.commit()
        return jsonify({'message': 'Field template deleted successfully'}), 200
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error deleting field template: {str(e)}")
        return jsonify({'error': 'Failed to delete field template'}), 500
