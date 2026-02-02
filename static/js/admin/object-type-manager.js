/**
 * Object Type Manager - Admin Interface
 * Manages object types and their fields
 */

class ObjectTypeManager {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.objectTypes = [];
        this.selectedType = null;
    }
    
    async render() {
        if (!this.container) return;
        
        this.container.innerHTML = `
            <div class="admin-panel">
                <div class="admin-header">
                    <h2>Objekttyper Administration</h2>
                    <button class="btn btn-primary" onclick="adminManager.showCreateTypeModal()">
                        Skapa Ny Typ
                    </button>
                </div>
                
                <div class="admin-content">
                    <div class="types-list">
                        <h3>Objekttyper</h3>
                        <div id="types-list-container"></div>
                    </div>
                    
                    <div class="type-details" id="type-details-container">
                        <p class="empty-state">Välj en objekttyp för att visa detaljer</p>
                    </div>
                </div>
            </div>
        `;
        
        await this.loadObjectTypes();
    }
    
    async loadObjectTypes() {
        try {
            this.objectTypes = await ObjectTypesAPI.getAll(true);
            this.renderTypesList();
        } catch (error) {
            console.error('Failed to load object types:', error);
            showToast('Kunde inte ladda objekttyper', 'error');
        }
    }
    
    renderTypesList() {
        const container = document.getElementById('types-list-container');
        if (!container) return;
        
        if (this.objectTypes.length === 0) {
            container.innerHTML = '<p class="empty-state">Inga objekttyper ännu</p>';
            return;
        }
        
        container.innerHTML = this.objectTypes.map(type => {
            const color = getObjectTypeColor(type.name);
            return `
                <div class="type-card ${this.selectedType?.id === type.id ? 'selected' : ''}" 
                     onclick="adminManager.selectType(${type.id})"
                     style="border-left: 4px solid ${color}">
                    <h4>${type.name}</h4>
                    <p>${type.description || 'Ingen beskrivning'}</p>
                    <small>${type.fields?.length || 0} fält • ${type.auto_id_prefix || 'AUTO'}-XXX</small>
                </div>
            `;
        }).join('');
    }
    
    selectType(typeId) {
        this.selectedType = this.objectTypes.find(t => t.id === typeId);
        this.renderTypeDetails();
        this.renderTypesList();
    }
    
    renderTypeDetails() {
        const container = document.getElementById('type-details-container');
        if (!container || !this.selectedType) return;
        
        const fields = this.selectedType.fields || [];
        
        container.innerHTML = `
            <div class="type-detail-view">
                <div class="detail-header">
                    <h3>${this.selectedType.name}</h3>
                    <div>
                        <button class="btn btn-sm btn-primary" onclick="adminManager.editType(${this.selectedType.id})">
                            Redigera
                        </button>
                        <button class="btn btn-sm btn-danger" onclick="adminManager.deleteType(${this.selectedType.id})">
                            Ta bort
                        </button>
                    </div>
                </div>
                
                <div class="detail-grid">
                    <div class="detail-item">
                        <span class="detail-label">Beskrivning</span>
                        <span class="detail-value">${this.selectedType.description || 'N/A'}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">ID-prefix</span>
                        <span class="detail-value">${this.selectedType.auto_id_prefix || 'AUTO'}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">Nästa ID-nummer</span>
                        <span class="detail-value">${this.selectedType.auto_id_next_number || 1}</span>
                    </div>
                </div>
                
                <div class="fields-section">
                    <div class="section-header">
                        <h4>Fält</h4>
                        <button class="btn btn-sm btn-primary" onclick="adminManager.showAddFieldModal()">
                            Lägg till Fält
                        </button>
                    </div>
                    
                    ${fields.length === 0 ? 
                        '<p class="empty-state">Inga fält definierade</p>' :
                        `<div class="fields-list">
                            ${fields.map(field => this.renderFieldItem(field)).join('')}
                        </div>`
                    }
                </div>
            </div>
        `;
    }
    
    renderFieldItem(field) {
        return `
            <div class="field-item">
                <div class="field-info">
                    <strong>${field.display_name || field.name}</strong>
                    ${field.required ? '<span class="required-badge">Obligatorisk</span>' : ''}
                    <br>
                    <small>
                        Typ: ${field.field_type} • 
                        Namn: ${field.name}
                        ${field.help_text ? ` • ${field.help_text}` : ''}
                    </small>
                </div>
                <div class="field-actions">
                    <button class="btn btn-sm btn-secondary" onclick="adminManager.editField(${field.id})">
                        Redigera
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="adminManager.deleteField(${field.id})">
                        Ta bort
                    </button>
                </div>
            </div>
        `;
    }
    
    showCreateTypeModal() {
        const modal = document.getElementById('type-modal');
        const overlay = document.getElementById('modal-overlay');
        
        if (!modal || !overlay) return;
        
        document.getElementById('type-modal-title').textContent = 'Skapa Objekttyp';
        document.getElementById('type-form').reset();
        modal.dataset.mode = 'create';
        
        modal.style.display = 'block';
        overlay.style.display = 'block';
    }
    
    editType(typeId) {
        const type = this.objectTypes.find(t => t.id === typeId);
        if (!type) return;
        
        const modal = document.getElementById('type-modal');
        const overlay = document.getElementById('modal-overlay');
        
        if (!modal || !overlay) return;
        
        document.getElementById('type-modal-title').textContent = 'Redigera Objekttyp';
        document.getElementById('type-name').value = type.name;
        document.getElementById('type-description').value = type.description || '';
        document.getElementById('type-prefix').value = type.auto_id_prefix || '';
        
        modal.dataset.mode = 'edit';
        modal.dataset.typeId = typeId;
        
        modal.style.display = 'block';
        overlay.style.display = 'block';
    }
    
    async deleteType(typeId) {
        if (!confirm('Är du säker på att du vill ta bort denna objekttyp? Detta kan påverka befintliga objekt.')) {
            return;
        }
        
        try {
            await ObjectTypesAPI.delete(typeId);
            showToast('Objekttyp borttagen', 'success');
            await this.loadObjectTypes();
            this.selectedType = null;
            this.renderTypeDetails();
        } catch (error) {
            console.error('Failed to delete type:', error);
            showToast(error.message || 'Kunde inte ta bort objekttyp', 'error');
        }
    }
    
    showAddFieldModal() {
        if (!this.selectedType) return;
        
        const modal = document.getElementById('field-modal');
        const overlay = document.getElementById('modal-overlay');
        
        if (!modal || !overlay) return;
        
        document.getElementById('field-modal-title').textContent = 'Lägg till Fält';
        document.getElementById('field-form').reset();
        modal.dataset.mode = 'create';
        modal.dataset.typeId = this.selectedType.id;
        
        modal.style.display = 'block';
        overlay.style.display = 'block';
    }
    
    editField(fieldId) {
        if (!this.selectedType) return;
        
        const field = this.selectedType.fields.find(f => f.id === fieldId);
        if (!field) return;
        
        const modal = document.getElementById('field-modal');
        const overlay = document.getElementById('modal-overlay');
        
        if (!modal || !overlay) return;
        
        document.getElementById('field-modal-title').textContent = 'Redigera Fält';
        document.getElementById('field-name').value = field.name;
        document.getElementById('field-display-name').value = field.display_name || '';
        document.getElementById('field-type').value = field.field_type;
        document.getElementById('field-required').checked = field.required;
        document.getElementById('field-help-text').value = field.help_text || '';
        document.getElementById('field-options').value = field.options || '';
        
        modal.dataset.mode = 'edit';
        modal.dataset.typeId = this.selectedType.id;
        modal.dataset.fieldId = fieldId;
        
        modal.style.display = 'block';
        overlay.style.display = 'block';
    }
    
    async deleteField(fieldId) {
        if (!this.selectedType || !confirm('Är du säker på att du vill ta bort detta fält?')) {
            return;
        }
        
        try {
            await ObjectTypesAPI.deleteField(this.selectedType.id, fieldId);
            showToast('Fält borttaget', 'success');
            await this.loadObjectTypes();
            this.selectType(this.selectedType.id);
        } catch (error) {
            console.error('Failed to delete field:', error);
            showToast(error.message || 'Kunde inte ta bort fält', 'error');
        }
    }
}

// Global instance
let adminManager = null;

// Initialize admin panel
function initializeAdminPanel() {
    adminManager = new ObjectTypeManager('admin-container');
    adminManager.render();
}

// Save object type (create or update)
async function saveObjectType(event) {
    event.preventDefault();
    
    const modal = document.getElementById('type-modal');
    const mode = modal.dataset.mode;
    const typeId = modal.dataset.typeId;
    
    const data = {
        name: document.getElementById('type-name').value,
        description: document.getElementById('type-description').value,
        auto_id_prefix: document.getElementById('type-prefix').value
    };
    
    try {
        if (mode === 'create') {
            await ObjectTypesAPI.create(data);
            showToast('Objekttyp skapad', 'success');
        } else {
            await ObjectTypesAPI.update(typeId, data);
            showToast('Objekttyp uppdaterad', 'success');
        }
        
        closeModal();
        await adminManager.loadObjectTypes();
    } catch (error) {
        console.error('Failed to save type:', error);
        showToast(error.message || 'Kunde inte spara objekttyp', 'error');
    }
}

// Save field (create or update)
async function saveField(event) {
    event.preventDefault();
    
    const modal = document.getElementById('field-modal');
    const mode = modal.dataset.mode;
    const typeId = modal.dataset.typeId;
    const fieldId = modal.dataset.fieldId;
    
    const data = {
        name: document.getElementById('field-name').value,
        display_name: document.getElementById('field-display-name').value,
        field_type: document.getElementById('field-type').value,
        required: document.getElementById('field-required').checked,
        help_text: document.getElementById('field-help-text').value,
        options: document.getElementById('field-options').value
    };
    
    try {
        if (mode === 'create') {
            await ObjectTypesAPI.addField(typeId, data);
            showToast('Fält tillagt', 'success');
        } else {
            await ObjectTypesAPI.updateField(typeId, fieldId, data);
            showToast('Fält uppdaterat', 'success');
        }
        
        closeModal();
        await adminManager.loadObjectTypes();
        adminManager.selectType(parseInt(typeId));
    } catch (error) {
        console.error('Failed to save field:', error);
        showToast(error.message || 'Kunde inte spara fält', 'error');
    }
}
