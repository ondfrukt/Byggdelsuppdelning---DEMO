/**
 * Relation Manager Component
 * Manages relation entities between objects from both directions
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

    getLinkedObject(relation) {
        if (relation.direction === 'incoming') {
            return relation.source_object || {};
        }
        return relation.target_object || {};
    }

    renderRelations() {
        const listContainer = document.getElementById(`relations-list-${this.objectId}`);
        if (!listContainer) return;

        if (!this.relations || this.relations.length === 0) {
            listContainer.innerHTML = '<p class="empty-state">Inga relationer ännu</p>';
            return;
        }

        const grouped = {};
        this.relations.forEach(rel => {
            const key = `${rel.relation_type || 'Övriga'}|${rel.direction || 'outgoing'}`;
            if (!grouped[key]) grouped[key] = [];
            grouped[key].push(rel);
        });

        const html = Object.entries(grouped).map(([key, rels]) => {
            const [type, direction] = key.split('|');
            const heading = `${this.formatRelationType(type)} (${direction === 'incoming' ? 'inkommande' : 'utgående'})`;
            return `
                <div class="relations-section">
                    <div class="relations-section-header">
                        <h4>${heading}</h4>
                        <button class="btn btn-sm btn-primary" data-object-id="${this.objectId}" data-relation-type="${escapeHtml(type)}">
                            + Lägg till
                        </button>
                    </div>
                    <table class="relations-table">
                        <thead>
                            <tr>
                                <th>ID</th>
                                <th>Namn</th>
                                <th>Typ</th>
                                <th style="width: 50px;"></th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rels.map(rel => this.renderRelationRow(rel)).join('')}
                        </tbody>
                    </table>
                </div>
            `;
        }).join('');

        listContainer.innerHTML = html;

        listContainer.querySelectorAll('.btn-primary').forEach(btn => {
            btn.addEventListener('click', () => {
                const objectId = parseInt(btn.dataset.objectId);
                const relationType = btn.dataset.relationType;
                showAddRelationModal(objectId, relationType);
            });
        });

        listContainer.querySelectorAll('.relation-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const objectId = parseInt(link.dataset.objectId);
                if (typeof viewObjectDetail === 'function') viewObjectDetail(objectId);
            });
        });

        listContainer.querySelectorAll('.relation-delete-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const relationOwnerObjectId = parseInt(btn.dataset.ownerObjectId);
                const relationId = parseInt(btn.dataset.relationId);
                deleteRelation(relationOwnerObjectId, relationId);
            });
        });
    }

    renderRelationRow(relation) {
        const linkedObject = this.getLinkedObject(relation);
        const displayName = linkedObject.data?.namn ||
            linkedObject.data?.Namn ||
            linkedObject.data?.name ||
            linkedObject.auto_id ||
            'Okänt objekt';
        const autoId = linkedObject.auto_id || 'N/A';
        const typeName = linkedObject.object_type?.name || 'N/A';

        const linkedId = parseInt(linkedObject.id) || 0;
        const relationId = parseInt(relation.id) || 0;

        // API delete endpoint accepts either source or target object id
        const relationOwnerObjectId = relation.direction === 'incoming'
            ? parseInt(relation.target_object_id)
            : parseInt(relation.source_object_id);

        return `
            <tr class="relation-row">
                <td class="relation-id">
                    <a href="#" data-object-id="${linkedId}" class="relation-link">
                        ${escapeHtml(autoId)}
                    </a>
                </td>
                <td class="relation-name">
                    <strong>${escapeHtml(displayName)}</strong>
                    ${relation.metadata?.description ? `<br><small class="relation-description">${escapeHtml(relation.metadata.description)}</small>` : ''}
                </td>
                <td class="relation-type-cell">${escapeHtml(typeName)}</td>
                <td class="relation-actions-cell">
                    <button class="btn-icon btn-danger relation-delete-btn"
                            data-owner-object-id="${relationOwnerObjectId}"
                            data-relation-id="${relationId}"
                            aria-label="Ta bort relation med ${escapeHtml(displayName)}"
                            title="Ta bort">
                        <span aria-hidden="true">🗑️</span>
                        <span class="sr-only">Ta bort</span>
                    </button>
                </td>
            </tr>
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
            'relaterad_till': 'Relaterad till',
            'ingår_i': 'Ingår i'
        };
        return types[type] || type;
    }

    async refresh() {
        await this.loadRelations();
    }
}

// Helper function to refresh all views after relation changes
async function refreshAllViews() {
    try {
        const relationManager = window.currentRelationManager;
        if (relationManager) {
            await relationManager.refresh();
        }
    } catch (error) {
        console.error('Failed to refresh relation manager:', error);
    }

    try {
        if (window.treeViewInstance && window.treeViewActive) {
            await window.treeViewInstance.refresh();
        }
    } catch (error) {
        console.error('Failed to refresh tree view:', error);
    }

    try {
        if (window.currentObjectDetailComponent) {
            await window.currentObjectDetailComponent.loadRelations();
        }
    } catch (error) {
        console.error('Failed to refresh detail view relations:', error);
    }
}

async function showAddRelationModal(objectId, preSelectedType = null) {
    const modal = document.getElementById('relation-modal');
    const overlay = document.getElementById('modal-overlay');

    if (!modal || !overlay) {
        console.error('Relation modal not found');
        return;
    }

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

        const relationTypeSelect = document.getElementById('relation-type');
        if (relationTypeSelect && preSelectedType) {
            relationTypeSelect.value = preSelectedType;
        }

        modal.dataset.objectId = objectId;

        modal.style.display = 'block';
        overlay.style.display = 'block';
    } catch (error) {
        console.error('Failed to load objects:', error);
        showToast('Kunde inte ladda objekt', 'error');
    }
}

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
        await refreshAllViews();
    } catch (error) {
        console.error('Failed to create relation:', error);
        showToast(error.message || 'Kunde inte skapa relation', 'error');
    }
}

async function deleteRelation(objectId, relationId) {
    if (!confirm('Are you sure you want to remove this relationship?')) {
        return;
    }

    try {
        await ObjectsAPI.deleteRelation(objectId, relationId);
        showToast('Relation borttagen', 'success');
        await refreshAllViews();
    } catch (error) {
        console.error('Failed to delete relation:', error);
        showToast(error.message || 'Kunde inte ta bort relation', 'error');
    }
}
