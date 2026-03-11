/**
 * Object Type Manager - Admin Interface
 * Manages object types and their fields
 */

const objectTypeManagerTextCollator = new Intl.Collator('sv', {
    sensitivity: 'base',
    numeric: true,
    ignorePunctuation: true
});

class ObjectTypeManager {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.objectTypes = [];
        this.selectedType = null;
        this.managedLists = [];
        this.fieldTemplates = [];
        this.relationTypeRules = [];
        this.relationTypes = [];
        this.availableRelationTypes = ['uses_object'];
        this.selectedManagedListId = null;
        this.fieldModalTypeListenerAttached = false;
        this.fieldTemplateModalBehaviorAttached = false;
        this.relationRuleTableState = null;
        this.managedListLanguageUpdatePromise = Promise.resolve();
        this.managedListLinks = [];
        this.managedListItemLinks = [];
        this.selectedManagedListTreeNodeId = null;
        this.selectedManagedListTreeNodeIds = new Set();
        this.managedListTreeSelectionAnchorId = null;
        this.managedListVisibleNodeOrder = [];
        this.managedListTreeExpandedNodeIds = new Set();
        this.managedListInlineCreateParentId = null;
        this.selectedManagedListDetail = null;
        this.fieldListBindings = [];
        this.managedListsOverviewTable = null;
        this.fieldBindingsTable = null;
        this.managedListWorkspaceOpen = false;
        this.managedListDraggedNodeIds = [];
        this.fieldHierarchySettingsAttached = false;
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
                        Fält
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
                            <h3>Fält</h3>
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
        this.setupFieldHierarchySettingsBehavior();
        this.setupFieldTemplateModalBehavior();
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
            const nextNumber = Number(type.next_base_id_number) || 1;
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

                <div class="type-description-block">
                    <span class="detail-label">Beskrivning</span>
                    <span class="detail-value">${this.selectedType.description || 'N/A'}</span>
                </div>
                
                <div class="detail-grid">
                    <div class="detail-item">
                        <span class="detail-label">ID-prefix</span>
                        <span class="detail-value">${this.selectedType.id_prefix || 'AUTO'}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">Nästa ID-nummer</span>
                        <span class="detail-value">${this.selectedType.next_base_id_number || 1}</span>
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
                                        <th class="col-type">Typ</th>
                                        <th class="col-field-name">Fältnamn</th>
                                        <th class="col-status">Obligatorisk</th>
                                        <th class="col-detail-visible">Detaljvy</th>
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
        return `
            <tr data-field-id="${field.id}" draggable="true">
                <td class="col-name">
                    <span class="field-drag-handle" title="Dra för att ändra ordning" aria-hidden="true">⋮⋮</span>
                    <strong>${escapeHtml(nameLabel)}</strong>
                </td>
                <td class="col-type">
                    ${escapeHtml(this.getFieldTypeLabel(field))}
                </td>
                <td class="col-field-name">
                    <code>${escapeHtml(field.field_name || '')}</code>
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
                <td class="col-detail-visible">
                    <input
                        type="checkbox"
                        class="required-toggle"
                        ${field.is_detail_visible !== false ? 'checked' : ''}
                        onchange="adminManager.toggleFieldDetailVisible(${field.id}, this.checked)"
                        aria-label="Visa i detaljvy för ${escapeHtml(nameLabel)}"
                        title="Visa/dölj fält i detaljvy"
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
                    <div class="list-actions-inline">
                        <button
                            class="btn btn-sm btn-primary"
                            onclick="adminManager.editField(${field.id})"
                            title="Redigera fältinställningar"
                            aria-label="Redigera fält ${escapeHtml(nameLabel)}"
                        >Redigera</button>
                        <button
                            class="btn-icon btn-danger"
                            onclick="adminManager.deleteField(${field.id})"
                            ${canDelete ? '' : 'disabled'}
                            title="${canDelete ? 'Ta bort fält' : 'Detta fält kan inte tas bort'}"
                            aria-label="Ta bort fält ${escapeHtml(nameLabel)}"
                        >🗑️</button>
                    </div>
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
        return String(field?.field_type || '');
    }

    isManagedListSelectField(field) {
        if (!field || String(field.field_type || '').toLowerCase() !== 'select') return false;
        const options = this.normalizeFieldOptions(field.field_options);
        return options?.source === 'managed_list' && Number.isFinite(Number(options?.list_id));
    }

    renderFieldDependencyControl(field) {
        if (!this.selectedType || !this.isManagedListSelectField(field)) return '-';
        const options = this.normalizeFieldOptions(field.field_options) || {};
        const currentParentField = String(options.parent_field_name || '');
        const candidates = (this.selectedType.fields || [])
            .filter(candidate => Number(candidate.id) !== Number(field.id))
            .filter(candidate => this.isManagedListSelectField(candidate));

        if (!candidates.length) {
            return '<span class="managed-list-link-empty">Inga kandidater</span>';
        }

        return `
            <select class="form-control detail-width-select" onchange="adminManager.updateFieldManagedListDependency(${field.id}, this.value)">
                <option value="">Ingen</option>
                ${candidates.map(candidate => {
                    const selected = String(candidate.field_name) === currentParentField ? 'selected' : '';
                    const label = escapeHtml(candidate.display_name || candidate.field_name);
                    return `<option value="${escapeHtml(String(candidate.field_name))}" ${selected}>${label}</option>`;
                }).join('')}
            </select>
        `;
    }

    async updateFieldManagedListDependency(fieldId, parentFieldName) {
        if (!this.selectedType) return;
        const field = (this.selectedType.fields || []).find(item => Number(item.id) === Number(fieldId));
        if (!field || !this.isManagedListSelectField(field)) return;

        const rawOptions = this.normalizeFieldOptions(field.field_options) || {};
        const nextOptions = {
            source: 'managed_list',
            list_id: Number(rawOptions.list_id)
        };
        if (rawOptions.selection_mode === 'multi' || rawOptions.selection_mode === 'single') {
            nextOptions.selection_mode = rawOptions.selection_mode;
        }
        if ('allow_only_leaf_selection' in rawOptions) {
            nextOptions.allow_only_leaf_selection = Boolean(rawOptions.allow_only_leaf_selection);
        }
        const hierarchyLevelCount = Number(rawOptions.hierarchy_level_count || 0);
        if (Number.isFinite(hierarchyLevelCount) && hierarchyLevelCount > 1) {
            nextOptions.hierarchy_level_count = Math.min(8, Math.max(2, Math.floor(hierarchyLevelCount)));
        }
        if (Array.isArray(rawOptions.hierarchy_level_labels)) {
            const labels = rawOptions.hierarchy_level_labels
                .map(label => String(label || '').trim())
                .filter(Boolean)
                .slice(0, 8);
            if (labels.length) {
                nextOptions.hierarchy_level_labels = labels;
            }
        }

        const normalizedParentFieldName = String(parentFieldName || '').trim();
        if (normalizedParentFieldName) {
            const parentField = (this.selectedType.fields || []).find(
                item => String(item.field_name || '') === normalizedParentFieldName && this.isManagedListSelectField(item)
            );
            if (!parentField) {
                showToast('Ogiltigt parent-fält', 'error');
                this.renderTypeDetails();
                return;
            }

            const parentOptions = this.normalizeFieldOptions(parentField.field_options) || {};
            const parentListId = Number(parentOptions.list_id);
            const childListId = Number(rawOptions.list_id);

            nextOptions.parent_field_name = normalizedParentFieldName;
            if (Number.isFinite(parentListId) && parentListId > 0) {
                nextOptions.parent_list_id = parentListId;
            }

            const link = (this.managedListLinks || []).find(candidate =>
                Number(candidate.parent_list_id) === parentListId &&
                Number(candidate.child_list_id) === childListId &&
                candidate.is_active !== false
            );
            if (link && Number.isFinite(Number(link.id))) {
                nextOptions.list_link_id = Number(link.id);
            }
        }

        try {
            await ObjectTypesAPI.updateField(this.selectedType.id, fieldId, { field_options: nextOptions });
            field.field_options = nextOptions;
            showToast('Fältberoende uppdaterat', 'success');
            this.renderTypeDetails();
        } catch (error) {
            console.error('Failed to update field managed-list dependency:', error);
            showToast(error.message || 'Kunde inte uppdatera fältberoende', 'error');
            this.renderTypeDetails();
        }
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

    setupFieldTemplateModalBehavior() {
        if (this.fieldTemplateModalBehaviorAttached) return;

        const fieldTypeSelect = document.getElementById('template-field-type');
        const optionSourceSelect = document.getElementById('template-option-source');
        if (fieldTypeSelect) {
            fieldTypeSelect.addEventListener('change', () => this.updateFieldTemplateOptionInputs());
        }
        if (optionSourceSelect) {
            optionSourceSelect.addEventListener('change', () => this.updateFieldTemplateOptionInputs());
        }

        this.fieldTemplateModalBehaviorAttached = true;
        this.updateFieldTemplateOptionInputs();
    }

    renderFieldTemplateManagedListOptions(selectedListId = '') {
        const select = document.getElementById('template-managed-list-select');
        if (!select) return;

        const currentValue = selectedListId || select.value || '';
        select.innerHTML = '<option value="">Välj lista...</option>' +
            this.managedLists
                .filter(list => list.is_active !== false)
                .map(list => `<option value="${list.id}">${escapeHtml(list.name)}</option>`)
                .join('');

        if (currentValue) {
            select.value = String(currentValue);
        }
    }

    updateFieldTemplateOptionInputs() {
        const fieldTypeSelect = document.getElementById('template-field-type');
        const sourceSelect = document.getElementById('template-option-source');
        const sourceGroup = document.getElementById('template-option-source-group');
        const customGroup = document.getElementById('template-options-custom-group');
        const managedGroup = document.getElementById('template-options-managed-group');

        if (!fieldTypeSelect || !sourceSelect) return;

        const isSelectType = String(fieldTypeSelect.value || '').toLowerCase() === 'select';
        const source = String(sourceSelect.value || 'custom').toLowerCase();

        if (sourceGroup) sourceGroup.style.display = isSelectType ? '' : 'none';
        if (customGroup) customGroup.style.display = (isSelectType && source === 'custom') ? '' : 'none';
        if (managedGroup) managedGroup.style.display = (isSelectType && source === 'managed_list') ? '' : 'none';
    }

    setFieldTemplateOptionsFromTemplate(template) {
        const fieldType = String(template?.field_type || 'text').toLowerCase();
        const sourceSelect = document.getElementById('template-option-source');
        const customOptionsInput = document.getElementById('template-options');
        const managedListSelect = document.getElementById('template-managed-list-select');
        if (!sourceSelect || !customOptionsInput) return;

        const rawOptions = template?.field_options;
        const normalizedOptions = this.normalizeFieldOptions(rawOptions);

        sourceSelect.value = 'custom';
        customOptionsInput.value = '';
        if (managedListSelect) managedListSelect.value = '';

        if (fieldType !== 'select') {
            customOptionsInput.value = typeof rawOptions === 'string'
                ? rawOptions
                : (rawOptions ? JSON.stringify(rawOptions) : '');
            this.updateFieldTemplateOptionInputs();
            return;
        }

        if (normalizedOptions?.source === 'managed_list') {
            sourceSelect.value = 'managed_list';
            const listId = Number(normalizedOptions?.list_id);
            this.renderFieldTemplateManagedListOptions(Number.isFinite(listId) && listId > 0 ? String(listId) : '');
            this.updateFieldTemplateOptionInputs();
            return;
        }

        customOptionsInput.value = typeof rawOptions === 'string'
            ? rawOptions
            : (rawOptions ? JSON.stringify(rawOptions) : '');
        this.updateFieldTemplateOptionInputs();
    }

    buildFieldTemplateOptions(fieldTypeValue) {
        const normalizedType = String(fieldTypeValue || '').trim().toLowerCase();
        const sourceValue = String(document.getElementById('template-option-source')?.value || 'custom').trim().toLowerCase();
        const rawOptions = document.getElementById('template-options')?.value || '';
        const managedListIdRaw = document.getElementById('template-managed-list-select')?.value || '';

        if (normalizedType === 'select') {
            if (sourceValue === 'managed_list') {
                const managedListId = Number(managedListIdRaw);
                if (!Number.isFinite(managedListId) || managedListId <= 0) {
                    return { error: 'Välj en färdig lista för dropdown-fältet' };
                }
                return { value: { source: 'managed_list', list_id: managedListId } };
            }
        }

        if (typeof rawOptions === 'string') {
            const trimmed = rawOptions.trim();
            if (!trimmed) return { value: '' };
            if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
                try {
                    return { value: JSON.parse(trimmed) };
                } catch (_error) {
                    return { value: rawOptions };
                }
            }
        }

        return { value: rawOptions };
    }

    async loadManagedLists() {
        try {
            const [managedLists, fieldBindings] = await Promise.all([
                ListsAPI.getAll({ include_inactive: true }),
                FieldBindingsAPI.getAll(),
            ]);
            this.managedLists = Array.isArray(managedLists) ? managedLists : [];
            this.fieldListBindings = Array.isArray(fieldBindings) ? fieldBindings : [];
            if (!this.selectedManagedListId && this.managedLists.length) {
                this.selectedManagedListId = this.managedLists[0].id;
            }
            if (this.selectedManagedListId && !this.managedLists.some(list => list.id === this.selectedManagedListId)) {
                this.selectedManagedListId = this.managedLists.length ? this.managedLists[0].id : null;
            }
            if (this.selectedManagedListId) {
                this.selectedManagedListDetail = await ListsAPI.getById(this.selectedManagedListId, true, true);
            } else {
                this.selectedManagedListDetail = null;
            }
            if (this.selectedManagedListId) {
                const selectedList = this.selectedManagedListDetail;
                const hasSelectedNode = (selectedList?.items || []).some(
                    item => Number(item.id) === Number(this.selectedManagedListTreeNodeId)
                );
                const validNodeIds = new Set((selectedList?.items || []).map(item => Number(item.id)));
                this.managedListTreeExpandedNodeIds = new Set(
                    Array.from(this.managedListTreeExpandedNodeIds || []).filter(id => validNodeIds.has(Number(id)))
                );
                this.selectedManagedListTreeNodeIds = new Set(
                    Array.from(this.selectedManagedListTreeNodeIds || []).filter(id => validNodeIds.has(Number(id)))
                );
                if (!hasSelectedNode) {
                    this.selectedManagedListTreeNodeId = null;
                }
                if (this.selectedManagedListTreeNodeId && !this.selectedManagedListTreeNodeIds.has(Number(this.selectedManagedListTreeNodeId))) {
                    this.selectedManagedListTreeNodeIds.add(Number(this.selectedManagedListTreeNodeId));
                }
            } else {
                this.selectedManagedListTreeNodeId = null;
                this.selectedManagedListTreeNodeIds = new Set();
                this.managedListTreeSelectionAnchorId = null;
                this.managedListTreeExpandedNodeIds = new Set();
            }
            this.renderManagedLists();
            if (this.managedListWorkspaceOpen && this.selectedManagedListDetail) {
                this.renderManagedListWorkspaceOverlay(this.selectedManagedListDetail);
            } else if (!this.managedListWorkspaceOpen) {
                this.closeManagedListWorkspace();
            }
            this.renderManagedListOptions();
            this.renderFieldTemplateManagedListOptions();
            this.updateFieldTemplateOptionInputs();
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
            this.relationTypes = Array.isArray(response?.relation_types) ? response.relation_types : [];
            this.availableRelationTypes = Array.isArray(response?.available_relation_types) && response.available_relation_types.length
                ? response.available_relation_types
                : ['uses_object'];
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
            <div class="relation-rules-layout">
                <div class="relation-rules-column relation-rules-left">
                    <div class="fields-section">
                        <div class="section-header">
                            <h4>Objektpar</h4>
                        </div>
                        <p class="form-help">Välj Source, Relationstyp och Target för varje objekttyp-par. En riktning är tillåten åt gången.</p>
                    </div>
                    <div id="relation-type-rules-system-table"></div>
                </div>
                <div class="relation-rules-column relation-rules-right">
                    <div class="fields-section">
                        <div class="section-header">
                            <h4>Relationstyper</h4>
                        </div>
                        <p class="form-help">Lista över alla tillgängliga relationstyper och deras beskrivningar.</p>
                    </div>
                    <div id="relation-types-system-table"></div>
                </div>
            </div>
        `;

        const relationTypesHost = document.getElementById('relation-types-system-table');
        const tableHost = document.getElementById('relation-type-rules-system-table');
        if (!relationTypesHost || !tableHost) return;

        if (typeof SystemTable !== 'function') {
            relationTypesHost.innerHTML = '<p class="error">SystemTable saknas</p>';
            tableHost.innerHTML = '<p class="error">SystemTable saknas</p>';
            return;
        }

        const relationTypeRows = (this.relationTypes || []).map(item => ({
            key: item.key || '',
            display_name: item.display_name || '',
            description: item.description || ''
        }));

        this.relationTypesTable = new SystemTable({
            containerId: 'relation-types-system-table',
            tableId: 'relation-types-table',
            columns: [
                { field: 'key', label: 'Key', className: 'col-id' },
                { field: 'display_name', label: 'Namn', className: 'col-name' },
                { field: 'description', label: 'Beskrivning', className: 'col-description', multiline: true }
            ],
            rows: relationTypeRows,
            emptyText: 'Inga relationstyper hittades'
        });
        this.relationTypesTable.render();

        const rows = this.buildRelationPairRows();
        const fallbackRelationType = String((this.availableRelationTypes || [])[0] || 'uses_object').trim().toLowerCase() || 'uses_object';
        const availableTypes = (this.availableRelationTypes || [fallbackRelationType])
            .map(type => String(type || '').trim().toLowerCase())
            .filter(Boolean);
        const relationTypeMetaByKey = new Map(
            (this.relationTypes || [])
                .map(item => [String(item.key || '').trim().toLowerCase(), item])
        );

        this.relationTypeRuleTable = new SystemTable({
            containerId: 'relation-type-rules-system-table',
            tableId: 'relation-type-rules-table',
            columns: [
                {
                    field: 'pair_label',
                    label: 'Objektpar',
                    className: 'col-name',
                    render: (row) => {
                        const options = Array.isArray(row.pair_type_options) ? row.pair_type_options : [];
                        const optionById = new Map(options.map(option => [Number(option.id), option]));
                        const source = optionById.get(Number(row.source_object_type_id)) || { name: '-' };
                        const target = optionById.get(Number(row.target_object_type_id)) || { name: '-' };
                        const sourceColor = getObjectTypeColor(source.name);
                        const targetColor = getObjectTypeColor(target.name);
                        return `
                            <div class="relation-pair-badges">
                                <span class="object-type-badge" style="background-color: ${sourceColor}">${escapeHtml(source.name)}</span>
                                <span class="relation-pair-separator">→</span>
                                <span class="object-type-badge" style="background-color: ${targetColor}">${escapeHtml(target.name)}</span>
                            </div>
                        `;
                    }
                },
                {
                    field: 'source_object_type_id',
                    label: 'Source',
                    className: 'col-type',
                    render: (row) => {
                        const options = row.pair_type_options
                            .map(option => `
                                <option value="${option.id}" ${Number(row.source_object_type_id) === Number(option.id) ? 'selected' : ''}>
                                    ${escapeHtml(option.name)}
                                </option>
                            `)
                            .join('');
                        return `<select class="form-control relation-rule-inline-source relation-rule-inline-direction" data-pair-key="${escapeHtml(row.pair_key)}">${options}</select>`;
                    }
                },
                {
                    field: 'relation_type',
                    label: 'Relationstyp',
                    className: 'col-relation-type',
                    render: (row) => {
                        const normalizedType = String(row.relation_type || '').trim().toLowerCase();
                        const selectValue = row.is_blocked || !normalizedType ? '__blocked__' : normalizedType;
                        const typeOptions = availableTypes.map(type => `
                            <option value="${escapeHtml(type)}" ${selectValue === type ? 'selected' : ''}>
                                ${escapeHtml(String(relationTypeMetaByKey.get(type)?.display_name || type))}
                            </option>
                        `).join('');

                        const options = `
                            <option value="__blocked__" ${selectValue === '__blocked__' ? 'selected' : ''}>
                                Spärrad (inte möjlig)
                            </option>
                            ${typeOptions}
                        `;
                        return `
                            <select class="form-control relation-rule-inline-type" data-pair-key="${escapeHtml(row.pair_key)}">
                                ${options}
                            </select>
                        `;
                    }
                },
                {
                    field: 'target_object_type_id',
                    label: 'Target',
                    className: 'col-type',
                    render: (row) => {
                        const options = row.pair_type_options
                            .map(option => `
                                <option value="${option.id}" ${Number(row.target_object_type_id) === Number(option.id) ? 'selected' : ''}>
                                    ${escapeHtml(option.name)}
                                </option>
                            `)
                            .join('');
                        return `<select class="form-control relation-rule-inline-target relation-rule-inline-direction" data-pair-key="${escapeHtml(row.pair_key)}">${options}</select>`;
                    }
                }
            ],
            rows,
            emptyText: 'Inga relationsregler ännu',
            onRender: () => {
                tableHost.querySelectorAll('.relation-rule-inline-source').forEach(node => {
                    node.addEventListener('change', async () => {
                        const pairKey = String(node.dataset.pairKey || '');
                        const sourceId = Number(node.value);
                        const targetNode = tableHost.querySelector(`.relation-rule-inline-target[data-pair-key="${CSS.escape(pairKey)}"]`);
                        const typeNode = tableHost.querySelector(`.relation-rule-inline-type[data-pair-key="${CSS.escape(pairKey)}"]`);
                        if (!targetNode || !typeNode) return;

                        let targetId = Number(targetNode.value);
                        if (sourceId === targetId) {
                            const row = rows.find(item => item.pair_key === pairKey);
                            const alternate = (row?.pair_type_options || []).find(item => Number(item.id) !== sourceId);
                            targetId = Number(alternate?.id);
                            if (!Number.isFinite(targetId)) return;
                            targetNode.value = String(targetId);
                        }

                        const selectedValue = String(typeNode.value || '').trim().toLowerCase();
                        if (selectedValue === '__blocked__') {
                            await this.updateRelationTypePairInline(pairKey, sourceId, targetId, fallbackRelationType, { blocked: true });
                            return;
                        }
                        await this.updateRelationTypePairInline(pairKey, sourceId, targetId, selectedValue, { blocked: false });
                    });
                });

                tableHost.querySelectorAll('.relation-rule-inline-target').forEach(node => {
                    node.addEventListener('change', async () => {
                        const pairKey = String(node.dataset.pairKey || '');
                        const targetId = Number(node.value);
                        const sourceNode = tableHost.querySelector(`.relation-rule-inline-source[data-pair-key="${CSS.escape(pairKey)}"]`);
                        const typeNode = tableHost.querySelector(`.relation-rule-inline-type[data-pair-key="${CSS.escape(pairKey)}"]`);
                        if (!sourceNode || !typeNode) return;

                        let sourceId = Number(sourceNode.value);
                        if (sourceId === targetId) {
                            const row = rows.find(item => item.pair_key === pairKey);
                            const alternate = (row?.pair_type_options || []).find(item => Number(item.id) !== targetId);
                            sourceId = Number(alternate?.id);
                            if (!Number.isFinite(sourceId)) return;
                            sourceNode.value = String(sourceId);
                        }

                        const selectedValue = String(typeNode.value || '').trim().toLowerCase();
                        if (selectedValue === '__blocked__') {
                            await this.updateRelationTypePairInline(pairKey, sourceId, targetId, fallbackRelationType, { blocked: true });
                            return;
                        }
                        await this.updateRelationTypePairInline(pairKey, sourceId, targetId, selectedValue, { blocked: false });
                    });
                });

                tableHost.querySelectorAll('.relation-rule-inline-type').forEach(node => {
                    node.addEventListener('change', async () => {
                        const pairKey = String(node.dataset.pairKey || '');
                        if (!pairKey) return;

                        const sourceNode = tableHost.querySelector(`.relation-rule-inline-source[data-pair-key="${CSS.escape(pairKey)}"]`);
                        const targetNode = tableHost.querySelector(`.relation-rule-inline-target[data-pair-key="${CSS.escape(pairKey)}"]`);
                        if (!sourceNode || !targetNode) return;

                        const sourceId = Number(sourceNode.value);
                        const targetId = Number(targetNode.value);
                        if (!Number.isFinite(sourceId) || !Number.isFinite(targetId) || sourceId === targetId) return;

                        const selectedValue = String(node.value || '').trim().toLowerCase();
                        if (selectedValue === '__blocked__') {
                            await this.updateRelationTypePairInline(pairKey, sourceId, targetId, fallbackRelationType, { blocked: true });
                            return;
                        }
                        await this.updateRelationTypePairInline(pairKey, sourceId, targetId, selectedValue, { blocked: false });
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

    buildRelationPairRows() {
        const objectTypeById = new Map((this.objectTypes || []).map(type => [Number(type.id), type]));
        const pairMap = new Map();

        (this.relationTypeRules || []).forEach(rule => {
            const sourceId = Number(rule.source_object_type_id);
            const targetId = Number(rule.target_object_type_id);
            if (!Number.isFinite(sourceId) || !Number.isFinite(targetId) || sourceId === targetId) return;

            const lowId = Math.min(sourceId, targetId);
            const highId = Math.max(sourceId, targetId);
            const pairKey = `${lowId}-${highId}`;

            if (!pairMap.has(pairKey)) {
                const lowType = objectTypeById.get(lowId);
                const highType = objectTypeById.get(highId);
                pairMap.set(pairKey, {
                    pair_key: pairKey,
                    pair_label: `${lowType?.name || `Typ ${lowId}`} ↔ ${highType?.name || `Typ ${highId}`}`,
                    pair_type_options: [
                        { id: lowId, name: lowType?.name || `Typ ${lowId}` },
                        { id: highId, name: highType?.name || `Typ ${highId}` }
                    ],
                    rules: []
                });
            }

            pairMap.get(pairKey).rules.push({
                id: Number(rule.id),
                source_object_type_id: sourceId,
                target_object_type_id: targetId,
                relation_type: String(rule.relation_type || '').trim().toLowerCase(),
                is_allowed: rule.is_allowed !== false
            });
        });

        return Array.from(pairMap.values()).map(pair => {
            const allowedRules = pair.rules.filter(item => item.is_allowed);
            const activeRule = allowedRules[0] || pair.rules[0] || null;

            return {
                pair_key: pair.pair_key,
                pair_label: pair.pair_label,
                pair_type_options: pair.pair_type_options,
                source_object_type_id: activeRule ? activeRule.source_object_type_id : pair.pair_type_options[0].id,
                target_object_type_id: activeRule ? activeRule.target_object_type_id : pair.pair_type_options[1].id,
                relation_type: activeRule?.relation_type || '',
                is_blocked: allowedRules.length === 0
            };
        }).sort((a, b) => objectTypeManagerTextCollator.compare(String(a.pair_label || ''), String(b.pair_label || '')));
    }

    async updateRelationTypePairInline(pairKey, sourceObjectTypeId, targetObjectTypeId, relationType, options = {}) {
        const normalizedSource = Number(sourceObjectTypeId);
        const normalizedTarget = Number(targetObjectTypeId);
        if (!Number.isFinite(normalizedSource) || !Number.isFinite(normalizedTarget) || normalizedSource === normalizedTarget) return;
        const shouldBlockPair = Boolean(options?.blocked);

        const pairRules = (this.relationTypeRules || []).filter(rule => {
            const sourceId = Number(rule.source_object_type_id);
            const targetId = Number(rule.target_object_type_id);
            return (
                (sourceId === normalizedSource && targetId === normalizedTarget)
                || (sourceId === normalizedTarget && targetId === normalizedSource)
            );
        });

        const selectedRule = pairRules.find(rule => (
            Number(rule.source_object_type_id) === normalizedSource
            && Number(rule.target_object_type_id) === normalizedTarget
        ));
        const reverseRule = pairRules.find(rule => (
            Number(rule.source_object_type_id) === normalizedTarget
            && Number(rule.target_object_type_id) === normalizedSource
        ));

        if (!selectedRule || !reverseRule) return;

        try {
            if (this.relationTypeRuleTable?.state) {
                this.relationRuleTableState = {
                    search: this.relationTypeRuleTable.state.search || '',
                    columnSearches: { ...(this.relationTypeRuleTable.state.columnSearches || {}) },
                    sortField: this.relationTypeRuleTable.state.sortField || null,
                    sortDirection: this.relationTypeRuleTable.state.sortDirection || 'asc'
                };
            }

            const fallbackRelationType = String((this.availableRelationTypes || [])[0] || 'uses_object').trim().toLowerCase() || 'uses_object';
            const normalizedRelationType = String(relationType || fallbackRelationType).trim().toLowerCase() || fallbackRelationType;

            await RelationTypeRulesAPI.update(Number(selectedRule.id), {
                source_object_type_id: normalizedSource,
                target_object_type_id: normalizedTarget,
                relation_type: normalizedRelationType,
                is_allowed: !shouldBlockPair
            });
            await RelationTypeRulesAPI.update(Number(reverseRule.id), {
                source_object_type_id: normalizedTarget,
                target_object_type_id: normalizedSource,
                relation_type: normalizedRelationType,
                is_allowed: false
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
            this.updateFieldHierarchySettingsVisibility();
            return;
        }

        const template = this.fieldTemplates.find(item => Number(item.id) === id);
        if (!template) return;
        if (requiredCheckbox) requiredCheckbox.checked = Boolean(template.is_required);
        this.updateFieldHierarchySettingsVisibility();
    }

    normalizeHierarchyLevelCount(value, fallback = 2) {
        const parsed = Number(value);
        if (!Number.isFinite(parsed)) return fallback;
        const safe = Math.floor(parsed);
        if (safe < 2) return 2;
        if (safe > 8) return 8;
        return safe;
    }

    getHierarchyConfigFromOptions(rawOptions) {
        const options = this.normalizeFieldOptions(rawOptions) || {};
        const labels = Array.isArray(options.hierarchy_level_labels)
            ? options.hierarchy_level_labels.map(label => String(label || '').trim()).filter(Boolean).slice(0, 8)
            : [];
        const countFromOptions = Number(options.hierarchy_level_count || 0);
        const enabled = countFromOptions > 1 || labels.length > 1;
        const levelCount = this.normalizeHierarchyLevelCount(
            countFromOptions > 1 ? countFromOptions : (labels.length > 1 ? labels.length : 2),
            2
        );
        return {
            enabled,
            levelCount,
            labels
        };
    }

    renderFieldHierarchyLabels(levelCount, labels = []) {
        const container = document.getElementById('field-hierarchy-labels-container');
        if (!container) return;

        const safeCount = this.normalizeHierarchyLevelCount(levelCount, 2);
        container.innerHTML = Array.from({ length: safeCount }, (_, idx) => {
            const levelIndex = idx + 1;
            const value = String(labels[idx] || `Nivå ${levelIndex}`).trim();
            return `
                <div class="form-group">
                    <label for="field-hierarchy-label-${levelIndex}">Rubrik nivå ${levelIndex}</label>
                    <input
                        type="text"
                        id="field-hierarchy-label-${levelIndex}"
                        class="form-control field-hierarchy-label-input"
                        data-level-index="${idx}"
                        value="${escapeHtml(value)}"
                        placeholder="Nivå ${levelIndex}">
                </div>
            `;
        }).join('');
    }

    setupFieldHierarchySettingsBehavior() {
        if (this.fieldHierarchySettingsAttached) return;
        const enabledCheckbox = document.getElementById('field-enable-hierarchy');
        const levelCountInput = document.getElementById('field-hierarchy-level-count');
        if (!enabledCheckbox || !levelCountInput) return;

        enabledCheckbox.addEventListener('change', () => this.updateFieldHierarchySettingsVisibility());
        levelCountInput.addEventListener('change', () => {
            levelCountInput.value = String(this.normalizeHierarchyLevelCount(levelCountInput.value, 2));
            this.updateFieldHierarchySettingsVisibility({ preserveLabels: true });
        });
        levelCountInput.addEventListener('input', () => this.updateFieldHierarchySettingsVisibility({ preserveLabels: true }));
        this.fieldHierarchySettingsAttached = true;
        this.updateFieldHierarchySettingsVisibility();
    }

    getFieldModalManagedListTemplate() {
        const templateId = Number(document.getElementById('field-template-select')?.value || 0);
        if (!Number.isFinite(templateId) || templateId <= 0) return null;
        const template = this.fieldTemplates.find(item => Number(item.id) === templateId);
        if (!template) return null;
        const fieldType = String(template.field_type || '').toLowerCase();
        const options = this.normalizeFieldOptions(template.field_options) || {};
        if (fieldType !== 'select' || options.source !== 'managed_list') return null;
        return template;
    }

    updateFieldHierarchySettingsVisibility({ preserveLabels = false } = {}) {
        const settingsGroup = document.getElementById('field-hierarchy-settings-group');
        const levelConfig = document.getElementById('field-hierarchy-level-config');
        const enabledCheckbox = document.getElementById('field-enable-hierarchy');
        const levelCountInput = document.getElementById('field-hierarchy-level-count');
        const template = this.getFieldModalManagedListTemplate();
        if (!settingsGroup || !levelConfig || !enabledCheckbox || !levelCountInput) return;

        if (!template) {
            settingsGroup.style.display = 'none';
            levelConfig.style.display = 'none';
            enabledCheckbox.checked = false;
            return;
        }

        settingsGroup.style.display = '';
        levelConfig.style.display = enabledCheckbox.checked ? '' : 'none';
        const safeCount = this.normalizeHierarchyLevelCount(levelCountInput.value, 2);
        levelCountInput.value = String(safeCount);

        if (!enabledCheckbox.checked) return;
        const existingLabels = preserveLabels
            ? Array.from(document.querySelectorAll('.field-hierarchy-label-input'))
                .map(input => String(input.value || '').trim())
            : [];
        this.renderFieldHierarchyLabels(safeCount, existingLabels);
    }

    setFieldHierarchySettingsFromFieldOptions(rawOptions) {
        const enabledCheckbox = document.getElementById('field-enable-hierarchy');
        const levelCountInput = document.getElementById('field-hierarchy-level-count');
        if (!enabledCheckbox || !levelCountInput) return;

        const hierarchy = this.getHierarchyConfigFromOptions(rawOptions);
        enabledCheckbox.checked = hierarchy.enabled;
        levelCountInput.value = String(hierarchy.levelCount);
        this.updateFieldHierarchySettingsVisibility();
        if (hierarchy.enabled) {
            this.renderFieldHierarchyLabels(hierarchy.levelCount, hierarchy.labels);
        }
    }

    buildFieldManagedListOptionsForModal({ mode, fieldId } = {}) {
        const template = this.getFieldModalManagedListTemplate();
        if (!template) return null;

        const templateOptions = this.normalizeFieldOptions(template.field_options) || {};
        const listId = Number(templateOptions.list_id);
        if (!Number.isFinite(listId) || listId <= 0) return null;

        const nextOptions = {
            source: 'managed_list',
            list_id: listId
        };
        if (templateOptions.selection_mode === 'multi' || templateOptions.selection_mode === 'single') {
            nextOptions.selection_mode = templateOptions.selection_mode;
        }
        if ('allow_only_leaf_selection' in templateOptions) {
            nextOptions.allow_only_leaf_selection = Boolean(templateOptions.allow_only_leaf_selection);
        }

        if (mode === 'edit' && this.selectedType) {
            const currentField = (this.selectedType.fields || []).find(item => Number(item.id) === Number(fieldId));
            const currentOptions = this.normalizeFieldOptions(currentField?.field_options) || {};
            if (currentOptions.parent_field_name) nextOptions.parent_field_name = currentOptions.parent_field_name;
            if (Number(currentOptions.parent_list_id) > 0) nextOptions.parent_list_id = Number(currentOptions.parent_list_id);
            if (Number(currentOptions.list_link_id) > 0) nextOptions.list_link_id = Number(currentOptions.list_link_id);
            if (currentOptions.selection_mode === 'multi' || currentOptions.selection_mode === 'single') {
                nextOptions.selection_mode = currentOptions.selection_mode;
            }
            if ('allow_only_leaf_selection' in currentOptions) {
                nextOptions.allow_only_leaf_selection = Boolean(currentOptions.allow_only_leaf_selection);
            }
        }

        const enabledHierarchy = Boolean(document.getElementById('field-enable-hierarchy')?.checked);
        if (!enabledHierarchy) {
            return nextOptions;
        }

        const levelCount = this.normalizeHierarchyLevelCount(document.getElementById('field-hierarchy-level-count')?.value, 2);
        const labels = Array.from(document.querySelectorAll('.field-hierarchy-label-input'))
            .map(input => String(input.value || '').trim())
            .filter(Boolean)
            .slice(0, levelCount);

        nextOptions.hierarchy_level_count = levelCount;
        if (labels.length) {
            nextOptions.hierarchy_level_labels = labels;
        }
        return nextOptions;
    }

    showCreateFieldTemplateModal() {
        const modal = document.getElementById('field-template-modal');
        const overlay = document.getElementById('modal-overlay');
        const form = document.getElementById('field-template-form');
        if (!modal || !overlay || !form) return;

        form.reset();
        document.getElementById('field-template-modal-title').textContent = 'Skapa Fältmall';
        this.renderFieldTemplateManagedListOptions('');
        const sourceSelect = document.getElementById('template-option-source');
        if (sourceSelect) sourceSelect.value = 'custom';
        this.updateFieldTemplateOptionInputs();
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
        this.renderFieldTemplateManagedListOptions('');
        this.setFieldTemplateOptionsFromTemplate(template);

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

        container.innerHTML = `
            <div class="managed-lists-page">
                <div class="fields-section">
                    <div class="section-header">
                        <h4>Lista över listor</h4>
                    </div>
                    <div class="managed-lists-create-inline">
                        <input id="new-managed-list-name" type="text" class="form-control" placeholder="Namn">
                        <input id="new-managed-list-code" type="text" class="form-control" placeholder="Kod (valfritt)">
                        <button class="btn btn-primary" onclick="adminManager.createManagedList()">Skapa lista</button>
                    </div>
                    <div id="managed-lists-overview-table"></div>
                </div>
            </div>
        `;

        const tableRows = (this.managedLists || []).map(list => ({
            id: Number(list.id),
            name: list.name || '',
            code: list.code || '',
            item_count: Number(list.item_count || 0),
            active: list.is_active ? 'Aktiv' : 'Inaktiv',
            used_by_fields: Number(list.used_by_fields_count || 0),
            actions: ''
        }));

        if (typeof SystemTable === 'function') {
            this.managedListsOverviewTable = new SystemTable({
                containerId: 'managed-lists-overview-table',
                tableId: 'managed-lists-overview-table',
                columns: [
                    { field: 'name', label: 'Namn', className: 'col-name' },
                    { field: 'code', label: 'Kod', className: 'col-id' },
                    { field: 'item_count', label: 'Antal värden', className: 'col-type' },
                    { field: 'active', label: 'Status', className: 'col-type' },
                    { field: 'used_by_fields', label: 'Används av fält', className: 'col-type' },
                    {
                        field: 'actions',
                        label: 'Actions',
                        className: 'col-actions',
                        sortable: false,
                        searchable: false,
                        render: (row) => `
                            <div class="category-actions">
                                <button class="btn-icon" title="Öppna lista" onclick="event.stopPropagation(); adminManager.openManagedListWorkspace(${row.id})">👁️</button>
                                <button class="btn-icon" title="Redigera lista" onclick="event.stopPropagation(); adminManager.editManagedList(${row.id})">✏️</button>
                                <button class="btn-icon btn-danger" title="Ta bort lista" onclick="event.stopPropagation(); adminManager.deleteManagedList(${row.id})">🗑️</button>
                                <button class="btn-icon" title="Export JSON" onclick="event.stopPropagation(); ListsAPI.export(${row.id}, 'json')">⤓</button>
                            </div>
                        `
                    }
                ],
                rows: tableRows,
                emptyText: 'Inga listor ännu',
                onRowClick: (row) => {
                    this.openManagedListWorkspace(row.id);
                }
            });
            this.managedListsOverviewTable.render();
        }

        const newListInput = document.getElementById('new-managed-list-name');
        if (newListInput) {
            newListInput.addEventListener('keydown', (event) => {
                if (event.key !== 'Enter') return;
                event.preventDefault();
                this.createManagedList();
            });
        }
    }

    async openManagedListWorkspace(listId) {
        const normalizedId = Number(listId || 0);
        if (!normalizedId) return;
        this.selectedManagedListId = normalizedId;
        this.selectedManagedListTreeNodeId = null;
        this.selectedManagedListTreeNodeIds = new Set();
        this.managedListTreeSelectionAnchorId = null;
        this.managedListInlineCreateParentId = null;
        this.managedListTreeExpandedNodeIds = new Set();
        this.managedListWorkspaceOpen = true;
        try {
            this.selectedManagedListDetail = await ListsAPI.getById(normalizedId, true, true);
            this.renderManagedListWorkspaceOverlay(this.selectedManagedListDetail);
        } catch (error) {
            console.error('Failed to open managed list workspace:', error);
            showToast(error.message || 'Kunde inte öppna lista', 'error');
        }
    }

    renderManagedListWorkspaceOverlay(list) {
        if (!list) return;
        let overlay = document.getElementById('managed-list-workspace-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'managed-list-workspace-overlay';
            overlay.className = 'managed-list-workspace-overlay';
            document.body.appendChild(overlay);
        }

        overlay.innerHTML = `
            <div class="managed-list-workspace-shell">
                <div class="managed-list-workspace-content">
                    ${this.renderManagedListDetails(list)}
                </div>
            </div>
        `;
    }

    renderManagedListCurrentSurface() {
        if (this.managedListWorkspaceOpen && this.selectedManagedListDetail) {
            this.renderManagedListWorkspaceOverlay(this.selectedManagedListDetail);
            return;
        }
        this.renderManagedLists();
    }

    closeManagedListWorkspace() {
        this.managedListWorkspaceOpen = false;
        const overlay = document.getElementById('managed-list-workspace-overlay');
        if (overlay) {
            overlay.remove();
        }
    }

    renderFieldBindingSection() {
        const host = document.querySelector('.managed-list-workspace-content') || document.querySelector('.managed-lists-detail-host');
        if (!host || !this.selectedManagedListDetail) return;
        const selectedListId = Number(this.selectedManagedListDetail.id);
        const sectionId = 'field-binding-table-host';
        const existing = host.querySelector('.field-binding-section');
        if (existing) existing.remove();
        host.insertAdjacentHTML('beforeend', `
            <div class="fields-section field-binding-section">
                <div class="section-header"><h4>Koppla lista till fält</h4></div>
                <div class="managed-list-binding-form">
                    <input id="binding-object-type" class="form-control" placeholder="Objekttyp (t.ex. Product)">
                    <input id="binding-field-name" class="form-control" placeholder="Fältnamn (t.ex. category)">
                    <select id="binding-selection-mode" class="form-control">
                        <option value="single">single</option>
                        <option value="multi">multi</option>
                    </select>
                    <label><input type="checkbox" id="binding-only-leaf"> Endast bladnoder</label>
                    <label><input type="checkbox" id="binding-required"> Obligatoriskt</label>
                    <button class="btn btn-primary" onclick="adminManager.createFieldBindingForSelectedList()">Koppla</button>
                </div>
                <div id="${sectionId}"></div>
            </div>
        `);
        const rows = (this.fieldListBindings || [])
            .filter(row => Number(row.list_id) === selectedListId)
            .map(row => ({
                id: Number(row.id),
                object_type: row.object_type || '',
                field_name: row.field_name || '',
                selection_mode: row.selection_mode || 'single',
                only_leaf: row.allow_only_leaf_selection ? 'Ja' : 'Nej',
                required: row.is_required ? 'Ja' : 'Nej',
                actions: ''
            }));
        if (typeof SystemTable === 'function') {
            this.fieldBindingsTable = new SystemTable({
                containerId: sectionId,
                tableId: sectionId,
                columns: [
                    { field: 'object_type', label: 'Objekttyp', className: 'col-type' },
                    { field: 'field_name', label: 'Fältnamn', className: 'col-name' },
                    { field: 'selection_mode', label: 'Mode', className: 'col-type' },
                    { field: 'only_leaf', label: 'Endast blad', className: 'col-type' },
                    { field: 'required', label: 'Obligatoriskt', className: 'col-type' },
                    {
                        field: 'actions',
                        label: 'Actions',
                        sortable: false,
                        searchable: false,
                        className: 'col-actions',
                        render: (row) => `<button class="btn-icon btn-danger" title="Ta bort koppling" onclick="adminManager.deleteFieldBinding(${row.id})">🗑️</button>`
                    }
                ],
                rows,
                emptyText: 'Inga fältkopplingar'
            });
            this.fieldBindingsTable.render();
        }
    }

    async createFieldBindingForSelectedList() {
        const listId = Number(this.selectedManagedListId || 0);
        if (!listId) return;
        const objectType = String(document.getElementById('binding-object-type')?.value || '').trim();
        const fieldName = String(document.getElementById('binding-field-name')?.value || '').trim();
        const selectionMode = String(document.getElementById('binding-selection-mode')?.value || 'single').trim().toLowerCase();
        const onlyLeaf = Boolean(document.getElementById('binding-only-leaf')?.checked);
        const required = Boolean(document.getElementById('binding-required')?.checked);
        if (!objectType || !fieldName) {
            showToast('Ange objekttyp och fältnamn', 'error');
            return;
        }
        try {
            await FieldBindingsAPI.create({
                object_type: objectType,
                field_name: fieldName,
                list_id: listId,
                selection_mode: selectionMode,
                allow_only_leaf_selection: onlyLeaf,
                is_required: required
            });
            showToast('Fältkoppling skapad', 'success');
            await this.loadManagedLists();
        } catch (error) {
            console.error('Failed to create field binding:', error);
            showToast(error.message || 'Kunde inte skapa fältkoppling', 'error');
        }
    }

    async deleteFieldBinding(bindingId) {
        if (!confirm('Ta bort fältkoppling?')) return;
        try {
            await FieldBindingsAPI.delete(bindingId);
            showToast('Fältkoppling borttagen', 'success');
            await this.loadManagedLists();
        } catch (error) {
            console.error('Failed to delete field binding:', error);
            showToast(error.message || 'Kunde inte ta bort fältkoppling', 'error');
        }
    }

    getManagedListLanguageCodes(list) {
        const rawCodes = Array.isArray(list?.language_codes) ? list.language_codes : [];
        const seen = new Set();
        const codes = [];

        rawCodes.forEach((raw) => {
            const code = this.sanitizeLanguageCode(raw);
            if (!code || seen.has(code)) return;
            seen.add(code);
            codes.push(code);
        });

        if (!seen.has('en')) {
            codes.unshift('en');
            seen.add('en');
        }

        if (!codes.length) {
            codes.push('en');
        }

        return Array.from(new Set(codes)).slice(0, 10);
    }

    sanitizeLanguageCode(code) {
        return String(code || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 10);
    }

    buildLocaleInputId(prefix, locale, index) {
        const safeLocale = this.sanitizeLanguageCode(locale) || `lang${index + 1}`;
        return `${prefix}-${safeLocale}`;
    }

    getSuggestedLanguageCode(index, usedCodes) {
        const suggestions = ['sv', 'fi', 'de', 'no', 'da', 'fr', 'es', 'it', 'nl', 'pl'];
        for (const suggestion of suggestions) {
            if (!usedCodes.has(suggestion)) return suggestion;
        }
        let counter = index + 1;
        while (usedCodes.has(`l${counter}`)) counter += 1;
        return `l${counter}`;
    }

    getManagedListFallbackLanguageCode(list, languageCodes = null) {
        const codes = Array.isArray(languageCodes) && languageCodes.length
            ? languageCodes
            : this.getManagedListLanguageCodes(list);
        if (codes.includes('en')) return 'en';
        return 'en';
    }

    getManagedListLanguageCatalog() {
        return ['en', 'sv', 'fi', 'de', 'no', 'da', 'fr', 'es', 'it', 'nl', 'pl', 'cs', 'et', 'lv', 'lt'];
    }

    renderManagedListLanguageSelectOptions(languageCodes, index, selectedCode) {
        const selected = this.sanitizeLanguageCode(selectedCode);
        const usedByOthers = new Set(
            languageCodes
                .filter((_, itemIndex) => itemIndex !== index)
                .map(code => this.sanitizeLanguageCode(code))
                .filter(Boolean)
        );

        const catalog = this.getManagedListLanguageCatalog();
        const options = [];

        if (selected && !catalog.includes(selected)) {
            options.push(selected);
        }

        catalog.forEach((code) => {
            if (code === selected || !usedByOthers.has(code)) {
                options.push(code);
            }
        });

        return Array.from(new Set(options)).map((code) => `
            <option value="${escapeHtml(code)}" ${code === selected ? 'selected' : ''}>${escapeHtml(code.toUpperCase())}</option>
        `).join('');
    }

    getNormalizedLanguageCodes(languageCodes) {
        const seen = new Set();
        const normalized = [];

        (Array.isArray(languageCodes) ? languageCodes : []).forEach((raw, index) => {
            let code = this.sanitizeLanguageCode(raw);
            if (!code || seen.has(code)) {
                code = this.getSuggestedLanguageCode(index, seen);
            }
            if (!code || seen.has(code)) return;
            seen.add(code);
            normalized.push(code);
        });

        if (!normalized.length) normalized.push('en');
        return normalized.slice(0, 10);
    }

    async persistManagedListLanguages(list, nextLanguageCodes, fallbackLanguageCode = '') {
        const normalizedCodes = this.getNormalizedLanguageCodes(nextLanguageCodes);
        const withoutEn = normalizedCodes.filter(code => code !== 'en');
        const orderedCodes = ['en', ...withoutEn];
        const additionalLanguageCode = orderedCodes.find(code => code !== 'en') || 'en';

        const runUpdate = async () => {
            try {
                await ManagedListsAPI.update(this.selectedManagedListId, {
                    language_codes: orderedCodes,
                    fallback_language_code: 'en',
                    additional_language_code: additionalLanguageCode
                });
                list.language_codes = orderedCodes;
                list.fallback_language_code = 'en';
                list.additional_language_code = additionalLanguageCode;
                await this.loadManagedLists();
            } catch (error) {
                console.error('Failed to update managed list languages:', error);
                showToast(error.message || 'Kunde inte uppdatera språk', 'error');
            }
        };

        this.managedListLanguageUpdatePromise = this.managedListLanguageUpdatePromise
            .catch(() => {})
            .then(runUpdate);

        await this.managedListLanguageUpdatePromise;
    }

    async addManagedListLanguageColumn() {
        if (!this.selectedManagedListId) return;
        const list = this.managedLists.find(item => item.id === this.selectedManagedListId);
        if (!list) return;

        const languageCodes = this.getManagedListLanguageCodes(list);
        if (languageCodes.length >= 10) {
            showToast('Max 10 språk per lista', 'error');
            return;
        }

        const rawCode = prompt('Ange språk-kod (t.ex. sv, fi, de):', this.getSuggestedLanguageCode(languageCodes.length, new Set(languageCodes)));
        if (rawCode === null) return;
        const nextCode = this.sanitizeLanguageCode(rawCode);
        if (!nextCode) {
            showToast('Ogiltig språk-kod', 'error');
            return;
        }
        if (nextCode === 'en') {
            showToast('EN är alltid fallback och finns redan', 'error');
            return;
        }
        if (languageCodes.includes(nextCode)) {
            showToast(`${nextCode.toUpperCase()} finns redan`, 'error');
            return;
        }

        await this.persistManagedListLanguages(
            list,
            [...languageCodes, nextCode],
            'en'
        );
    }

    async removeManagedListLanguageColumn(index) {
        if (!this.selectedManagedListId) return;
        const list = this.managedLists.find(item => item.id === this.selectedManagedListId);
        if (!list) return;

        const languageCodes = this.getManagedListLanguageCodes(list);
        const codeToRemove = this.sanitizeLanguageCode(languageCodes[index]);

        if (!codeToRemove) return;
        if (codeToRemove === 'en') {
            showToast('EN är obligatorisk fallback och kan inte tas bort', 'error');
            return;
        }
        if (languageCodes.length <= 1) {
            showToast('Minst ett språk måste finnas kvar', 'error');
            return;
        }

        const nextCodes = languageCodes.filter((_, itemIndex) => itemIndex !== index);
        await this.persistManagedListLanguages(list, nextCodes, 'en');
    }

    async removeManagedListLanguageColumnByCode(languageCode) {
        const list = this.managedLists.find(item => item.id === this.selectedManagedListId);
        if (!list) return;
        const languageCodes = this.getManagedListLanguageCodes(list);
        const index = languageCodes.findIndex(code => code === this.sanitizeLanguageCode(languageCode));
        if (index < 0) return;
        await this.removeManagedListLanguageColumn(index);
    }

    async updateManagedListColumnLanguage(index, value) {
        // Renaming language columns is intentionally disabled.
        void index;
        void value;
    }

    async setManagedListFallbackLanguage(value) {
        // Fallback is fixed to EN.
        void value;
    }

    getManagedListItemTranslations(item) {
        const raw = (item && typeof item.value_translations === 'object' && item.value_translations) || {};
        return raw;
    }

    getManagedListNodeLanguageCodes() {
        return ['en', 'sv', 'fi', 'no'];
    }

    getManagedListById(listId) {
        return (this.managedLists || []).find(item => Number(item.id) === Number(listId)) || null;
    }

    getManagedListNameById(listId) {
        const id = Number(listId);
        const list = this.getManagedListById(id);
        if (!list) return `Lista #${id}`;
        return list.name || `Lista #${id}`;
    }

    renderManagedListLinkBadges(links = [], direction = 'parents') {
        const normalized = Array.isArray(links) ? links : [];
        if (!normalized.length) return '<span class="managed-list-link-empty">-</span>';

        return normalized.map(link => {
            const parentName = escapeHtml(this.getManagedListNameById(link.parent_list_id));
            const childName = escapeHtml(this.getManagedListNameById(link.child_list_id));
            const relationKey = escapeHtml(link.relation_key || 'depends_on');
            const label = `${parentName} -> ${childName}`;
            return `<span class="managed-list-link-badge" title="${relationKey}">${label}</span>`;
        }).join('');
    }

    getManagedListItemLabel(listId, itemId) {
        const list = this.getManagedListById(listId);
        const item = (list?.items || []).find(entry => Number(entry.id) === Number(itemId));
        if (!item) return `Item #${itemId}`;
        return item.display_value || item.value || `Item #${itemId}`;
    }

    renderManagedListRelationshipAdmin(list) {
        const listId = Number(list?.id);
        if (!Number.isFinite(listId)) return '';

        const childLinks = (this.managedListLinks || []).filter(
            link => Number(link.parent_list_id) === listId && link.is_active !== false
        );
        const parentLinks = (this.managedListLinks || []).filter(
            link => Number(link.child_list_id) === listId && link.is_active !== false
        );

        const childIds = new Set(childLinks.map(link => Number(link.child_list_id)));
        const parentIds = new Set(parentLinks.map(link => Number(link.parent_list_id)));

        const childCandidates = this.managedLists
            .filter(candidate => Number(candidate.id) !== listId && !childIds.has(Number(candidate.id)))
            .sort((a, b) => objectTypeManagerTextCollator.compare(String(a.name || ''), String(b.name || '')));

        const parentCandidates = this.managedLists
            .filter(candidate => Number(candidate.id) !== listId && !parentIds.has(Number(candidate.id)))
            .sort((a, b) => objectTypeManagerTextCollator.compare(String(a.name || ''), String(b.name || '')));

        return `
            <div class="managed-list-relation-admin">
                <div class="managed-list-relation-row">
                    <label for="managed-list-add-child-${listId}">Koppla barnlista</label>
                    <div class="managed-list-relation-inputs">
                        <select id="managed-list-add-child-${listId}" class="form-control">
                            <option value="">Välj barnlista...</option>
                            ${childCandidates.map(candidate => `<option value="${candidate.id}">${escapeHtml(candidate.name)}</option>`).join('')}
                        </select>
                        <button class="btn btn-sm btn-primary" onclick="adminManager.createManagedListChildLink(${listId})">Koppla</button>
                    </div>
                </div>
                <div class="managed-list-relation-row">
                    <label for="managed-list-add-parent-${listId}">Koppla förälder</label>
                    <div class="managed-list-relation-inputs">
                        <select id="managed-list-add-parent-${listId}" class="form-control">
                            <option value="">Välj föräldralista...</option>
                            ${parentCandidates.map(candidate => `<option value="${candidate.id}">${escapeHtml(candidate.name)}</option>`).join('')}
                        </select>
                        <button class="btn btn-sm btn-primary" onclick="adminManager.createManagedListParentLink(${listId})">Koppla</button>
                    </div>
                </div>
                <div class="managed-list-relation-existing">
                    <div class="managed-list-relation-col">
                        <strong>Barnkopplingar</strong>
                        ${childLinks.length
                            ? childLinks.map(link => `
                                <div class="managed-list-relation-chip-row">
                                    <span class="managed-list-link-badge">${escapeHtml(this.getManagedListNameById(link.parent_list_id))} -> ${escapeHtml(this.getManagedListNameById(link.child_list_id))}</span>
                                    <button class="btn-icon btn-danger" title="Ta bort koppling" onclick="adminManager.deleteManagedListLink(${Number(link.id)})">🗑️</button>
                                </div>
                            `).join('')
                            : '<span class="managed-list-link-empty">Inga barnkopplingar</span>'}
                    </div>
                    <div class="managed-list-relation-col">
                        <strong>Föräldrakopplingar</strong>
                        ${parentLinks.length
                            ? parentLinks.map(link => `
                                <div class="managed-list-relation-chip-row">
                                    <span class="managed-list-link-badge">${escapeHtml(this.getManagedListNameById(link.parent_list_id))} -> ${escapeHtml(this.getManagedListNameById(link.child_list_id))}</span>
                                    <button class="btn-icon btn-danger" title="Ta bort koppling" onclick="adminManager.deleteManagedListLink(${Number(link.id)})">🗑️</button>
                                </div>
                            `).join('')
                            : '<span class="managed-list-link-empty">Inga föräldrakopplingar</span>'}
                    </div>
                </div>
                ${childLinks.map(link => this.renderManagedListItemLinkAdmin(listId, link)).join('')}
            </div>
        `;
    }

    renderManagedListItemLinkAdmin(parentListId, link) {
        const linkId = Number(link.id);
        const childListId = Number(link.child_list_id);
        const parentList = this.getManagedListById(parentListId);
        const childList = this.getManagedListById(childListId);
        if (!parentList || !childList) return '';

        const parentItems = (parentList.items || []).filter(item => item.is_active !== false);
        const childItems = (childList.items || []).filter(item => item.is_active !== false);
        const itemLinks = (this.managedListItemLinks || []).filter(
            itemLink => Number(itemLink.list_link_id) === linkId && itemLink.is_active !== false
        );

        return `
            <div class="managed-list-item-link-admin">
                <h5>Koppla värden: ${escapeHtml(parentList.name)} -> ${escapeHtml(childList.name)}</h5>
                <div class="managed-list-item-link-controls">
                    <select id="managed-list-item-link-parent-${linkId}" class="form-control">
                        <option value="">Välj parent-värde...</option>
                        ${parentItems.map(item => `<option value="${item.id}">${escapeHtml(item.display_value || item.value || '')}</option>`).join('')}
                    </select>
                    <select id="managed-list-item-link-child-${linkId}" class="form-control">
                        <option value="">Välj child-värde...</option>
                        ${childItems.map(item => `<option value="${item.id}">${escapeHtml(item.display_value || item.value || '')}</option>`).join('')}
                    </select>
                    <button class="btn btn-sm btn-primary" onclick="adminManager.createManagedListItemLink(${linkId})">Länka värden</button>
                </div>
                <div class="managed-list-item-link-table">
                    ${itemLinks.length
                        ? itemLinks.map(itemLink => `
                            <div class="managed-list-relation-chip-row">
                                <span class="managed-list-link-badge">${escapeHtml(this.getManagedListItemLabel(parentListId, itemLink.parent_item_id))} -> ${escapeHtml(this.getManagedListItemLabel(childListId, itemLink.child_item_id))}</span>
                                <button class="btn-icon btn-danger" title="Ta bort item-koppling" onclick="adminManager.deleteManagedListItemLink(${Number(itemLink.id)})">🗑️</button>
                            </div>
                        `).join('')
                        : '<span class="managed-list-link-empty">Inga värdekopplingar</span>'}
                </div>
            </div>
        `;
    }

    buildManagedListTreeData(list) {
        const items = Array.isArray(list?.items) ? list.items : [];
        const activeItems = items.filter(item => item && item.is_active !== false);
        const byId = new Map(activeItems.map(item => [Number(item.id), item]));
        const childrenByParent = new Map();

        activeItems.forEach((item) => {
            const ownId = Number(item.id);
            const parentId = Number(item.parent_item_id);
            const normalizedParentId = Number.isFinite(parentId) && byId.has(parentId) && parentId !== ownId
                ? parentId
                : 0;
            if (!childrenByParent.has(normalizedParentId)) {
                childrenByParent.set(normalizedParentId, []);
            }
            childrenByParent.get(normalizedParentId).push(item);
        });

        childrenByParent.forEach((entries) => {
            entries.sort((a, b) => {
                const orderDiff = Number(a.sort_order || 0) - Number(b.sort_order || 0);
                if (orderDiff !== 0) return orderDiff;
                return objectTypeManagerTextCollator.compare(
                    String(a.display_value || a.value || ''),
                    String(b.display_value || b.value || '')
                );
            });
        });

        return { byId, childrenByParent };
    }

    renderManagedListInlineCreateRow(parentItemId, fallbackCode, depth = 0) {
        const normalizedParent = Number.isFinite(Number(parentItemId)) && Number(parentItemId) > 0
            ? Number(parentItemId)
            : 0;
        if (this.managedListInlineCreateParentId !== normalizedParent) {
            return '';
        }
        return `
            <div class="managed-list-tree-inline-create" style="padding-left: ${8 + (depth * 16)}px;">
                <input
                    id="managed-list-inline-create-value"
                    type="text"
                    class="form-control"
                    placeholder="${fallbackCode.toUpperCase()} label"
                    onkeydown="if(event.key==='Enter'){event.preventDefault();adminManager.submitManagedListInlineCreate()} if(event.key==='Escape'){event.preventDefault();adminManager.cancelManagedListInlineCreate()}"
                >
                <button type="button" class="btn btn-sm btn-primary" onclick="adminManager.submitManagedListInlineCreate()">Spara</button>
                <button type="button" class="btn btn-sm btn-secondary" onclick="adminManager.cancelManagedListInlineCreate()">Avbryt</button>
            </div>
        `;
    }

    renderManagedListTreeNodes(childrenByParent, parentId = 0, depth = 0, fallbackCode = 'en') {
        const nodes = childrenByParent.get(Number(parentId)) || [];
        if (!nodes.length) {
            if (Number(parentId) === 0 && this.managedListInlineCreateParentId !== 0) {
                return `
                    <div class="managed-list-inline-create-empty-state">
                        <button type="button" class="btn btn-sm btn-primary" onclick="adminManager.openManagedListInlineCreate(null)">
                            Lägg till första nod
                        </button>
                    </div>
                `;
            }
            return this.renderManagedListInlineCreateRow(parentId, fallbackCode, depth);
        }

        const renderedNodes = nodes.map((node) => {
            const nodeId = Number(node.id);
            const label = escapeHtml(String(node.label || node.display_value || node.value || `Rad ${nodeId}`));
            const isSelected = this.selectedManagedListTreeNodeIds.has(nodeId);
            const children = childrenByParent.get(nodeId) || [];
            const hasChildren = children.length > 0;
            const isExpanded = this.managedListTreeExpandedNodeIds.has(String(nodeId));
            const nested = isExpanded
                ? this.renderManagedListTreeNodes(childrenByParent, nodeId, depth + 1, fallbackCode)
                : '';
            const isInactive = node.is_active === false;
            const nonSelectable = node.is_selectable === false;

            return `
                <div class="managed-list-tree-row">
                    <div
                        class="managed-list-tree-node-row ${isSelected ? 'selected' : ''} ${isInactive ? 'inactive' : ''}"
                        style="padding-left: ${8 + (depth * 16)}px;"
                        draggable="true"
                        ondragstart="adminManager.onManagedListTreeDragStart(event, ${nodeId})"
                        ondragend="adminManager.onManagedListTreeDragEnd()"
                        ondragenter="adminManager.onManagedListTreeDragEnter(event, ${nodeId})"
                        ondragleave="adminManager.onManagedListTreeDragLeave(event)"
                        ondragover="adminManager.onManagedListTreeDragOver(event)"
                        ondrop="adminManager.onManagedListTreeDrop(event, ${nodeId})"
                    >
                        <span class="tree-expander-slot">
                            ${hasChildren
                                ? `<button type="button" draggable="false" class="tree-toggle ${isExpanded ? 'expanded' : ''}" onclick="event.stopPropagation(); adminManager.toggleManagedListTreeNode(${nodeId})">${isExpanded ? '▾' : '▸'}</button>`
                                : '<span class="tree-spacer"></span>'}
                        </span>
                        <button
                            type="button"
                            draggable="false"
                            class="managed-list-tree-node"
                            onclick="adminManager.selectManagedListTreeNode(${nodeId}, event)"
                        >
                            <span class="managed-list-tree-node-label">${label}</span>
                            ${isInactive ? '<span class="managed-list-node-flag">Inaktiv</span>' : ''}
                            ${nonSelectable ? '<span class="managed-list-node-flag">Ej valbar</span>' : ''}
                            ${hasChildren ? `<span class="managed-list-tree-node-count">${children.length}</span>` : ''}
                        </button>
                        <button type="button" draggable="false" class="btn btn-sm btn-secondary managed-list-tree-add-child-btn" title="Lägg till undernod" onclick="event.stopPropagation(); adminManager.openManagedListInlineCreate(${nodeId})">+</button>
                        <button type="button" draggable="false" class="btn btn-sm btn-danger managed-list-tree-delete-btn" title="Ta bort nod" onclick="event.stopPropagation(); adminManager.deleteManagedListItem(${nodeId})">-</button>
                    </div>
                    ${nested}
                </div>
            `;
        }).join('');

        const inlineCreateRow = this.renderManagedListInlineCreateRow(parentId, fallbackCode, depth);
        return `${renderedNodes}${inlineCreateRow}`;
    }

    getManagedListSelectedTreeNode(list) {
        const items = Array.isArray(list?.items) ? list.items : [];
        return items.find(item => Number(item.id) === Number(this.selectedManagedListTreeNodeId)) || null;
    }

    collectManagedListVisibleNodeOrder(childrenByParent, parentId = 0, order = []) {
        const nodes = childrenByParent.get(Number(parentId)) || [];
        nodes.forEach((node) => {
            const nodeId = Number(node.id);
            order.push(nodeId);
            if (this.managedListTreeExpandedNodeIds.has(String(nodeId))) {
                this.collectManagedListVisibleNodeOrder(childrenByParent, nodeId, order);
            }
        });
        return order;
    }

    renderManagedListNodeEditor(list, selectedNode, _languageCodes, _fallbackCode, treeData) {
        if (!selectedNode) {
            return `
                <div class="managed-list-node-empty">
                    <p>Välj en nod i trädet till vänster.</p>
                    <p>Använd drag/drop för att bygga om strukturen.</p>
                </div>
            `;
        }

        void list;
        void treeData;
        const fallbackCode = 'en';
        const localeLabels = {
            en: 'English',
            sv: 'Svenska',
            fi: 'Finska',
            no: 'Norska'
        };
        const translations = this.getManagedListItemTranslations(selectedNode) || {};
        const languageCodes = this.getManagedListNodeLanguageCodes();
        const fallbackLabelValue = String(
            translations[fallbackCode]
            || selectedNode.label
            || selectedNode.display_value
            || selectedNode.value
            || ''
        );

        return `
            <div class="managed-list-node-editor managed-list-node-editor-compact">
                <div class="managed-list-node-editor-header">
                    <h5>Vald post: ${escapeHtml(String(selectedNode.label || selectedNode.display_value || selectedNode.value || `Rad ${selectedNode.id}`))}</h5>
                </div>
                <div class="managed-list-node-language-grid managed-list-node-language-grid-compact">
                    ${languageCodes.map((code) => {
                        const languageValue = code === fallbackCode
                            ? fallbackLabelValue
                            : String(translations[code] || '');
                        const isFallback = code === fallbackCode;
                        const labelSuffix = isFallback ? ' (fallback)' : '';
                        return `
                            <label>
                                <span>${escapeHtml(localeLabels[code] || code.toUpperCase())}${labelSuffix}</span>
                                <input
                                    type="text"
                                    class="form-control managed-list-node-translation-input"
                                    data-locale="${escapeHtml(code)}"
                                    value="${escapeHtml(languageValue)}"
                                >
                            </label>
                        `;
                    }).join('')}
                    <label style="grid-column: 1 / -1;">
                        <span>Beskrivning</span>
                        <textarea class="form-control" id="managed-list-node-description">${escapeHtml(String(selectedNode.description || ''))}</textarea>
                    </label>
                    <label>
                        <span>Sort order</span>
                        <input type="number" class="form-control" id="managed-list-node-sort-order" value="${Number(selectedNode.sort_order || 0)}">
                    </label>
                    <label class="managed-list-node-checkbox">
                        <input type="checkbox" id="managed-list-node-active" ${selectedNode.is_active !== false ? 'checked' : ''}>
                        Aktiv
                    </label>
                    <label class="managed-list-node-checkbox">
                        <input type="checkbox" id="managed-list-node-selectable" ${selectedNode.is_selectable !== false ? 'checked' : ''}>
                        Valbar i formulär
                    </label>
                </div>
                <div class="managed-list-node-editor-footer">
                    <button class="btn btn-primary" onclick="adminManager.saveManagedListTreeNode()">Uppdatera</button>
                </div>
            </div>
        `;
    }

    renderManagedListDetails(list) {
        const items = Array.isArray(list.items) ? list.items : [];
        const treeData = this.buildManagedListTreeData(list);
        this.managedListVisibleNodeOrder = this.collectManagedListVisibleNodeOrder(treeData.childrenByParent);
        const selectedNode = this.getManagedListSelectedTreeNode(list);
        const treeHtml = this.renderManagedListTreeNodes(treeData.childrenByParent, 0, 0, 'en');

        return `
            <div class="type-detail-view managed-list-detail-view">
                <div class="detail-header">
                    <div class="managed-list-detail-title">
                        <h3>${escapeHtml(list.name)}</h3>
                        <button class="btn-icon" title="Byt namn" onclick="adminManager.editManagedList(${Number(list.id)})">✏️</button>
                    </div>
                    <div class="managed-list-detail-actions">
                        <span class="managed-list-type-count">${items.length} rader</span>
                        <button class="btn btn-sm btn-secondary" onclick="adminManager.openManagedListJsonImport(${Number(list.id)})">Import JSON</button>
                        <button class="btn btn-sm btn-secondary" onclick="ListsAPI.export(${Number(list.id)}, 'json')">Export JSON</button>
                        <button class="btn btn-sm btn-danger" onclick="adminManager.closeManagedListWorkspace()">Stäng</button>
                        <input type="file" id="managed-list-json-import-input" accept=".json,application/json" style="display:none" onchange="adminManager.importManagedListJsonFile(event, ${Number(list.id)})">
                    </div>
                </div>

                <div class="managed-list-summary">
                    <span><strong>Kod:</strong> ${escapeHtml(String(list.code || '-'))}</span>
                    <span><strong>Status:</strong> ${list.is_active ? 'Aktiv' : 'Inaktiv'}</span>
                    <span><strong>Multival:</strong> ${list.allow_multiselect ? 'Ja' : 'Nej'}</span>
                </div>

                <div class="managed-list-tree-editor-layout">
                    <div class="managed-list-tree-panel">
                        <div class="section-header">
                            <h4>Träd</h4>
                            <button type="button" class="btn btn-sm btn-primary" onclick="adminManager.openManagedListInlineCreate(null)">
                                + Top-level
                            </button>
                        </div>
                        <div
                            class="managed-list-root-dropzone"
                            ondragenter="adminManager.onManagedListTreeDragEnter(event, null)"
                            ondragleave="adminManager.onManagedListTreeDragLeave(event)"
                            ondragover="adminManager.onManagedListTreeDragOver(event)"
                            ondrop="adminManager.onManagedListTreeDrop(event, null)"
                        >
                            Dra hit för top-level
                        </div>
                        <div class="managed-list-tree-scroll">
                            ${treeHtml || '<p class="empty-state">Inga noder ännu</p>'}
                        </div>
                    </div>
                    <div class="managed-list-editor-panel">
                        <div class="section-header">
                            <h4>Noddata</h4>
                        </div>
                        ${this.renderManagedListNodeEditor(list, selectedNode, [], 'en', treeData)}
                    </div>
                </div>
            </div>
        `;
    }

    openManagedListJsonImport(_listId) {
        const input = document.getElementById('managed-list-json-import-input');
        if (!input) return;
        input.value = '';
        input.click();
    }

    async importManagedListJsonFile(event, listId) {
        const file = event?.target?.files?.[0];
        if (!file) return;
        try {
            const text = await file.text();
            const parsed = JSON.parse(text);
            const payload = Array.isArray(parsed)
                ? { items: parsed }
                : (parsed && Array.isArray(parsed.items) ? { items: parsed.items } : null);
            if (!payload) {
                showToast('JSON måste innehålla en array eller { items: [...] }', 'error');
                return;
            }
            await ListsAPI.importJson(listId, payload);
            showToast('Import genomförd', 'success');
            await this.loadManagedLists();
        } catch (error) {
            console.error('Failed to import managed list JSON:', error);
            showToast(error.message || 'Kunde inte importera JSON', 'error');
        }
    }

    toggleManagedListTreeNode(nodeId) {
        const normalized = String(nodeId);
        if (!normalized) return;
        if (this.managedListTreeExpandedNodeIds.has(normalized)) {
            this.managedListTreeExpandedNodeIds.delete(normalized);
        } else {
            this.managedListTreeExpandedNodeIds.add(normalized);
        }
        this.renderManagedListCurrentSurface();
    }

    openManagedListInlineCreate(parentItemId = null) {
        const normalizedParent = Number.isFinite(Number(parentItemId)) && Number(parentItemId) > 0
            ? Number(parentItemId)
            : 0;
        this.managedListInlineCreateParentId = normalizedParent;
        if (normalizedParent > 0) {
            this.managedListTreeExpandedNodeIds.add(String(normalizedParent));
            this.selectedManagedListTreeNodeId = normalizedParent;
            this.selectedManagedListTreeNodeIds = new Set([normalizedParent]);
            this.managedListTreeSelectionAnchorId = normalizedParent;
        }
        this.renderManagedListCurrentSurface();
        window.setTimeout(() => {
            const input = document.getElementById('managed-list-inline-create-value');
            if (input) input.focus();
        }, 0);
    }

    cancelManagedListInlineCreate() {
        this.managedListInlineCreateParentId = null;
        this.renderManagedListCurrentSurface();
    }

    async submitManagedListInlineCreate() {
        const input = document.getElementById('managed-list-inline-create-value');
        const fallbackValue = String(input?.value || '').trim();
        if (!fallbackValue) {
            showToast('Ange ett namn för noden', 'error');
            return;
        }
        await this.createManagedListTreeNode(this.managedListInlineCreateParentId, fallbackValue);
    }

    selectManagedListTreeNode(itemId, event = null) {
        const id = Number(itemId) || null;
        if (!id) return;

        const current = new Set(this.selectedManagedListTreeNodeIds || []);
        const isCtrlLike = Boolean(event?.ctrlKey || event?.metaKey);
        const isShift = Boolean(event?.shiftKey);

        if (isShift && this.managedListTreeSelectionAnchorId && this.managedListVisibleNodeOrder.length) {
            const anchor = Number(this.managedListTreeSelectionAnchorId);
            const anchorIndex = this.managedListVisibleNodeOrder.indexOf(anchor);
            const targetIndex = this.managedListVisibleNodeOrder.indexOf(id);
            if (anchorIndex >= 0 && targetIndex >= 0) {
                const start = Math.min(anchorIndex, targetIndex);
                const end = Math.max(anchorIndex, targetIndex);
                const rangeIds = this.managedListVisibleNodeOrder.slice(start, end + 1);
                this.selectedManagedListTreeNodeIds = isCtrlLike ? new Set([...current, ...rangeIds]) : new Set(rangeIds);
            } else {
                this.selectedManagedListTreeNodeIds = new Set([id]);
            }
        } else if (isCtrlLike) {
            if (current.has(id)) current.delete(id);
            else current.add(id);
            this.selectedManagedListTreeNodeIds = current.size ? current : new Set([id]);
            this.managedListTreeSelectionAnchorId = id;
        } else {
            this.selectedManagedListTreeNodeIds = new Set([id]);
            this.managedListTreeSelectionAnchorId = id;
        }

        this.selectedManagedListTreeNodeId = id;
        this.renderManagedListCurrentSurface();
    }

    getManagedListTopLevelSelection(nodeIds, items) {
        const selection = new Set((nodeIds || []).map(id => Number(id)).filter(id => id > 0));
        const byId = new Map((items || []).map(item => [Number(item.id), item]));
        const visibleOrderIndex = new Map((this.managedListVisibleNodeOrder || []).map((id, idx) => [Number(id), idx]));

        const topLevelIds = Array.from(selection).filter((nodeId) => {
            let parentId = Number(byId.get(nodeId)?.parent_item_id || 0);
            while (parentId > 0) {
                if (selection.has(parentId)) return false;
                parentId = Number(byId.get(parentId)?.parent_item_id || 0);
            }
            return true;
        });

        topLevelIds.sort((a, b) => {
            const ia = Number(visibleOrderIndex.get(a));
            const ib = Number(visibleOrderIndex.get(b));
            const safeA = Number.isFinite(ia) ? ia : Number.MAX_SAFE_INTEGER;
            const safeB = Number.isFinite(ib) ? ib : Number.MAX_SAFE_INTEGER;
            return safeA - safeB;
        });
        return topLevelIds;
    }

    clearManagedListDropHighlights() {
        document
            .querySelectorAll('.managed-list-drop-target')
            .forEach((element) => element.classList.remove('managed-list-drop-target'));
    }

    onManagedListTreeDragStart(event, nodeId) {
        const id = Number(nodeId || 0);
        if (!id) return;
        const list = this.selectedManagedListDetail;
        const items = Array.isArray(list?.items) ? list.items : [];
        const selectedIds = this.selectedManagedListTreeNodeIds.has(id)
            ? Array.from(this.selectedManagedListTreeNodeIds)
            : [id];
        const dragCandidateIds = this.getManagedListTopLevelSelection(selectedIds, items);

        const blockedId = dragCandidateIds.find((candidateId) => {
            const hasChildren = items.some(item => Number(item.parent_item_id || 0) === Number(candidateId));
            const isExpanded = this.managedListTreeExpandedNodeIds.has(String(candidateId));
            return hasChildren && isExpanded;
        });
        if (blockedId) {
            if (event) event.preventDefault();
            showToast('Kollapsa noden innan du flyttar den', 'error');
            return;
        }

        this.selectedManagedListTreeNodeId = id;
        this.selectedManagedListTreeNodeIds = new Set(dragCandidateIds.length ? dragCandidateIds : [id]);
        this.managedListTreeSelectionAnchorId = id;
        this.managedListDraggedNodeIds = dragCandidateIds.length ? dragCandidateIds : [id];
        this.managedListDraggedNodeId = id;

        if (event?.dataTransfer) {
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData('text/plain', String(id));
        }
    }

    onManagedListTreeDragEnter(event, _targetNodeId = null) {
        if (!event) return;
        event.preventDefault();
        this.clearManagedListDropHighlights();
        event.currentTarget?.classList?.add('managed-list-drop-target');
    }

    onManagedListTreeDragLeave(event) {
        if (!event) return;
        const container = event.currentTarget;
        if (container && event.relatedTarget && container.contains(event.relatedTarget)) {
            return;
        }
        container?.classList?.remove('managed-list-drop-target');
    }

    onManagedListTreeDragOver(event) {
        if (!event) return;
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    }

    onManagedListTreeDragEnd() {
        this.managedListDraggedNodeId = null;
        this.managedListDraggedNodeIds = [];
        this.clearManagedListDropHighlights();
    }

    async onManagedListTreeDrop(event, targetNodeId = null) {
        if (event) event.preventDefault();
        this.clearManagedListDropHighlights();
        const draggedFromTransfer = Number(event?.dataTransfer?.getData('text/plain') || 0);
        const fallbackSourceId = Number(draggedFromTransfer || this.managedListDraggedNodeId || 0);
        const sourceNodeIds = (Array.isArray(this.managedListDraggedNodeIds) && this.managedListDraggedNodeIds.length)
            ? this.managedListDraggedNodeIds.map(id => Number(id)).filter(id => id > 0)
            : (fallbackSourceId ? [fallbackSourceId] : []);
        const newParentId = Number(targetNodeId || 0) || null;
        if (!sourceNodeIds.length) return;
        if (newParentId && sourceNodeIds.includes(newParentId)) return;
        try {
            for (const sourceNodeId of sourceNodeIds) {
                await ListsAPI.moveItem(sourceNodeId, { new_parent_id: newParentId });
            }
            if (newParentId) this.managedListTreeExpandedNodeIds.add(String(newParentId));
            this.selectedManagedListTreeNodeIds = new Set(sourceNodeIds);
            this.selectedManagedListTreeNodeId = sourceNodeIds[0] || null;
            showToast(sourceNodeIds.length > 1 ? `${sourceNodeIds.length} noder flyttade` : 'Nod flyttad', 'success');
            await this.loadManagedLists();
        } catch (error) {
            console.error('Failed to move managed list node:', error);
            showToast(error.message || 'Kunde inte flytta nod', 'error');
        } finally {
            this.managedListDraggedNodeId = null;
            this.managedListDraggedNodeIds = [];
            this.clearManagedListDropHighlights();
        }
    }

    async createManagedListTreeNode(parentItemId = null, fallbackValue = '') {
        if (!this.selectedManagedListId) {
            showToast('Välj en lista först', 'error');
            return;
        }

        const list = this.selectedManagedListDetail || this.managedLists.find(item => Number(item.id) === Number(this.selectedManagedListId));
        if (!list) return;

        const normalizedFallbackValue = String(fallbackValue || '').trim();
        if (!normalizedFallbackValue) return;

        const payload = {
            label: normalizedFallbackValue,
            code: '',
            description: '',
            value_translations: { en: normalizedFallbackValue },
            is_active: true,
            is_selectable: true
        };

        if (Number.isFinite(Number(parentItemId)) && Number(parentItemId) > 0) {
            payload.parent_id = Number(parentItemId);
        }

        try {
            const created = await ListsAPI.addItem(this.selectedManagedListId, payload);
            this.selectedManagedListTreeNodeId = Number(created?.id) || null;
            this.selectedManagedListTreeNodeIds = this.selectedManagedListTreeNodeId
                ? new Set([this.selectedManagedListTreeNodeId])
                : new Set();
            this.managedListTreeSelectionAnchorId = this.selectedManagedListTreeNodeId;
            this.managedListInlineCreateParentId = null;
            if (Number.isFinite(Number(parentItemId)) && Number(parentItemId) > 0) {
                this.managedListTreeExpandedNodeIds.add(String(parentItemId));
            }
            showToast('Nod skapad', 'success');
            await this.loadManagedLists();
        } catch (error) {
            console.error('Failed to create managed list tree node:', error);
            showToast(error.message || 'Kunde inte skapa nod', 'error');
        }
    }

    async createManagedListTreeChildNode() {
        const parentId = Number(this.selectedManagedListTreeNodeId || 0);
        if (!parentId) {
            showToast('Välj en parent-nod först', 'error');
            return;
        }
        this.openManagedListInlineCreate(parentId);
    }

    async moveManagedListTreeNodeToRoot() {
        if (!this.selectedManagedListId || !this.selectedManagedListTreeNodeId) return;
        try {
            await ListsAPI.updateItem(this.selectedManagedListTreeNodeId, {
                parent_id: null
            });
            showToast('Noden flyttades till top-level', 'success');
            await this.loadManagedLists();
        } catch (error) {
            console.error('Failed to move managed list node to root:', error);
            showToast(error.message || 'Kunde inte flytta noden', 'error');
        }
    }

    async saveManagedListTreeNode() {
        if (!this.selectedManagedListId || !this.selectedManagedListTreeNodeId) return;

        const list = this.selectedManagedListDetail || this.managedLists.find(item => Number(item.id) === Number(this.selectedManagedListId));
        const selectedNode = this.getManagedListSelectedTreeNode(list);
        if (!list || !selectedNode) return;
        const fallbackCode = 'en';
        const translationInputs = Array.from(document.querySelectorAll('.managed-list-node-translation-input'));
        const valueTranslations = {};
        translationInputs.forEach((input) => {
            const locale = this.sanitizeLanguageCode(input?.dataset?.locale);
            const value = String(input?.value || '').trim();
            if (locale && value) {
                valueTranslations[locale] = value;
            }
        });
        const label = String(valueTranslations[fallbackCode] || '').trim();
        const description = String(document.getElementById('managed-list-node-description')?.value || '').trim();
        const sortOrder = Number(document.getElementById('managed-list-node-sort-order')?.value || 0);
        const isActive = Boolean(document.getElementById('managed-list-node-active')?.checked);
        const isSelectable = Boolean(document.getElementById('managed-list-node-selectable')?.checked);
        if (!label) {
            showToast('English (fallback) är obligatoriskt', 'error');
            return;
        }

        try {
            await ListsAPI.updateItem(this.selectedManagedListTreeNodeId, {
                label,
                description: description || null,
                value_translations: valueTranslations,
                sort_order: Number.isFinite(sortOrder) ? sortOrder : 0,
                is_active: isActive,
                is_selectable: isSelectable
            });
            showToast('Nod uppdaterad', 'success');
            await this.loadManagedLists();
        } catch (error) {
            console.error('Failed to save managed list tree node:', error);
            showToast(error.message || 'Kunde inte uppdatera noden', 'error');
        }
    }

    async createManagedListChildLink(parentListId) {
        const select = document.getElementById(`managed-list-add-child-${parentListId}`);
        const childListId = Number(select?.value || 0);
        if (!childListId) {
            showToast('Välj en barnlista', 'error');
            return;
        }
        try {
            await ManagedListsAPI.addLink({ parent_list_id: parentListId, child_list_id: childListId, relation_key: 'depends_on' });
            showToast('Barnlista kopplad', 'success');
            await this.loadManagedLists();
        } catch (error) {
            console.error('Failed to create managed list child link:', error);
            showToast(error.message || 'Kunde inte koppla barnlista', 'error');
        }
    }

    async createManagedListParentLink(childListId) {
        const select = document.getElementById(`managed-list-add-parent-${childListId}`);
        const parentListId = Number(select?.value || 0);
        if (!parentListId) {
            showToast('Välj en föräldralista', 'error');
            return;
        }
        try {
            await ManagedListsAPI.addLink({ parent_list_id: parentListId, child_list_id: childListId, relation_key: 'depends_on' });
            showToast('Föräldralista kopplad', 'success');
            await this.loadManagedLists();
        } catch (error) {
            console.error('Failed to create managed list parent link:', error);
            showToast(error.message || 'Kunde inte koppla föräldralista', 'error');
        }
    }

    async deleteManagedListLink(linkId) {
        if (!confirm('Ta bort denna listkoppling och tillhörande värdekopplingar?')) return;
        try {
            await ManagedListsAPI.deleteLink(linkId);
            showToast('Listkoppling borttagen', 'success');
            await this.loadManagedLists();
        } catch (error) {
            console.error('Failed to delete managed list link:', error);
            showToast(error.message || 'Kunde inte ta bort listkoppling', 'error');
        }
    }

    async createManagedListItemLink(linkId) {
        const parentSelect = document.getElementById(`managed-list-item-link-parent-${linkId}`);
        const childSelect = document.getElementById(`managed-list-item-link-child-${linkId}`);
        const parentItemId = Number(parentSelect?.value || 0);
        const childItemId = Number(childSelect?.value || 0);
        if (!parentItemId || !childItemId) {
            showToast('Välj både parent- och child-värde', 'error');
            return;
        }
        try {
            await ManagedListsAPI.addItemLink({
                list_link_id: linkId,
                parent_item_id: parentItemId,
                child_item_id: childItemId
            });
            showToast('Värdekoppling skapad', 'success');
            await this.loadManagedLists();
        } catch (error) {
            console.error('Failed to create managed list item link:', error);
            showToast(error.message || 'Kunde inte skapa värdekoppling', 'error');
        }
    }

    async deleteManagedListItemLink(itemLinkId) {
        try {
            await ManagedListsAPI.deleteItemLink(itemLinkId);
            showToast('Värdekoppling borttagen', 'success');
            await this.loadManagedLists();
        } catch (error) {
            console.error('Failed to delete managed list item link:', error);
            showToast(error.message || 'Kunde inte ta bort värdekoppling', 'error');
        }
    }

    async selectManagedList(listId) {
        this.selectedManagedListId = listId;
        this.selectedManagedListTreeNodeId = null;
        this.selectedManagedListTreeNodeIds = new Set();
        this.managedListTreeSelectionAnchorId = null;
        this.managedListInlineCreateParentId = null;
        this.managedListTreeExpandedNodeIds = new Set();
        try {
            this.selectedManagedListDetail = await ListsAPI.getById(listId, true, true);
        } catch (error) {
            console.error('Failed to fetch selected managed list detail:', error);
            this.selectedManagedListDetail = null;
        }
        this.renderManagedLists();
    }

    async createManagedList() {
        const input = document.getElementById('new-managed-list-name');
        const name = (input?.value || '').trim();
        const codeInput = document.getElementById('new-managed-list-code');
        const code = String(codeInput?.value || '').trim();
        if (!name) {
            showToast('Ange ett namn för listan', 'error');
            return;
        }

        try {
            const created = await ListsAPI.create({ name, code });
            this.selectedManagedListId = created.id;
            if (input) input.value = '';
            if (codeInput) codeInput.value = '';
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
            await ListsAPI.update(listId, { name: trimmed });
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
            await ListsAPI.delete(listId);
            showToast('Lista borttagen', 'success');
            if (Number(this.selectedManagedListId) === Number(listId)) {
                this.closeManagedListWorkspace();
            }
            await this.loadManagedLists();
        } catch (error) {
            console.error('Failed to delete managed list:', error);
            const blockedFields = Array.isArray(error?.details?.used_by_fields)
                ? error.details.used_by_fields
                : [];
            let message = error.message || 'Kunde inte ta bort lista';
            if (blockedFields.length) {
                const refs = blockedFields
                    .slice(0, 5)
                    .map(item => `${item.object_type}.${item.field_name}`)
                    .join(', ');
                const extra = blockedFields.length > 5 ? `, +${blockedFields.length - 5} till` : '';
                message = `Listan används av fält: ${refs}${extra}`;
            } else if (error?.details && typeof error.details === 'string') {
                message = `${message}: ${error.details}`;
            }
            showToast(message, 'error');
        }
    }

    async createManagedListItem() {
        if (!this.selectedManagedListId) {
            showToast('Välj en lista först', 'error');
            return;
        }

        const list = this.managedLists.find(item => item.id === this.selectedManagedListId);
        const languageCodes = this.getManagedListLanguageCodes(list);
        const fallbackCode = this.getManagedListFallbackLanguageCode(list, languageCodes);

        const valueTranslations = {};
        languageCodes.forEach((code, index) => {
            const inputId = this.buildLocaleInputId('new-managed-list-item-value', code, index);
            const input = document.getElementById(inputId);
            const value = String(input?.value || '').trim();
            if (value) {
                valueTranslations[code] = value;
            }
        });

        const fallbackValue = String(valueTranslations[fallbackCode] || '').trim();

        if (!fallbackValue) {
            showToast(`${fallbackCode.toUpperCase()} (fallback) är obligatoriskt`, 'error');
            return;
        }

        try {
            await ManagedListsAPI.addItem(this.selectedManagedListId, {
                value: fallbackValue,
                value_translations: valueTranslations
            });
            languageCodes.forEach((code, index) => {
                const inputId = this.buildLocaleInputId('new-managed-list-item-value', code, index);
                const input = document.getElementById(inputId);
                if (input) input.value = '';
            });
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

    async updateManagedListLanguages() {
        // Kept for backwards compatibility with older onclick bindings.
    }

    async updateManagedListItemInline(itemId) {
        if (!this.selectedManagedListId) return;

        const row = document.getElementById(`managed-list-item-row-${itemId}`);
        if (!row) return;
        if (row.dataset.saving === 'true') return;

        const list = this.managedLists.find(item => item.id === this.selectedManagedListId);
        const item = list?.items?.find(currentItem => currentItem.id === itemId);
        if (!item) return;

        const inputs = Array.from(row.querySelectorAll('.managed-list-item-input'));
        if (!inputs.length) return;
        const fallbackCode = this.getManagedListFallbackLanguageCode(list);

        const valueTranslations = {};
        let nextFallback = '';
        let hasChanged = false;

        inputs.forEach((input) => {
            const locale = this.sanitizeLanguageCode(input.dataset.locale);
            const original = String(input.dataset.originalValue || '').trim();
            const next = String(input.value || '').trim();
            if (next !== original) {
                hasChanged = true;
            }
            if (locale && next) {
                valueTranslations[locale] = next;
            }
            if (locale === fallbackCode) {
                nextFallback = next;
            }
        });

        if (!nextFallback) {
            showToast(`${fallbackCode.toUpperCase()} (fallback) kan inte vara tomt`, 'error');
            const fallbackInput = inputs.find(input => this.sanitizeLanguageCode(input.dataset.locale) === fallbackCode);
            if (fallbackInput) {
                fallbackInput.value = String(fallbackInput.dataset.originalValue || '').trim();
            }
            return;
        }

        if (!hasChanged) {
            return;
        }

        try {
            row.dataset.saving = 'true';
            await ManagedListsAPI.updateItem(this.selectedManagedListId, itemId, {
                value: nextFallback,
                value_translations: valueTranslations
            });
            inputs.forEach((input) => {
                input.dataset.originalValue = String(input.value || '').trim();
            });
            item.value = nextFallback;
            item.value_translations = valueTranslations;
            await this.loadManagedLists();
        } catch (error) {
            console.error('Failed to inline-update managed list item:', error);
            showToast(error.message || 'Kunde inte uppdatera rad', 'error');
            inputs.forEach((input) => {
                input.value = String(input.dataset.originalValue || '').trim();
            });
        } finally {
            row.dataset.saving = 'false';
        }
    }

    async deleteManagedListItem(itemId) {
        if (!this.selectedManagedListId) return;

        try {
            await ListsAPI.deleteItem(itemId);
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
        this.setFieldHierarchySettingsFromFieldOptions(null);
        this.updateFieldHierarchySettingsVisibility();
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
        this.setFieldHierarchySettingsFromFieldOptions(field.field_options);
        
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

    async toggleFieldDetailVisible(fieldId, isDetailVisible) {
        if (!this.selectedType) return;
        const field = (this.selectedType.fields || []).find(item => Number(item.id) === Number(fieldId));
        if (!field) return;
        const nextValue = Boolean(isDetailVisible);
        if (field.is_detail_visible === nextValue) return;

        try {
            await ObjectTypesAPI.updateField(this.selectedType.id, fieldId, { is_detail_visible: nextValue });
            field.is_detail_visible = nextValue;
        } catch (error) {
            console.error('Failed to update field detail visibility:', error);
            showToast(error.message || 'Kunde inte uppdatera synlighet i detaljvy', 'error');
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
        const managedListOptions = adminManager?.buildFieldManagedListOptionsForModal({ mode });
        if (managedListOptions) {
            data.field_options = managedListOptions;
        }
    } else {
        data = {
            is_required: document.getElementById('field-required').checked
        };
        const managedListOptions = adminManager?.buildFieldManagedListOptionsForModal({ mode, fieldId });
        if (managedListOptions) {
            data.field_options = managedListOptions;
        }
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
    const optionsResult = adminManager?.buildFieldTemplateOptions(fieldTypeValue);
    if (optionsResult?.error) {
        showToast(optionsResult.error, 'error');
        return;
    }
    const templateOptions = optionsResult?.value ?? '';

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
