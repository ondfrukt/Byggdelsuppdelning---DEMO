/**
 * Object Detail Component
 * Displays object details with tabs for data, relations, and documents
 */

class ObjectDetailComponent {
    constructor(containerId, objectId) {
        this.container = document.getElementById(containerId);
        this.objectId = objectId;
        this.object = null;
        this.instances = [];
        this.activeTab = 'grunddata';
        this.managedListDisplayByListId = new Map();
    }
    
    async render() {
        if (!this.container) return;
        
        try {
            this.object = await ObjectsAPI.getById(this.objectId);
            await this.preloadManagedListDisplayMaps();
            
            this.container.innerHTML = `
                <div class="object-detail">
                    <div class="view-header">
                        <div>
                            <button class="btn btn-secondary" onclick="goBack()">← Tillbaka</button>
                            <h2>${this.object.id_full} - ${this.getDisplayName()}</h2>
                        </div>
                        <div>
                            <button class="btn btn-primary" onclick="editObject(${this.objectId})">
                                Redigera
                            </button>
                            <button class="btn btn-danger" onclick="deleteObject(${this.objectId})">
                                Ta bort
                            </button>
                        </div>
                    </div>
                    
                    <div class="tabs">
                        <button class="tab-btn active" data-tab="grunddata">Grunddata</button>
                        <button class="tab-btn" data-tab="instanser">Instanser</button>
                        <button class="tab-btn" data-tab="relationer">Relationer</button>
                        <button class="tab-btn" data-tab="dokument">Dokument</button>
                    </div>
                    
                    <div id="tab-grunddata" class="tab-content active">
                        ${this.renderGrunddata()}
                    </div>

                    <div id="tab-instanser" class="tab-content">
                        <div id="instances-container-${this.objectId}" class="instances-tab-compact">
                            <div class="instances-tab-actions">
                                <p>Instanser visas här och kan också öppnas i separat panel.</p>
                                <button type="button" class="btn btn-primary btn-sm" data-action="open-instance-workspace" data-object-id="${this.objectId}">
                                    Öppna instanspanel
                                </button>
                            </div>
                            <div id="instances-summary-table-${this.objectId}"></div>
                        </div>
                    </div>
                    
                    <div id="tab-relationer" class="tab-content">
                        <div id="relations-container-${this.objectId}"></div>
                    </div>
                    
                    <div id="tab-dokument" class="tab-content">
                        <div id="documents-container-${this.objectId}"></div>
                    </div>
                </div>
            `;
            
            this.attachEventListeners();
            
            // Initialize relation and document managers
            if (this.activeTab === 'instanser') {
                await this.loadInstances();
            } else if (this.activeTab === 'relationer') {
                await this.loadRelations();
            } else if (this.activeTab === 'dokument') {
                await this.loadDocuments();
            }
        } catch (error) {
            console.error('Failed to load object:', error);
            showToast('Kunde inte ladda objekt', 'error');
        }
    }

    normalizeFieldOptions(rawOptions) {
        if (!rawOptions) return null;
        if (typeof rawOptions === 'object') return rawOptions;
        if (typeof rawOptions !== 'string') return null;
        try {
            return JSON.parse(rawOptions);
        } catch (_error) {
            return null;
        }
    }

    async preloadManagedListDisplayMaps() {
        this.managedListDisplayByListId = new Map();
        const fields = Array.isArray(this.object?.object_type?.fields) ? this.object.object_type.fields : [];
        const managedListIds = fields
            .filter(field => String(field?.field_type || '').toLowerCase() === 'select')
            .map(field => this.normalizeFieldOptions(field?.field_options))
            .filter(options => options?.source === 'managed_list')
            .map(options => Number(options?.list_id))
            .filter(listId => Number.isFinite(listId) && listId > 0);
        const uniqueListIds = Array.from(new Set(managedListIds));
        await Promise.all(uniqueListIds.map(async (listId) => {
            try {
                const response = await fetch(`/api/managed-lists/${listId}?include_items=true&include_inactive_items=true`);
                if (!response.ok) return;
                const payload = await response.json();
                const items = Array.isArray(payload?.items) ? payload.items : [];
                const byId = new Map();
                const byValue = new Map();
                items.forEach(item => {
                    const itemId = Number(item?.id || 0);
                    const valueKey = String(item?.value || '').trim();
                    const label = String(item?.display_value || item?.label || item?.value || '').trim();
                    if (!label) return;
                    if (Number.isFinite(itemId) && itemId > 0) {
                        byId.set(itemId, {
                            label,
                            parentItemId: Number(item?.parent_item_id || 0) || null
                        });
                    }
                    if (valueKey) byValue.set(valueKey, label);
                });
                this.managedListDisplayByListId.set(listId, { byId, byValue });
            } catch (_error) {
                // Ignore and fall back to raw values.
            }
        }));
    }

    resolveManagedListDisplayValue(value, field) {
        const options = this.normalizeFieldOptions(field?.field_options);
        if (!options || options.source !== 'managed_list') return value;
        const listId = Number(options.list_id);
        if (!Number.isFinite(listId) || listId <= 0) return value;
        const map = this.managedListDisplayByListId.get(listId);
        if (!map) return value;
        const resolveHierarchyPath = (itemId) => {
            const safeId = Number(itemId || 0);
            if (!Number.isFinite(safeId) || safeId <= 0) return '';
            const chain = [];
            const visited = new Set();
            let currentId = safeId;
            while (currentId && map.byId.has(currentId) && !visited.has(currentId)) {
                visited.add(currentId);
                const node = map.byId.get(currentId);
                chain.push(String(node?.label || '').trim());
                currentId = Number(node?.parentItemId || 0);
            }
            const labels = chain.filter(Boolean).reverse();
            return labels.length > 1 ? labels.join(' > ') : '';
        };

        const asNumber = Number(value);
        if (Number.isFinite(asNumber) && map.byId.has(asNumber)) {
            const hierarchyPath = resolveHierarchyPath(asNumber);
            if (hierarchyPath) return hierarchyPath;
            return map.byId.get(asNumber)?.label || value;
        }
        const asText = String(value || '').trim();
        if (asText && map.byValue.has(asText)) {
            return map.byValue.get(asText);
        }
        const isMultiSelect = String(options.selection_mode || 'single').toLowerCase() === 'multi';
        const resolveSingle = (rawValue) => {
            const asNumber = Number(rawValue);
            if (Number.isFinite(asNumber) && map.byId.has(asNumber)) {
                const hierarchyPath = resolveHierarchyPath(asNumber);
                if (hierarchyPath) return hierarchyPath;
                return map.byId.get(asNumber)?.label || rawValue;
            }
            const asItemText = String(rawValue || '').trim();
            if (asItemText && map.byValue.has(asItemText)) {
                return map.byValue.get(asItemText);
            }
            return rawValue;
        };
        const resolveMultiple = (sourceValues) => sourceValues
            .map(resolveSingle)
            .map(item => String(item ?? '').trim())
            .filter(Boolean);

        if (Array.isArray(value)) {
            return isMultiSelect ? resolveMultiple(value) : value.map(resolveSingle).join(', ');
        }
        if (isMultiSelect && value && typeof value === 'object' && !Array.isArray(value)) {
            const selectedIds = Array.isArray(value.selected_ids) ? value.selected_ids : [];
            return resolveMultiple(selectedIds);
        }
        if (typeof value === 'string' && value.includes(',')) {
            const parts = value.split(',').map(part => part.trim()).filter(Boolean);
            if (parts.length > 1) {
                return isMultiSelect ? resolveMultiple(parts) : parts.map(resolveSingle).join(', ');
            }
        }
        return value;
    }

    formatDetailValue(value, fieldType = undefined) {
        if (Array.isArray(value)) {
            const items = value
                .map(item => String(item ?? '').trim())
                .filter(Boolean);
            if (!items.length) return 'N/A';
            return `
                <span class="detail-value detail-value-list">
                    ${items.map(item => `<span class="detail-value-line">${escapeHtml(item)}</span>`).join('')}
                </span>
            `;
        }

        return `<span class="detail-value">${this.formatValue(value, fieldType)}</span>`;
    }
    
    getDisplayName() {
        if (this.object.data) {
            return this.object.data.namn || this.object.data.name || 
                   this.object.data.title || this.object.object_type?.name || 'Objekt';
        }
        return this.object.object_type?.name || 'Objekt';
    }
    
    renderGrunddata() {
        const fields = [];
        
        // Basic info
        fields.push(`
            <div class="detail-item">
                <span class="detail-label">ID</span>
                <span class="detail-value">${this.object.id_full || 'N/A'}</span>
            </div>
        `);

        fields.push(`
            <div class="detail-item">
                <span class="detail-label">BaseID</span>
                <span class="detail-value">${this.object.main_id || this.object.id_full || 'N/A'}</span>
            </div>
        `);
        
        fields.push(`
            <div class="detail-item">
                <span class="detail-label">Typ</span>
                <span class="detail-value">
                    <span class="object-type-badge" style="background-color: ${getObjectTypeColor(this.object.object_type?.name)}">
                        ${this.object.object_type?.name || 'N/A'}
                    </span>
                </span>
            </div>
        `);
        
        // Metadata fields
        fields.push(`
            <div class="detail-item">
                <span class="detail-label">Status</span>
                <span class="detail-value">
                    <span class="status-badge status-${(this.object.status || 'In work').toLowerCase().replace(' ', '-')}">
                        ${this.object.status || 'In work'}
                    </span>
                </span>
            </div>
        `);
        
        fields.push(`
            <div class="detail-item">
                <span class="detail-label">Version</span>
                <span class="detail-value">${this.object.version || 'v1'}</span>
            </div>
        `);
        
        // Dynamic fields from object data
        if (this.object.data) {
            const objectTypeFields = Array.isArray(this.object.object_type?.fields) ? this.object.object_type.fields : [];
            const fieldConfigByName = new Map(
                objectTypeFields.map(field => [
                    String(field.field_name || '').trim().toLowerCase(),
                    {
                        displayName: String(field.display_name || field.field_name || '').trim(),
                        fieldType: field.field_type,
                        fieldOptions: field.field_options,
                        isDetailVisible: field.is_detail_visible !== false
                    }
                ])
            );
            Object.entries(this.object.data).forEach(([key, value]) => {
                const config = fieldConfigByName.get(String(key || '').trim().toLowerCase());
                if (config && config.isDetailVisible === false) return;
                const fieldType = config?.fieldType;
                const resolvedValue = config
                    ? this.resolveManagedListDisplayValue(value, { field_options: config.fieldOptions })
                    : value;
                const label = config?.displayName || this.formatFieldName(key);
                fields.push(`
                    <div class="detail-item">
                        <span class="detail-label">${escapeHtml(label)}</span>
                        ${this.formatDetailValue(resolvedValue, fieldType)}
                    </div>
                `);
            });
        }
        
        // Timestamps
        fields.push(`
            <div class="detail-item">
                <span class="detail-label">Skapad</span>
                <span class="detail-value">${formatDateTime(this.object.created_at)}</span>
            </div>
        `);
        
        fields.push(`
            <div class="detail-item">
                <span class="detail-label">Uppdaterad</span>
                <span class="detail-value">${formatDateTime(this.object.updated_at)}</span>
            </div>
        `);
        
        return `<div class="detail-grid">${fields.join('')}</div>`;
    }
    
    formatFieldName(name) {
        const normalized = String(name || '').trim();
        if (!normalized) return 'Okänt fält';
        return normalized.charAt(0).toUpperCase() + normalized.slice(1).replace(/_/g, ' ');
    }
    
    formatValue(value, fieldType = undefined) {
        if (value === null || value === undefined) return 'N/A';
        if (typeof value === 'boolean') return value ? 'Ja' : 'Nej';
        if (typeof value === 'object') return JSON.stringify(value);
        if (fieldType === 'textarea') return escapeHtml(String(value)).replace(/\r?\n/g, '<br>');
        return escapeHtml(String(value));
    }
    
    attachEventListeners() {
        // Tab switching
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const tab = e.target.dataset.tab;
                await this.switchTab(tab);
            });
        });
    }
    
    async switchTab(tabName) {
        this.activeTab = tabName;
        
        // Update tab buttons
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabName);
        });
        
        // Update tab contents
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });
        document.getElementById(`tab-${tabName}`).classList.add('active');
        
        // Load data for the active tab
        if (tabName === 'instanser') {
            await this.loadInstances();
        } else if (tabName === 'relationer') {
            await this.loadRelations();
        } else if (tabName === 'dokument') {
            await this.loadDocuments();
        }
    }

    async loadInstances() {
        const container = document.getElementById(`instances-container-${this.objectId}`);
        if (!container) return;

        container.querySelector('[data-action="open-instance-workspace"]')?.addEventListener('click', async () => {
            await openInstanceWorkspace(this.objectId, this.object);
        });

        this.instances = await InstancesAPI.getAll({ object_id: this.objectId });
        this.renderInstancesSummaryTable(container);
        container.dataset.loaded = 'true';
    }

    getLinkedObjectForInstance(instance) {
        const isOutgoing = Number(instance?.parent_object_id) === Number(this.objectId);
        return isOutgoing ? instance?.child_object : instance?.parent_object;
    }

    getInstanceDisplayName(obj) {
        if (!obj) return 'Okänt objekt';
        if (window.ObjectListDisplayName?.resolveObjectDisplayName) {
            return window.ObjectListDisplayName.resolveObjectDisplayName(obj);
        }
        return obj?.data?.namn || obj?.data?.name || obj?.id_full || `Objekt ${obj?.id || ''}`;
    }

    renderInstancesSummaryTable(container) {
        const tableHostId = `instances-summary-table-${this.objectId}`;
        const tableHost = document.getElementById(tableHostId);
        if (!tableHost) return;

        if (typeof SystemTable !== 'function') {
            tableHost.innerHTML = '<p class="error">SystemTable saknas</p>';
            return;
        }

        const rows = (this.instances || []).map((instance) => {
            const linkedObject = this.getLinkedObjectForInstance(instance);
            return {
                instance_id: Number(instance.id),
                direction: Number(instance.parent_object_id) === Number(this.objectId) ? 'Utgående' : 'Inkommande',
                type: linkedObject?.object_type?.name || 'N/A',
                name: this.getInstanceDisplayName(linkedObject),
                id_full: linkedObject?.id_full || 'N/A',
                instance_type: String(instance.instance_type || ''),
            };
        });

        const table = new SystemTable({
            containerId: tableHostId,
            tableId: `instances-summary-table-${this.objectId}-system-table`,
            columns: [
                { field: 'id_full', label: 'ID', className: 'col-id', width: 110 },
                { field: 'type', label: 'Typ', className: 'col-type', badge: 'type', width: 110 },
                { field: 'name', label: 'Namn', className: 'col-name', width: 220 },
                { field: 'instance_type', label: 'Instanstyp', className: 'col-name', width: 180 },
                { field: 'direction', label: 'Riktning', className: 'col-status', width: 100 },
            ],
            rows,
            emptyText: 'Inga instanser kopplade till detta objekt',
            onRowClick: () => openInstanceWorkspace(this.objectId, this.object)
        });

        table.render();
    }
    
    async loadRelations() {
        const container = document.getElementById(`relations-container-${this.objectId}`);
        if (!container) return;
        
        const relationManager = new RelationManagerComponent(
            `relations-container-${this.objectId}`,
            this.objectId
        );
        window.currentRelationManager = relationManager;
        await relationManager.render();
    }
    
    async loadDocuments() {
        const container = document.getElementById(`documents-container-${this.objectId}`);
        if (!container) return;
        
        const fileUpload = new FileUploadComponent(
            `documents-container-${this.objectId}`,
            this.objectId
        );
        window.currentFileUpload = fileUpload;
        await fileUpload.render();
    }
    
    async refresh() {
        await this.render();
    }
}
