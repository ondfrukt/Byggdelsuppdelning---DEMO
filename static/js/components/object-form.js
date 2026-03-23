/**
 * Object Form Component
 * Dynamically generates forms based on ObjectType fields
 */

const objectFormTextCollator = new Intl.Collator('sv', {
    sensitivity: 'base',
    numeric: true,
    ignorePunctuation: true
});

class ObjectFormComponent {
    constructor(objectType, existingObject = null) {
        this.objectType = objectType;
        this.existingObject = existingObject;
        this.fields = [];
        this.managedListValues = {};
        this.managedListItemsByListId = {};
        this.managedListDependencyRequestTokens = {};
        this.managedMultiImportTableByField = {};
        this.managedMultiImportRowsByField = {};
        this.richTextWindowState = null;
        this.richTextCopiedFormat = null;
        this.richTextApplyButtonApis = new Set();
    }
    
    async loadFields() {
        try {
            const existingObjectFields = this.existingObject?.object_type?.fields;
            if (Array.isArray(existingObjectFields) && existingObjectFields.length > 0) {
                this.fields = existingObjectFields.map(field => ({
                    ...field,
                    is_required: field.is_required_effective ?? field.is_required
                })).sort((a, b) => (a.display_order || 9999) - (b.display_order || 9999));
            } else {
                const typeData = await ObjectTypesAPI.getById(this.objectType.id);
                this.fields = (typeData.fields || [])
                    .slice()
                    .sort((a, b) => (a.display_order || 9999) - (b.display_order || 9999));
            }
            await this.loadDynamicSelectOptions();
        } catch (error) {
            console.error('Failed to load fields:', error);
            throw error;
        }
    }

    async loadDynamicSelectOptions() {
        const managedListIds = this.fields
            .filter(field => field.field_type === 'select')
            .map(field => this.normalizeFieldOptions(field.field_options || field.options))
            .filter(options => options?.source === 'managed_list')
            .map(options => Number(options.list_id))
            .filter(listId => Number.isFinite(listId) && listId > 0);

        this.managedListValues = {};
        this.managedListItemsByListId = {};
        if (managedListIds.length > 0) {
            const uniqueIds = Array.from(new Set(managedListIds));
            await Promise.all(uniqueIds.map(async (listId) => {
                try {
                    const managedList = await ManagedListsAPI.getById(listId, true, false);
                    const items = (managedList?.items || [])
                        .filter(item => item.is_active !== false)
                        .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
                    this.managedListItemsByListId[listId] = items.map(item => ({
                        id: Number(item.id),
                        value: String(item.value || item.label || '').trim(),
                        label: String(item.display_value || item.label || item.value || '').trim(),
                        parent_item_id: Number(item.parent_item_id || 0) || null,
                        is_selectable: item.is_selectable !== false
                    })).filter(item => Number.isFinite(item.id));
                    this.managedListValues[listId] = this.managedListItemsByListId[listId]
                        .filter(item => item.is_selectable !== false)
                        .map(item => ({
                            value: String(item.id),
                            label: item.label
                        }))
                        .filter(item => item.value && item.label);
                } catch (error) {
                    console.error(`Failed to load managed list ${listId} for object form:`, error);
                    this.managedListItemsByListId[listId] = [];
                    this.managedListValues[listId] = [];
                }
            }));
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

        this.setupManagedListMultiSelects(container);
        this.setupManagedListDependencies(container);
        this.setupManagedListHierarchySelectors(container);
        await this.initializeRichTextEditors(container);
        this.applyConnectionNameRules();
        this.setupCategoryNodeFields(container);
        this.setupTagFields(container);
    }

    getManagedListFieldOptions(field) {
        if (!field || String(field.field_type || '').toLowerCase() !== 'select') return null;
        const normalizedOptions = this.normalizeFieldOptions(field.field_options || field.options);
        if (normalizedOptions?.source !== 'managed_list') return null;
        const listId = Number(normalizedOptions?.list_id);
        if (!Number.isFinite(listId) || listId <= 0) return null;
        return normalizedOptions;
    }

    getManagedListHierarchyConfig(field) {
        const options = this.getManagedListFieldOptions(field);
        if (!options || options.parent_field_name) return null;
        if (String(options.selection_mode || 'single').toLowerCase() === 'multi') return null;
        const hierarchyLevelCount = Number(options.hierarchy_level_count || 0);
        const labels = Array.isArray(options.hierarchy_level_labels)
            ? options.hierarchy_level_labels.map(label => String(label || '').trim()).filter(Boolean).slice(0, 8)
            : [];
        const hierarchyEnabled = hierarchyLevelCount > 1 || labels.length > 1;
        if (!hierarchyEnabled) return null;

        const listId = Number(options.list_id || 0);
        if (!Number.isFinite(listId) || listId <= 0) return null;

        const maxDepth = this.getManagedListMaxDepth(listId);
        if (!Number.isFinite(maxDepth) || maxDepth <= 0) return null;
        const levelCount = Math.min(8, Math.max(1, Math.floor(hierarchyLevelCount || maxDepth)));

        return {
            levelCount,
            labels: Array.from({ length: levelCount }, (_, idx) => labels[idx] || `Nivå ${idx + 1}`),
            allowOnlyLeafSelection: Boolean(options.allow_only_leaf_selection)
        };
    }

    buildManagedListItemMaps(listId) {
        const items = this.managedListItemsByListId[Number(listId)] || [];
        const byId = new Map();
        const childrenByParent = new Map();

        items.forEach(item => {
            const itemId = Number(item?.id);
            if (!Number.isFinite(itemId) || itemId <= 0 || item.is_active === false) return;
            byId.set(itemId, item);
            const parentId = Number(item?.parent_item_id || 0);
            const key = Number.isFinite(parentId) && parentId > 0 ? parentId : 0;
            if (!childrenByParent.has(key)) {
                childrenByParent.set(key, []);
            }
            childrenByParent.get(key).push(item);
        });

        childrenByParent.forEach((children, parentId) => {
            children.sort((a, b) => {
                const orderDiff = Number(a.sort_order || 0) - Number(b.sort_order || 0);
                if (orderDiff !== 0) return orderDiff;
                return objectFormTextCollator.compare(String(a.label || a.value || ''), String(b.label || b.value || ''));
            });
            childrenByParent.set(parentId, children);
        });

        return { byId, childrenByParent };
    }

    getManagedListMaxDepth(listId) {
        const { byId } = this.buildManagedListItemMaps(listId);
        if (!byId.size) return 1;

        const depthById = new Map();
        const computeDepth = (itemId, visiting = new Set()) => {
            const safeId = Number(itemId || 0);
            if (!Number.isFinite(safeId) || safeId <= 0 || !byId.has(safeId)) return 0;
            if (depthById.has(safeId)) return depthById.get(safeId);
            if (visiting.has(safeId)) return 1;
            visiting.add(safeId);

            const parentId = Number(byId.get(safeId)?.parent_item_id || 0);
            const parentDepth = computeDepth(parentId, visiting);
            const depth = Math.max(1, parentDepth + 1);
            depthById.set(safeId, depth);
            visiting.delete(safeId);
            return depth;
        };

        let maxDepth = 1;
        byId.forEach((_item, itemId) => {
            maxDepth = Math.max(maxDepth, computeDepth(itemId));
        });
        return maxDepth;
    }

    getManagedListPathToItem(listId, itemId) {
        const safeItemId = Number(itemId || 0);
        if (!Number.isFinite(safeItemId) || safeItemId <= 0) return [];
        const { byId } = this.buildManagedListItemMaps(listId);
        if (!byId.has(safeItemId)) return [];

        const chain = [];
        let currentId = safeItemId;
        const visited = new Set();
        while (currentId && byId.has(currentId) && !visited.has(currentId)) {
            visited.add(currentId);
            chain.push(currentId);
            const parentId = Number(byId.get(currentId)?.parent_item_id || 0);
            currentId = Number.isFinite(parentId) && parentId > 0 ? parentId : 0;
        }
        return chain.reverse();
    }

    getManagedListItemIdByValue(listId, value) {
        const normalized = String(value || '').trim();
        if (!normalized) return null;
        const asInt = Number(normalized);
        if (Number.isFinite(asInt) && asInt > 0) {
            return asInt;
        }
        const items = this.managedListItemsByListId[Number(listId)] || [];
        const found = items.find(item => String(item.value) === normalized);
        return found ? Number(found.id) : null;
    }

    getManagedListSelectSelectedValue(listId, rawValue) {
        const normalized = String(rawValue || '').trim();
        if (!normalized) return '';
        const asInt = Number(normalized);
        if (Number.isFinite(asInt) && asInt > 0) return String(asInt);
        const itemId = this.getManagedListItemIdByValue(listId, normalized);
        return itemId ? String(itemId) : '';
    }

    getManagedListMultiSelectedValues(listId, rawValue) {
        const source = rawValue && typeof rawValue === 'object' && !Array.isArray(rawValue)
            ? rawValue.selected_ids
            : rawValue;
        const values = Array.isArray(source)
            ? source
            : (typeof source === 'string' ? source.split(',').map(part => part.trim()).filter(Boolean) : []);
        return values
            .map((value) => this.getManagedListSelectSelectedValue(listId, value))
            .filter(Boolean);
    }

    buildManagedListMultiOptionMarkup(option, selectedValues = []) {
        return window.ManagedMultiSelect.buildOptionMarkup(option, selectedValues);
    }

    renderManagedMultiSelectField(field, options, managedOptions, rawValue, required) {
        const listId = Number(managedOptions?.list_id || 0);
        const selectedValues = this.getManagedListMultiSelectedValues(listId, rawValue);
        return window.ManagedMultiSelect.render({
            fieldName: field.field_name,
            inputId: `field-${field.field_name}`,
            inputName: field.field_name,
            options: options || [],
            selectedValues,
            required: Boolean(required),
            searchPlaceholder: 'Sök och klicka för att lägga till flera val...',
            actions: [
                { key: 'import', label: 'Hämta', className: 'btn btn-secondary btn-sm' },
                { key: 'select-all', label: 'Alla', className: 'btn btn-secondary btn-sm' },
                { key: 'clear', label: 'Rensa', className: 'btn btn-secondary btn-sm' }
            ]
        });
    }

    syncManagedMultiSelectSummary(wrapper, hiddenSelect) {
        if (!wrapper || !hiddenSelect) return;
        window.ManagedMultiSelect.sync(wrapper);
    }

    syncManagedMultiSelectUi(wrapper) {
        if (!wrapper) return;
        window.ManagedMultiSelect.sync(wrapper);
    }

    filterManagedMultiSelectOptions(wrapper, searchTerm = '') {
        if (!wrapper) return;
        window.ManagedMultiSelect.filter(wrapper, searchTerm);
    }

    getManagedMultiValueLabels(field, rawValue) {
        const managedOptions = this.getManagedListFieldOptions(field);
        if (!managedOptions) return [];
        const listId = Number(managedOptions.list_id || 0);
        const selectedValues = this.getManagedListMultiSelectedValues(listId, rawValue);
        const optionMap = new Map((this.managedListValues[listId] || []).map(item => [String(item.value), String(item.label || item.value)]));
        return selectedValues.map(value => optionMap.get(String(value)) || String(value)).filter(Boolean);
    }

    getManagedMultiValueSummary(field, rawValue) {
        const labels = this.getManagedMultiValueLabels(field, rawValue);
        if (!labels.length) return '-';
        if (labels.length <= 3) return labels.join(', ');
        return `${labels.slice(0, 3).join(', ')} +${labels.length - 3}`;
    }

    getFieldIdentityMatcher(field, candidateField) {
        if (!field || !candidateField) return false;
        const sourceTemplateId = Number(field.field_template_id || 0);
        const candidateTemplateId = Number(candidateField.field_template_id || 0);
        if (sourceTemplateId > 0 && candidateTemplateId > 0) {
            return sourceTemplateId === candidateTemplateId;
        }

        const sourceOptions = this.getManagedListFieldOptions(field) || {};
        const candidateOptions = this.normalizeFieldOptions(candidateField.field_options || candidateField.options) || {};
        return (
            String(candidateField.field_type || '').toLowerCase() === String(field.field_type || '').toLowerCase()
            && this.normalizeFieldKey(candidateField.field_name) === this.normalizeFieldKey(field.field_name)
            && Number(candidateOptions.list_id || 0) === Number(sourceOptions.list_id || 0)
        );
    }

    getObjectDisplayNameForImport(obj) {
        return obj?.data?.Namn || obj?.data?.namn || obj?.data?.Name || obj?.data?.name || obj?.id_full || `Objekt ${obj?.id || ''}`;
    }

    async loadManagedMultiImportRows(field) {
        const objectTypes = await ObjectTypesAPI.getAll(true);
        const compatibleTypes = (objectTypes || []).map(type => {
            const candidateField = (type.fields || []).find(item => this.getFieldIdentityMatcher(field, item));
            return candidateField ? { type, candidateField } : null;
        }).filter(Boolean);

        const rows = [];
        for (const entry of compatibleTypes) {
            const { type, candidateField } = entry;
            let objects = [];
            try {
                objects = await ObjectsAPI.getAll({ type: type.name });
            } catch (error) {
                console.error('Failed to load candidate objects for multi-import:', type.name, error);
                continue;
            }

            objects.forEach(obj => {
                if (Number(obj?.id) === Number(this.existingObject?.id || 0)) return;
                const rawValue = obj?.data?.[candidateField.field_name];
                const labels = this.getManagedMultiValueLabels(field, rawValue);
                if (!labels.length) return;
                rows.push({
                    object_id: Number(obj.id),
                    id_full: obj.id_full || 'N/A',
                    type: obj.object_type?.name || type.name || 'N/A',
                    name: this.getObjectDisplayNameForImport(obj),
                    values: labels.join(', '),
                    rawValue
                });
            });
        }

        return rows;
    }

    ensureManagedMultiImportModal(field) {
        const modalId = `managed-multi-import-modal-${field.field_name}`;
        let modal = document.getElementById(modalId);
        if (modal) return modal;

        modal = document.createElement('div');
        modal.id = modalId;
        modal.className = 'managed-multi-import-modal';
        modal.innerHTML = `
            <div class="managed-multi-import-backdrop" data-managed-multi-import-close="${escapeHtml(field.field_name)}"></div>
            <div class="managed-multi-import-dialog" role="dialog" aria-modal="true" aria-labelledby="${escapeHtml(modalId)}-title">
                <div class="modal-header">
                    <h3 id="${escapeHtml(modalId)}-title">Hämta värden från annat objekt</h3>
                    <button class="close-btn" type="button" data-managed-multi-import-close="${escapeHtml(field.field_name)}">&times;</button>
                </div>
                <div class="managed-multi-import-body">
                    <p class="managed-multi-import-help">Sök upp ett objekt med samma fält och hämta dess valda värden.</p>
                    <div id="${escapeHtml(modalId)}-table"></div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        modal.querySelectorAll('[data-managed-multi-import-close]').forEach(button => {
            button.addEventListener('click', () => this.closeManagedMultiImportModal(field.field_name));
        });

        return modal;
    }

    closeManagedMultiImportModal(fieldName) {
        const modal = document.getElementById(`managed-multi-import-modal-${fieldName}`);
        if (modal) {
            modal.style.display = 'none';
        }
    }

    applyManagedMultiImportedValues(field, rawValue) {
        const wrapper = document.querySelector(`[data-managed-multi-field="${CSS.escape(field.field_name)}"]`);
        if (!wrapper) return;
        const managedOptions = this.getManagedListFieldOptions(field);
        if (!managedOptions) return;

        const nextValues = this.getManagedListMultiSelectedValues(Number(managedOptions.list_id), rawValue);
        window.ManagedMultiSelect.setValues(wrapper, nextValues);
        this.closeManagedMultiImportModal(field.field_name);
        showToast('Värden hämtade från objekt', 'success');
    }

    async openManagedMultiImportModal(field) {
        const modal = this.ensureManagedMultiImportModal(field);
        const containerId = `${modal.id}-table`;
        modal.style.display = 'block';

        this.managedMultiImportRowsByField[field.field_name] = await this.loadManagedMultiImportRows(field);
        const rows = this.managedMultiImportRowsByField[field.field_name] || [];

        this.managedMultiImportTableByField[field.field_name] = new SystemTable({
            containerId,
            tableId: `${modal.id}-system-table`,
            persistState: false,
            initialState: {
                search: '',
                columnSearches: {},
                sortField: 'name',
                sortDirection: 'asc'
            },
            columns: [
                { field: 'id_full', label: 'ID', className: 'col-id' },
                { field: 'type', label: 'Typ', className: 'col-type', badge: 'type' },
                { field: 'name', label: 'Namn', className: 'col-name' },
                { field: 'values', label: 'Beskrivning', className: 'col-description', multiline: true },
                {
                    field: 'actions',
                    label: 'Actions',
                    className: 'col-actions',
                    sortable: false,
                    searchable: false,
                    render: (row) => `
                        <button type="button" class="btn btn-primary btn-sm managed-multi-import-apply-btn" data-object-id="${row.object_id}">
                            Använd
                        </button>
                    `
                }
            ],
            rows,
            emptyText: 'Inga objekt med valda värden hittades',
            onRender: () => {
                const host = document.getElementById(containerId);
                if (!host) return;
                host.querySelectorAll('.managed-multi-import-apply-btn').forEach(button => {
                    button.addEventListener('click', () => {
                        const objectId = Number(button.getAttribute('data-object-id') || 0);
                        const row = rows.find(item => Number(item.object_id) === objectId);
                        if (!row) return;
                        this.applyManagedMultiImportedValues(field, row.rawValue);
                    });
                });
            }
        });

        this.managedMultiImportTableByField[field.field_name].render();
    }

    setupManagedListMultiSelects(container) {
        if (!container) return;
        window.ManagedMultiSelect.init(container, {
            onAction: (action, wrapper) => {
                const fieldName = String(wrapper.getAttribute('data-managed-multi-field') || '').trim();
                const field = (this.fields || []).find(item => String(item.field_name || '') === fieldName);
                if (action !== 'import' || !field) return;
                this.openManagedMultiImportModal(field).catch(error => {
                    console.error('Failed to open managed multi import modal:', error);
                    showToast('Kunde inte hämta objekt för import', 'error');
                });
            }
        });
    }

    renderSelectElementOptions(selectEl, options, selectedValue = '') {
        if (!selectEl) return;
        const safeSelected = String(selectedValue || '');
        const optionsHtml = (options || []).map(opt => `
            <option value="${escapeHtml(opt.value)}" ${String(opt.value) === safeSelected ? 'selected' : ''}>${escapeHtml(opt.label)}</option>
        `).join('');
        selectEl.innerHTML = `
            <option value="">Välj...</option>
            ${optionsHtml}
        `;
        if (safeSelected && !(options || []).some(opt => String(opt.value) === safeSelected)) {
            selectEl.value = '';
        }
    }

    async refreshDependentManagedListField(field, form) {
        const options = this.getManagedListFieldOptions(field);
        if (!options || !options.parent_field_name) return;

        const childSelect = form?.elements?.[field.field_name];
        const parentSelect = form?.elements?.[options.parent_field_name];
        if (!childSelect || !parentSelect) return;

        const childListId = Number(options.list_id);
        const parentField = (this.fields || []).find(item => String(item.field_name) === String(options.parent_field_name));
        const parentOptions = this.getManagedListFieldOptions(parentField);
        const parentListId = Number(options.parent_list_id || parentOptions?.list_id || 0);
        const parentItemId = this.getManagedListItemIdByValue(parentListId, parentSelect.value);
        const requestKey = `${field.field_name}`;
        const token = (this.managedListDependencyRequestTokens[requestKey] || 0) + 1;
        this.managedListDependencyRequestTokens[requestKey] = token;

        const currentSelected = String(childSelect.value || this.existingObject?.data?.[field.field_name] || '');

        if (!parentItemId) {
            this.renderSelectElementOptions(childSelect, [], currentSelected);
            return;
        }

        try {
            const filteredItems = await ManagedListsAPI.getItems(childListId, false, {
                parent_item_id: parentItemId,
                parent_list_id: parentListId > 0 ? parentListId : undefined,
                list_link_id: Number(options.list_link_id || 0) || undefined
            });
            if (this.managedListDependencyRequestTokens[requestKey] !== token) return;

            const mapped = (Array.isArray(filteredItems) ? filteredItems : [])
                .filter(item => item && item.is_active !== false)
                .map(item => ({
                    value: String(item.id || '').trim(),
                    label: String(item.display_value || item.label || item.value || '').trim(),
                    is_selectable: item.is_selectable !== false
                }))
                .filter(item => item.value && item.is_selectable !== false);
            const normalizedSelected = this.getManagedListSelectSelectedValue(childListId, currentSelected);
            this.renderSelectElementOptions(childSelect, mapped, normalizedSelected);
            if (childSelect.dataset.managedMultiHidden === 'true') {
                const wrapper = childSelect.closest('[data-managed-multi-field]');
                if (wrapper) {
                    const selectedValues = this.getManagedListMultiSelectedValues(childListId, currentSelected);
                    window.ManagedMultiSelect.rebuildOptions(wrapper, mapped, selectedValues);
                    this.setupManagedListMultiSelects(wrapper);
                    this.syncManagedMultiSelectUi(wrapper);
                }
            }
        } catch (error) {
            console.error(`Failed to refresh dependent options for ${field.field_name}:`, error);
            if (this.managedListDependencyRequestTokens[requestKey] !== token) return;
            this.renderSelectElementOptions(childSelect, [], '');
        }
    }

    setupManagedListDependencies(container) {
        const form = document.getElementById('object-main-form');
        if (!form || !container) return;

        const dependentFields = (this.fields || []).filter(field => {
            const options = this.getManagedListFieldOptions(field);
            return options?.parent_field_name;
        });
        if (!dependentFields.length) return;

        dependentFields.forEach((field) => {
            const options = this.getManagedListFieldOptions(field);
            if (!options) return;
            const parentSelect = form.elements[options.parent_field_name];
            if (!parentSelect) return;

            const handler = () => {
                this.refreshDependentManagedListField(field, form);
            };
            parentSelect.addEventListener('change', handler);
            parentSelect.addEventListener('input', handler);
            handler();
        });
    }

    setupManagedListHierarchySelectors(container) {
        const form = document.getElementById('object-main-form');
        if (!form || !container) return;

        const hierarchyFields = (this.fields || []).filter(field => this.getManagedListHierarchyConfig(field));
        hierarchyFields.forEach((field) => {
            const options = this.getManagedListFieldOptions(field);
            const hierarchy = this.getManagedListHierarchyConfig(field);
            if (!options || !hierarchy) return;

            const listId = Number(options.list_id);
            const wrapper = Array.from(container.querySelectorAll('[data-managed-hierarchy-field]'))
                .find(node => String(node.getAttribute('data-managed-hierarchy-field') || '') === String(field.field_name));
            const hiddenInput = form.elements[field.field_name];
            if (!wrapper || !hiddenInput || !Number.isFinite(listId) || listId <= 0) return;

            const labelContainer = wrapper.querySelector('[data-managed-hierarchy-levels]');
            if (!labelContainer) return;

            const { byId, childrenByParent } = this.buildManagedListItemMaps(listId);
            const selectedItemId = this.getManagedListItemIdByValue(listId, hiddenInput.value);
            const initialPath = this.getManagedListPathToItem(listId, selectedItemId);
            const selections = Array.from({ length: hierarchy.levelCount }, (_, idx) => initialPath[idx] || '');

            const hasActiveChildren = (itemId) => {
                const children = childrenByParent.get(Number(itemId || 0)) || [];
                return children.some(child => child.is_active !== false);
            };
            const clearSelectionsAfter = (startIndex) => {
                for (let idx = startIndex; idx < selections.length; idx += 1) {
                    selections[idx] = '';
                }
            };

            const refreshLevels = () => {
                let parentId = 0;
                const levelBlocks = [];

                for (let index = 0; index < hierarchy.levelCount; index += 1) {
                    const children = childrenByParent.get(Number(parentId || 0)) || [];
                    const activeChildren = children
                        .filter(item => item.is_active !== false)
                        .map(item => ({
                            id: Number(item.id),
                            label: String(item.label || item.value || '').trim()
                        }))
                        .filter(item => Number.isFinite(item.id) && item.id > 0);
                    if (!activeChildren.length) {
                        clearSelectionsAfter(index);
                        break;
                    }

                    const selectedValue = String(selections[index] || '');
                    const hasSelected = activeChildren.some(item => String(item.id) === selectedValue);
                    const resolvedValue = hasSelected ? selectedValue : '';
                    selections[index] = resolvedValue;
                    if (!hasSelected) {
                        clearSelectionsAfter(index + 1);
                    }

                    const optionsHtml = activeChildren.map((item) => `
                        <option value="${escapeHtml(String(item.id))}" ${String(item.id) === resolvedValue ? 'selected' : ''}>
                            ${escapeHtml(item.label)}
                        </option>
                    `).join('');
                    levelBlocks.push(`
                        <div class="form-group managed-list-hierarchy-level">
                            <label for="field-${field.field_name}-level-${index + 1}">${escapeHtml(hierarchy.labels[index] || `Nivå ${index + 1}`)}</label>
                            <select id="field-${field.field_name}-level-${index + 1}"
                                    class="form-control managed-list-hierarchy-select"
                                    data-level-index="${index}"
                                    ${field.is_required && index === 0 ? 'required' : ''}>
                                <option value="">Välj...</option>
                                ${optionsHtml}
                            </select>
                        </div>
                    `);

                    if (!resolvedValue) {
                        break;
                    }
                    parentId = Number(resolvedValue);
                    if (!hasActiveChildren(parentId)) {
                        clearSelectionsAfter(index + 1);
                        break;
                    }
                }

                labelContainer.innerHTML = levelBlocks.join('');

                const lastSelectedId = [...selections]
                    .reverse()
                    .map(value => Number(value || 0))
                    .find(value => Number.isFinite(value) && value > 0) || 0;

                if (!lastSelectedId || !byId.has(lastSelectedId)) {
                    hiddenInput.value = '';
                    return;
                }

                if (hierarchy.allowOnlyLeafSelection && hasActiveChildren(lastSelectedId)) {
                    hiddenInput.value = '';
                    return;
                }

                hiddenInput.value = String(lastSelectedId);
            };

            labelContainer.addEventListener('change', (event) => {
                const selectEl = event.target.closest('.managed-list-hierarchy-select');
                if (!selectEl) return;
                const levelIndex = Number(selectEl.dataset.levelIndex || 0);
                if (!Number.isFinite(levelIndex) || levelIndex < 0) return;
                if (levelIndex >= selections.length) return;
                selections[levelIndex] = selectEl.value || '';
                for (let idx = levelIndex + 1; idx < selections.length; idx += 1) {
                    selections[idx] = '';
                }
                refreshLevels();
            });

            labelContainer.addEventListener('input', (event) => {
                const selectEl = event.target.closest('.managed-list-hierarchy-select');
                if (!selectEl) return;
                const levelIndex = Number(selectEl.dataset.levelIndex || 0);
                if (!Number.isFinite(levelIndex) || levelIndex < 0) return;
                if (levelIndex >= selections.length) return;
                if (String(selections[levelIndex] || '') === String(selectEl.value || '')) return;
                selections[levelIndex] = selectEl.value || '';
                for (let idx = levelIndex + 1; idx < selections.length; idx += 1) {
                    selections[idx] = '';
                }
                refreshLevels();
            });

            refreshLevels();
        });
    }

    normalizeFieldKey(value) {
        return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    }

    isConnectionObjectType() {
        const typeName = this.objectType?.name || this.existingObject?.object_type?.name || '';
        return this.normalizeFieldKey(typeName).includes('anslutning');
    }

    findFieldByAliases(aliases = []) {
        const aliasKeys = new Set(aliases.map(alias => this.normalizeFieldKey(alias)));
        return (this.fields || []).find(field => aliasKeys.has(this.normalizeFieldKey(field.field_name)));
    }

    applyConnectionNameRules() {
        if (!this.isConnectionObjectType()) return;

        const form = document.getElementById('object-main-form');
        if (!form) return;

        const nameField = this.findFieldByAliases(['namn', 'name']);
        const delAField = this.findFieldByAliases(['del_a', 'dela', 'del a']);
        const delBField = this.findFieldByAliases(['del_b', 'delb', 'del b']);
        if (!nameField || !delAField || !delBField) return;

        const nameInput = form.elements[nameField.field_name];
        const delAInput = form.elements[delAField.field_name];
        const delBInput = form.elements[delBField.field_name];
        if (!nameInput || !delAInput || !delBInput) return;

        nameInput.readOnly = true;
        nameInput.classList.add('readonly-autogenerated');
        nameInput.title = 'Genereras automatiskt från Del A och Del B';

        const updateGeneratedName = () => {
            const partA = String(delAInput.value || '').trim();
            const partB = String(delBInput.value || '').trim();
            if (!partA || !partB) {
                nameInput.value = '';
                return;
            }
            const orderedParts = [partA, partB].sort((a, b) => objectFormTextCollator.compare(a, b));
            nameInput.value = `${orderedParts[0]} - ${orderedParts[1]}`;
        };

        delAInput.addEventListener('input', updateGeneratedName);
        delBInput.addEventListener('input', updateGeneratedName);
        updateGeneratedName();
    }
    
    renderField(field) {
        const value = this.existingObject?.data?.[field.field_name] || '';
        const required = field.is_required ? 'required' : '';
        const label = `${field.display_name || field.field_name}${field.is_required ? ' *' : ''}`;
        const layoutClass = this.getFieldLayoutClass(field);
        
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

            case 'richtext': {
                const safeHtml = sanitizeRichTextHtml(value);
                inputHtml = `
                    <div class="rich-text-field" data-field-name="${field.field_name}">
                        <div class="rich-text-inline-actions">
                            <button type="button"
                                    class="btn btn-secondary btn-sm rich-text-open-window-btn"
                                    data-richtext-open-window="true"
                                    data-field-name="${field.field_name}"
                                    data-field-label="${escapeHtml(field.display_name || field.field_name)}">
                                Öppna i fönster
                            </button>
                        </div>
                        <textarea id="field-${field.field_name}"
                                  name="${field.field_name}"
                                  ${required}
                                  class="form-control rich-text-textarea"
                                  data-richtext="true">${escapeHtml(safeHtml)}</textarea>
                        <div class="rich-text-fallback" data-richtext-fallback-for="field-${field.field_name}" style="display:none;">
                            <div class="rich-text-toolbar" role="toolbar" aria-label="Verktyg för formatering">
                                <button type="button" class="btn-icon" data-editor-command="bold" title="Fet">B</button>
                                <button type="button" class="btn-icon" data-editor-command="italic" title="Kursiv"><em>I</em></button>
                                <button type="button" class="btn-icon" data-editor-command="underline" title="Understruken"><u>U</u></button>
                                <button type="button" class="btn-icon" data-editor-command="insertUnorderedList" title="Punktlista">• List</button>
                                <button type="button" class="btn-icon" data-editor-command="insertOrderedList" title="Numrerad lista">1. List</button>
                                <button type="button" class="btn-icon" data-editor-action="toggleDashList" title="Strecklista">- List</button>
                                <button type="button" class="btn-icon" data-editor-command="indent" title="Öka indrag">→|</button>
                                <button type="button" class="btn-icon" data-editor-command="outdent" title="Minska indrag">|←</button>
                                <button type="button" class="btn-icon" data-editor-action="insertTab" title="Infoga tabb">Tab</button>
                                <button type="button" class="btn-icon" data-editor-action="insertImageUrl" title="Infoga bild via URL">Bild</button>
                                <button type="button" class="btn-icon" data-editor-action="copyFormat" title="Kopiera format">Kopiera format</button>
                                <button type="button" class="btn-icon" data-editor-action="applyFormat" title="Applicera format">Applicera format</button>
                                <button type="button" class="btn-icon" data-editor-command="removeFormat" title="Rensa format">Tx</button>
                            </div>
                            <div class="rich-text-editor form-control"
                                 contenteditable="true"
                                 data-richtext-fallback-editor-for="field-${field.field_name}">${safeHtml}</div>
                        </div>
                    </div>
                `;
                break;
            }
                
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
                const options = this.getSelectOptions(field);
                const managedOptions = this.getManagedListFieldOptions(field);
                const hierarchyConfig = this.getManagedListHierarchyConfig(field);
                const isMultiManagedSelect = managedOptions && String(managedOptions.selection_mode || 'single').toLowerCase() === 'multi';
                const selectedValue = managedOptions
                    ? this.getManagedListSelectSelectedValue(Number(managedOptions.list_id), value)
                    : String(value || '');
                if (hierarchyConfig) {
                    inputHtml = `
                        <input type="hidden"
                               id="field-${field.field_name}"
                               name="${field.field_name}"
                               value="${escapeHtml(selectedValue)}"
                               ${required}>
                        <div class="managed-list-hierarchy"
                             data-managed-hierarchy-field="${escapeHtml(field.field_name)}"
                             data-managed-hierarchy-list-id="${escapeHtml(String(managedOptions.list_id || ''))}">
                            <div data-managed-hierarchy-levels></div>
                        </div>
                    `;
                } else if (isMultiManagedSelect) {
                    inputHtml = this.renderManagedMultiSelectField(field, options, managedOptions, value, required);
                } else {
                    const optionsHtml = options.map(opt => 
                        `<option value="${escapeHtml(opt.value)}" ${
                            isMultiManagedSelect
                                ? (this.getManagedListMultiSelectedValues(Number(managedOptions.list_id), value).includes(String(opt.value)) ? 'selected' : '')
                                : ((String(selectedValue) === String(opt.value)) ? 'selected' : '')
                        }>
                            ${escapeHtml(opt.label)}
                        </option>`
                    ).join('');
                    inputHtml = `
                        <select id="field-${field.field_name}" 
                                name="${field.field_name}"
                                ${required}
                                ${isMultiManagedSelect ? 'multiple size="6"' : ''}
                                class="form-control">
                            <option value="">Välj...</option>
                            ${optionsHtml}
                        </select>
                    `;
                }
                break;
                
            case 'computed': {
                const displayVal = value ? String(value) : '';
                inputHtml = `<div class="form-control" style="background:var(--bg-secondary);color:var(--text-secondary);cursor:default;min-height:36px;">${escapeHtml(displayVal) || '<em style="opacity:.5">Beräknas vid sparande</em>'}</div>`;
                break;
            }
            case 'tag': {
                const tagOpts = this.normalizeFieldOptions(field.field_options) || {};
                const tagListId = Number(tagOpts.list_id || 0);
                let initialTags = [];
                if (Array.isArray(value)) {
                    initialTags = value.map(String).filter(Boolean);
                } else if (typeof value === 'string' && value.trim()) {
                    try { initialTags = JSON.parse(value); } catch (_) { initialTags = value.split(',').map(s => s.trim()).filter(Boolean); }
                }
                const tagsJson = escapeHtml(JSON.stringify(initialTags));
                const chipsHtml = initialTags.map(t =>
                    `<span class="tag-chip">${escapeHtml(t)}<button type="button" class="tag-chip-remove" data-tag="${escapeHtml(t)}" aria-label="Ta bort">×</button></span>`
                ).join('');
                inputHtml = `
                    <div class="tag-field-widget" data-list-id="${tagListId}" data-field-name="${escapeHtml(field.field_name)}">
                        <input type="hidden" id="field-${field.field_name}" name="${field.field_name}" value="${tagsJson}">
                        <div class="tag-field-input-row">
                            <div class="tag-chips-container">${chipsHtml}</div>
                            <input type="text" class="tag-text-input" placeholder="Lägg till tagg..." autocomplete="off">
                        </div>
                        <div class="tag-suggestions" style="display:none;"></div>
                    </div>`;
                break;
            }
            case 'relation_list': {
                const rlItems = value ? String(value).split('\n').map(s => s.trim()).filter(Boolean) : [];
                const rlContent = rlItems.length
                    ? rlItems.map(i => `- ${escapeHtml(i)}`).join('<br>')
                    : '<span style="color:var(--text-secondary);">—</span>';
                inputHtml = `<div class="form-control relation-list-display" style="min-height:36px;background:var(--bg-secondary);cursor:default;">${rlContent}</div>`;
                break;
            }
            case 'category_node': {
                const catOpts = this.normalizeFieldOptions(field.field_options) || {};
                const catSystemId = Number(catOpts.system_id || 0);
                const catSystemName = escapeHtml(catOpts.system_name || '');
                const catNodeId = value ? String(value) : '';
                inputHtml = `
                    <div class="category-field-widget"
                         data-field-name="${escapeHtml(field.field_name)}"
                         data-system-id="${catSystemId}"
                         data-system-name="${catSystemName}">
                        <input type="hidden"
                               id="field-${field.field_name}"
                               name="${field.field_name}"
                               value="${escapeHtml(catNodeId)}">
                        <div class="category-field-display form-control"
                             style="display:flex;align-items:center;justify-content:space-between;cursor:pointer;min-height:38px;">
                            <span class="category-field-label"
                                  data-label-for="${escapeHtml(field.field_name)}">${catNodeId ? '…' : 'Välj kategorinod…'}</span>
                            <span style="font-size:11px;color:var(--text-secondary);">▼</span>
                        </div>
                    </div>
                `;
                break;
            }

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
            <div class="form-group ${layoutClass}">
                <label for="field-${field.field_name}">${label}</label>
                ${inputHtml}
                ${field.help_text ? `<small class="form-help">${escapeHtml(field.help_text)}</small>` : ''}
            </div>
        `;
    }

    setupTagFields(container) {
        container.querySelectorAll('.tag-field-widget').forEach(widget => {
            const listId = Number(widget.dataset.listId || 0);
            const hidden = widget.querySelector('input[type="hidden"]');
            const textInput = widget.querySelector('.tag-text-input');
            const chipsContainer = widget.querySelector('.tag-chips-container');
            const suggestionsBox = widget.querySelector('.tag-suggestions');
            let allSuggestions = [];

            const getTags = () => {
                try { return JSON.parse(hidden.value || '[]'); } catch (_) { return []; }
            };
            const setTags = (tags) => {
                hidden.value = JSON.stringify(tags);
                chipsContainer.innerHTML = tags.map(t =>
                    `<span class="tag-chip">${escapeHtml(t)}<button type="button" class="tag-chip-remove" data-tag="${escapeHtml(t)}" aria-label="Ta bort">×</button></span>`
                ).join('');
                bindChipRemove();
            };
            const bindChipRemove = () => {
                chipsContainer.querySelectorAll('.tag-chip-remove').forEach(btn => {
                    btn.addEventListener('click', () => {
                        setTags(getTags().filter(t => t !== btn.dataset.tag));
                    });
                });
            };
            bindChipRemove();

            const addTag = async (tag) => {
                tag = tag.trim();
                if (!tag) return;
                const current = getTags();
                if (current.includes(tag)) { textInput.value = ''; hideSuggestions(); return; }
                // Add to managed list if new
                if (listId && !allSuggestions.includes(tag)) {
                    try {
                        await fetch(`/api/managed-lists/${listId}/items`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ label: tag, value: tag })
                        });
                        allSuggestions.push(tag);
                    } catch (_) {}
                }
                setTags([...current, tag]);
                textInput.value = '';
                hideSuggestions();
            };

            const showSuggestions = (q) => {
                const filtered = allSuggestions.filter(s =>
                    s.toLowerCase().includes(q.toLowerCase()) && !getTags().includes(s)
                );
                if (!filtered.length && !q.trim()) { hideSuggestions(); return; }
                const items = filtered.slice(0, 10).map(s =>
                    `<div class="tag-suggestion-item" data-value="${escapeHtml(s)}">${escapeHtml(s)}</div>`
                ).join('');
                const createItem = q.trim() && !allSuggestions.includes(q.trim())
                    ? `<div class="tag-suggestion-item tag-suggestion-new" data-value="${escapeHtml(q.trim())}">Skapa "${escapeHtml(q.trim())}"</div>`
                    : '';
                suggestionsBox.innerHTML = items + createItem;
                suggestionsBox.style.display = (items || createItem) ? '' : 'none';
                suggestionsBox.querySelectorAll('.tag-suggestion-item').forEach(el => {
                    el.addEventListener('mousedown', (e) => { e.preventDefault(); addTag(el.dataset.value); });
                });
            };
            const hideSuggestions = () => { suggestionsBox.style.display = 'none'; };

            // Load suggestions
            if (listId) {
                fetch(`/api/managed-lists/${listId}/items`).then(r => r.ok ? r.json() : []).then(items => {
                    allSuggestions = items.map(i => i.label || i.value || '').filter(Boolean);
                }).catch(() => {});
            }

            textInput.addEventListener('input', () => showSuggestions(textInput.value));
            textInput.addEventListener('focus', () => showSuggestions(textInput.value));
            textInput.addEventListener('blur', () => setTimeout(hideSuggestions, 150));
            textInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') { e.preventDefault(); addTag(textInput.value); }
                if (e.key === 'Escape') { hideSuggestions(); }
            });
        });
    }

    setupCategoryNodeFields(container) {
        container.querySelectorAll('.category-field-widget').forEach(widget => {
            const fieldName = widget.dataset.fieldName;
            const systemId  = Number(widget.dataset.systemId  || 0);
            const systemName = widget.dataset.systemName || '';
            const hidden   = widget.querySelector('input[type="hidden"]');
            const display  = widget.querySelector('.category-field-display');
            const labelEl  = widget.querySelector('.category-field-label');

            // Resolve existing value to a name
            if (hidden && hidden.value) {
                fetch(`/api/category-nodes/${hidden.value}?include_path=true`)
                    .then(r => r.ok ? r.json() : null)
                    .then(node => { if (node && labelEl) labelEl.textContent = node.path_string || node.name || hidden.value; })
                    .catch(() => {});
            }

            // Open picker on click
            if (display) {
                display.addEventListener('click', () => {
                    if (typeof window.openCatFieldPicker === 'function') {
                        window.openCatFieldPicker(systemId, systemName, (nodeId, nodeName) => {
                            if (hidden) hidden.value = String(nodeId);
                            // Fetch full path string instead of leaf name only
                            fetch(`/api/category-nodes/${nodeId}?include_path=true`)
                                .then(r => r.ok ? r.json() : null)
                                .then(node => { if (labelEl) labelEl.textContent = node?.path_string || nodeName; })
                                .catch(() => { if (labelEl) labelEl.textContent = nodeName; });
                        });
                    }
                });
            }
        });
    }

    getFieldLayoutClass(field) {
        const width = String(field?.detail_width || '').toLowerCase();
        if (width === 'full') return 'form-group-full';
        if (width === 'third') return 'form-group-third';
        if (width === 'half') return 'form-group-half';

        const fieldType = String(field?.field_type || '').toLowerCase();
        if (fieldType === 'richtext' || fieldType === 'textarea') {
            return 'form-group-full';
        }
        return 'form-group-half';
    }

    getTinyMceSelectionNode(editor) {
        const selectedNode = editor?.selection?.getNode?.();
        if (!selectedNode) return null;
        return selectedNode.nodeType === Node.TEXT_NODE ? selectedNode.parentElement : selectedNode;
    }

    getComputedNodeStyle(node) {
        if (!node) return null;
        const win = node.ownerDocument?.defaultView || window;
        return win.getComputedStyle(node);
    }

    captureTinyMceSelectionBookmark(editor) {
        if (!editor?.selection) return null;
        try {
            return editor.selection.getBookmark(2, true);
        } catch (error) {
            console.warn('Failed to capture TinyMCE selection bookmark:', error);
            return null;
        }
    }

    restoreTinyMceSelectionBookmark(editor, bookmark) {
        if (!editor?.selection || !bookmark) return false;
        try {
            editor.focus();
            editor.selection.moveToBookmark(bookmark);
            return true;
        } catch (error) {
            console.warn('Failed to restore TinyMCE selection bookmark:', error);
            return false;
        }
    }

    normalizeTinyMceCopiedFormat(format) {
        if (!format) return null;
        return {
            bold: Boolean(format.bold),
            italic: Boolean(format.italic),
            underline: Boolean(format.underline),
            strikethrough: Boolean(format.strikethrough),
            forecolor: format.forecolor || '',
            backcolor: format.backcolor || '',
            fontFamily: format.fontFamily || '',
            fontSize: format.fontSize || ''
        };
    }

    captureTinyMceFormat(editor) {
        if (!editor) return null;
        const node = this.getTinyMceSelectionNode(editor);
        if (!node) return null;

        const computed = this.getComputedNodeStyle(node);
        const textDecoration = (computed?.textDecorationLine || '').toLowerCase();
        const fontWeight = Number.parseInt(computed?.fontWeight || '400', 10);

        return this.normalizeTinyMceCopiedFormat({
            bold: editor.formatter.match('bold') || fontWeight >= 600,
            italic: editor.formatter.match('italic') || (computed?.fontStyle || '').toLowerCase() === 'italic',
            underline: editor.formatter.match('underline') || textDecoration.includes('underline'),
            strikethrough: editor.formatter.match('strikethrough') || textDecoration.includes('line-through'),
            forecolor: computed?.color || '',
            backcolor: computed?.backgroundColor || '',
            fontFamily: computed?.fontFamily || '',
            fontSize: computed?.fontSize || ''
        });
    }

    setTinyMceInlineFormatState(editor, formatName, shouldApply) {
        const isApplied = editor.formatter.match(formatName);
        if (shouldApply && !isApplied) editor.formatter.apply(formatName);
        if (!shouldApply && isApplied) editor.formatter.remove(formatName);
    }

    applyTinyMceFormat(editor, copiedFormat) {
        if (!editor || !copiedFormat) return;

        this.setTinyMceInlineFormatState(editor, 'bold', copiedFormat.bold);
        this.setTinyMceInlineFormatState(editor, 'italic', copiedFormat.italic);
        this.setTinyMceInlineFormatState(editor, 'underline', copiedFormat.underline);
        this.setTinyMceInlineFormatState(editor, 'strikethrough', copiedFormat.strikethrough);

        if (copiedFormat.fontFamily) {
            editor.execCommand('FontName', false, copiedFormat.fontFamily);
        }
        if (copiedFormat.fontSize) {
            editor.execCommand('FontSize', false, copiedFormat.fontSize);
        }
        if (copiedFormat.forecolor) {
            editor.execCommand('ForeColor', false, copiedFormat.forecolor);
        }
        if (copiedFormat.backcolor && copiedFormat.backcolor !== 'rgba(0, 0, 0, 0)' && copiedFormat.backcolor !== 'transparent') {
            editor.execCommand('HiliteColor', false, copiedFormat.backcolor);
        }
    }

    findTinyMceListNode(editor) {
        const node = this.getTinyMceSelectionNode(editor);
        if (!node) return null;
        return editor.dom.getParent(node, 'ul,ol');
    }

    toggleTinyMceDashList(editor) {
        if (!editor) return;
        editor.undoManager.transact(() => {
            let listNode = this.findTinyMceListNode(editor);
            if (!listNode) {
                editor.execCommand('InsertUnorderedList');
                listNode = this.findTinyMceListNode(editor);
            } else if (listNode.nodeName === 'OL') {
                editor.execCommand('InsertUnorderedList');
                listNode = this.findTinyMceListNode(editor);
            }

            if (!listNode || listNode.nodeName !== 'UL') return;
            if (editor.dom.hasClass(listNode, 'dash-list')) {
                editor.dom.removeClass(listNode, 'dash-list');
                if (!listNode.className.trim()) {
                    listNode.removeAttribute('class');
                }
            } else {
                editor.dom.addClass(listNode, 'dash-list');
            }
        });
        editor.nodeChanged();
    }

    updateRichTextApplyButtonState() {
        const enabled = Boolean(this.richTextCopiedFormat);
        this.richTextApplyButtonApis.forEach(api => {
            api.setEnabled(enabled);
        });
        document.querySelectorAll('[data-editor-action="applyFormat"]').forEach(button => {
            button.disabled = !enabled;
        });
    }

    registerTinyMceFormatButtons(editor) {
        editor.ui.registry.addMenuButton('textstyle', {
            text: 'Stil',
            fetch: (callback) => {
                const selectionBookmark = this.captureTinyMceSelectionBookmark(editor);
                const items = this.getRichTextTinyMceStyleFormats().map((item) => ({
                    type: 'menuitem',
                    text: item.title,
                    onAction: () => {
                        this.restoreTinyMceSelectionBookmark(editor, selectionBookmark);
                        this.applyRichTextStyle(editor, item.format);
                    }
                }));
                callback(items);
            }
        });

        editor.ui.registry.addButton('dashlist', {
            text: '- List',
            tooltip: 'Växla strecklista',
            onAction: () => {
                this.toggleTinyMceDashList(editor);
            }
        });

        editor.ui.registry.addButton('copyformat', {
            text: 'Kopiera',
            tooltip: 'Kopiera format',
            onAction: () => {
                const copiedFormat = this.captureTinyMceFormat(editor);
                if (!copiedFormat) {
                    editor.notificationManager.open({
                        text: 'Markera text med format att kopiera först.',
                        type: 'warning'
                    });
                    return;
                }
                this.richTextCopiedFormat = copiedFormat;
                this.updateRichTextApplyButtonState();
                editor.notificationManager.open({
                    text: 'Formatering kopierad.',
                    type: 'success'
                });
            }
        });

        editor.ui.registry.addButton('applyformat', {
            text: 'Applicera',
            tooltip: 'Applicera kopierat format',
            onAction: () => {
                if (!this.richTextCopiedFormat) {
                    editor.notificationManager.open({
                        text: 'Kopiera format först.',
                        type: 'warning'
                    });
                    return;
                }
                this.applyTinyMceFormat(editor, this.richTextCopiedFormat);
                editor.nodeChanged();
            },
            onSetup: (api) => {
                this.richTextApplyButtonApis.add(api);
                api.setEnabled(Boolean(this.richTextCopiedFormat));
                return () => {
                    this.richTextApplyButtonApis.delete(api);
                };
            }
        });
    }

    getRichTextTinyMceFormats() {
        return {
            standard_heading_1: {
                block: 'p',
                styles: {
                    fontFamily: 'Arial, Helvetica, sans-serif',
                    fontSize: '13px',
                    fontWeight: '700',
                    fontStyle: 'normal',
                    color: '#000000',
                    marginTop: '12px',
                    marginBottom: '4px'
                }
            },
            standard_heading_2: {
                block: 'p',
                styles: {
                    fontFamily: 'Arial, Helvetica, sans-serif',
                    fontSize: '12px',
                    fontWeight: '400',
                    fontStyle: 'italic',
                    color: '#000000',
                    marginTop: '10px',
                    marginBottom: '4px'
                }
            },
            standard_normal: {
                block: 'p',
                styles: {
                    fontFamily: 'Arial, Helvetica, sans-serif',
                    fontSize: '11px',
                    fontWeight: '400',
                    fontStyle: 'normal',
                    color: '#000000',
                    marginTop: '4px',
                    marginBottom: '2px'
                }
            },
            standard_normal_adjustment: {
                block: 'p',
                styles: {
                    fontFamily: 'Arial, Helvetica, sans-serif',
                    fontSize: '11px',
                    fontWeight: '400',
                    fontStyle: 'normal',
                    color: '#000000',
                    backgroundColor: '#CED4D9',
                    marginTop: '4px',
                    marginBottom: '2px'
                }
            },
            standard_instruction: {
                block: 'p',
                styles: {
                    fontFamily: 'Arial, Helvetica, sans-serif',
                    fontSize: '11px',
                    fontWeight: '400',
                    fontStyle: 'italic',
                    color: '#ff0000',
                    marginTop: '0',
                    marginBottom: '4px'
                }
            }
        };
    }

    getRichTextTinyMceStyleFormats() {
        return [
            { title: 'Rubrik 1 | 13px | Fet', format: 'standard_heading_1' },
            { title: 'Rubrik 2 | 12px | Kursiv', format: 'standard_heading_2' },
            { title: 'Normal | 11px | Regular', format: 'standard_normal' },
            { title: 'Normal - anpassning', format: 'standard_normal_adjustment' },
            { title: 'Anvisning | 11px | Kursiv | Rod', format: 'standard_instruction' }
        ];
    }

    getRichTextEditorZoom() {
        return 1.3;
    }

    applyRichTextStyle(editor, formatName) {
        if (!editor || !formatName) return;
        const formatDefinition = this.getRichTextTinyMceFormats()[formatName];
        if (!formatDefinition) return;

        const inlineFormatName = `inline_${formatName}`;
        const textStyles = {
            fontFamily: formatDefinition.styles.fontFamily,
            fontSize: formatDefinition.styles.fontSize,
            fontWeight: formatDefinition.styles.fontWeight,
            fontStyle: formatDefinition.styles.fontStyle,
            color: formatDefinition.styles.color,
            textDecoration: formatDefinition.styles.textDecoration,
            textDecorationColor: formatDefinition.styles.textDecorationColor,
            backgroundColor: formatDefinition.styles.backgroundColor
        };
        const blockStyles = {
            marginTop: formatDefinition.styles.marginTop,
            marginBottom: formatDefinition.styles.marginBottom
        };

        editor.undoManager.transact(() => {
            editor.formatter.register(inlineFormatName, {
                inline: 'span',
                styles: textStyles,
                remove_similar: true
            });

            if (editor.selection && !editor.selection.isCollapsed()) {
                editor.formatter.apply(inlineFormatName);
                return;
            }

            const selectedBlocks = editor.selection?.getSelectedBlocks?.() || [];
            const currentBlock = editor.dom.getParent(this.getTinyMceSelectionNode(editor), 'p,div,li,h1,h2,h3,h4,h5,h6,blockquote');
            const targetBlocks = selectedBlocks.length > 0
                ? selectedBlocks
                : (currentBlock ? [currentBlock] : []);

            targetBlocks.forEach((block) => {
                Object.entries(textStyles).forEach(([prop, value]) => {
                    editor.dom.setStyle(block, prop, value);
                });
                Object.entries(blockStyles).forEach(([prop, value]) => {
                    editor.dom.setStyle(block, prop, value);
                });
            });
        });

        editor.nodeChanged();
    }

    captureFallbackFormat(editor) {
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) return null;
        const range = selection.getRangeAt(0);
        const anchorNode = range.startContainer?.nodeType === Node.TEXT_NODE
            ? range.startContainer.parentElement
            : range.startContainer;
        if (!anchorNode || !editor.contains(anchorNode)) return null;

        const computed = this.getComputedNodeStyle(anchorNode);
        const textDecoration = (computed?.textDecorationLine || '').toLowerCase();
        const fontWeight = Number.parseInt(computed?.fontWeight || '400', 10);
        return this.normalizeTinyMceCopiedFormat({
            bold: fontWeight >= 600,
            italic: (computed?.fontStyle || '').toLowerCase() === 'italic',
            underline: textDecoration.includes('underline'),
            strikethrough: textDecoration.includes('line-through'),
            forecolor: computed?.color || '',
            backcolor: computed?.backgroundColor || '',
            fontFamily: computed?.fontFamily || '',
            fontSize: computed?.fontSize || ''
        });
    }

    applyFallbackFormat(editor, copiedFormat) {
        if (!editor || !copiedFormat) return;
        editor.focus();
        document.execCommand('styleWithCSS', false, true);

        const setToggle = (command, shouldApply) => {
            const isApplied = document.queryCommandState(command);
            if (Boolean(shouldApply) !== Boolean(isApplied)) {
                document.execCommand(command, false, null);
            }
        };

        setToggle('bold', copiedFormat.bold);
        setToggle('italic', copiedFormat.italic);
        setToggle('underline', copiedFormat.underline);
        setToggle('strikeThrough', copiedFormat.strikethrough);

        if (copiedFormat.fontFamily) {
            document.execCommand('fontName', false, copiedFormat.fontFamily);
        }
        if (copiedFormat.forecolor) {
            document.execCommand('foreColor', false, copiedFormat.forecolor);
        }
        if (copiedFormat.backcolor && copiedFormat.backcolor !== 'rgba(0, 0, 0, 0)' && copiedFormat.backcolor !== 'transparent') {
            document.execCommand('hiliteColor', false, copiedFormat.backcolor);
        }
    }

    getFallbackSelectionContainer(editor) {
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) return null;
        const range = selection.getRangeAt(0);
        const node = range.startContainer?.nodeType === Node.TEXT_NODE
            ? range.startContainer.parentElement
            : range.startContainer;
        if (!node || !editor.contains(node)) return null;
        return node;
    }

    toggleFallbackDashList(editor) {
        if (!editor) return;
        editor.focus();

        let containerNode = this.getFallbackSelectionContainer(editor);
        let listNode = containerNode?.closest('ul,ol');

        if (!listNode) {
            document.execCommand('insertUnorderedList', false, null);
            containerNode = this.getFallbackSelectionContainer(editor);
            listNode = containerNode?.closest('ul,ol');
        } else if (listNode.tagName === 'OL') {
            document.execCommand('insertUnorderedList', false, null);
            containerNode = this.getFallbackSelectionContainer(editor);
            listNode = containerNode?.closest('ul,ol');
        }

        if (!listNode || listNode.tagName !== 'UL') return;
        if (listNode.classList.contains('dash-list')) {
            listNode.classList.remove('dash-list');
            if (!listNode.className.trim()) {
                listNode.removeAttribute('class');
            }
        } else {
            listNode.classList.add('dash-list');
        }
    }

    async initializeRichTextEditors(scopeNode) {
        if (!scopeNode) return;
        const textareas = scopeNode.querySelectorAll('textarea.rich-text-textarea[data-richtext="true"]');
        if (textareas.length === 0) return;

        const tinyMceReady = await this.ensureTinyMceLoaded();
        if (!tinyMceReady || !window.tinymce || typeof window.tinymce.init !== 'function') {
            console.warn('TinyMCE is not available; using fallback rich text editor');
            this.initializeFallbackRichTextEditors(scopeNode, textareas);
            this.bindRichTextWindowButtons(scopeNode);
            return;
        }

        textareas.forEach(textarea => {
            const existing = window.tinymce.get(textarea.id);
            if (existing) existing.remove();

            window.tinymce.init({
                target: textarea,
                menubar: 'file edit view insert format tools table help',
                branding: false,
                promotion: false,
                statusbar: true,
                min_height: 240,
                plugins: 'advlist autolink lists link image charmap preview anchor searchreplace visualblocks code fullscreen insertdatetime media table help wordcount paste autoresize nonbreaking',
                toolbar: 'undo redo | textstyle fontsize | bold italic underline strikethrough | forecolor backcolor | alignleft aligncenter alignright alignjustify | bullist numlist dashlist outdent indent | link image media table | copyformat applyformat removeformat code fullscreen',
                toolbar_mode: 'sliding',
                formats: this.getRichTextTinyMceFormats(),
                font_size_formats: '11px 13px',
                font_family_formats: 'Arial=arial,helvetica,sans-serif',
                paste_data_images: true,
                paste_as_text: false,
                paste_retain_style_properties: 'font-family font-size font-weight font-style text-decoration text-decoration-color color background-color',
                paste_remove_styles_if_webkit: false,
                paste_webkit_styles: 'all',
                paste_merge_formats: true,
                valid_styles: {
                    '*': 'font-family,font-size,font-weight,font-style,text-decoration,text-decoration-color,color,background-color,text-align,line-height,margin-left,margin-right,margin-top,margin-bottom,padding-left,padding-right,padding-top,padding-bottom,list-style-type,list-style-position'
                },
                nonbreaking_force_tab: true,
                automatic_uploads: false,
                convert_urls: false,
                browser_spellcheck: true,
                contextmenu: 'undo redo | bold italic underline | link image inserttable | cell row column deletetable',
                content_style: `body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; line-height: 1.45; zoom: ${this.getRichTextEditorZoom()}; } p { margin: 6px 0 4px; } img { max-width: 100%; height: auto; } table { width: 100%; border-collapse: collapse; margin: 2px 0 4px; } th, td { border: 1px solid #d0d7de; padding: 0.35rem 0.5rem; } ul.dash-list { list-style: none; padding-left: 1.2rem; } ul.dash-list > li { position: relative; } ul.dash-list > li::before { content: "- "; position: absolute; left: -1rem; }`,
                setup: (editor) => {
                    this.registerTinyMceFormatButtons(editor);

                    const syncEditor = () => {
                        editor.save();
                        textarea.value = sanitizeRichTextHtml(textarea.value || '');
                    };

                    editor.on('init', () => {
                        const initial = sanitizeRichTextHtml(editor.getContent({ format: 'html' }) || '');
                        if (initial !== editor.getContent({ format: 'html' })) {
                            editor.setContent(initial, { format: 'html' });
                        }
                        syncEditor();
                    });

                    editor.on('change input undo redo keyup', syncEditor);
                }
            });
        });

        this.bindRichTextWindowButtons(scopeNode);
    }

    async ensureTinyMceLoaded() {
        if (window.tinymce && typeof window.tinymce.init === 'function') {
            return true;
        }

        if (ObjectFormComponent._tinymceLoadPromise) {
            return ObjectFormComponent._tinymceLoadPromise;
        }

        const staticScript = document.querySelector('script[src*="tinymce.min.js"]');
        const baseLocalSrc = staticScript?.src || 'https://cdn.jsdelivr.net/npm/tinymce@7/tinymce.min.js';
        const candidates = Array.from(new Set([
            baseLocalSrc,
            'https://cdn.jsdelivr.net/npm/tinymce@7/tinymce.min.js',
            '/static/vendor/tinymce/tinymce.min.js',
            `${window.location.origin}/static/vendor/tinymce/tinymce.min.js`
        ]));

        const loadScript = (src) => new Promise((resolve) => {
            const existing = document.querySelector(`script[src="${src}"]`);
            if (existing) {
                if (window.tinymce && typeof window.tinymce.init === 'function') {
                    resolve(true);
                    return;
                }
                existing.addEventListener('load', () => resolve(Boolean(window.tinymce)), { once: true });
                existing.addEventListener('error', () => resolve(false), { once: true });
                setTimeout(() => resolve(Boolean(window.tinymce)), 3000);
                return;
            }

            const script = document.createElement('script');
            script.src = src;
            script.async = true;
            script.onload = () => resolve(Boolean(window.tinymce));
            script.onerror = () => resolve(false);
            document.head.appendChild(script);
            setTimeout(() => resolve(Boolean(window.tinymce)), 6000);
        });

        ObjectFormComponent._tinymceLoadPromise = (async () => {
            for (const src of candidates) {
                const loaded = await loadScript(src);
                if (loaded && window.tinymce && typeof window.tinymce.init === 'function') {
                    return true;
                }
                console.warn('TinyMCE not ready after load attempt:', src);
            }
            console.error('Failed to initialize TinyMCE from all local sources:', candidates);
            return false;
        })();

        return ObjectFormComponent._tinymceLoadPromise;
    }

    bindRichTextWindowButtons(scopeNode) {
        if (!scopeNode) return;
        scopeNode.querySelectorAll('[data-richtext-open-window="true"]').forEach(button => {
            button.onclick = () => {
                const fieldName = button.dataset.fieldName;
                const fieldLabel = button.dataset.fieldLabel || fieldName || 'Formaterad text';
                this.openRichTextWindow(scopeNode, fieldName, fieldLabel);
            };
        });
    }

    ensureRichTextWindow() {
        let modal = document.getElementById('richtext-editor-window');
        if (modal) return modal;

        modal = document.createElement('div');
        modal.id = 'richtext-editor-window';
        modal.className = 'richtext-editor-window';
        modal.innerHTML = `
            <div class="richtext-editor-window-backdrop">
                <div class="richtext-editor-window-dialog" role="dialog" aria-modal="true" aria-labelledby="richtext-editor-window-title">
                    <div class="richtext-editor-window-header">
                        <h3 id="richtext-editor-window-title">Richtext-editor</h3>
                        <button type="button" class="close-btn" data-action="close-richtext-editor-window" aria-label="Stäng">&times;</button>
                    </div>
                    <div class="richtext-editor-window-body">
                        <textarea id="richtext-editor-window-textarea" class="form-control"></textarea>
                        <div id="richtext-editor-window-fallback" class="richtext-editor-window-fallback" contenteditable="true" style="display:none;"></div>
                    </div>
                    <div class="richtext-editor-window-footer">
                        <button type="button" class="btn btn-primary" data-action="save-richtext-editor-window">Spara</button>
                        <button type="button" class="btn btn-secondary" data-action="close-richtext-editor-window">Stäng</button>
                    </div>
                </div>
            </div>
        `;

        modal.addEventListener('click', (event) => {
            const backdrop = modal.querySelector('.richtext-editor-window-backdrop');
            if (event.target === backdrop || event.target.closest('[data-action="close-richtext-editor-window"]')) {
                this.closeRichTextWindow(true);
            }
            if (event.target.closest('[data-action="save-richtext-editor-window"]')) {
                this.saveRichTextWindowContent(true);
            }
        });

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && modal.classList.contains('active')) {
                this.closeRichTextWindow(true);
            }
        });

        document.body.appendChild(modal);
        return modal;
    }

    buildWindowTinyMceConfig(textareaElement) {
        return {
            target: textareaElement,
            menubar: 'file edit view insert format tools table help',
            branding: false,
            promotion: false,
            statusbar: true,
            min_height: 420,
            plugins: 'advlist autolink lists link image charmap preview anchor searchreplace visualblocks code fullscreen insertdatetime media table help wordcount paste nonbreaking',
            toolbar: 'undo redo | textstyle fontsize | bold italic underline strikethrough | forecolor backcolor | alignleft aligncenter alignright alignjustify | bullist numlist dashlist outdent indent | link image media table | copyformat applyformat removeformat code fullscreen',
            toolbar_mode: 'sliding',
            resize: false,
            formats: this.getRichTextTinyMceFormats(),
            font_size_formats: '11px 13px',
            font_family_formats: 'Arial=arial,helvetica,sans-serif',
            paste_data_images: true,
            paste_as_text: false,
            paste_retain_style_properties: 'font-family font-size font-weight font-style text-decoration color background-color',
            paste_remove_styles_if_webkit: false,
            paste_webkit_styles: 'all',
            paste_merge_formats: true,
            valid_styles: {
                '*': 'font-family,font-size,font-weight,font-style,text-decoration,color,background-color,text-align,line-height,margin-left,margin-right,margin-top,margin-bottom,padding-left,padding-right,padding-top,padding-bottom,list-style-type,list-style-position'
            },
            nonbreaking_force_tab: true,
            automatic_uploads: false,
            convert_urls: false,
            browser_spellcheck: true,
            contextmenu: 'undo redo | bold italic underline | link image inserttable | cell row column deletetable',
            content_style: `body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; line-height: 1.45; zoom: ${this.getRichTextEditorZoom()}; } p { margin: 6px 0 4px; } img { max-width: 100%; height: auto; } table { width: 100%; border-collapse: collapse; margin: 2px 0 4px; } th, td { border: 1px solid #d0d7de; padding: 0.35rem 0.5rem; } ul.dash-list { list-style: none; padding-left: 1.2rem; } ul.dash-list > li { position: relative; } ul.dash-list > li::before { content: "- "; position: absolute; left: -1rem; }`,
            setup: (editor) => {
                this.registerTinyMceFormatButtons(editor);
                editor.on('change input undo redo keyup', () => {
                    editor.save();
                });
            }
        };
    }

    async openRichTextWindow(scopeNode, fieldName, fieldLabel) {
        if (!scopeNode || !fieldName) return;
        const form = document.getElementById('object-main-form');
        if (!form) return;

        if (document.getElementById('richtext-editor-window')?.classList.contains('active')) {
            this.saveRichTextWindowContent(false);
            this.closeRichTextWindow(false);
        }

        const modal = this.ensureRichTextWindow();
        const titleNode = modal.querySelector('#richtext-editor-window-title');
        const modalTextarea = modal.querySelector('#richtext-editor-window-textarea');
        const fallbackEditor = modal.querySelector('#richtext-editor-window-fallback');
        const sourceTextarea = form.elements[fieldName];
        if (!modalTextarea || !fallbackEditor || !sourceTextarea) return;

        const initialContent = this.getRichTextFieldValue(fieldName, form) || '';
        this.richTextWindowState = {
            form,
            scopeNode,
            fieldName,
            sourceId: `field-${fieldName}`
        };

        if (titleNode) {
            titleNode.textContent = `${fieldLabel} (Richtext-editor)`;
        }

        modalTextarea.value = initialContent;
        fallbackEditor.innerHTML = initialContent;
        modal.classList.add('active');

        const tinyReady = await this.ensureTinyMceLoaded();
        if (tinyReady && window.tinymce && typeof window.tinymce.init === 'function') {
            const existingModalEditor = window.tinymce.get('richtext-editor-window-textarea');
            if (existingModalEditor) existingModalEditor.remove();

            fallbackEditor.style.display = 'none';
            modalTextarea.style.display = 'block';

            // Initialize only after modal is visible, otherwise TinyMCE can render toolbar without edit area.
            await new Promise(resolve => requestAnimationFrame(resolve));
            await window.tinymce.init(this.buildWindowTinyMceConfig(modalTextarea));

            const modalEditor = window.tinymce.get('richtext-editor-window-textarea');
            if (modalEditor) {
                modalEditor.setContent(initialContent, { format: 'html' });
            }
        } else {
            modalTextarea.style.display = 'none';
            fallbackEditor.style.display = 'block';
        }
    }

    saveRichTextWindowContent(showSavedToast = false) {
        if (!this.richTextWindowState) return;
        const { form, fieldName, sourceId } = this.richTextWindowState;
        const sourceTextarea = form?.elements?.[fieldName];
        if (!sourceTextarea) return;

        const modalEditor = window.tinymce && typeof window.tinymce.get === 'function'
            ? window.tinymce.get('richtext-editor-window-textarea')
            : null;
        const modalFallback = document.getElementById('richtext-editor-window-fallback');

        let content = '';
        if (modalEditor && typeof modalEditor.getContent === 'function') {
            content = modalEditor.getContent({ format: 'html' }) || '';
        } else if (modalFallback) {
            content = modalFallback.innerHTML || '';
        }

        const cleanHtml = sanitizeRichTextHtml(content);
        sourceTextarea.value = cleanHtml;

        const sourceTiny = window.tinymce && typeof window.tinymce.get === 'function'
            ? window.tinymce.get(sourceId)
            : null;
        if (sourceTiny && typeof sourceTiny.setContent === 'function') {
            sourceTiny.setContent(cleanHtml, { format: 'html' });
            sourceTiny.save();
        }

        const sourceFallback = form.querySelector(`[data-richtext-fallback-editor-for="${CSS.escape(sourceId)}"]`);
        if (sourceFallback) {
            sourceFallback.innerHTML = cleanHtml;
            this.syncFallbackRichTextEditor(sourceFallback, sourceTextarea);
        }

        if (showSavedToast) {
            showToast('Text sparad i formuläret', 'success');
        }
    }

    closeRichTextWindow(saveBack = true) {
        if (saveBack) {
            this.saveRichTextWindowContent(false);
        }

        const modalEditor = window.tinymce && typeof window.tinymce.get === 'function'
            ? window.tinymce.get('richtext-editor-window-textarea')
            : null;
        if (modalEditor && typeof modalEditor.remove === 'function') {
            modalEditor.remove();
        }

        const modal = document.getElementById('richtext-editor-window');
        if (!modal) return;
        modal.classList.remove('active');
    }

    initializeFallbackRichTextEditors(scopeNode, textareas) {
        const insertSanitizedHtml = (editor, html, textarea) => {
            const sanitized = sanitizeRichTextHtml(html);
            if (!sanitized) return;
            editor.focus();
            document.execCommand('insertHTML', false, sanitized);
            this.syncFallbackRichTextEditor(editor, textarea);
        };

        textareas.forEach(textarea => {
            const fieldId = textarea.id;
            const fallback = scopeNode.querySelector(`[data-richtext-fallback-for="${CSS.escape(fieldId)}"]`);
            const editor = fallback?.querySelector(`[data-richtext-fallback-editor-for="${CSS.escape(fieldId)}"]`);
            if (!fallback || !editor) return;

            textarea.style.display = 'none';
            fallback.style.display = 'block';

            const initial = sanitizeRichTextHtml(textarea.value || '');
            editor.innerHTML = initial;
            textarea.value = initial;

            editor.addEventListener('input', () => this.syncFallbackRichTextEditor(editor, textarea));
            editor.addEventListener('blur', () => this.syncFallbackRichTextEditor(editor, textarea));
            editor.addEventListener('keydown', (event) => {
                if (event.key !== 'Tab') return;
                event.preventDefault();
                document.execCommand('insertHTML', false, '&nbsp;&nbsp;&nbsp;&nbsp;');
                this.syncFallbackRichTextEditor(editor, textarea);
            });
            editor.addEventListener('paste', (event) => {
                event.preventDefault();
                const html = event.clipboardData?.getData('text/html');
                const plain = event.clipboardData?.getData('text/plain');
                if (html) {
                    insertSanitizedHtml(editor, html, textarea);
                } else if (plain) {
                    const escaped = escapeHtml(plain).replace(/\n/g, '<br>');
                    insertSanitizedHtml(editor, escaped, textarea);
                }
            });

            fallback.querySelectorAll('[data-editor-command]').forEach(button => {
                button.addEventListener('click', () => {
                    editor.focus();
                    document.execCommand(button.dataset.editorCommand, false, null);
                    this.syncFallbackRichTextEditor(editor, textarea);
                });
            });

            fallback.querySelectorAll('[data-editor-action="insertTab"]').forEach(button => {
                button.addEventListener('click', () => {
                    editor.focus();
                    document.execCommand('insertHTML', false, '&nbsp;&nbsp;&nbsp;&nbsp;');
                    this.syncFallbackRichTextEditor(editor, textarea);
                });
            });

            fallback.querySelectorAll('[data-editor-action="insertImageUrl"]').forEach(button => {
                button.addEventListener('click', () => {
                    const src = prompt('Ange bild-URL (https://...)');
                    if (!src) return;
                    const safeSrc = String(src).trim();
                    if (!/^(https?:|\/|data:image\/(?:png|jpeg|jpg|gif|webp);base64,)/i.test(safeSrc)) {
                        showToast('Ogiltig bild-URL', 'error');
                        return;
                    }
                    insertSanitizedHtml(editor, `<img src="${escapeHtml(safeSrc)}" alt="Infogad bild" style="max-width: 100%; height: auto;">`, textarea);
                });
            });

            fallback.querySelectorAll('[data-editor-action="toggleDashList"]').forEach(button => {
                button.addEventListener('click', () => {
                    this.toggleFallbackDashList(editor);
                    this.syncFallbackRichTextEditor(editor, textarea);
                });
            });

            fallback.querySelectorAll('[data-editor-action="copyFormat"]').forEach(button => {
                button.addEventListener('click', () => {
                    const copiedFormat = this.captureFallbackFormat(editor);
                    if (!copiedFormat) {
                        showToast('Markera text med format att kopiera först', 'warning');
                        return;
                    }
                    this.richTextCopiedFormat = copiedFormat;
                    this.updateRichTextApplyButtonState();
                    showToast('Formatering kopierad', 'success');
                });
            });

            fallback.querySelectorAll('[data-editor-action="applyFormat"]').forEach(button => {
                button.disabled = !this.richTextCopiedFormat;
                button.addEventListener('click', () => {
                    if (!this.richTextCopiedFormat) {
                        showToast('Kopiera format först', 'warning');
                        return;
                    }
                    this.applyFallbackFormat(editor, this.richTextCopiedFormat);
                    this.syncFallbackRichTextEditor(editor, textarea);
                });
            });
        });
    }

    syncFallbackRichTextEditor(editor, textarea) {
        if (!editor || !textarea) return;
        const cleanHtml = sanitizeRichTextHtml(editor.innerHTML);
        textarea.value = cleanHtml;
        if (editor.innerHTML !== cleanHtml) {
            editor.innerHTML = cleanHtml;
        }
    }

    getRichTextFieldValue(fieldName, form) {
        if (!fieldName || !form) return null;

        const textareaId = `field-${fieldName}`;
        const tinyEditor = window.tinymce && typeof window.tinymce.get === 'function'
            ? window.tinymce.get(textareaId)
            : null;

        if (tinyEditor && typeof tinyEditor.getContent === 'function') {
            const content = tinyEditor.getContent({ format: 'html' }) || '';
            return sanitizeRichTextHtml(content);
        }

        const fallbackEditor = form.querySelector(`[data-richtext-fallback-editor-for="${CSS.escape(textareaId)}"]`);
        if (fallbackEditor) {
            return sanitizeRichTextHtml(fallbackEditor.innerHTML || '');
        }

        const input = form.elements[fieldName];
        if (!input) return null;
        return sanitizeRichTextHtml(input.value || '');
    }

    syncRichTextEditors(scopeNode = null) {
        if (this.richTextWindowState && document.getElementById('richtext-editor-window')?.classList.contains('active')) {
            this.saveRichTextWindowContent(false);
        }

        const root = scopeNode || document;

        root.querySelectorAll('[data-richtext-fallback-editor-for]').forEach(editor => {
            const fieldId = editor.dataset.richtextFallbackEditorFor;
            const textarea = root.querySelector(`#${CSS.escape(fieldId)}`);
            if (!textarea) return;
            this.syncFallbackRichTextEditor(editor, textarea);
        });

        if (!window.tinymce || !Array.isArray(window.tinymce.editors)) return;
        window.tinymce.editors.forEach(editor => {
            const element = editor?.getElement?.();
            if (!element) return;
            if (scopeNode && !scopeNode.contains(element)) return;
            editor.save();
            element.value = sanitizeRichTextHtml(element.value || '');
        });
    }
    
    renderMetadataFields() {
        const statusValue = this.existingObject?.status || 'In work';
        const versionValue = this.existingObject?.version || 'v1';
        const baseIdValue = this.existingObject?.main_id || this.existingObject?.id_full || '';
        const isEditLikeMode = Boolean(this.existingObject?.id);
        
        return `
            <div class="form-section form-section-full">
                <h4>Metadata</h4>
                <div class="metadata-grid">
                    <div class="form-group form-group-compact">
                        <label for="field-status">Status *</label>
                        <select id="field-status" name="status" class="form-control" required>
                            <option value="In work" ${statusValue === 'In work' ? 'selected' : ''}>In work</option>
                            <option value="Released" ${statusValue === 'Released' ? 'selected' : ''}>Released</option>
                            <option value="Obsolete" ${statusValue === 'Obsolete' ? 'selected' : ''}>Obsolete</option>
                            <option value="Canceled" ${statusValue === 'Canceled' ? 'selected' : ''}>Canceled</option>
                        </select>
                    </div>
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
            // Dynamic option source is handled separately in getSelectOptions.
            if (optionsString.source) {
                return Array.isArray(optionsString.values) ? optionsString.values : [];
            }
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

    normalizeFieldOptions(options) {
        if (!options) return null;
        if (typeof options === 'object') return options;
        if (typeof options !== 'string') return null;
        try {
            return JSON.parse(options);
        } catch (_error) {
            return null;
        }
    }

    getSelectOptions(field) {
        const normalizedOptions = this.getManagedListFieldOptions(field);
        if (normalizedOptions) {
            const listId = Number(normalizedOptions?.list_id);
            if (!Number.isFinite(listId) || listId <= 0) return [];
            if (normalizedOptions.parent_field_name) {
                return [];
            }
            return (this.managedListValues[listId] || []).filter(item => item && item.value);
        }
        return this.parseOptions(field.field_options || field.options)
            .map(option => ({
                value: String(option ?? '').trim(),
                label: String(option ?? '').trim()
            }))
            .filter(option => option.value);
    }
    
    getFormData() {
        // Get the parent form (object-main-form) which contains all fields
        const form = document.getElementById('object-main-form');
        if (!form) return null;
        this.syncRichTextEditors(form);
        
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
            const managedOptions = this.getManagedListFieldOptions(field);
            const isMultiManagedSelect = (
                field.field_type === 'select'
                && managedOptions
                && String(managedOptions.selection_mode || 'single').toLowerCase() === 'multi'
            );
            
            if (field.field_type === 'boolean') {
                value = input.checked;
            } else if (field.field_type === 'number' || field.field_type === 'decimal') {
                value = input.value ? parseFloat(input.value) : null;
            } else if (isMultiManagedSelect && input instanceof HTMLSelectElement) {
                const selected = Array.from(input.selectedOptions || [])
                    .map(option => String(option.value || '').trim())
                    .filter(Boolean);
                value = selected.length ? selected : null;
            } else if (field.field_type === 'richtext') {
                const richValue = this.getRichTextFieldValue(field.field_name, form);
                value = richValue ? richValue : null;
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
        this.syncRichTextEditors(form);
        
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

            if (field.field_type === 'category_node') {
                const widget = input.closest?.('.category-field-widget') || input.parentElement;
                const display = widget?.querySelector?.('.category-field-display');
                if (!input.value || !input.value.trim()) {
                    isValid = false;
                    missingFields.push({ name: field.display_name || field.field_name, type: field.field_type, value: '' });
                    display?.classList.add('error');
                } else {
                    display?.classList.remove('error');
                }
                return;
            }

            const managedOptions = this.getManagedListFieldOptions(field);
            const isMultiManagedSelect = (
                field.field_type === 'select'
                && managedOptions
                && String(managedOptions.selection_mode || 'single').toLowerCase() === 'multi'
            );
            if (isMultiManagedSelect && input instanceof HTMLSelectElement) {
                const selectedCount = Array.from(input.selectedOptions || [])
                    .map(option => String(option.value || '').trim())
                    .filter(Boolean)
                    .length;
                const wrapper = input.closest('[data-managed-multi-field]');
                if (selectedCount === 0) {
                    isValid = false;
                    missingFields.push({
                        name: field.display_name || field.field_name,
                        type: field.field_type,
                        value: '[]'
                    });
                    input.classList.add('error');
                    wrapper?.classList?.add('error');
                } else {
                    input.classList.remove('error');
                    wrapper?.classList?.remove('error');
                }
                return;
            }
            
            const value = field.field_type === 'richtext'
                ? this.getRichTextFieldValue(field.field_name, form)
                : input.value;
            const comparableValue = field.field_type === 'richtext'
                ? stripHtmlTags(value || '')
                : value;
            // Check for empty values (covers both empty strings and whitespace)
            // For text-based inputs, also check trimmed value to catch whitespace-only entries
            if (comparableValue === null || comparableValue === undefined || (typeof comparableValue === 'string' && comparableValue.trim() === '')) {
                isValid = false;
                missingFields.push({
                    name: field.display_name || field.field_name,
                    type: field.field_type,
                    value: comparableValue
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
