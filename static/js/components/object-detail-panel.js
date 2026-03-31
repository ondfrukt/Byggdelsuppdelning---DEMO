/**
 * ObjectDetailPanel Component
 * Unified component for displaying object details in both tree view and object list contexts
 * Replaces both side-panel and detail-panel implementations
 */

// Module-level cache for managed list IDs confirmed missing (404), so we don't
// spam the console with the same 404 on every detail-view open.
const _missingManagedListIds = new Set();

class ObjectDetailPanel {
    constructor(containerId, options = {}) {
        this.container = document.getElementById(containerId);
        this.objectId = null;
        this.objectData = null;
        this.activeTab = 'details';
        this.richTextValues = {};
        this.managedListDisplayByListId = new Map();
        this.editMode = false;
        
        // Configuration options
        this.options = {
            layout: options.layout || 'side', // 'side' for tree view, 'detail' for object list
            onClose: options.onClose || null,
            showHeader: options.showHeader !== false, // Show header by default
            ...options
        };

        // Store reference once so inline onclick handlers in category tab can reach this instance
        window._detailPanel = this;
    }
    
    async loadObject(objectId, prefetchedData = null) {
        try {
            this.objectId = objectId;
            if (prefetchedData) {
                this.objectData = prefetchedData;
            } else {
                const response = await fetch(`/api/objects/${objectId}`);
                if (!response.ok) {
                    throw new Error('Failed to load object');
                }
                this.objectData = await response.json();
            }
            await Promise.all([
                this.preloadManagedListDisplayMaps(),
                this.preloadCategoryNodeNames(),
            ]);
        } catch (error) {
            console.error('Error loading object:', error);
            throw error;
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
        const fields = Array.isArray(this.objectData?.object_type?.fields)
            ? this.objectData.object_type.fields
            : [];
        const managedListIds = fields
            .filter(field => String(field?.field_type || '').toLowerCase() === 'select')
            .map(field => this.normalizeFieldOptions(field?.field_options))
            .filter(options => options?.source === 'managed_list')
            .map(options => Number(options?.list_id))
            .filter(listId => Number.isFinite(listId) && listId > 0);

        const uniqueListIds = Array.from(new Set(managedListIds)).filter(id => !_missingManagedListIds.has(id));
        await Promise.all(uniqueListIds.map(async (listId) => {
            try {
                const response = await fetch(`/api/managed-lists/${listId}?include_items=true&include_inactive_items=true`);
                if (!response.ok) {
                    if (response.status === 404) _missingManagedListIds.add(listId);
                    return;
                }
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
                    if (valueKey) {
                        byValue.set(valueKey, label);
                    }
                });
                this.managedListDisplayByListId.set(listId, { byId, byValue });
            } catch (_error) {
                // Ignore lookup failures and keep raw value fallback.
            }
        }));
    }

    async preloadCategoryNodeNames() {
        this.categoryNodeNameById = new Map();
        const fields = Array.isArray(this.objectData?.object_type?.fields)
            ? this.objectData.object_type.fields : [];
        const data = this.objectData?.data || {};
        const nodeIds = [...new Set(
            fields
                .filter(f => String(f?.field_type || '').toLowerCase() === 'category_node')
                .map(f => parseInt(data[f.field_name], 10))
                .filter(id => Number.isFinite(id) && id > 0)
        )];
        if (!nodeIds.length) return;

        try {
            const r = await fetch(`/api/category-nodes/batch?ids=${nodeIds.join(',')}`);
            if (!r.ok) return;
            const map = await r.json();
            Object.entries(map).forEach(([id, node]) => {
                const display = node?.path_string || node?.name;
                if (display) this.categoryNodeNameById.set(Number(id), display);
            });
        } catch (_) { /* keep raw id as fallback */ }
    }

    resolveManagedListDisplayValue(value, field) {
        const options = this.normalizeFieldOptions(field?.field_options);
        if (!options || options.source !== 'managed_list') return value;
        const listId = Number(options.list_id);
        if (!Number.isFinite(listId) || listId <= 0) return value;
        const listMap = this.managedListDisplayByListId.get(listId);
        if (!listMap) return value;
        const resolveHierarchyPath = (itemId) => {
            const safeId = Number(itemId || 0);
            if (!Number.isFinite(safeId) || safeId <= 0) return '';
            const chain = [];
            const visited = new Set();
            let currentId = safeId;
            while (currentId && listMap.byId.has(currentId) && !visited.has(currentId)) {
                visited.add(currentId);
                const node = listMap.byId.get(currentId);
                chain.push(String(node?.label || '').trim());
                currentId = Number(node?.parentItemId || 0);
            }
            const labels = chain.filter(Boolean).reverse();
            return labels.length > 1 ? labels.join(' > ') : '';
        };

        const resolveSingle = (rawValue) => {
            if (rawValue === null || rawValue === undefined || rawValue === '') return rawValue;
            const asNumber = Number(rawValue);
            if (Number.isFinite(asNumber) && listMap.byId.has(asNumber)) {
                const hierarchyPath = resolveHierarchyPath(asNumber);
                if (hierarchyPath) return hierarchyPath;
                return listMap.byId.get(asNumber)?.label || rawValue;
            }
            const asText = String(rawValue).trim();
            if (asText && listMap.byValue.has(asText)) {
                return listMap.byValue.get(asText);
            }
            return rawValue;
        };

        const isMultiSelect = String(options.selection_mode || 'single').toLowerCase() === 'multi';
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
        return resolveSingle(value);
    }

    formatDetailValueMarkup(value, fieldType) {
        if (Array.isArray(value)) {
            const items = value
                .map(item => String(item ?? '').trim())
                .filter(Boolean);
            if (!items.length) return '<div class="detail-value">-</div>';
            return `
                <div class="detail-value detail-value-list">
                    ${items.map(item => `<div class="detail-value-line">${escapeHtml(item)}</div>`).join('')}
                </div>
            `;
        }

        return `<div class="detail-value">${formatFieldValue(value, fieldType)}</div>`;
    }
    
    async render(objectId, prefetchedData = null) {
        if (!this.container) return;

        const previousObjectId = this.objectId;
        const isObjectChange = Boolean(objectId && String(objectId) !== String(previousObjectId));

        if (objectId) {
            await this.loadObject(objectId, prefetchedData);
        }
        
        if (!this.objectData) {
            this.container.innerHTML = '<p class="empty-state">Välj ett objekt att visa</p>';
            return;
        }

        const obj = this.objectData;
        const displayName = obj.data?.Namn || obj.data?.namn || obj.id_full;
        
        // Determine CSS class based on layout
        const panelClass = this.options.layout === 'detail' ? 'detail-panel-content-inner' : 'side-panel';
        
        this.container.innerHTML = `
            <div class="${panelClass}">
                ${this.renderHeader(obj, displayName)}
                ${this.renderTabs()}
                ${this.renderContent()}
            </div>
        `;
        
        // Attach event listeners after rendering
        this.attachEventListeners();

        if (isObjectChange) {
            // Reset globally cached component references when the viewed object changes.
            window.currentFileUpload = null;
        }


        if (this.activeTab === 'relations') {
            await this.loadRelationsIfNeeded();
        } else if (this.activeTab === 'instances') {
            await this.loadInstancesIfNeeded();
        } else if (this.activeTab === 'files') {
            await this.loadFilesIfNeeded();
        }
    }

    attachEventListeners() {
        if (!this.container) return;
        
        // Add tab click listeners
        const tabButtons = this.container.querySelectorAll('.tab-btn');
        tabButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const tab = btn.dataset.tab;
                this.switchTab(tab);
            });
        });
        
        // Add close button listener for side panel
        const closeBtn = this.container.querySelector('.close-panel-btn');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                this.close();
            });
        }

        // Edit mode toggle
        this.container.querySelector('[data-action="toggle-edit-mode"]')?.addEventListener('click', () => {
            this.editMode = !this.editMode;
            this.render();
        });

        // Instance field handlers
        this._attachInstanceFieldListeners();

        // Rich text open handlers (detail panel layout only)
        const richTextButtons = this.container.querySelectorAll('[data-open-richtext-key]');
        richTextButtons.forEach(node => {
            node.addEventListener('click', (event) => {
                event.preventDefault();
                this.openRichTextViewer(node.dataset.openRichtextKey);
            });
            node.addEventListener('keydown', (event) => {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                this.openRichTextViewer(node.dataset.openRichtextKey);
            });
        });
    }
    
    renderHeader(obj, displayName) {
        if (!this.options.showHeader && this.options.layout === 'detail') {
            return ''; // Header is rendered outside for detail panel
        }
        
        if (this.options.layout === 'side') {
            return `
                <div class="side-panel-header">
                    <div>
                        <h3>${displayName}</h3>
                        <p class="side-panel-subtitle">${obj.id_full} • ${obj.object_type?.name || 'Objekt'}</p>
                    </div>
                    <div style="display:flex;gap:4px;align-items:center">
                        <button class="btn btn-sm ${this.editMode ? 'btn-primary' : 'btn-secondary'}" data-action="toggle-edit-mode">
                            ${this.editMode ? 'Klar' : 'Redigera'}
                        </button>
                        <button class="btn btn-sm btn-secondary close-panel-btn">✕</button>
                    </div>
                </div>
            `;
        }
        
        return '';
    }
    
    renderTabs() {
        const tabClass = this.options.layout === 'side' ? 'side-panel-tabs' : 'tabs';
        
        return `
            <div class="${tabClass}">
                <button class="tab-btn ${this.activeTab === 'details' ? 'active' : ''}" 
                        data-tab="details">
                    Grunddata
                </button>
                <button class="tab-btn ${this.activeTab === 'instances' ? 'active' : ''}" 
                        data-tab="instances">
                    Instanser
                </button>
                <button class="tab-btn ${this.activeTab === 'relations' ? 'active' : ''}" 
                        data-tab="relations">
                    Relationer
                </button>
                <button class="tab-btn ${this.activeTab === 'files' ? 'active' : ''}"
                        data-tab="files">
                    Filer
                </button>
            </div>
        `;
    }
    
    renderContent() {
        const contentClass = this.options.layout === 'side' ? 'side-panel-content' : 'panel-content';
        
        return `
            <div class="${contentClass}">
                ${this.renderTabContent()}
            </div>
        `;
    }
    
    renderTabContent() {
        if (this.activeTab === 'details') {
            return this.renderDetails();
        } else if (this.activeTab === 'instances') {
            return this.renderInstancesTab();
        } else if (this.activeTab === 'relations') {
            return this.renderRelationsTab();
        } else if (this.activeTab === 'files') {
            return this.renderFilesTab();
        }

        return '';
    }

    renderDetails() {
        const obj = this.objectData;
        const data = obj.data || {};
        this.richTextValues = {};
        let richTextCounter = 0;
        const objectTypeFields = Array.isArray(obj.object_type?.fields)
            ? obj.object_type.fields.slice().sort((a, b) => (a.display_order || 9999) - (b.display_order || 9999))
            : [];
        const fieldMap = new Map(objectTypeFields.map(field => [String(field.field_name || ''), field]));
        const normalizedFieldMap = new Map(
            objectTypeFields.map(field => [this.normalizeFieldKey(field.field_name), field])
        );
        const normalizedDataMap = new Map(
            Object.entries(data).map(([key, value]) => [this.normalizeFieldKey(key), { key, value }])
        );
        const renderedFieldKeys = new Set();
        
        let html = `<div class="detail-list ${this.options.layout === 'detail' ? 'detail-list-grid' : ''}">`;
        
        // Add compact header row for detail panel layout
        if (this.options.layout === 'detail') {
            const typeColor = getObjectTypeColor(obj.object_type?.name);
            html += `
                <div class="detail-list-header">
                    <div class="detail-header-item">
                        <span class="detail-label">ID</span>
                        <span class="detail-value"><strong>${obj.id_full}</strong></span>
                    </div>
                    <div class="detail-header-item">
                        <span class="detail-label">Typ</span>
                        <span class="detail-value">
                            <span class="object-type-badge" data-type="${obj.object_type?.name || ''}" style="background-color: ${typeColor}">
                                ${obj.object_type?.name || 'N/A'}
                            </span>
                        </span>
                    </div>
                    <div class="detail-header-item">
                        <span class="detail-label">Skapad</span>
                        <span class="detail-value">${formatDate(obj.created_at)}</span>
                    </div>
                </div>
                <div class="detail-list-header">
                    <div class="detail-header-item">
                        <span class="detail-label">Status</span>
                        <span class="detail-value">${obj.status || 'N/A'}</span>
                    </div>
                    <div class="detail-header-item">
                        <span class="detail-label">Version</span>
                        <span class="detail-value">${obj.version || 'v1'}</span>
                    </div>
                    <div class="detail-header-item">
                        <span class="detail-label">BaseID</span>
                        <span class="detail-value">${obj.main_id || obj.id_full || 'N/A'}</span>
                    </div>
                </div>
            `;
        }
        
        if (this.options.layout === 'detail') {
            html += '<div class="detail-field-grid">';
        }

        // Render object data fields in configured order
        for (const field of objectTypeFields) {
            const fieldName = String(field.field_name || '');
            const normalizedName = this.normalizeFieldKey(fieldName);
            const entry = normalizedDataMap.get(normalizedName);
            renderedFieldKeys.add(normalizedName);
            if (field?.is_detail_visible === false) {
                continue;
            }

            const key = entry?.key || fieldName;
            const rawValue = entry?.value;
            let value = this.resolveManagedListDisplayValue(rawValue, field);
            if (String(field?.field_type || '').toLowerCase() === 'category_node') {
                const nodeId = parseInt(rawValue, 10);
                if (Number.isFinite(nodeId) && this.categoryNodeNameById?.has(nodeId)) {
                    value = this.categoryNodeNameById.get(nodeId);
                }
            }
            const label = field?.display_name || key;
            const looksLikeHtml = typeof value === 'string' && /<\s*[a-z][^>]*>/i.test(value);
            const resolvedFieldType = field?.field_type || (looksLikeHtml ? 'richtext' : undefined);
            const hasValue = !(value === null || value === undefined || value === '');
            const isRichText = this.options.layout === 'detail' && resolvedFieldType === 'richtext' && hasValue;
            const detailWidthClass = this.getDetailWidthClass(field, isRichText);
            const detailItemClass = isRichText
                ? `detail-item detail-item-richtext ${detailWidthClass}`
                : `detail-item ${detailWidthClass}`;
            const formattedValue = formatFieldValue(value, resolvedFieldType);
            const valueClass = isRichText ? 'detail-value richtext-value' : 'detail-value';
            const richTextKey = isRichText ? `richtext-${richTextCounter++}` : '';

            if (isRichText) {
                const rawHtml = sanitizeRichTextHtml(String(value || ''));
                this.richTextValues[richTextKey] = {
                    label,
                    html: rawHtml || formattedValue
                };
            }

            const richTextHtml = isRichText
                ? String(this.richTextValues[richTextKey]?.html || '').trim()
                : '';
            const valueMarkup = isRichText
                ? `
                    <div class="${valueClass}">
                        <div class="richtext-preview-text">${richTextHtml || '<p>Innehåll finns</p>'}</div>
                        <button type="button"
                                class="btn btn-secondary btn-sm richtext-open-btn"
                                data-open-richtext-key="${richTextKey}">
                            Öppna innehåll
                        </button>
                    </div>
                `
                : this.formatDetailValueMarkup(value, resolvedFieldType);
            
            html += `
                <div class="${detailItemClass}">
                    <span class="detail-label">${label}${isRichText ? '<span class="detail-richtext-hint"> (öppnas i egen ruta)</span>' : ''}</span>
                    ${valueMarkup}
                </div>
            `;
        }

        // Render any unknown data keys after configured fields.
        for (const [key, rawValue] of Object.entries(data)) {
            const normalizedKey = this.normalizeFieldKey(key);
            if (renderedFieldKeys.has(normalizedKey)) continue;
            if (rawValue === null || rawValue === undefined) continue;

            const field = fieldMap.get(String(key))
                || normalizedFieldMap.get(normalizedKey);
            if (field?.is_detail_visible === false) continue;
            const value = this.resolveManagedListDisplayValue(rawValue, field);
            const label = field?.display_name || key;
            const looksLikeHtml = typeof value === 'string' && /<\s*[a-z][^>]*>/i.test(value);
            const resolvedFieldType = field?.field_type || (looksLikeHtml ? 'richtext' : undefined);
            const isRichText = this.options.layout === 'detail' && resolvedFieldType === 'richtext';
            const detailWidthClass = this.getDetailWidthClass(field, isRichText);
            const detailItemClass = isRichText
                ? `detail-item detail-item-richtext ${detailWidthClass}`
                : `detail-item ${detailWidthClass}`;
            const formattedValue = formatFieldValue(value, resolvedFieldType);
            const valueClass = isRichText ? 'detail-value richtext-value' : 'detail-value';
            const richTextKey = isRichText ? `richtext-${richTextCounter++}` : '';

            if (isRichText) {
                const rawHtml = sanitizeRichTextHtml(String(value || ''));
                this.richTextValues[richTextKey] = {
                    label,
                    html: rawHtml || formattedValue
                };
            }

            const richTextHtml = isRichText
                ? String(this.richTextValues[richTextKey]?.html || '').trim()
                : '';
            const valueMarkup = isRichText
                ? `
                    <div class="${valueClass}">
                        <div class="richtext-preview-text">${richTextHtml || '<p>Innehåll finns</p>'}</div>
                        <button type="button"
                                class="btn btn-secondary btn-sm richtext-open-btn"
                                data-open-richtext-key="${richTextKey}">
                            Öppna innehåll
                        </button>
                    </div>
                `
                : this.formatDetailValueMarkup(value, resolvedFieldType);

            html += `
                <div class="${detailItemClass}">
                    <span class="detail-label">${label}${isRichText ? '<span class="detail-richtext-hint"> (öppnas i egen ruta)</span>' : ''}</span>
                    ${valueMarkup}
                </div>
            `;
        }

        if (this.options.layout === 'detail') {
            html += '</div>';
        }
        
        if (objectTypeFields.length === 0 && Object.keys(data).length === 0 && this.options.layout === 'side') {
            html += '<p class="empty-state">Ingen data registrerad</p>';
        }

        html += this.renderInstanceFieldsSection(obj);

        html += '</div>';
        return html;
    }

    renderInstanceFieldsSection(obj) {
        const instanceFields = Array.isArray(obj.instance_fields) ? obj.instance_fields : [];
        const data = obj.data || {};
        const oid = obj.id;
        const inEdit = this.editMode;

        let html = `<div class="instance-fields-section">
            <div class="instance-fields-header">
                <span class="instance-fields-title">Egna fält</span>
                ${inEdit ? `<button type="button" class="btn btn-sm btn-secondary" data-action="add-instance-field">+ Lägg till fält</button>` : ''}
            </div>`;

        if (instanceFields.length === 0) {
            html += `<p class="instance-fields-empty">${inEdit ? 'Inga egna fält – klicka "+ Lägg till fält" för att lägga till.' : 'Inga egna fält tillagda.'}</p>`;
        } else {
            html += `<div class="detail-field-grid">`;
            for (const field of instanceFields) {
                const rawValue = data[field.field_name];
                const displayValue = formatFieldValue(rawValue, field.field_type);
                html += `
                    <div class="detail-item detail-item-instance detail-width-half" data-field-id="${field.id}">
                        <span class="detail-label detail-label-instance">${escapeHtml(field.display_name || field.field_name)}</span>
                        <div class="instance-field-value-row">
                            <span class="detail-value instance-field-display" data-field-id="${field.id}">${displayValue || '-'}</span>
                            <input class="instance-field-input form-input-sm"
                                   type="${this._instanceFieldInputType(field.field_type)}"
                                   value="${escapeHtml(String(rawValue ?? ''))}"
                                   style="display:none"
                                   data-field-id="${field.id}"
                                   data-field-type="${field.field_type}">
                            ${inEdit ? `
                            <div class="instance-field-actions">
                                <button type="button" class="btn btn-xs btn-secondary" title="Redigera värde"
                                        data-action="edit-instance-field-value" data-field-id="${field.id}">✏</button>
                                <button type="button" class="btn btn-xs btn-danger" title="Ta bort fält"
                                        data-action="delete-instance-field" data-field-id="${field.id}">✕</button>
                            </div>` : ''}
                        </div>
                    </div>`;
            }
            html += `</div>`;
        }

        if (inEdit) {
            html += `
                <div class="add-instance-field-form" style="display:none" id="add-ifield-form-${oid}">
                    <div class="add-ifield-row">
                        <select class="form-input" id="ifield-template-${oid}">
                            <option value="">Väljer fältmall…</option>
                        </select>
                    </div>
                    <div class="add-ifield-row">
                        <input type="text" class="form-input" id="ifield-value-${oid}" placeholder="Initialt värde (valfritt)">
                    </div>
                    <div class="add-ifield-actions">
                        <button type="button" class="btn btn-sm btn-primary" data-action="save-instance-field">Spara</button>
                        <button type="button" class="btn btn-sm btn-secondary" data-action="cancel-add-instance-field">Avbryt</button>
                    </div>
                </div>`;
        }

        html += `</div>`;
        return html;
    }

    _instanceFieldInputType(fieldType) {
        if (fieldType === 'number') return 'number';
        if (fieldType === 'date') return 'date';
        return 'text';
    }

    _attachInstanceFieldListeners() {
        const oid = this.objectId;

        this.container.querySelector('[data-action="add-instance-field"]')?.addEventListener('click', async () => {
            const form = document.getElementById(`add-ifield-form-${oid}`);
            if (!form) return;
            form.style.display = '';
            await this._populateFieldTemplateSelect(oid);
        });

        this.container.querySelector('[data-action="cancel-add-instance-field"]')?.addEventListener('click', () => {
            const form = document.getElementById(`add-ifield-form-${oid}`);
            if (form) form.style.display = 'none';
        });

        this.container.querySelector('[data-action="save-instance-field"]')?.addEventListener('click', () => {
            this._saveInstanceField();
        });

        this.container.querySelectorAll('[data-action="delete-instance-field"]').forEach(btn => {
            btn.addEventListener('click', () => this._deleteInstanceField(parseInt(btn.dataset.fieldId)));
        });

        this.container.querySelectorAll('[data-action="edit-instance-field-value"]').forEach(btn => {
            btn.addEventListener('click', () => this._startEditInstanceFieldValue(btn.dataset.fieldId));
        });
    }

    async _populateFieldTemplateSelect(oid) {
        const select = document.getElementById(`ifield-template-${oid}`);
        if (!select || select.dataset.loaded) return;

        const existingFieldNames = new Set(
            (this.objectData?.instance_fields || []).map(f => f.field_name)
        );

        try {
            const res = await fetch('/api/field-templates?active_only=true');
            if (!res.ok) return;
            const templates = await res.json();
            select.innerHTML = '<option value="">Välj fältmall…</option>';
            templates.forEach(t => {
                if (existingFieldNames.has(t.field_name)) return;
                const opt = document.createElement('option');
                opt.value = JSON.stringify({ display_name: t.display_name || t.field_name, field_name: t.field_name, field_type: t.field_type });
                opt.textContent = `${t.display_name || t.field_name} (${t.field_type})`;
                select.appendChild(opt);
            });
            select.dataset.loaded = 'true';
        } catch (_) {}
    }

    async _saveInstanceField() {
        const oid = this.objectId;
        const select = document.getElementById(`ifield-template-${oid}`);
        const selected = select?.value ? JSON.parse(select.value) : null;
        if (!selected) {
            alert('Välj en fältmall');
            return;
        }
        const value = document.getElementById(`ifield-value-${oid}`)?.value || null;

        try {
            const res = await fetch(`/api/objects/${oid}/instance-fields`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...selected, value })
            });
            if (!res.ok) {
                const err = await res.json();
                alert(err.error || 'Kunde inte spara fältet');
                return;
            }
            await this.render(oid);
        } catch (_) {
            alert('Serverfel, försök igen');
        }
    }

    async _deleteInstanceField(fieldId) {
        if (!confirm('Ta bort det här fältet och dess värde?')) return;
        try {
            const res = await fetch(`/api/objects/${this.objectId}/instance-fields/${fieldId}`, { method: 'DELETE' });
            if (!res.ok) { alert('Kunde inte ta bort fältet'); return; }
            await this.render(this.objectId);
        } catch (_) {
            alert('Serverfel, försök igen');
        }
    }

    _startEditInstanceFieldValue(fieldId) {
        const display = this.container.querySelector(`.instance-field-display[data-field-id="${fieldId}"]`);
        const input = this.container.querySelector(`.instance-field-input[data-field-id="${fieldId}"]`);
        const editBtn = this.container.querySelector(`[data-action="edit-instance-field-value"][data-field-id="${fieldId}"]`);
        if (!display || !input) return;

        display.style.display = 'none';
        if (editBtn) editBtn.style.display = 'none';
        input.style.display = '';
        input.focus();

        const save = async () => {
            input.removeEventListener('blur', save);
            input.removeEventListener('keydown', onKey);
            try {
                await fetch(`/api/objects/${this.objectId}/instance-fields/${fieldId}/value`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ value: input.value })
                });
            } catch (_) {}
            await this.render(this.objectId);
        };
        const onKey = (e) => {
            if (e.key === 'Enter') save();
            if (e.key === 'Escape') this.render(this.objectId);
        };
        input.addEventListener('blur', save);
        input.addEventListener('keydown', onKey);
    }

    normalizeFieldKey(key) {
        return String(key || '').trim().toLowerCase();
    }

    getDetailWidthClass(field, isRichText = false) {
        if (isRichText) return 'detail-width-full';
        const width = String(field?.detail_width || '').toLowerCase();
        if (width === 'full') return 'detail-width-full';
        if (width === 'third') return 'detail-width-third';
        if (width === 'half') return 'detail-width-half';

        const fieldType = String(field?.field_type || '').toLowerCase();
        return (fieldType === 'richtext' || fieldType === 'textarea') ? 'detail-width-full' : 'detail-width-half';
    }
    
    renderRelationsTab() {
        const obj = this.objectData;
        const containerId = `panel-relations-container-${obj.id}`;
        
        return `<div id="${containerId}"></div>`;
    }

    renderInstancesTab() {
        const obj = this.objectData;
        const containerId = `panel-instances-container-${obj.id}`;

        return `
            <div id="${containerId}" class="instances-tab-compact">
                <div class="instances-tab-actions">
                    <p>Instanser öppnas i separat panel.</p>
                    <button type="button" class="btn btn-primary btn-sm" data-action="open-instance-workspace" data-object-id="${obj.id}">
                        Öppna instanspanel
                    </button>
                </div>
            </div>
        `;
    }

    renderFilesTab() {
        const obj = this.objectData;
        const containerId = `panel-files-container-${obj.id}`;
        
        const tabClass = this.options.layout === 'detail' ? 'documents-tab-content compact-documents' : 'documents-tab-content';
        return `<div id="${containerId}" class="${tabClass}"></div>`;
    }
    
    async loadRelationsIfNeeded() {
        if (this.activeTab !== 'relations' || !this.objectData) return;
        
        const containerId = `panel-relations-container-${this.objectData.id}`;
        const container = document.getElementById(containerId);
        
        if (!container || container.dataset.loaded) return;
        
        try {
            const relationManager = new RelationManagerComponent(containerId, this.objectData.id);
            window.currentRelationManager = relationManager;
            await relationManager.render();
            container.dataset.loaded = 'true';
        } catch (error) {
            console.error('Failed to load relations:', error);
        }
    }

    async loadInstancesIfNeeded() {
        if (this.activeTab !== 'instances' || !this.objectData) return;

        const containerId = `panel-instances-container-${this.objectData.id}`;
        const container = document.getElementById(containerId);
        if (!container || container.dataset.loaded) return;

        container.querySelector('[data-action="open-instance-workspace"]')?.addEventListener('click', async () => {
            await openInstanceWorkspace(this.objectData.id, this.objectData);
        });

        container.dataset.loaded = 'true';
    }
    
    async loadFilesIfNeeded() {
        if (this.activeTab !== 'files' || !this.objectData) return;
        
        const containerId = `panel-files-container-${this.objectData.id}`;
        const container = document.getElementById(containerId);
        
        if (!container || container.dataset.loaded) return;
        
        try {
            const fileUpload = new FileUploadComponent(containerId, this.objectData.id, {
                compactMode: this.options.layout === 'detail'
            });
            window.currentFileUpload = fileUpload;
            await fileUpload.render();
            container.dataset.loaded = 'true';
        } catch (error) {
            console.error('Failed to load files:', error);
        }
    }
    
    async switchTab(tab) {
        this.activeTab = tab;
        await this.render();
        
        // Load content for the newly selected tab
        if (tab === 'relations') {
            await this.loadRelationsIfNeeded();
        } else if (tab === 'instances') {
            await this.loadInstancesIfNeeded();
        } else if (tab === 'files') {
            await this.loadFilesIfNeeded();
        }
    }

    ensureRichTextViewer() {
        let viewer = document.getElementById('richtext-viewer');
        if (viewer) return viewer;

        viewer = document.createElement('div');
        viewer.id = 'richtext-viewer';
        viewer.className = 'richtext-viewer';
        viewer.innerHTML = `
            <div class="richtext-viewer-backdrop">
                <div class="richtext-viewer-dialog" role="dialog" aria-modal="true" aria-labelledby="richtext-viewer-title">
                    <div class="richtext-viewer-header">
                        <h3 id="richtext-viewer-title">Formaterad text</h3>
                        <button type="button" class="close-btn" data-action="close-richtext-viewer" aria-label="Stäng">&times;</button>
                    </div>
                    <div id="richtext-viewer-content" class="richtext-viewer-content"></div>
                </div>
            </div>
        `;

        viewer.addEventListener('click', (event) => {
            const backdrop = viewer.querySelector('.richtext-viewer-backdrop');
            if (event.target === backdrop || event.target.closest('[data-action="close-richtext-viewer"]')) {
                this.closeRichTextViewer();
            }
        });

        document.addEventListener('keydown', (event) => {
            const isOpen = viewer.classList.contains('active');
            if (isOpen && event.key === 'Escape') {
                this.closeRichTextViewer();
            }
        });

        document.body.appendChild(viewer);
        return viewer;
    }

    openRichTextViewer(richTextKey) {
        if (!richTextKey || !this.richTextValues[richTextKey]) return;

        const viewer = this.ensureRichTextViewer();
        const titleNode = viewer.querySelector('#richtext-viewer-title');
        const contentNode = viewer.querySelector('#richtext-viewer-content');
        const richText = this.richTextValues[richTextKey];
        if (!titleNode || !contentNode || !richText) return;

        titleNode.textContent = richText.label || 'Formaterad text';
        let html = String(richText.html || '');
        if (!/<\s*[a-z][^>]*>/i.test(html) && /&lt;\s*[a-z][^&]*&gt;/i.test(html)) {
            const decoder = document.createElement('textarea');
            decoder.innerHTML = html;
            html = sanitizeRichTextHtml(decoder.value || '');
        }
        contentNode.innerHTML = html || '-';
        viewer.classList.add('active');
    }

    closeRichTextViewer() {
        const viewer = document.getElementById('richtext-viewer');
        if (!viewer) return;
        viewer.classList.remove('active');
    }
    
    close() {
        this.closeRichTextViewer();
        if (this.options.onClose) {
            this.options.onClose();
        } else if (this.container) {
            this.container.innerHTML = '';
        }
        this.objectId = null;
        this.objectData = null;
    }
}

// Helper function for backward compatibility
function createObjectDetailPanel(containerId, options) {
    const panel = new ObjectDetailPanel(containerId, options);
    window[`objectDetailPanelInstance_${containerId}`] = panel;
    return panel;
}
