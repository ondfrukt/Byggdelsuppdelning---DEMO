from models import db, Object, ObjectType
from sqlalchemy import func, Integer, cast

def generate_auto_id(object_type_name):
    """
    Generate auto ID for objects based on type.
    
    Args:
        object_type_name (str): Name of the object type
        
    Returns:
        str: Generated ID (e.g., 'BYG-001', 'PROD-042')
    """
    # Get object type from database
    object_type = ObjectType.query.filter_by(name=object_type_name).first()
    
    # Use id_prefix from database if available, otherwise use default mapping
    if object_type and object_type.id_prefix:
        prefix = object_type.id_prefix
    else:
        # Default prefix mapping as fallback
        prefix_map = {
            'Byggdel': 'BYG',
            'Produkt': 'PROD',
            'Kravställning': 'KRAV',
            'Anslutning': 'ANS',
            'Ritningsobjekt': 'RIT',
            'Egenskap': 'EG',
            'Anvisning': 'ANV'
        }
        prefix = prefix_map.get(object_type_name, 'OBJ')
    
    # Get the highest number for this type
    try:
        # Find all objects with this prefix
        pattern = f'{prefix}-%'
        last_obj = db.session.query(Object).filter(
            Object.auto_id.like(pattern)
        ).order_by(Object.auto_id.desc()).first()
        
        if last_obj:
            # Extract number from auto_id (e.g., 'BYG-001' -> 1)
            last_num = int(last_obj.auto_id.split('-')[-1])
        else:
            last_num = 0
        
        new_num = last_num + 1
        return f"{prefix}-{new_num:03d}"
    except Exception as e:
        # Log error and start from 001
        import logging
        logger = logging.getLogger(__name__)
        logger.warning(f"Error generating auto_id for {object_type_name}: {str(e)}. Starting from 001.")
        return f"{prefix}-001"
