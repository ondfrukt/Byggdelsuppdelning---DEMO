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
        this.tableId = options.tableId || `system-table-${this.containerId}`;
        this.emptyText = options.emptyText || 'Inga rader hittades';
        this.globalSearch = options.globalSearch !== false;
        this.columnSearch = options.columnSearch !== false;
        this.searchDebounceMs = Number.isFinite(options.searchDebounceMs) ? options.searchDebounceMs : 280;
        this.rowClassName = options.rowClassName || '';
        this.onRowClick = typeof options.onRowClick === 'function' ? options.onRowClick : null;
        this.onRender = typeof options.onRender === 'function' ? options.onRender : null;
        this.pendingFocusDescriptor = null;

        const firstSortable = this.columns.find(col => col.sortable !== false);
        this.state = {
            search: '',
            columnSearches: Object.fromEntries(this.columns.map(col => [col.field, ''])),
            sortField: firstSortable ? firstSortable.field : null,
            sortDirection: 'asc'
        };
    }

    setRows(rows = []) {
        this.rows = Array.isArray(rows) ? rows : [];
        this.render();
    }

    setColumns(columns = []) {
        this.columns = Array.isArray(columns) ? columns : [];
        this.state.columnSearches = Object.fromEntries(this.columns.map(col => [col.field, this.state.columnSearches[col.field] || '']));
        if (!this.columns.some(col => col.field === this.state.sortField && col.sortable !== false)) {
            const firstSortable = this.columns.find(col => col.sortable !== false);
            this.state.sortField = firstSortable ? firstSortable.field : null;
            this.state.sortDirection = 'asc';
        }
        this.render();
    }

    getSortIndicator(field) {
        if (this.state.sortField !== field) return '↕';
        return this.state.sortDirection === 'asc' ? '↑' : '↓';
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

    highlightText(value, field) {
        const text = String(value ?? '');
        const escapedText = this.escape(text);
        const terms = this.getActiveSearchTerms(field);
        if (!terms.length || !text) return escapedText;

        let highlighted = escapedText;
        terms.forEach(term => {
            const escapedTerm = this.escapeRegExp(term);
            if (!escapedTerm) return;
            const regex = new RegExp(`(${escapedTerm})`, 'gi');
            highlighted = highlighted.replace(regex, '<mark class="search-highlight">$1</mark>');
        });
        return highlighted;
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
        return this.highlightText(value, column.field);
    }

    filteredRows() {
        const globalTerm = this.state.search.trim().toLowerCase();
        let items = [...this.rows];

        if (globalTerm) {
            items = items.filter(row => this.columns.some(column => {
                if (column.searchable === false) return false;
                return this.getCellTextForFilter(row, column).toLowerCase().includes(globalTerm);
            }));
        }

        if (this.columnSearch) {
            Object.entries(this.state.columnSearches).forEach(([field, term]) => {
                const normalized = String(term || '').trim().toLowerCase();
                if (!normalized) return;
                const column = this.columns.find(col => col.field === field);
                if (!column || column.searchable === false) return;

                items = items.filter(row => this.getCellTextForFilter(row, column).toLowerCase().includes(normalized));
            });
        }

        if (this.state.sortField) {
            const sortColumn = this.columns.find(col => col.field === this.state.sortField);
            if (sortColumn && sortColumn.sortable !== false) {
                const direction = this.state.sortDirection === 'asc' ? 1 : -1;
                items.sort((a, b) => {
                    const aValue = this.getCellTextForFilter(a, sortColumn);
                    const bValue = this.getCellTextForFilter(b, sortColumn);
                    return aValue.localeCompare(bValue, 'sv', { sensitivity: 'base' }) * direction;
                });
            }
        }

        return items;
    }

    bindEvents() {
        const container = this.container;
        if (!container) return;

        const globalSearchInput = container.querySelector('.system-table-global-search');
        if (globalSearchInput) {
            const debouncedGlobalSearch = (typeof debounce === 'function')
                ? debounce((value) => {
                    this.state.search = value;
                    this.render();
                }, this.searchDebounceMs)
                : ((value) => {
                    this.state.search = value;
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
                this.render();
            });
        });

        container.querySelectorAll('.system-table-column-search').forEach(input => {
            const field = input.dataset.field;
            const debouncedColumnSearch = (typeof debounce === 'function')
                ? debounce((value) => {
                    this.state.columnSearches[field] = value;
                    this.render();
                }, this.searchDebounceMs)
                : ((value) => {
                    this.state.columnSearches[field] = value;
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
                    const rows = this.filteredRows();
                    this.onRowClick(rows[index], rowEl);
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

        const rows = this.filteredRows();

        const filtersHtml = this.globalSearch ? `
            <div class="filters">
                <input type="text" class="search-input system-table-global-search" placeholder="Sök..." value="${this.escape(this.state.search)}">
            </div>
        ` : '';

        const headHtml = this.columns.map(column => {
            const className = column.className || 'col-default';
            if (column.sortable === false) {
                return `<th class="${className}">${this.escape(column.label || '')}</th>`;
            }
            return `<th class="${className}" data-sortable="true" data-field="${this.escape(column.field)}" style="cursor: pointer;">${this.escape(column.label || '')} <span class="sort-indicator">${this.getSortIndicator(column.field)}</span></th>`;
        }).join('');

        const columnSearchHtml = this.columnSearch ? `
            <tr class="column-search-row">
                ${this.columns.map(column => {
                    const className = column.className || 'col-default';
                    if (column.searchable === false) {
                        return `<th class="${className}"></th>`;
                    }
                    return `<th class="${className}"><input type="text" class="column-search-input system-table-column-search" data-field="${this.escape(column.field)}" placeholder="Sök..." value="${this.escape(this.state.columnSearches[column.field] || '')}"></th>`;
                }).join('')}
            </tr>
        ` : '';

        const rowsHtml = rows.length
            ? rows.map((row, index) => `
                <tr data-row-index="${index}" class="${this.escape(this.rowClassName)}">
                    ${this.columns.map(column => `<td class="${column.className || 'col-default'}">${this.renderCell(row, column)}</td>`).join('')}
                </tr>
            `).join('')
            : `<tr><td colspan="${this.columns.length}" class="empty-state">${this.escape(this.emptyText)}</td></tr>`;

        this.container.innerHTML = `
            ${filtersHtml}
            <div class="table-container">
                <table id="${this.escape(this.tableId)}" class="data-table">
                    <thead>
                        <tr>${headHtml}</tr>
                        ${columnSearchHtml}
                    </thead>
                    <tbody>${rowsHtml}</tbody>
                </table>
            </div>
        `;

        this.bindEvents();
        this.restoreInputFocus();
        this.pendingFocusDescriptor = null;
        if (this.onRender) this.onRender(this, rows);
    }
}

window.SystemTable = SystemTable;
