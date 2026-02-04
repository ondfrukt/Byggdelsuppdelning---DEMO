/**
 * Relation Manager Component
 * Manages relations between objects
 */

class RelationManagerComponent {
    constructor(containerId, objectId) {
        this.container = document.getElementById(containerId);
        this.objectId = objectId;
        this.relations = [];
    }
    
    async render() {
        if (!this.container) return;
        
        this.container.innerHTML = `
            <div class="relation-manager">
                <div class="view-header">
                    <h3>Relationer</h3>
                    <button class="btn btn-primary" onclick="showAddRelationModal(${this.objectId})">
                        Lägg till Relation
                    </button>
                </div>
                <div id="relations-list-${this.objectId}"></div>
            </div>
        `;
        
        await this.loadRelations();
    }
    
    async loadRelations() {
        try {
            this.relations = await ObjectsAPI.getRelations(this.objectId);
            this.renderRelations();
        } catch (error) {
            console.error('Failed to load relations:', error);
            showToast('Kunde inte ladda relationer', 'error');
        }
    }
    
    renderRelations() {
        const listContainer = document.getElementById(`relations-list-${this.objectId}`);
        if (!listContainer) return;
        
        if (!this.relations || this.relations.length === 0) {
            listContainer.innerHTML = '<p class="empty-state">Inga relationer ännu</p>';
            return;
        }
        
        // Group relations by type
        const grouped = {};
        this.relations.forEach(rel => {
            const type = rel.relation_type || 'Övriga';
            if (!grouped[type]) {
                grouped[type] = [];
            }
            grouped[type].push(rel);
        });
        
        // Render grouped relations
        const html = Object.entries(grouped).map(([type, rels]) => `
            <div class="relations-section">
                <h4>${this.formatRelationType(type)}</h4>
                ${rels.map(rel => this.renderRelation(rel)).join('')}
            </div>
        `).join('');
        
        listContainer.innerHTML = html;
    }
    
    renderRelation(relation) {
        const targetObject = relation.target_object || {};
        const displayName = targetObject.data?.namn || 
                           targetObject.data?.name || 
                           targetObject.auto_id || 
                           'Okänt objekt';
        
        return `
            <div class="relation-item">
                <div class="relation-info">
                    <span class="relation-type">${this.formatRelationType(relation.relation_type)}</span>
                    <strong>${displayName}</strong>
                    ${relation.relation_metadata?.description ? `<p>${escapeHtml(relation.relation_metadata.description)}</p>` : ''}
                    <small>Typ: ${targetObject.object_type?.name || 'N/A'}</small>
                </div>
                <div class="relation-actions">
                    <button class="btn btn-sm btn-secondary" onclick="viewObjectDetail(${targetObject.id})">
                        Visa
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="deleteRelation(${this.objectId}, ${relation.id})" 
                            aria-label="Ta bort relation med ${escapeHtml(displayName)}">
                        🗑️ Ta bort
                    </button>
                </div>
            </div>
        `;
    }
    
    formatRelationType(type) {
        const types = {
            'består_av': 'Består av',
            'variant_av': 'Variant av',
            'ersätter': 'Ersätter',
            'ersätts_av': 'Ersätts av',
            'kopplas_till': 'Kopplas till',
            'dokumenterar': 'Dokumenterar',
            'specificerar': 'Specificerar',
            'relaterad_till': 'Relaterad till'
        };
        return types[type] || type;
    }
    
    async refresh() {
        await this.loadRelations();
    }
}

// Helper function to refresh all views after relation changes
async function refreshAllViews() {
    // Refresh relations if component exists
    try {
        const relationManager = window.currentRelationManager;
        if (relationManager) {
            await relationManager.refresh();
        }
    } catch (error) {
        console.error('Failed to refresh relation manager:', error);
    }
    
    // Refresh tree view if it's active
    try {
        if (window.treeViewInstance && window.treeViewActive) {
            await window.treeViewInstance.refresh();
        }
    } catch (error) {
        console.error('Failed to refresh tree view:', error);
    }
    
    // Refresh detail view if it's showing
    try {
        if (window.currentObjectDetailComponent) {
            // Just refresh the relations, not the whole detail view
            await window.currentObjectDetailComponent.loadRelations();
        }
    } catch (error) {
        console.error('Failed to refresh detail view relations:', error);
    }
}

// Store all objects and filtered objects for the relation modal
let allObjectsForRelation = [];
let filteredObjectsForRelation = [];

// Global function to show add relation modal
async function showAddRelationModal(objectId) {
    const modal = document.getElementById('relation-modal');
    const overlay = document.getElementById('modal-overlay');
    
    if (!modal || !overlay) {
        console.error('Relation modal not found');
        return;
    }
    
    // Hide objects group initially
    document.getElementById('relation-objects-group').style.display = 'none';
    document.getElementById('relation-objects-list').innerHTML = '';
    
    // Load object types
    try {
        const types = await ObjectTypesAPI.getAll();
        const typeSelect = document.getElementById('relation-object-type');
        
        if (typeSelect) {
            typeSelect.innerHTML = '<option value="">Välj objekttyp...</option>' +
                types.map(type => `<option value="${type.id}">${type.name}</option>`).join('');
            
            // Listen for type selection
            typeSelect.onchange = async () => {
                const selectedTypeId = parseInt(typeSelect.value);
                if (selectedTypeId) {
                    await loadObjectsForRelationType(objectId, selectedTypeId);
                } else {
                    document.getElementById('relation-objects-group').style.display = 'none';
                }
            };
        }
        
        // Set up search functionality
        const searchInput = document.getElementById('relation-objects-search');
        if (searchInput) {
            searchInput.oninput = () => {
                filterRelationObjects(searchInput.value);
            };
        }
        
        // Store objectId for form submission
        modal.dataset.objectId = objectId;
        
        // Reset form after all setup is complete
        document.getElementById('relation-form').reset();
        
        modal.style.display = 'block';
        overlay.style.display = 'block';
    } catch (error) {
        console.error('Failed to load object types:', error);
        showToast('Kunde inte ladda objekttyper', 'error');
    }
}

// Load objects filtered by type
async function loadObjectsForRelationType(currentObjectId, typeId) {
    try {
        const objects = await ObjectsAPI.getAll();
        
        // Filter by type and exclude current object
        allObjectsForRelation = objects.filter(obj => 
            obj.object_type?.id === typeId && obj.id !== currentObjectId
        );
        
        filteredObjectsForRelation = [...allObjectsForRelation];
        
        // Show the objects group
        document.getElementById('relation-objects-group').style.display = 'block';
        
        // Render objects list
        renderRelationObjectsList();
    } catch (error) {
        console.error('Failed to load objects:', error);
        showToast('Kunde inte ladda objekt', 'error');
    }
}

// Filter objects based on search term
function filterRelationObjects(searchTerm) {
    const term = searchTerm.toLowerCase();
    
    if (!term) {
        filteredObjectsForRelation = [...allObjectsForRelation];
    } else {
        filteredObjectsForRelation = allObjectsForRelation.filter(obj => {
            const displayName = (obj.data?.namn || obj.data?.name || obj.auto_id || '').toLowerCase();
            const autoId = (obj.auto_id || '').toLowerCase();
            return displayName.includes(term) || autoId.includes(term);
        });
    }
    
    renderRelationObjectsList();
}

// Render the objects checklist
function renderRelationObjectsList() {
    const listContainer = document.getElementById('relation-objects-list');
    
    if (!listContainer) return;
    
    if (filteredObjectsForRelation.length === 0) {
        listContainer.innerHTML = '<p class="empty-state">Inga objekt hittades</p>';
        return;
    }
    
    listContainer.innerHTML = filteredObjectsForRelation.map(obj => {
        const displayName = obj.data?.namn || obj.data?.name || obj.auto_id;
        return `
            <div class="objects-checklist-item">
                <input type="checkbox" 
                       id="obj-check-${obj.id}" 
                       value="${obj.id}" 
                       name="relation-objects">
                <label for="obj-check-${obj.id}">
                    <span class="objects-checklist-item-name">${escapeHtml(displayName)}</span>
                    <span class="objects-checklist-item-meta">${obj.auto_id}</span>
                </label>
            </div>
        `;
    }).join('');
}

// Global function to save relation
async function saveRelation(event) {
    event.preventDefault();
    
    const modal = document.getElementById('relation-modal');
    const objectId = parseInt(modal.dataset.objectId);
    
    // Get all checked objects
    const checkedBoxes = document.querySelectorAll('input[name="relation-objects"]:checked');
    const targetObjectIds = Array.from(checkedBoxes).map(cb => parseInt(cb.value));
    
    const relationType = document.getElementById('relation-type').value;
    const description = document.getElementById('relation-description').value;
    
    if (targetObjectIds.length === 0) {
        showToast('Välj minst ett objekt', 'error');
        return;
    }
    
    if (!relationType) {
        showToast('Välj relationstyp', 'error');
        return;
    }
    
    try {
        // Create relations for all selected objects
        const promises = targetObjectIds.map(targetObjectId =>
            ObjectsAPI.addRelation(objectId, {
                target_object_id: targetObjectId,
                relation_type: relationType,
                metadata: description ? { description } : {}
            })
        );
        
        await Promise.all(promises);
        
        showToast(`${targetObjectIds.length} relation(er) skapade`, 'success');
        closeModal();
        
        // Refresh all relevant views
        await refreshAllViews();
    } catch (error) {
        console.error('Failed to create relations:', error);
        showToast(error.message || 'Kunde inte skapa relationer', 'error');
    }
}

// Global function to delete relation
async function deleteRelation(objectId, relationId) {
    if (!confirm('Are you sure you want to remove this relationship?')) {
        return;
    }
    
    try {
        await ObjectsAPI.deleteRelation(objectId, relationId);
        showToast('Relation borttagen', 'success');
        
        // Refresh all relevant views
        await refreshAllViews();
    } catch (error) {
        console.error('Failed to delete relation:', error);
        showToast(error.message || 'Kunde inte ta bort relation', 'error');
    }
}
