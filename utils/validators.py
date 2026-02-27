from datetime import datetime
from decimal import Decimal, InvalidOperation

def validate_object_data(fields, data, required_overrides=None):
    """
    Validate object data against field definitions.
    
    Args:
        fields (list): List of ObjectField objects
        data (dict): Data to validate
        
    Returns:
        tuple: (is_valid, errors)
    """
    errors = []
    
    required_overrides = required_overrides or {}

    for field in fields:
        field_name = field.field_name
        field_type = field.field_type
        field_id = getattr(field, 'id', None)
        lock_required_setting = bool(getattr(field, 'lock_required_setting', False))
        is_required = bool(field.is_required)

        if not lock_required_setting:
            if field_id in required_overrides and required_overrides[field_id] is not None:
                is_required = bool(required_overrides[field_id])
            elif field_name in required_overrides and required_overrides[field_name] is not None:
                is_required = bool(required_overrides[field_name])
        value = data.get(field_name)
        
        # Check required fields
        if is_required and (value is None or value == ''):
            errors.append(f"Field '{field_name}' is required")
            continue
        
        # Skip validation if value is empty and not required
        if value is None or value == '':
            continue
        
        # Type-specific validation
        if field_type == 'number':
            try:
                if isinstance(value, str):
                    Decimal(value)
                elif not isinstance(value, (int, float, Decimal)):
                    errors.append(f"Field '{field_name}' must be a number")
            except (InvalidOperation, ValueError):
                errors.append(f"Field '{field_name}' must be a valid number")
        
        elif field_type == 'date':
            if isinstance(value, str):
                try:
                    datetime.fromisoformat(value.replace('Z', '+00:00'))
                except ValueError:
                    errors.append(f"Field '{field_name}' must be a valid date (ISO format)")
        
        elif field_type == 'boolean':
            if not isinstance(value, bool) and value not in ['true', 'false', '0', '1', 0, 1]:
                errors.append(f"Field '{field_name}' must be a boolean")
        
        elif field_type == 'select':
            if field.field_options:
                # Handle both list and string formats for field_options
                valid_options = []
                if isinstance(field.field_options, list):
                    valid_options = field.field_options
                elif isinstance(field.field_options, dict):
                    if isinstance(field.field_options.get('values'), list):
                        valid_options = field.field_options.get('values', [])
                    # Dynamic sources are allowed and validated client-side
                elif isinstance(field.field_options, str):
                    # Parse comma-separated string
                    valid_options = [opt.strip() for opt in field.field_options.split(',') if opt.strip()]
                
                # Only validate if we have valid options
                if valid_options and value not in valid_options:
                    errors.append(f"Field '{field_name}' must be one of: {', '.join(valid_options)}")
    
    return len(errors) == 0, errors


def sanitize_filename(filename):
    """
    Sanitize filename for safe storage.
    
    Args:
        filename (str): Original filename
        
    Returns:
        str: Sanitized filename
    """
    import re
    import os
    
    # Get file extension
    name, ext = os.path.splitext(filename)
    
    # Remove special characters, keep alphanumeric, dash, underscore
    name = re.sub(r'[^\w\s-]', '', name)
    name = re.sub(r'[-\s]+', '-', name)
    
    return f"{name}{ext}".lower()


def validate_file_upload(filename, file_size, allowed_extensions=None, max_size=10485760):
    """
    Validate file upload.
    
    Args:
        filename (str): Original filename
        file_size (int): File size in bytes
        allowed_extensions (list): List of allowed extensions
        max_size (int): Maximum file size in bytes (default: 10MB)
        
    Returns:
        tuple: (is_valid, error_message)
    """
    import os
    
    if not filename:
        return False, "No filename provided"
    
    # Check file size
    if file_size > max_size:
        max_mb = max_size / (1024 * 1024)
        return False, f"File size exceeds maximum allowed size of {max_mb}MB"
    
    # Check extension
    if allowed_extensions:
        ext = os.path.splitext(filename)[1].lower()
        if ext not in allowed_extensions:
            return False, f"File type not allowed. Allowed types: {', '.join(allowed_extensions)}"
    
    return True, None
