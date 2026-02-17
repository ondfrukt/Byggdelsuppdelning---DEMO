/**
 * Object Type Manager - Admin Interface
 * Manages object types and their fields
 */

class ObjectTypeManager {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.objectTypes = [];
        this.selectedType = null;
        this.buildingPartCategories = [];
        this.fieldModalTypeListenerAttached = false;
    }
    
    async render() {
        if (!this.container) return;
        
        this.container.innerHTML = `
            <div class="admin-panel">
                <div class="admin-header">
                    <h2>Administration</h2>
                </div>
                
                <div class="admin-tabs">
                    <button class="admin-tab active" data-tab="object-types" onclick="adminManager.switchTab('object-types')">
                        Objekttyper
                    </button>
                    <button class="admin-tab" data-tab="building-part-categories" onclick="adminManager.switchTab('building-part-categories')">
                        Byggdelskategorier
                    </button>
                    <button class="admin-tab" data-tab="list-view" onclick="adminManager.switchTab('list-view')">
                        Listvy Inställningar
                    </button>
                </div>
                
                <div class="admin-tab-content">
                    <div id="object-types-tab" class="admin-tab-panel active">
                        <div class="admin-panel-header">
                            <h3>Objekttyper Administration</h3>
                            <button class="btn btn-primary" onclick="adminManager.showCreateTypeModal()">
                                Skapa Ny Typ
                            </button>
                        </div>
                        
                        <div class="admin-content">
                            <div class="types-list">
                                <h4>Objekttyper</h4>
                                <div id="types-list-container"></div>
                            </div>
                            
                            <div class="type-details" id="type-details-container">
                                <p class="empty-state">Välj en objekttyp för att visa detaljer</p>
                            </div>
                        </div>
                    </div>
                    
                    <div id="building-part-categories-tab" class="admin-tab-panel">
                        <div class="admin-panel-header">
                            <h3>Byggdelskategorier</h3>
                        </div>
                        <div id="building-part-categories-container">
                            <p>Laddar...</p>
                        </div>
                    </div>
                    
                    <div id="list-view-tab" class="admin-tab-panel">
                        <div class="admin-panel-header">
                            <h3>Listvy Standardinställningar</h3>
                        </div>
                        <div id="list-view-config-container">
                            <p>Laddar...</p>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        this.setupFieldModalTypeBehavior();
        await this.loadObjectTypes();
        await this.loadBuildingPartCategories();
        await this.loadListViewConfig();
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
                    <small>${type.fields?.length || 0} fält • ${type.id_prefix || 'AUTO'}-001</small>
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
                        <span class="detail-value">${this.selectedType.id_prefix || 'AUTO'}</span>
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
        const typeLabel = this.getFieldTypeLabel(field);
        return `
            <div class="field-item">
                <div class="field-info">
                    <strong>${field.display_name || field.field_name}</strong>
                    ${field.is_required ? '<span class="required-badge">Obligatorisk</span>' : ''}
                    ${field.is_table_visible === false ? '<span class="status-badge obsolete">Dold i tabeller</span>' : '<span class="status-badge godkand">Visas i tabeller</span>'}
                    <br>
                    <small>
                        Typ: ${typeLabel} • 
                        Namn: ${field.field_name}
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

    getFieldTypeLabel(field) {
        const options = this.normalizeFieldOptions(field.field_options);
        if (field.field_type === 'select' && options?.source === 'building_part_categories') {
            return 'byggdelskategori';
        }
        return field.field_type;
    }

    normalizeFieldOptions(rawOptions) {
        if (!rawOptions) return null;
        if (typeof rawOptions === 'object') return rawOptions;
        if (typeof rawOptions !== 'string') return null;
        try {
            return JSON.parse(rawOptions);
        } catch (_err) {
            return null;
        }
    }

    setupFieldModalTypeBehavior() {
        if (this.fieldModalTypeListenerAttached) return;
        const fieldTypeSelect = document.getElementById('field-type');
        if (!fieldTypeSelect) return;

        fieldTypeSelect.addEventListener('change', () => this.updateFieldOptionsState());
        this.fieldModalTypeListenerAttached = true;
    }

    updateFieldOptionsState() {
        const fieldTypeSelect = document.getElementById('field-type');
        const optionsInput = document.getElementById('field-options');
        if (!fieldTypeSelect || !optionsInput) return;

        const isBuildingPartCategory = fieldTypeSelect.value === 'building_part_category';
        optionsInput.disabled = isBuildingPartCategory;
        optionsInput.placeholder = isBuildingPartCategory
            ? 'Hämtas automatiskt från admin-listan Byggdelskategorier'
            : 'Alt1, Alt2, Alt3 eller JSON array';
    }

    async loadBuildingPartCategories() {
        try {
            this.buildingPartCategories = await BuildingPartCategoriesAPI.getAll(true);
            this.renderBuildingPartCategories();
        } catch (error) {
            console.error('Failed to load building part categories:', error);
            const container = document.getElementById('building-part-categories-container');
            if (container) {
                container.innerHTML = '<p class="error">Kunde inte ladda byggdelskategorier</p>';
            }
        }
    }

    renderBuildingPartCategories() {
        const container = document.getElementById('building-part-categories-container');
        if (!container) return;

        container.innerHTML = `
            <div class="category-admin">
                <div class="category-toolbar">
                    <input id="new-building-part-category-name" type="text" class="form-control" placeholder="Ny byggdelskategori...">
                    <button class="btn btn-primary" onclick="adminManager.createBuildingPartCategory()">Lägg till</button>
                </div>
                ${this.buildingPartCategories.length === 0
                    ? '<p class="empty-state">Inga byggdelskategorier ännu</p>'
                    : `<div class="category-list">
                        ${this.buildingPartCategories.map(category => `
                            <div class="category-item ${category.is_active ? '' : 'inactive'}">
                                <span>${escapeHtml(category.name)}</span>
                                <div class="category-actions">
                                    <button class="btn btn-sm btn-secondary" onclick="adminManager.editBuildingPartCategory(${category.id})">Redigera</button>
                                    <button class="btn btn-sm btn-danger" onclick="adminManager.deleteBuildingPartCategory(${category.id})">Ta bort</button>
                                </div>
                            </div>
                        `).join('')}
                    </div>`}
            </div>
        `;
    }

    async createBuildingPartCategory() {
        const input = document.getElementById('new-building-part-category-name');
        const name = (input?.value || '').trim();
        if (!name) {
            showToast('Ange ett namn för byggdelskategorin', 'error');
            return;
        }

        try {
            await BuildingPartCategoriesAPI.create({ name });
            if (input) input.value = '';
            showToast('Byggdelskategori skapad', 'success');
            await this.loadBuildingPartCategories();
        } catch (error) {
            console.error('Failed to create building part category:', error);
            showToast(error.message || 'Kunde inte skapa byggdelskategori', 'error');
        }
    }

    async editBuildingPartCategory(categoryId) {
        const category = this.buildingPartCategories.find(item => item.id === categoryId);
        if (!category) return;

        const newName = prompt('Nytt namn på byggdelskategori:', category.name);
        if (newName === null) return;
        const trimmedName = newName.trim();
        if (!trimmedName) {
            showToast('Namn kan inte vara tomt', 'error');
            return;
        }

        try {
            await BuildingPartCategoriesAPI.update(categoryId, { name: trimmedName });
            showToast('Byggdelskategori uppdaterad', 'success');
            await this.loadBuildingPartCategories();
        } catch (error) {
            console.error('Failed to update building part category:', error);
            showToast(error.message || 'Kunde inte uppdatera byggdelskategori', 'error');
        }
    }

    async deleteBuildingPartCategory(categoryId) {
        if (!confirm('Är du säker på att du vill ta bort denna byggdelskategori?')) {
            return;
        }

        try {
            await BuildingPartCategoriesAPI.delete(categoryId);
            showToast('Byggdelskategori borttagen', 'success');
            await this.loadBuildingPartCategories();
        } catch (error) {
            console.error('Failed to delete building part category:', error);
            showToast(error.message || 'Kunde inte ta bort byggdelskategori', 'error');
        }
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
        document.getElementById('field-table-visible').checked = true;
        this.updateFieldOptionsState();
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
        document.getElementById('field-name').value = field.field_name;
        document.getElementById('field-display-name').value = field.display_name || '';
        const parsedOptions = this.normalizeFieldOptions(field.field_options);
        const fieldTypeValue = (field.field_type === 'select' && parsedOptions?.source === 'building_part_categories')
            ? 'building_part_category'
            : field.field_type;
        document.getElementById('field-type').value = fieldTypeValue;
        document.getElementById('field-required').checked = field.is_required;
        document.getElementById('field-table-visible').checked = field.is_table_visible !== false;
        document.getElementById('field-help-text').value = field.help_text || '';
        document.getElementById('field-options').value = typeof field.field_options === 'string'
            ? field.field_options
            : (field.field_options ? JSON.stringify(field.field_options) : '');
        this.updateFieldOptionsState();
        
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
    
    switchTab(tabName) {
        // Update tab buttons
        document.querySelectorAll('.admin-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.tab === tabName);
        });
        
        // Update tab panels
        document.querySelectorAll('.admin-tab-panel').forEach(panel => {
            panel.classList.remove('active');
        });
        
        if (tabName === 'object-types') {
            document.getElementById('object-types-tab').classList.add('active');
        } else if (tabName === 'building-part-categories') {
            document.getElementById('building-part-categories-tab').classList.add('active');
        } else if (tabName === 'list-view') {
            document.getElementById('list-view-tab').classList.add('active');
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
        id_prefix: document.getElementById('type-prefix').value
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
    
    const selectedFieldType = document.getElementById('field-type').value;
    const rawFieldOptions = document.getElementById('field-options').value;
    const data = {
        field_name: document.getElementById('field-name').value,
        display_name: document.getElementById('field-display-name').value,
        field_type: selectedFieldType === 'building_part_category' ? 'select' : selectedFieldType,
        is_required: document.getElementById('field-required').checked,
        is_table_visible: document.getElementById('field-table-visible').checked,
        help_text: document.getElementById('field-help-text').value,
        field_options: selectedFieldType === 'building_part_category'
            ? { source: 'building_part_categories' }
            : rawFieldOptions
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

// List View Configuration Methods (added to ObjectTypeManager class)
ObjectTypeManager.prototype.loadListViewConfig = async function() {
    try {
        const response = await fetch('/api/view-config/list-view');
        if (!response.ok) throw new Error('Failed to load list view config');
        
        const config = await response.json();
        this.listViewConfig = config;
        this.renderListViewConfig();
    } catch (error) {
        console.error('Failed to load list view config:', error);
        const container = document.getElementById('list-view-config-container');
        if (container) {
            container.innerHTML = '<p class="error">Kunde inte ladda listvy-inställningar</p>';
        }
    }
};

ObjectTypeManager.prototype.renderListViewConfig = function() {
    const container = document.getElementById('list-view-config-container');
    if (!container || !this.listViewConfig) return;
    
    const configEntries = Object.entries(this.listViewConfig);
    
    container.innerHTML = `
        <div class="list-view-config">
            <p class="config-description">
                Konfigurera vilka kolumner som ska visas som standard för varje objektstyp i listvyn.
                Användare kan sedan anpassa sina egna vyer.
            </p>
            ${configEntries.map(([typeName, typeConfig]) => `
                <div class="list-view-config-item">
                    <h4>${typeName}</h4>
                    <p>Välj vilka kolumner som ska visas och i vilken ordning:</p>
                    
                    <div class="field-list" data-object-type="${typeName}" data-object-type-id="${typeConfig.object_type_id}">
                        <div class="field-chip visible" data-field="auto_id">
                            <span>ID</span>
                        </div>
                        ${typeConfig.available_fields.map(field => {
                            const colConfig = typeConfig.visible_columns.find(c => c.field_name === field.field_name);
                            const isVisible = colConfig ? colConfig.visible : false;
                            return `
                                <div class="field-chip ${isVisible ? 'visible' : ''}" data-field="${field.field_name}">
                                    <span>${field.display_name}</span>
                                </div>
                            `;
                        }).join('')}
                        <div class="field-chip visible" data-field="created_at">
                            <span>Skapad</span>
                        </div>
                    </div>
                    
                    <div class="form-actions" style="margin-top: 1rem;">
                        <button class="btn btn-primary" onclick="adminManager.saveListViewConfigForType('${typeName}', ${typeConfig.object_type_id})">
                            Spara Inställningar för ${typeName}
                        </button>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
    
    // Add click handlers to field chips
    document.querySelectorAll('.field-chip').forEach(chip => {
        chip.addEventListener('click', function() {
            // Don't allow toggling ID and created_at (always visible)
            const fieldName = this.dataset.field;
            if (fieldName === 'auto_id' || fieldName === 'created_at') {
                return;
            }
            this.classList.toggle('visible');
        });
    });
};

ObjectTypeManager.prototype.saveListViewConfigForType = async function(typeName, objectTypeId) {
    try {
        const fieldList = document.querySelector(`.field-list[data-object-type="${typeName}"]`);
        if (!fieldList) return;
        
        const chips = fieldList.querySelectorAll('.field-chip');
        const visible_columns = [];
        const column_order = [];
        
        chips.forEach(chip => {
            const fieldName = chip.dataset.field;
            const isVisible = chip.classList.contains('visible');
            
            column_order.push(fieldName);
            visible_columns.push({
                field_name: fieldName,
                visible: isVisible,
                width: 150
            });
        });
        
        const config = {};
        config[typeName] = {
            object_type_id: objectTypeId,
            visible_columns: visible_columns,
            column_order: column_order,
            column_widths: {}
        };
        
        const response = await fetch('/api/view-config/list-view', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(config)
        });
        
        if (!response.ok) throw new Error('Failed to save list view config');
        
        showToast(`Listvy-inställningar för ${typeName} sparade`, 'success');
        await this.loadListViewConfig();
    } catch (error) {
        console.error('Failed to save list view config:', error);
        showToast('Kunde inte spara listvy-inställningar', 'error');
    }
};
