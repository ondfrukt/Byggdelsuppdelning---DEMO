/**
 * Main Application - Object-based Byggdelssystem
 */

// Constants
const PANEL_ANIMATION_DELAY = 50; // Delay in ms before adjusting wrapper when opening detail panel

let currentView = 'objects';
let currentObjectId = null;
let currentObjectListComponent = null;
let currentObjectDetailComponent = null;
let currentDetailPanelInstance = null;
let detailPanelTimeout = null;

// Initialize global window properties for cross-component access
window.treeViewActive = false;
window.treeViewInstance = null;
window.sidePanelInstance = null;

// Clear any pending detail panel animation timeout
function clearDetailPanelTimeout() {
    if (detailPanelTimeout) {
        clearTimeout(detailPanelTimeout);
        detailPanelTimeout = null;
    }
}

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
    await loadObjectsView();
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
        case 'objects':
            await loadObjectsView();
            break;
        case 'admin':
            await loadAdminView();
            break;
    }
}

function updateTreeToggleButtonLabel() {
    const toggleButton = document.getElementById('toggle-tree-view-btn');
    if (!toggleButton) return;
    toggleButton.textContent = treeViewActive ? 'Objektvy' : 'Trädvy';
}

// Load objects view
async function loadObjectsView() {
    const objectListWrapper = document.getElementById('objects-container-wrapper');
    const treeWrapper = document.getElementById('tree-view-wrapper');
    if (!objectListWrapper) return;

    // Create container for object list if it doesn't exist
    if (!document.getElementById('objects-container')) {
        objectListWrapper.innerHTML = '<div id="objects-container"></div>';
    }
    
    // Show list view by default
    treeViewActive = false;
    window.treeViewActive = false;
    updateTreeToggleButtonLabel();

    objectListWrapper.style.display = 'block';
    if (treeWrapper) treeWrapper.style.display = 'none';
    
    currentObjectListComponent = new ObjectListComponent('objects-container');
    await currentObjectListComponent.render();
}

// Toggle tree view
let treeViewActive = false;
let treeViewInstance = null;

async function toggleTreeView() {
    treeViewActive = !treeViewActive;
    window.treeViewActive = treeViewActive; // Update global reference
    updateTreeToggleButtonLabel();
    
    const objectsWrapper = document.getElementById('objects-container-wrapper');
    const treeWrapper = document.getElementById('tree-view-wrapper');

    // Reset and collapse detail panel when switching views
    closeDetailPanel();
    
    if (treeViewActive) {
        if (objectsWrapper) objectsWrapper.style.display = 'none';
        if (treeWrapper) treeWrapper.style.display = 'block';
        // Initialize tree view if not already done
        if (!treeViewInstance) {
            treeViewInstance = new TreeView('tree-view-container');
            window.treeViewInstance = treeViewInstance; // Update global reference
            
            // Set up click handler
            treeViewInstance.setNodeClickHandler(async (objectId, objectType) => {
                // Load object data once
                const object = await ObjectsAPI.getById(objectId);
                
                // Update panel title
                const panelTitle = document.getElementById('detail-panel-title');
                if (panelTitle) {
                    const displayName = object.data?.Namn || object.data?.namn || object.auto_id;
                    panelTitle.textContent = displayName;
                }

                // Create or reuse unified detail panel instance
                if (!currentDetailPanelInstance) {
                    currentDetailPanelInstance = createObjectDetailPanel('detail-panel-body', {
                        layout: 'detail',
                        showHeader: false
                    });
                }

                
                // Set the object data on the panel instance to avoid duplicate API call
                currentDetailPanelInstance.objectData = object;
                currentDetailPanelInstance.objectId = objectId;
                
                // Render with unified component (won't fetch again since objectData is set)
                await currentDetailPanelInstance.render();

                const detailPanel = document.getElementById('detail-panel');
                if (detailPanel) {
                    detailPanel.classList.add('active');
                    
                }

                if (treeWrapper) {
                    treeWrapper.classList.add('panel-open');
                }
            });
        }
        
        await treeViewInstance.render();
    } else {
        if (objectsWrapper) objectsWrapper.style.display = 'block';
        if (treeWrapper) {
            treeWrapper.style.display = 'none';
            treeWrapper.classList.remove('panel-open');
        }
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

// View object detail in side panel
async function viewObjectDetail(objectId) {
    currentObjectId = objectId;
    
    // Open detail panel instead of navigating to detail view
    await openDetailPanel(objectId);
}

// Open detail panel
async function openDetailPanel(objectId) {
    const panel = document.getElementById('detail-panel');
    const wrapper = document.getElementById('objects-container-wrapper');
    const panelBody = document.getElementById('detail-panel-body');
    
    if (!panel || !panelBody) return;
    
    // Säkerställ att inga gamla tidsutlösare ligger kvar
    clearDetailPanelTimeout();
    
    try {
        // Visa panel och sätt flex-wrapper på en gång
        panel.classList.add('active');
        if (wrapper) wrapper.classList.add('panel-open');
        
        // Ladda objektdata
        const object = await ObjectsAPI.getById(objectId);
        
        // Uppdatera panel-title (visar namn, eller ID som fallback)
        const panelTitle = document.getElementById('detail-panel-title');
        if (panelTitle) {
            const displayName =
                object.data?.Namn ||
                object.data?.namn ||
                object.data?.Name ||
                object.data?.name ||
                object.data?.title ||
                object.auto_id;
            panelTitle.textContent = displayName;
        }
        
        // Skapa eller återanvänd enhetlig detaljpanel-instans
        if (!currentDetailPanelInstance) {
            currentDetailPanelInstance = createObjectDetailPanel('detail-panel-body', {
                layout: 'detail',
                showHeader: false
            });
        }
        
        // Rendera komponenten för det valda objektet
        await currentDetailPanelInstance.render(objectId);
        
    } catch (error) {
        console.error('Failed to load object detail:', error);
        showToast('Kunde inte ladda objektdetaljer', 'error');
        closeDetailPanel();
    }
}

// Close detail panel
function closeDetailPanel() {
    const panel = document.getElementById('detail-panel');
    const objectsWrapper = document.getElementById('objects-container-wrapper');
    const treeWrapper = document.getElementById('tree-view-wrapper');
    const panelTitle = document.getElementById('detail-panel-title');
    const panelBody = document.getElementById('detail-panel-body');

    
    // Clear any pending timeout to prevent race condition
    clearDetailPanelTimeout();
    
    if (panel) panel.classList.remove('active');
    if (objectsWrapper) objectsWrapper.classList.remove('panel-open');
    if (treeWrapper) treeWrapper.classList.remove('panel-open');

    if (panelTitle) panelTitle.textContent = 'Objektdetaljer';
    if (panelBody) panelBody.innerHTML = '<p class="empty-state">Välj ett objekt att visa</p>';
    
    // Clean up the instance
    if (currentDetailPanelInstance) {
        currentDetailPanelInstance.close();
    }
}

// Format field value based on type
function formatFieldValue(value, fieldType) {
    if (value === null || value === undefined || value === '') return '-';
    
    switch (fieldType) {
        case 'boolean':
            return value ? 'Ja' : 'Nej';
        case 'date':
            return formatDate(value);
        case 'datetime':
            return formatDate(value);
        case 'decimal':
        case 'number':
            return Number(value).toLocaleString('sv-SE');
        default:
            return String(value);
    }
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
