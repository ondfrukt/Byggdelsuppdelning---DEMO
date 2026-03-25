/**
 * TreeTable
 * Hierarchical table built on SystemTable.
 * Data: array of objects with nested children arrays.
 * Expand/collapse via toggle clicks. Search filters matching tree paths.
 */
class TreeTable {
    constructor(options = {}) {
        this.containerId = options.containerId;
        this.tableId = options.tableId || `tree-table-${options.containerId}`;
        this.columns = Array.isArray(options.columns) ? options.columns : [];
        this.rows = Array.isArray(options.rows) ? options.rows : [];
        this.nodeId = options.nodeId || 'id';
        this.nodeChildren = options.nodeChildren || 'children';
        this.nameField = options.nameField || (this.columns[0]?.field) || 'name';
        this.emptyText = options.emptyText || 'Inga rader hittades';
        this.indentPx = Number.isFinite(options.indentPx) ? options.indentPx : 16;
        this.expandedNodes = new Set();
        this.systemTable = null;
        this._options = options;

        // Expand first level by default
        if (options.defaultExpanded !== false) {
            this.rows.forEach(node => {
                const id = this._getNodeId(node);
                if (id && this._getChildren(node).length > 0) {
                    this.expandedNodes.add(id);
                }
            });
        }
    }

    // --- Node helpers ---

    _getNodeId(node) {
        const val = node?.[this.nodeId];
        return val != null ? String(val) : null;
    }

    _getChildren(node) {
        return Array.isArray(node?.[this.nodeChildren]) ? node[this.nodeChildren] : [];
    }

    // --- Search ---

    _hasActiveSearch(table) {
        if (String(table?.state?.search || '').trim()) return true;
        return Object.values(table?.state?.columnSearches || {}).some(v => String(v || '').trim());
    }

    _nodeMatchesTable(node, table) {
        const globalTerm = String(table?.state?.search || '').trim().toLowerCase();
        const globalTerms = globalTerm ? globalTerm.split(/\s+/).filter(Boolean) : [];

        if (globalTerms.length > 0) {
            const matchesGlobal = globalTerms.every(term =>
                this.columns.some(col => {
                    const val = typeof col.value === 'function' ? col.value(node) : node?.[col.field];
                    return val != null && String(val).toLowerCase().includes(term);
                })
            );
            if (!matchesGlobal) return false;
        }

        const columnSearches = table?.state?.columnSearches || {};
        for (const col of this.columns) {
            const term = String(columnSearches[col.field] || '').trim().toLowerCase();
            if (!term) continue;
            const val = typeof col.value === 'function' ? col.value(node) : node?.[col.field];
            if (val == null || !String(val).toLowerCase().includes(term)) return false;
        }

        return true;
    }

    _treeHasMatch(node, table) {
        if (this._nodeMatchesTable(node, table)) return true;
        return this._getChildren(node).some(child => this._treeHasMatch(child, table));
    }

    // --- Flattening ---

    _flattenNode(node, level, rows, table) {
        const hasSearch = this._hasActiveSearch(table);
        if (hasSearch && !this._treeHasMatch(node, table)) return;

        const children = this._getChildren(node);
        const hasChildren = children.length > 0;
        const nodeId = this._getNodeId(node);
        const isExpanded = hasSearch || (nodeId != null && this.expandedNodes.has(nodeId));

        rows.push({
            _node: node,
            _level: level,
            _hasChildren: hasChildren,
            _isExpanded: hasChildren && isExpanded,
            _nodeId: nodeId
        });

        if (hasChildren && isExpanded) {
            children.forEach(child => this._flattenNode(child, level + 1, rows, table));
        }
    }

    _getRows(table) {
        const rows = [];
        this.rows.forEach(node => this._flattenNode(node, 0, rows, table));
        return rows;
    }

    // --- Row rendering ---

    _renderRow(row, index, table) {
        const { _node, _level, _hasChildren, _isExpanded, _nodeId } = row;
        const indent = _level * this.indentPx;

        const toggle = _hasChildren
            ? `<span class="tree-toggle ${_isExpanded ? 'expanded' : ''}" data-toggle-node="${table.escape(_nodeId || '')}">❯</span>`
            : '<span class="tree-spacer"></span>';

        const rowId = table.selectable ? table.getRowId(row) : null;
        const isSelected = rowId != null && table.selectedRowIds.has(rowId);
        const selectedClass = isSelected ? ' system-table-row-selected' : '';
        const selectableAttr = rowId != null
            ? ` data-row-id="${table.escape(String(rowId))}" data-row-index="${index}" style="cursor:pointer;user-select:none;"`
            : '';

        const rowClasses = ['tree-node', _hasChildren ? 'has-children' : ''].filter(Boolean).join(' ');

        const cells = table.getOrderedColumns().map(column => {
            const className = column.className || 'col-default';
            const width = table.getColumnWidth(column);
            const styleAttr = width ? ` style="width:${width}px;min-width:${width}px;max-width:${width}px;"` : '';

            const colKey = ` data-column-key="${table.escape(column.field)}"`;

            if (column.field === this.nameField) {
                const label = typeof column.render === 'function'
                    ? column.render(_node, table)
                    : `<span class="tree-label">${table.highlightText(String(_node?.[column.field] ?? ''), column.field)}</span>`;
                return `<td class="${className}"${styleAttr}${colKey}><div class="tree-cell-content" style="padding-left:${indent}px">${toggle}${label}</div></td>`;
            }

            let value;
            if (typeof column.render === 'function') {
                value = column.render(_node, table);
            } else {
                const raw = typeof column.value === 'function' ? column.value(_node) : _node?.[column.field];
                value = raw != null && raw !== '' ? table.highlightText(String(raw), column.field) : '-';
            }

            return `<td class="${className}"${styleAttr}${colKey}>${value}</td>`;
        }).join('');

        return `<tr class="${rowClasses}${selectedClass}" data-row-index="${index}"${selectableAttr} data-node-id="${table.escape(_nodeId || '')}" data-tree-level="${_level}">${cells}</tr>`;
    }

    // --- Expand / collapse ---

    toggleNode(nodeId) {
        if (this.expandedNodes.has(nodeId)) {
            this.expandedNodes.delete(nodeId);
        } else {
            this.expandedNodes.add(nodeId);
        }
        this._renderPreservingScroll();
    }

    /** Collapse all direct children of a node (one level below). */
    collapseChildren(nodeId) {
        const node = this._findNode(this.rows, String(nodeId));
        if (!node) return;
        let changed = false;
        this._getChildren(node).forEach(child => {
            const childId = this._getNodeId(child);
            if (childId && this.expandedNodes.has(childId)) {
                this.expandedNodes.delete(childId);
                changed = true;
            }
        });
        if (changed) this._renderPreservingScroll();
    }

    _renderPreservingScroll() {
        const container = document.getElementById(this.containerId);
        const scrollEl = container?.querySelector('.table-container');
        const scrollTop = scrollEl?.scrollTop ?? 0;
        const scrollLeft = scrollEl?.scrollLeft ?? 0;
        this.systemTable?.render();
        const newScrollEl = document.getElementById(this.containerId)?.querySelector('.table-container');
        if (newScrollEl) {
            newScrollEl.scrollTop = scrollTop;
            newScrollEl.scrollLeft = scrollLeft;
        }
    }

    _findNode(nodes, targetId) {
        for (const node of nodes) {
            if (this._getNodeId(node) === targetId) return node;
            const found = this._findNode(this._getChildren(node), targetId);
            if (found) return found;
        }
        return null;
    }

    expandAll() {
        const addAll = (nodes) => {
            nodes.forEach(node => {
                const id = this._getNodeId(node);
                const children = this._getChildren(node);
                if (id && children.length > 0) {
                    this.expandedNodes.add(id);
                    addAll(children);
                }
            });
        };
        addAll(this.rows);
        this.systemTable?.render();
    }

    collapseAll() {
        this.expandedNodes.clear();
        this.systemTable?.render();
    }

    // --- Public API ---

    setRows(rows) {
        this.rows = Array.isArray(rows) ? rows : [];
        this.systemTable?.render();
    }

    getSystemTable() {
        return this.systemTable;
    }

    // --- Render ---

    render() {
        const opts = this._options;

        this.systemTable = new SystemTable({
            containerId: this.containerId,
            tableId: this.tableId,
            columns: this.columns,
            rows: [],
            getRows: (table) => this._getRows(table),
            renderRow: (row, index, table) => this._renderRow(row, index, table),
            emptyText: this.emptyText,
            globalSearch: opts.globalSearch !== false,
            columnSearch: opts.columnSearch !== false,
            columnVisibility: opts.columnVisibility !== false,
            selectable: opts.selectable,
            rowId: opts.rowId || this.nodeId,
            batchActions: opts.batchActions,
            onSelectionChange: opts.onSelectionChange,
            tableClassName: ['tree-table', opts.tableClassName].filter(Boolean).join(' '),
            containerClassName: ['tree-table-container', opts.containerClassName].filter(Boolean).join(' '),
            persistState: opts.persistState !== false,
            resizableColumns: opts.resizableColumns !== false,
            reorderableColumns: opts.reorderableColumns !== false,
            onRender: (table) => {
                this._bindToggleEvents();
                if (typeof opts.onRender === 'function') opts.onRender(table, this);
            },
            onStateChange: opts.onStateChange,
        });

        this.systemTable.render();
    }

    _bindToggleEvents() {
        const container = document.getElementById(this.containerId);
        if (!container) return;

        // Toggle arrow: immediate toggle, no delay
        container.querySelectorAll('.tree-toggle[data-toggle-node]').forEach(toggle => {
            toggle.addEventListener('click', (event) => {
                event.stopPropagation();
                const nodeId = toggle.dataset.toggleNode;
                if (nodeId) this.toggleNode(nodeId);
            });
        });

        // Name cell on has-children rows:
        //   single click  → toggle expand/collapse (debounced 220 ms to yield to dblclick)
        //   double click  → collapse all direct children one level below
        container.querySelectorAll('tbody tr.has-children').forEach(row => {
            const nameCell = row.querySelector(`td[data-column-key="${this.nameField}"]`);
            if (!nameCell) return;
            nameCell.style.cursor = 'pointer';

            let clickTimer = null;

            nameCell.addEventListener('click', (event) => {
                if (event.ctrlKey || event.metaKey || event.shiftKey) return;
                clearTimeout(clickTimer);
                clickTimer = setTimeout(() => {
                    const nodeId = row.dataset.nodeId;
                    if (nodeId) this.toggleNode(nodeId);
                }, 220);
            });

            nameCell.addEventListener('dblclick', (event) => {
                if (event.ctrlKey || event.metaKey || event.shiftKey) return;
                clearTimeout(clickTimer);
                const nodeId = row.dataset.nodeId;
                if (nodeId) this.collapseChildren(nodeId);
            });
        });
    }
}

window.TreeTable = TreeTable;
