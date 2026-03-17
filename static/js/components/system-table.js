/**
 * SystemTable
 * Reusable table with global search, column search, and sortable columns.
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
            sortDirection: 'asc'
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
            sortDirection: overrideState.sortDirection === 'desc' ? 'desc' : baseState.sortDirection
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

        return {
            search: String(saved.search || ''),
            columnSearches,
            columnOrder: this.normalizeColumnOrder(saved.columnOrder || defaultState.columnOrder),
            columnWidths: this.normalizeColumnWidths({
                ...defaultState.columnWidths,
                ...(saved.columnWidths || {})
            }),
            sortField: hasValidSortField ? saved.sortField : defaultState.sortField,
            sortDirection: saved.sortDirection === 'desc' ? 'desc' : 'asc'
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
            sortDirection: this.state.sortDirection
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
                sortDirection: this.state.sortDirection
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
        if (!this.columns.some(col => col.field === this.state.sortField && col.sortable !== false)) {
            const firstSortable = this.columns.find(col => col.sortable !== false);
            this.state.sortField = firstSortable ? firstSortable.field : null;
            this.state.sortDirection = 'asc';
        }
        this.persistCurrentState();
        this.render();
    }

    getOrderedColumns() {
        const columnMap = new Map(this.columns.map(column => [String(column.field || ''), column]));
        return this.normalizeColumnOrder(this.state?.columnOrder || []).map(field => columnMap.get(field)).filter(Boolean);
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
        if (!widthsCaptured || this.isStabilizingLayout) return;

        this.isStabilizingLayout = true;
        window.requestAnimationFrame(() => {
            this.isStabilizingLayout = false;
            this.render();
        });
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
    }

    render() {
        if (!this.container) return;

        if (!this.pendingFocusDescriptor) {
            const activeElement = document.activeElement;
            if (activeElement && this.container.contains(activeElement)) {
                this.pendingFocusDescriptor = this.getInputFocusDescriptor(activeElement);
            }
        }

        const rows = this.resolveRows();
        this.lastRenderedRows = rows;
        const orderedColumns = this.getOrderedColumns();

        const filtersHtml = this.globalSearch ? `
            <div class="filters">
                <input type="text" class="search-input system-table-global-search" placeholder="Sök..." value="${this.escape(this.state.search)}">
            </div>
        ` : '';

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
                if (this.renderRow) {
                    return this.renderRow(row, index, this);
                }
                return `
                    <tr data-row-index="${index}" class="${this.escape(this.rowClassName)}">
                        ${orderedColumns.map(column => `<td class="${column.className || 'col-default'}" data-column-key="${this.escape(column.field)}">${this.renderCell(row, column)}</td>`).join('')}
                    </tr>
                `;
            }).join('')
            : `<tr><td colspan="${orderedColumns.length}" class="empty-state">${this.escape(this.emptyText)}</td></tr>`;

        const containerClasses = ['table-container', this.containerClassName].filter(Boolean).join(' ');
        const tableClasses = ['data-table', this.tableClassName].filter(Boolean).join(' ');

        this.container.innerHTML = `
            ${filtersHtml}
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
