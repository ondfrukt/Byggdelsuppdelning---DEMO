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
        
        container.innerHTML = `
            <form id="object-form" onsubmit="return false;">
                ${formHtml}
            </form>
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
    
    parseOptions(optionsString) {
        if (!optionsString) return [];
        try {
            // Try parsing as JSON array first
            return JSON.parse(optionsString);
        } catch {
            // Fall back to comma-separated
            return optionsString.split(',').map(s => s.trim()).filter(s => s);
        }
    }
    
    getFormData() {
        const form = document.getElementById('object-form');
        if (!form) return null;
        
        const data = {};
        
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
        const form = document.getElementById('object-form');
        if (!form) return false;
        
        // Check if all required fields have values
        let isValid = true;
        
        this.fields.forEach(field => {
            if (!field.is_required) return;
            
            const input = form.elements[field.field_name];
            if (!input) {
                isValid = false;
                return;
            }
            
            if (field.field_type === 'boolean') {
                // Boolean fields don't need to be checked (checkbox can be unchecked)
                return;
            }
            
            const value = input.value;
            if (!value || value.trim() === '') {
                isValid = false;
                // Add error styling
                input.classList.add('error');
            } else {
                // Remove error styling
                input.classList.remove('error');
            }
        });
        
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
