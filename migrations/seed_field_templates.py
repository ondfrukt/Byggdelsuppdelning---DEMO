"""Seed default field templates used by object type configuration."""
import logging
from models import db, FieldTemplate

logger = logging.getLogger(__name__)


def run_migration(_db):
    """Create or update default field templates (idempotent)."""
    try:
        template_specs = [
            {
                'template_name': 'Namn (obligatoriskt)',
                'field_name': 'namn',
                'display_name': 'Namn',
                'display_name_translations': {'sv': 'Namn', 'en': 'Name'},
                'field_type': 'text',
                'field_options': None,
                'is_required': True,
                'lock_required_setting': True,
                'force_presence_on_all_objects': True,
                'is_table_visible': True,
                'help_text': 'Primärt namn för objektet.',
                'help_text_translations': {'sv': 'Primärt namn för objektet.', 'en': 'Primary name for the object.'}
            },
            {
                'template_name': 'Beskrivning',
                'field_name': 'beskrivning',
                'display_name': 'Beskrivning',
                'display_name_translations': {'sv': 'Beskrivning', 'en': 'Description'},
                'field_type': 'richtext',
                'field_options': None,
                'is_required': False,
                'lock_required_setting': False,
                'force_presence_on_all_objects': False,
                'is_table_visible': True,
                'help_text': 'Formaterad beskrivning av objektet.',
                'help_text_translations': {'sv': 'Formaterad beskrivning av objektet.', 'en': 'Formatted description of the object.'}
            },
            {
                'template_name': 'Status',
                'field_name': 'status',
                'display_name': 'Status',
                'display_name_translations': {'sv': 'Status', 'en': 'Status'},
                'field_type': 'select',
                'field_options': ['In work', 'Released', 'Obsolete', 'Canceled'],
                'is_required': False,
                'lock_required_setting': False,
                'force_presence_on_all_objects': False,
                'is_table_visible': True,
                'help_text': 'Objektets status.',
                'help_text_translations': {'sv': 'Objektets status.', 'en': 'Object status.'}
            },
            {
                'template_name': 'Version',
                'field_name': 'version',
                'display_name': 'Version',
                'display_name_translations': {'sv': 'Version', 'en': 'Version'},
                'field_type': 'text',
                'field_options': None,
                'is_required': False,
                'lock_required_setting': False,
                'force_presence_on_all_objects': False,
                'is_table_visible': True,
                'help_text': 'Versionsbeteckning.',
                'help_text_translations': {'sv': 'Versionsbeteckning.', 'en': 'Version label.'}
            },
            {
                'template_name': 'Kommentar',
                'field_name': 'kommentar',
                'display_name': 'Kommentar',
                'display_name_translations': {'sv': 'Kommentar', 'en': 'Comment'},
                'field_type': 'textarea',
                'field_options': None,
                'is_required': False,
                'lock_required_setting': False,
                'force_presence_on_all_objects': False,
                'is_table_visible': False,
                'help_text': 'Intern kommentar.',
                'help_text_translations': {'sv': 'Intern kommentar.', 'en': 'Internal comment.'}
            },
        ]

        existing_by_name = {item.template_name: item for item in FieldTemplate.query.all()}
        created = 0
        updated = 0

        for spec in template_specs:
            template = existing_by_name.get(spec['template_name'])
            if not template:
                template = FieldTemplate(template_name=spec['template_name'])
                db.session.add(template)
                created += 1
            else:
                updated += 1

            template.field_name = spec['field_name']
            template.display_name = spec.get('display_name')
            template.display_name_translations = spec.get('display_name_translations') or {}
            template.field_type = spec['field_type']
            template.field_options = spec.get('field_options')
            template.is_required = bool(spec.get('is_required', False))
            template.lock_required_setting = bool(spec.get('lock_required_setting', False))
            template.force_presence_on_all_objects = bool(spec.get('force_presence_on_all_objects', False))
            template.is_table_visible = bool(spec.get('is_table_visible', True))
            template.help_text = spec.get('help_text')
            template.help_text_translations = spec.get('help_text_translations') or {}
            template.is_active = True

        db.session.commit()
        logger.info(f"Seeded field templates successfully (created={created}, updated={updated})")
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error seeding field templates: {str(e)}")
        raise
