/**
 * Instance Manager Component
 * Visualizes and edits structural instance relations for one object.
 */

const INSTANCE_MANAGER_TYPE_SPECS = [
    {
        key: 'assembly_to_product',
        display_name: 'Assembly -> Product',
        description: 'A parent Assembly contains or positions a Product as a structural child.',
        parent_scope: 'Assembly',
        child_scope: 'Product'
    },
    {
        key: 'assembly_to_assembly',
        display_name: 'Assembly -> Assembly',
        description: 'A parent Assembly is built up from one or more child assemblies.',
        parent_scope: 'Assembly',
        child_scope: 'Assembly'
    },
    {
        key: 'connection_to_product',
        display_name: 'Connection -> Product',
        description: 'A Connection instance places a Product inside a connection context.',
        parent_scope: 'Connection',
        child_scope: 'Product'
    },
    {
        key: 'module_to_assembly',
        display_name: 'Module -> Assembly',
        description: 'A Module is built from one or more Assembly instances.',
        parent_scope: 'Module',
        child_scope: 'Assembly'
    },
    {
        key: 'space_to_product',
        display_name: 'Space -> Product',
        description: 'A Space contains or hosts a Product instance.',
        parent_scope: 'Space',
        child_scope: 'Product'
    },
    {
        key: 'space_to_assembly',
        display_name: 'Space -> Assembly',
        description: 'A Space contains or hosts an Assembly instance.',
        parent_scope: 'Space',
        child_scope: 'Assembly'
    },
    {
        key: 'space_to_module',
        display_name: 'Space -> Module',
        description: 'A Space contains or hosts a Module instance.',
        parent_scope: 'Space',
        child_scope: 'Module'
    },
    {
        key: 'subsys_to_product',
        display_name: 'SubSys -> Product',
        description: 'A SubSys contains or hosts a Product instance.',
        parent_scope: 'SubSys',
        child_scope: 'Product'
    },
    {
        key: 'sys_to_subsys',
        display_name: 'Sys -> SubSys',
        description: 'A Sys contains or hosts a SubSys instance.',
        parent_scope: 'Sys',
        child_scope: 'SubSys'
    }
];

const INSTANCE_NATIVE_FIELD_DEFS = {
    quantity: { label: 'Antal', field_type: 'number', input: 'number', step: 'any', min: '0' },
    unit: { label: 'Enhet', field_type: 'text', input: 'text' },
    formula: { label: 'Formel', field_type: 'text', input: 'text', fullWidth: true },
    role: { label: 'Roll', field_type: 'text', input: 'text' },
    position: { label: 'Position', field_type: 'text', input: 'text' },
    waste_factor: { label: 'Spillfaktor', field_type: 'number', input: 'number', step: 'any', min: '0' },
    installation_sequence: { label: 'Installationsordning', field_type: 'integer', input: 'number', step: '1', min: '0' },
    optional: { label: 'Valfri instans', field_type: 'boolean', input: 'checkbox', fullWidth: true }
};

function normalizeInstanceManagerTypeName(value) {
    return String(value || '').trim().toLowerCase().replace(/\s+/g, '');
}

function getInstanceManagerObjectDisplayName(obj) {
    return obj?.data?.namn
        || obj?.data?.Namn
        || obj?.data?.name
        || obj?.data?.Name
        || obj?.id_full
        || `Objekt ${obj?.id || ''}`;
}

class InstanceManagerComponent {
    constructor(containerId, objectId, options = {}) {
        this.container = document.getElementById(containerId);
        this.objectId = Number(objectId);
        this.objectData = options.objectData || null;
        this.layout = String(options.layout || 'embedded').toLowerCase();
        this.onClose = typeof options.onClose === 'function' ? options.onClose : null;
        this.instances = [];
        this.objectOptions = [];
        this.selectedInstanceId = null;
        this.selectedInstanceContext = null;
        this.instanceTable = null;
        this.formState = this.getDefaultFormState();
        this.isBusy = false;
        this.objectSelectLoaded = false;
        this.objectSearchTerm = '';
        this.objectPickerOpen = false;
        this.activeInstanceTypeTab = '';
        this.linkedObjectFieldDisplayNameByField = new Map();
        this.workspaceColumnSelection = new Set();
        this.workspaceColumnOrder = [];
        this.workspaceColumnWidths = {};
        this.draggedWorkspaceColumnField = null;
        this.instanceTypeConfiguredFieldsByType = new Map();
        this.inlineDrafts = new Map();
    }

    get currentObjectTypeName() {
        return String(this.objectData?.object_type?.name || '').trim();
    }

    getDefaultFormState() {
        const matchingSpecs = this.getAvailableInstanceTypeSpecs();
        const initialSpec = matchingSpecs[0] || INSTANCE_MANAGER_TYPE_SPECS[0] || null;
        const allowedDirections = initialSpec ? this.getAllowedDirectionsForSpec(initialSpec) : ['outgoing'];
        return {
            instance_type: initialSpec?.key || '',
            direction: allowedDirections[0] || 'outgoing',
            linked_object_id: '',
            quantity: '',
            unit: '',
            formula: '',
            role: '',
            position: '',
            waste_factor: '',
            installation_sequence: '',
            optional: false,
            metadata_json: {}
        };
    }

    getAvailableInstanceTypeSpecs() {
        const currentType = normalizeInstanceManagerTypeName(this.currentObjectTypeName);
        const matches = INSTANCE_MANAGER_TYPE_SPECS.filter(spec => {
            const parentMatch = normalizeInstanceManagerTypeName(spec.parent_scope) === currentType;
            const childMatch = normalizeInstanceManagerTypeName(spec.child_scope) === currentType;
            return parentMatch || childMatch;
        });
        return matches.length ? matches : INSTANCE_MANAGER_TYPE_SPECS.slice();
    }

    getInstanceTypeSpec(instanceTypeKey) {
        return INSTANCE_MANAGER_TYPE_SPECS.find(item => item.key === instanceTypeKey) || null;
    }

    getAllowedDirectionsForSpec(spec) {
        const currentType = normalizeInstanceManagerTypeName(this.currentObjectTypeName);
        const directions = [];
        if (normalizeInstanceManagerTypeName(spec?.parent_scope) === currentType) {
            directions.push('outgoing');
        }
        if (normalizeInstanceManagerTypeName(spec?.child_scope) === currentType) {
            directions.push('incoming');
        }
        return directions.length ? directions : ['outgoing', 'incoming'];
    }

    getCurrentSpecDirectionOptions() {
        const spec = this.getInstanceTypeSpec(this.formState.instance_type);
        return this.getAllowedDirectionsForSpec(spec);
    }

    getFilteredObjectOptions() {
        const spec = this.getInstanceTypeSpec(this.formState.instance_type);
        if (!spec) return this.objectOptions.slice();

        const expectedType = this.formState.direction === 'incoming'
            ? spec.parent_scope
            : spec.child_scope;
        const normalizedExpectedType = normalizeInstanceManagerTypeName(expectedType);
        const matchingOptions = this.objectOptions.filter(option => (
            normalizeInstanceManagerTypeName(option?.object_type?.name) === normalizedExpectedType
        ));

        if (
            this.formState.linked_object_id
            && !matchingOptions.some(option => Number(option.id) === Number(this.formState.linked_object_id))
        ) {
            const currentOption = this.objectOptions.find(option => Number(option.id) === Number(this.formState.linked_object_id));
            if (currentOption) {
                return [currentOption, ...matchingOptions];
            }
        }

        return matchingOptions;
    }

    syncFormStateWithConstraints() {
        const currentSpec = this.getInstanceTypeSpec(this.formState.instance_type);
        const availableSpecs = this.getAvailableInstanceTypeSpecs();

        if (!currentSpec) {
            this.formState.instance_type = availableSpecs[0]?.key || '';
        }

        const allowedDirections = this.getCurrentSpecDirectionOptions();
        if (!allowedDirections.includes(this.formState.direction)) {
            this.formState.direction = allowedDirections[0] || 'outgoing';
        }

        const filteredOptions = this.getFilteredObjectOptions();
        if (!filteredOptions.some(option => String(option.id) === String(this.formState.linked_object_id || ''))) {
            this.formState.linked_object_id = '';
        }
    }

    async render() {
        if (!this.container) return;

        const showCloseAction = false;
        const managerClass = this.layout === 'workspace' ? 'instance-manager instance-manager-workspace' : 'instance-manager';
        const showAdvancedSections = this.layout !== 'workspace';

        this.container.innerHTML = `
            <div class="${managerClass}">
                <div class="view-header">
                    <h3>Instanser</h3>
                    <div class="instance-manager-header-actions">
                        ${showAdvancedSections ? `
                        <button type="button" class="btn btn-primary btn-sm instance-add-compact-btn" data-action="new-instance">
                            Ny instans
                        </button>
                        ` : ''}
                        ${showCloseAction ? '<button type="button" class="btn btn-secondary btn-sm" data-action="close-instance-workspace">Stäng</button>' : ''}
                    </div>
                </div>
                <div id="instance-type-tabs-${this.objectId}" class="tabs instance-type-tabs-header"></div>
                <div id="instance-workspace-filters-${this.objectId}"></div>
                ${showAdvancedSections ? `<div id="instance-visualization-container-${this.objectId}"></div>` : ''}
                <div id="instance-system-table-container-${this.objectId}"></div>
                ${showAdvancedSections ? `<div id="instance-editor-container-${this.objectId}"></div>` : ''}
            </div>
        `;

        const loadResults = await Promise.allSettled([
            this.loadInstances(),
            this.loadObjectOptions(),
            this.loadInstanceTypeFieldConfig(),
            this.loadLinkedObjectFieldDisplayNames()
        ]);

        if (loadResults[0]?.status === 'rejected') {
            console.error('Failed to load instances:', loadResults[0].reason);
            this.instances = [];
            showToast('Kunde inte ladda instanser', 'error');
        }

        if (loadResults[1]?.status === 'rejected') {
            console.error('Failed to load object options:', loadResults[1].reason);
            this.objectOptions = [];
            this.objectSelectLoaded = false;
        }

        this.renderInstanceTypeTabs();
        this.renderWorkspaceFilters();
        if (showAdvancedSections) {
            this.renderVisualization();
        }
        this.renderTable();
        if (showAdvancedSections) {
            this.renderEditor();
        }
        this.attachStaticListeners();
    }

    async loadInstances() {
        this.instances = await InstancesAPI.getAll({ object_id: this.objectId });
    }

    async loadObjectOptions() {
        const collected = [];
        let page = 1;
        let totalPages = 1;

        do {
            const response = await ObjectsAPI.getAllPaginated({
                minimal: true,
                page,
                per_page: 250
            });

            const items = Array.isArray(response?.items)
                ? response.items
                : Array.isArray(response)
                    ? response
                    : [];

            collected.push(...items);

            if (Array.isArray(response)) {
                totalPages = 1;
            } else {
                totalPages = Number(response?.total_pages || 1);
            }
            page += 1;
        } while (page <= totalPages);

        this.objectOptions = collected
            .filter(obj => Number(obj?.id) !== this.objectId)
            .sort((a, b) => {
                const typeCompare = String(a?.object_type?.name || '').localeCompare(String(b?.object_type?.name || ''), 'sv');
                if (typeCompare !== 0) return typeCompare;
                return getInstanceManagerObjectDisplayName(a).localeCompare(getInstanceManagerObjectDisplayName(b), 'sv');
            });
        this.objectSelectLoaded = true;
        this.syncFormStateWithConstraints();
    }

    async loadInstanceTypeFieldConfig() {
        this.instanceTypeConfiguredFieldsByType = new Map();
        try {
            const response = await RelationTypeRulesAPI.getAll();
            const items = Array.isArray(response?.instance_type_fields) ? response.instance_type_fields : [];
            items.forEach(item => {
                const key = String(item?.instance_type_key || '').trim().toLowerCase();
                if (!key) return;
                if (!this.instanceTypeConfiguredFieldsByType.has(key)) {
                    this.instanceTypeConfiguredFieldsByType.set(key, []);
                }
                const bucket = this.instanceTypeConfiguredFieldsByType.get(key);
                bucket.push(item);
            });

            this.instanceTypeConfiguredFieldsByType.forEach((rows, key) => {
                rows.sort((a, b) => Number(a?.display_order || 0) - Number(b?.display_order || 0));
                this.instanceTypeConfiguredFieldsByType.set(key, rows);
            });
        } catch (error) {
            console.error('Failed to load instance type field configuration:', error);
        }
    }

    async loadLinkedObjectFieldDisplayNames() {
        this.linkedObjectFieldDisplayNameByField = new Map();
        try {
            const response = await fetch('/api/view-config/list-view');
            if (!response.ok) return;
            const payload = await response.json();
            Object.values(payload || {}).forEach(typeConfig => {
                const fields = Array.isArray(typeConfig?.available_fields) ? typeConfig.available_fields : [];
                fields.forEach(field => {
                    const fieldName = String(field?.field_name || '').trim();
                    if (!fieldName || this.linkedObjectFieldDisplayNameByField.has(fieldName)) return;
                    const displayName = String(field?.display_name || '').trim() || this.formatWorkspaceFieldLabel(fieldName);
                    this.linkedObjectFieldDisplayNameByField.set(fieldName, displayName);
                });
            });
        } catch (error) {
            console.error('Failed to load linked object field display names:', error);
        }
    }

    buildRowSummary(instance, direction) {
        const spec = this.getInstanceTypeSpec(instance.instance_type);
        const parts = [
            direction === 'incoming' ? 'Inkommande' : 'Utgående',
            spec?.display_name || instance.instance_type || 'Okänd instanstyp'
        ];
        if (instance.quantity !== null && instance.quantity !== undefined && instance.quantity !== '') {
            parts.push(`Antal: ${instance.quantity}${instance.unit ? ` ${instance.unit}` : ''}`);
        }
        if (instance.role) parts.push(`Roll: ${instance.role}`);
        if (instance.position) parts.push(`Position: ${instance.position}`);
        if (instance.optional) parts.push('Valfri');
        return parts.join(' • ');
    }

    buildTableRows() {
        return (this.instances || []).map(instance => {
            const isOutgoing = Number(instance.parent_object_id) === this.objectId;
            const linkedObject = isOutgoing ? instance.child_object : instance.parent_object;
            const summary = this.buildRowSummary(instance, isOutgoing ? 'outgoing' : 'incoming');
            return {
                instance_id: Number(instance.id),
                linked_object_id: Number(linkedObject?.id || 0),
                id_full: linkedObject?.id_full || 'N/A',
                type: linkedObject?.object_type?.name || 'N/A',
                name: getInstanceManagerObjectDisplayName(linkedObject),
                description: summary,
                summary_html: `
                    <div class="instance-summary-text">
                        <span class="instance-direction-chip ${isOutgoing ? 'outgoing' : 'incoming'}">${isOutgoing ? 'Utgående' : 'Inkommande'}</span>
                        <span>${escapeHtml(summary)}</span>
                    </div>
                `
            };
        });
    }

    getLinkedObjectForInstance(instance) {
        const isOutgoing = Number(instance?.parent_object_id) === this.objectId;
        return isOutgoing ? instance?.child_object : instance?.parent_object;
    }

    getWorkspaceLinkedTypeOptions() {
        const types = new Set();
        (this.instances || []).forEach(instance => {
            const linkedObject = this.getLinkedObjectForInstance(instance);
            const typeName = String(linkedObject?.object_type?.name || '').trim();
            if (typeName) types.add(typeName);
        });
        return Array.from(types).sort((a, b) => a.localeCompare(b, 'sv'));
    }

    getWorkspaceLinkedObjectDataFieldKeys() {
        const keys = new Set();
        (this.instances || []).forEach(instance => {
            const linkedObject = this.getLinkedObjectForInstance(instance);
            const objectData = linkedObject?.data;
            if (!objectData || typeof objectData !== 'object' || Array.isArray(objectData)) return;
            Object.keys(objectData).forEach(key => {
                const normalized = String(key || '').trim();
                if (normalized) keys.add(normalized);
            });
        });
        return Array.from(keys).sort((a, b) => a.localeCompare(b, 'sv'));
    }

    getWorkspaceInstanceMetadataFieldKeys() {
        const keys = new Set();
        (this.instances || []).forEach(instance => {
            const metadata = instance?.metadata_json;
            if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return;
            Object.keys(metadata).forEach(key => {
                const normalized = String(key || '').trim();
                if (normalized) keys.add(normalized);
            });
        });
        return Array.from(keys).sort((a, b) => a.localeCompare(b, 'sv'));
    }

    formatWorkspaceFieldLabel(rawKey) {
        const key = String(rawKey || '').trim();
        if (!key) return 'Okänt fält';
        return key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' ');
    }

    getNativeInstanceFieldDef(fieldName) {
        const key = String(fieldName || '').trim();
        return INSTANCE_NATIVE_FIELD_DEFS[key] || null;
    }

    getConfiguredFieldsForType(typeKey) {
        const normalizedTypeKey = String(typeKey || '').trim().toLowerCase();
        if (!normalizedTypeKey) return [];

        return (this.instanceTypeConfiguredFieldsByType.get(normalizedTypeKey) || [])
            .map((row) => {
                const template = row?.field_template || {};
                const fieldName = String(template?.field_name || '').trim();
                const nativeDef = this.getNativeInstanceFieldDef(fieldName);
                if (!fieldName) return null;
                return {
                    key: `cfg:${fieldName}`,
                    field_name: fieldName,
                    label: String(template?.display_name || '').trim() || nativeDef?.label || this.formatWorkspaceFieldLabel(fieldName),
                    field_type: String(template?.field_type || nativeDef?.field_type || 'text').trim().toLowerCase(),
                    native: Boolean(nativeDef),
                    nativeDef,
                    template
                };
            })
            .filter(Boolean);
    }

    getWorkspaceColumnCatalog() {
        const configuredTypeKeys = new Set(
            (this.instances || []).map(item => String(item?.instance_type || '').trim().toLowerCase()).filter(Boolean)
        );
        const configuredFieldColumns = [];
        const configuredFieldSeen = new Set();
        configuredTypeKeys.forEach(typeKey => {
            this.getConfiguredFieldsForType(typeKey).forEach((column) => {
                const columnKey = String(column.key || '').trim();
                if (configuredFieldSeen.has(columnKey)) return;
                configuredFieldSeen.add(columnKey);
                configuredFieldColumns.push(column);
            });
        });

        const metadataColumns = this.getWorkspaceInstanceMetadataFieldKeys().map(key => ({
            key: `meta:${key}`,
            label: this.formatWorkspaceFieldLabel(key)
        }));

        const objectColumns = this.getWorkspaceLinkedObjectDataFieldKeys().map(key => ({
            key: `obj:${key}`,
            label: this.linkedObjectFieldDisplayNameByField.get(key) || this.formatWorkspaceFieldLabel(key)
        }));

        return [...configuredFieldColumns, ...metadataColumns, ...objectColumns];
    }

    getFilteredInstances() {
        this.ensureActiveInstanceTypeTab();
        const activeTab = String(this.activeInstanceTypeTab || '').trim().toLowerCase();
        return (this.instances || []).filter(instance => {
            const instanceTypeKey = String(instance?.instance_type || '').trim().toLowerCase();

            if (activeTab && instanceTypeKey !== activeTab) {
                return false;
            }

            return true;
        });
    }

    getInlineDraft(instance) {
        const safeId = Number(instance?.id || 0);
        if (!safeId) return null;

        if (this.inlineDrafts.has(safeId)) {
            return this.inlineDrafts.get(safeId);
        }

        const initialDraft = {
            quantity: instance.quantity ?? '',
            unit: instance.unit || '',
            waste_factor: instance.waste_factor ?? '',
            role: instance.role || '',
            position: instance.position || '',
            formula: instance.formula || '',
            installation_sequence: instance.installation_sequence ?? '',
            metadata_json: (instance.metadata_json && typeof instance.metadata_json === 'object' && !Array.isArray(instance.metadata_json))
                ? { ...instance.metadata_json }
                : {},
            optional: Boolean(instance.optional),
            __dirty: false
        };
        this.inlineDrafts.set(safeId, initialDraft);
        return initialDraft;
    }

    ensureWorkspaceColumnSelection() {
        const catalog = this.getWorkspaceColumnCatalog();
        const availableKeys = new Set(catalog.map(column => String(column.key || '').trim()).filter(Boolean));

        if (!availableKeys.size) {
            this.workspaceColumnSelection.clear();
            return;
        }

        const nextSelection = new Set(
            Array.from(this.workspaceColumnSelection).filter(key => availableKeys.has(String(key || '').trim()))
        );

        if (!nextSelection.size) {
            catalog.forEach((column) => {
                const key = String(column.key || '').trim();
                if (!key) return;
                if (column.native || key.startsWith('cfg:')) {
                    nextSelection.add(key);
                }
            });
        }

        if (!nextSelection.size) {
            catalog.slice(0, 4).forEach((column) => {
                const key = String(column.key || '').trim();
                if (key) nextSelection.add(key);
            });
        }

        this.workspaceColumnSelection = nextSelection;
    }

    getWorkspaceInstanceTypeTabs() {
        const typeKeys = Array.from(new Set((this.instances || [])
            .map(item => String(item?.instance_type || '').trim().toLowerCase())
            .filter(Boolean)));

        return typeKeys
            .map(key => {
                const spec = this.getInstanceTypeSpec(key);
                return {
                    key,
                    label: spec?.display_name || this.formatWorkspaceFieldLabel(key)
                };
            })
            .sort((a, b) => a.label.localeCompare(b.label, 'sv'));
    }

    ensureActiveInstanceTypeTab() {
        const tabs = this.getWorkspaceInstanceTypeTabs();
        if (!tabs.length) {
            this.activeInstanceTypeTab = '';
            return;
        }
        if (!tabs.some(item => item.key === this.activeInstanceTypeTab)) {
            this.activeInstanceTypeTab = tabs[0].key;
        }
    }

    renderInstanceTypeTabs() {
        const container = document.getElementById(`instance-type-tabs-${this.objectId}`);
        if (!container) return;

        const instanceTypeTabs = this.getWorkspaceInstanceTypeTabs();
        this.ensureActiveInstanceTypeTab();

        if (!instanceTypeTabs.length) {
            container.innerHTML = '';
            return;
        }

        container.innerHTML = `
            ${instanceTypeTabs.map(item => `<button type="button" class="tab-btn ${this.activeInstanceTypeTab === item.key ? 'active' : ''}" data-instance-type-tab="${escapeHtml(item.key)}">${escapeHtml(item.label)}</button>`).join('')}
        `;

        container.querySelectorAll('[data-instance-type-tab]').forEach(button => {
            button.addEventListener('click', () => {
                this.activeInstanceTypeTab = String(button.dataset.instanceTypeTab || '');
                this.renderInstanceTypeTabs();
                this.renderTable();
            });
        });
    }

    renderWorkspaceFilters() {
        const container = document.getElementById(`instance-workspace-filters-${this.objectId}`);
        if (!container) return;

        const columnCatalog = this.getWorkspaceColumnCatalog();
        this.ensureWorkspaceColumnSelection();

        container.innerHTML = `
            <div class="instance-workspace-filters">
                <div class="instance-workspace-toolbar">
                    <button type="button" class="btn btn-primary btn-sm" id="instance-save-all-btn-${this.objectId}">Spara alla</button>
                    <button type="button" class="btn btn-secondary btn-sm" id="instance-column-config-btn-${this.objectId}">⚙️ Kolumner</button>
                </div>
                <div id="instance-column-config-panel-${this.objectId}" class="column-config-panel instance-column-config-panel" style="display: none;">
                    <div class="column-config-content">
                        <h4>Visa/Dölj Kolumner</h4>
                        <div id="instance-column-toggles-${this.objectId}">
                            ${columnCatalog.map(column => `
                                <label class="column-toggle">
                                    <input type="checkbox" data-column-key="${escapeHtml(column.key)}" ${this.workspaceColumnSelection.has(column.key) ? 'checked' : ''}>
                                    ${escapeHtml(column.label)}
                                </label>
                            `).join('')}
                        </div>
                    </div>
                </div>
            </div>
        `;

        const configButton = container.querySelector(`#instance-column-config-btn-${this.objectId}`);
        const configPanel = container.querySelector(`#instance-column-config-panel-${this.objectId}`);
        const saveAllButton = container.querySelector(`#instance-save-all-btn-${this.objectId}`);
        if (configButton && configPanel) {
            configButton.addEventListener('click', () => {
                configPanel.style.display = configPanel.style.display === 'none' ? 'block' : 'none';
            });
        }

        if (saveAllButton) {
            saveAllButton.addEventListener('click', async () => {
                await this.saveAllVisibleRows();
            });
        }

        container.querySelectorAll('[data-column-key]').forEach(input => {
            input.addEventListener('change', event => {
                const key = String(event.target.dataset.columnKey || '').trim();
                if (!key) return;
                if (event.target.checked) {
                    this.workspaceColumnSelection.add(key);
                } else {
                    this.workspaceColumnSelection.delete(key);
                }
                this.renderTable();
            });
        });
    }

    getWorkspaceDynamicColumns() {
        const staticColumns = [
            {
                field: 'id_full',
                label: 'ID',
                className: 'col-id',
                width: this.getWorkspaceColumnWidth('id_full', 84),
                draggable: true,
                render: (row, table) => table.highlightText(row.id_full, 'id_full')
            },
            {
                field: 'type',
                label: 'Typ',
                className: 'col-type',
                width: this.getWorkspaceColumnWidth('type', 108),
                draggable: true,
                badge: 'type'
            },
            {
                field: 'name',
                label: 'Namn',
                className: 'col-name',
                width: this.getWorkspaceColumnWidth('name', 220),
                draggable: true
            }
        ];

        const selectedColumns = this.getWorkspaceColumnCatalog()
            .filter(column => this.workspaceColumnSelection.has(column.key))
            .map(column => {
                if (column.key.startsWith('meta:')) {
                    const metaKey = column.key.slice(5);
                    return {
                        field: column.key,
                        label: column.label,
                        className: 'col-description',
                        width: this.getWorkspaceColumnWidth(column.key, 132),
                        draggable: true,
                        searchable: false,
                        render: row => `<input type="text" class="form-control form-control-sm instance-inline-input" data-instance-id="${row.instance_id}" data-field="metadata_json" data-meta-key="${escapeHtml(metaKey)}" value="${escapeHtml(String(row[column.key] || ''))}">`
                    };
                }

                if (column.key.startsWith('cfg:')) {
                    const configuredKey = column.key.slice(4);
                    const fieldType = String(column.field_type || 'text').toLowerCase();
                    const nativeFieldDef = column.native ? this.getNativeInstanceFieldDef(configuredKey) : null;

                    if (nativeFieldDef?.input === 'checkbox' || fieldType === 'boolean') {
                        const dataFieldAttr = nativeFieldDef ? ` data-field="${escapeHtml(configuredKey)}"` : ' data-field="metadata_json"';
                        const dataMetaAttr = nativeFieldDef ? '' : ` data-meta-key="${escapeHtml(configuredKey)}"`;
                        return {
                            field: column.key,
                            label: column.label,
                            className: 'col-actions',
                            width: this.getWorkspaceColumnWidth(column.key, 92),
                            draggable: true,
                            searchable: false,
                            render: row => `<input type="checkbox" class="instance-inline-checkbox" data-instance-id="${row.instance_id}"${dataFieldAttr}${dataMetaAttr} ${Boolean(row[column.key]) ? 'checked' : ''}>`
                        };
                    }

                    if (nativeFieldDef?.input === 'number' || fieldType === 'number' || fieldType === 'float' || fieldType === 'integer') {
                        const step = nativeFieldDef?.step || (fieldType === 'integer' ? '1' : 'any');
                        const min = nativeFieldDef?.min ? ` min="${escapeHtml(nativeFieldDef.min)}"` : '';
                        const dataFieldAttr = nativeFieldDef ? ` data-field="${escapeHtml(configuredKey)}"` : ' data-field="metadata_json"';
                        const dataMetaAttr = nativeFieldDef ? '' : ` data-meta-key="${escapeHtml(configuredKey)}"`;
                        return {
                            field: column.key,
                            label: column.label,
                            className: 'col-description',
                            width: this.getWorkspaceColumnWidth(column.key, 132),
                            draggable: true,
                            searchable: false,
                            render: row => `<input type="number" step="${escapeHtml(step)}"${min} class="form-control form-control-sm instance-inline-input" data-instance-id="${row.instance_id}"${dataFieldAttr}${dataMetaAttr} value="${escapeHtml(String(row[column.key] ?? ''))}">`
                        };
                    }

                    if (nativeFieldDef) {
                        return {
                            field: column.key,
                            label: column.label,
                            className: 'col-description',
                            width: this.getWorkspaceColumnWidth(column.key, 132),
                            draggable: true,
                            searchable: false,
                            render: row => `<input type="text" class="form-control form-control-sm instance-inline-input" data-instance-id="${row.instance_id}" data-field="${escapeHtml(configuredKey)}" value="${escapeHtml(String(row[column.key] || ''))}">`
                        };
                    }

                    return {
                        field: column.key,
                        label: column.label,
                        className: 'col-description',
                        width: this.getWorkspaceColumnWidth(column.key, 132),
                        draggable: true,
                        searchable: false,
                        render: row => `<input type="text" class="form-control form-control-sm instance-inline-input" data-instance-id="${row.instance_id}" data-field="metadata_json" data-meta-key="${escapeHtml(configuredKey)}" value="${escapeHtml(String(row[column.key] || ''))}">`
                    };
                }

                return {
                    field: column.key,
                    label: column.label,
                    className: 'col-description',
                    width: this.getWorkspaceColumnWidth(column.key, 132),
                    draggable: true,
                    render: (row, table) => table.highlightText(String(row[column.key] || ''), column.key)
                };
            });

        return this.applyWorkspaceColumnOrder([...staticColumns, ...selectedColumns]);
    }

    getWorkspaceColumnWidth(field, fallbackWidth) {
        const width = Number(this.workspaceColumnWidths?.[field]);
        if (Number.isFinite(width) && width > 0) return width;
        return fallbackWidth;
    }

    applyWorkspaceColumnOrder(columns) {
        const list = Array.isArray(columns) ? columns.slice() : [];
        const availableColumns = new Map(list.map(column => [String(column.field), column]));
        if (!Array.isArray(this.workspaceColumnOrder) || !this.workspaceColumnOrder.length) {
            this.workspaceColumnOrder = list.map(column => String(column.field));
            return list;
        }

        const ordered = [];
        this.workspaceColumnOrder.forEach(field => {
            if (!availableColumns.has(field)) return;
            ordered.push(availableColumns.get(field));
            availableColumns.delete(field);
        });

        const missingColumns = Array.from(availableColumns.values());
        if (missingColumns.length) {
            ordered.push(...missingColumns);
            this.workspaceColumnOrder = ordered.map(column => String(column.field));
        }
        return ordered;
    }

    enableWorkspaceColumnResizing(table) {
        if (!table || typeof makeTableColumnsResizable !== 'function') return;

        makeTableColumnsResizable({
            table,
            minWidth: 56,
            fixedLayout: true,
            headerSelector: 'thead tr:first-child th[data-column-key]',
            getColumnKey: (header) => header?.dataset?.columnKey || '',
            getInitialWidth: (field) => this.getWorkspaceColumnWidth(field, null),
            onResizeEnd: (field, width) => {
                const safeField = String(field || '').trim();
                const safeWidth = Math.max(56, Math.round(Number(width) || 0));
                if (!safeField || !safeWidth) return;
                this.workspaceColumnWidths[safeField] = safeWidth;
            }
        });
    }

    enableWorkspaceColumnReordering(table) {
        if (!table) return;

        const headers = Array.from(table.querySelectorAll('thead tr:first-child th[data-draggable-column="true"]'));
        headers.forEach((header) => {
            header.addEventListener('dragstart', (event) => {
                if (event.target?.closest?.('.column-resize-handle')) {
                    event.preventDefault();
                    return;
                }
                const field = String(header.dataset.field || '').trim();
                if (!field) return;
                this.draggedWorkspaceColumnField = field;
                header.classList.add('column-dragging');
                if (event.dataTransfer) {
                    event.dataTransfer.effectAllowed = 'move';
                    event.dataTransfer.setData('text/plain', field);
                }
            });

            header.addEventListener('dragend', () => {
                this.draggedWorkspaceColumnField = null;
                table.querySelectorAll('th.column-drop-before, th.column-drop-after, th.column-dragging').forEach((node) => {
                    node.classList.remove('column-drop-before', 'column-drop-after', 'column-dragging');
                });
            });

            header.addEventListener('dragover', (event) => {
                const targetField = String(header.dataset.field || '').trim();
                if (!this.draggedWorkspaceColumnField || this.draggedWorkspaceColumnField === targetField) return;
                event.preventDefault();
                const rect = header.getBoundingClientRect();
                const insertBefore = event.clientX < rect.left + (rect.width / 2);
                header.classList.toggle('column-drop-before', insertBefore);
                header.classList.toggle('column-drop-after', !insertBefore);
            });

            header.addEventListener('dragleave', () => {
                header.classList.remove('column-drop-before', 'column-drop-after');
            });

            header.addEventListener('drop', (event) => {
                if (!this.draggedWorkspaceColumnField) return;
                event.preventDefault();
                const targetField = String(header.dataset.field || '').trim();
                if (!targetField || targetField === this.draggedWorkspaceColumnField) return;
                const rect = header.getBoundingClientRect();
                const insertBefore = event.clientX < rect.left + (rect.width / 2);
                this.moveWorkspaceColumn(this.draggedWorkspaceColumnField, targetField, insertBefore);
            });
        });
    }

    moveWorkspaceColumn(sourceField, targetField, insertBefore) {
        const source = String(sourceField || '').trim();
        const target = String(targetField || '').trim();
        if (!source || !target || source === target) return;

        const currentColumns = this.getWorkspaceDynamicColumns().map(column => String(column.field));
        const order = Array.isArray(this.workspaceColumnOrder) && this.workspaceColumnOrder.length
            ? this.workspaceColumnOrder.filter(field => currentColumns.includes(field))
            : [...currentColumns];

        currentColumns.forEach(field => {
            if (!order.includes(field)) order.push(field);
        });

        const sourceIndex = order.indexOf(source);
        const targetIndex = order.indexOf(target);
        if (sourceIndex < 0 || targetIndex < 0) return;

        order.splice(sourceIndex, 1);
        let destinationIndex = order.indexOf(target);
        if (!insertBefore) destinationIndex += 1;
        order.splice(destinationIndex, 0, source);

        this.workspaceColumnOrder = order;
        this.renderTable();
    }

    buildInlinePayloadFromDraft(draft) {
        const metadata = (draft.metadata_json && typeof draft.metadata_json === 'object' && !Array.isArray(draft.metadata_json))
            ? { ...draft.metadata_json }
            : null;

        return {
            quantity: this.parseNullableNumber(draft.quantity, 'Antal'),
            unit: String(draft.unit || '').trim() || null,
            waste_factor: this.parseNullableNumber(draft.waste_factor, 'Spill'),
            role: String(draft.role || '').trim() || null,
            position: String(draft.position || '').trim() || null,
            formula: String(draft.formula || '').trim() || null,
            installation_sequence: this.parseNullableNumber(draft.installation_sequence, 'Installationsordning'),
            optional: Boolean(draft.optional),
            metadata_json: metadata
        };
    }

    async saveAllVisibleRows() {
        const visibleIds = new Set(this.getFilteredInstances().map(item => Number(item.id)).filter(Number.isFinite));
        const dirtyIds = Array.from(this.inlineDrafts.entries())
            .filter(([instanceId, draft]) => visibleIds.has(Number(instanceId)) && draft && draft.__dirty)
            .map(([instanceId]) => Number(instanceId));

        if (!dirtyIds.length) {
            showToast('Inga ändringar att spara', 'info');
            return;
        }

        const failures = [];
        for (const instanceId of dirtyIds) {
            try {
                const draft = this.inlineDrafts.get(instanceId);
                if (!draft) continue;
                const payload = this.buildInlinePayloadFromDraft(draft);
                await InstancesAPI.update(instanceId, payload);
                this.inlineDrafts.delete(instanceId);
            } catch (error) {
                failures.push({ instanceId, error });
            }
        }

        if (failures.length) {
            const first = failures[0];
            showToast(first?.error?.message || `Kunde inte spara alla rader (${failures.length} fel)`, 'error');
        } else {
            showToast(`${dirtyIds.length} rader sparade`, 'success');
        }

        await this.loadInstances();
        this.renderWorkspaceFilters();
        this.renderTable();
        await this.refreshDependentViews();
    }

    getCurrentObjectNode() {
        return {
            id: this.objectId,
            id_full: this.objectData?.id_full || String(this.objectId),
            object_type: this.objectData?.object_type || null,
            data: this.objectData?.data || {}
        };
    }

    renderVisualization() {
        const container = document.getElementById(`instance-visualization-container-${this.objectId}`);
        if (!container) return;

        const currentObject = this.getCurrentObjectNode();
        const incomingInstances = (this.instances || []).filter(item => Number(item.child_object_id) === this.objectId);
        const outgoingInstances = (this.instances || []).filter(item => Number(item.parent_object_id) === this.objectId);

        const renderNodeCard = (obj, options = {}) => {
            const safeId = Number(obj?.id || 0);
            const typeName = String(obj?.object_type?.name || 'Objekt');
            const label = getInstanceManagerObjectDisplayName(obj);
            const idFull = String(obj?.id_full || safeId || 'N/A');
            const attrs = options.clickable !== false && safeId > 0
                ? `data-object-id="${safeId}" role="button" tabindex="0"`
                : '';
            const interactiveClass = options.clickable !== false && safeId > 0 ? ' instance-graph-node-clickable' : '';
            return `
                <div class="instance-graph-node${interactiveClass}" ${attrs}>
                    <span class="object-type-badge" style="background-color: ${getObjectTypeColor(typeName)}">${escapeHtml(typeName)}</span>
                    <strong>${escapeHtml(label)}</strong>
                    <small>${escapeHtml(idFull)}</small>
                </div>
            `;
        };

        const renderInstanceEdge = (instance, direction) => {
            const linkedObject = direction === 'incoming' ? instance.parent_object : instance.child_object;
            const spec = this.getInstanceTypeSpec(instance.instance_type);
            const relationLabel = spec?.display_name || String(instance.instance_type || 'Instans');
            const quantity = instance.quantity !== null && instance.quantity !== undefined && instance.quantity !== ''
                ? `${instance.quantity}${instance.unit ? ` ${instance.unit}` : ''}`
                : '';
            return `
                <div class="instance-graph-edge-row ${direction}">
                    ${direction === 'incoming' ? renderNodeCard(linkedObject) : ''}
                    <div class="instance-graph-edge ${direction}" data-instance-id="${Number(instance.id)}" role="button" tabindex="0">
                        <span class="instance-graph-arrow">${direction === 'incoming' ? '→' : '→'}</span>
                        <div class="instance-graph-edge-meta">
                            <strong>${escapeHtml(relationLabel)}</strong>
                            <small>${escapeHtml(quantity || (direction === 'incoming' ? 'Till detta objekt' : 'Från detta objekt'))}</small>
                        </div>
                    </div>
                    ${direction === 'outgoing' ? renderNodeCard(linkedObject) : ''}
                </div>
            `;
        };

        container.innerHTML = `
            <div class="instance-visualization-card">
                <div class="instance-visualization-header">
                    <div>
                        <h4>Strukturöversikt</h4>
                        <p class="instance-visualization-help">Visar inkommande och utgående instanser för aktuellt objekt. Klicka på en koppling för att öppna den i editorn.</p>
                    </div>
                    <div class="instance-visualization-stats">
                        <span class="instance-stat-chip">In ${incomingInstances.length}</span>
                        <span class="instance-stat-chip">Ut ${outgoingInstances.length}</span>
                    </div>
                </div>
                <div class="instance-graph-layout">
                    <div class="instance-graph-column incoming">
                        <div class="instance-graph-column-header">Inkommande</div>
                        ${incomingInstances.length
                            ? incomingInstances.map(item => renderInstanceEdge(item, 'incoming')).join('')
                            : '<div class="instance-graph-empty">Inga inkommande instanser</div>'}
                    </div>
                    <div class="instance-graph-center">
                        ${renderNodeCard(currentObject, { clickable: false })}
                    </div>
                    <div class="instance-graph-column outgoing">
                        <div class="instance-graph-column-header">Utgående</div>
                        ${outgoingInstances.length
                            ? outgoingInstances.map(item => renderInstanceEdge(item, 'outgoing')).join('')
                            : '<div class="instance-graph-empty">Inga utgående instanser</div>'}
                    </div>
                </div>
            </div>
        `;

        container.querySelectorAll('.instance-graph-node-clickable').forEach(node => {
            const openObject = () => {
                const objectId = Number(node.dataset.objectId || 0);
                if (objectId > 0 && typeof viewObjectDetail === 'function') {
                    viewObjectDetail(objectId);
                }
            };
            node.addEventListener('click', openObject);
            node.addEventListener('keydown', event => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    openObject();
                }
            });
        });

        container.querySelectorAll('.instance-graph-edge').forEach(edge => {
            const selectRelation = () => {
                const instanceId = Number(edge.dataset.instanceId || 0);
                if (instanceId > 0) {
                    this.selectInstance(instanceId);
                }
            };
            edge.addEventListener('click', selectRelation);
            edge.addEventListener('keydown', event => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    selectRelation();
                }
            });
        });
    }

    getObjectOptionLabel(option) {
        return `${option.id_full || option.id} • ${getInstanceManagerObjectDisplayName(option)} • ${option.object_type?.name || 'Objekt'}`;
    }

    getSelectedLinkedObjectOption() {
        return this.objectOptions.find(option => String(option.id) === String(this.formState.linked_object_id || '')) || null;
    }

    focusObjectSearchInput() {
        window.setTimeout(() => {
            const input = document.getElementById(`instance-linked-object-search-${this.objectId}`);
            if (!input) return;
            input.focus({ preventScroll: true });
            const valueLength = String(input.value || '').length;
            try {
                input.setSelectionRange(valueLength, valueLength);
            } catch (_error) {
                // Best effort only.
            }
        }, 0);
    }

    getVisibleObjectPickerOptions() {
        const filteredOptions = this.getFilteredObjectOptions();
        const term = String(this.objectSearchTerm || '').trim().toLowerCase();
        if (!term) return filteredOptions.slice(0, 12);

        return filteredOptions
            .filter(option => {
                const haystack = [
                    option.id_full,
                    getInstanceManagerObjectDisplayName(option),
                    option.object_type?.name,
                    option.data?.beskrivning,
                    option.data?.description
                ].filter(Boolean).join(' ').toLowerCase();
                return haystack.includes(term);
            })
            .slice(0, 12);
    }

    renderTable() {
        const hostId = `instance-system-table-container-${this.objectId}`;
        let sourceInstances = this.layout === 'workspace'
            ? this.getFilteredInstances()
            : (this.instances || []);

        if (this.layout === 'workspace' && !sourceInstances.length && (this.instances || []).length) {
            // Defensive fallback so rows are still visible even if tab state is stale.
            this.activeInstanceTypeTab = '';
            sourceInstances = this.getFilteredInstances();
            this.renderInstanceTypeTabs();
        }
        const rows = this.layout === 'workspace'
            ? sourceInstances.map(instance => {
                const linkedObject = this.getLinkedObjectForInstance(instance);
                const draft = this.getInlineDraft(instance) || {};
                const linkedData = (linkedObject?.data && typeof linkedObject.data === 'object' && !Array.isArray(linkedObject.data))
                    ? linkedObject.data
                    : {};
                const metadata = (draft.metadata_json && typeof draft.metadata_json === 'object' && !Array.isArray(draft.metadata_json))
                    ? draft.metadata_json
                    : {};
                const dynamicFields = {};

                this.getWorkspaceColumnCatalog().forEach(column => {
                    if (column.key.startsWith('obj:')) {
                        const objectFieldKey = column.key.slice(4);
                        dynamicFields[column.key] = linkedData[objectFieldKey] ?? '';
                    } else if (column.key.startsWith('meta:')) {
                        const metadataKey = column.key.slice(5);
                        dynamicFields[column.key] = metadata[metadataKey] ?? '';
                    } else if (column.key.startsWith('cfg:')) {
                        const configuredFieldKey = column.key.slice(4);
                        if (column.native) {
                            dynamicFields[column.key] = draft[configuredFieldKey] ?? '';
                        } else {
                            dynamicFields[column.key] = metadata[configuredFieldKey] ?? '';
                        }
                    }
                });

                return {
                    instance_id: Number(instance.id),
                    linked_object_id: Number(linkedObject?.id || 0),
                    id_full: linkedObject?.id_full || 'N/A',
                    type: linkedObject?.object_type?.name || 'N/A',
                    name: getInstanceManagerObjectDisplayName(linkedObject),
                    ...dynamicFields
                };
            })
            : this.buildTableRows();

        const columns = this.layout === 'workspace'
            ? this.getWorkspaceDynamicColumns()
            : [
                {
                    field: 'id_full',
                    label: 'ID',
                    className: 'col-id',
                    render: (row, table) => table.highlightText(row.id_full, 'id_full')
                },
                {
                    field: 'type',
                    label: 'Typ',
                    className: 'col-type',
                    badge: 'type'
                },
                {
                    field: 'name',
                    label: 'Namn',
                    className: 'col-name'
                },
                {
                    field: 'description',
                    label: 'Beskrivning',
                    className: 'col-description',
                    render: row => row.summary_html
                }
            ];

        this.instanceTable = new SystemTable({
            containerId: hostId,
            tableId: `instance-system-table-${this.objectId}`,
            columns,
            rows,
            emptyText: 'Inga instanser ännu',
            persistState: false,
            resizableColumns: this.layout !== 'workspace',
            reorderableColumns: this.layout !== 'workspace',
            globalSearch: this.layout === 'workspace' ? false : true,
            renderRow: (row, index, table) => `
                <tr data-row-index="${index}" class="${table.escape(Number(row.instance_id) === Number(this.selectedInstanceId) ? 'instance-row-selected' : '')}">
                    ${table.columns.map(column => `<td class="${column.className || 'col-default'}" data-column-key="${table.escape(column.field)}">${table.renderCell(row, column)}</td>`).join('')}
                </tr>
            `,
            onRowClick: this.layout === 'workspace'
                ? null
                : (row) => {
                    this.selectInstance(row.instance_id);
                },
            onRender: () => {
                this.container.querySelectorAll('.instance-inline-input').forEach(input => {
                    input.addEventListener('input', event => {
                        event.stopPropagation();
                        const instanceId = Number(input.dataset.instanceId || 0);
                        const field = String(input.dataset.field || '');
                        const metaKey = String(input.dataset.metaKey || '').trim();
                        if (!instanceId || !field) return;
                        const draft = this.inlineDrafts.get(instanceId) || {};
                        if (field === 'metadata_json' && metaKey) {
                            const metadata = (draft.metadata_json && typeof draft.metadata_json === 'object' && !Array.isArray(draft.metadata_json))
                                ? draft.metadata_json
                                : {};
                            metadata[metaKey] = input.value;
                            draft.metadata_json = metadata;
                        } else {
                            draft[field] = input.value;
                        }
                        draft.__dirty = true;
                        this.inlineDrafts.set(instanceId, draft);
                    });
                    input.addEventListener('click', event => event.stopPropagation());
                });

                this.container.querySelectorAll('.instance-inline-checkbox').forEach(input => {
                    input.addEventListener('change', event => {
                        event.stopPropagation();
                        const instanceId = Number(input.dataset.instanceId || 0);
                        const field = String(input.dataset.field || '');
                        const metaKey = String(input.dataset.metaKey || '').trim();
                        if (!instanceId || !field) return;
                        const draft = this.inlineDrafts.get(instanceId) || {};
                        if (field === 'metadata_json' && metaKey) {
                            const metadata = (draft.metadata_json && typeof draft.metadata_json === 'object' && !Array.isArray(draft.metadata_json))
                                ? draft.metadata_json
                                : {};
                            metadata[metaKey] = Boolean(input.checked);
                            draft.metadata_json = metadata;
                        } else {
                            draft[field] = Boolean(input.checked);
                        }
                        draft.__dirty = true;
                        this.inlineDrafts.set(instanceId, draft);
                    });
                    input.addEventListener('click', event => event.stopPropagation());
                });

                if (this.layout === 'workspace') {
                    const tableElement = document.getElementById(`instance-system-table-${this.objectId}`);
                    this.enableWorkspaceColumnResizing(tableElement);
                    this.enableWorkspaceColumnReordering(tableElement);
                }
            }
        });

        this.instanceTable.render();
    }

    selectInstance(instanceId) {
        const instance = (this.instances || []).find(item => Number(item.id) === Number(instanceId));
        if (!instance) return;

        const isOutgoing = Number(instance.parent_object_id) === this.objectId;
        const linkedObjectId = isOutgoing ? instance.child_object_id : instance.parent_object_id;
        const metadataJson = (instance.metadata_json && typeof instance.metadata_json === 'object' && !Array.isArray(instance.metadata_json))
            ? { ...instance.metadata_json }
            : {};

        this.selectedInstanceId = Number(instance.id);
        this.selectedInstanceContext = {
            instance_type: String(instance.instance_type || ''),
            parent_object_id: Number(instance.parent_object_id || 0),
            child_object_id: Number(instance.child_object_id || 0)
        };
        this.formState = {
            instance_type: String(instance.instance_type || ''),
            direction: isOutgoing ? 'outgoing' : 'incoming',
            linked_object_id: String(linkedObjectId || ''),
            quantity: instance.quantity ?? '',
            unit: instance.unit || '',
            formula: instance.formula || '',
            role: instance.role || '',
            position: instance.position || '',
            waste_factor: instance.waste_factor ?? '',
            installation_sequence: instance.installation_sequence ?? '',
            optional: Boolean(instance.optional),
            metadata_json: metadataJson
        };
        this.objectSearchTerm = '';
        this.objectPickerOpen = false;
        this.syncFormStateWithConstraints();
        this.renderVisualization();
        this.renderTable();
        this.renderEditor();
    }

    resetEditor() {
        this.selectedInstanceId = null;
        this.selectedInstanceContext = null;
        this.formState = this.getDefaultFormState();
        this.objectSearchTerm = '';
        this.objectPickerOpen = false;
        this.syncFormStateWithConstraints();
        this.renderVisualization();
        this.renderTable();
        this.renderEditor();
    }

    getEditorHeading() {
        if (!this.selectedInstanceId) return 'Ny instans';
        return `Redigera instans #${this.selectedInstanceId}`;
    }

    getCurrentSpecHelpText() {
        const spec = this.getInstanceTypeSpec(this.formState.instance_type);
        if (!spec) return 'Välj instanstyp och kopplat objekt.';

        if (this.selectedInstanceId) {
            return 'Grundprinciper (instanstyp, riktning och kopplat objekt) är låsta efter skapande. Du kan uppdatera kompletterande metadata.';
        }

        const allowedDirections = this.getAllowedDirectionsForSpec(spec);
        const directionLabel = this.formState.direction === 'incoming' ? 'inkommande' : 'utgående';
        const oppositeScope = this.formState.direction === 'incoming' ? spec.parent_scope : spec.child_scope;
        const directionHint = allowedDirections.length === 1
            ? `Nuvarande objekt kan bara vara ${directionLabel} för denna typ.`
            : `Nuvarande objekt kan vara både inkommande och utgående för denna typ.`;

        return `${spec.display_name}. Kopplat objekt bör vara av typen ${oppositeScope}. ${directionHint}`;
    }

    renderEditor() {
        const container = document.getElementById(`instance-editor-container-${this.objectId}`);
        if (!container) return;

        this.syncFormStateWithConstraints();

        const availableSpecs = this.getAvailableInstanceTypeSpecs();
        const directionOptions = this.getCurrentSpecDirectionOptions();
        const selectedLinkedObject = this.getSelectedLinkedObjectOption();
        const visiblePickerOptions = this.getVisibleObjectPickerOptions();
        const showPickerResults = this.objectPickerOpen || Boolean(String(this.objectSearchTerm || '').trim());
        const principlesLocked = Boolean(this.selectedInstanceId);
        const configuredFields = this.getConfiguredFieldsForType(this.formState.instance_type);
        const metadataState = (this.formState.metadata_json && typeof this.formState.metadata_json === 'object' && !Array.isArray(this.formState.metadata_json))
            ? this.formState.metadata_json
            : {};
        const configuredFieldInputs = configuredFields.map((field) => {
            const nativeDef = field.native ? this.getNativeInstanceFieldDef(field.field_name) : null;
            const fieldType = String(field.field_type || nativeDef?.field_type || 'text').toLowerCase();
            const inputClass = nativeDef?.fullWidth ? 'form-group instance-editor-full-width' : 'form-group';
            const inputId = `instance-configured-${this.objectId}-${field.field_name}`;

            if (nativeDef?.input === 'checkbox' || fieldType === 'boolean') {
                const checked = nativeDef ? Boolean(this.formState[field.field_name]) : Boolean(metadataState[field.field_name]);
                return `
                    <div class="${inputClass} instance-checkbox-row">
                        <label>
                            <input type="checkbox" data-configured-field="${escapeHtml(field.field_name)}" ${nativeDef ? 'data-native-field="true"' : ''} ${checked ? 'checked' : ''}>
                            ${escapeHtml(field.label)}
                        </label>
                    </div>
                `;
            }

            if (nativeDef?.input === 'number' || fieldType === 'number' || fieldType === 'float' || fieldType === 'integer') {
                const value = nativeDef ? this.formState[field.field_name] : (metadataState[field.field_name] ?? '');
                const step = nativeDef?.step || (fieldType === 'integer' ? '1' : 'any');
                const min = nativeDef?.min ? ` min="${escapeHtml(nativeDef.min)}"` : '';
                return `
                    <div class="${inputClass}">
                        <label for="${escapeHtml(inputId)}">${escapeHtml(field.label)}</label>
                        <input id="${escapeHtml(inputId)}" type="number" step="${escapeHtml(step)}"${min} class="form-control" data-configured-field="${escapeHtml(field.field_name)}" ${nativeDef ? 'data-native-field="true"' : ''} value="${escapeHtml(String(value ?? ''))}">
                    </div>
                `;
            }

            const value = nativeDef ? this.formState[field.field_name] : (metadataState[field.field_name] ?? '');
            return `
                <div class="${inputClass}">
                    <label for="${escapeHtml(inputId)}">${escapeHtml(field.label)}</label>
                    <input id="${escapeHtml(inputId)}" type="text" class="form-control" data-configured-field="${escapeHtml(field.field_name)}" ${nativeDef ? 'data-native-field="true"' : ''} value="${escapeHtml(String(value || ''))}">
                </div>
            `;
        }).join('');

        container.innerHTML = `
            <div class="instance-editor-card">
                <div class="instance-editor-header">
                    <div>
                        <h4>${escapeHtml(this.getEditorHeading())}</h4>
                        <p class="instance-editor-help">${escapeHtml(this.getCurrentSpecHelpText())}</p>
                    </div>
                    <button type="button" class="btn btn-secondary btn-sm" data-action="reset-instance-editor">
                        ${this.selectedInstanceId ? 'Avsluta redigering' : 'Rensa'}
                    </button>
                </div>
                <form id="instance-editor-form-${this.objectId}" class="instance-editor-form">
                    <div class="instance-editor-grid">
                        <div class="form-group">
                            <label for="instance-type-${this.objectId}">Instanstyp</label>
                            <select id="instance-type-${this.objectId}" name="instance_type" class="form-control" ${principlesLocked ? 'disabled' : ''}>
                                ${availableSpecs.map(spec => `<option value="${escapeHtml(spec.key)}" ${spec.key === this.formState.instance_type ? 'selected' : ''}>${escapeHtml(spec.display_name)}</option>`).join('')}
                            </select>
                        </div>
                        <div class="form-group">
                            <label for="instance-direction-${this.objectId}">Riktning</label>
                            <select id="instance-direction-${this.objectId}" name="direction" class="form-control" ${principlesLocked ? 'disabled' : ''}>
                                ${directionOptions.map(option => `<option value="${option}" ${option === this.formState.direction ? 'selected' : ''}>${option === 'incoming' ? 'Inkommande' : 'Utgående'}</option>`).join('')}
                            </select>
                        </div>
                        <div class="form-group instance-editor-full-width">
                            <label for="instance-linked-object-search-${this.objectId}">Kopplat objekt</label>
                            <div class="instance-object-picker ${showPickerResults ? 'open' : ''}">
                                <div class="instance-object-picker-input-row">
                                    <input id="instance-linked-object-search-${this.objectId}" name="linked_object_search" type="text" class="form-control search-input instance-object-search-input" placeholder="Sök på ID, namn eller typ..." value="${escapeHtml(String(this.objectSearchTerm || ''))}" ${(this.objectSelectLoaded && !principlesLocked) ? '' : 'disabled'} autocomplete="off">
                                    <button type="button" class="btn btn-secondary btn-sm" data-action="toggle-object-picker" ${(this.objectSelectLoaded && !principlesLocked) ? '' : 'disabled'}>
                                        ${showPickerResults ? 'Stäng' : 'Visa'}
                                    </button>
                                </div>
                                ${selectedLinkedObject ? `
                                    <div class="instance-selected-object-chip">
                                        <span class="object-type-badge" style="background-color: ${getObjectTypeColor(selectedLinkedObject.object_type?.name || 'Objekt')}">${escapeHtml(selectedLinkedObject.object_type?.name || 'Objekt')}</span>
                                        <span>${escapeHtml(this.getObjectOptionLabel(selectedLinkedObject))}</span>
                                        <button type="button" class="btn-icon instance-clear-object-btn" data-action="clear-linked-object" aria-label="Rensa valt objekt" title="Rensa valt objekt" ${principlesLocked ? 'disabled' : ''}>
                                            <span aria-hidden="true">×</span>
                                        </button>
                                    </div>
                                ` : ''}
                                ${(showPickerResults && !principlesLocked) ? `
                                    <div class="instance-object-picker-results" role="listbox">
                                        ${visiblePickerOptions.length
                                            ? visiblePickerOptions.map(option => `
                                                <button type="button" class="instance-object-picker-option ${String(option.id) === String(this.formState.linked_object_id) ? 'selected' : ''}" data-action="select-linked-object" data-object-id="${Number(option.id)}">
                                                    <span class="object-type-badge" style="background-color: ${getObjectTypeColor(option.object_type?.name || 'Objekt')}">${escapeHtml(option.object_type?.name || 'Objekt')}</span>
                                                    <span class="instance-object-picker-option-text">
                                                        <strong>${escapeHtml(getInstanceManagerObjectDisplayName(option))}</strong>
                                                        <small>${escapeHtml(option.id_full || String(option.id))}</small>
                                                    </span>
                                                </button>
                                            `).join('')
                                            : '<div class="instance-object-picker-empty">Inga objekt matchar sökningen</div>'}
                                    </div>
                                ` : ''}
                            </div>
                        </div>
                        ${configuredFieldInputs}
                    </div>
                    <div class="instance-editor-actions">
                        <button type="submit" class="btn btn-primary" ${this.isBusy ? 'disabled' : ''}>
                            ${this.selectedInstanceId ? 'Spara instans' : 'Skapa instans'}
                        </button>
                        ${this.selectedInstanceId ? `
                            <button type="button" class="btn btn-danger" data-action="delete-selected-instance" ${this.isBusy ? 'disabled' : ''}>
                                Ta bort
                            </button>
                        ` : ''}
                    </div>
                </form>
            </div>
        `;

        this.attachEditorListeners();
    }

    attachStaticListeners() {
        this.container.querySelector('[data-action="new-instance"]')?.addEventListener('click', () => {
            this.resetEditor();
        });
        this.container.querySelector('[data-action="close-instance-workspace"]')?.addEventListener('click', () => {
            if (this.onClose) this.onClose();
        });
    }

    parseNullableNumber(value, fieldLabel) {
        if (value === '' || value === null || value === undefined) return null;
        const numericValue = Number(value);
        if (Number.isNaN(numericValue)) {
            throw new Error(`${fieldLabel} måste vara ett nummer`);
        }
        return numericValue;
    }

    async saveInlineMetadata(instanceId) {
        const safeInstanceId = Number(instanceId || 0);
        if (!safeInstanceId) return;

        const draft = this.inlineDrafts.get(safeInstanceId);
        const instance = (this.instances || []).find(item => Number(item.id) === safeInstanceId);
        if (!draft || !instance) return;

        try {
            const payload = this.buildInlinePayloadFromDraft(draft);

            await InstancesAPI.update(safeInstanceId, payload);
            showToast('Metadata sparad', 'success');
            await this.loadInstances();
            this.inlineDrafts.delete(safeInstanceId);
            this.renderWorkspaceFilters();
            this.renderTable();
            await this.refreshDependentViews();
        } catch (error) {
            console.error('Failed to save inline metadata:', error);
            showToast(error.message || 'Kunde inte spara metadata', 'error');
        }
    }

    attachEditorListeners() {
        const form = document.getElementById(`instance-editor-form-${this.objectId}`);
        if (!form) return;

        form.addEventListener('submit', async (event) => {
            event.preventDefault();
            await this.saveInstance();
        });

        form.querySelector('[data-action="delete-selected-instance"]')?.addEventListener('click', async () => {
            await this.deleteInstance(this.selectedInstanceId);
        });

        this.container.querySelector('[data-action="reset-instance-editor"]')?.addEventListener('click', () => {
            this.resetEditor();
        });

        form.querySelector('[data-action="toggle-object-picker"]')?.addEventListener('click', () => {
            this.objectPickerOpen = !this.objectPickerOpen;
            this.renderEditor();
            if (this.objectPickerOpen) {
                this.focusObjectSearchInput();
            }
        });

        form.querySelector('[data-action="clear-linked-object"]')?.addEventListener('click', () => {
            this.formState.linked_object_id = '';
            this.objectSearchTerm = '';
            this.objectPickerOpen = false;
            this.renderEditor();
        });

        form.querySelectorAll('[data-action="select-linked-object"]').forEach(button => {
            button.addEventListener('click', () => {
                this.formState.linked_object_id = String(button.dataset.objectId || '');
                this.objectSearchTerm = '';
                this.objectPickerOpen = false;
                this.renderEditor();
            });
        });

        form.addEventListener('input', (event) => {
            const target = event.target;
            if (!target) return;

            const configuredField = String(target.dataset?.configuredField || '').trim();
            if (configuredField) {
                const isNativeField = target.dataset?.nativeField === 'true';
                if (target.type === 'checkbox') {
                    if (isNativeField) {
                        this.formState[configuredField] = Boolean(target.checked);
                    } else {
                        this.formState.metadata_json = {
                            ...(this.formState.metadata_json && typeof this.formState.metadata_json === 'object' && !Array.isArray(this.formState.metadata_json)
                                ? this.formState.metadata_json
                                : {}),
                            [configuredField]: Boolean(target.checked)
                        };
                    }
                    return;
                }

                if (isNativeField) {
                    this.formState[configuredField] = target.value;
                } else {
                    this.formState.metadata_json = {
                        ...(this.formState.metadata_json && typeof this.formState.metadata_json === 'object' && !Array.isArray(this.formState.metadata_json)
                            ? this.formState.metadata_json
                            : {}),
                        [configuredField]: target.value
                    };
                }
                return;
            }

            if (!target.name) return;

            if (target.name === 'linked_object_search') {
                this.objectSearchTerm = target.value;
                this.objectPickerOpen = true;
                this.renderEditor();
                this.focusObjectSearchInput();
                return;
            }
            this.formState[target.name] = target.value;
        });

        form.addEventListener('change', (event) => {
            const target = event.target;
            if (!target) return;

            const configuredField = String(target.dataset?.configuredField || '').trim();
            if (configuredField) {
                const isNativeField = target.dataset?.nativeField === 'true';
                const value = target.type === 'checkbox' ? Boolean(target.checked) : target.value;
                if (isNativeField) {
                    this.formState[configuredField] = value;
                } else {
                    this.formState.metadata_json = {
                        ...(this.formState.metadata_json && typeof this.formState.metadata_json === 'object' && !Array.isArray(this.formState.metadata_json)
                            ? this.formState.metadata_json
                            : {}),
                        [configuredField]: value
                    };
                }
                return;
            }

            if (!target.name) return;

            this.formState[target.name] = target.value;

            if (target.name === 'instance_type' || target.name === 'direction') {
                this.objectSearchTerm = '';
                this.objectPickerOpen = false;
                this.syncFormStateWithConstraints();
                this.renderEditor();
            }
        });
    }

    parseMetadataJson() {
        const value = this.formState.metadata_json;

        if (value && typeof value === 'object' && !Array.isArray(value)) {
            const entries = Object.entries(value)
                .map(([key, entryValue]) => [String(key || '').trim(), entryValue])
                .filter(([key, entryValue]) => {
                    if (!key) return false;
                    if (entryValue === null || entryValue === undefined) return false;
                    if (typeof entryValue === 'string' && entryValue.trim() === '') return false;
                    return true;
                });
            return entries.length ? Object.fromEntries(entries) : null;
        }

        const raw = String(value || '').trim();
        if (!raw) return null;

        try {
            return JSON.parse(raw);
        } catch (_error) {
            throw new Error('Metadata JSON måste vara giltig JSON');
        }
    }

    buildPayloadFromFormState() {
        if (this.selectedInstanceId) {
            return {
                quantity: this.formState.quantity === '' ? null : Number(this.formState.quantity),
                unit: String(this.formState.unit || '').trim() || null,
                formula: String(this.formState.formula || '').trim() || null,
                role: String(this.formState.role || '').trim() || null,
                position: String(this.formState.position || '').trim() || null,
                waste_factor: this.formState.waste_factor === '' ? null : Number(this.formState.waste_factor),
                installation_sequence: this.formState.installation_sequence === '' ? null : Number(this.formState.installation_sequence),
                optional: Boolean(this.formState.optional),
                metadata_json: this.parseMetadataJson()
            };
        }

        const linkedObjectId = Number(this.formState.linked_object_id || 0);
        if (!linkedObjectId) {
            throw new Error('Välj ett kopplat objekt');
        }

        const payload = {
            instance_type: String(this.formState.instance_type || '').trim(),
            parent_object_id: this.formState.direction === 'incoming' ? linkedObjectId : this.objectId,
            child_object_id: this.formState.direction === 'incoming' ? this.objectId : linkedObjectId,
            quantity: this.formState.quantity === '' ? null : Number(this.formState.quantity),
            unit: String(this.formState.unit || '').trim() || null,
            formula: String(this.formState.formula || '').trim() || null,
            role: String(this.formState.role || '').trim() || null,
            position: String(this.formState.position || '').trim() || null,
            waste_factor: this.formState.waste_factor === '' ? null : Number(this.formState.waste_factor),
            installation_sequence: this.formState.installation_sequence === '' ? null : Number(this.formState.installation_sequence),
            optional: Boolean(this.formState.optional),
            metadata_json: this.parseMetadataJson()
        };

        if (!payload.instance_type) {
            throw new Error('Välj instanstyp');
        }

        return payload;
    }

    async saveInstance() {
        if (this.isBusy) return;

        try {
            this.isBusy = true;
            const payload = this.buildPayloadFromFormState();
            let savedInstance = null;

            if (this.selectedInstanceId) {
                savedInstance = await InstancesAPI.update(this.selectedInstanceId, payload);
                showToast('Instans uppdaterad', 'success');
            } else {
                savedInstance = await InstancesAPI.create(payload);
                showToast('Instans skapad', 'success');
            }

            await this.loadInstances();
            this.renderVisualization();
            this.selectedInstanceId = Number(savedInstance?.id || 0) || null;
            if (this.selectedInstanceId) {
                this.selectInstance(this.selectedInstanceId);
            } else {
                this.resetEditor();
            }
            await this.refreshDependentViews();
        } catch (error) {
            console.error('Failed to save instance:', error);
            showToast(error.message || 'Kunde inte spara instans', 'error');
        } finally {
            this.isBusy = false;
            this.renderEditor();
        }
    }

    async deleteInstance(instanceId) {
        const safeInstanceId = Number(instanceId || 0);
        if (!safeInstanceId) return;
        if (!confirm('Är du säker på att du vill ta bort instansen?')) return;

        try {
            await InstancesAPI.delete(safeInstanceId);
            showToast('Instans borttagen', 'success');
            await this.loadInstances();
            this.inlineDrafts.delete(safeInstanceId);
            if (this.layout !== 'workspace') {
                this.renderVisualization();
                this.resetEditor();
            } else {
                this.renderWorkspaceFilters();
                this.renderTable();
            }
            await this.refreshDependentViews();
        } catch (error) {
            console.error('Failed to delete instance:', error);
            showToast(error.message || 'Kunde inte ta bort instans', 'error');
        }
    }

    async refreshDependentViews() {
        try {
            if (window.treeViewInstance?.refresh) {
                await window.treeViewInstance.refresh();
            }
        } catch (error) {
            console.error('Failed to refresh tree view after instance change:', error);
        }

        try {
            if (window.currentObjectDetailComponent?.loadInstances) {
                await window.currentObjectDetailComponent.loadInstances();
            }
        } catch (error) {
            console.error('Failed to refresh object detail instances:', error);
        }
    }

    async refresh() {
        await this.loadInstances();
        this.renderWorkspaceFilters();
        if (this.layout !== 'workspace') {
            this.renderVisualization();
        }
        this.renderTable();
        if (this.layout !== 'workspace') {
            this.renderEditor();
        }
    }
}

window.InstanceManagerComponent = InstanceManagerComponent;

function ensureInstanceWorkspaceModal() {
    let modal = document.getElementById('instance-workspace-modal');
    if (modal) return modal;

    modal = document.createElement('div');
    modal.id = 'instance-workspace-modal';
    modal.className = 'instance-workspace-modal';
    modal.innerHTML = `
        <div class="instance-workspace-backdrop" data-action="close-instance-workspace"></div>
        <div class="instance-workspace-dialog" role="dialog" aria-modal="true" aria-labelledby="instance-workspace-title">
            <div class="instance-workspace-header">
                <h3 id="instance-workspace-title">Instanspanel</h3>
                <button type="button" class="close-btn" data-action="close-instance-workspace" aria-label="Stäng">&times;</button>
            </div>
            <div id="instance-workspace-body" class="instance-workspace-body"></div>
        </div>
    `;

    modal.addEventListener('click', (event) => {
        const actionNode = event.target.closest('[data-action="close-instance-workspace"]');
        if (!actionNode) return;
        closeInstanceWorkspace();
    });

    document.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape') return;
        if (!modal.classList.contains('visible')) return;
        closeInstanceWorkspace();
    });

    document.body.appendChild(modal);
    return modal;
}

async function openInstanceWorkspace(objectId, objectData = null) {
    try {
        const safeObjectId = Number(objectId || 0);
        if (!safeObjectId) return;

        const modal = ensureInstanceWorkspaceModal();
        const body = modal.querySelector('#instance-workspace-body');
        const title = modal.querySelector('#instance-workspace-title');
        if (!body || !title) return;

        let currentObject = objectData;
        if (!currentObject || Number(currentObject.id || 0) !== safeObjectId) {
            currentObject = await ObjectsAPI.getById(safeObjectId);
        }

        const displayName = getInstanceManagerObjectDisplayName(currentObject);
        const idFull = currentObject?.id_full || safeObjectId;
        title.textContent = `Instanspanel • ${idFull} • ${displayName}`;

        body.innerHTML = `<div id="instance-workspace-manager-${safeObjectId}"></div>`;

        modal.classList.add('visible');
        document.body.classList.add('instance-workspace-open');

        await new Promise((resolve) => {
            window.requestAnimationFrame(() => {
                window.requestAnimationFrame(resolve);
            });
        });

        const manager = new InstanceManagerComponent(`instance-workspace-manager-${safeObjectId}`, safeObjectId, {
            objectData: currentObject,
            layout: 'workspace',
            onClose: closeInstanceWorkspace
        });

        window.currentInstanceWorkspaceManager = manager;
        await manager.render();
    } catch (error) {
        console.error('Failed to open instance workspace:', error);
        showToast(error?.message || 'Kunde inte öppna instanspanelen', 'error');
    }
}

function closeInstanceWorkspace() {
    const modal = document.getElementById('instance-workspace-modal');
    if (!modal) return;
    modal.classList.remove('visible');
    document.body.classList.remove('instance-workspace-open');
}

window.openInstanceWorkspace = openInstanceWorkspace;
window.closeInstanceWorkspace = closeInstanceWorkspace;
