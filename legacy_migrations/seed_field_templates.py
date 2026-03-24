"""Seed default field templates used by object type configuration."""
import logging
from models import db, FieldTemplate

logger = logging.getLogger(__name__)


def run_migration(_db):
    """Create or update default field templates (idempotent)."""
    try:
        template_specs = [
            {
                'template_name': 'Name (required)',
                'field_name': 'namn',
                'display_name': 'Name',
                'display_name_translations': {'sv': 'Namn', 'en': 'Name'},
                'field_type': 'text',
                'field_options': None,
                'is_required': True,
                'lock_required_setting': True,
                'force_presence_on_all_objects': True,
                'is_table_visible': True,
                'help_text': 'Primary name for the object.',
                'help_text_translations': {'sv': 'Primärt namn för objektet.', 'en': 'Primary name for the object.'}
            },
            {
                'template_name': 'Description',
                'field_name': 'beskrivning',
                'display_name': 'Description',
                'display_name_translations': {'sv': 'Beskrivning', 'en': 'Description'},
                'field_type': 'richtext',
                'field_options': None,
                'is_required': False,
                'lock_required_setting': False,
                'force_presence_on_all_objects': False,
                'is_table_visible': True,
                'help_text': 'Rich text description of the object.',
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
                'template_name': 'Comment',
                'field_name': 'kommentar',
                'display_name': 'Comment',
                'display_name_translations': {'sv': 'Kommentar', 'en': 'Comment'},
                'field_type': 'textarea',
                'field_options': None,
                'is_required': False,
                'lock_required_setting': False,
                'force_presence_on_all_objects': False,
                'is_table_visible': False,
                'help_text': 'Internal comment.',
                'help_text_translations': {'sv': 'Intern kommentar.', 'en': 'Internal comment.'}
            },
            {
                'template_name': 'Instance Quantity',
                'field_name': 'quantity',
                'display_name': 'Quantity',
                'display_name_translations': {'sv': 'Antal', 'en': 'Quantity'},
                'field_type': 'number',
                'field_options': None,
                'is_required': False,
                'lock_required_setting': False,
                'force_presence_on_all_objects': False,
                'is_table_visible': True,
                'help_text': 'Numeric quantity stored on the native instance quantity field.',
                'help_text_translations': {'sv': 'Numeriskt antal som lagras i instansens inbyggda quantity-fält.', 'en': 'Numeric quantity stored on the native instance quantity field.'}
            },
            {
                'template_name': 'Instance Unit',
                'field_name': 'unit',
                'display_name': 'Unit',
                'display_name_translations': {'sv': 'Enhet', 'en': 'Unit'},
                'field_type': 'text',
                'field_options': None,
                'is_required': False,
                'lock_required_setting': False,
                'force_presence_on_all_objects': False,
                'is_table_visible': True,
                'help_text': 'Unit stored on the native instance unit field.',
                'help_text_translations': {'sv': 'Enhet som lagras i instansens inbyggda unit-fält.', 'en': 'Unit stored on the native instance unit field.'}
            },
            {
                'template_name': 'Instance Formula',
                'field_name': 'formula',
                'display_name': 'Formula',
                'display_name_translations': {'sv': 'Formel', 'en': 'Formula'},
                'field_type': 'text',
                'field_options': None,
                'is_required': False,
                'lock_required_setting': False,
                'force_presence_on_all_objects': False,
                'is_table_visible': True,
                'help_text': 'Formula stored on the native instance formula field.',
                'help_text_translations': {'sv': 'Formel som lagras i instansens inbyggda formula-fält.', 'en': 'Formula stored on the native instance formula field.'}
            },
            {
                'template_name': 'Instance Role',
                'field_name': 'role',
                'display_name': 'Role',
                'display_name_translations': {'sv': 'Roll', 'en': 'Role'},
                'field_type': 'text',
                'field_options': None,
                'is_required': False,
                'lock_required_setting': False,
                'force_presence_on_all_objects': False,
                'is_table_visible': True,
                'help_text': 'Role stored on the native instance role field.',
                'help_text_translations': {'sv': 'Roll som lagras i instansens inbyggda role-fält.', 'en': 'Role stored on the native instance role field.'}
            },
            {
                'template_name': 'Instance Position',
                'field_name': 'position',
                'display_name': 'Position',
                'display_name_translations': {'sv': 'Position', 'en': 'Position'},
                'field_type': 'text',
                'field_options': None,
                'is_required': False,
                'lock_required_setting': False,
                'force_presence_on_all_objects': False,
                'is_table_visible': True,
                'help_text': 'Position stored on the native instance position field.',
                'help_text_translations': {'sv': 'Position som lagras i instansens inbyggda position-fält.', 'en': 'Position stored on the native instance position field.'}
            },
            {
                'template_name': 'Instance Waste Factor',
                'field_name': 'waste_factor',
                'display_name': 'Waste Factor',
                'display_name_translations': {'sv': 'Spillfaktor', 'en': 'Waste Factor'},
                'field_type': 'number',
                'field_options': None,
                'is_required': False,
                'lock_required_setting': False,
                'force_presence_on_all_objects': False,
                'is_table_visible': True,
                'help_text': 'Waste factor stored on the native instance waste factor field.',
                'help_text_translations': {'sv': 'Spillfaktor som lagras i instansens inbyggda waste_factor-fält.', 'en': 'Waste factor stored on the native instance waste factor field.'}
            },
            {
                'template_name': 'Instance Installation Sequence',
                'field_name': 'installation_sequence',
                'display_name': 'Installation Sequence',
                'display_name_translations': {'sv': 'Installationsordning', 'en': 'Installation Sequence'},
                'field_type': 'integer',
                'field_options': None,
                'is_required': False,
                'lock_required_setting': False,
                'force_presence_on_all_objects': False,
                'is_table_visible': True,
                'help_text': 'Sequence value stored on the native instance installation sequence field.',
                'help_text_translations': {'sv': 'Ordningsvärde som lagras i instansens inbyggda installation_sequence-fält.', 'en': 'Sequence value stored on the native instance installation sequence field.'}
            },
            {
                'template_name': 'Instance Optional',
                'field_name': 'optional',
                'display_name': 'Optional',
                'display_name_translations': {'sv': 'Valfri instans', 'en': 'Optional'},
                'field_type': 'boolean',
                'field_options': None,
                'is_required': False,
                'lock_required_setting': False,
                'force_presence_on_all_objects': False,
                'is_table_visible': True,
                'help_text': 'Boolean flag stored on the native instance optional field.',
                'help_text_translations': {'sv': 'Boolesk flagga som lagras i instansens inbyggda optional-fält.', 'en': 'Boolean flag stored on the native instance optional field.'}
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
