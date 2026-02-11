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
                    ${!this.objectType ? `
                        <select id="object-type-filter-${this.containerId}" class="filter-select">
                            <option value="">Alla typer</option>
                        </select>
                    ` : ''}
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
        
        const typeFilter = document.getElementById(`object-type-filter-${this.containerId}`);
        if (typeFilter) {
            typeFilter.addEventListener('change', async (e) => {
                this.selectedType = e.target.value;
                await this.loadViewConfig();
                await this.loadObjects();
            });
            
            // Load object types for filter
            this.loadObjectTypes(typeFilter);
        }
        
        // Column config button
        const columnConfigBtn = document.getElementById(`column-config-btn-${this.containerId}`);
        if (columnConfigBtn) {
            columnConfigBtn.addEventListener('click', () => {
                this.toggleColumnConfig();
            });
        }
    }
    
    async loadObjectTypes(selectElement) {
        try {
            const types = await ObjectTypesAPI.getAll();
            types.forEach(type => {
                const option = document.createElement('option');
                option.value = type.name;
                option.textContent = type.name;
                selectElement.appendChild(option);
            });
        } catch (error) {
            console.error('Failed to load object types:', error);
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
                this.viewConfig = null;
            }
        } catch (error) {
            console.error('Failed to load view config:', error);
            this.viewConfig = null;
            this.typeDisplayFieldMap = {};
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
            tbody.innerHTML = '<tr><td colspan="10" class="loading">Inga objekt hittades</td></tr>';
            return;
        }
        
        // Get visible columns from config or use defaults
        const columns = this.getVisibleColumns();
        const colCount = columns.length;
        
        // Render headers with sortable attributes and column classes
        thead.innerHTML = columns.map(col => {
            const width = this.getColumnWidth(col.field_name);
            const widthStyle = width ? `style="width: ${width}px; min-width: ${width}px;"` : '';
            const colClass = this.getColumnClass(col);
            return `<th data-sortable data-sort-type="${this.getSortType(col)}" data-field="${col.field_name}" ${widthStyle} class="resizable-column ${colClass}">
                ${col.display_name}
            </th>`;
        }).join('');
        
        // Render search row with column classes
        searchRow.innerHTML = columns.map(col => {
            const colClass = this.getColumnClass(col);
            const width = this.getColumnWidth(col.field_name);
            const widthStyle = width ? `style="width: ${width}px; min-width: ${width}px;"` : '';
            // Skip search input for actions column
            if (col.field_name === 'actions') {
                return `<th ${widthStyle} class="${colClass}"></th>`;
            }
            return `<th ${widthStyle} class="${colClass}">
                <input type="text" 
                       class="column-search-input" 
                       placeholder="Sök..."
                       data-field="${col.field_name}"
                       value="${this.columnSearches[col.field_name] || ''}">
            </th>`;
        }).join('');
        
        // Attach column search listeners
        searchRow.querySelectorAll('.column-search-input').forEach(input => {
            input.addEventListener('input', (e) => {
                const field = e.target.getAttribute('data-field');
                this.columnSearches[field] = e.target.value;
                this.renderFilteredObjects();
            });
        });
        
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
                const term = searchTerm.toLowerCase();
                filteredObjects = filteredObjects.filter(obj => {
                    const value = this.getColumnValue(obj, field);
                    return String(value).toLowerCase().includes(term);
                });
            }
        }
        
        // Render rows with data-value attributes for sorting and column classes
        tbody.innerHTML = filteredObjects.map(obj => `
            <tr onclick="viewObjectDetail(${obj.id})" style="cursor: pointer;">
                ${columns.map(col => {
                    const value = this.getColumnValue(obj, col.field_name);
                    const displayValue = this.formatColumnValue(obj, col.field_name, value);
                    const colClass = this.getColumnClass(col);
                    return `<td data-value="${value}" class="${colClass}">${displayValue}</td>`;
                }).join('')}
            </tr>
        `).join('');
        
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
    }
    
    getVisibleColumns() {
        if (!this.viewConfig) {
            // Default columns when no config
            return [
                { field_name: 'auto_id', display_name: 'ID' },
                { field_name: 'object_type', display_name: 'Typ' },
                { field_name: 'display_name', display_name: 'Namn' },
                { field_name: 'created_at', display_name: 'Skapad' },
                { field_name: 'actions', display_name: 'Åtgärder' }
            ];
        }
        
        const visible_columns = this.viewConfig.visible_columns || [];
        const available_fields = this.viewConfig.available_fields || [];
        const column_order = this.viewConfig.column_order || [];
        
        // Build columns based on configuration
        const columns = [];
        
        // Add columns in specified order
        for (const fieldName of column_order) {
            const colConfig = visible_columns.find(c => c.field_name === fieldName);
            if (!colConfig || !colConfig.visible) continue;
            
            if (fieldName === 'auto_id') {
                columns.push({ field_name: 'auto_id', display_name: 'ID' });
            } else if (fieldName === 'created_at') {
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
        
        // Always add actions column at the end
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
            'object_type': 'col-type',
            'display_name': 'col-name',
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
        
        // Annars baserat på fälttyp
        if (fieldType === 'textarea') return 'col-description';
        if (fieldType === 'date') return 'col-date';
        if (fieldType === 'boolean') return 'col-status';
        if (fieldType === 'number') return 'col-number';
        
        // Default: anpassa till innehåll
        return 'col-default';
    }
    
    getColumnWidth(fieldName) {
        if (!this.viewConfig || !this.viewConfig.column_widths) return null;
        return this.viewConfig.column_widths[fieldName] || null;
    }
    
    getSortType(col) {
        if (col.field_name === 'created_at') return 'date';
        if (col.field_type === 'number') return 'number';
        return 'text';
    }
    
    getColumnValue(obj, fieldName) {
        if (fieldName === 'auto_id') return obj.auto_id;
        if (fieldName === 'object_type') return obj.object_type?.name || '';
        if (fieldName === 'display_name') return this.getObjectDisplayName(obj);
        if (fieldName === 'created_at') return obj.created_at;
        if (fieldName === 'actions') return '';
        
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
        
        return value || '';
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
            ...available_fields.map(f => ({ field_name: f.field_name, display_name: f.display_name })),
            { field_name: 'created_at', display_name: 'Skapad' }
        ];
        
        container.innerHTML = allColumns.map(col => {
            const colConfig = visible_columns.find(c => c.field_name === col.field_name);
            const isVisible = colConfig ? colConfig.visible : false;
            
            return `
                <label class="column-toggle">
                    <input type="checkbox" 
                           data-field="${col.field_name}" 
                           ${isVisible ? 'checked' : ''}>
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
        
        const visible_columns = this.viewConfig.visible_columns || [];
        const colIndex = visible_columns.findIndex(c => c.field_name === fieldName);
        
        if (colIndex >= 0) {
            visible_columns[colIndex].visible = visible;
        } else {
            visible_columns.push({ field_name: fieldName, visible: visible, width: 150 });
        }
        
        this.viewConfig.visible_columns = visible_columns;
        this.renderObjects();
    }
    
    async refresh() {
        await this.loadObjects();
    }
}
