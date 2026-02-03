/**
 * Main Application - Object-based Byggdelssystem
 */

let currentView = 'dashboard';
let currentObjectId = null;
let currentObjectListComponent = null;
let currentObjectDetailComponent = null;

// Initialize global window properties for cross-component access
window.treeViewActive = false;
window.treeViewInstance = null;

// Initialize application
document.addEventListener('DOMContentLoaded', async () => {
    try {
        await checkHealth();
        console.log('API is healthy');
    } catch (error) {
        console.error('API health check failed:', error);
        showToast('API anslutning misslyckades', 'error');
    }
    
    initializeNavigation();
    await loadDashboard();
});

// Initialize navigation
function initializeNavigation() {
    const navBtns = document.querySelectorAll('.nav-btn');
    
    navBtns.forEach(btn => {
        btn.addEventListener('click', async () => {
            const view = btn.dataset.view;
            await switchView(view);
        });
    });
}

// Switch between views
async function switchView(viewName) {
    currentView = viewName;
    updateNavigation(viewName);
    showView(`${viewName}-view`);
    
    switch (viewName) {
        case 'dashboard':
            await loadDashboard();
            break;
        case 'objects':
            await loadObjectsView();
            break;
        case 'admin':
            await loadAdminView();
            break;
    }
}

// Load dashboard with object type stats
async function loadDashboard() {
    try {
        const stats = await getStats();
        const objectTypes = await ObjectTypesAPI.getAll();
        
        const statsContainer = document.getElementById('stats-grid');
        if (statsContainer) {
            // Create stat cards for each object type
            statsContainer.innerHTML = objectTypes.map(type => {
                const count = stats.objects_by_type?.[type.name] || 0;
                const color = getObjectTypeColor(type.name);
                return `
                    <div class="stat-card" style="border-top: 4px solid ${color}">
                        <h3>${count}</h3>
                        <p>${type.name}</p>
                    </div>
                `;
            }).join('');
        }
        
        // Show recent objects
        const recentContainer = document.getElementById('recent-objects');
        if (recentContainer && stats.recent_objects) {
            recentContainer.innerHTML = stats.recent_objects.map(obj => {
                const displayName = obj.data?.namn || obj.data?.name || obj.auto_id;
                const color = getObjectTypeColor(obj.object_type?.name);
                return `
                    <div class="recent-item" onclick="viewObjectDetail(${obj.id})" style="cursor: pointer;">
                        <div>
                            <strong>${displayName}</strong>
                            <br>
                            <small>${obj.auto_id} • ${obj.object_type?.name}</small>
                        </div>
                        <span class="object-type-badge" style="background-color: ${color}">
                            ${obj.object_type?.name}
                        </span>
                    </div>
                `;
            }).join('');
        }
    } catch (error) {
        console.error('Failed to load dashboard:', error);
        showToast('Kunde inte ladda dashboard', 'error');
    }
}

// Load objects view
async function loadObjectsView() {
    const container = document.getElementById('objects-container');
    if (!container) return;
    
    // Show list view by default
    document.getElementById('objects-container').style.display = 'block';
    document.getElementById('tree-container').style.display = 'none';
    
    currentObjectListComponent = new ObjectListComponent('objects-container');
    await currentObjectListComponent.render();
}

// Toggle tree view
let treeViewActive = false;
let treeViewInstance = null;

async function toggleTreeView() {
    treeViewActive = !treeViewActive;
    window.treeViewActive = treeViewActive; // Update global reference
    
    const objectsContainer = document.getElementById('objects-container');
    const treeContainer = document.getElementById('tree-container');
    
    if (treeViewActive) {
        objectsContainer.style.display = 'none';
        treeContainer.style.display = 'grid';
        
        // Initialize tree view if not already done
        if (!treeViewInstance) {
            treeViewInstance = new TreeView('tree-view-container');
            window.treeViewInstance = treeViewInstance; // Update global reference
            window.sidePanelInstance = new SidePanel('side-panel-container');
            
            // Set up click handler
            treeViewInstance.setNodeClickHandler((objectId, objectType) => {
                window.sidePanelInstance.render(objectId);
            });
        }
        
        await treeViewInstance.render();
    } else {
        objectsContainer.style.display = 'block';
        treeContainer.style.display = 'none';
    }
}

// Load admin view
async function loadAdminView() {
    if (!adminManager) {
        initializeAdminPanel();
    } else {
        await adminManager.render();
    }
}

// View object detail
async function viewObjectDetail(objectId) {
    currentObjectId = objectId;
    showView('object-detail-view');
    
    currentObjectDetailComponent = new ObjectDetailComponent('object-detail-container', objectId);
    await currentObjectDetailComponent.render();
}

// Create new object
async function showCreateObjectModal() {
    const modal = document.getElementById('object-modal');
    const overlay = document.getElementById('modal-overlay');
    
    if (!modal || !overlay) return;
    
    // Clear previous form data
    window.currentObjectForm = null;
    const formContainer = document.getElementById('object-form-container');
    if (formContainer) {
        formContainer.innerHTML = '';
    }
    
    // Load object types
    try {
        const types = await ObjectTypesAPI.getAll();
        const typeSelect = document.getElementById('object-type-select');
        
        if (typeSelect) {
            typeSelect.disabled = false;
            typeSelect.innerHTML = '<option value="">Välj objekttyp...</option>' +
                types.map(type => `<option value="${type.id}">${type.name}</option>`).join('');
            
            // Listen for type selection
            typeSelect.onchange = async (e) => {
                const typeId = e.target.value;
                if (typeId) {
                    const type = types.find(t => t.id == typeId);
                    if (type) {
                        const formComponent = new ObjectFormComponent(type);
                        await formComponent.render('object-form-container');
                        window.currentObjectForm = formComponent;
                    }
                }
            };
        }
        
        modal.dataset.mode = 'create';
        modal.style.display = 'block';
        overlay.style.display = 'block';
    } catch (error) {
        console.error('Failed to load object types:', error);
        showToast('Kunde inte ladda objekttyper', 'error');
    }
}

// Edit object
async function editObject(objectId) {
    try {
        const object = await ObjectsAPI.getById(objectId);
        const typeData = await ObjectTypesAPI.getById(object.object_type.id);
        
        const modal = document.getElementById('object-modal');
        const overlay = document.getElementById('modal-overlay');
        
        if (!modal || !overlay) return;
        
        // Set type select (disabled for edit)
        const typeSelect = document.getElementById('object-type-select');
        if (typeSelect) {
            typeSelect.innerHTML = `<option value="${typeData.id}" selected>${typeData.name}</option>`;
            typeSelect.disabled = true;
        }
        
        // Render form with existing data
        const formComponent = new ObjectFormComponent(typeData, object);
        await formComponent.render('object-form-container');
        window.currentObjectForm = formComponent;
        
        modal.dataset.mode = 'edit';
        modal.dataset.objectId = objectId;
        modal.style.display = 'block';
        overlay.style.display = 'block';
    } catch (error) {
        console.error('Failed to load object for editing:', error);
        showToast('Kunde inte ladda objekt', 'error');
    }
}

// Save object (create or update)
async function saveObject(event) {
    event.preventDefault();
    
    const modal = document.getElementById('object-modal');
    const mode = modal.dataset.mode;
    const objectId = modal.dataset.objectId;
    
    // Check if object type is selected (for create mode)
    const typeSelect = document.getElementById('object-type-select');
    if (mode === 'create' && typeSelect) {
        const typeValue = typeSelect.value;
        if (!typeValue) {
            showToast('Välj en objekttyp först', 'error');
            return;
        }
    }
    
    if (!window.currentObjectForm) {
        showToast('Formulär ej tillgängligt', 'error');
        return;
    }
    
    if (!window.currentObjectForm.validate()) {
        showToast('Fyll i alla obligatoriska fält', 'error');
        return;
    }
    
    const typeId = parseInt(document.getElementById('object-type-select').value);
    const formData = window.currentObjectForm.getFormData();
    
    const data = {
        object_type_id: typeId,
        data: formData
    };
    
    try {
        if (mode === 'create') {
            await ObjectsAPI.create(data);
            showToast('Objekt skapat', 'success');
        } else {
            await ObjectsAPI.update(objectId, data);
            showToast('Objekt uppdaterat', 'success');
        }
        
        closeModal();
        
        // Refresh current view
        if (currentObjectListComponent) {
            await currentObjectListComponent.refresh();
        }
        if (currentObjectDetailComponent) {
            await currentObjectDetailComponent.refresh();
        }
    } catch (error) {
        console.error('Failed to save object:', error);
        // If error has details (from backend validation), show them
        let errorMessage = error.message || 'Kunde inte spara objekt';
        if (error.details && Array.isArray(error.details) && error.details.length > 0) {
            errorMessage = error.details.join(', ');
        }
        showToast(errorMessage, 'error');
    }
}

// Delete object
async function deleteObject(objectId) {
    if (!confirm('Är du säker på att du vill ta bort detta objekt?')) {
        return;
    }
    
    try {
        await ObjectsAPI.delete(objectId);
        showToast('Objekt borttaget', 'success');
        
        // Go back to list view
        await switchView('objects');
    } catch (error) {
        console.error('Failed to delete object:', error);
        showToast(error.message || 'Kunde inte ta bort objekt', 'error');
    }
}

// Go back to previous view
function goBack() {
    switchView('objects');
}
