/**
 * Object List Component
 * Displays a list of objects with filtering and search
 */

class ObjectListComponent {
    constructor(containerId, objectType = null) {
        this.containerId = containerId;
        this.container = document.getElementById(containerId);
        this.objectType = objectType;
        this.objects = [];
        this.searchTerm = '';
        this.selectedType = objectType;
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
                </div>
                <div class="table-container">
                    <table class="data-table">
                        <thead>
                            <tr id="table-headers-${this.containerId}"></tr>
                        </thead>
                        <tbody id="table-body-${this.containerId}">
                            <tr><td colspan="5" class="loading">Laddar objekt...</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
        `;
        
        this.attachEventListeners();
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
                await this.loadObjects();
            });
            
            // Load object types for filter
            this.loadObjectTypes(typeFilter);
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
        
        if (!this.objects || this.objects.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="loading">Inga objekt hittades</td></tr>';
            return;
        }
        
        // Render headers
        thead.innerHTML = `
            <th>ID</th>
            <th>Typ</th>
            <th>Namn</th>
            <th>Skapad</th>
            <th>Åtgärder</th>
        `;
        
        // Filter objects by search term
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
        
        // Render rows
        tbody.innerHTML = filteredObjects.map(obj => `
            <tr onclick="viewObjectDetail(${obj.id})" style="cursor: pointer;">
                <td><strong>${obj.auto_id}</strong></td>
                <td>
                    <span class="object-type-badge" style="background-color: ${getObjectTypeColor(obj.object_type?.name)}">
                        ${obj.object_type?.name || 'N/A'}
                    </span>
                </td>
                <td>${this.getObjectDisplayName(obj)}</td>
                <td>${formatDate(obj.created_at)}</td>
                <td onclick="event.stopPropagation()">
                    <button class="btn btn-sm btn-primary" onclick="editObject(${obj.id})">
                        Redigera
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="deleteObject(${obj.id})">
                        Ta bort
                    </button>
                </td>
            </tr>
        `).join('');
    }
    
    getObjectDisplayName(obj) {
        // Try to find a "name" field in the object data
        if (obj.data) {
            return obj.data.namn || obj.data.name || obj.data.title || obj.auto_id;
        }
        return obj.auto_id;
    }
    
    async refresh() {
        await this.loadObjects();
    }
}
