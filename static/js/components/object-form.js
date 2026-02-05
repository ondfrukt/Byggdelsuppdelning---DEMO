/**
 * Object Form Component
 * Dynamically generates forms based on ObjectType fields
 */

class ObjectFormComponent {
    constructor(objectType, existingObject = null) {
        this.objectType = objectType;
        this.existingObject = existingObject;
        this.fields = [];
    }
    
    async loadFields() {
        try {
            const typeData = await ObjectTypesAPI.getById(this.objectType.id);
            this.fields = typeData.fields || [];
        } catch (error) {
            console.error('Failed to load fields:', error);
            throw error;
        }
    }
    
    async render(containerId) {
        await this.loadFields();
        
        const container = document.getElementById(containerId);
        if (!container) return;
        
        const formHtml = this.fields.map(field => this.renderField(field)).join('');
        
        // Render metadata fields before dynamic fields
        const metadataFieldsHtml = this.renderMetadataFields();
        
        // Don't create a nested form - just render the fields directly
        // The parent form in index.html (object-main-form) will handle submission
        container.innerHTML = `
            <div id="object-form-fields">
                ${metadataFieldsHtml}
                ${formHtml}
            </div>
        `;
    }
    
    renderField(field) {
        const value = this.existingObject?.data?.[field.field_name] || '';
        const required = field.is_required ? 'required' : '';
        const label = `${field.display_name || field.field_name}${field.is_required ? ' *' : ''}`;
        
        let inputHtml = '';
        
        switch (field.field_type) {
            case 'text':
                inputHtml = `
                    <input type="text" 
                           id="field-${field.field_name}" 
                           name="${field.field_name}"
                           value="${escapeHtml(value)}"
                           ${required}
                           class="form-control">
                `;
                break;
                
            case 'textarea':
                inputHtml = `
                    <textarea id="field-${field.field_name}" 
                              name="${field.field_name}"
                              rows="4"
                              ${required}
                              class="form-control">${escapeHtml(value)}</textarea>
                `;
                break;
                
            case 'number':
                inputHtml = `
                    <input type="number" 
                           id="field-${field.field_name}" 
                           name="${field.field_name}"
                           value="${value}"
                           step="any"
                           ${required}
                           class="form-control">
                `;
                break;
                
            case 'decimal':
                inputHtml = `
                    <input type="number" 
                           id="field-${field.field_name}" 
                           name="${field.field_name}"
                           value="${value}"
                           step="0.01"
                           ${required}
                           class="form-control">
                `;
                break;
                
            case 'date':
                const dateValue = value ? formatDateForInput(value) : '';
                inputHtml = `
                    <input type="date" 
                           id="field-${field.field_name}" 
                           name="${field.field_name}"
                           value="${dateValue}"
                           ${required}
                           class="form-control">
                `;
                break;
                
            case 'datetime':
                const datetimeValue = value ? formatDateTimeForInput(value) : '';
                inputHtml = `
                    <input type="datetime-local" 
                           id="field-${field.field_name}" 
                           name="${field.field_name}"
                           value="${datetimeValue}"
                           ${required}
                           class="form-control">
                `;
                break;
                
            case 'boolean':
                const checked = value === true || value === 'true' ? 'checked' : '';
                inputHtml = `
                    <div class="checkbox-wrapper">
                        <input type="checkbox" 
                               id="field-${field.field_name}" 
                               name="${field.field_name}"
                               ${checked}
                               class="form-checkbox">
                        <label for="field-${field.field_name}" class="checkbox-label">
                            ${field.help_text || 'Aktivera'}
                        </label>
                    </div>
                `;
                break;
                
            case 'select':
                const options = this.parseOptions(field.field_options || field.options);
                const optionsHtml = options.map(opt => 
                    `<option value="${escapeHtml(opt)}" ${value === opt ? 'selected' : ''}>
                        ${escapeHtml(opt)}
                    </option>`
                ).join('');
                inputHtml = `
                    <select id="field-${field.field_name}" 
                            name="${field.field_name}"
                            ${required}
                            class="form-control">
                        <option value="">Välj...</option>
                        ${optionsHtml}
                    </select>
                `;
                break;
                
            default:
                inputHtml = `
                    <input type="text" 
                           id="field-${field.field_name}" 
                           name="${field.field_name}"
                           value="${escapeHtml(value)}"
                           ${required}
                           class="form-control">
                `;
        }
        
        return `
            <div class="form-group">
                <label for="field-${field.field_name}">${label}</label>
                ${inputHtml}
                ${field.help_text ? `<small class="form-help">${escapeHtml(field.help_text)}</small>` : ''}
            </div>
        `;
    }
    
    renderMetadataFields() {
        const statusValue = this.existingObject?.status || 'In work';
        const versionValue = this.existingObject?.version || '001';
        const mainIdValue = this.existingObject?.main_id || '';
        
        return `
            <div class="form-section">
                <h4>Metadata</h4>
                <div class="form-group">
                    <label for="field-status">Status *</label>
                    <select id="field-status" name="status" class="form-control" required>
                        <option value="In work" ${statusValue === 'In work' ? 'selected' : ''}>In work</option>
                        <option value="Released" ${statusValue === 'Released' ? 'selected' : ''}>Released</option>
                        <option value="Obsolete" ${statusValue === 'Obsolete' ? 'selected' : ''}>Obsolete</option>
                        <option value="Canceled" ${statusValue === 'Canceled' ? 'selected' : ''}>Canceled</option>
                    </select>
                </div>
                <div class="form-group">
                    <label for="field-version">Version</label>
                    <input type="text" 
                           id="field-version" 
                           name="version"
                           value="${escapeHtml(versionValue)}"
                           class="form-control"
                           readonly>
                    <small class="form-help">Version uppdateras automatiskt</small>
                </div>
                <div class="form-group">
                    <label for="field-main_id">MainID</label>
                    <input type="text" 
                           id="field-main_id" 
                           name="main_id"
                           value="${escapeHtml(mainIdValue)}"
                           class="form-control"
                           readonly>
                    <small class="form-help">MainID genereras automatiskt vid skapande</small>
                </div>
            </div>
        `;
    }
    
    parseOptions(optionsString) {
        if (!optionsString) return [];
        
        // If it's already an array, return it directly
        if (Array.isArray(optionsString)) {
            return optionsString;
        }
        
        // If it's an object (but not an array), try to extract values
        if (typeof optionsString === 'object') {
            // If it has a values property that's an array, use that
            if (Array.isArray(optionsString.values)) {
                return optionsString.values;
            }
            // Otherwise, try to get Object.values
            return Object.values(optionsString).filter(v => v !== null && v !== undefined);
        }
        
        // If it's a string, try parsing or splitting
        if (typeof optionsString === 'string') {
            try {
                // Try parsing as JSON array first
                const parsed = JSON.parse(optionsString);
                if (Array.isArray(parsed)) {
                    return parsed;
                }
                // If parsed as object, return its values
                if (typeof parsed === 'object') {
                    return Object.values(parsed).filter(v => v !== null && v !== undefined);
                }
            } catch {
                // Fall back to comma-separated
                return optionsString.split(',').map(s => s.trim()).filter(s => s);
            }
        }
        
        return [];
    }
    
    getFormData() {
        // Get the parent form (object-main-form) which contains all fields
        const form = document.getElementById('object-main-form');
        if (!form) return null;
        
        const data = {};
        
        // Get metadata fields
        const statusInput = form.elements['status'];
        if (statusInput) {
            data.status = statusInput.value;
        }
        
        const versionInput = form.elements['version'];
        if (versionInput) {
            data.version = versionInput.value;
        }
        
        const mainIdInput = form.elements['main_id'];
        if (mainIdInput && mainIdInput.value) {
            data.main_id = mainIdInput.value;
        }
        
        // Get dynamic fields
        this.fields.forEach(field => {
            const input = form.elements[field.field_name];
            if (!input) return;
            
            let value;
            
            if (field.field_type === 'boolean') {
                value = input.checked;
            } else if (field.field_type === 'number' || field.field_type === 'decimal') {
                value = input.value ? parseFloat(input.value) : null;
            } else {
                value = input.value || null;
            }
            
            data[field.field_name] = value;
        });
        
        return data;
    }
    
    validate() {
        // Get the parent form (object-main-form) which contains all fields
        const form = document.getElementById('object-main-form');
        if (!form) {
            console.error('Validation failed: form element not found');
            return false;
        }
        
        // Check if fields are loaded
        if (!this.fields || this.fields.length === 0) {
            console.error('Validation failed: no fields defined');
            return false;
        }
        
        // Check if all required fields have values
        let isValid = true;
        const missingFields = [];
        
        this.fields.forEach(field => {
            if (!field.is_required) return;
            
            const input = form.elements[field.field_name];
            if (!input) {
                isValid = false;
                missingFields.push({
                    name: field.display_name || field.field_name,
                    type: field.field_type,
                    value: null,
                    reason: 'Element not found in form'
                });
                console.warn(`Required field not found in form: ${field.field_name}`);
                return;
            }
            
            if (field.field_type === 'boolean') {
                // Boolean fields don't need to be checked (checkbox can be unchecked)
                return;
            }
            
            const value = input.value;
            // Check for empty values (covers both empty strings and whitespace)
            // For text-based inputs, also check trimmed value to catch whitespace-only entries
            if (value === null || value === undefined || (typeof value === 'string' && value.trim() === '')) {
                isValid = false;
                missingFields.push({
                    name: field.display_name || field.field_name,
                    type: field.field_type,
                    value: value
                });
                // Add error styling
                input.classList.add('error');
            } else {
                // Remove error styling
                input.classList.remove('error');
            }
        });
        
        if (!isValid && missingFields.length > 0) {
            console.warn('Form validation failed. Missing or empty required fields:', missingFields);
            console.warn('Please ensure all fields marked with * are filled in:');
            missingFields.forEach(field => {
                if (field.reason) {
                    console.warn(`  - ${field.name}: ${field.reason}`);
                } else {
                    console.warn(`  - ${field.name} (${field.type}): current value = "${field.value}"`);
                }
            });
        }
        
        return isValid;
    }
}

// Helper function to format date for input
function formatDateForInput(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toISOString().split('T')[0];
}

// Helper function to format datetime for input
function formatDateTimeForInput(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toISOString().slice(0, 16);
}
