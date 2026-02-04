/**
 * Components Module - Handles all component-related functionality
 */

let currentComponent = null;
let currentEditingComponent = null;

// Load and display all components
async function loadComponents(filters = {}) {
    try {
        const components = await ComponentsAPI.getAll(filters);
        displayComponentsTable(components);
    } catch (error) {
        showToast('Fel vid laddning av komponenter: ' + error.message, 'error');
    }
}

// Display components in table
function displayComponentsTable(components) {
    const tbody = document.getElementById('components-table-body');
    
    if (components.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="empty-state">Inga komponenter hittades</td></tr>';
        return;
    }
    
    tbody.innerHTML = components.map(component => `
        <tr onclick="showComponentDetail(${component.id})">
            <td>${component.name}</td>
            <td>${component.type || '-'}</td>
            <td>${component.specifications || '-'}</td>
            <td>${component.unit}</td>
            <td onclick="event.stopPropagation()">
                <div class="action-btns" style="display: flex; gap: 4px; justify-content: center;">
                    <button class="icon-btn edit" onclick="editComponent(${component.id})" title="Redigera" aria-label="Redigera komponent ${component.name}">✏️</button>
                    <button class="icon-btn delete" onclick="deleteComponent(${component.id})" title="Ta bort" aria-label="Ta bort komponent ${component.name}">🗑️</button>
                </div>
            </td>
        </tr>
    `).join('');
}

// Show component detail view
async function showComponentDetail(componentId) {
    try {
        const component = await ComponentsAPI.getById(componentId);
        currentComponent = component;
        
        // Display component info
        const infoDiv = document.getElementById('component-info');
        infoDiv.innerHTML = `
            <div class="detail-item">
                <span class="detail-label">Namn</span>
                <span class="detail-value">${component.name}</span>
            </div>
            <div class="detail-item">
                <span class="detail-label">Typ</span>
                <span class="detail-value">${component.type || '-'}</span>
            </div>
            <div class="detail-item">
                <span class="detail-label">Specifikationer</span>
                <span class="detail-value">${component.specifications || '-'}</span>
            </div>
            <div class="detail-item">
                <span class="detail-label">Enhet</span>
                <span class="detail-value">${component.unit}</span>
            </div>
            <div class="detail-item">
                <span class="detail-label">Skapad</span>
                <span class="detail-value">${formatDateTime(component.created_at)}</span>
            </div>
        `;
        
        // Display usage
        const usageDiv = document.getElementById('component-usage');
        if (component.used_in_products && component.used_in_products.length > 0) {
            usageDiv.innerHTML = component.used_in_products.map(usage => `
                <div class="usage-item">
                    <strong>${usage.product_name}</strong>
                    <span class="quantity">${usage.quantity} ${component.unit}</span>
                </div>
            `).join('');
        } else {
            usageDiv.innerHTML = '<p class="empty-state">Komponenten används inte i några produkter</p>';
        }
        
        // Update title
        document.getElementById('component-detail-title').textContent = component.name;
        
        // Show the detail view
        showView('component-detail-view');
    } catch (error) {
        showToast('Fel vid laddning av komponent: ' + error.message, 'error');
    }
}

// Show components view
function showComponentsView() {
    showView('components-view');
    updateNavigation('components');
    loadComponents();
}

// Show create component modal
function showCreateComponentModal() {
    currentEditingComponent = null;
    document.getElementById('component-modal-title').textContent = 'Skapa Komponent';
    document.getElementById('component-form').reset();
    openModal('component-modal');
}

// Edit component
async function editComponent(componentId) {
    try {
        const component = await ComponentsAPI.getById(componentId);
        currentEditingComponent = component;
        
        document.getElementById('component-modal-title').textContent = 'Redigera Komponent';
        document.getElementById('component-name').value = component.name;
        document.getElementById('component-type').value = component.type || '';
        document.getElementById('component-specifications').value = component.specifications || '';
        document.getElementById('component-unit').value = component.unit;
        
        openModal('component-modal');
    } catch (error) {
        showToast('Fel vid laddning av komponent: ' + error.message, 'error');
    }
}

// Edit current component (from detail view)
function editCurrentComponent() {
    if (currentComponent) {
        editComponent(currentComponent.id);
    }
}

// Save component (create or update)
async function saveComponent(event) {
    event.preventDefault();
    
    const data = {
        name: document.getElementById('component-name').value,
        type: document.getElementById('component-type').value,
        specifications: document.getElementById('component-specifications').value,
        unit: document.getElementById('component-unit').value,
    };
    
    try {
        if (currentEditingComponent) {
            await ComponentsAPI.update(currentEditingComponent.id, data);
            showToast('Komponent uppdaterad', 'success');
            
            // If we're viewing this component, refresh the detail view
            if (currentComponent && currentComponent.id === currentEditingComponent.id) {
                showComponentDetail(currentEditingComponent.id);
            }
        } else {
            await ComponentsAPI.create(data);
            showToast('Komponent skapad', 'success');
        }
        
        closeModal();
        loadComponents();
    } catch (error) {
        showToast('Fel: ' + error.message, 'error');
    }
}

// Delete component
async function deleteComponent(componentId) {
    if (!confirmAction('Är du säker på att du vill ta bort denna komponent?')) {
        return;
    }
    
    try {
        await ComponentsAPI.delete(componentId);
        showToast('Komponent borttagen', 'success');
        loadComponents();
    } catch (error) {
        showToast('Fel vid borttagning: ' + error.message, 'error');
    }
}

// Delete current component (from detail view)
async function deleteCurrentComponent() {
    if (!currentComponent) return;
    
    if (!confirmAction('Är du säker på att du vill ta bort denna komponent?')) {
        return;
    }
    
    try {
        await ComponentsAPI.delete(currentComponent.id);
        showToast('Komponent borttagen', 'success');
        showComponentsView();
    } catch (error) {
        showToast('Fel vid borttagning: ' + error.message, 'error');
    }
}

// Setup component filters
function setupComponentFilters() {
    const searchInput = document.getElementById('component-search');
    const typeFilter = document.getElementById('component-type-filter');
    
    const debouncedLoad = debounce(() => {
        const filters = {
            search: searchInput.value,
            type: typeFilter.value
        };
        loadComponents(filters);
    }, 300);
    
    searchInput.addEventListener('input', debouncedLoad);
    typeFilter.addEventListener('change', debouncedLoad);
}
