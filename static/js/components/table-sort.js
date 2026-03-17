/**
 * TableSort Component
 * Makes tables sortable by clicking column headers
 */

class TableSort {
    constructor(tableId) {
        this.table = document.getElementById(tableId);
        this.sortColumn = null;
        this.sortDirection = 'asc';
        this.onSortChange = null;
        this.textCollator = new Intl.Collator('sv', {
            sensitivity: 'base',
            numeric: true,
            ignorePunctuation: true
        });
        
        if (this.table) {
            this.initialize();
        }
    }

    setState(state = {}) {
        const nextColumn = Number(state.sortColumn);
        this.sortColumn = Number.isFinite(nextColumn) ? nextColumn : null;
        this.sortDirection = state.sortDirection === 'desc' ? 'desc' : 'asc';
        this.updateSortIndicators(
            Number.isFinite(this.sortColumn)
                ? this.table?.querySelectorAll('th[data-sortable]')?.[this.sortColumn] || null
                : null
        );
    }

    applyCurrentSort() {
        if (!this.table || !Number.isFinite(this.sortColumn)) return;
        const header = this.table.querySelectorAll('th[data-sortable]')[this.sortColumn];
        if (!header) return;

        const tbody = this.table.querySelector('tbody');
        if (!tbody) return;

        const rows = Array.from(tbody.querySelectorAll('tr'));
        const sortType = header.dataset.sortType || 'text';

        rows.sort((a, b) => {
            const aCell = a.cells[this.sortColumn];
            const bCell = b.cells[this.sortColumn];

            if (!aCell || !bCell) return 0;

            let aValue = aCell.textContent.trim();
            let bValue = bCell.textContent.trim();

            if (Object.prototype.hasOwnProperty.call(aCell.dataset, 'value')) aValue = aCell.dataset.value;
            if (Object.prototype.hasOwnProperty.call(bCell.dataset, 'value')) bValue = bCell.dataset.value;

            let comparison = 0;
            if (sortType === 'number') {
                comparison = this.parseNumber(aValue) - this.parseNumber(bValue);
            } else if (sortType === 'date') {
                const aDate = this.parseDate(aValue);
                const bDate = this.parseDate(bValue);
                comparison = Number.isFinite(aDate) && Number.isFinite(bDate)
                    ? aDate - bDate
                    : this.compareText(aValue, bValue);
            } else {
                comparison = this.compareText(aValue, bValue);
            }

            return this.sortDirection === 'asc' ? comparison : -comparison;
        });

        rows.forEach(row => tbody.appendChild(row));
        this.updateSortIndicators(header);
    }
    
    initialize() {
        const headers = this.table.querySelectorAll('th[data-sortable]');
        
        headers.forEach((header) => {
            header.style.cursor = 'pointer';
            header.style.userSelect = 'none';
            
            // Add sort indicator
            const indicator = document.createElement('span');
            indicator.className = 'sort-indicator';
            indicator.innerHTML = '↕';
            header.appendChild(indicator);
            
            header.addEventListener('click', (event) => {
                if (event.target?.closest?.('.column-resize-handle')) {
                    return;
                }
                if (header.dataset.suppressResizeClick === 'true') {
                    delete header.dataset.suppressResizeClick;
                    event.preventDefault();
                    event.stopPropagation();
                    return;
                }
                this.sortByColumn(header.cellIndex, header);
            });
        });
    }
    
    sortByColumn(columnIndex, header) {
        // Toggle sort direction
        if (this.sortColumn === columnIndex) {
            this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            this.sortDirection = 'asc';
            this.sortColumn = columnIndex;
        }
        this.applyCurrentSort();
        if (typeof this.onSortChange === 'function') {
            this.onSortChange({
                sortColumn: this.sortColumn,
                sortDirection: this.sortDirection
            });
        }
    }
    
    updateSortIndicators(activeHeader) {
        const headers = this.table.querySelectorAll('th[data-sortable]');

        headers.forEach(header => {
            const indicator = header.querySelector('.sort-indicator');
            if (!indicator) return;

            if (activeHeader && header === activeHeader) {
                indicator.innerHTML = this.sortDirection === 'asc' ? '↑' : '↓';
                header.classList.add('sorted');
            } else {
                indicator.innerHTML = '↕';
                header.classList.remove('sorted');
            }
        });
    }
    
    // Method to make any table sortable
    static makeTableSortable(tableId) {
        return new TableSort(tableId);
    }

    compareText(aValue, bValue) {
        const aText = String(aValue ?? '').trim();
        const bText = String(bValue ?? '').trim();
        return this.textCollator.compare(aText, bText);
    }

    parseNumber(value) {
        const raw = String(value ?? '').trim();
        if (!raw) return 0;
        const normalized = raw
            .replace(/\s+/g, '')
            .replace(',', '.')
            .replace(/[^\d.-]/g, '');
        const parsed = Number.parseFloat(normalized);
        return Number.isFinite(parsed) ? parsed : 0;
    }

    parseDate(value) {
        const parsed = Date.parse(String(value ?? '').trim());
        return Number.isFinite(parsed) ? parsed : NaN;
    }
}

// Helper function to add sorting to tables with class 'sortable-table'
function initializeSortableTables() {
    const tables = document.querySelectorAll('.sortable-table');
    tables.forEach(table => {
        if (table.id) {
            new TableSort(table.id);
        }
    });
}

// Auto-initialize sortable tables when DOM is ready
document.addEventListener('DOMContentLoaded', initializeSortableTables);
