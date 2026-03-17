/**
 * TreeView Component
 * Displays hierarchical tree structure of objects using the shared SystemTable pattern.
 */

class TreeView {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.data = [];
        this.viewMode = this.loadViewMode();
        this.modeStateStorageKey = 'tree-view-mode-states';
        this.defaultColumnSearches = this.getDefaultColumnSearches();
        this.defaultTableState = this.getDefaultTableState();
        this.modeStates = this.loadModeStates();
        this.expandedNodes = new Set();
        this.tableState = this.cloneTableState(this.defaultTableState);
        this.systemTable = null;
        this.onNodeClick = null;
        this.selectedObjectId = window.currentSelectedObjectId || null;
        this.availableFields = [];
        this.columnVisibility = this.loadColumnVisibility();
        this.columnWidths = this.loadColumnWidths();
        this.columnOrder = this.loadColumnOrder();
        this.renderedTreeData = [];
        this.searchExpandedNodes = new Set();
        this.nodeClickDelayMs = 220;
        this.pendingNodeClickTimer = null;
        this.hasLoadedData = false;
        this.draggedColumnField = null;
        this.managedListDisplayByListId = new Map();

        this.restoreModeState(this.viewMode);
    }

    async loadData() {
        try {
            const params = new URLSearchParams({ view: this.viewMode });
            const response = await fetch(`/api/objects/tree?${params.toString()}`);
            if (!response.ok) {
                throw new Error('Failed to load tree data');
            }
            this.data = await response.json();
            this.applyDefaultExpansion();
            this.hasLoadedData = true;
        } catch (error) {
            console.error('Error loading tree:', error);
            throw error;
        }
    }

    async loadAvailableFields() {
        try {
            const response = await fetch('/api/view-config/list-view');
            if (!response.ok) {
                throw new Error('Failed to load list view config');
            }

            const payload = await response.json();
            const fieldMap = new Map();

            Object.values(payload || {}).forEach(typeConfig => {
                (typeConfig?.available_fields || []).forEach(field => {
                    if (!field?.field_name) return;
                    const normalizedFieldName = String(field.field_name);
                    if (['id_full', 'object_type', 'created_at', 'files', 'files_indicator'].includes(normalizedFieldName)) {
                        return;
                    }
                    if (!fieldMap.has(normalizedFieldName)) {
                        fieldMap.set(normalizedFieldName, {
                            field_name: normalizedFieldName,
                            display_name: field.display_name || normalizedFieldName,
                            field_type: field.field_type,
                            field_options: field.field_options
                        });
                    }
                });
            });

            this.availableFields = Array.from(fieldMap.values())
                .sort((a, b) => String(a.display_name || '').localeCompare(String(b.display_name || ''), 'sv'));
        } catch (error) {
            console.error('Failed to load tree view available fields:', error);
            this.availableFields = [];
        }
    }

    async render(options = {}) {
        if (!this.container) return;

        const scrollState = options.preserveScroll ? this.captureScrollState() : null;

        await this.loadAvailableFields();
        await this.preloadManagedListDisplayMaps();

        if (options.reloadData || !this.hasLoadedData) {
            await this.loadData();
        }

        this.container.innerHTML = `
            <div class="tree-view">
                <div class="tree-toolbar">
                    <div class="tree-view-mode-buttons" role="group" aria-label="Trädvy-läge">
                        <button type="button" class="btn btn-sm tree-view-mode-btn ${this.viewMode === 'byggdelar' ? 'active' : ''}" data-view-mode="byggdelar">Byggdelar</button>
                        <button type="button" class="btn btn-sm tree-view-mode-btn ${this.viewMode === 'utrymmen' ? 'active' : ''}" data-view-mode="utrymmen">Utrymmen</button>
                        <button type="button" class="btn btn-sm tree-view-mode-btn ${this.viewMode === 'system' ? 'active' : ''}" data-view-mode="system">System</button>
                    </div>
                    <button type="button" class="btn btn-secondary btn-sm" id="tree-column-config-btn">
                        ⚙️ Kolumner
                    </button>
                </div>
                <div id="tree-column-config-panel" class="column-config-panel" style="display: none;">
                    <div class="column-config-content">
                        <h4>Visa/Dölj Kolumner</h4>
                        <div id="tree-column-toggles"></div>
                    </div>
                </div>
                <div id="tree-system-table"></div>
            </div>
        `;

        this.renderColumnConfig();
        this.renderTable();
        this.attachEventListeners();
        this.applySelectionToDOM();

        if (scrollState) {
            this.restoreScrollState(scrollState);
        }
    }

    renderTable() {
        if (typeof SystemTable !== 'function') {
            throw new Error('SystemTable is not available');
        }

        this.systemTable = new SystemTable({
            containerId: 'tree-system-table',
            tableId: `tree-system-table-${this.viewMode}`,
            columns: this.getVisibleColumns(),
            rows: [],
            getRows: (table) => this.getRenderedRows(table),
            renderRow: (row, index, table) => this.renderTableRow(row, index, table),
            emptyText: this.getEmptyStateText(),
            globalSearch: true,
            columnSearch: true,
            persistState: false,
            resizableColumns: false,
            reorderableColumns: false,
            initialState: this.tableState,
            tableClassName: 'tree-table',
            containerClassName: 'tree-table-container',
            onStateChange: (state) => {
                this.tableState = this.cloneTableState(state);
                this.persistCurrentModeState();
            },
            onRender: (table) => {
                this.systemTable = table;
                this.tableState = this.cloneTableState(table.state);
                this.persistCurrentModeState();
                this.applySelectionToDOM();
                this.enableColumnResizing();
                this.enableColumnReordering();
            }
        });

        this.systemTable.render();
    }

    captureScrollState() {
        const scrollContainer = this.container?.querySelector('#tree-system-table .table-container');
        if (!scrollContainer) return null;

        return {
            top: scrollContainer.scrollTop,
            left: scrollContainer.scrollLeft
        };
    }

    restoreScrollState(scrollState) {
        const scrollContainer = this.container?.querySelector('#tree-system-table .table-container');
        if (!scrollContainer || !scrollState) return;

        scrollContainer.scrollTop = Number(scrollState.top) || 0;
        scrollContainer.scrollLeft = Number(scrollState.left) || 0;
    }

    getDefaultColumnSearches() {
        return {
            name: '',
            id: '',
            type: '',
            kravtext: '',
            beskrivning: '',
            files: '',
            has_files: ''
        };
    }

    getDefaultTableState() {
        return {
            search: '',
            columnSearches: { ...this.defaultColumnSearches },
            sortField: 'name',
            sortDirection: 'asc'
        };
    }

    cloneTableState(state) {
        const source = state && typeof state === 'object' ? state : {};
        return {
            search: String(source.search || ''),
            columnSearches: {
                ...this.defaultColumnSearches,
                ...(source.columnSearches || {})
            },
            sortField: source.sortField || this.defaultTableState.sortField,
            sortDirection: source.sortDirection === 'desc' ? 'desc' : 'asc'
        };
    }

    loadViewMode() {
        try {
            const stored = localStorage.getItem('tree-view-mode');
            if (stored === 'byggdelar' || stored === 'utrymmen' || stored === 'system') {
                return stored;
            }
        } catch (_error) {
            // Ignore storage errors
        }
        return 'byggdelar';
    }

    saveViewMode() {
        try {
            localStorage.setItem('tree-view-mode', this.viewMode);
        } catch (_error) {
            // Ignore storage errors
        }
    }

    loadModeStates() {
        try {
            const raw = sessionStorage.getItem(this.modeStateStorageKey);
            if (!raw) return {};
            const parsed = JSON.parse(raw);
            return parsed && typeof parsed === 'object' ? parsed : {};
        } catch (_error) {
            return {};
        }
    }

    saveModeStates() {
        try {
            sessionStorage.setItem(this.modeStateStorageKey, JSON.stringify(this.modeStates || {}));
        } catch (_error) {
            // Ignore storage errors
        }
    }

    persistCurrentModeState() {
        const mode = this.viewMode;
        if (!['byggdelar', 'utrymmen', 'system'].includes(mode)) return;

        this.modeStates[mode] = {
            expandedNodes: Array.from(this.expandedNodes || []),
            tableState: this.cloneTableState(this.systemTable?.state || this.tableState)
        };
        this.saveModeStates();
    }

    restoreModeState(mode) {
        const state = this.modeStates?.[mode];
        if (!state || typeof state !== 'object') {
            this.expandedNodes = new Set();
            this.tableState = this.cloneTableState(this.defaultTableState);
            return;
        }

        const expandedNodes = Array.isArray(state.expandedNodes) ? state.expandedNodes : [];
        this.expandedNodes = new Set(expandedNodes.map(item => String(item)));
        this.tableState = this.cloneTableState(state.tableState);
    }

    applyDefaultExpansion() {
        const state = this.modeStates?.[this.viewMode];
        const hasStoredExpansionState = !!(state && Array.isArray(state.expandedNodes));
        if (hasStoredExpansionState || this.expandedNodes.size > 0 || !Array.isArray(this.data)) {
            return;
        }

        this.data.forEach(node => {
            if (Array.isArray(node?.children) && node.children.length > 0) {
                this.expandedNodes.add(String(node.id));
            }
        });
    }

    getEmptyStateText() {
        if (this.viewMode === 'utrymmen') return 'Inga utrymmen ännu';
        if (this.viewMode === 'system') return 'Inga systemobjekt ännu';
        return 'Inga byggdelar ännu';
    }

    getAllColumns() {
        const dynamicFields = (this.availableFields || [])
            .filter(field => !['name', 'namn'].includes(String(field.field_name || '').toLowerCase()))
            .map(field => ({
                field: field.field_name,
                label: field.display_name || field.field_name,
                className: this.getDynamicColumnClass(field),
                field_type: field.field_type,
                field_options: field.field_options,
                draggable: true
            }));

        return [
            { field: 'name', label: 'Namn', className: 'col-name col-tree-name', draggable: false },
            { field: 'id', label: 'ID', className: 'col-id col-tree-id', draggable: true },
            { field: 'type', label: 'Typ', className: 'col-type col-tree-type', draggable: true },
            ...dynamicFields,
            { field: 'created_at', label: 'Skapad', className: 'col-date col-tree-created-at', draggable: true },
            {
                field: 'has_files',
                label: '📎',
                className: 'col-paperclip col-tree-has-files',
                searchType: 'checkbox',
                value: (row) => row?.fileCount || 0,
                draggable: true
            },
            {
                field: 'files',
                label: 'Filer',
                className: 'col-name col-tree-files',
                value: (row) => (Array.isArray(row?.files) ? row.files.map(file =>
                    file?.description || file?.original_filename || file?.filename || ''
                ).join(' ') : ''),
                draggable: true
            }
        ];
    }

    getDynamicColumnClass(field) {
        const fieldName = String(field?.field_name || '').toLowerCase();
        const fieldType = String(field?.field_type || '').toLowerCase();

        if (fieldName.includes('beskrivning') || fieldName.includes('description')) return 'col-description';
        if (fieldName.includes('namn') || fieldName.includes('name')) return 'col-name';
        if (fieldName.includes('id')) return 'col-id';
        if (fieldType === 'textarea' || fieldType === 'richtext') return 'col-description';
        if (fieldType === 'date') return 'col-date';
        if (fieldType === 'boolean') return 'col-status';
        if (fieldType === 'number' || fieldType === 'decimal') return 'col-number';
        return 'col-default';
    }

    getVisibleColumns() {
        const allColumns = this.getAllColumns();
        const fieldMap = new Map(allColumns.map(column => [column.field, column]));
        const orderedFields = this.getResolvedColumnOrder();

        return orderedFields
            .map(field => fieldMap.get(field))
            .filter(column => column && this.columnVisibility[column.field] !== false)
            .map(column => ({
                ...column,
                width: this.getColumnWidth(column.field)
            }));
    }

    renderColumnConfig() {
        const container = this.container?.querySelector('#tree-column-toggles');
        if (!container) return;

        container.innerHTML = this.getAllColumns().map(column => `
            <label class="column-toggle">
                <input type="checkbox" data-column-id="${column.field}" ${this.columnVisibility[column.field] !== false ? 'checked' : ''}>
                ${this.escapeHtml(column.label)}
            </label>
        `).join('');

        container.querySelectorAll('input[type="checkbox"]').forEach(input => {
            input.addEventListener('change', (event) => {
                const columnId = event.target.getAttribute('data-column-id');
                if (!columnId) return;
                this.columnVisibility[columnId] = event.target.checked;
                if (!event.target.checked && this.tableState.columnSearches[columnId] !== undefined) {
                    this.tableState.columnSearches[columnId] = '';
                }
                this.saveColumnVisibility();
                this.persistCurrentModeState();
                this.refreshVisibleColumns();
            });
        });
    }

    refreshVisibleColumns() {
        if (!this.systemTable) {
            this.render({ preserveScroll: true });
            return;
        }

        const scrollState = this.captureScrollState();
        this.systemTable.state = this.cloneTableState(this.tableState);
        this.systemTable.setColumns(this.getVisibleColumns());

        if (scrollState) {
            this.restoreScrollState(scrollState);
        }
    }

    loadColumnVisibility() {
        try {
            const raw = localStorage.getItem('tree-view-column-visibility');
            if (!raw) return {};
            const parsed = JSON.parse(raw);
            return parsed && typeof parsed === 'object' ? parsed : {};
        } catch (_error) {
            return {};
        }
    }

    saveColumnVisibility() {
        try {
            localStorage.setItem('tree-view-column-visibility', JSON.stringify(this.columnVisibility || {}));
        } catch (_error) {
            // Ignore storage errors
        }
    }

    getColumnWidthStorageKey() {
        return 'tree-view-column-widths-v2';
    }

    getColumnOrderStorageKey() {
        return 'tree-view-column-order-v1';
    }

    loadColumnWidths() {
        try {
            const raw = localStorage.getItem(this.getColumnWidthStorageKey());
            if (!raw) return {};
            const parsed = JSON.parse(raw);
            return parsed && typeof parsed === 'object' ? parsed : {};
        } catch (_error) {
            return {};
        }
    }

    saveColumnWidths() {
        try {
            localStorage.setItem(this.getColumnWidthStorageKey(), JSON.stringify(this.columnWidths || {}));
        } catch (_error) {
            // Ignore storage errors
        }
    }

    loadColumnOrder() {
        try {
            const raw = localStorage.getItem(this.getColumnOrderStorageKey());
            if (!raw) return {};
            const parsed = JSON.parse(raw);
            return parsed && typeof parsed === 'object' ? parsed : {};
        } catch (_error) {
            return {};
        }
    }

    saveColumnOrder() {
        try {
            localStorage.setItem(this.getColumnOrderStorageKey(), JSON.stringify(this.columnOrder || {}));
        } catch (_error) {
            // Ignore storage errors
        }
    }

    getResolvedColumnOrder() {
        const defaultOrder = this.getAllColumns().map(column => column.field);
        const storedOrder = Array.isArray(this.columnOrder?.[this.viewMode]) ? this.columnOrder[this.viewMode] : [];
        const validFields = new Set(defaultOrder);
        const sanitizedStoredOrder = storedOrder.filter(field => validFields.has(field) && field !== 'name');
        const missingFields = defaultOrder.filter(field => field !== 'name' && !sanitizedStoredOrder.includes(field));
        return ['name', ...sanitizedStoredOrder, ...missingFields];
    }

    persistColumnOrder(order) {
        if (!Array.isArray(order)) return;
        if (!this.columnOrder || typeof this.columnOrder !== 'object') {
            this.columnOrder = {};
        }

        this.columnOrder[this.viewMode] = ['name', ...order.filter(field => field && field !== 'name')];
        this.saveColumnOrder();
    }

    getColumnWidth(columnId) {
        const modeWidths = this.columnWidths?.[this.viewMode];
        const width = Number(modeWidths?.[columnId]);
        return Number.isFinite(width) && width > 0 ? width : null;
    }

    persistColumnWidth(columnId, width) {
        if (!columnId || !Number.isFinite(width)) return;
        if (!this.columnWidths || typeof this.columnWidths !== 'object') {
            this.columnWidths = {};
        }
        if (!this.columnWidths[this.viewMode] || typeof this.columnWidths[this.viewMode] !== 'object') {
            this.columnWidths[this.viewMode] = {};
        }
        this.columnWidths[this.viewMode][columnId] = Math.round(width);
        this.saveColumnWidths();
    }

    getRenderedRows(table) {
        const sortedData = this.sortTreeNodes(this.getFilteredTreeData(table), table);
        this.renderedTreeData = sortedData;

        const rows = [];
        sortedData.forEach(node => this.flattenTree(node, 0, rows));
        return rows;
    }

    flattenTree(node, level, rows) {
        if (!node) return;

        const hasChildren = Array.isArray(node.children) && node.children.length > 0;
        const forceExpanded = this.hasActiveSearch() && this.searchExpandedNodes.has(String(node.id));
        const isExpanded = forceExpanded || this.expandedNodes.has(String(node.id));

        const files = Array.isArray(node.files) ? node.files : [];
        rows.push({
            node,
            level,
            isGroup: node.type === 'group',
            hasChildren,
            isExpanded,
            forceExpanded,
            files,
            fileCount: files.length
        });

        if (hasChildren && isExpanded) {
            node.children.forEach(child => this.flattenTree(child, level + 1, rows));
        }
    }

    renderTableRow(row, index, table) {
        const { node, level, isGroup, hasChildren, isExpanded, files, fileCount } = row;
        const isSelected = !isGroup && String(this.selectedObjectId ?? '') === String(node.id);
        const rowClasses = [
            'tree-node',
            isGroup ? 'tree-node-group' : '',
            hasChildren ? 'has-children' : '',
            isSelected ? 'tree-node-selected' : ''
        ].filter(Boolean).join(' ');

        const rowAttrs = [
            `data-row-index="${index}"`,
            `data-node-id="${this.escapeHtml(node.id)}"`,
            `data-has-children="${hasChildren}"`,
            `data-tree-level="${level}"`,
            isGroup ? '' : `data-node-type="${this.escapeHtml(node.type)}"`,
            !isGroup ? `aria-selected="${isSelected ? 'true' : 'false'}"` : ''
        ].filter(Boolean).join(' ');

        const cellsHtml = table.columns.map(column => {
            const className = column.className || 'col-default';
            const style = table.getColumnStyle(column);

            if (isGroup) {
                if (column.field !== 'name') {
                    return `<td class="${className}"${style}></td>`;
                }

                return `<td class="${className}"${style}>${this.renderNameCell(row, table, true)}</td>`;
            }

            if (column.field === 'name') {
                return `<td class="${className}"${style}>${this.renderNameCell(row, table, false)}</td>`;
            }
            if (column.field === 'id') {
                const displayId = node.id_full || '';
                const content = displayId
                    ? `<a href="javascript:void(0)" class="tree-id-link" data-node-id="${this.escapeHtml(node.id)}" data-node-type="${this.escapeHtml(node.type)}">${table.highlightText(displayId, 'id')}</a>`
                    : '';
                return `<td class="${className}"${style}>${content}</td>`;
            }
            if (column.field === 'type') {
                return `<td class="${className}"${style}>${table.renderTypeBadge(node.type || '')}</td>`;
            }
            if (column.field === 'created_at') {
                const createdAtValue = this.getNodeFieldValue(node, 'created_at');
                const formattedDate = typeof formatDate === 'function'
                    ? formatDate(createdAtValue)
                    : String(createdAtValue || '');
                return `<td class="${className}"${style}>${table.highlightText(formattedDate || '', 'created_at')}</td>`;
            }
            if (column.field === 'has_files') {
                return `<td class="${className}"${style} data-value="${fileCount}">${fileCount > 0 ? `<span title="${fileCount} fil(er) kopplade">📎</span>` : ''}</td>`;
            }
            if (column.field === 'files') {
                return `<td class="${className}"${style}>${this.renderFiles(files, table)}</td>`;
            }

            const rawValue = this.getNodeFieldValue(node, column.field);
            const stringValue = this.formatNodeDisplayValue(rawValue, column);
            const preserveLineBreaks = String(column.field_type || '').toLowerCase() === 'textarea';
            return `<td class="${className}"${style}>${table.highlightText(stringValue, column.field, { preserveLineBreaks })}</td>`;

            return `<td class="${className}"${style}></td>`;
        }).join('');

        return `<tr class="${rowClasses}" ${rowAttrs}>${cellsHtml}</tr>`;
    }

    renderNameCell(row, table, isGroup) {
        const indent = row.level * 12;
        const toggle = row.hasChildren
            ? `<span class="tree-toggle ${row.isExpanded ? 'expanded' : ''}">${row.isExpanded ? '▼' : '▶'}</span>`
            : '<span class="tree-spacer"></span>';

        if (isGroup) {
            return `
                <div class="tree-cell-content" style="padding-left: ${indent}px">
                    ${toggle}
                    <span class="tree-label tree-label-group">${table.highlightText(row.node.name || '', 'name')} <span class="tree-count">(${row.node.children?.length || 0})</span></span>
                </div>
            `;
        }

        return `
            <div class="tree-cell-content" style="padding-left: ${indent}px">
                ${toggle}
                <span class="tree-label">${table.highlightText(row.node.name || '', 'name')}</span>
            </div>
        `;
    }

    renderFiles(files, table) {
        if (!Array.isArray(files) || files.length === 0) {
            return '';
        }

        return files
            .map(file => {
                const rawFileDescription = file.description || file.original_filename || file.filename || 'Dokument';
                const fileDescription = table.highlightText(rawFileDescription, 'files');
                const fileTitle = this.escapeHtml(rawFileDescription);
                const rawFileUrl = `/api/objects/documents/${file.id}/download`;
                const isPdf = this.isPdfEntry(file);
                const fileUrl = typeof normalizePdfOpenUrl === 'function'
                    ? normalizePdfOpenUrl(rawFileUrl, isPdf)
                    : (isPdf ? `${rawFileUrl}?inline=1` : rawFileUrl);
                const previewClass = isPdf ? ' js-pdf-preview-link' : '';
                const previewAttr = isPdf ? ` data-preview-url="${this.escapeHtml(fileUrl)}"` : '';
                return `<a href="${this.escapeHtml(fileUrl)}" class="tree-file-link${previewClass}" data-document-id="${file.id}"${previewAttr} title="Öppna ${fileTitle}" target="_blank" rel="noopener noreferrer">${fileDescription}</a>`;
            })
            .join('<br>');
    }

    isPdfEntry(file) {
        const name = String(file?.original_filename || file?.filename || '').toLowerCase();
        const mimeType = String(file?.mime_type || '').toLowerCase();
        return mimeType === 'application/pdf' || name.endsWith('.pdf');
    }

    escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    hasActiveSearch() {
        const state = this.systemTable?.state || this.tableState;
        if (String(state.search || '').trim() !== '') return true;
        return Object.values(state.columnSearches || {}).some(value => String(value || '').trim() !== '');
    }

    getNodeFieldValue(node, field) {
        if (field === 'name') return node?.name || '';
        if (field === 'id') return node?.id_full || '';
        if (field === 'type') return node?.type || '';
        if (field === 'created_at') {
            return node?.created_at
                || node?.createdAt
                || node?.data?.created_at
                || node?.data?.createdAt
                || '';
        }
        if (field === 'has_files') return Array.isArray(node?.files) && node.files.length > 0 ? '1' : '';
        if (field === 'files') {
            if (!Array.isArray(node?.files)) return '';
            return node.files.map(file => file?.description || file?.original_filename || file?.filename || '').join(' ');
        }
        if (Object.prototype.hasOwnProperty.call(node || {}, field)) {
            return node?.[field];
        }
        return node?.data?.[field] ?? '';
    }

    formatNodeFieldValue(value) {
        if (Array.isArray(value)) {
            return value.map(item => String(item ?? '')).join(', ');
        }
        if (value && typeof value === 'object') {
            return JSON.stringify(value);
        }
        return String(value ?? '');
    }

    formatNodeDisplayValue(value, column = null) {
        const fieldType = String(column?.field_type || '').toLowerCase();
        const resolvedValue = this.resolveFieldDisplayValue(value, column);
        const formattedValue = this.formatNodeFieldValue(resolvedValue);

        if (fieldType === 'richtext' && /<[^>]+>/.test(formattedValue)) {
            return typeof stripHtmlTags === 'function'
                ? stripHtmlTags(formattedValue)
                : formattedValue.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        }

        return formattedValue;
    }

    normalizeFieldOptions(rawOptions) {
        if (!rawOptions) return null;
        if (typeof rawOptions === 'object') return rawOptions;
        if (typeof rawOptions !== 'string') return null;
        try {
            const parsed = JSON.parse(rawOptions);
            return parsed && typeof parsed === 'object' ? parsed : null;
        } catch (_error) {
            return null;
        }
    }

    parseFieldOptions(rawOptions) {
        if (Array.isArray(rawOptions)) return rawOptions;
        if (typeof rawOptions !== 'string') return [];
        return rawOptions
            .split(',')
            .map(option => option.trim())
            .filter(Boolean);
    }

    async preloadManagedListDisplayMaps() {
        this.managedListDisplayByListId = new Map();

        const managedListIds = (this.availableFields || [])
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

    resolveFieldDisplayValue(value, column = null) {
        const fieldType = String(column?.field_type || '').toLowerCase();
        if (fieldType !== 'select') return value;

        const options = this.normalizeFieldOptions(column?.field_options);
        if (options?.source === 'managed_list') {
            const listId = Number(options.list_id);
            const listMap = this.managedListDisplayByListId.get(listId);
            if (!listMap) return value;

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

            if (Array.isArray(value)) return value.map(resolveSingle);
            if (typeof value === 'string' && value.includes(',')) {
                return value.split(',').map(part => resolveSingle(part.trim()));
            }
            return resolveSingle(value);
        }

        const configuredOptions = this.parseFieldOptions(column?.field_options)
            .map(option => String(option ?? '').trim())
            .filter(Boolean);
        if (!configuredOptions.length) return value;

        const configuredMap = new Map(configuredOptions.map(option => [option, option]));
        const resolveConfigured = (rawValue) => {
            const key = String(rawValue ?? '').trim();
            return configuredMap.get(key) || rawValue;
        };

        if (Array.isArray(value)) return value.map(resolveConfigured);
        if (typeof value === 'string' && value.includes(',')) {
            return value.split(',').map(part => resolveConfigured(part.trim()));
        }
        return resolveConfigured(value);
    }

    getNodeSearchValue(node, field) {
        return this.formatNodeFieldValue(this.getNodeFieldValue(node, field));
    }

    nodeMatchesActiveSearch(node, table) {
        const searchState = table?.state || this.tableState;
        const globalTerms = String(searchState.search || '').trim().toLowerCase().split(/\s+/).filter(Boolean);
        const columnTerms = Object.entries(searchState.columnSearches || {})
            .filter(([, value]) => String(value || '').trim() !== '');

        const searchableFields = this.getAllColumns().map(column => column.field);
        const globalMatches = globalTerms.every(term => searchableFields.some(field =>
            String(this.getNodeSearchValue(node, field) || '').toLowerCase().includes(term)
        ));

        if (!globalMatches) return false;

        return columnTerms.every(([field, term]) => {
            const searchValue = this.getNodeSearchValue(node, field);
            return String(searchValue || '').toLowerCase().includes(String(term).trim().toLowerCase());
        });
    }

    filterTreeNode(node, table) {
        const children = Array.isArray(node?.children) ? node.children : [];
        const filteredChildren = [];

        children.forEach(child => {
            const filteredChild = this.filterTreeNode(child, table);
            if (filteredChild) {
                filteredChildren.push(filteredChild);
            }
        });

        const nodeMatches = this.nodeMatchesActiveSearch(node, table);
        const keepNode = nodeMatches || filteredChildren.length > 0;
        if (!keepNode) return null;

        if (filteredChildren.length > 0) {
            this.searchExpandedNodes.add(String(node.id));
        }

        return {
            ...node,
            children: filteredChildren
        };
    }

    getFilteredTreeData(table) {
        if (!this.hasActiveSearch()) {
            this.searchExpandedNodes = new Set();
            return this.data;
        }

        this.searchExpandedNodes = new Set();
        return this.data
            .map(node => this.filterTreeNode(node, table))
            .filter(node => node !== null);
    }

    sortTreeNodes(nodes, table) {
        if (!Array.isArray(nodes)) return [];

        const sortField = table?.state?.sortField;
        if (!sortField) {
            return nodes.map(node => ({
                ...node,
                children: this.sortTreeNodes(node.children || [], table)
            }));
        }

        const direction = table?.state?.sortDirection === 'desc' ? -1 : 1;
        const sorted = [...nodes].sort((a, b) => this.compareNodes(a, b, sortField, direction, table));

        return sorted.map(node => ({
            ...node,
            children: this.sortTreeNodes(node.children || [], table)
        }));
    }

    compareNodes(a, b, sortField, direction, table) {
        const aIsGroup = a?.type === 'group';
        const bIsGroup = b?.type === 'group';
        if (aIsGroup !== bIsGroup) {
            return aIsGroup ? -1 : 1;
        }

        const aValue = this.getComparableNodeValue(a, sortField);
        const bValue = this.getComparableNodeValue(b, sortField);
        return table.compareValues(aValue, bValue) * direction;
    }

    getComparableNodeValue(node, sortField) {
        if (sortField === 'has_files') return Array.isArray(node?.files) ? node.files.length : 0;
        return this.getNodeSearchValue(node, sortField);
    }

    findNodeById(nodes, nodeId) {
        const stack = Array.isArray(nodes) ? [...nodes] : [];
        const target = String(nodeId);

        while (stack.length > 0) {
            const current = stack.pop();
            if (String(current?.id) === target) return current;
            const children = Array.isArray(current?.children) ? current.children : [];
            for (let i = children.length - 1; i >= 0; i -= 1) {
                stack.push(children[i]);
            }
        }

        return null;
    }

    collectExpandableNodeIds(node, ids = []) {
        if (!node || !Array.isArray(node.children) || node.children.length === 0) {
            return ids;
        }

        ids.push(String(node.id));
        node.children.forEach(child => this.collectExpandableNodeIds(child, ids));
        return ids;
    }

    attachEventListeners() {
        const viewModeButtons = this.container.querySelectorAll('.tree-view-mode-btn[data-view-mode]');
        viewModeButtons.forEach(button => {
            button.addEventListener('click', async () => {
                const nextMode = button.dataset.viewMode;
                if (!['byggdelar', 'utrymmen', 'system'].includes(nextMode)) return;
                if (nextMode === this.viewMode) return;
                this.persistCurrentModeState();
                this.viewMode = nextMode;
                this.saveViewMode();
                this.restoreModeState(nextMode);
                await this.render({ reloadData: true });
            });
        });

        const configButton = this.container.querySelector('#tree-column-config-btn');
        const configPanel = this.container.querySelector('#tree-column-config-panel');
        if (configButton && configPanel) {
            configButton.addEventListener('click', () => {
                configPanel.style.display = configPanel.style.display === 'none' ? 'block' : 'none';
            });
        }

        const treeTableBody = this.container.querySelector('#tree-system-table tbody');
        if (!treeTableBody) return;

        treeTableBody.addEventListener('mousedown', (e) => {
            const node = e.target.closest('.tree-node');
            if (!node || node.dataset.hasChildren !== 'true') return;
            const cell = e.target.closest('td');
            if (!this.isNameColumnCell(cell)) return;
            if (e.detail < 2) return;
            if (e.target.closest('a, button, input, textarea, select, label')) return;
            e.preventDefault();
        });

        treeTableBody.addEventListener('click', (e) => {
            const fileLink = e.target.closest('.tree-file-link');
            if (fileLink) {
                e.stopPropagation();
                return;
            }

            const idLink = e.target.closest('.tree-id-link');
            if (idLink) {
                e.preventDefault();
                e.stopPropagation();

                const nodeId = parseInt(idLink.dataset.nodeId, 10);
                const nodeType = idLink.dataset.nodeType;
                this.activateObjectRow(nodeId, nodeType);
                return;
            }

            const toggle = e.target.closest('.tree-toggle');
            if (toggle) {
                e.stopPropagation();
                const node = toggle.closest('.tree-node');
                if (!node) return;
                this.toggleNodeExpansion(node.dataset.nodeId);
                return;
            }

            const node = e.target.closest('.tree-node');
            if (!node) return;
            if (e.target.closest('a, button, input, textarea, select, label')) return;

            const cell = e.target.closest('td');
            const isNameCell = this.isNameColumnCell(cell);
            const hasChildren = node.dataset.hasChildren === 'true';
            const nodeType = node.dataset.nodeType || '';
            const nodeId = parseInt(node.dataset.nodeId, 10);

            if (isNameCell) {
                if (!hasChildren || e.detail > 1) return;
                this.scheduleNodeExpansion(node.dataset.nodeId);
                return;
            }

            if (!Number.isFinite(nodeId) || !nodeType) return;
            e.preventDefault();
            e.stopPropagation();
            this.activateObjectRow(nodeId, nodeType);
        });

        treeTableBody.addEventListener('dblclick', (e) => {
            const node = e.target.closest('.tree-node');
            if (!node || node.dataset.hasChildren !== 'true') return;
            if (e.target.closest('a, button, input, textarea, select, label')) return;
            const cell = e.target.closest('td');
            if (!this.isNameColumnCell(cell)) return;

            e.preventDefault();
            e.stopPropagation();
            this.cancelPendingNodeExpansion();
            this.toggleSubtreeExpansion(node.dataset.nodeId);
        });
    }

    isNameColumnCell(cell) {
        if (!cell) return false;
        return cell.dataset.columnKey === 'name' || cell.classList.contains('col-tree-name');
    }

    activateObjectRow(nodeId, nodeType) {
        if (!Number.isFinite(Number(nodeId)) || !nodeType) return;
        this.setSelectedObjectId(nodeId);
        if (this.onNodeClick) {
            this.onNodeClick(Number(nodeId), nodeType);
        }
    }

    enableColumnResizing() {
        const table = this.container?.querySelector('#tree-system-table .data-table');
        if (!table || typeof makeTableColumnsResizable !== 'function') return;

        makeTableColumnsResizable({
            table,
            minWidth: 48,
            fixedLayout: true,
            headerSelector: 'thead tr:first-child th[data-column-key]',
            getColumnKey: (header) => header?.dataset?.columnKey || '',
            getInitialWidth: (columnId) => this.getColumnWidth(columnId),
            onResizeEnd: (columnId, width) => {
                this.persistColumnWidth(columnId, width);
            }
        });
    }

    enableColumnReordering() {
        const table = this.container?.querySelector('#tree-system-table .data-table');
        if (!table) return;

        const headers = Array.from(table.querySelectorAll('thead tr:first-child th[data-draggable-column="true"]'));
        headers.forEach((header) => {
            header.addEventListener('dragstart', (event) => {
                if (event.target?.closest?.('.column-resize-handle')) {
                    event.preventDefault();
                    return;
                }

                const field = header.dataset.field || '';
                if (!field || field === 'name') {
                    event.preventDefault();
                    return;
                }

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
                const targetField = header.dataset.field || '';
                if (!this.draggedColumnField || !targetField || this.draggedColumnField === targetField || targetField === 'name') return;
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
                if (!targetField || targetField === this.draggedColumnField || targetField === 'name') return;
                const rect = header.getBoundingClientRect();
                const insertBefore = event.clientX < rect.left + (rect.width / 2);
                this.moveColumn(this.draggedColumnField, targetField, insertBefore);
            });
        });
    }

    moveColumn(sourceField, targetField, insertBefore) {
        if (!sourceField || !targetField || sourceField === targetField) return;
        if (sourceField === 'name' || targetField === 'name') return;

        const currentOrder = this.getResolvedColumnOrder().filter(field => field !== 'name');
        const sourceIndex = currentOrder.indexOf(sourceField);
        const targetIndex = currentOrder.indexOf(targetField);
        if (sourceIndex < 0 || targetIndex < 0) return;

        currentOrder.splice(sourceIndex, 1);
        let destinationIndex = currentOrder.indexOf(targetField);
        if (destinationIndex < 0) return;
        if (!insertBefore) destinationIndex += 1;
        currentOrder.splice(destinationIndex, 0, sourceField);

        this.persistColumnOrder(currentOrder);
        this.render({ preserveScroll: true });
    }

    scheduleNodeExpansion(nodeId) {
        if (!nodeId) return;

        this.cancelPendingNodeExpansion();
        this.pendingNodeClickTimer = window.setTimeout(() => {
            this.pendingNodeClickTimer = null;
            this.toggleNodeExpansion(nodeId);
        }, this.nodeClickDelayMs);
    }

    cancelPendingNodeExpansion() {
        if (this.pendingNodeClickTimer === null) return;
        window.clearTimeout(this.pendingNodeClickTimer);
        this.pendingNodeClickTimer = null;
    }

    toggleNodeExpansion(nodeId) {
        if (!nodeId) return;
        const normalizedId = String(nodeId);
        if (this.expandedNodes.has(normalizedId)) {
            this.expandedNodes.delete(normalizedId);
        } else {
            this.expandedNodes.add(normalizedId);
        }
        this.persistCurrentModeState();
        this.render({ preserveScroll: true });
    }

    toggleSubtreeExpansion(nodeId) {
        if (!nodeId) return;

        const sourceTree = this.renderedTreeData || this.getFilteredTreeData(this.systemTable);
        const nodeData = this.findNodeById(sourceTree, nodeId);
        const expandableIds = this.collectExpandableNodeIds(nodeData, []);
        if (!expandableIds.length) return;

        const allExpanded = expandableIds.every(id => this.expandedNodes.has(id));
        if (allExpanded) {
            expandableIds.forEach(id => this.expandedNodes.delete(id));
        } else {
            expandableIds.forEach(id => this.expandedNodes.add(id));
        }
        this.persistCurrentModeState();
        this.render({ preserveScroll: true });
    }

    setNodeClickHandler(handler) {
        this.onNodeClick = handler;
    }

    setSelectedObjectId(objectId) {
        this.selectedObjectId = objectId !== null && objectId !== undefined ? Number(objectId) : null;
        this.applySelectionToDOM();
    }

    applySelectionToDOM() {
        if (!this.container) return;
        const selectedId = String(this.selectedObjectId ?? '');
        this.container.querySelectorAll('.tree-node[data-node-type]').forEach(node => {
            const isSelected = node.dataset.nodeId === selectedId;
            node.classList.toggle('tree-node-selected', isSelected);
            node.setAttribute('aria-selected', isSelected ? 'true' : 'false');
        });
    }

    async refresh() {
        await this.render({ reloadData: true });
    }
}
