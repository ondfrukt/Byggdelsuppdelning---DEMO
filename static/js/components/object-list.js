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
        this.selectionAnchorObjectId = null;
        this.filteredObjects = [];
        this.bulkTypeFieldsCache = {};
        this.bulkTypeFieldsPromiseCache = {};
        this.resizeConfigSaveTimer = null;
        this.draggedColumnField = null;
        this.boundGlobalPointerHandler = null;
        this.boundGlobalKeyHandler = null;
        this.managedListDisplayByListId = new Map();
        this.bulkManagedMultiImportTableByField = {};
        this.bulkManagedMultiImportRowsByField = {};
        this.tableSortState = {
            sortColumn: null,
            sortDirection: 'asc',
            sortField: null
        };
        this.currentPage = 1;
        this.perPage = 50;
        this.totalObjects = 0;
        this.totalPages = 0;
        this._searchDebounceTimer = null;
        this._columnSearchDebounceTimer = null;
        this.textCollator = new Intl.Collator('sv', {
            sensitivity: 'base',
            numeric: true,
            ignorePunctuation: true
        });
    }

    normalizeTypeName(typeName) {
        return String(typeName || '').toLowerCase().replace(/\s+/g, '').trim();
    }

    isFileObjectType(typeName) {
        const normalized = this.normalizeTypeName(typeName);
        return ['filobjekt', 'fileobject', 'ritningsobjekt', 'dokumentobjekt', 'documentobject'].includes(normalized);
    }

    getBulkStatusOptions() {
        return [
            { value: 'In work', label: 'In work' },
            { value: 'Released', label: 'Released' },
            { value: 'Obsolete', label: 'Obsolete' },
            { value: 'Canceled', label: 'Canceled' }
        ];
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
                    <button class="btn-icon bulk-selection-action bulk-relate-btn" id="bulk-relate-btn-${this.containerId}" type="button" disabled style="display: none;" title="Koppla markerade objekt" aria-label="Koppla markerade objekt">
                        🔗
                    </button>
                    <button class="btn-icon bulk-edit-btn bulk-selection-action" id="bulk-edit-btn-${this.containerId}" type="button" title="Redigera markerade objekt" aria-label="Redigera markerade objekt" style="display: none;">
                        ✏️
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
                <div id="pagination-${this.containerId}" class="pagination-controls"></div>
            </div>
        `;
        
        this.attachEventListeners();
        await Promise.all([this.loadViewConfig(), this._fetchObjectsOnly()]);
        await this.preloadCategoryNodePaths(this.objects);
        this.renderObjects();
    }

    _activeColumnFilters() {
        const active = {};
        for (const [field, value] of Object.entries(this.columnSearches)) {
            if (value) active[field] = value;
        }
        return active;
    }

    async _fetchObjectsOnly() {
        try {
            const filters = { page: this.currentPage, per_page: this.perPage };
            if (this.selectedType) filters.type = this.selectedType;
            if (this.searchTerm) filters.search = this.searchTerm;
            const colFilters = this._activeColumnFilters();
            if (Object.keys(colFilters).length > 0) filters.column_filters = colFilters;
            if (this.tableSortState?.sortField) {
                filters.sort_field = this.tableSortState.sortField;
                filters.sort_direction = this.tableSortState.sortDirection || 'asc';
            }
            const result = await ObjectsAPI.getAllPaginated(filters);
            if (result && result.items !== undefined) {
                this.objects = result.items;
                this.totalObjects = result.total;
                this.totalPages = result.total_pages;
                this.currentPage = result.page;
            } else {
                this.objects = Array.isArray(result) ? result : [];
                this.totalObjects = this.objects.length;
                this.totalPages = 1;
            }
            if (!this.selectedType) {
                this.objects = this.objects.filter(obj => !this.isFileObjectType(obj?.object_type?.name));
            }
            const validIds = new Set(this.objects.map(obj => Number(obj.id)));
            this.selectedObjectIds = new Set(
                Array.from(this.selectedObjectIds).filter(id => validIds.has(id))
            );
        } catch (error) {
            console.error('Failed to fetch objects:', error);
            showToast('Kunde inte ladda objekt', 'error');
        }
    }
    
    attachEventListeners() {
        const searchInput = document.getElementById(`object-search-${this.containerId}`);
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.searchTerm = e.target.value;
                clearTimeout(this._searchDebounceTimer);
                this._searchDebounceTimer = setTimeout(() => this.loadObjects(), 350);
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
            bulkEditBtn.addEventListener('click', () => this.openBulkEditModal());
        }

        this.attachGlobalSelectionListeners();
    }
    
    async loadViewConfig() {
        try {
            if (this.selectedType) {
                // Need object types to look up the type id; tree-display loads independently.
                const [objectTypes] = await Promise.all([
                    ObjectTypesAPI.getAll(),
                    this.loadTypeDisplayFieldMap(),
                ]);
                const objType = objectTypes.find(t => t.name === this.selectedType);
                if (objType) {
                    const response = await fetchAPI(`/view-config/list-view/${objType.id}`);
                    this.viewConfig = response;
                }
            } else {
                // All three fetches are independent when no type filter is active.
                await Promise.all([
                    ObjectTypesAPI.getAll(),
                    this.loadTypeDisplayFieldMap(),
                    this.loadGlobalViewConfig(),
                ]);
            }
            await this.preloadManagedListDisplayMaps();
        } catch (error) {
            console.error('Failed to load view config:', error);
            this.viewConfig = null;
            this.typeDisplayFieldMap = {};
            this.managedListDisplayByListId = new Map();
        }
    }

    async preloadCategoryNodePaths(objects) {
        this.categoryNodePathById = new Map();
        const availableFields = Array.isArray(this.viewConfig?.available_fields) ? this.viewConfig.available_fields : [];
        const catNodeFields = new Set(
            availableFields
                .filter(f => String(f?.field_type || '').toLowerCase() === 'category_node')
                .map(f => f.field_name)
        );
        if (!catNodeFields.size) return;

        const nodeIds = new Set();
        (objects || []).forEach(obj => {
            catNodeFields.forEach(fn => {
                const val = parseInt(obj?.data?.[fn], 10);
                if (Number.isFinite(val) && val > 0) nodeIds.add(val);
            });
        });
        if (!nodeIds.size) return;

        try {
            const ids = [...nodeIds].join(',');
            const r = await fetch(`/api/category-nodes/batch?ids=${ids}`);
            if (!r.ok) return;
            const map = await r.json();
            Object.entries(map).forEach(([id, node]) => {
                const display = node?.path_string || node?.name;
                if (display) this.categoryNodePathById.set(Number(id), display);
            });
        } catch (_) { /* silent */ }
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
                        field_type: field.field_type,
                        field_options: field.field_options
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
                .sort((a, b) => this.textCollator.compare(String(a.display_name || ''), String(b.display_name || '')));
            const allFieldNames = available_fields.map(field => field.field_name);
            const preferredNameField =
                allFieldNames.find(name => String(name).toLowerCase() === 'namn') ||
                allFieldNames.find(name => String(name).toLowerCase() === 'name') ||
                null;
            const remainingFieldNames = allFieldNames.filter(fieldName =>
                fieldName !== preferredNameField && fieldName !== 'files'
            );
            const baseVisibleColumns = [
                { field_name: 'id_full', visible: true, width: 120 },
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

            // Merge saved visibility onto base defaults so user preferences survive
            const savedVisibility = this.loadGlobalColumnVisibility();
            let visible_columns;
            if (savedVisibility) {
                // Start from saved, add any new fields not yet in saved list as hidden
                const savedMap = new Map(savedVisibility.map(c => [c.field_name, c]));
                visible_columns = savedVisibility.filter(c =>
                    available_fields.some(f => f.field_name === c.field_name) ||
                    ['id_full', 'object_type', 'files', 'created_at'].includes(c.field_name)
                );
                available_fields.forEach(f => {
                    if (!savedMap.has(f.field_name)) {
                        visible_columns.push({ field_name: f.field_name, visible: false, width: 150 });
                    }
                });
            } else {
                visible_columns = baseVisibleColumns;
            }

            this.viewConfig = {
                available_fields,
                visible_columns,
                column_order: this.loadGlobalColumnOrder() || [
                    'id_full',
                    'object_type',
                    ...(preferredNameField ? [preferredNameField] : []),
                    'files',
                    ...remainingFieldNames,
                    'created_at'
                ],
                column_widths: this.loadGlobalColumnWidths()
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
            this.currentPage = 1;
            const filters = { page: this.currentPage, per_page: this.perPage };
            if (this.selectedType) filters.type = this.selectedType;
            if (this.searchTerm) filters.search = this.searchTerm;
            const colFilters = this._activeColumnFilters();
            if (Object.keys(colFilters).length > 0) filters.column_filters = colFilters;
            const result = await ObjectsAPI.getAllPaginated(filters);
            if (result && result.items !== undefined) {
                this.objects = result.items;
                this.totalObjects = result.total;
                this.totalPages = result.total_pages;
                this.currentPage = result.page;
            } else {
                this.objects = Array.isArray(result) ? result : [];
                this.totalObjects = this.objects.length;
                this.totalPages = 1;
            }
            if (!this.selectedType) {
                this.objects = this.objects.filter(obj => !this.isFileObjectType(obj?.object_type?.name));
            }
            const validIds = new Set(this.objects.map(obj => Number(obj.id)));
            this.selectedObjectIds = new Set(
                Array.from(this.selectedObjectIds).filter(id => validIds.has(id))
            );
            await this.preloadCategoryNodePaths(this.objects);
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
        const table = this.container?.querySelector('.data-table');
        
        if (!this.objects || this.objects.length === 0) {
            this.filteredObjects = [];
            tbody.innerHTML = '<tr><td colspan="10" class="loading">Inga objekt hittades</td></tr>';
            this.updateBulkRelationButton();
            return;
        }
        
        // Get visible columns from config or use defaults
        const columns = this.getVisibleColumns();
        const renderableColumns = columns.map(col => {
            const colClass = this.getColumnClass(col);
            return {
                key: col.field_name,
                className: colClass,
                resizable: true
            };
        });

        if (table) {
            table.style.width = '';
            table.style.minWidth = '';
            table.style.maxWidth = '';
            table.innerHTML = `
                ${this.renderTableColgroup(renderableColumns)}
                <thead>
                    <tr id="table-headers-${this.containerId}"></tr>
                    <tr id="table-search-row-${this.containerId}" class="column-search-row"></tr>
                </thead>
                <tbody id="table-body-${this.containerId}">
                    <tr><td colspan="${renderableColumns.length}" class="loading">Laddar objekt...</td></tr>
                </tbody>
            `;
        }

        const updatedThead = document.getElementById(`table-headers-${this.containerId}`);
        const updatedSearchRow = document.getElementById(`table-search-row-${this.containerId}`);
        const updatedTbody = document.getElementById(`table-body-${this.containerId}`);
        const activeTbody = updatedTbody || tbody;
        const activeThead = updatedThead || thead;
        const activeSearchRow = updatedSearchRow || searchRow;
        
        // Render headers with sortable attributes and column classes
        activeThead.innerHTML = columns.map(col => {
            const colClass = this.getColumnClass(col);
            return `<th data-sortable data-sort-type="${this.getSortType(col)}" data-field="${col.field_name}" data-column-key="${col.field_name}" data-draggable-column="true" draggable="true" class="resizable-column draggable-column ${colClass}">
                ${col.display_name}
            </th>`;
        }).join('');
        
        // Render search row with column classes
        activeSearchRow.innerHTML = columns.map(col => {
            const colClass = this.getColumnClass(col);
            if (col.field_name === 'files_indicator') {
                const checked = this.columnSearches.files_indicator === '1' ? 'checked' : '';
                return `<th data-column-key="${col.field_name}" class="${colClass}" title="Visa endast objekt med filer">
                    <input type="checkbox" class="column-paperclip-filter" data-field="files_indicator" ${checked}>
                </th>`;
            }
            return `<th data-column-key="${col.field_name}" class="${colClass}">
                <input type="text" 
                       class="column-search-input" 
                       placeholder="Sök..."
                       data-field="${col.field_name}"
                       value="${this.columnSearches[col.field_name] || ''}">
            </th>`;
        }).join('');
        
        // Attach column search listeners
        activeSearchRow.querySelectorAll('.column-search-input').forEach(input => {
            input.addEventListener('input', (e) => {
                const field = e.target.getAttribute('data-field');
                this.columnSearches[field] = e.target.value;
                clearTimeout(this._columnSearchDebounceTimer);
                this._columnSearchDebounceTimer = setTimeout(() => this.loadObjects(), 350);
            });
        });
        activeSearchRow.querySelectorAll('.column-paperclip-filter').forEach(input => {
            input.addEventListener('change', (e) => {
                const field = e.target.getAttribute('data-field');
                this.columnSearches[field] = e.target.checked ? '1' : '';
                this.loadObjects();
            });
        });
        
        this.renderFilteredObjects();
        this.renderPagination();

        // Render column config panel
        this.renderColumnConfig();
    }

    renderPagination() {
        const container = document.getElementById(`pagination-${this.containerId}`);
        if (!container) return;
        if (this.totalPages <= 1) {
            container.innerHTML = '';
            return;
        }
        const start = (this.currentPage - 1) * this.perPage + 1;
        const end = Math.min(this.currentPage * this.perPage, this.totalObjects);
        container.innerHTML = `
            <div class="pagination">
                <button class="btn btn-secondary btn-sm" id="prev-page-${this.containerId}" ${this.currentPage <= 1 ? 'disabled' : ''}>‹ Föregående</button>
                <span class="pagination-info">Sida ${this.currentPage} av ${this.totalPages} &nbsp;(${start}–${end} av ${this.totalObjects})</span>
                <button class="btn btn-secondary btn-sm" id="next-page-${this.containerId}" ${this.currentPage >= this.totalPages ? 'disabled' : ''}>Nästa ›</button>
            </div>
        `;
        document.getElementById(`prev-page-${this.containerId}`)?.addEventListener('click', () => this.goToPage(this.currentPage - 1));
        document.getElementById(`next-page-${this.containerId}`)?.addEventListener('click', () => this.goToPage(this.currentPage + 1));
    }

    async goToPage(page) {
        if (page < 1 || page > this.totalPages) return;
        this.currentPage = page;
        try {
            const filters = { page: this.currentPage, per_page: this.perPage };
            if (this.selectedType) filters.type = this.selectedType;
            if (this.searchTerm) filters.search = this.searchTerm;
            const colFilters = this._activeColumnFilters();
            if (Object.keys(colFilters).length > 0) filters.column_filters = colFilters;
            const result = await ObjectsAPI.getAllPaginated(filters);
            if (result && result.items !== undefined) {
                this.objects = result.items;
                this.totalObjects = result.total;
                this.totalPages = result.total_pages;
                this.currentPage = result.page;
            } else {
                this.objects = Array.isArray(result) ? result : [];
            }
            if (!this.selectedType) {
                this.objects = this.objects.filter(obj => !this.isFileObjectType(obj?.object_type?.name));
            }
            const validIds = new Set(this.objects.map(obj => Number(obj.id)));
            this.selectedObjectIds = new Set(
                Array.from(this.selectedObjectIds).filter(id => validIds.has(id))
            );
            await this.preloadCategoryNodePaths(this.objects);
            this.renderObjects();
        } catch (error) {
            console.error('Failed to load page:', error);
            showToast('Kunde inte ladda sida', 'error');
        }
    }
    
    renderFilteredObjects() {
        const tbody = document.getElementById(`table-body-${this.containerId}`);
        const columns = this.getVisibleColumns();
        
        // Filter objects by global search term
        let filteredObjects = this.objects;
        if (this.searchTerm) {
            const term = this.searchTerm.toLowerCase();
            filteredObjects = this.objects.filter(obj => {
                return obj.id_full.toLowerCase().includes(term) ||
                       String(obj.id_full || '').toLowerCase().includes(term) ||
                       (obj.data && Object.entries(obj.data).some(([fieldName, rawValue]) =>
                           this.getResolvedColumnText(fieldName, rawValue).toLowerCase().includes(term)
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
                        return this.getResolvedColumnText(field, value).toLowerCase().includes(term);
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
                class="${[
                    this.selectedObjectIds.has(Number(obj.id)) ? 'multi-selected-row' : '',
                    String(obj.id) === selectedObjectId ? 'active-detail-row' : ''
                ].filter(Boolean).join(' ')}"
                aria-selected="${String(obj.id) === selectedObjectId ? 'true' : 'false'}"
                style="cursor: pointer;"
            >
                ${columns.map(col => {
                    const value = this.getColumnValue(obj, col.field_name);
                    const displayValue = this.formatColumnValue(obj, col.field_name, value, col);
                    const colClass = this.getColumnClass(col);
                    const sortValue = this.getSortableColumnValue(obj, col.field_name, value);
                    const isRichtext = col.field_type === 'richtext';
                    const plainText = isRichtext
                        ? (typeof stripHtmlTags === 'function' ? stripHtmlTags(String(value || '')) : String(value || ''))
                        : this.getResolvedColumnText(col.field_name, value, col);
                    const wrapClass = isRichtext ? 'td-cell-content td-cell-richtext' : 'td-cell-content';
                    return `<td data-value="${escapeHtml(String(sortValue))}" class="${colClass}" title="${escapeHtml(plainText)}"><div class="${wrapClass}">${displayValue}</div></td>`;
                }).join('')}
            </tr>
        `).join('');

        tbody.querySelectorAll('tr[data-object-id]').forEach(row => {
            row.addEventListener('mousedown', (event) => {
                if (event.shiftKey || event.ctrlKey || event.metaKey) {
                    event.preventDefault();
                }
            });
            row.addEventListener('click', (event) => {
                this.handleRowClick(event, row);
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
            this.tableSortInstance.onSortChange = (state) => {
                const sortField = state?.sortField || null;
                this.tableSortState = {
                    sortColumn: Number.isFinite(Number(state?.sortColumn)) ? Number(state.sortColumn) : null,
                    sortDirection: state?.sortDirection === 'desc' ? 'desc' : 'asc',
                    sortField: sortField
                };
                if (sortField && this.totalPages > 1) {
                    // Sort affects all pages — re-fetch from page 1 with server-side sort
                    this.currentPage = 1;
                    this._fetchObjectsOnly().then(() => this.renderTable());
                }
            };
            this.tableSortInstance.setState(this.tableSortState);
            this.tableSortInstance.applyCurrentSort();
        }

        this.enableColumnResizing(table);
        this.enableColumnReordering(table);

        if (typeof window.applySelectedRowHighlight === 'function') {
            window.applySelectedRowHighlight();
        }
        this.updateBulkRelationButton();
        this.updateSelectAllState();
    }

    enableColumnResizing(table) {
        if (!table || typeof makeTableColumnsResizable !== 'function') return;

        makeTableColumnsResizable({
            table,
            minWidth: 48,
            fixedLayout: true,
            headerSelector: 'thead tr:first-child th[data-column-key]',
            getColumnKey: (header) => header?.dataset?.columnKey || '',
            getInitialWidth: (field) => this.getInitialResizableWidth(field),
            onResizeEnd: (field, width) => {
                this.persistColumnWidth(field, width);
            }
        });
    }

    enableColumnReordering(table) {
        if (!table) return;

        const headers = Array.from(table.querySelectorAll('thead tr:first-child th[data-draggable-column="true"]'));
        headers.forEach((header) => {
            header.addEventListener('dragstart', (event) => {
                if (event.target?.closest?.('.column-resize-handle')) {
                    event.preventDefault();
                    return;
                }
                const field = header.dataset.field || '';
                if (!field) return;
                this.draggedColumnField = field;
                header.classList.add('column-dragging');
                if (event.dataTransfer) {
                    event.dataTransfer.effectAllowed = 'move';
                    event.dataTransfer.setData('text/plain', field);
                }
            });

            header.addEventListener('dragend', () => {
                this.draggedColumnField = null;
                table.querySelectorAll('th.column-drop-before, th.column-drop-after, th.column-dragging').forEach((node) => {
                    node.classList.remove('column-drop-before', 'column-drop-after', 'column-dragging');
                });
            });

            header.addEventListener('dragover', (event) => {
                if (!this.draggedColumnField || this.draggedColumnField === header.dataset.field) return;
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
                if (!this.draggedColumnField) return;
                event.preventDefault();
                const targetField = header.dataset.field || '';
                if (!targetField || targetField === this.draggedColumnField) return;
                const rect = header.getBoundingClientRect();
                const insertBefore = event.clientX < rect.left + (rect.width / 2);
                this.moveColumn(this.draggedColumnField, targetField, insertBefore);
            });
        });
    }

    moveColumn(sourceField, targetField, insertBefore) {
        if (!sourceField || !targetField || sourceField === targetField) return;
        if (!this.viewConfig) return;

        const currentOrder = Array.isArray(this.viewConfig.column_order) ? [...this.viewConfig.column_order] : [];
        const reorderable = currentOrder.filter(field => field !== 'files_indicator');
        const sourceIndex = reorderable.indexOf(sourceField);
        const targetIndex = reorderable.indexOf(targetField);
        if (sourceIndex < 0 || targetIndex < 0) return;

        reorderable.splice(sourceIndex, 1);
        let destinationIndex = reorderable.indexOf(targetField);
        if (destinationIndex < 0) return;
        if (!insertBefore) destinationIndex += 1;
        reorderable.splice(destinationIndex, 0, sourceField);

        this.viewConfig.column_order = reorderable;
        this.persistViewConfig();
        this.renderObjects();
    }

    renderTableColgroup(columns = []) {
        return `<colgroup data-object-list-colgroup="true">
            ${columns.map(column => {
                return `<col data-column-key="${escapeHtml(column.key)}">`;
            }).join('')}
        </colgroup>`;
    }
    
    getVisibleColumns() {
        const lockedColumns = [
            { field_name: 'id_full', display_name: 'ID' },
            { field_name: 'object_type', display_name: 'Typ' }
        ];

        if (!this.viewConfig) {
            // Default columns when no config
            return [
                ...lockedColumns,
                { field_name: 'namn', display_name: 'Namn' },
                { field_name: 'created_at', display_name: 'Skapad' },
                { field_name: 'files_indicator', display_name: '📎' }
            ];
        }
        
        const visible_columns = this.viewConfig.visible_columns || [];
        const available_fields = this.viewConfig.available_fields || [];
        const column_order = Array.isArray(this.viewConfig.column_order) ? [...this.viewConfig.column_order] : [];
        const columns = [];
        const fieldMap = new Map([
            ['id_full', { field_name: 'id_full', display_name: 'ID' }],
            ['object_type', { field_name: 'object_type', display_name: 'Typ' }],
            ['created_at', { field_name: 'created_at', display_name: 'Skapad' }],
            ...available_fields.map(field => [field.field_name, {
                field_name: field.field_name,
                display_name: field.display_name,
                field_type: field.field_type
            }])
        ]);
        const alwaysVisibleFields = new Set(lockedColumns.map(col => col.field_name));
        const appendedFields = new Set();

        ['id_full', 'object_type'].forEach((fieldName) => {
            if (!column_order.includes(fieldName)) {
                column_order.push(fieldName);
            }
        });

        for (const fieldName of column_order) {
            if (fieldName === 'files_indicator' || appendedFields.has(fieldName)) continue;
            const colConfig = visible_columns.find(c => c.field_name === fieldName);
            if (!alwaysVisibleFields.has(fieldName) && (!colConfig || !colConfig.visible)) continue;

            const column = fieldMap.get(fieldName);
            if (!column) continue;
            columns.push(column);
            appendedFields.add(fieldName);
        }

        // Place paperclip column immediately before files column when present.
        const filesColumnIndex = columns.findIndex(col => String(col.field_name).toLowerCase() === 'files');
        if (filesColumnIndex >= 0) {
            columns.splice(filesColumnIndex, 0, { field_name: 'files_indicator', display_name: '📎' });
        } else {
            // Fallback: keep indicator near the end if files column is not visible.
            columns.push({ field_name: 'files_indicator', display_name: '📎' });
        }

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
            'id_full': 'col-id',
            'created_at': 'col-date',
            'updated_at': 'col-date',
            'status': 'col-status',
            'version': 'col-status',
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
        const resolvedClass = colClass || this.getColumnClass(column);
        return this.viewConfig.column_widths[column.field_name]
            || this.viewConfig.column_widths[resolvedClass]
            || null;
    }

    getGlobalColumnWidthStorageKey() {
        return `object-list-column-widths:${this.containerId}`;
    }

    getGlobalColumnOrderStorageKey() {
        return `object-list-column-order:${this.containerId}`;
    }

    getGlobalColumnVisibilityStorageKey() {
        return `object-list-column-visibility:${this.containerId}`;
    }

    loadGlobalColumnWidths() {
        try {
            const raw = localStorage.getItem(this.getGlobalColumnWidthStorageKey());
            if (!raw) return {};
            const parsed = JSON.parse(raw);
            return parsed && typeof parsed === 'object' ? parsed : {};
        } catch (_error) {
            return {};
        }
    }

    loadGlobalColumnOrder() {
        try {
            const raw = localStorage.getItem(this.getGlobalColumnOrderStorageKey());
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : null;
        } catch (_error) {
            return null;
        }
    }

    saveGlobalColumnWidths() {
        if (!this.viewConfig?.column_widths) return;
        try {
            localStorage.setItem(
                this.getGlobalColumnWidthStorageKey(),
                JSON.stringify(this.viewConfig.column_widths)
            );
        } catch (_error) {
            // Ignore storage errors
        }
    }

    saveGlobalColumnOrder() {
        if (!Array.isArray(this.viewConfig?.column_order)) return;
        try {
            localStorage.setItem(
                this.getGlobalColumnOrderStorageKey(),
                JSON.stringify(this.viewConfig.column_order)
            );
        } catch (_error) {
            // Ignore storage errors
        }
    }

    saveGlobalColumnVisibility() {
        if (!Array.isArray(this.viewConfig?.visible_columns)) return;
        try {
            localStorage.setItem(
                this.getGlobalColumnVisibilityStorageKey(),
                JSON.stringify(this.viewConfig.visible_columns)
            );
        } catch (_error) {
            // Ignore storage errors
        }
    }

    loadGlobalColumnVisibility() {
        try {
            const raw = localStorage.getItem(this.getGlobalColumnVisibilityStorageKey());
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : null;
        } catch (_error) {
            return null;
        }
    }

    getPersistedColumnWidth(fieldName) {
        if (fieldName === '__select__') return 42;
        const width = Number(this.viewConfig?.column_widths?.[fieldName]);
        return Number.isFinite(width) && width > 0 ? width : null;
    }

    getInitialResizableWidth(fieldName) {
        if (fieldName === '__select__') return 42;
        if (fieldName === 'files_indicator') return 20;
        return null;
    }

    persistColumnWidth(fieldName, width) {
        if (!fieldName || !Number.isFinite(width)) return;
        if (fieldName === '__select__') return;
        if (!this.viewConfig) {
            this.viewConfig = { column_widths: {} };
        }
        if (!this.viewConfig.column_widths || typeof this.viewConfig.column_widths !== 'object') {
            this.viewConfig.column_widths = {};
        }

        this.viewConfig.column_widths[fieldName] = Math.round(width);
        this.persistViewConfig();
    }

    persistViewConfig() {
        if (this.selectedType && this.viewConfig?.object_type_id) {
            this.scheduleListViewConfigSave();
            return;
        }
        this.saveGlobalColumnWidths();
        this.saveGlobalColumnOrder();
        this.saveGlobalColumnVisibility();
    }

    scheduleListViewConfigSave() {
        if (this.resizeConfigSaveTimer) {
            clearTimeout(this.resizeConfigSaveTimer);
        }

        this.resizeConfigSaveTimer = setTimeout(async () => {
            this.resizeConfigSaveTimer = null;
            try {
                await fetchAPI('/view-config/list-view', {
                    method: 'PUT',
                    body: JSON.stringify({
                        [this.selectedType]: {
                            object_type_id: this.viewConfig.object_type_id,
                            column_order: this.viewConfig.column_order,
                            column_widths: this.viewConfig.column_widths,
                            visible_columns: this.viewConfig.visible_columns
                        }
                    })
                });
            } catch (error) {
                console.error('Failed to persist object list column widths:', error);
            }
        }, 250);
    }
    
    getSortType(col) {
        if (col.field_name === 'created_at') return 'date';
        if (col.field_name === 'files_indicator') return 'number';
        if (col.field_type === 'number' || col.field_type === 'decimal') return 'number';
        if (col.field_type === 'date' || col.field_type === 'datetime') return 'date';
        if (col.field_type === 'boolean') return 'number';
        return 'text';
    }

    getSortableColumnValue(_obj, fieldName, value) {
        if (fieldName === 'files_indicator') {
            return Number(value || 0);
        }
        if (fieldName === 'created_at') {
            return value || '';
        }
        const resolvedValue = this.resolveFieldDisplayValue(value, fieldName);
        if (Array.isArray(resolvedValue)) {
            return resolvedValue.map(item => this.normalizeSortableText(item)).join(' ');
        }

        if (resolvedValue && typeof resolvedValue === 'object') {
            return this.normalizeSortableText(JSON.stringify(resolvedValue));
        }

        if (typeof resolvedValue === 'boolean') {
            return resolvedValue ? 1 : 0;
        }

        return this.normalizeSortableText(resolvedValue);
    }

    normalizeSortableText(value) {
        const asString = String(value ?? '');
        let html = asString;
        if (!/<\s*[a-z][^>]*>/i.test(html) && /&lt;\s*[a-z][^&]*&gt;/i.test(html)) {
            const decoder = document.createElement('textarea');
            decoder.innerHTML = html;
            html = decoder.value || html;
        }
        const stripped = /<[^>]+>/.test(html) ? stripHtmlTags(html) : html;
        return stripped.replace(/\s+/g, ' ').trim();
    }

    escapeRegExp(value) {
        return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    getActiveSearchTerms(fieldName) {
        const terms = [];
        const globalTerm = String(this.searchTerm || '').trim();
        const columnTerm = String(this.columnSearches?.[fieldName] || '').trim();

        if (globalTerm) {
            terms.push(...globalTerm.split(/\s+/).filter(Boolean));
        }
        if (columnTerm) {
            terms.push(...columnTerm.split(/\s+/).filter(Boolean));
        }

        return [...new Set(terms)];
    }

    highlightText(value, fieldName, options = {}) {
        const text = String(value ?? '');
        const preserveLineBreaks = options.preserveLineBreaks === true;
        const escapedText = escapeHtml(text);
        const terms = this.getActiveSearchTerms(fieldName);

        if (!text || !terms.length) {
            return preserveLineBreaks ? escapedText.replace(/\r?\n/g, '<br>') : escapedText;
        }

        let highlighted = escapedText;
        terms.forEach((term) => {
            const escapedTerm = this.escapeRegExp(term);
            if (!escapedTerm) return;
            const regex = new RegExp(`(${escapedTerm})`, 'gi');
            highlighted = highlighted.replace(regex, '<mark class="search-highlight">$1</mark>');
        });

        return preserveLineBreaks ? highlighted.replace(/\r?\n/g, '<br>') : highlighted;
    }
    
    getColumnValue(obj, fieldName) {
        if (fieldName === 'id_full') return obj.id_full;
        if (fieldName === 'object_type') return obj.object_type?.name || '';
        if (fieldName === 'files') return Array.isArray(obj.files) ? obj.files : [];
        if (fieldName === 'created_at') return obj.created_at;
        if (fieldName === 'files_indicator') {
            const count = this.getObjectFileCount(obj);
            return count > 0 ? count : 0;
        }
        
        // Get from object data
        return obj.data?.[fieldName] || '';
    }

    decodeHtmlEntities(value) {
        if (value === null || value === undefined) return '';
        return String(value)
            .replace(/&quot;/g, '"')
            .replace(/&#34;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/&apos;/g, "'")
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&amp;/g, '&');
    }

    tryParseJsonString(value) {
        if (typeof value !== 'string') return null;
        const trimmed = value.trim();
        if (!trimmed) return null;

        const candidates = [trimmed];
        if (trimmed.includes('&')) {
            candidates.push(this.decodeHtmlEntities(trimmed));
        }

        for (const candidate of candidates) {
            const normalized = String(candidate || '').trim();
            if (!normalized || !/^[\[{]/.test(normalized)) continue;
            try {
                return JSON.parse(normalized);
            } catch (_error) {
                // Ignore invalid JSON and continue with the next candidate.
            }
        }

        return null;
    }

    getManagedListEntryLabel(entry) {
        if (!entry || typeof entry !== 'object') return '';
        if (Array.isArray(entry.path) && entry.path.length > 0) {
            return entry.path
                .map(part => String(part || '').trim())
                .filter(Boolean)
                .join(' > ');
        }
        return String(entry.label || '').trim();
    }

    normalizeSelectValue(value) {
        if (Array.isArray(value)) return value;
        if (!value || typeof value !== 'object') return value;

        if (Array.isArray(value.selected)) {
            return value.selected
                .map(entry => this.getManagedListEntryLabel(entry) || entry?.selected_id)
                .filter(item => item !== null && item !== undefined && item !== '');
        }

        if (Array.isArray(value.selected_ids)) {
            return value.selected_ids;
        }

        if (value.selected_id !== undefined && value.selected_id !== null) {
            return value.selected_id;
        }

        return value;
    }

    stringifyResolvedValue(value) {
        if (Array.isArray(value)) {
            return value.map(item => this.stringifyResolvedValue(item)).filter(Boolean).join(', ');
        }
        if (value && typeof value === 'object') {
            return JSON.stringify(value);
        }
        return String(value ?? '');
    }

    getFieldDefinition(fieldName) {
        const availableFields = Array.isArray(this.viewConfig?.available_fields) ? this.viewConfig.available_fields : [];
        return availableFields.find(field => field?.field_name === fieldName) || null;
    }

    async preloadManagedListDisplayMaps() {
        this.managedListDisplayByListId = new Map();

        const availableFields = Array.isArray(this.viewConfig?.available_fields) ? this.viewConfig.available_fields : [];
        const managedListIds = availableFields
            .filter(field => String(field?.field_type || '').toLowerCase() === 'select')
            .map(field => this.normalizeFieldOptions(field?.field_options))
            .filter(options => options?.source === 'managed_list')
            .map(options => Number(options?.list_id))
            .filter(listId => Number.isFinite(listId) && listId > 0);

        const uniqueListIds = Array.from(new Set(managedListIds));
        await Promise.all(uniqueListIds.map(async (listId) => {
            try {
                const payload = await ManagedListsAPI.getById(listId, true, true);
                const items = Array.isArray(payload?.items) ? payload.items : [];
                const byId = new Map();
                const byValue = new Map();

                items.forEach(item => {
                    const itemId = Number(item?.id || 0);
                    const valueKey = String(item?.value || '').trim();
                    const label = String(item?.display_value || item?.label || item?.value || '').trim();
                    if (!label) return;
                    if (Number.isFinite(itemId) && itemId > 0) {
                        byId.set(itemId, label);
                    }
                    if (valueKey) {
                        byValue.set(valueKey, label);
                    }
                });

                this.managedListDisplayByListId.set(listId, { byId, byValue });
            } catch (_error) {
                // Ignore lookup failures and fall back to raw values.
            }
        }));
    }

    resolveFieldDisplayValue(value, fieldName, column = null) {
        const field = this.getFieldDefinition(fieldName) || column || {};
        const fieldType = String(field?.field_type || '').toLowerCase();

        if (fieldType === 'tag') {
            let tags = [];
            if (Array.isArray(value)) { tags = value.map(String).filter(Boolean); }
            else if (typeof value === 'string' && value.trim()) {
                try { tags = JSON.parse(value); } catch (_) { tags = value.split(',').map(s => s.trim()).filter(Boolean); }
            }
            return tags.join(', ');
        }

        if (fieldType === 'relation_list') {
            return String(value || '').split('\n').map(s => s.trim()).filter(Boolean).join(', ');
        }

        if (fieldType === 'category_node') {
            const nodeId = parseInt(value, 10);
            if (Number.isFinite(nodeId) && this.categoryNodePathById?.has(nodeId)) {
                return this.categoryNodePathById.get(nodeId);
            }
            return value;
        }

        if (fieldType !== 'select') return value;

        const parsedJsonValue = this.tryParseJsonString(value);
        const normalizedValue = this.normalizeSelectValue(parsedJsonValue ?? value);

        const options = this.normalizeFieldOptions(field?.field_options);
        if (options?.source === 'managed_list') {
            const listId = Number(options.list_id);
            const listMap = this.managedListDisplayByListId.get(listId);
            if (!listMap) return normalizedValue;

            const resolveSingle = (rawValue) => {
                if (rawValue === null || rawValue === undefined || rawValue === '') return rawValue;
                const asNumber = Number(rawValue);
                if (Number.isFinite(asNumber) && listMap.byId.has(asNumber)) {
                    return listMap.byId.get(asNumber);
                }
                const asText = String(rawValue).trim();
                if (asText && listMap.byValue.has(asText)) {
                    return listMap.byValue.get(asText);
                }
                return rawValue;
            };

            if (Array.isArray(normalizedValue)) {
                return normalizedValue.map(resolveSingle);
            }
            if (typeof normalizedValue === 'string' && normalizedValue.includes(',')) {
                return normalizedValue.split(',').map(part => resolveSingle(part.trim()));
            }
            return resolveSingle(normalizedValue);
        }

        const configuredOptions = this.parseFieldOptions(field?.field_options)
            .map(option => String(option ?? '').trim())
            .filter(Boolean);
        if (!configuredOptions.length) return normalizedValue;

        const configuredMap = new Map(configuredOptions.map(option => [option, option]));
        const resolveConfigured = (rawValue) => {
            const key = String(rawValue ?? '').trim();
            return configuredMap.get(key) || rawValue;
        };

        if (Array.isArray(normalizedValue)) {
            return normalizedValue.map(resolveConfigured);
        }
        if (typeof normalizedValue === 'string' && normalizedValue.includes(',')) {
            return normalizedValue.split(',').map(part => resolveConfigured(part.trim()));
        }
        return resolveConfigured(normalizedValue);
    }
    
    formatColumnValue(obj, fieldName, value, column = null) {
        if (fieldName === 'id_full') return `<strong>${this.highlightText(obj.id_full || value, fieldName)}</strong>`;
        if (fieldName === 'object_type') {
            return `<span class="object-type-badge" style="background-color: ${getObjectTypeColor(value)}">
                ${this.highlightText(value || 'N/A', fieldName)}
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
        if (this.isLikelyFileField(fieldName)) {
            const fileLinks = this.renderFileLinks(value);
            if (fileLinks) {
                return fileLinks;
            }
        }

        const resolvedValue = this.resolveFieldDisplayValue(value, fieldName, column);

        if (Array.isArray(resolvedValue)) {
            return this.highlightText(resolvedValue.join(', '), fieldName);
        }

        if (resolvedValue && typeof resolvedValue === 'object') {
            return this.highlightText(JSON.stringify(resolvedValue), fieldName);
        }

        if (column?.field_type === 'richtext' && typeof resolvedValue === 'string') {
            let html = resolvedValue;
            if (!/<\s*[a-z][^>]*>/i.test(html) && /&lt;\s*[a-z][^&]*&gt;/i.test(html)) {
                const decoder = document.createElement('textarea');
                decoder.innerHTML = html;
                html = decoder.value || '';
            }
            return html;
        }

        if (typeof resolvedValue === 'string' && /<[^>]+>/.test(resolvedValue)) {
            return this.highlightText(stripHtmlTags(resolvedValue), fieldName);
        }

        if (column?.field_type === 'textarea' && typeof resolvedValue === 'string') {
            return this.highlightText(resolvedValue, fieldName, { preserveLineBreaks: true });
        }

        return this.highlightText(resolvedValue || '', fieldName);
    }

    getResolvedColumnText(fieldName, value, column = null) {
        if (fieldName === 'files') {
            const files = Array.isArray(value) ? value : [];
            return files.map(f => f.original_filename || f.filename || '').filter(Boolean).join(' ');
        }
        const resolvedValue = this.resolveFieldDisplayValue(value, fieldName, column);
        return this.stringifyResolvedValue(resolvedValue);
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
            return `<a href="${safeUrl}" class="object-file-link${previewClass}"${previewAttr}${docIdAttr} target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()">${this.highlightText(entry.label || 'Dokument', 'files')}</a>`;
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

        return obj?.data?.name || obj?.data?.title || obj?.data?.label || obj?.id_full || '';
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
        
        // Build list of all possible columns (including files which is added programmatically)
        const allColumns = [
            { field_name: 'id_full', display_name: 'ID' },
            { field_name: 'object_type', display_name: 'Typ' },
            ...available_fields.map(f => ({ field_name: f.field_name, display_name: f.display_name })),
            { field_name: 'files', display_name: 'Filer' },
            { field_name: 'created_at', display_name: 'Skapad' },
        ].filter((col, idx, arr) => arr.findIndex(c => c.field_name === col.field_name) === idx);
        const lockedFieldNames = new Set(['id_full', 'object_type']);
        
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
        if (fieldName === 'id_full' || fieldName === 'object_type') return;
        
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
        this.persistViewConfig();
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

    isManagedListField(field) {
        const options = this.normalizeFieldOptions(field?.field_options || field?.options);
        return Boolean(options) && String(options.source || '').trim().toLowerCase() === 'managed_list';
    }

    looksLikeMultiSelectValue(rawValue) {
        if (Array.isArray(rawValue)) return true;
        return Boolean(rawValue && typeof rawValue === 'object' && Array.isArray(rawValue.selected_ids));
    }

    isMultiSelectField(field) {
        if (field?.isMultiSelect === true) return true;
        if (String(field?.field_type || '').toLowerCase() !== 'select') return false;
        const options = this.normalizeFieldOptions(field?.field_options || field?.options);
        return Boolean(options) && String(options.selection_mode || 'single').trim().toLowerCase() === 'multi';
    }

    getMultiSelectComparableValue(rawValue) {
        let values = [];
        if (Array.isArray(rawValue)) {
            values = rawValue;
        } else if (rawValue && typeof rawValue === 'object') {
            values = Array.isArray(rawValue.selected_ids) ? rawValue.selected_ids : [];
        } else if (typeof rawValue === 'string') {
            values = rawValue.split(',').map(part => part.trim()).filter(Boolean);
        } else if (rawValue !== null && rawValue !== undefined && rawValue !== '') {
            values = [rawValue];
        }

        return Array.from(new Set(values
            .map(value => String(value || '').trim())
            .filter(Boolean)))
            .sort(this.textCollator.compare);
    }

    getComparableFieldValue(field, rawValue) {
        if (!field) return rawValue;
        if (this.isMultiSelectField(field)) {
            return this.getMultiSelectComparableValue(rawValue);
        }
        if (this.isManagedListField(field) && rawValue && typeof rawValue === 'object') {
            if (rawValue.selected_id !== undefined && rawValue.selected_id !== null) {
                return String(rawValue.selected_id);
            }
        }
        return rawValue;
    }

    fieldValuesEqual(field, a, b) {
        return this.valuesEqual(
            this.getComparableFieldValue(field, a),
            this.getComparableFieldValue(field, b)
        );
    }

    getComparableInputValue(field, rawValue) {
        const normalized = this.getComparableFieldValue(field, rawValue);
        if (this.isMultiSelectField(field)) {
            return Array.isArray(normalized) ? normalized : [];
        }
        return normalized;
    }

    getBulkPayloadValue(field, rawValue) {
        if (!field) return rawValue;
        if (this.isMultiSelectField(field)) {
            return this.getMultiSelectComparableValue(rawValue);
        }
        if (this.isManagedListField(field) && rawValue && typeof rawValue === 'object') {
            if (rawValue.selected_id !== undefined && rawValue.selected_id !== null) {
                return String(rawValue.selected_id);
            }
        }
        return rawValue;
    }

    getFieldIdentityMatcher(field, candidateField) {
        if (!field || !candidateField) return false;
        const sourceTemplateId = Number(field.field_template_id || 0);
        const candidateTemplateId = Number(candidateField.field_template_id || 0);
        if (sourceTemplateId > 0 && candidateTemplateId > 0) {
            return sourceTemplateId === candidateTemplateId;
        }

        const sourceOptions = this.normalizeFieldOptions(field.field_options || field.options) || {};
        const candidateOptions = this.normalizeFieldOptions(candidateField.field_options || candidateField.options) || {};
        return (
            String(candidateField.field_type || '').toLowerCase() === String(field.fieldType || field.field_type || '').toLowerCase()
            && this.normalizeFieldKey(candidateField.field_name) === this.normalizeFieldKey(field.fieldName || field.field_name)
            && Number(candidateOptions.list_id || 0) === Number(sourceOptions.list_id || 0)
        );
    }

    getObjectDisplayNameForImport(obj) {
        return obj?.data?.Namn || obj?.data?.namn || obj?.data?.Name || obj?.data?.name || obj?.id_full || `Objekt ${obj?.id || ''}`;
    }

    async loadBulkManagedMultiImportRows(field, selectedObjects = []) {
        const selectedIds = new Set((selectedObjects || []).map(obj => Number(obj?.id)).filter(id => Number.isFinite(id)));
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
                console.error('Failed to load candidate objects for bulk multi-import:', type.name, error);
                continue;
            }

            objects.forEach(obj => {
                if (selectedIds.has(Number(obj?.id))) return;
                const rawValue = obj?.data?.[candidateField.field_name];
                const comparableValues = this.getMultiSelectComparableValue(rawValue);
                if (!comparableValues.length) return;
                const labels = comparableValues.map(value => {
                    const option = (field.options || []).find(item => String(item.value) === String(value));
                    return option?.label || String(value);
                });
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

    ensureBulkManagedMultiImportModal(field) {
        const modalId = `bulk-managed-multi-import-modal-${field.key}`;
        let modal = document.getElementById(modalId);
        if (modal) return modal;

        modal = document.createElement('div');
        modal.id = modalId;
        modal.className = 'managed-multi-import-modal';
        modal.innerHTML = `
            <div class="managed-multi-import-backdrop" data-bulk-managed-multi-import-close="${escapeHtml(field.key)}"></div>
            <div class="managed-multi-import-dialog" role="dialog" aria-modal="true" aria-labelledby="${escapeHtml(modalId)}-title">
                <div class="modal-header">
                    <h3 id="${escapeHtml(modalId)}-title">Hämta värden från annat objekt</h3>
                    <button class="close-btn" type="button" data-bulk-managed-multi-import-close="${escapeHtml(field.key)}">&times;</button>
                </div>
                <div class="managed-multi-import-body">
                    <p class="managed-multi-import-help">Sök upp ett objekt med samma fält och hämta dess valda värden.</p>
                    <div id="${escapeHtml(modalId)}-table"></div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        modal.querySelectorAll('[data-bulk-managed-multi-import-close]').forEach(button => {
            button.addEventListener('click', () => this.closeBulkManagedMultiImportModal(field.key));
        });

        return modal;
    }

    closeBulkManagedMultiImportModal(fieldKey) {
        const modal = document.getElementById(`bulk-managed-multi-import-modal-${fieldKey}`);
        if (modal) {
            modal.style.display = 'none';
        }
    }

    applyBulkManagedMultiImportedValues(field, rawValue) {
        const wrapper = document.querySelector(`#bulk-edit-fields-container [data-managed-multi-field="${CSS.escape(field.key)}"]`);
        if (!wrapper) return;
        window.ManagedMultiSelect.setValues(wrapper, this.getMultiSelectComparableValue(rawValue));
        this.closeBulkManagedMultiImportModal(field.key);
        showToast('Värden hämtade från objekt', 'success');
    }

    async openBulkManagedMultiImportModal(field, selectedObjects = []) {
        const modal = this.ensureBulkManagedMultiImportModal(field);
        const containerId = `${modal.id}-table`;
        modal.style.display = 'block';

        this.bulkManagedMultiImportRowsByField[field.key] = await this.loadBulkManagedMultiImportRows(field, selectedObjects);
        const rows = this.bulkManagedMultiImportRowsByField[field.key] || [];

        this.bulkManagedMultiImportTableByField[field.key] = new SystemTable({
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
                        <button type="button" class="btn btn-primary btn-sm bulk-managed-multi-import-apply-btn" data-object-id="${row.object_id}">
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
                host.querySelectorAll('.bulk-managed-multi-import-apply-btn').forEach(button => {
                    button.addEventListener('click', () => {
                        const objectId = Number(button.getAttribute('data-object-id') || 0);
                        const row = rows.find(item => Number(item.object_id) === objectId);
                        if (!row) return;
                        this.applyBulkManagedMultiImportedValues(field, row.rawValue);
                    });
                });
            }
        });

        this.bulkManagedMultiImportTableByField[field.key].render();
    }

    async resolveSelectOptions(field) {
        const normalized = this.normalizeFieldOptions(field.field_options);
        if (normalized?.source === 'managed_list') {
            const listId = Number(normalized.list_id);
            if (!Number.isFinite(listId) || listId <= 0) return [];
            try {
                const managedList = await ManagedListsAPI.getById(listId, true, false);
                return (managedList?.items || [])
                    .map(item => ({
                        value: String(item.id || '').trim(),
                        label: String(item.display_value || item.value || '').trim()
                    }))
                    .filter(item => item.value);
            } catch (_error) {
                return [];
            }
        }
        return this.parseFieldOptions(field.field_options)
            .map(option => ({
                value: String(option ?? '').trim(),
                label: String(option ?? '').trim()
            }))
            .filter(option => option.value);
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

        if (this.bulkTypeFieldsPromiseCache[typeId]) {
            return this.bulkTypeFieldsPromiseCache[typeId];
        }

        this.bulkTypeFieldsPromiseCache[typeId] = (async () => {
            try {
                const type = await ObjectTypesAPI.getById(typeId);
                const fields = Array.isArray(type?.fields) ? type.fields : [];
                this.bulkTypeFieldsCache[typeId] = fields;
                return fields;
            } catch (error) {
                console.error(`Failed to load object type ${typeId} for bulk edit:`, error);
                this.bulkTypeFieldsCache[typeId] = [];
                return [];
            } finally {
                delete this.bulkTypeFieldsPromiseCache[typeId];
            }
        })();

        return this.bulkTypeFieldsPromiseCache[typeId];
    }

    getSelectedObjectsForBulkEdit(selectedIds = []) {
        const objectById = new Map(
            (Array.isArray(this.objects) ? this.objects : [])
                .map(obj => [Number(obj?.id), obj])
                .filter(([id]) => Number.isFinite(id))
        );

        const selectedObjects = [];
        const missingIds = [];

        selectedIds.forEach((id) => {
            const numericId = Number(id);
            if (!Number.isFinite(numericId)) return;
            const object = objectById.get(numericId);
            if (object) {
                selectedObjects.push(object);
            } else {
                missingIds.push(numericId);
            }
        });

        return { selectedObjects, missingIds };
    }

    async loadMissingObjectsForBulkEdit(missingIds = []) {
        if (!Array.isArray(missingIds) || !missingIds.length) {
            return { loadedObjects: [], failedIds: [] };
        }

        const loadedObjects = [];
        const failedIds = [];
        const settled = await Promise.allSettled(missingIds.map(id => ObjectsAPI.getById(id)));

        settled.forEach((result, index) => {
            if (result.status === 'fulfilled' && result.value) {
                loadedObjects.push(result.value);
            } else {
                failedIds.push(missingIds[index]);
            }
        });

        return { loadedObjects, failedIds };
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

        const statusValues = selectedObjects.map(obj => obj?.status || 'In work');
        const allStatusesEqual = statusValues.every(value => this.valuesEqual(value, statusValues[0]));
        result.push({
            key: '__status__',
            fieldName: 'status',
            displayName: 'Status',
            fieldType: 'select',
            options: this.getBulkStatusOptions(),
            value: allStatusesEqual ? statusValues[0] : null,
            varies: !allStatusesEqual,
            isMetadataField: true,
            displayOrder: -1000
        });

        for (const key of commonKeys) {
            const defs = fieldMaps.map(map => map.get(key)).filter(Boolean);
            if (!defs.length) continue;

            const type = defs[0].field_type;
            if (defs.some(def => def.field_type !== type)) continue;
            const fieldMeta = defs[0];

            const rawValues = selectedObjects.map((obj, objIndex) => {
                const def = defs[objIndex] || defs[0];
                return this.getDataValueCaseInsensitive(obj.data, def.field_name);
            });

            const isMultiSelect = defs.some(def => this.isMultiSelectField(def))
                || rawValues.some(value => this.looksLikeMultiSelectValue(value));
            const allEqual = rawValues.every(value => this.fieldValuesEqual(fieldMeta, value, rawValues[0]));
            const selectOptions = type === 'select' ? await this.resolveSelectOptions(fieldMeta) : [];

            result.push({
                key,
                fieldName: fieldMeta.field_name,
                displayName: fieldMeta.display_name || fieldMeta.field_name,
                fieldType: type,
                displayOrder: Number.isFinite(Number(fieldMeta.display_order)) ? Number(fieldMeta.display_order) : 9999,
                field_options: fieldMeta.field_options,
                isMultiSelect,
                options: selectOptions,
                value: allEqual ? rawValues[0] : null,
                varies: !allEqual
            });
        }

        return result.sort((a, b) => {
            const orderDiff = Number(a.displayOrder ?? 9999) - Number(b.displayOrder ?? 9999);
            if (orderDiff !== 0) return orderDiff;
            if (Boolean(a.isMetadataField) !== Boolean(b.isMetadataField)) {
                return a.isMetadataField ? -1 : 1;
            }
            return this.textCollator.compare(String(a.displayName || ''), String(b.displayName || ''));
        });
    }

    renderBulkFieldInput(field) {
        const id = `bulk-field-${field.key}`;
        const variesLabel = field.varies ? '<small class="form-help">Varierar</small>' : '';
        const value = field.value;

        if (field.fieldType === 'category_node') {
            const opts = this.normalizeFieldOptions(field.field_options) || {};
            const systemId = Number(opts.system_id || 0);
            const systemName = escapeHtml(opts.system_name || '');
            const currentId = field.varies ? '' : (field.value ? String(field.value) : '');
            const resolvedLabel = currentId && this.categoryNodePathById?.has(parseInt(currentId, 10))
                ? this.categoryNodePathById.get(parseInt(currentId, 10))
                : (field.varies ? 'Varierar' : (currentId ? currentId : 'Ingen'));
            return `
                <div class="form-group">
                    <label>${escapeHtml(field.displayName)}</label>
                    <div class="category-field-widget"
                         data-field-name="${escapeHtml(field.fieldName)}"
                         data-system-id="${systemId}"
                         data-system-name="${systemName}">
                        <input type="hidden"
                               class="bulk-edit-input"
                               data-field-key="${escapeHtml(field.key)}"
                               data-field-type="category_node"
                               value="${escapeHtml(currentId)}">
                        <div class="category-field-display form-control"
                             style="display:flex;align-items:center;justify-content:space-between;cursor:pointer;min-height:38px;">
                            <span class="category-field-label">${escapeHtml(resolvedLabel)}</span>
                            <span style="font-size:11px;color:var(--text-secondary);">▼</span>
                        </div>
                    </div>
                    ${field.varies ? '<small class="form-help">Varierar. Välj ny nod för att uppdatera alla markerade objekt.</small>' : ''}
                </div>
            `;
        }

        if (field.fieldType === 'tag') {
            const currentTags = field.varies ? [] : (Array.isArray(value) ? value : (value ? String(value).split(',').map(s => s.trim()).filter(Boolean) : []));
            return `
                <div class="form-group">
                    <label for="${id}">${escapeHtml(field.displayName)}</label>
                    <input type="text" id="${id}" class="form-control bulk-edit-input" data-field-key="${field.key}" data-field-type="tag" value="${escapeHtml(currentTags.join(', '))}" placeholder="${field.varies ? 'Varierar — ange kommaseparerade taggar' : 'Kommaseparerade taggar'}">
                    <small class="form-help">${field.varies ? 'Varierar. Ange taggar för att ersätta alla markerade objekts taggar.' : 'Gemensamma taggar. Separera med komma.'}</small>
                </div>
            `;
        }

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
            if (this.isMultiSelectField(field)) {
                const selectedValues = field.varies ? [] : this.getComparableInputValue(field, value);
                return `
                    <div class="form-group">
                        <label for="${id}">${escapeHtml(field.displayName)}</label>
                        ${window.ManagedMultiSelect.render({
                            fieldName: field.key,
                            inputId: id,
                            inputName: field.fieldName || field.key,
                            options,
                            selectedValues,
                            hiddenSelectClass: 'managed-multi-select-native bulk-edit-input bulk-edit-multiselect',
                            hiddenSelectAttributes: {
                                'data-field-key': field.key,
                                'data-field-type': field.fieldType
                            },
                            searchPlaceholder: 'Sök och klicka för att lägga till flera val...',
                            actions: [
                                { key: 'import', label: 'Hämta', className: 'btn btn-secondary btn-sm' },
                                { key: 'select-all', label: 'Alla', className: 'btn btn-secondary btn-sm' },
                                { key: 'clear', label: 'Rensa', className: 'btn btn-secondary btn-sm' }
                            ]
                        })}
                        <small class="form-help">${field.varies ? 'Varierar. Gör ett nytt val för att uppdatera alla markerade objekt.' : 'Gemensamt värde för markerade objekt.'}</small>
                    </div>
                `;
            }
            const currentValue = field.varies ? '' : (this.getComparableInputValue(field, value) ?? '');
            return `
                <div class="form-group">
                    <label for="${id}">${escapeHtml(field.displayName)}</label>
                    <select id="${id}" class="form-control bulk-edit-input" data-field-key="${field.key}" data-field-type="${field.fieldType}">
                        <option value="">${field.varies ? 'Varierar / Oförändrat' : 'Oförändrat'}</option>
                        ${options.map(option => `<option value="${escapeHtml(String(option.value))}" ${(String(currentValue) === String(option.value) || String(currentValue) === String(option.label)) ? 'selected' : ''}>${escapeHtml(String(option.label))}</option>`).join('')}
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

    async openBulkEditForIds(ids) {
        this.selectedObjectIds = new Set((ids || []).map(Number).filter(id => Number.isFinite(id)));
        await this.openBulkEditModal();
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
            const { selectedObjects: localSelectedObjects, missingIds } = this.getSelectedObjectsForBulkEdit(selectedIds);
            const { loadedObjects, failedIds } = await this.loadMissingObjectsForBulkEdit(missingIds);
            const selectedObjects = [...localSelectedObjects, ...loadedObjects];

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
            window.ManagedMultiSelect.init(fieldsContainer, {
                onAction: (action, wrapper) => {
                    if (action !== 'import') return;
                    const fieldKey = String(wrapper.getAttribute('data-managed-multi-field') || '').trim();
                    const field = editableFields.find(item => String(item.key || '') === fieldKey);
                    if (!field) return;
                    this.openBulkManagedMultiImportModal(field, selectedObjects).catch(error => {
                        console.error('Failed to open bulk managed multi import modal:', error);
                        showToast('Kunde inte hämta objekt för import', 'error');
                    });
                }
            });
            const firstInput = fieldsContainer.querySelector('.managed-multi-select-search, .bulk-edit-input:not(.managed-multi-select-native)');
            if (firstInput) {
                setTimeout(() => firstInput.focus(), 0);
            }

            // Bind category_node picker widgets in the bulk form
            fieldsContainer.querySelectorAll('.category-field-widget').forEach(widget => {
                const display = widget.querySelector('.category-field-display');
                const hidden = widget.querySelector('input[type="hidden"]');
                const labelEl = widget.querySelector('.category-field-label');
                const systemId = Number(widget.dataset.systemId || 0);
                const systemName = widget.dataset.systemName || '';
                if (display && typeof window.openCatFieldPicker === 'function') {
                    display.addEventListener('click', () => {
                        window.openCatFieldPicker(systemId, systemName, (nodeId, nodeName) => {
                            if (hidden) hidden.value = String(nodeId);
                            fetch(`/api/category-nodes/${nodeId}?include_path=true`)
                                .then(r => r.ok ? r.json() : null)
                                .then(node => { if (labelEl) labelEl.textContent = node?.path_string || nodeName; })
                                .catch(() => { if (labelEl) labelEl.textContent = nodeName; });
                        });
                    });
                }
            });

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

            if (fieldType === 'category_node') {
                if (!rawValue || !rawValue.trim()) return;
                const nodeId = parseInt(rawValue, 10);
                if (!Number.isFinite(nodeId) || nodeId <= 0) return;
                if (!field.varies && String(field.value) === rawValue) return;
                changes.push({ key, value: String(nodeId) });
                return;
            } else if (fieldType === 'boolean') {
                if (rawValue === '') return;
                parsedValue = rawValue === 'true';
            } else if (fieldType === 'select' && this.isMultiSelectField(field)) {
                const selectedValues = Array.from(input.selectedOptions || [])
                    .map(option => String(option.value || '').trim())
                    .filter(Boolean);
                if (!selectedValues.length) return;
                parsedValue = selectedValues;
            } else if (fieldType === 'tag') {
                if (rawValue === '') return;
                parsedValue = rawValue.split(',').map(s => s.trim()).filter(Boolean);
            } else if (fieldType === 'number' || fieldType === 'decimal') {
                if (rawValue === '') return;
                const num = Number(rawValue);
                if (!Number.isFinite(num)) return;
                parsedValue = num;
            } else {
                if (rawValue === '') return;
                parsedValue = rawValue;
            }

            if (!field.varies && this.fieldValuesEqual(field, parsedValue, field.value)) return;

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
                        currentData[field.field_name] = this.getBulkPayloadValue(
                            field,
                            this.getDataValueCaseInsensitive(obj.data, field.field_name)
                        );
                    });

                    changes.forEach(change => {
                        if (change.key === '__status__') return;
                        const targetField = fields.find(field => this.normalizeFieldKey(field.field_name) === change.key);
                        if (!targetField) return;
                        currentData[targetField.field_name] = change.value;
                    });

                    const statusChange = changes.find(change => change.key === '__status__');

                    await ObjectsAPI.update(obj.id, {
                        status: statusChange ? statusChange.value : obj.status,
                        data: currentData
                    });

                    updatedCount += 1;
                } catch (error) {
                    console.error(`Failed to update object ${obj.id}:`, error);
                    errors.push(obj.id_full || String(obj.id));
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

        const lastVisible = (this.filteredObjects || []).map(obj => Number(obj.id)).filter(id => Number.isFinite(id)).at(-1) || null;
        this.selectionAnchorObjectId = checked ? lastVisible : null;
        this.renderFilteredObjects();
    }

    attachGlobalSelectionListeners() {
        if (this.boundGlobalPointerHandler) {
            document.removeEventListener('mousedown', this.boundGlobalPointerHandler, true);
        }
        if (this.boundGlobalKeyHandler) {
            document.removeEventListener('keydown', this.boundGlobalKeyHandler, true);
        }

        this.boundGlobalPointerHandler = (event) => {
            if (!this.container) return;
            if (this.container.contains(event.target)) return;
            if (event.target?.closest?.('#detail-panel')) return;
            if (event.target?.closest?.('.modal')) return;
            if (event.target?.closest?.('.modal-overlay')) return;
            if (event.target?.closest?.('#tree-view-wrapper')) return;
            if (event.target?.closest?.('#tree-view-container')) return;
            this.clearRowSelection({ closeDetail: true });
        };

        this.boundGlobalKeyHandler = (event) => {
            if (event.key !== 'Escape') return;
            this.clearRowSelection({ closeDetail: true });
        };

        document.addEventListener('mousedown', this.boundGlobalPointerHandler, true);
        document.addEventListener('keydown', this.boundGlobalKeyHandler, true);
    }

    clearRowSelection(options = {}) {
        const closeDetail = options.closeDetail !== false;
        const hadSelections = this.selectedObjectIds.size > 0 || Number.isFinite(Number(window.currentSelectedObjectId));

        this.selectedObjectIds.clear();
        this.selectionAnchorObjectId = null;

        if (closeDetail) {
            if (typeof closeDetailPanel === 'function') {
                closeDetailPanel();
            } else if (typeof setSelectedDetailObject === 'function') {
                setSelectedDetailObject(null);
            } else {
                window.currentSelectedObjectId = null;
            }
        }

        if (hadSelections) {
            this.renderFilteredObjects();
        } else {
            this.updateBulkRelationButton();
            this.updateSelectAllState();
        }
    }

    handleRowClick(event, row) {
        const objectId = Number(row?.dataset?.objectId);
        if (!Number.isFinite(objectId)) return;
        const currentDetailId = Number(window.currentSelectedObjectId);

        const isModifierSelection = event.shiftKey || event.ctrlKey || event.metaKey;
        if (!isModifierSelection) {
            if (currentDetailId === objectId) {
                this.clearRowSelection({ closeDetail: true });
                return;
            }
            this.selectedObjectIds = new Set([objectId]);
            this.selectionAnchorObjectId = objectId;
            if (typeof setSelectedDetailObject === 'function') {
                setSelectedDetailObject(objectId);
            } else {
                window.currentSelectedObjectId = objectId;
            }
            viewObjectDetail(objectId);
            this.renderFilteredObjects();
            return;
        }

        event.preventDefault();

        if (event.shiftKey) {
            this.selectRangeTo(objectId, event.ctrlKey || event.metaKey);
            if (typeof setSelectedDetailObject === 'function') {
                setSelectedDetailObject(objectId);
            } else {
                window.currentSelectedObjectId = objectId;
            }
            viewObjectDetail(objectId);
            this.renderFilteredObjects();
            return;
        }

        const shouldSelect = !this.selectedObjectIds.has(objectId);
        if (shouldSelect) {
            this.selectedObjectIds.add(objectId);
        } else {
            this.selectedObjectIds.delete(objectId);
        }
        this.selectionAnchorObjectId = objectId;
        if (typeof setSelectedDetailObject === 'function') {
            setSelectedDetailObject(objectId);
        } else {
            window.currentSelectedObjectId = objectId;
        }
        viewObjectDetail(objectId);
        this.renderFilteredObjects();
    }

    selectRangeTo(objectId, preserveExistingSelection = false) {
        const visibleIds = (this.filteredObjects || [])
            .map(obj => Number(obj.id))
            .filter(id => Number.isFinite(id));
        if (!visibleIds.length) return;

        const anchorId = Number.isFinite(Number(this.selectionAnchorObjectId))
            ? Number(this.selectionAnchorObjectId)
            : objectId;
        const anchorIndex = visibleIds.indexOf(anchorId);
        const targetIndex = visibleIds.indexOf(objectId);
        if (anchorIndex < 0 || targetIndex < 0) {
            this.selectionAnchorObjectId = objectId;
            return;
        }

        const [start, end] = anchorIndex <= targetIndex
            ? [anchorIndex, targetIndex]
            : [targetIndex, anchorIndex];

        if (!preserveExistingSelection) {
            this.selectedObjectIds.clear();
        }

        visibleIds.slice(start, end + 1).forEach(id => this.selectedObjectIds.add(id));
        this.selectionAnchorObjectId = anchorId;
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
            bulkRelateBtn.style.display = selectedCount > 0 ? 'inline-flex' : 'none';
            bulkRelateBtn.title = selectedCount > 0 ? `Koppla ${selectedCount} markerade objekt` : 'Koppla markerade objekt';
            bulkRelateBtn.setAttribute('aria-label', bulkRelateBtn.title);
        }
        if (bulkEditBtn) {
            bulkEditBtn.style.display = selectedCount > 0 ? 'inline-flex' : 'none';
            bulkEditBtn.title = selectedCount > 0 ? `Redigera ${selectedCount} markerade objekt` : 'Redigera markerade objekt';
            bulkEditBtn.setAttribute('aria-label', bulkEditBtn.title);
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
