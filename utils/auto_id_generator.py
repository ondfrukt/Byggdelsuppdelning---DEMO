import re
from models import db, Object, ObjectType


DEFAULT_PREFIX_MAP = {
    'Byggdel': 'BYG',
    'Produkt': 'PROD',
    'Kravställning': 'KRAV',
    'Anslutning': 'ANS',
    'Ritningsobjekt': 'RIT',
    'Egenskap': 'EG',
    'Anvisning': 'ANV'
}


def get_object_type_prefix(object_type_name):
    object_type = ObjectType.query.filter_by(name=object_type_name).first()
    if object_type and object_type.id_prefix:
        return str(object_type.id_prefix).strip().upper()
    return DEFAULT_PREFIX_MAP.get(object_type_name, 'OBJ')


def extract_numeric_suffix(identifier, expected_prefix=None):
    text = str(identifier or '').strip()
    if not text:
        return None

    text = text.split('.')[0]

    if expected_prefix:
        prefix = str(expected_prefix).strip().upper()
        match = re.match(rf'^{re.escape(prefix)}-(\d+)$', text, flags=re.IGNORECASE)
        if not match:
            return None
        return int(match.group(1))

    generic = re.match(r'^([A-Za-z0-9_]+)-(\d+)$', text)
    if not generic:
        return None
    return int(generic.group(2))


def normalize_version(value):
    text = str(value or '').strip().lower()
    if not text:
        return 'v1'
    if text.startswith('v'):
        text = text[1:]
    text = text.lstrip('0') or '0'
    return f"v{text}"


def compose_full_id(base_id, version):
    normalized_base = str(base_id or '').strip()
    normalized_version = normalize_version(version)
    if not normalized_base:
        return normalized_version
    return f"{normalized_base}.{normalized_version}"


def normalize_base_id(base_id):
    text = str(base_id or '').strip()
    if not text:
        return ''
    text = text.split('.')[0]

    match = re.match(r'^([A-Za-z0-9_]+)-(\d+)$', text)
    if not match:
        return text.upper()
    return f"{match.group(1).upper()}-{int(match.group(2))}"


def get_next_version_for_base_id(base_id):
    normalized_base = normalize_base_id(base_id)
    if not normalized_base:
        return 'v1'

    max_version_number = 0
    candidates = db.session.query(Object.version).filter(Object.main_id == normalized_base).all()
    for (version_value,) in candidates:
        normalized_version = normalize_version(version_value)
        match = re.match(r'^v(\d+)$', normalized_version)
        if not match:
            continue
        version_number = int(match.group(1))
        if version_number > max_version_number:
            max_version_number = version_number

    return f"v{max_version_number + 1}"

def generate_base_id(object_type_name):
    """
    Generate auto ID for objects based on type.
    
    Args:
        object_type_name (str): Name of the object type
        
    Returns:
        str: Generated base ID (e.g., 'BYG-1', 'PROD-42')
    """
    prefix = get_object_type_prefix(object_type_name)

    # Get the highest number for this type
    try:
        pattern = f'{prefix}-%'
        existing_ids = db.session.query(Object.main_id).filter(Object.main_id.like(pattern)).all()
        max_num = 0
        for (candidate,) in existing_ids:
            number = extract_numeric_suffix(candidate, expected_prefix=prefix)
            if number is not None and number > max_num:
                max_num = number

        new_num = max_num + 1
        return f"{prefix}-{new_num}"
    except Exception as e:
        # Log error and start from 1
        import logging
        logger = logging.getLogger(__name__)
        logger.warning(f"Error generating base_id for {object_type_name}: {str(e)}. Starting from 1.")
        return f"{prefix}-1"

