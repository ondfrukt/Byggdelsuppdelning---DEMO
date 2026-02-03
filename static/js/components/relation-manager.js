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
                    <button class="btn btn-sm btn-danger" onclick="deleteRelation(${this.objectId}, ${relation.id})" title="Remove relation">
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

// Global function to show add relation modal
async function showAddRelationModal(objectId) {
    const modal = document.getElementById('relation-modal');
    const overlay = document.getElementById('modal-overlay');
    
    if (!modal || !overlay) {
        console.error('Relation modal not found');
        return;
    }
    
    // Load available objects for selection
    try {
        const objects = await ObjectsAPI.getAll();
        const targetSelect = document.getElementById('relation-target-object');
        
        if (targetSelect) {
            targetSelect.innerHTML = '<option value="">Välj objekt...</option>' +
                objects
                    .filter(obj => obj.id !== objectId)
                    .map(obj => {
                        const displayName = obj.data?.namn || obj.data?.name || obj.auto_id;
                        return `<option value="${obj.id}">${displayName} (${obj.object_type?.name})</option>`;
                    })
                    .join('');
        }
        
        // Store objectId for form submission
        modal.dataset.objectId = objectId;
        
        modal.style.display = 'block';
        overlay.style.display = 'block';
    } catch (error) {
        console.error('Failed to load objects:', error);
        showToast('Kunde inte ladda objekt', 'error');
    }
}

// Global function to save relation
async function saveRelation(event) {
    event.preventDefault();
    
    const modal = document.getElementById('relation-modal');
    const objectId = parseInt(modal.dataset.objectId);
    
    const targetObjectId = parseInt(document.getElementById('relation-target-object').value);
    const relationType = document.getElementById('relation-type').value;
    const description = document.getElementById('relation-description').value;
    
    if (!targetObjectId || !relationType) {
        showToast('Fyll i alla obligatoriska fält', 'error');
        return;
    }
    
    try {
        await ObjectsAPI.addRelation(objectId, {
            target_object_id: targetObjectId,
            relation_type: relationType,
            metadata: description ? { description } : {}
        });
        
        showToast('Relation skapad', 'success');
        closeModal();
        
        // Refresh relations if component exists
        const relationManager = window.currentRelationManager;
        if (relationManager) {
            await relationManager.refresh();
        }
        
        // Refresh tree view if it's active
        if (window.treeViewInstance && window.treeViewActive) {
            await window.treeViewInstance.refresh();
        }
        
        // Refresh detail view if it's showing
        if (window.currentObjectDetailComponent) {
            // Just refresh the relations, not the whole detail view
            await window.currentObjectDetailComponent.loadRelations();
        }
    } catch (error) {
        console.error('Failed to create relation:', error);
        showToast(error.message || 'Kunde inte skapa relation', 'error');
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
        
        // Refresh relations if component exists
        const relationManager = window.currentRelationManager;
        if (relationManager) {
            await relationManager.refresh();
        }
        
        // Refresh tree view if it's active
        if (window.treeViewInstance && window.treeViewActive) {
            await window.treeViewInstance.refresh();
        }
        
        // Refresh detail view if it's showing
        if (window.currentObjectDetailComponent) {
            // Just refresh the relations, not the whole detail view
            await window.currentObjectDetailComponent.loadRelations();
        }
    } catch (error) {
        console.error('Failed to delete relation:', error);
        showToast(error.message || 'Kunde inte ta bort relation', 'error');
    }
}
