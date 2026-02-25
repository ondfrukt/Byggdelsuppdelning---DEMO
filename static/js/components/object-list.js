/**
 * Object List Component
 * Displays a list of objects with filtering and search
 * Supports configurable columns per object type
 */

class ObjectListComponent {
    constructor(containerId, objectType = null) {
        this.containerId = containerId;
        this.container = document.getElementById(containerId);
        this.objectType = objectType;
        this.objects = [];
        this.searchTerm = '';
        this.selectedType = objectType;
        this.tableSortInstance = null;
        this.viewConfig = null;
        this.columnSearches = {}; // Store search terms per column
        this.typeDisplayFieldMap = {};
        this.selectedObjectIds = new Set();
        this.filteredObjects = [];
        this.bulkTypeFieldsCache = {};
    }
    
    async render() {
        if (!this.container) return;
        
        this.container.innerHTML = `
            <div class="object-list">
                <div class="filters">
                    <input type="text" 
                           id="object-search-${this.containerId}" 
                           placeholder="Sök..." 
                           class="search-input"
                           value="${this.searchTerm}">
                    <button class="btn btn-primary btn-sm bulk-relate-btn" id="bulk-relate-btn-${this.containerId}" disabled>
                        Koppla markerade (0)
                    </button>
                    <button class="btn btn-secondary btn-sm bulk-edit-btn" id="bulk-edit-btn-${this.containerId}" disabled>
                        Redigera markerade (0)
                    </button>
                    <button class="btn btn-secondary btn-sm" id="column-config-btn-${this.containerId}">
                        ⚙️ Kolumner
                    </button>
                </div>
                <div id="column-config-panel-${this.containerId}" class="column-config-panel" style="display: none;">
                    <div class="column-config-content">
                        <h4>Visa/Dölj Kolumner</h4>
                        <div id="column-toggles-${this.containerId}"></div>
                    </div>
                </div>
                <div class="table-container">
                    <table class="data-table">
                        <thead>
                            <tr id="table-headers-${this.containerId}"></tr>
                            <tr id="table-search-row-${this.containerId}" class="column-search-row"></tr>
                        </thead>
                        <tbody id="table-body-${this.containerId}">
                            <tr><td colspan="5" class="loading">Laddar objekt...</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
        `;
        
        this.attachEventListeners();
        await this.loadViewConfig();
        await this.loadObjects();
    }
    
    attachEventListeners() {
        const searchInput = document.getElementById(`object-search-${this.containerId}`);
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.searchTerm = e.target.value;
                this.filterObjects();
            });
        }

        // Column config button
        const columnConfigBtn = document.getElementById(`column-config-btn-${this.containerId}`);
        if (columnConfigBtn) {
            columnConfigBtn.addEventListener('click', () => {
                this.toggleColumnConfig();
            });
        }

        const bulkRelateBtn = document.getElementById(`bulk-relate-btn-${this.containerId}`);
        if (bulkRelateBtn) {
            bulkRelateBtn.addEventListener('click', () => {
                this.openBulkRelationModal();
            });
        }

        const bulkEditBtn = document.getElementById(`bulk-edit-btn-${this.containerId}`);
        if (bulkEditBtn) {
            bulkEditBtn.addEventListener('click', () => {
                this.openBulkEditModal();
            });
        }
    }
    
    async loadViewConfig() {
        try {
            await this.loadTypeDisplayFieldMap();

            // Load view configuration for the selected type
            if (this.selectedType) {
                // Get object type by name
                const types = await ObjectTypesAPI.getAll();
                const objType = types.find(t => t.name === this.selectedType);
                if (objType) {
                    const response = await fetchAPI(`/view-config/list-view/${objType.id}`);
                    this.viewConfig = response;
                }
            } else {
                await this.loadGlobalViewConfig();
            }
        } catch (error) {
            console.error('Failed to load view config:', error);
            this.viewConfig = null;
            this.typeDisplayFieldMap = {};
        }
    }

    async loadGlobalViewConfig() {
        try {
            const response = await fetchAPI('/view-config/list-view');
            const typeConfigs = Object.values(response || {});
            const fieldMap = new Map();

            typeConfigs.forEach(typeConfig => {
                (typeConfig?.available_fields || []).forEach(field => {
                    if (!field || !field.field_name) return;
                    if (!fieldMap.has(field.field_name)) {
                        fieldMap.set(field.field_name, {
                            field_name: field.field_name,
                            display_name: field.display_name || field.field_name,
                            field_type: field.field_type
                        });
                    }
                });
            });

            if (!fieldMap.has('files')) {
                fieldMap.set('files', {
                    field_name: 'files',
                    display_name: 'Filer',
                    field_type: 'text'
                });
            }

            const available_fields = Array.from(fieldMap.values())
                .sort((a, b) => a.display_name.localeCompare(b.display_name, 'sv'));
            const allFieldNames = available_fields.map(field => field.field_name);
            const preferredNameField =
                allFieldNames.find(name => String(name).toLowerCase() === 'namn') ||
                allFieldNames.find(name => String(name).toLowerCase() === 'name') ||
                null;
            const remainingFieldNames = allFieldNames.filter(fieldName =>
                fieldName !== preferredNameField && fieldName !== 'files'
            );
            const baseVisibleColumns = [
                { field_name: 'auto_id', visible: true, width: 120 },
                { field_name: 'object_type', visible: true, width: 160 }
            ];

            if (preferredNameField) {
                baseVisibleColumns.push({
                    field_name: preferredNameField,
                    visible: true,
                    width: 220
                });
            }

            baseVisibleColumns.push({
                field_name: 'files',
                visible: true,
                width: 220
            });
            baseVisibleColumns.push({ field_name: 'created_at', visible: true, width: 150 });

            this.viewConfig = {
                available_fields,
                visible_columns: baseVisibleColumns,
                column_order: [
                    'auto_id',
                    'object_type',
                    ...(preferredNameField ? [preferredNameField] : []),
                    'files',
                    ...remainingFieldNames,
                    'created_at'
                ],
                column_widths: {}
            };
        } catch (error) {
            console.error('Failed to load global view config:', error);
            this.viewConfig = null;
        }
    }

    async loadTypeDisplayFieldMap() {
        try {
            const response = await fetchAPI('/view-config/tree-display');
            this.typeDisplayFieldMap = Object.fromEntries(
                Object.entries(response || {}).map(([typeName, config]) => [
                    this.normalizeTypeName(typeName),
                    config?.tree_view_name_field && config.tree_view_name_field !== 'ID'
                        ? config.tree_view_name_field
                        : ''
                ])
            );
        } catch (error) {
            console.error('Failed to load type display field map:', error);
            this.typeDisplayFieldMap = {};
        }
    }
    
    async loadObjects() {
        try {
            const filters = {};
            if (this.selectedType) {
                filters.type = this.selectedType;
            }
            if (this.searchTerm) {
                filters.search = this.searchTerm;
            }
            
            this.objects = await ObjectsAPI.getAll(filters);
            const validIds = new Set(this.objects.map(obj => Number(obj.id)));
            this.selectedObjectIds = new Set(
                Array.from(this.selectedObjectIds).filter(id => validIds.has(id))
            );
            this.renderObjects();
        } catch (error) {
            console.error('Failed to load objects:', error);
            showToast('Kunde inte ladda objekt', 'error');
        }
    }
    
    filterObjects() {
        this.renderObjects();
    }
    
    renderObjects() {
        const tbody = document.getElementById(`table-body-${this.containerId}`);
        const thead = document.getElementById(`table-headers-${this.containerId}`);
        const searchRow = document.getElementById(`table-search-row-${this.containerId}`);
        
        if (!this.objects || this.objects.length === 0) {
            this.filteredObjects = [];
            tbody.innerHTML = '<tr><td colspan="10" class="loading">Inga objekt hittades</td></tr>';
            this.updateBulkRelationButton();
            return;
        }
        
        // Get visible columns from config or use defaults
        const columns = this.getVisibleColumns();
        const colCount = columns.length;
        
        // Render headers with sortable attributes and column classes
        thead.innerHTML = columns.map(col => {
            const colClass = this.getColumnClass(col);
            const width = this.getColumnWidth(col, colClass);
            const widthStyle = width ? `style="width: ${width}px; min-width: ${width}px;"` : '';
            return `<th data-sortable data-sort-type="${this.getSortType(col)}" data-field="${col.field_name}" ${widthStyle} class="resizable-column ${colClass}">
                ${col.display_name}
            </th>`;
        }).join('');
        thead.insertAdjacentHTML('afterbegin', `
            <th class="col-select">
                <input type="checkbox" id="select-all-${this.containerId}" aria-label="Markera alla rader i listan">
            </th>
        `);
        
        // Render search row with column classes
        searchRow.innerHTML = columns.map(col => {
            const colClass = this.getColumnClass(col);
            const width = this.getColumnWidth(col, colClass);
            const widthStyle = width ? `style="width: ${width}px; min-width: ${width}px;"` : '';
            if (col.field_name === 'actions') {
                return `<th ${widthStyle} class="${colClass}"></th>`;
            }
            if (col.field_name === 'files_indicator') {
                const checked = this.columnSearches.files_indicator === '1' ? 'checked' : '';
                return `<th ${widthStyle} class="${colClass}" title="Visa endast objekt med filer">
                    <input type="checkbox" class="column-paperclip-filter" data-field="files_indicator" ${checked}>
                </th>`;
            }
            return `<th ${widthStyle} class="${colClass}">
                <input type="text" 
                       class="column-search-input" 
                       placeholder="Sök..."
                       data-field="${col.field_name}"
                       value="${this.columnSearches[col.field_name] || ''}">
            </th>`;
        }).join('');
        searchRow.insertAdjacentHTML('afterbegin', '<th class="col-select"></th>');
        
        // Attach column search listeners
        searchRow.querySelectorAll('.column-search-input').forEach(input => {
            input.addEventListener('input', (e) => {
                const field = e.target.getAttribute('data-field');
                this.columnSearches[field] = e.target.value;
                this.renderFilteredObjects();
            });
        });
        searchRow.querySelectorAll('.column-paperclip-filter').forEach(input => {
            input.addEventListener('change', (e) => {
                const field = e.target.getAttribute('data-field');
                this.columnSearches[field] = e.target.checked ? '1' : '';
                this.renderFilteredObjects();
            });
        });

        const selectAllCheckbox = document.getElementById(`select-all-${this.containerId}`);
        if (selectAllCheckbox) {
            selectAllCheckbox.addEventListener('click', (event) => event.stopPropagation());
            selectAllCheckbox.addEventListener('change', (event) => {
                this.toggleSelectAllFiltered(event.target.checked);
            });
        }
        
        this.renderFilteredObjects();
        
        // Render column config panel
        this.renderColumnConfig();
    }
    
    renderFilteredObjects() {
        const tbody = document.getElementById(`table-body-${this.containerId}`);
        const columns = this.getVisibleColumns();
        
        // Filter objects by global search term
        let filteredObjects = this.objects;
        if (this.searchTerm) {
            const term = this.searchTerm.toLowerCase();
            filteredObjects = this.objects.filter(obj => {
                return obj.auto_id.toLowerCase().includes(term) ||
                       (obj.data && Object.values(obj.data).some(val => 
                           String(val).toLowerCase().includes(term)
                       ));
            });
        }
        
        // Filter by column searches
        for (const [field, searchTerm] of Object.entries(this.columnSearches)) {
            if (searchTerm) {
                if (field === 'files_indicator') {
                    filteredObjects = filteredObjects.filter(obj => this.getObjectFileCount(obj) > 0);
                } else {
                    const term = searchTerm.toLowerCase();
                    filteredObjects = filteredObjects.filter(obj => {
                        const value = this.getColumnValue(obj, field);
                        return String(value).toLowerCase().includes(term);
                    });
                }
            }
        }
        this.filteredObjects = filteredObjects;
        
        // Render rows with data-value attributes for sorting and column classes
        const selectedObjectId = String(window.currentSelectedObjectId ?? '');
        tbody.innerHTML = filteredObjects.map(obj => `
            <tr
                data-object-id="${obj.id}"
                class="${String(obj.id) === selectedObjectId ? 'selected-object-row' : ''}"
                aria-selected="${String(obj.id) === selectedObjectId ? 'true' : 'false'}"
                onclick="viewObjectDetail(${obj.id})"
                style="cursor: pointer;"
            >
                <td class="col-select" onclick="event.stopPropagation()">
                    <input
                        type="checkbox"
                        class="row-select-checkbox"
                        data-object-id="${obj.id}"
                        ${this.selectedObjectIds.has(Number(obj.id)) ? 'checked' : ''}
                        aria-label="Markera objekt ${escapeHtml(obj.auto_id || String(obj.id))}">
                </td>
                ${columns.map(col => {
                    const value = this.getColumnValue(obj, col.field_name);
                    const displayValue = this.formatColumnValue(obj, col.field_name, value);
                    const colClass = this.getColumnClass(col);
                    return `<td data-value="${value}" class="${colClass}">${displayValue}</td>`;
                }).join('')}
            </tr>
        `).join('');

        tbody.querySelectorAll('.row-select-checkbox').forEach(checkbox => {
            checkbox.addEventListener('click', (event) => event.stopPropagation());
            checkbox.addEventListener('change', (event) => {
                const objectId = Number(event.target.dataset.objectId);
                if (!Number.isFinite(objectId)) return;
                if (event.target.checked) {
                    this.selectedObjectIds.add(objectId);
                } else {
                    this.selectedObjectIds.delete(objectId);
                }
                this.updateBulkRelationButton();
                this.updateSelectAllState();
            });
        });
        
        // Initialize table sorting after rendering
        const table = tbody.closest('table');
        if (table && !table.id) {
            table.id = `object-table-${this.containerId}`;
            table.classList.add('sortable-table');
        }
        
        // Clean up previous TableSort instance
        if (this.tableSortInstance) {
            this.tableSortInstance = null;
        }
        
        // Initialize new TableSort instance
        if (typeof TableSort !== 'undefined' && table.id) {
            this.tableSortInstance = new TableSort(table.id);
        }

        if (typeof window.applySelectedRowHighlight === 'function') {
            window.applySelectedRowHighlight();
        }
        this.updateBulkRelationButton();
        this.updateSelectAllState();
    }
    
    getVisibleColumns() {
        const lockedColumns = [
            { field_name: 'auto_id', display_name: 'ID' },
            { field_name: 'object_type', display_name: 'Typ' }
        ];

        if (!this.viewConfig) {
            // Default columns when no config
            return [
                ...lockedColumns,
                { field_name: 'namn', display_name: 'Namn' },
                { field_name: 'created_at', display_name: 'Skapad' },
                { field_name: 'files_indicator', display_name: '📎' },
                { field_name: 'actions', display_name: 'Åtgärder' }
            ];
        }
        
        const visible_columns = this.viewConfig.visible_columns || [];
        const available_fields = this.viewConfig.available_fields || [];
        const column_order = this.viewConfig.column_order || [];
        
        // Build columns based on configuration
        const columns = [...lockedColumns];
        const lockedFieldNames = new Set(lockedColumns.map(col => col.field_name));
        
        // Add columns in specified order
        for (const fieldName of column_order) {
            if (lockedFieldNames.has(fieldName)) continue;
            const colConfig = visible_columns.find(c => c.field_name === fieldName);
            if (!colConfig || !colConfig.visible) continue;
            
            if (fieldName === 'created_at') {
                columns.push({ field_name: 'created_at', display_name: 'Skapad' });
            } else {
                const field = available_fields.find(f => f.field_name === fieldName);
                if (field) {
                    columns.push({
                        field_name: field.field_name,
                        display_name: field.display_name,
                        field_type: field.field_type
                    });
                }
            }
        }

        // Place paperclip column immediately before files column when present.
        const filesColumnIndex = columns.findIndex(col => String(col.field_name).toLowerCase() === 'files');
        if (filesColumnIndex >= 0) {
            columns.splice(filesColumnIndex, 0, { field_name: 'files_indicator', display_name: '📎' });
        } else {
            // Fallback: keep indicator near the end if files column is not visible.
            columns.push({ field_name: 'files_indicator', display_name: '📎' });
        }

        // Keep actions column last.
        columns.push({ field_name: 'actions', display_name: 'Åtgärder' });
        
        return columns;
    }
    
    /**
     * Bestäm CSS-klass för kolumn baserat på fältnamn eller typ
     */
    getColumnClass(column) {
        const fieldName = column.field_name || '';
        const fieldType = column.field_type || '';
        
        // Mappning från fältnamn till CSS-klass
        const classMap = {
            'auto_id': 'col-id',
            'created_at': 'col-date',
            'updated_at': 'col-date',
            'status': 'col-status',
            'version': 'col-status',
            'actions': 'col-actions',
            'files_indicator': 'col-paperclip',
            'object_type': 'col-type',
            'display_name': 'col-name',
            'filer': 'col-name',
            'files': 'col-name',
            'dokument': 'col-name',
            'documents': 'col-name',
            'namn': 'col-name',
            'name': 'col-name',
            'beskrivning': 'col-description',
            'description': 'col-description',
            'beskrivning av objektet': 'col-description'
        };
        
        // Kolla först specifikt fältnamn (case-insensitive)
        const lowerFieldName = fieldName.toLowerCase();
        if (classMap[lowerFieldName]) {
            return classMap[lowerFieldName];
        }

        // Treat all id-like fields as compact ID columns
        if (lowerFieldName.includes('id')) {
            return 'col-id';
        }
        
        // Annars baserat på fälttyp
        if (fieldType === 'textarea') return 'col-description';
        if (fieldType === 'richtext') return 'col-description';
        if (fieldType === 'date') return 'col-date';
        if (fieldType === 'boolean') return 'col-status';
        if (fieldType === 'number') return 'col-number';
        
        // Default: anpassa till innehåll
        return 'col-default';
    }
    
    getColumnWidth(column, colClass = null) {
        if (!this.viewConfig || !this.viewConfig.column_widths) return null;

        // Keep standard columns CSS-driven for easier maintenance in style.css
        const cssControlledClasses = new Set([
            'col-id',
            'col-type',
            'col-date',
            'col-status',
            'col-actions',
            'col-number',
            'col-name',
            'col-description'
        ]);
        const resolvedClass = colClass || this.getColumnClass(column);
        if (cssControlledClasses.has(resolvedClass)) return null;

        return this.viewConfig.column_widths[column.field_name] || null;
    }
    
    getSortType(col) {
        if (col.field_name === 'created_at') return 'date';
        if (col.field_name === 'files_indicator') return 'number';
        if (col.field_type === 'number') return 'number';
        return 'text';
    }
    
    getColumnValue(obj, fieldName) {
        if (fieldName === 'auto_id') return obj.auto_id;
        if (fieldName === 'object_type') return obj.object_type?.name || '';
        if (fieldName === 'files') return Array.isArray(obj.files) ? obj.files : [];
        if (fieldName === 'created_at') return obj.created_at;
        if (fieldName === 'actions') return '';
        if (fieldName === 'files_indicator') {
            const count = this.getObjectFileCount(obj);
            return count > 0 ? count : 0;
        }
        
        // Get from object data
        return obj.data?.[fieldName] || '';
    }
    
    formatColumnValue(obj, fieldName, value) {
        if (fieldName === 'auto_id') return `<strong>${value}</strong>`;
        if (fieldName === 'object_type') {
            return `<span class="object-type-badge" style="background-color: ${getObjectTypeColor(value)}">
                ${value || 'N/A'}
            </span>`;
        }
        if (fieldName === 'created_at') return formatDate(value);
        if (fieldName === 'files_indicator') {
            const count = this.getObjectFileCount(obj);
            if (count > 0) {
                return `<span title="${count} fil(er) kopplade" aria-label="${count} filer kopplade">📎</span>`;
            }
            return '';
        }
        if (fieldName === 'actions') {
            return `
                <div onclick="event.stopPropagation()" style="display: flex; gap: 4px; justify-content: center;">
                    <button class="icon-btn edit" onclick="editObject(${obj.id})" title="Redigera" aria-label="Redigera objekt ${obj.auto_id}">
                        ✏️
                    </button>
                    <button class="icon-btn delete" onclick="deleteObject(${obj.id})" title="Ta bort" aria-label="Ta bort objekt ${obj.auto_id}">
                        🗑️
                    </button>
                </div>
            `;
        }

        if (this.isLikelyFileField(fieldName)) {
            const fileLinks = this.renderFileLinks(value);
            if (fileLinks) {
                return fileLinks;
            }
        }

        if (Array.isArray(value)) {
            return escapeHtml(value.join(', '));
        }

        if (value && typeof value === 'object') {
            return escapeHtml(JSON.stringify(value));
        }

        if (typeof value === 'string' && /<[^>]+>/.test(value)) {
            return escapeHtml(stripHtmlTags(value));
        }

        return escapeHtml(value || '');
    }

    isLikelyFileField(fieldName) {
        const normalized = String(fieldName || '').toLowerCase();
        return (
            normalized.includes('fil') ||
            normalized.includes('file') ||
            normalized.includes('dokument') ||
            normalized.includes('document') ||
            normalized.includes('pdf')
        );
    }

    renderFileLinks(rawValue) {
        const entries = this.extractFileEntries(rawValue);
        if (!entries.length) return '';

        return entries.map((entry) => {
            const isPdf = this.isPdfEntry(entry);
            const displayName = escapeHtml(entry.label || 'Dokument');
            const safeUrl = escapeHtml(entry.url);
            const previewClass = isPdf ? ' js-pdf-preview-link' : '';
            const previewAttr = isPdf ? ` data-preview-url="${safeUrl}"` : '';
            const docIdAttr = entry.documentId ? ` data-document-id="${entry.documentId}"` : '';
            return `<a href="${safeUrl}" class="object-file-link${previewClass}"${previewAttr}${docIdAttr} target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()">${displayName}</a>`;
        }).join('<br>');
    }

    extractFileEntries(rawValue) {
        const values = this.normalizeValueToArray(rawValue);
        const entries = [];
        const seenUrls = new Set();

        values.forEach((value) => {
            if (typeof value === 'number') {
                const baseUrl = `/api/objects/documents/${value}/download`;
                const url = typeof normalizePdfOpenUrl === 'function'
                    ? normalizePdfOpenUrl(baseUrl, true)
                    : `${baseUrl}?inline=1`;
                if (!seenUrls.has(url)) {
                    seenUrls.add(url);
                    entries.push({ url, label: `Dokument ${value}`, mimeType: 'application/pdf', filename: '', documentId: value });
                }
                return;
            }

            if (typeof value === 'string') {
                const trimmed = value.trim();
                if (!trimmed) return;

                if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('/')) {
                    const isPdf = isPdfUrl(trimmed);
                    const url = typeof normalizePdfOpenUrl === 'function'
                        ? normalizePdfOpenUrl(trimmed, isPdf)
                        : trimmed;
                    if (!seenUrls.has(url)) {
                        seenUrls.add(url);
                        const matchedDocId = this.extractDocumentIdFromUrl(url);
                        entries.push({ url, label: trimmed, filename: trimmed, mimeType: isPdf ? 'application/pdf' : '', documentId: matchedDocId });
                    }
                }
                return;
            }

            if (!value || typeof value !== 'object') return;

            if (Array.isArray(value.documents)) {
                this.extractFileEntries(value.documents).forEach((entry) => {
                    if (!seenUrls.has(entry.url)) {
                        seenUrls.add(entry.url);
                        entries.push(entry);
                    }
                });
                return;
            }

            if (Array.isArray(value.files)) {
                this.extractFileEntries(value.files).forEach((entry) => {
                    if (!seenUrls.has(entry.url)) {
                        seenUrls.add(entry.url);
                        entries.push(entry);
                    }
                });
                return;
            }

            const docId = value.id || value.document_id || value.documentId;
            const rawUrl = value.url || value.href || value.file_url || value.download_url || value.downloadUrl;
            const label = value.description || value.title || value.original_filename || value.filename || value.name || 'Dokument';
            const mimeType = value.mime_type || value.mimeType || '';
            const filename = value.original_filename || value.filename || value.name || '';

            let url = '';
            if (rawUrl) {
                const isPdf = this.isPdfEntry({ mimeType, filename, url: rawUrl });
                url = typeof normalizePdfOpenUrl === 'function'
                    ? normalizePdfOpenUrl(rawUrl, isPdf)
                    : rawUrl;
            } else if (docId) {
                const baseUrl = `/api/objects/documents/${docId}/download`;
                const isPdf = this.isPdfEntry({ mimeType, filename, url: baseUrl });
                url = typeof normalizePdfOpenUrl === 'function'
                    ? normalizePdfOpenUrl(baseUrl, isPdf)
                    : baseUrl;
            }

            if (url && !seenUrls.has(url)) {
                seenUrls.add(url);
                entries.push({ url, label, mimeType, filename, documentId: docId || this.extractDocumentIdFromUrl(url) });
            }
        });

        return entries;
    }

    normalizeValueToArray(rawValue) {
        if (rawValue === null || rawValue === undefined || rawValue === '') {
            return [];
        }

        if (Array.isArray(rawValue)) {
            return rawValue;
        }

        if (typeof rawValue === 'string') {
            const trimmed = rawValue.trim();
            if (!trimmed) return [];

            if ((trimmed.startsWith('[') && trimmed.endsWith(']')) || (trimmed.startsWith('{') && trimmed.endsWith('}'))) {
                try {
                    const parsed = JSON.parse(trimmed);
                    return Array.isArray(parsed) ? parsed : [parsed];
                } catch (_error) {
                    return [rawValue];
                }
            }

            return [rawValue];
        }

        return [rawValue];
    }

    isPdfEntry(entry) {
        const mimeType = String(entry?.mimeType || '').toLowerCase();
        const filename = String(entry?.filename || '').toLowerCase();
        const url = String(entry?.url || '').toLowerCase();

        return (
            mimeType === 'application/pdf' ||
            filename.endsWith('.pdf') ||
            isPdfUrl(url)
        );
    }

    extractDocumentIdFromUrl(url) {
        const match = String(url || '').match(/\/documents\/(\d+)\/download/i);
        return match ? parseInt(match[1], 10) : null;
    }

    getObjectFileCount(obj) {
        const explicitCount = Number(obj?.file_count);
        if (Number.isFinite(explicitCount) && explicitCount > 0) {
            return explicitCount;
        }
        if (Array.isArray(obj?.files)) {
            return obj.files.length;
        }
        if (obj?.has_files === true) {
            return 1;
        }
        return 0;
    }
    
    getObjectDisplayName(obj) {
        if (window.ObjectListDisplayName?.resolveObjectDisplayName) {
            return window.ObjectListDisplayName.resolveObjectDisplayName(obj, this.typeDisplayFieldMap);
        }

        return obj?.data?.name || obj?.data?.title || obj?.data?.label || obj?.auto_id || '';
    }

    normalizeTypeName(typeName) {
        if (window.ObjectListDisplayName?.normalizeTypeName) {
            return window.ObjectListDisplayName.normalizeTypeName(typeName);
        }

        return (typeName || '').toString().trim().toLowerCase();
    }
    
    toggleColumnConfig() {
        const panel = document.getElementById(`column-config-panel-${this.containerId}`);
        if (panel) {
            panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
        }
    }
    
    renderColumnConfig() {
        if (!this.viewConfig) return;
        
        const container = document.getElementById(`column-toggles-${this.containerId}`);
        if (!container) return;
        
        const visible_columns = this.viewConfig.visible_columns || [];
        const available_fields = this.viewConfig.available_fields || [];
        
        // Build list of all possible columns
        const allColumns = [
            { field_name: 'auto_id', display_name: 'ID' },
            { field_name: 'object_type', display_name: 'Typ' },
            ...available_fields.map(f => ({ field_name: f.field_name, display_name: f.display_name })),
            { field_name: 'created_at', display_name: 'Skapad' }
        ];
        const lockedFieldNames = new Set(['auto_id', 'object_type']);
        
        container.innerHTML = allColumns.map(col => {
            const colConfig = visible_columns.find(c => c.field_name === col.field_name);
            const isLocked = lockedFieldNames.has(col.field_name);
            const isVisible = isLocked ? true : (colConfig ? colConfig.visible : false);
            
            return `
                <label class="column-toggle">
                    <input type="checkbox" 
                           data-field="${col.field_name}" 
                           ${isVisible ? 'checked' : ''}
                           ${isLocked ? 'disabled' : ''}>
                    ${col.display_name}
                </label>
            `;
        }).join('');
        
        // Attach listeners
        container.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                this.toggleColumnVisibility(e.target.getAttribute('data-field'), e.target.checked);
            });
        });
    }
    
    toggleColumnVisibility(fieldName, visible) {
        if (!this.viewConfig) return;
        if (fieldName === 'auto_id' || fieldName === 'object_type') return;
        
        const visible_columns = this.viewConfig.visible_columns || [];
        const column_order = this.viewConfig.column_order || [];
        const colIndex = visible_columns.findIndex(c => c.field_name === fieldName);
        
        if (colIndex >= 0) {
            visible_columns[colIndex].visible = visible;
        } else {
            visible_columns.push({ field_name: fieldName, visible: visible, width: 150 });
        }

        if (!column_order.includes(fieldName)) {
            column_order.push(fieldName);
        }
        
        this.viewConfig.visible_columns = visible_columns;
        this.viewConfig.column_order = column_order;
        this.renderObjects();
    }
    
    async refresh() {
        await this.loadObjects();
    }

    normalizeFieldKey(fieldName) {
        return String(fieldName || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    }

    getDataValueCaseInsensitive(data, fieldName) {
        if (!data || typeof data !== 'object') return null;
        if (Object.prototype.hasOwnProperty.call(data, fieldName)) {
            return data[fieldName];
        }
        const normalized = this.normalizeFieldKey(fieldName);
        for (const [key, value] of Object.entries(data)) {
            if (this.normalizeFieldKey(key) === normalized) {
                return value;
            }
        }
        return null;
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

    parseFieldOptions(rawOptions) {
        if (!rawOptions) return [];
        if (Array.isArray(rawOptions)) return rawOptions;
        if (typeof rawOptions === 'object') {
            if (Array.isArray(rawOptions.values)) return rawOptions.values;
            return [];
        }
        if (typeof rawOptions !== 'string') return [];
        try {
            const parsed = JSON.parse(rawOptions);
            if (Array.isArray(parsed)) return parsed;
            if (parsed && Array.isArray(parsed.values)) return parsed.values;
        } catch (_error) {
            return rawOptions.split(',').map(item => item.trim()).filter(Boolean);
        }
        return [];
    }

    valuesEqual(a, b) {
        if (a === b) return true;
        return JSON.stringify(a) === JSON.stringify(b);
    }

    async resolveSelectOptions(field) {
        const normalized = this.normalizeFieldOptions(field.field_options);
        if (normalized?.source === 'building_part_categories') {
            try {
                const categories = await BuildingPartCategoriesAPI.getAll();
                return categories.map(category => category.name).filter(Boolean);
            } catch (_error) {
                return [];
            }
        }
        if (normalized?.source === 'managed_list') {
            const listId = Number(normalized.list_id);
            if (!Number.isFinite(listId) || listId <= 0) return [];
            try {
                const managedList = await ManagedListsAPI.getById(listId, true, false);
                return (managedList?.items || []).map(item => item.value).filter(Boolean);
            } catch (_error) {
                return [];
            }
        }
        return this.parseFieldOptions(field.field_options);
    }

    async getObjectTypeFields(obj) {
        if (Array.isArray(obj?.object_type?.fields) && obj.object_type.fields.length > 0) {
            return obj.object_type.fields;
        }

        const typeId = Number(obj?.object_type?.id || obj?.object_type_id);
        if (!Number.isFinite(typeId) || typeId <= 0) return [];

        if (this.bulkTypeFieldsCache[typeId]) {
            return this.bulkTypeFieldsCache[typeId];
        }

        try {
            const type = await ObjectTypesAPI.getById(typeId);
            const fields = Array.isArray(type?.fields) ? type.fields : [];
            this.bulkTypeFieldsCache[typeId] = fields;
            return fields;
        } catch (error) {
            console.error(`Failed to load object type ${typeId} for bulk edit:`, error);
            this.bulkTypeFieldsCache[typeId] = [];
            return [];
        }
    }

    async buildBulkEditableFields(selectedObjects) {
        if (!selectedObjects.length) return [];

        const fieldsByObject = await Promise.all(
            selectedObjects.map(obj => this.getObjectTypeFields(obj))
        );
        const fieldMaps = fieldsByObject.map(fields =>
            new Map((fields || []).map(field => [this.normalizeFieldKey(field.field_name), field]))
        );

        if (!fieldMaps.length || !fieldMaps[0].size) return [];

        let commonKeys = Array.from(fieldMaps[0].keys());
        for (let index = 1; index < fieldMaps.length; index += 1) {
            const keys = new Set(fieldMaps[index].keys());
            commonKeys = commonKeys.filter(key => keys.has(key));
        }

        const result = [];
        for (const key of commonKeys) {
            const defs = fieldMaps.map(map => map.get(key)).filter(Boolean);
            if (!defs.length) continue;

            const type = defs[0].field_type;
            if (defs.some(def => def.field_type !== type)) continue;

            const rawValues = selectedObjects.map((obj, objIndex) => {
                const def = defs[objIndex] || defs[0];
                return this.getDataValueCaseInsensitive(obj.data, def.field_name);
            });

            const allEqual = rawValues.every(value => this.valuesEqual(value, rawValues[0]));
            const fieldMeta = defs[0];
            const selectOptions = type === 'select' ? await this.resolveSelectOptions(fieldMeta) : [];

            result.push({
                key,
                fieldName: fieldMeta.field_name,
                displayName: fieldMeta.display_name || fieldMeta.field_name,
                fieldType: type,
                options: selectOptions,
                value: allEqual ? rawValues[0] : null,
                varies: !allEqual
            });
        }

        return result.sort((a, b) => String(a.displayName).localeCompare(String(b.displayName), 'sv', { sensitivity: 'base' }));
    }

    renderBulkFieldInput(field) {
        const id = `bulk-field-${field.key}`;
        const variesLabel = field.varies ? '<small class="form-help">Varierar</small>' : '';
        const value = field.value;

        if (field.fieldType === 'textarea') {
            return `
                <div class="form-group">
                    <label for="${id}">${escapeHtml(field.displayName)}</label>
                    <textarea id="${id}" class="form-control bulk-edit-input" data-field-key="${field.key}" data-field-type="${field.fieldType}" rows="3" placeholder="${field.varies ? 'Varierar' : ''}">${field.varies || value === null || value === undefined ? '' : escapeHtml(String(value))}</textarea>
                    ${variesLabel}
                </div>
            `;
        }

        if (field.fieldType === 'boolean') {
            const selectedValue = field.varies ? '' : (value ? 'true' : 'false');
            return `
                <div class="form-group">
                    <label for="${id}">${escapeHtml(field.displayName)}</label>
                    <select id="${id}" class="form-control bulk-edit-input" data-field-key="${field.key}" data-field-type="${field.fieldType}">
                        <option value="">Varierar / Oförändrat</option>
                        <option value="true" ${selectedValue === 'true' ? 'selected' : ''}>Ja</option>
                        <option value="false" ${selectedValue === 'false' ? 'selected' : ''}>Nej</option>
                    </select>
                </div>
            `;
        }

        if (field.fieldType === 'select') {
            const options = Array.isArray(field.options) ? field.options : [];
            const currentValue = field.varies ? '' : (value ?? '');
            return `
                <div class="form-group">
                    <label for="${id}">${escapeHtml(field.displayName)}</label>
                    <select id="${id}" class="form-control bulk-edit-input" data-field-key="${field.key}" data-field-type="${field.fieldType}">
                        <option value="">${field.varies ? 'Varierar / Oförändrat' : 'Oförändrat'}</option>
                        ${options.map(option => `<option value="${escapeHtml(String(option))}" ${String(currentValue) === String(option) ? 'selected' : ''}>${escapeHtml(String(option))}</option>`).join('')}
                    </select>
                </div>
            `;
        }

        const typeMap = {
            number: 'number',
            decimal: 'number',
            date: 'date',
            datetime: 'datetime-local'
        };
        const inputType = typeMap[field.fieldType] || 'text';
        const inputValue = (!field.varies && value !== null && value !== undefined) ? String(value) : '';
        const stepAttr = (field.fieldType === 'decimal' || field.fieldType === 'number') ? ' step="any"' : '';

        return `
            <div class="form-group">
                <label for="${id}">${escapeHtml(field.displayName)}</label>
                <input type="${inputType}" id="${id}" class="form-control bulk-edit-input" data-field-key="${field.key}" data-field-type="${field.fieldType}" value="${escapeHtml(inputValue)}" placeholder="${field.varies ? 'Varierar' : ''}"${stepAttr}>
                ${variesLabel}
            </div>
        `;
    }

    async openBulkEditModal() {
        const selectedIds = Array.from(this.selectedObjectIds);
        if (!selectedIds.length) {
            showToast('Markera minst ett objekt först', 'error');
            return;
        }

        const modal = document.getElementById('bulk-edit-modal');
        const overlay = document.getElementById('modal-overlay');
        const form = document.getElementById('bulk-edit-form');
        const summary = document.getElementById('bulk-edit-summary');
        const fieldsContainer = document.getElementById('bulk-edit-fields-container');
        if (!modal || !overlay || !form || !summary || !fieldsContainer) {
            console.error('Bulk edit modal is missing required DOM elements', {
                modal: Boolean(modal),
                overlay: Boolean(overlay),
                form: Boolean(form),
                summary: Boolean(summary),
                fieldsContainer: Boolean(fieldsContainer)
            });
            showToast('Kunde inte öppna massredigering (dialog saknas i sidan)', 'error');
            return;
        }

        try {
            const selectedObjects = [];
            const failedIds = [];
            const settled = await Promise.allSettled(selectedIds.map(id => ObjectsAPI.getById(id)));
            settled.forEach((result, index) => {
                if (result.status === 'fulfilled' && result.value) {
                    selectedObjects.push(result.value);
                    return;
                }
                failedIds.push(selectedIds[index]);
            });

            if (!selectedObjects.length) {
                showToast('Kunde inte ladda markerade objekt', 'error');
                return;
            }

            const editableFields = await this.buildBulkEditableFields(selectedObjects);
            if (!editableFields.length) {
                showToast('Inga gemensamma redigerbara fält hittades för markerade objekt', 'error');
                return;
            }

            const suffix = failedIds.length ? ` ${failedIds.length} objekt kunde inte läsas in.` : '';
            summary.textContent = `${selectedObjects.length} objekt markerade. Fält med olika värden visas som "Varierar".`;
            if (suffix) {
                summary.textContent += suffix;
            }
            fieldsContainer.innerHTML = editableFields.map(field => this.renderBulkFieldInput(field)).join('');
            const firstInput = fieldsContainer.querySelector('.bulk-edit-input');
            if (firstInput) {
                setTimeout(() => firstInput.focus(), 0);
            }

            form.onsubmit = async (event) => {
                event.preventDefault();
                await this.saveBulkEditChanges(selectedObjects, editableFields);
            };

            if (typeof openModal === 'function') {
                openModal('bulk-edit-modal');
            } else {
                modal.style.display = 'block';
                overlay.style.display = 'block';
            }
        } catch (error) {
            console.error('Failed to open bulk edit modal:', error);
            showToast(error.message || 'Kunde inte öppna massredigering', 'error');
        }
    }

    collectBulkEditChanges(editableFields) {
        const form = document.getElementById('bulk-edit-form');
        if (!form) return [];

        const changes = [];
        form.querySelectorAll('.bulk-edit-input').forEach(input => {
            const key = input.dataset.fieldKey;
            const fieldType = input.dataset.fieldType;
            const field = editableFields.find(item => item.key === key);
            if (!field) return;

            let parsedValue = null;
            const rawValue = input.value;

            if (fieldType === 'boolean') {
                if (rawValue === '') return;
                parsedValue = rawValue === 'true';
            } else if (fieldType === 'number' || fieldType === 'decimal') {
                if (rawValue === '') return;
                const num = Number(rawValue);
                if (!Number.isFinite(num)) return;
                parsedValue = num;
            } else {
                if (rawValue === '') return;
                parsedValue = rawValue;
            }

            if (!field.varies && this.valuesEqual(parsedValue, field.value)) return;

            changes.push({ key, value: parsedValue });
        });
        return changes;
    }

    async saveBulkEditChanges(selectedObjects, editableFields) {
        const submitBtn = document.querySelector('#bulk-edit-form button[type="submit"]');
        const changes = this.collectBulkEditChanges(editableFields);
        if (!changes.length) {
            showToast('Inga ändringar att spara', 'error');
            return;
        }

        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Sparar...';
        }

        try {
            let updatedCount = 0;
            const errors = [];

            for (const obj of selectedObjects) {
                try {
                    const currentData = {};
                    const fields = await this.getObjectTypeFields(obj);
                    fields.forEach(field => {
                        currentData[field.field_name] = this.getDataValueCaseInsensitive(obj.data, field.field_name);
                    });

                    changes.forEach(change => {
                        const targetField = fields.find(field => this.normalizeFieldKey(field.field_name) === change.key);
                        if (!targetField) return;
                        currentData[targetField.field_name] = change.value;
                    });

                    await ObjectsAPI.update(obj.id, {
                        status: obj.status,
                        data: currentData
                    });
                    updatedCount += 1;
                } catch (error) {
                    console.error(`Failed to update object ${obj.id}:`, error);
                    errors.push(obj.auto_id || String(obj.id));
                }
            }

            if (!errors.length) {
                showToast(`Uppdaterade ${updatedCount} objekt`, 'success');
            } else {
                showToast(`Uppdaterade ${updatedCount} objekt, ${errors.length} misslyckades`, 'error');
            }

            closeModal();
            await this.refresh();
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Spara';
            }
        }
    }

    toggleSelectAllFiltered(checked) {
        (this.filteredObjects || []).forEach(obj => {
            const objectId = Number(obj.id);
            if (!Number.isFinite(objectId)) return;
            if (checked) {
                this.selectedObjectIds.add(objectId);
            } else {
                this.selectedObjectIds.delete(objectId);
            }
        });

        this.renderFilteredObjects();
    }

    updateSelectAllState() {
        const selectAllCheckbox = document.getElementById(`select-all-${this.containerId}`);
        if (!selectAllCheckbox) return;

        const visibleIds = (this.filteredObjects || [])
            .map(obj => Number(obj.id))
            .filter(id => Number.isFinite(id));

        if (!visibleIds.length) {
            selectAllCheckbox.checked = false;
            selectAllCheckbox.indeterminate = false;
            return;
        }

        const selectedVisibleCount = visibleIds.filter(id => this.selectedObjectIds.has(id)).length;
        selectAllCheckbox.checked = selectedVisibleCount > 0 && selectedVisibleCount === visibleIds.length;
        selectAllCheckbox.indeterminate = selectedVisibleCount > 0 && selectedVisibleCount < visibleIds.length;
    }

    updateBulkRelationButton() {
        const bulkRelateBtn = document.getElementById(`bulk-relate-btn-${this.containerId}`);
        const bulkEditBtn = document.getElementById(`bulk-edit-btn-${this.containerId}`);

        const selectedCount = this.selectedObjectIds.size;
        if (bulkRelateBtn) {
            bulkRelateBtn.disabled = selectedCount === 0;
            bulkRelateBtn.textContent = `Koppla markerade (${selectedCount})`;
        }
        if (bulkEditBtn) {
            bulkEditBtn.disabled = selectedCount === 0;
            bulkEditBtn.textContent = `Redigera markerade (${selectedCount})`;
        }
    }

    openBulkRelationModal() {
        const selectedIds = Array.from(this.selectedObjectIds);
        if (!selectedIds.length) {
            showToast('Markera minst ett objekt först', 'error');
            return;
        }
        if (typeof showAddRelationModal !== 'function') {
            showToast('Relationsdialogen kunde inte öppnas', 'error');
            return;
        }

        showAddRelationModal(selectedIds);
    }
}
