/**
 * TableSort Component
 * Makes tables sortable by clicking column headers
 */

class TableSort {
    constructor(tableId) {
        this.table = document.getElementById(tableId);
        this.sortColumn = null;
        this.sortDirection = 'asc';
        
        if (this.table) {
            this.initialize();
        }
    }
    
    initialize() {
        const headers = this.table.querySelectorAll('th[data-sortable]');
        
        headers.forEach((header, index) => {
            header.style.cursor = 'pointer';
            header.style.userSelect = 'none';
            
            // Add sort indicator
            const indicator = document.createElement('span');
            indicator.className = 'sort-indicator';
            indicator.innerHTML = '↕';
            header.appendChild(indicator);
            
            header.addEventListener('click', () => {
                this.sortByColumn(index, header);
            });
        });
    }
    
    sortByColumn(columnIndex, header) {
        const tbody = this.table.querySelector('tbody');
        if (!tbody) return;
        
        const rows = Array.from(tbody.querySelectorAll('tr'));
        const sortType = header.dataset.sortType || 'text';
        
        // Toggle sort direction
        if (this.sortColumn === columnIndex) {
            this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            this.sortDirection = 'asc';
            this.sortColumn = columnIndex;
        }
        
        // Sort rows
        rows.sort((a, b) => {
            const aCell = a.cells[columnIndex];
            const bCell = b.cells[columnIndex];
            
            if (!aCell || !bCell) return 0;
            
            let aValue = aCell.textContent.trim();
            let bValue = bCell.textContent.trim();
            
            // Use data-value attribute if available
            if (aCell.dataset.value) aValue = aCell.dataset.value;
            if (bCell.dataset.value) bValue = bCell.dataset.value;
            
            let comparison = 0;
            
            if (sortType === 'number') {
                const aNum = parseFloat(aValue) || 0;
                const bNum = parseFloat(bValue) || 0;
                comparison = aNum - bNum;
            } else if (sortType === 'date') {
                const aDate = new Date(aValue);
                const bDate = new Date(bValue);
                comparison = aDate - bDate;
            } else {
                // Text comparison
                comparison = aValue.localeCompare(bValue, 'sv');
            }
            
            return this.sortDirection === 'asc' ? comparison : -comparison;
        });
        
        // Re-append sorted rows
        rows.forEach(row => tbody.appendChild(row));
        
        // Update sort indicators
        this.updateSortIndicators(header);
    }
    
    updateSortIndicators(activeHeader) {
        const headers = this.table.querySelectorAll('th[data-sortable]');
        
        headers.forEach(header => {
            const indicator = header.querySelector('.sort-indicator');
            if (!indicator) return;
            
            if (header === activeHeader) {
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
