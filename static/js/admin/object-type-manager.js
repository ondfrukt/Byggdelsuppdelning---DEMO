/**
 * Object Type Manager - Admin Interface
 * Manages object types and their fields
 */

class ObjectTypeManager {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.objectTypes = [];
        this.selectedType = null;
        this.managedLists = [];
        this.fieldTemplates = [];
        this.relationTypeRules = [];
        this.availableRelationTypes = ['relaterad'];
        this.selectedManagedListId = null;
        this.fieldModalTypeListenerAttached = false;
        this.relationRuleTableState = null;
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
                    <button class="admin-tab" data-tab="managed-lists" onclick="adminManager.switchTab('managed-lists')">
                        Listor
                    </button>
                    <button class="admin-tab" data-tab="field-templates" onclick="adminManager.switchTab('field-templates')">
                        Fältmallar
                    </button>
                    <button class="admin-tab" data-tab="relation-type-rules" onclick="adminManager.switchTab('relation-type-rules')">
                        Relationsregler
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
                        
                        <div class="admin-content object-types-admin-content">
                            <div class="types-list">
                                <h4>Objekttyper</h4>
                                <div id="types-list-container"></div>
                            </div>
                            
                            <div class="type-details type-detail-drawer" id="type-details-container">
                                <p class="empty-state">Välj en objekttyp för att visa detaljer</p>
                            </div>
                        </div>
                    </div>
                    
                    <div id="managed-lists-tab" class="admin-tab-panel">
                        <div class="admin-panel-header">
                            <h3>Listor</h3>
                        </div>
                        <div id="managed-lists-container">
                            <p>Laddar...</p>
                        </div>
                    </div>

                    <div id="field-templates-tab" class="admin-tab-panel">
                        <div class="admin-panel-header">
                            <h3>Fältmallar</h3>
                            <button class="btn btn-primary" onclick="adminManager.showCreateFieldTemplateModal()">
                                Skapa Fältmall
                            </button>
                        </div>
                        <div id="field-templates-container">
                            <p>Laddar...</p>
                        </div>
                    </div>

                    <div id="relation-type-rules-tab" class="admin-tab-panel">
                        <div class="admin-panel-header">
                            <h3>Relationsregler</h3>
                        </div>
                        <div id="relation-type-rules-container">
                            <p>Laddar...</p>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        this.setupFieldModalTypeBehavior();
        await this.loadObjectTypes();
        await this.loadManagedLists();
        await this.loadFieldTemplates();
        await this.loadRelationTypeRules();
    }
    
    async loadObjectTypes() {
        try {
            this.objectTypes = await ObjectTypesAPI.getAll(true);
            this.renderTypesList();
            this.renderRelationTypeRules();
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
            const nextNumber = Number(type.auto_id_next_number) || 1;
            return `
                <div class="type-card ${this.selectedType?.id === type.id ? 'selected' : ''}" 
                     onclick="adminManager.selectType(${type.id})"
                     style="border-left: 4px solid ${color}">
                    <h4>${type.name}</h4>
                    <p>${type.description || 'Ingen beskrivning'}</p>
                    <small>${type.fields?.length || 0} fält • ${type.id_prefix || 'AUTO'}-${nextNumber}</small>
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
        if (!container) return;
        if (!this.selectedType) {
            container.classList.remove('open');
            container.innerHTML = '<p class="empty-state">Välj en objekttyp för att visa detaljer</p>';
            return;
        }
        container.classList.add('open');
        
        const fields = (this.selectedType.fields || [])
            .slice()
            .sort((a, b) => (a.display_order || 9999) - (b.display_order || 9999));
        
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
                        <button class="btn btn-sm btn-primary" onclick="adminManager.showAddFieldModal(true)">
                            Lägg till från mall
                        </button>
                    </div>
                    
                    ${fields.length === 0 ? 
                        '<p class="empty-state">Inga fält definierade</p>' :
                        `<div class="table-container admin-fields-table-container">
                            <table class="data-table admin-fields-table">
                                <thead>
                                    <tr>
                                        <th class="col-name">Namn</th>
                                        <th class="col-status">Obligatorisk</th>
                                        <th class="col-width">Bredd</th>
                                        <th class="col-actions"></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${fields.map(field => this.renderFieldRow(field)).join('')}
                                </tbody>
                            </table>
                        </div>`
                    }
                </div>
            </div>
        `;

        if (fields.length > 0) {
            this.attachFieldRowDragAndDrop();
        }
    }
    
    renderFieldRow(field) {
        const nameLabel = field.display_name || field.field_name;
        const canDelete = this.canDeleteField(field);
        const ruleBits = [];
        if (field.lock_required_setting) ruleBits.push('låst krav');
        if (field.force_presence_on_all_objects) ruleBits.push('forcerad närvaro');
        if (field.field_template_name) ruleBits.unshift(`mall: ${field.field_template_name}`);
        const meta = `${this.getFieldTypeLabel(field)} • ${field.field_name}${ruleBits.length ? ` • ${ruleBits.join(', ')}` : ''}`;
        return `
            <tr data-field-id="${field.id}" draggable="true">
                <td class="col-name">
                    <span class="field-drag-handle" title="Dra för att ändra ordning" aria-hidden="true">⋮⋮</span>
                    <strong>${escapeHtml(nameLabel)}</strong>
                    <div class="admin-field-meta">${escapeHtml(meta)}${field.help_text ? ` • ${escapeHtml(field.help_text)}` : ''}</div>
                </td>
                <td class="col-status">
                    <input
                        type="checkbox"
                        class="required-toggle"
                        ${field.is_required ? 'checked' : ''}
                        ${field.lock_required_setting ? 'disabled' : ''}
                        onchange="adminManager.toggleFieldRequired(${field.id}, this.checked)"
                        aria-label="Obligatoriskt för ${escapeHtml(nameLabel)}"
                        title="${field.lock_required_setting ? 'Styrs av fältmall (låst)' : 'Ändra obligatoriskt på objekttyp'}"
                    >
                </td>
                <td class="col-width">
                    <select class="form-control detail-width-select" onchange="adminManager.updateFieldDetailWidth(${field.id}, this.value)">
                        <option value="full" ${(this.resolveFieldDetailWidth(field) === 'full') ? 'selected' : ''}>1/1</option>
                        <option value="half" ${(this.resolveFieldDetailWidth(field) === 'half') ? 'selected' : ''}>1/2</option>
                        <option value="third" ${(this.resolveFieldDetailWidth(field) === 'third') ? 'selected' : ''}>1/3</option>
                    </select>
                </td>
                <td class="col-actions">
                    <button
                        class="btn-icon btn-danger"
                        onclick="adminManager.deleteField(${field.id})"
                        ${canDelete ? '' : 'disabled'}
                        title="${canDelete ? 'Ta bort fält' : 'Detta fält kan inte tas bort'}"
                        aria-label="Ta bort fält ${escapeHtml(nameLabel)}"
                    >🗑️</button>
                </td>
            </tr>
        `;
    }

    canDeleteField(field) {
        const fieldName = String(field?.field_name || '').trim().toLowerCase();
        if (fieldName === 'namn') return false;
        if (field?.force_presence_on_all_objects) return false;
        return true;
    }

    resolveFieldDetailWidth(field) {
        const width = String(field?.detail_width || '').toLowerCase();
        if (width === 'full' || width === 'half' || width === 'third') {
            return width;
        }
        const fieldType = String(field?.field_type || '').toLowerCase();
        return (fieldType === 'richtext' || fieldType === 'textarea') ? 'full' : 'half';
    }

    getFieldTypeLabel(field) {
        const options = this.normalizeFieldOptions(field.field_options);
        if (field.field_type === 'select' && options?.source === 'building_part_categories') {
            return 'byggdelskategori';
        }
        if (field.field_type === 'select' && options?.source === 'managed_list') {
            const listId = Number(options?.list_id);
            const list = this.managedLists.find(item => item.id === listId);
            return list ? `lista: ${list.name}` : 'admin-lista';
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
        const fieldTemplateSelect = document.getElementById('field-template-select');
        if (fieldTemplateSelect) {
            fieldTemplateSelect.addEventListener('change', (event) => this.applyFieldTemplate(event.target.value));
        }
        this.fieldModalTypeListenerAttached = true;
    }

    async loadManagedLists() {
        try {
            this.managedLists = await ManagedListsAPI.getAll(true, true);
            if (!this.selectedManagedListId && this.managedLists.length) {
                this.selectedManagedListId = this.managedLists[0].id;
            }
            if (this.selectedManagedListId && !this.managedLists.some(list => list.id === this.selectedManagedListId)) {
                this.selectedManagedListId = this.managedLists.length ? this.managedLists[0].id : null;
            }
            this.renderManagedLists();
            this.renderManagedListOptions();
            if (this.selectedType) {
                this.renderTypeDetails();
            }
        } catch (error) {
            console.error('Failed to load managed lists:', error);
            const container = document.getElementById('managed-lists-container');
            if (container) {
                container.innerHTML = '<p class="error">Kunde inte ladda listor</p>';
            }
        }
    }

    async loadFieldTemplates() {
        try {
            this.fieldTemplates = await FieldTemplatesAPI.getAll(false);
            this.renderFieldTemplateOptions();
            this.renderFieldTemplates();
        } catch (error) {
            console.error('Failed to load field templates:', error);
            this.fieldTemplates = [];
            this.renderFieldTemplateOptions();
            this.renderFieldTemplates();
        }
    }

    async loadRelationTypeRules() {
        try {
            const response = await RelationTypeRulesAPI.getAll();
            this.relationTypeRules = Array.isArray(response?.items) ? response.items : [];
            this.availableRelationTypes = Array.isArray(response?.available_relation_types) && response.available_relation_types.length
                ? response.available_relation_types
                : ['relaterad'];
            this.renderRelationTypeRules();
        } catch (error) {
            console.error('Failed to load relation type rules:', error);
            const container = document.getElementById('relation-type-rules-container');
            if (container) {
                container.innerHTML = '<p class="error">Kunde inte ladda relationsregler</p>';
            }
        }
    }

    renderRelationTypeRules() {
        const container = document.getElementById('relation-type-rules-container');
        if (!container) return;

        const previousTableState = this.relationRuleTableState
            || (this.relationTypeRuleTable ? {
                search: this.relationTypeRuleTable.state?.search || '',
                columnSearches: { ...(this.relationTypeRuleTable.state?.columnSearches || {}) },
                sortField: this.relationTypeRuleTable.state?.sortField || null,
                sortDirection: this.relationTypeRuleTable.state?.sortDirection || 'asc'
            } : null);

        container.innerHTML = `
            <div class="fields-section">
                <div class="section-header">
                    <h4>Fast relationstyp per objekttypspar</h4>
                </div>
                <p class="form-help">Redigera direkt i listan. Alla typkombinationer visas alltid.</p>
            </div>
            <div id="relation-type-rules-system-table"></div>
        `;

        const tableHost = document.getElementById('relation-type-rules-system-table');
        if (!tableHost) return;

        if (typeof SystemTable !== 'function') {
            tableHost.innerHTML = '<p class="error">SystemTable saknas</p>';
            return;
        }

        const rows = (this.relationTypeRules || []).map(rule => ({
            id: Number(rule.id),
            source_object_type_id: Number(rule.source_object_type_id),
            target_object_type_id: Number(rule.target_object_type_id),
            source_type: rule.source_object_type_name || '',
            target_type: rule.target_object_type_name || '',
            relation_type: rule.relation_type || '',
            is_allowed: rule.is_allowed !== false
        }));

        this.relationTypeRuleTable = new SystemTable({
            containerId: 'relation-type-rules-system-table',
            tableId: 'relation-type-rules-table',
            columns: [
                { field: 'id', label: 'ID', className: 'col-id' },
                { field: 'source_type', label: 'Källtyp', className: 'col-type', badge: 'type' },
                { field: 'target_type', label: 'Måltyp', className: 'col-type', badge: 'type' },
                {
                    field: 'relation_type',
                    label: 'Relationstyp',
                    className: 'col-relation-type',
                    render: (row) => {
                        const options = (this.availableRelationTypes || ['relaterad'])
                            .map(type => `
                                <option value="${escapeHtml(type)}" ${String(row.relation_type) === String(type) ? 'selected' : ''}>
                                    ${escapeHtml(type)}
                                </option>
                            `)
                            .join('');
                        return `
                            <select class="form-control relation-rule-inline-type" data-rule-id="${row.id}">
                                ${options}
                            </select>
                        `;
                    }
                },
                {
                    field: 'is_allowed',
                    label: 'Tillåten',
                    className: 'col-status',
                    render: (row) => `
                        <input
                            type="checkbox"
                            class="required-toggle relation-rule-inline-allowed"
                            data-rule-id="${row.id}"
                            ${row.is_allowed ? 'checked' : ''}
                            aria-label="Tillåt koppling för regel ${row.id}"
                        >
                    `
                }
            ],
            rows,
            emptyText: 'Inga relationsregler ännu',
            onRender: () => {
                tableHost.querySelectorAll('.relation-rule-inline-type').forEach(node => {
                    node.addEventListener('change', async () => {
                        const ruleId = Number(node.dataset.ruleId);
                        if (!Number.isFinite(ruleId)) return;
                        await this.updateRelationTypeRuleInline(ruleId, {
                            relation_type: String(node.value || '').trim().toLowerCase()
                        });
                    });
                });

                tableHost.querySelectorAll('.relation-rule-inline-allowed').forEach(node => {
                    node.addEventListener('change', async () => {
                        const ruleId = Number(node.dataset.ruleId);
                        if (!Number.isFinite(ruleId)) return;
                        await this.updateRelationTypeRuleInline(ruleId, {
                            is_allowed: Boolean(node.checked)
                        });
                    });
                });
            }
        });

        if (previousTableState) {
            this.relationTypeRuleTable.state.search = previousTableState.search || '';
            this.relationTypeRuleTable.state.columnSearches = {
                ...this.relationTypeRuleTable.state.columnSearches,
                ...(previousTableState.columnSearches || {})
            };
            this.relationTypeRuleTable.state.sortField = previousTableState.sortField || this.relationTypeRuleTable.state.sortField;
            this.relationTypeRuleTable.state.sortDirection = previousTableState.sortDirection || this.relationTypeRuleTable.state.sortDirection;
        }

        this.relationTypeRuleTable.render();
    }

    async updateRelationTypeRuleInline(ruleId, patch) {
        if (!Number.isFinite(ruleId)) return;
        const rule = (this.relationTypeRules || []).find(item => Number(item.id) === Number(ruleId));
        if (!rule) return;

        try {
            if (this.relationTypeRuleTable?.state) {
                this.relationRuleTableState = {
                    search: this.relationTypeRuleTable.state.search || '',
                    columnSearches: { ...(this.relationTypeRuleTable.state.columnSearches || {}) },
                    sortField: this.relationTypeRuleTable.state.sortField || null,
                    sortDirection: this.relationTypeRuleTable.state.sortDirection || 'asc'
                };
            }
            await RelationTypeRulesAPI.update(ruleId, {
                source_object_type_id: Number(rule.source_object_type_id),
                target_object_type_id: Number(rule.target_object_type_id),
                relation_type: String((patch?.relation_type ?? rule.relation_type) || 'relaterad').trim().toLowerCase(),
                is_allowed: patch?.is_allowed ?? (rule.is_allowed !== false)
            });
            await this.loadRelationTypeRules();
            this.relationRuleTableState = null;
        } catch (error) {
            console.error('Failed to inline update relation type rule:', error);
            showToast(error.message || 'Kunde inte uppdatera relationsregel', 'error');
            await this.loadRelationTypeRules();
            this.relationRuleTableState = null;
        }
    }

    renderFieldTemplates() {
        const container = document.getElementById('field-templates-container');
        if (!container) return;

        container.innerHTML = '<div id="field-templates-system-table"></div>';
        const tableHost = document.getElementById('field-templates-system-table');
        if (!tableHost) return;

        if (typeof SystemTable !== 'function') {
            tableHost.innerHTML = '<p class="error">SystemTable saknas</p>';
            return;
        }

        const rows = (this.fieldTemplates || []).map(item => ({
            id: Number(item.id),
            type: item.field_type || '',
            name: item.template_name || '',
            description: item.help_text || item.display_name || '',
            is_active: item.is_active !== false
        }));

        this.fieldTemplateTable = new SystemTable({
            containerId: 'field-templates-system-table',
            tableId: 'field-templates-table',
            columns: [
                { field: 'id', label: 'ID', className: 'col-id' },
                { field: 'type', label: 'Typ', className: 'col-type', badge: 'type' },
                { field: 'name', label: 'Namn', className: 'col-name' },
                { field: 'description', label: 'Beskrivning', className: 'col-description' },
                {
                    field: 'actions',
                    label: 'Actions',
                    className: 'col-actions',
                    sortable: false,
                    searchable: false,
                    render: (row) => `
                        <div class="list-actions-inline">
                            <button class="btn btn-sm btn-secondary field-template-edit-btn" data-template-id="${row.id}">Redigera</button>
                            <button class="btn btn-sm btn-danger field-template-delete-btn" data-template-id="${row.id}">Ta bort</button>
                        </div>
                    `
                }
            ],
            rows,
            emptyText: 'Inga fältmallar ännu',
            onRender: () => {
                tableHost.querySelectorAll('.field-template-edit-btn').forEach(btn => {
                    btn.addEventListener('click', (event) => {
                        event.stopPropagation();
                        this.showEditFieldTemplateModal(Number(btn.dataset.templateId));
                    });
                });
                tableHost.querySelectorAll('.field-template-delete-btn').forEach(btn => {
                    btn.addEventListener('click', (event) => {
                        event.stopPropagation();
                        this.deleteFieldTemplate(Number(btn.dataset.templateId));
                    });
                });
            }
        });

        this.fieldTemplateTable.render();
    }

    renderFieldTemplateOptions(selectedTemplateId = '') {
        const select = document.getElementById('field-template-select');
        if (!select) return;

        const currentValue = selectedTemplateId || select.value || '';
        select.innerHTML = '<option value="">Välj mall...</option>' +
            this.fieldTemplates
                .filter(template => template.is_active !== false)
                .map(template => `<option value="${template.id}">${escapeHtml(template.template_name)}</option>`)
                .join('');

        if (currentValue) {
            select.value = String(currentValue);
        }
    }

    applyFieldTemplate(templateId) {
        const id = Number(templateId);
        const requiredCheckbox = document.getElementById('field-required');
        if (!Number.isFinite(id) || id <= 0) {
            if (requiredCheckbox) requiredCheckbox.checked = false;
            return;
        }

        const template = this.fieldTemplates.find(item => Number(item.id) === id);
        if (!template) return;
        if (requiredCheckbox) requiredCheckbox.checked = Boolean(template.is_required);
    }

    showCreateFieldTemplateModal() {
        const modal = document.getElementById('field-template-modal');
        const overlay = document.getElementById('modal-overlay');
        const form = document.getElementById('field-template-form');
        if (!modal || !overlay || !form) return;

        form.reset();
        document.getElementById('field-template-modal-title').textContent = 'Skapa Fältmall';
        modal.dataset.mode = 'create';
        delete modal.dataset.templateId;
        modal.style.display = 'block';
        overlay.style.display = 'block';
    }

    showEditFieldTemplateModal(templateId) {
        const template = this.fieldTemplates.find(item => Number(item.id) === Number(templateId));
        if (!template) return;

        const modal = document.getElementById('field-template-modal');
        const overlay = document.getElementById('modal-overlay');
        const form = document.getElementById('field-template-form');
        if (!modal || !overlay || !form) return;

        const displayTranslations = this.normalizeFieldOptions(template.display_name_translations) || {};
        const helpTranslations = this.normalizeFieldOptions(template.help_text_translations) || {};

        document.getElementById('field-template-modal-title').textContent = 'Redigera Fältmall';
        document.getElementById('template-name').value = template.template_name || '';
        document.getElementById('template-field-name').value = template.field_name || '';
        document.getElementById('template-display-name').value = template.display_name || '';
        document.getElementById('template-display-name-sv').value = displayTranslations.sv || '';
        document.getElementById('template-display-name-en').value = displayTranslations.en || '';
        document.getElementById('template-field-type').value = template.field_type || 'text';
        document.getElementById('template-required').checked = Boolean(template.is_required);
        document.getElementById('template-lock-required').checked = Boolean(template.lock_required_setting);
        document.getElementById('template-force-presence').checked = Boolean(template.force_presence_on_all_objects);
        document.getElementById('template-table-visible').checked = template.is_table_visible !== false;
        document.getElementById('template-help-text').value = template.help_text || '';
        document.getElementById('template-help-text-sv').value = helpTranslations.sv || '';
        document.getElementById('template-help-text-en').value = helpTranslations.en || '';
        document.getElementById('template-options').value = typeof template.field_options === 'string'
            ? template.field_options
            : (template.field_options ? JSON.stringify(template.field_options) : '');

        modal.dataset.mode = 'edit';
        modal.dataset.templateId = String(template.id);
        modal.style.display = 'block';
        overlay.style.display = 'block';
    }

    async deleteFieldTemplate(templateId) {
        if (!Number.isFinite(templateId)) return;
        if (!confirm('Är du säker på att du vill ta bort fältmallen?')) return;

        try {
            await FieldTemplatesAPI.delete(templateId);
            showToast('Fältmall borttagen', 'success');
            await this.loadFieldTemplates();
        } catch (error) {
            console.error('Failed to delete field template:', error);
            showToast(error.message || 'Kunde inte ta bort fältmall', 'error');
        }
    }

    renderManagedLists() {
        const container = document.getElementById('managed-lists-container');
        if (!container) return;

        const selected = this.managedLists.find(list => list.id === this.selectedManagedListId) || null;

        container.innerHTML = `
            <div class="admin-content managed-lists-admin-content">
                <div class="types-list managed-lists-types-panel">
                    <h4>Listor (${this.managedLists.length})</h4>
                    <div class="category-toolbar managed-lists-toolbar">
                        <input id="new-managed-list-name" type="text" class="form-control" placeholder="Ny lista...">
                        <button class="btn btn-primary" onclick="adminManager.createManagedList()">Lägg till</button>
                    </div>
                    <div class="category-list managed-lists-type-list">
                        ${this.managedLists.length === 0
                            ? '<p class="empty-state">Inga listor ännu</p>'
                            : this.managedLists.map(list => `
                                <div class="category-item managed-list-type-item ${list.id === this.selectedManagedListId ? 'selected' : ''}" onclick="adminManager.selectManagedList(${list.id})">
                                    <span class="managed-list-type-name">${escapeHtml(list.name)}</span>
                                    <span class="managed-list-type-count">${Array.isArray(list.items) ? list.items.length : 0}</span>
                                    <div class="category-actions">
                                        <button class="btn-icon" onclick="event.stopPropagation(); adminManager.editManagedList(${list.id})" title="Redigera lista" aria-label="Redigera lista ${escapeHtml(list.name)}">✏️</button>
                                        <button class="btn-icon btn-danger" onclick="event.stopPropagation(); adminManager.deleteManagedList(${list.id})" title="Ta bort lista" aria-label="Ta bort lista ${escapeHtml(list.name)}">🗑️</button>
                                    </div>
                                </div>
                            `).join('')
                        }
                    </div>
                </div>
                <div class="type-details managed-lists-detail-panel">
                    ${selected ? this.renderManagedListDetails(selected) : '<p class="empty-state">Välj en lista</p>'}
                </div>
            </div>
        `;

        const newListInput = document.getElementById('new-managed-list-name');
        if (newListInput) {
            newListInput.addEventListener('keydown', (event) => {
                if (event.key !== 'Enter') return;
                event.preventDefault();
                this.createManagedList();
            });
        }

        const newItemInput = document.getElementById('new-managed-list-item-value');
        if (newItemInput) {
            newItemInput.addEventListener('keydown', (event) => {
                if (event.key !== 'Enter') return;
                event.preventDefault();
                this.createManagedListItem();
            });
        }
    }

    renderManagedListDetails(list) {
        const items = Array.isArray(list.items) ? list.items : [];
        return `
            <div class="type-detail-view managed-list-detail-view">
                <div class="detail-header">
                    <h3>${escapeHtml(list.name)}</h3>
                    <span class="managed-list-type-count">${items.length} rader</span>
                </div>
                <div class="managed-list-summary">
                    <span><strong>Status:</strong> ${list.is_active ? 'Aktiv' : 'Inaktiv'}</span>
                    <span><strong>Beskrivning:</strong></span>
                    <div class="managed-list-description-editor">
                        <input
                            id="managed-list-description-input"
                            type="text"
                            class="form-control"
                            value="${escapeHtml(list.description || '')}"
                            placeholder="Ingen beskrivning"
                            onkeydown="if(event.key === 'Enter'){ event.preventDefault(); adminManager.updateManagedListDescription(); }"
                        >
                        <button class="btn btn-sm btn-secondary" onclick="adminManager.updateManagedListDescription()">Spara</button>
                    </div>
                </div>
                <div class="fields-section managed-list-items-section">
                    <div class="section-header">
                        <h4>Rader</h4>
                    </div>
                    <div class="category-toolbar managed-lists-toolbar">
                        <input id="new-managed-list-item-value" type="text" class="form-control" placeholder="Nytt listvärde...">
                        <button class="btn btn-primary" onclick="adminManager.createManagedListItem()">Lägg till rad</button>
                    </div>
                    ${items.length === 0
                        ? '<p class="empty-state">Inga rader ännu</p>'
                        : `<div class="category-list managed-list-items-list">
                            ${items.map(item => `
                                <div class="category-item managed-list-item-row">
                                    <input
                                        type="text"
                                        class="form-control managed-list-item-input"
                                        value="${escapeHtml(item.value)}"
                                        data-item-id="${item.id}"
                                        data-original-value="${escapeHtml(item.value)}"
                                        onkeydown="if(event.key === 'Enter'){ event.preventDefault(); this.blur(); }"
                                        onblur="adminManager.updateManagedListItemInline(${item.id}, this)"
                                    >
                                    <div class="category-actions">
                                        <button class="btn-icon btn-danger" onclick="adminManager.deleteManagedListItem(${item.id})" title="Ta bort rad" aria-label="Ta bort rad ${escapeHtml(item.value)}">🗑️</button>
                                    </div>
                                </div>
                            `).join('')}
                        </div>`}
                </div>
            </div>
        `;
    }

    selectManagedList(listId) {
        this.selectedManagedListId = listId;
        this.renderManagedLists();
    }

    async createManagedList() {
        const input = document.getElementById('new-managed-list-name');
        const name = (input?.value || '').trim();
        if (!name) {
            showToast('Ange ett namn för listan', 'error');
            return;
        }

        try {
            const created = await ManagedListsAPI.create({ name });
            this.selectedManagedListId = created.id;
            if (input) input.value = '';
            showToast('Lista skapad', 'success');
            await this.loadManagedLists();
        } catch (error) {
            console.error('Failed to create managed list:', error);
            showToast(error.message || 'Kunde inte skapa lista', 'error');
        }
    }

    async editManagedList(listId) {
        const list = this.managedLists.find(item => item.id === listId);
        if (!list) return;

        const newName = prompt('Nytt namn på lista:', list.name);
        if (newName === null) return;
        const trimmed = newName.trim();
        if (!trimmed) {
            showToast('Namn kan inte vara tomt', 'error');
            return;
        }

        try {
            await ManagedListsAPI.update(listId, { name: trimmed });
            showToast('Lista uppdaterad', 'success');
            await this.loadManagedLists();
        } catch (error) {
            console.error('Failed to update managed list:', error);
            showToast(error.message || 'Kunde inte uppdatera lista', 'error');
        }
    }

    async deleteManagedList(listId) {
        if (!confirm('Är du säker på att du vill ta bort denna lista och alla dess rader?')) return;

        try {
            await ManagedListsAPI.delete(listId);
            showToast('Lista borttagen', 'success');
            await this.loadManagedLists();
        } catch (error) {
            console.error('Failed to delete managed list:', error);
            showToast(error.message || 'Kunde inte ta bort lista', 'error');
        }
    }

    async createManagedListItem() {
        if (!this.selectedManagedListId) {
            showToast('Välj en lista först', 'error');
            return;
        }

        const input = document.getElementById('new-managed-list-item-value');
        const value = (input?.value || '').trim();
        if (!value) {
            showToast('Ange ett värde för raden', 'error');
            return;
        }

        try {
            await ManagedListsAPI.addItem(this.selectedManagedListId, { value });
            if (input) input.value = '';
            showToast('Rad tillagd', 'success');
            await this.loadManagedLists();
        } catch (error) {
            console.error('Failed to create managed list item:', error);
            showToast(error.message || 'Kunde inte skapa rad', 'error');
        }
    }

    async editManagedListItem(itemId) {
        const list = this.managedLists.find(item => item.id === this.selectedManagedListId);
        const item = list?.items?.find(row => row.id === itemId);
        if (!item) return;

        const newValue = prompt('Nytt värde:', item.value);
        if (newValue === null) return;
        const trimmed = newValue.trim();
        if (!trimmed) {
            showToast('Värde kan inte vara tomt', 'error');
            return;
        }

        try {
            await ManagedListsAPI.updateItem(this.selectedManagedListId, itemId, { value: trimmed });
            showToast('Rad uppdaterad', 'success');
            await this.loadManagedLists();
        } catch (error) {
            console.error('Failed to update managed list item:', error);
            showToast(error.message || 'Kunde inte uppdatera rad', 'error');
        }
    }

    async updateManagedListDescription() {
        if (!this.selectedManagedListId) return;
        const input = document.getElementById('managed-list-description-input');
        if (!input) return;

        const list = this.managedLists.find(item => item.id === this.selectedManagedListId);
        if (!list) return;

        const nextDescription = (input.value || '').trim();
        const currentDescription = (list.description || '').trim();
        if (nextDescription === currentDescription) return;

        try {
            await ManagedListsAPI.update(this.selectedManagedListId, { description: nextDescription });
            list.description = nextDescription || null;
            showToast('Beskrivning uppdaterad', 'success');
            await this.loadManagedLists();
        } catch (error) {
            console.error('Failed to update managed list description:', error);
            showToast(error.message || 'Kunde inte uppdatera beskrivning', 'error');
            input.value = list.description || '';
        }
    }

    async updateManagedListItemInline(itemId, inputEl) {
        if (!this.selectedManagedListId || !inputEl) return;
        if (inputEl.dataset.saving === 'true') return;

        const list = this.managedLists.find(item => item.id === this.selectedManagedListId);
        const item = list?.items?.find(row => row.id === itemId);
        if (!item) return;

        const originalValue = (inputEl.dataset.originalValue || item.value || '').trim();
        const nextValue = (inputEl.value || '').trim();
        if (!nextValue || nextValue === originalValue) {
            inputEl.value = originalValue;
            return;
        }

        try {
            inputEl.dataset.saving = 'true';
            await ManagedListsAPI.updateItem(this.selectedManagedListId, itemId, { value: nextValue });
            inputEl.dataset.originalValue = nextValue;
            item.value = nextValue;
            await this.loadManagedLists();
        } catch (error) {
            console.error('Failed to inline-update managed list item:', error);
            showToast(error.message || 'Kunde inte uppdatera rad', 'error');
            inputEl.value = originalValue;
        } finally {
            inputEl.dataset.saving = 'false';
        }
    }

    async deleteManagedListItem(itemId) {
        if (!this.selectedManagedListId) return;

        try {
            await ManagedListsAPI.deleteItem(this.selectedManagedListId, itemId);
            showToast('Rad borttagen', 'success');
            await this.loadManagedLists();
        } catch (error) {
            console.error('Failed to delete managed list item:', error);
            showToast(error.message || 'Kunde inte ta bort rad', 'error');
        }
    }

    renderManagedListOptions() {
        const select = document.getElementById('managed-list-select');
        if (!select) return;
        const currentValue = select.value;
        select.innerHTML = '<option value=\"\">Välj lista...</option>' +
            this.managedLists
                .filter(list => list.is_active !== false)
                .map(list => `<option value=\"${list.id}\">${escapeHtml(list.name)}</option>`)
                .join('');
        if (currentValue) {
            select.value = currentValue;
        }
    }
    
    showCreateTypeModal() {
        const modal = document.getElementById('type-modal');
        const overlay = document.getElementById('modal-overlay');
        
        if (!modal || !overlay) return;
        
        document.getElementById('type-modal-title').textContent = 'Skapa Objekttyp';
        document.getElementById('type-form').reset();
        this.renderTypeColorOptions('', null);
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
        document.getElementById('type-prefix').value = type.id_prefix || '';
        this.renderTypeColorOptions(type.color || getObjectTypeColor(type.name), type.id);
        
        modal.dataset.mode = 'edit';
        modal.dataset.typeId = typeId;
        
        modal.style.display = 'block';
        overlay.style.display = 'block';
    }

    renderTypeColorOptions(selectedColor = '', currentTypeId = null) {
        const colorInput = document.getElementById('type-color');
        const paletteContainer = document.getElementById('type-color-palette');
        if (!colorInput || !paletteContainer) return;

        const fullPalette = typeof getObjectTypeColorPalette === 'function'
            ? getObjectTypeColorPalette()
            : ['#3498db', '#2ecc71', '#e74c3c', '#f39c12', '#9b59b6', '#1abc9c', '#34495e', '#95a5a6'];

        const usedByOtherTypes = new Set(
            (this.objectTypes || [])
                .filter(type => Number(type?.id) !== Number(currentTypeId))
                .map(type => String(type?.color || '').trim().toLowerCase())
                .filter(Boolean)
        );
        const palette = fullPalette.filter(color => !usedByOtherTypes.has(String(color).trim().toLowerCase()));

        const normalizedSelected = String(selectedColor || '').trim().toLowerCase();
        const fallbackColor = String(palette[0] || '').trim().toLowerCase();
        const activeColor = palette.some(color => String(color).trim().toLowerCase() === normalizedSelected)
            ? normalizedSelected
            : fallbackColor;

        colorInput.value = activeColor;

        if (!palette.length) {
            paletteContainer.innerHTML = '<p class="empty-state" style="padding: 0; margin: 0;">Inga lediga färger i paletten.</p>';
            return;
        }

        paletteContainer.innerHTML = palette.map(color => {
            const value = String(color).trim().toLowerCase();
            const isSelected = value === activeColor;
            return `
                <button
                    type="button"
                    class="type-color-swatch ${isSelected ? 'selected' : ''}"
                    data-color="${value}"
                    style="--swatch-color: ${value};"
                    role="radio"
                    aria-checked="${isSelected ? 'true' : 'false'}"
                    aria-label="Välj färg"
                ></button>
            `;
        }).join('');

        paletteContainer.querySelectorAll('.type-color-swatch').forEach(button => {
            button.addEventListener('click', () => {
                const nextColor = String(button.dataset.color || '').trim().toLowerCase();
                if (!nextColor) return;
                colorInput.value = nextColor;
                paletteContainer.querySelectorAll('.type-color-swatch').forEach(swatch => {
                    const selected = swatch === button;
                    swatch.classList.toggle('selected', selected);
                    swatch.setAttribute('aria-checked', selected ? 'true' : 'false');
                });
            });
        });

        if (!colorInput.value && palette.length > 0) {
            colorInput.value = fallbackColor;
        }
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
    
    showAddFieldModal(focusTemplateSelect = false) {
        if (!this.selectedType) return;
        
        const modal = document.getElementById('field-modal');
        const overlay = document.getElementById('modal-overlay');
        
        if (!modal || !overlay) return;
        
        document.getElementById('field-modal-title').textContent = 'Lägg till Fält';
        document.getElementById('field-form').reset();
        this.renderFieldTemplateOptions('');
        const templateSelect = document.getElementById('field-template-select');
        if (templateSelect) templateSelect.value = '';
        modal.dataset.mode = 'create';
        modal.dataset.typeId = this.selectedType.id;
        delete modal.dataset.fieldId;
        if (templateSelect) templateSelect.disabled = false;
        
        modal.style.display = 'block';
        overlay.style.display = 'block';

        if (focusTemplateSelect && templateSelect) {
            templateSelect.focus();
        }
    }
    
    editField(fieldId) {
        if (!this.selectedType) return;
        
        const field = this.selectedType.fields.find(f => f.id === fieldId);
        if (!field) return;
        
        const modal = document.getElementById('field-modal');
        const overlay = document.getElementById('modal-overlay');
        
        if (!modal || !overlay) return;
        
        document.getElementById('field-modal-title').textContent = 'Redigera Fält';
        this.renderFieldTemplateOptions('');
        const templateSelect = document.getElementById('field-template-select');
        if (templateSelect) {
            templateSelect.value = field.field_template_id ? String(field.field_template_id) : '';
            templateSelect.disabled = true;
        }
        document.getElementById('field-required').checked = field.is_required;
        
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

    async toggleFieldRequired(fieldId, isRequired) {
        if (!this.selectedType) return;
        const field = (this.selectedType.fields || []).find(item => Number(item.id) === Number(fieldId));
        if (!field) return;
        if (field.lock_required_setting) {
            this.renderTypeDetails();
            return;
        }

        try {
            await ObjectTypesAPI.updateField(this.selectedType.id, fieldId, { is_required: Boolean(isRequired) });
            field.is_required = Boolean(isRequired);
            this.renderTypeDetails();
        } catch (error) {
            console.error('Failed to toggle required setting:', error);
            showToast(error.message || 'Kunde inte uppdatera obligatoriskt', 'error');
            this.renderTypeDetails();
        }
    }

    async updateFieldDetailWidth(fieldId, detailWidth) {
        if (!this.selectedType) return;
        const allowed = new Set(['full', 'half', 'third']);
        if (!allowed.has(detailWidth)) return;

        const field = (this.selectedType.fields || []).find(item => Number(item.id) === Number(fieldId));
        if (!field) return;
        if (field.detail_width === detailWidth) return;

        try {
            await ObjectTypesAPI.updateField(this.selectedType.id, fieldId, { detail_width: detailWidth });
            field.detail_width = detailWidth;
        } catch (error) {
            console.error('Failed to update field detail width:', error);
            showToast(error.message || 'Kunde inte uppdatera fältbredd', 'error');
            this.renderTypeDetails();
        }
    }

    attachFieldRowDragAndDrop() {
        const tbody = document.querySelector('#type-details-container .admin-fields-table tbody');
        if (!tbody) return;

        let draggingRow = null;

        tbody.querySelectorAll('tr[data-field-id]').forEach(row => {
            row.addEventListener('dragstart', (event) => {
                draggingRow = row;
                row.classList.add('dragging');
                if (event.dataTransfer) {
                    event.dataTransfer.effectAllowed = 'move';
                    event.dataTransfer.setData('text/plain', row.dataset.fieldId || '');
                }
            });

            row.addEventListener('dragend', async () => {
                row.classList.remove('dragging');
                draggingRow = null;
                await this.persistFieldOrderFromRows(tbody);
            });
        });

        tbody.addEventListener('dragover', (event) => {
            event.preventDefault();
            if (!draggingRow) return;

            const rows = [...tbody.querySelectorAll('tr[data-field-id]:not(.dragging)')];
            const nextRow = rows.find(candidate => {
                const rect = candidate.getBoundingClientRect();
                return event.clientY < rect.top + rect.height / 2;
            });

            if (nextRow) {
                tbody.insertBefore(draggingRow, nextRow);
            } else {
                tbody.appendChild(draggingRow);
            }
        });
    }

    async persistFieldOrderFromRows(tbody) {
        if (!this.selectedType || !tbody) return;
        const orderedIds = [...tbody.querySelectorAll('tr[data-field-id]')]
            .map(row => Number(row.dataset.fieldId))
            .filter(id => Number.isFinite(id));

        if (orderedIds.length === 0) return;

        const currentOrder = (this.selectedType.fields || [])
            .slice()
            .sort((a, b) => (a.display_order || 9999) - (b.display_order || 9999))
            .map(field => Number(field.id));

        const changed = orderedIds.length === currentOrder.length
            ? orderedIds.some((id, idx) => id !== currentOrder[idx])
            : true;
        if (!changed) return;

        try {
            await Promise.all(orderedIds.map((fieldId, index) =>
                ObjectTypesAPI.updateField(this.selectedType.id, fieldId, { display_order: index + 1 })
            ));
            await this.loadObjectTypes();
            this.selectType(this.selectedType.id);
        } catch (error) {
            console.error('Failed to persist field order:', error);
            showToast(error.message || 'Kunde inte spara fältordning', 'error');
            await this.loadObjectTypes();
            this.selectType(this.selectedType.id);
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
        } else if (tabName === 'managed-lists') {
            document.getElementById('managed-lists-tab').classList.add('active');
        } else if (tabName === 'field-templates') {
            document.getElementById('field-templates-tab').classList.add('active');
        } else if (tabName === 'relation-type-rules') {
            document.getElementById('relation-type-rules-tab').classList.add('active');
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
        id_prefix: document.getElementById('type-prefix').value,
        color: document.getElementById('type-color')?.value || null
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
        if (typeof setObjectTypeColorMapFromTypes === 'function') {
            setObjectTypeColorMapFromTypes(adminManager.objectTypes);
        }
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
    
    const selectedTemplateId = Number(document.getElementById('field-template-select')?.value || 0);
    let data = null;

    if (mode === 'create') {
        if (!Number.isFinite(selectedTemplateId) || selectedTemplateId <= 0) {
            showToast('Du måste välja en fältmall', 'error');
            return;
        }
        data = {
            field_template_id: selectedTemplateId,
            is_required: document.getElementById('field-required').checked
        };
    } else {
        data = {
            is_required: document.getElementById('field-required').checked
        };
    }
    
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

async function saveFieldTemplate(event) {
    event.preventDefault();

    const modal = document.getElementById('field-template-modal');
    const mode = modal?.dataset?.mode || 'create';
    const templateId = Number(modal?.dataset?.templateId || 0);

    const fieldTypeValue = document.getElementById('template-field-type')?.value || 'text';
    const rawOptions = document.getElementById('template-options')?.value || '';

    let templateOptions = rawOptions;
    if (typeof rawOptions === 'string') {
        const trimmed = rawOptions.trim();
        if (!trimmed) {
            templateOptions = '';
        } else if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
            try {
                templateOptions = JSON.parse(trimmed);
            } catch (_error) {
                templateOptions = rawOptions;
            }
        }
    }

    const data = {
        template_name: document.getElementById('template-name').value,
        field_name: document.getElementById('template-field-name').value,
        display_name: document.getElementById('template-display-name').value,
        display_name_translations: {
            sv: document.getElementById('template-display-name-sv').value,
            en: document.getElementById('template-display-name-en').value
        },
        field_type: fieldTypeValue,
        field_options: templateOptions,
        is_required: document.getElementById('template-required').checked,
        lock_required_setting: document.getElementById('template-lock-required').checked,
        force_presence_on_all_objects: document.getElementById('template-force-presence').checked,
        is_table_visible: document.getElementById('template-table-visible').checked,
        help_text: document.getElementById('template-help-text').value,
        help_text_translations: {
            sv: document.getElementById('template-help-text-sv').value,
            en: document.getElementById('template-help-text-en').value
        },
        is_active: true
    };

    try {
        if (mode === 'edit' && Number.isFinite(templateId) && templateId > 0) {
            await FieldTemplatesAPI.update(templateId, data);
            showToast('Fältmall uppdaterad', 'success');
        } else {
            await FieldTemplatesAPI.create(data);
            showToast('Fältmall skapad', 'success');
        }

        closeModal();
        await adminManager.loadFieldTemplates();
    } catch (error) {
        console.error('Failed to save field template:', error);
        showToast(error.message || 'Kunde inte spara fältmall', 'error');
    }
}
