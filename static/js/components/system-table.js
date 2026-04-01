/**
 * SystemTable
 * Reusable table with global search, column search, sortable columns,
 * resizable/reorderable columns, column visibility, row selection, and batch operations.
 */
class SystemTable {
    constructor(options = {}) {
        this.containerId = options.containerId;
        this.container = document.getElementById(this.containerId);
        this.columns = Array.isArray(options.columns) ? options.columns : [];
        this.rows = Array.isArray(options.rows) ? options.rows : [];
        this.getRows = typeof options.getRows === 'function' ? options.getRows : null;
        this.renderRow = typeof options.renderRow === 'function' ? options.renderRow : null;
        this.tableId = options.tableId || `system-table-${this.containerId}`;
        this.emptyText = options.emptyText || 'Inga rader hittades';
        this.globalSearch = options.globalSearch !== false;
        this.columnSearch = options.columnSearch !== false;
        this.searchDebounceMs = Number.isFinite(options.searchDebounceMs) ? options.searchDebounceMs : 280;
        this.rowClassName = options.rowClassName || '';
        this.tableClassName = options.tableClassName || '';
        this.containerClassName = options.containerClassName || '';
        this.onRowClick = typeof options.onRowClick === 'function' ? options.onRowClick : null;
        this.onRender = typeof options.onRender === 'function' ? options.onRender : null;
        this.onStateChange = typeof options.onStateChange === 'function' ? options.onStateChange : null;
        this.pendingFocusDescriptor = null;
        this.persistState = options.persistState !== false;
        this.resizableColumns = options.resizableColumns !== false;
        this.reorderableColumns = options.reorderableColumns !== false;
        this.minColumnWidth = Number.isFinite(options.minColumnWidth) ? options.minColumnWidth : 48;
        this.draggedColumnField = null;
        this.isStabilizingLayout = false;

        // Row selection
        this.selectable = options.selectable === true;
        this.rowId = options.rowId || 'id';
        this.batchActions = Array.isArray(options.batchActions) ? options.batchActions : [];
        this.onSelectionChange = typeof options.onSelectionChange === 'function' ? options.onSelectionChange : null;
        this.selectedRowIds = new Set();
        this._selectionAnchorId = null;

        // Column visibility
        this.columnVisibility = options.columnVisibility !== false;

        this.textCollator = new Intl.Collator('sv', {
            sensitivity: 'base',
            numeric: true,
            ignorePunctuation: true
        });

        const firstSortable = this.columns.find(col => col.sortable !== false);
        const defaultState = {
            search: '',
            columnSearches: Object.fromEntries(this.columns.map(col => [col.field, ''])),
            columnOrder: this.columns.map(col => String(col.field || '')).filter(Boolean),
            columnWidths: Object.fromEntries(
                this.columns
                    .map(col => [col.field, this.normalizeColumnWidth(col.width)])
                    .filter(([, width]) => width !== null)
            ),
            sortField: firstSortable ? firstSortable.field : null,
            sortDirection: 'asc',
            hiddenColumns: this.columns
                .filter(col => col.hidden === true)
                .map(col => String(col.field || ''))
                .filter(Boolean)
        };
        this.state = this.applyStateOverride(
            this.restorePersistedState(defaultState),
            options.initialState
        );
        this.lastRenderedRows = [];
        this.persistCurrentState();
    }

    applyStateOverride(baseState, overrideState) {
        if (!overrideState || typeof overrideState !== 'object') {
            return baseState;
        }

        const hasValidSortField = this.columns.some(col => (
            col.field === overrideState.sortField && col.sortable !== false
        ));

        return {
            ...baseState,
            search: overrideState.search !== undefined ? String(overrideState.search || '') : baseState.search,
            columnSearches: {
                ...baseState.columnSearches,
                ...(overrideState.columnSearches || {})
            },
            columnOrder: this.normalizeColumnOrder(
                Array.isArray(overrideState.columnOrder) ? overrideState.columnOrder : baseState.columnOrder
            ),
            columnWidths: this.normalizeColumnWidths({
                ...baseState.columnWidths,
                ...(overrideState.columnWidths || {})
            }),
            sortField: hasValidSortField ? overrideState.sortField : baseState.sortField,
            sortDirection: overrideState.sortDirection === 'desc' ? 'desc' : baseState.sortDirection,
            hiddenColumns: Array.isArray(overrideState.hiddenColumns) ? overrideState.hiddenColumns : baseState.hiddenColumns
        };
    }

    normalizeColumnWidth(width) {
        const normalized = Number(width);
        if (!Number.isFinite(normalized) || normalized <= 0) return null;
        return Math.round(normalized);
    }

    normalizeColumnOrder(order = []) {
        const availableFields = this.columns
            .map(column => String(column?.field || ''))
            .filter(Boolean);
        const seen = new Set();
        const normalized = [];

        order.forEach((field) => {
            const normalizedField = String(field || '').trim();
            if (!normalizedField || seen.has(normalizedField) || !availableFields.includes(normalizedField)) {
                return;
            }
            seen.add(normalizedField);
            normalized.push(normalizedField);
        });

        availableFields.forEach((field) => {
            if (seen.has(field)) return;
            seen.add(field);
            normalized.push(field);
        });

        return normalized;
    }

    normalizeColumnWidths(widths = {}) {
        const normalized = {};
        if (!widths || typeof widths !== 'object') return normalized;

        this.columns.forEach((column) => {
            const field = String(column?.field || '');
            if (!field) return;
            const width = this.normalizeColumnWidth(widths[field]);
            if (width !== null) {
                normalized[field] = width;
            }
        });

        return normalized;
    }

    getStateStorageKey() {
        return this.tableId || this.containerId || '';
    }

    getPersistentStorageKey() {
        const key = this.getStateStorageKey();
        return key ? `system-table-state:${key}` : '';
    }

    getStateStore() {
        if (!window.__systemTableStateStore) {
            window.__systemTableStateStore = {};
        }
        return window.__systemTableStateStore;
    }

    readPersistedStorageState() {
        const storageKey = this.getPersistentStorageKey();
        if (!storageKey || typeof localStorage === 'undefined') return null;

        try {
            const raw = localStorage.getItem(storageKey);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            return parsed && typeof parsed === 'object' ? parsed : null;
        } catch (_error) {
            return null;
        }
    }

    writePersistedStorageState(state) {
        const storageKey = this.getPersistentStorageKey();
        if (!storageKey || typeof localStorage === 'undefined') return;

        try {
            localStorage.setItem(storageKey, JSON.stringify(state));
        } catch (_error) {
            // Ignore storage failures.
        }
    }

    restorePersistedState(defaultState) {
        if (!this.persistState) return defaultState;
        const key = this.getStateStorageKey();
        if (!key) return defaultState;

        const memoryState = this.getStateStore()[key];
        const saved = (memoryState && typeof memoryState === 'object')
            ? memoryState
            : this.readPersistedStorageState();
        if (!saved || typeof saved !== 'object') return defaultState;

        const columnSearches = {
            ...defaultState.columnSearches,
            ...(saved.columnSearches || {})
        };
        const hasValidSortField = this.columns.some(col => col.field === saved.sortField && col.sortable !== false);
        const savedHiddenColumns = Array.isArray(saved.hiddenColumns)
            ? saved.hiddenColumns.filter(f => this.columns.some(c => c.field === f))
            : defaultState.hiddenColumns;

        return {
            search: String(saved.search || ''),
            columnSearches,
            columnOrder: this.normalizeColumnOrder(saved.columnOrder || defaultState.columnOrder),
            columnWidths: this.normalizeColumnWidths({
                ...defaultState.columnWidths,
                ...(saved.columnWidths || {})
            }),
            sortField: hasValidSortField ? saved.sortField : defaultState.sortField,
            sortDirection: saved.sortDirection === 'desc' ? 'desc' : 'asc',
            hiddenColumns: savedHiddenColumns
        };
    }

    persistCurrentState() {
        if (!this.persistState) return;
        const key = this.getStateStorageKey();
        if (!key) return;
        const nextState = {
            search: this.state.search,
            columnSearches: { ...(this.state.columnSearches || {}) },
            columnOrder: Array.isArray(this.state.columnOrder) ? [...this.state.columnOrder] : [],
            columnWidths: { ...(this.state.columnWidths || {}) },
            sortField: this.state.sortField,
            sortDirection: this.state.sortDirection,
            hiddenColumns: Array.isArray(this.state.hiddenColumns) ? [...this.state.hiddenColumns] : []
        };
        this.getStateStore()[key] = nextState;
        this.writePersistedStorageState(nextState);
    }

    notifyStateChange() {
        if (this.onStateChange) {
            this.onStateChange({
                search: this.state.search,
                columnSearches: { ...(this.state.columnSearches || {}) },
                columnOrder: Array.isArray(this.state.columnOrder) ? [...this.state.columnOrder] : [],
                columnWidths: { ...(this.state.columnWidths || {}) },
                sortField: this.state.sortField,
                sortDirection: this.state.sortDirection,
                hiddenColumns: Array.isArray(this.state.hiddenColumns) ? [...this.state.hiddenColumns] : []
            }, this);
        }
    }

    setRows(rows = []) {
        this.rows = Array.isArray(rows) ? rows : [];
        this.persistCurrentState();
        this.render();
    }

    setColumns(columns = []) {
        this.columns = Array.isArray(columns) ? columns : [];
        this.state.columnSearches = Object.fromEntries(this.columns.map(col => [col.field, this.state.columnSearches[col.field] || '']));
        this.state.columnOrder = this.normalizeColumnOrder(this.state.columnOrder);
        this.state.columnWidths = this.normalizeColumnWidths({
            ...Object.fromEntries(
                this.columns
                    .map(col => [col.field, this.normalizeColumnWidth(col.width)])
                    .filter(([, width]) => width !== null)
            ),
            ...(this.state.columnWidths || {})
        });
        this.state.hiddenColumns = (this.state.hiddenColumns || []).filter(f => this.columns.some(c => c.field === f));
        if (!this.columns.some(col => col.field === this.state.sortField && col.sortable !== false)) {
            const firstSortable = this.columns.find(col => col.sortable !== false);
            this.state.sortField = firstSortable ? firstSortable.field : null;
            this.state.sortDirection = 'asc';
        }
        this.persistCurrentState();
        this.render();
    }

    getOrderedColumns() {
        const hidden = new Set(this.state?.hiddenColumns || []);
        const columnMap = new Map(this.columns.map(column => [String(column.field || ''), column]));
        return this.normalizeColumnOrder(this.state?.columnOrder || [])
            .map(field => columnMap.get(field))
            .filter(Boolean)
            .filter(col => !hidden.has(col.field));
    }

    isColumnDraggable(column) {
        return this.reorderableColumns && column?.draggable !== false;
    }

    getSortIndicator(field) {
        if (this.state.sortField !== field) return '↕';
        return this.state.sortDirection === 'asc' ? '↑' : '↓';
    }

    renderTableColgroup() {
        const orderedColumns = this.getOrderedColumns();
        return `<colgroup data-system-table-colgroup="true">
            ${orderedColumns.map(column => `
                <col data-column-key="${this.escape(column.field)}"${this.getColumnStyle(column)}>
            `).join('')}
        </colgroup>`;
    }

    getColumnStyle(column) {
        const width = this.getColumnWidth(column);
        if (!Number.isFinite(width) || width <= 0) return '';
        return ` style="width: ${width}px; min-width: ${width}px; max-width: ${width}px;"`;
    }

    getColumnWidth(column) {
        const field = String(column?.field || '');
        if (!field) return null;
        return this.normalizeColumnWidth(this.state?.columnWidths?.[field] ?? column?.width);
    }

    getResolvedTableWidth(columns = []) {
        const widths = (Array.isArray(columns) ? columns : [])
            .map(column => this.getColumnWidth(column))
            .filter(width => Number.isFinite(width) && width > 0);
        if (!widths.length) return null;
        return widths.reduce((sum, width) => sum + width, 0);
    }

    applyResolvedTableWidth(table, columns = []) {
        if (!table) return;

        const totalWidth = this.getResolvedTableWidth(columns);
        if (!Number.isFinite(totalWidth) || totalWidth <= 0) {
            table.style.removeProperty('width');
            table.style.removeProperty('min-width');
            table.style.removeProperty('max-width');
            return;
        }

        const widthValue = `${totalWidth}px`;
        table.style.width = widthValue;
        table.style.minWidth = widthValue;
        table.style.maxWidth = widthValue;
    }

    enableColumnResizing() {
        if (!this.resizableColumns || typeof makeTableColumnsResizable !== 'function') return;

        const table = document.getElementById(this.tableId);
        if (!table) return;

        makeTableColumnsResizable({
            table,
            minWidth: this.minColumnWidth,
            fixedLayout: true,
            headerSelector: 'thead tr:first-child th[data-column-key]',
            getColumnKey: (header) => header?.dataset?.columnKey || '',
            getInitialWidth: (field) => this.normalizeColumnWidth(this.state?.columnWidths?.[field]),
            onResizeEnd: (field, width) => {
                const normalizedField = String(field || '').trim();
                const normalizedWidth = this.normalizeColumnWidth(width);
                if (!normalizedField || normalizedWidth === null) return;
                this.state.columnWidths = {
                    ...(this.state.columnWidths || {}),
                    [normalizedField]: normalizedWidth
                };
                this.persistCurrentState();
                this.notifyStateChange();
            }
        });

        return this.captureRenderedColumnWidths(table);
    }

    captureRenderedColumnWidths(table) {
        if (!table) return false;

        const headers = Array.from(table.querySelectorAll('thead tr:first-child th[data-column-key]'));
        if (!headers.length) return false;

        const measuredWidths = {};
        headers.forEach((header) => {
            const field = String(header.dataset.columnKey || '').trim();
            const width = Math.round(header.getBoundingClientRect().width || 0);
            if (!field || !Number.isFinite(width) || width <= 0) return;
            measuredWidths[field] = width;
        });

        if (!Object.keys(measuredWidths).length) return false;

        const nextWidths = this.normalizeColumnWidths({
            ...measuredWidths,
            ...(this.state.columnWidths || {})
        });

        const currentSerialized = JSON.stringify(this.state.columnWidths || {});
        const nextSerialized = JSON.stringify(nextWidths);
        if (currentSerialized === nextSerialized) return false;

        this.state.columnWidths = nextWidths;
        this.persistCurrentState();
        this.notifyStateChange();
        return true;
    }

    stabilizeInitialLayoutIfNeeded(widthsCaptured) {
        if (this.isStabilizingLayout) return;

        if (widthsCaptured) {
            this.isStabilizingLayout = true;
            window.requestAnimationFrame(() => {
                this.isStabilizingLayout = false;
                this.render();
            });
            return;
        }

        // No widths captured — container may be hidden. Watch for when it becomes visible.
        if (typeof ResizeObserver === 'undefined' || !this.container) return;
        if (this.container.getBoundingClientRect().width > 0) return;

        if (this._visibilityObserver) return;
        this._visibilityObserver = new ResizeObserver(() => {
            if (!this.container || this.container.getBoundingClientRect().width <= 0) return;
            this._visibilityObserver.disconnect();
            this._visibilityObserver = null;
            this.render();
        });
        this._visibilityObserver.observe(this.container);
    }

    enableColumnReordering() {
        if (!this.reorderableColumns) return;

        const table = document.getElementById(this.tableId);
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
                const targetField = String(header.dataset.field || '').trim();
                if (!this.draggedColumnField || !targetField || this.draggedColumnField === targetField) return;
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
                const targetField = String(header.dataset.field || '').trim();
                if (!targetField || targetField === this.draggedColumnField) return;
                const rect = header.getBoundingClientRect();
                const insertBefore = event.clientX < rect.left + (rect.width / 2);
                this.moveColumn(this.draggedColumnField, targetField, insertBefore);
            });
        });
    }

    moveColumn(sourceField, targetField, insertBefore) {
        const currentOrder = this.normalizeColumnOrder(this.state?.columnOrder || []);
        const sourceIndex = currentOrder.indexOf(sourceField);
        const targetIndex = currentOrder.indexOf(targetField);
        if (sourceIndex < 0 || targetIndex < 0 || sourceField === targetField) return;

        currentOrder.splice(sourceIndex, 1);
        let destinationIndex = currentOrder.indexOf(targetField);
        if (destinationIndex < 0) return;
        if (!insertBefore) destinationIndex += 1;
        currentOrder.splice(destinationIndex, 0, sourceField);

        this.state.columnOrder = currentOrder;
        this.persistCurrentState();
        this.notifyStateChange();
        this.render();
    }

    // --- Row selection ---

    getRowId(row) {
        if (typeof this.rowId === 'function') return this.rowId(row);
        const val = row?.[this.rowId];
        return val != null ? String(val) : null;
    }

    handleRowClick(event, rowId, rowIndex) {
        if (rowId == null) return;

        if (event.shiftKey) {
            // Range selection from anchor
            this._selectRangeTo(rowId, event.ctrlKey || event.metaKey);
        } else if (event.ctrlKey || event.metaKey) {
            // Toggle individual row, update anchor
            if (this.selectedRowIds.has(rowId)) {
                this.selectedRowIds.delete(rowId);
            } else {
                this.selectedRowIds.add(rowId);
            }
            this._selectionAnchorId = rowId;
        } else {
            // Plain click — select only this row
            this.selectedRowIds = new Set([rowId]);
            this._selectionAnchorId = rowId;
        }

        if (this.onSelectionChange) this.onSelectionChange(this.getSelectedRows(), this);
        this.render();
    }

    _selectRangeTo(rowId, preserveExisting = false) {
        const ids = this.lastRenderedRows.map(r => this.getRowId(r)).filter(Boolean);
        if (!ids.length) return;

        const anchorId = this._selectionAnchorId || rowId;
        const anchorIndex = ids.indexOf(anchorId);
        const targetIndex = ids.indexOf(rowId);
        if (anchorIndex < 0 || targetIndex < 0) {
            this._selectionAnchorId = rowId;
            return;
        }

        const [start, end] = anchorIndex <= targetIndex
            ? [anchorIndex, targetIndex]
            : [targetIndex, anchorIndex];

        if (!preserveExisting) this.selectedRowIds.clear();
        ids.slice(start, end + 1).forEach(id => this.selectedRowIds.add(id));
        this._selectionAnchorId = anchorId;
    }

    selectAllRows() {
        this.lastRenderedRows.forEach(row => {
            const id = this.getRowId(row);
            if (id != null) this.selectedRowIds.add(id);
        });
        if (this.onSelectionChange) this.onSelectionChange(this.getSelectedRows(), this);
        this.render();
    }

    clearSelection() {
        this.selectedRowIds.clear();
        this._selectionAnchorId = null;
        if (this.onSelectionChange) this.onSelectionChange([], this);
        this.render();
    }

    getSelectedRows() {
        return this.lastRenderedRows.filter(row => {
            const id = this.getRowId(row);
            return id != null && this.selectedRowIds.has(id);
        });
    }

    // --- Column visibility ---

    toggleColumnVisibility(field) {
        const hidden = new Set(this.state.hiddenColumns || []);
        if (hidden.has(field)) {
            hidden.delete(field);
        } else {
            // Never hide the last visible column
            const visibleCount = this.columns.filter(c => !hidden.has(c.field)).length;
            if (visibleCount <= 1) return;
            hidden.add(field);
        }
        this.state.hiddenColumns = Array.from(hidden);
        this.persistCurrentState();
        this.notifyStateChange();

        // Re-render while preserving scroll position and keeping the column panel open
        const wasOpen = !!this.container?.querySelector('.system-table-col-vis-details')?.open;
        const scrollEl = this.container?.querySelector('.table-container');
        const scrollTop = scrollEl?.scrollTop ?? 0;
        const scrollLeft = scrollEl?.scrollLeft ?? 0;
        const pageScrollY = window.scrollY;
        const pageScrollX = window.scrollX;

        this.render();

        const newScrollEl = this.container?.querySelector('.table-container');
        if (newScrollEl) {
            newScrollEl.scrollTop = scrollTop;
            newScrollEl.scrollLeft = scrollLeft;
        }
        if (wasOpen) {
            const details = this.container?.querySelector('.system-table-col-vis-details');
            if (details) details.open = true;
        }
        // Restore page scroll — opening a <details> element can trigger scrollIntoView
        window.scrollTo({ top: pageScrollY, left: pageScrollX, behavior: 'instant' });
    }

    // --- Rendering helpers ---

    getCellValue(row, column) {
        if (typeof column.value === 'function') {
            return column.value(row);
        }
        return row?.[column.field];
    }

    getCellTextForFilter(row, column) {
        const value = this.getCellValue(row, column);
        if (value === null || value === undefined) return '';
        return String(value);
    }

    compareValues(aValue, bValue) {
        return this.textCollator.compare(String(aValue ?? ''), String(bValue ?? ''));
    }

    escape(value) {
        if (typeof escapeHtml === 'function') return escapeHtml(String(value));
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    renderTypeBadge(typeName) {
        const label = typeName || '-';
        const color = typeof getObjectTypeColor === 'function' ? getObjectTypeColor(label) : '#64748b';
        return `<span class="object-type-badge" style="background-color: ${color}">${this.highlightText(label, 'type')}</span>`;
    }

    getInputFocusDescriptor(input) {
        if (!input) return null;
        const classList = input.classList || {};
        const descriptor = {
            selectionStart: Number.isInteger(input.selectionStart) ? input.selectionStart : null,
            selectionEnd: Number.isInteger(input.selectionEnd) ? input.selectionEnd : null
        };

        if (classList.contains && classList.contains('system-table-global-search')) {
            descriptor.kind = 'global';
            return descriptor;
        }

        if (classList.contains && classList.contains('system-table-column-search')) {
            descriptor.kind = 'column';
            descriptor.field = input.dataset.field || '';
            return descriptor;
        }

        return null;
    }

    restoreInputFocus() {
        const descriptor = this.pendingFocusDescriptor;
        if (!descriptor || !this.container) return;

        let input = null;
        if (descriptor.kind === 'global') {
            input = this.container.querySelector('.system-table-global-search');
        } else if (descriptor.kind === 'column' && descriptor.field) {
            const safeField = (typeof CSS !== 'undefined' && typeof CSS.escape === 'function')
                ? CSS.escape(descriptor.field)
                : descriptor.field.replace(/["\\]/g, '\\$&');
            input = this.container.querySelector(`.system-table-column-search[data-field="${safeField}"]`);
        }

        if (!input) return;

        input.focus({ preventScroll: true });
        if (Number.isInteger(descriptor.selectionStart) && Number.isInteger(descriptor.selectionEnd)) {
            try {
                input.setSelectionRange(descriptor.selectionStart, descriptor.selectionEnd);
            } catch (_error) {
                // Best effort only.
            }
        }
    }

    getActiveSearchTerms(field) {
        const terms = [];

        const globalTerm = String(this.state.search || '').trim();
        if (globalTerm) terms.push(...globalTerm.split(/\s+/).filter(Boolean));

        const columnTerm = String(this.state.columnSearches?.[field] || '').trim();
        if (columnTerm) terms.push(...columnTerm.split(/\s+/).filter(Boolean));

        return [...new Set(terms)];
    }

    escapeRegExp(value) {
        return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    highlightText(value, field, options = {}) {
        const text = String(value ?? '');
        const escapedText = this.escape(text);
        const preserveLineBreaks = options.preserveLineBreaks === true;
        const terms = this.getActiveSearchTerms(field);
        if (!terms.length || !text) {
            return preserveLineBreaks ? escapedText.replace(/\r?\n/g, '<br>') : escapedText;
        }

        let highlighted = escapedText;
        terms.forEach(term => {
            const escapedTerm = this.escapeRegExp(term);
            if (!escapedTerm) return;
            const regex = new RegExp(`(${escapedTerm})`, 'gi');
            highlighted = highlighted.replace(regex, '<mark class="search-highlight">$1</mark>');
        });
        return preserveLineBreaks ? highlighted.replace(/\r?\n/g, '<br>') : highlighted;
    }

    renderCell(row, column) {
        if (typeof column.render === 'function') {
            return column.render(row, this);
        }

        const value = this.getCellValue(row, column);
        if (column.badge === 'type') {
            return this.renderTypeBadge(String(value || '-'));
        }

        if (value === null || value === undefined || value === '') return '-';

        const isRichtext = column.fieldType === 'richtext' || column.field_type === 'richtext';
        if (isRichtext && typeof value === 'string') {
            let html = value;
            if (!/<\s*[a-z][^>]*>/i.test(html) && /&lt;\s*[a-z][^&]*&gt;/i.test(html)) {
                const decoder = document.createElement('textarea');
                decoder.innerHTML = html;
                html = decoder.value || '';
            }
            if (typeof stripHtmlTags === 'function') {
                return stripHtmlTags(html).trim() || '-';
            }
            return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() || '-';
        }

        const isTextareaColumn = column.multiline === true
            || column.fieldType === 'textarea'
            || column.field_type === 'textarea';
        return this.highlightText(value, column.field, { preserveLineBreaks: isTextareaColumn });
    }

    filteredRows() {
        const globalTerm = this.state.search.trim().toLowerCase();
        let items = [...this.rows];
        const activeColumns = this.getOrderedColumns();

        if (globalTerm) {
            items = items.filter(row => activeColumns.some(column => {
                if (column.searchable === false) return false;
                return this.getCellTextForFilter(row, column).toLowerCase().includes(globalTerm);
            }));
        }

        if (this.columnSearch) {
            Object.entries(this.state.columnSearches).forEach(([field, term]) => {
                const normalized = String(term || '').trim().toLowerCase();
                if (!normalized) return;
                const column = activeColumns.find(col => col.field === field);
                if (!column || column.searchable === false) return;

                items = items.filter(row => this.getCellTextForFilter(row, column).toLowerCase().includes(normalized));
            });
        }

        if (this.state.sortField) {
            const sortColumn = activeColumns.find(col => col.field === this.state.sortField);
            if (sortColumn && sortColumn.sortable !== false) {
                const direction = this.state.sortDirection === 'asc' ? 1 : -1;
                items.sort((a, b) => {
                    const aValue = this.getCellTextForFilter(a, sortColumn);
                    const bValue = this.getCellTextForFilter(b, sortColumn);
                    return this.compareValues(aValue, bValue) * direction;
                });
            }
        }

        return items;
    }

    resolveRows() {
        if (this.getRows) {
            const rows = this.getRows(this);
            return Array.isArray(rows) ? rows : [];
        }
        return this.filteredRows();
    }

    renderHeader(selectedCount) {
        const showSearch = this.globalSearch;
        const hasBatch = this.selectable && selectedCount > 0;
        const hasColVis = this.columnVisibility && this.columns.length > 1;
        if (!showSearch && !hasBatch && !hasColVis) return '';

        const searchHtml = showSearch ? `
            <input type="text" class="system-table-global-search system-table-search-input" placeholder="Sök..." value="${this.escape(this.state.search)}">
        ` : '';

        const batchHtml = hasBatch ? `
            <span class="system-table-batch-count">${selectedCount} rad${selectedCount !== 1 ? 'er' : ''} markerad${selectedCount !== 1 ? 'e' : ''}</span>
            ${this.batchActions.map((action, i) => `
                <button class="system-table-batch-action" data-batch-index="${i}">${this.escape(action.label || '')}</button>
            `).join('')}
            <button class="system-table-batch-clear">Avmarkera</button>
        ` : '';

        const hidden = new Set(this.state.hiddenColumns || []);
        const colVisHtml = hasColVis ? `
            <details class="system-table-col-vis-details">
                <summary class="system-table-col-vis-btn">Kolumner</summary>
                <div class="system-table-col-vis-panel">
                    ${this.columns.map(col => `
                        <label class="system-table-col-vis-item">
                            <input type="checkbox" class="system-table-col-vis-toggle" data-field="${this.escape(col.field)}" ${hidden.has(col.field) ? '' : 'checked'}>
                            ${this.escape(col.label || col.field)}
                        </label>
                    `).join('')}
                </div>
            </details>
        ` : '';

        return `
            <div class="system-table-header">
                ${searchHtml}${batchHtml}
                <div class="system-table-header-end">${colVisHtml}</div>
            </div>
        `;
    }

    bindEvents() {
        const container = this.container;
        if (!container) return;

        const globalSearchInput = container.querySelector('.system-table-global-search');
        if (globalSearchInput) {
            const debouncedGlobalSearch = (typeof debounce === 'function')
                ? debounce((value) => {
                    this.state.search = value;
                    this.persistCurrentState();
                    this.notifyStateChange();
                    this.render();
                }, this.searchDebounceMs)
                : ((value) => {
                    this.state.search = value;
                    this.persistCurrentState();
                    this.notifyStateChange();
                    this.render();
                });

            globalSearchInput.addEventListener('input', (event) => {
                this.pendingFocusDescriptor = this.getInputFocusDescriptor(event.target);
                debouncedGlobalSearch(event.target.value);
            });
        }

        container.querySelectorAll('th[data-sortable="true"]').forEach(header => {
            header.addEventListener('click', () => {
                const field = header.dataset.field;
                if (!field) return;

                if (this.state.sortField === field) {
                    this.state.sortDirection = this.state.sortDirection === 'asc' ? 'desc' : 'asc';
                } else {
                    this.state.sortField = field;
                    this.state.sortDirection = 'asc';
                }
                this.persistCurrentState();
                this.notifyStateChange();
                this.render();
            });
        });

        container.querySelectorAll('.system-table-column-search').forEach(input => {
            const field = input.dataset.field;
            if (!field) return;

            if (input.type === 'checkbox') {
                input.addEventListener('change', (event) => {
                    this.pendingFocusDescriptor = this.getInputFocusDescriptor(event.target);
                    this.state.columnSearches[field] = event.target.checked ? '1' : '';
                    this.persistCurrentState();
                    this.notifyStateChange();
                    this.render();
                });
                return;
            }

            const debouncedColumnSearch = (typeof debounce === 'function')
                ? debounce((value) => {
                    this.state.columnSearches[field] = value;
                    this.persistCurrentState();
                    this.notifyStateChange();
                    this.render();
                }, this.searchDebounceMs)
                : ((value) => {
                    this.state.columnSearches[field] = value;
                    this.persistCurrentState();
                    this.notifyStateChange();
                    this.render();
                });

            input.addEventListener('input', (event) => {
                this.pendingFocusDescriptor = this.getInputFocusDescriptor(event.target);
                debouncedColumnSearch(event.target.value);
            });
        });

        if (this.onRowClick) {
            container.querySelectorAll('tbody tr[data-row-index]').forEach(rowEl => {
                rowEl.addEventListener('click', () => {
                    const index = Number(rowEl.dataset.rowIndex);
                    if (!Number.isFinite(index)) return;
                    this.onRowClick(this.lastRenderedRows[index], rowEl);
                });
            });
        }

        // Row selection via click modifiers (Ctrl/Meta = toggle, Shift = range, plain = single)
        if (this.selectable) {
            container.querySelectorAll('tbody tr[data-row-id]').forEach(rowEl => {
                rowEl.addEventListener('mousedown', (event) => {
                    if (event.shiftKey || event.ctrlKey || event.metaKey) {
                        event.preventDefault();
                    }
                });
                rowEl.addEventListener('click', (event) => {
                    const rowId = rowEl.dataset.rowId;
                    const rowIndex = Number(rowEl.dataset.rowIndex);
                    this.handleRowClick(event, rowId, rowIndex);
                });
            });

            // Batch actions
            container.querySelectorAll('.system-table-batch-action').forEach(btn => {
                btn.addEventListener('click', () => {
                    const index = Number(btn.dataset.batchIndex);
                    const action = this.batchActions[index];
                    if (action && typeof action.action === 'function') {
                        action.action(this.getSelectedRows(), this);
                    }
                });
            });

            const batchClearBtn = container.querySelector('.system-table-batch-clear');
            if (batchClearBtn) {
                batchClearBtn.addEventListener('click', () => this.clearSelection());
            }
        }

        // Column visibility toggles
        if (this.columnVisibility) {
            container.querySelectorAll('.system-table-col-vis-toggle').forEach(cb => {
                cb.addEventListener('change', () => {
                    this.toggleColumnVisibility(cb.dataset.field);
                });
            });

            // Close col-vis panel when clicking outside it
            const details = container.querySelector('.system-table-col-vis-details');
            if (details && !details._outsideClickBound) {
                details._outsideClickBound = true;
                document.addEventListener('click', function closeOnOutside(e) {
                    if (!details.isConnected) {
                        document.removeEventListener('click', closeOnOutside);
                        return;
                    }
                    if (details.open && !details.contains(e.target)) {
                        details.open = false;
                    }
                });
            }
        }
    }

    render() {
        if (!this.container) return;

        if (this._visibilityObserver) {
            this._visibilityObserver.disconnect();
            this._visibilityObserver = null;
        }

        if (!this.pendingFocusDescriptor) {
            const activeElement = document.activeElement;
            if (activeElement && this.container.contains(activeElement)) {
                this.pendingFocusDescriptor = this.getInputFocusDescriptor(activeElement);
            }
        }

        const rows = this.resolveRows();
        this.lastRenderedRows = rows;
        const orderedColumns = this.getOrderedColumns();
        const selectedCount = this.selectedRowIds.size;

        const headerHtml = this.renderHeader(selectedCount);

        const headHtml = orderedColumns.map(column => {
            const className = column.className || 'col-default';
            const headerClasses = ['resizable-column', this.isColumnDraggable(column) ? 'draggable-column' : '', className].filter(Boolean).join(' ');
            const width = this.getColumnWidth(column);
            const styles = [];
            const draggableAttr = this.isColumnDraggable(column) ? ' data-draggable-column="true" draggable="true"' : '';
            if (Number.isFinite(width) && width > 0) {
                styles.push(`width: ${width}px`, `min-width: ${width}px`, `max-width: ${width}px`);
            }
            if (column.sortable === false) {
                const styleAttr = styles.length ? ` style="${styles.join('; ')}"` : '';
                return `<th class="${this.escape(headerClasses)}" data-field="${this.escape(column.field)}" data-column-key="${this.escape(column.field)}"${draggableAttr}${styleAttr}>${this.escape(column.label || '')}</th>`;
            }
            styles.push('cursor: pointer');
            return `<th class="${this.escape(headerClasses)}" data-sortable="true" data-field="${this.escape(column.field)}" data-column-key="${this.escape(column.field)}"${draggableAttr} style="${styles.join('; ')}">${this.escape(column.label || '')} <span class="sort-indicator">${this.getSortIndicator(column.field)}</span></th>`;
        }).join('');

        const columnSearchHtml = this.columnSearch ? `
            <tr class="column-search-row">
                ${orderedColumns.map(column => {
                    const className = column.className || 'col-default';
                    if (column.searchable === false) {
                        return `<th class="${className}"></th>`;
                    }
                    if (column.searchType === 'checkbox') {
                        const checked = this.state.columnSearches[column.field] === '1' ? 'checked' : '';
                        return `<th class="${className}"><input type="checkbox" class="column-search-input system-table-column-search" data-field="${this.escape(column.field)}" ${checked}></th>`;
                    }
                    return `<th class="${className}"><input type="text" class="column-search-input system-table-column-search" data-field="${this.escape(column.field)}" placeholder="${this.escape(column.searchPlaceholder || 'Sök...')}" value="${this.escape(this.state.columnSearches[column.field] || '')}"></th>`;
                }).join('')}
            </tr>
        ` : '';

        const rowsHtml = rows.length
            ? rows.map((row, index) => {
                const rowId = this.getRowId(row);
                const isSelected = this.selectable && rowId != null && this.selectedRowIds.has(rowId);
                const selectedClass = isSelected ? ' system-table-row-selected' : '';
                const selectableAttr = this.selectable
                    ? ` data-row-id="${this.escape(rowId || '')}" data-row-index="${index}" style="cursor:pointer;user-select:none;"`
                    : '';

                if (this.renderRow) {
                    return this.renderRow(row, index, this);
                }

                return `
                    <tr data-row-index="${index}"${selectableAttr} class="${this.escape(this.rowClassName)}${selectedClass}">
                        ${orderedColumns.map(column => {
                            const cellContent = this.renderCell(row, column);
                            const isRichtext = column.fieldType === 'richtext' || column.field_type === 'richtext';
                            const rawValue = this.getCellValue(row, column);
                            const plainText = isRichtext && typeof rawValue === 'string'
                                ? (typeof stripHtmlTags === 'function' ? stripHtmlTags(rawValue) : rawValue)
                                : this.getCellTextForFilter(row, column);
                            const wrapClass = isRichtext ? 'td-cell-content td-cell-richtext' : 'td-cell-content';
                            return `<td class="${column.className || 'col-default'}" data-column-key="${this.escape(column.field)}" title="${this.escape(plainText)}"><div class="${wrapClass}">${cellContent}</div></td>`;
                        }).join('')}
                    </tr>
                `;
            }).join('')
            : `<tr><td colspan="${orderedColumns.length}" class="empty-state">${this.escape(this.emptyText)}</td></tr>`;

        const containerClasses = ['table-container', this.containerClassName].filter(Boolean).join(' ');
        const tableClasses = ['data-table', this.tableClassName].filter(Boolean).join(' ');

        this.container.innerHTML = `
            ${headerHtml}
            <div class="${this.escape(containerClasses)}">
                <table id="${this.escape(this.tableId)}" class="${this.escape(tableClasses)}">
                    ${this.renderTableColgroup()}
                    <thead>
                        <tr>${headHtml}</tr>
                        ${columnSearchHtml}
                    </thead>
                    <tbody>${rowsHtml}</tbody>
                </table>
            </div>
        `;

        const table = document.getElementById(this.tableId);
        this.applyResolvedTableWidth(table, orderedColumns);

        this.bindEvents();
        const widthsCaptured = this.enableColumnResizing();
        this.enableColumnReordering();
        this.restoreInputFocus();
        this.pendingFocusDescriptor = null;
        if (this.onRender) this.onRender(this, rows);
        this.stabilizeInitialLayoutIfNeeded(widthsCaptured);
    }
}

window.SystemTable = SystemTable;
