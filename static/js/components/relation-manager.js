/**
 * Relation Manager Component
 * Manages relation entities between objects from both directions
 */

const RELATION_BASKET_LIMIT = 200;

const relationModalState = {
    sourceId: null,
    sourceIds: [],
    sourceObject: null,
    sourceObjects: [],
    preSelectedType: null,
    selectedType: '',
    search: '',
    page: 1,
    perPage: 25,
    totalPages: 1,
    items: [],
    filteredItems: [],
    basket: [],
    objectTypes: [],
    columnSearches: {},
    sortField: null,
    sortDirection: 'asc',
    focusableElements: [],
    focusHandler: null,
    keyHandler: null,
    previousFocus: null
};

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
                    <button class="btn btn-primary btn-sm relation-add-compact-btn" onclick="showAddRelationModal(${this.objectId})">
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
        return relation.direction === 'incoming' ? (relation.source_object || {}) : (relation.target_object || {});
    }

    isFileObjectType(typeName) {
        const normalized = (typeName || '').toLowerCase().trim();
        return normalized === 'filobjekt' || normalized === 'ritningsobjekt';
    }

    renderRelations() {
        const listContainer = document.getElementById(`relations-list-${this.objectId}`);
        if (!listContainer) return;

        const visibleRelations = (this.relations || []).filter(rel => {
            const linkedObject = this.getLinkedObject(rel);
            const linkedType = linkedObject?.object_type?.name || '';
            return !this.isFileObjectType(linkedType);
        });

        if (visibleRelations.length === 0) {
            listContainer.innerHTML = '<p class="empty-state">Inga relationer ännu</p>';
            return;
        }

        const sortedRelations = [...visibleRelations].sort((a, b) => {
            const aObj = this.getLinkedObject(a);
            const bObj = this.getLinkedObject(b);
            const aType = String(aObj?.object_type?.name || '');
            const bType = String(bObj?.object_type?.name || '');
            const typeCompare = aType.localeCompare(bType, 'sv', { sensitivity: 'base' });
            if (typeCompare !== 0) return typeCompare;

            const aName = String(aObj?.data?.namn || aObj?.data?.Namn || aObj?.data?.name || aObj?.auto_id || '');
            const bName = String(bObj?.data?.namn || bObj?.data?.Namn || bObj?.data?.name || bObj?.auto_id || '');
            return aName.localeCompare(bName, 'sv', { sensitivity: 'base' });
        });

        listContainer.innerHTML = `
            <div class="table-container relation-compact-table-container">
                <table class="data-table relation-compact-table">
                    <thead>
                        <tr>
                            <th class="col-id">ID</th>
                            <th class="col-name">Namn</th>
                            <th class="col-type">Typ</th>
                            <th class="col-actions"></th>
                        </tr>
                    </thead>
                    <tbody>${sortedRelations.map(rel => this.renderRelationRow(rel)).join('')}</tbody>
                </table>
            </div>
        `;

        listContainer.querySelectorAll('.relation-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const objectId = parseInt(link.dataset.objectId, 10);
                if (typeof viewObjectDetail === 'function') viewObjectDetail(objectId);
            });
        });

        listContainer.querySelectorAll('.relation-delete-btn').forEach(btn => {
            btn.addEventListener('click', () => deleteRelation(parseInt(btn.dataset.ownerObjectId, 10), parseInt(btn.dataset.relationId, 10)));
        });
    }

    renderRelationRow(relation) {
        const linkedObject = this.getLinkedObject(relation);
        const displayName = linkedObject.data?.namn || linkedObject.data?.Namn || linkedObject.data?.name || linkedObject.auto_id || 'Okänt objekt';
        const autoId = linkedObject.auto_id || 'N/A';
        const typeName = linkedObject.object_type?.name || 'N/A';
        const relationOwnerObjectId = relation.direction === 'incoming' ? parseInt(relation.target_object_id, 10) : parseInt(relation.source_object_id, 10);

        return `
            <tr class="relation-row">
                <td class="col-id relation-id"><a href="#" data-object-id="${parseInt(linkedObject.id || 0, 10)}" class="relation-link">${escapeHtml(autoId)}</a></td>
                <td class="col-name relation-name"><strong>${escapeHtml(displayName)}</strong></td>
                <td class="col-type relation-type-cell">${escapeHtml(typeName)}</td>
                <td class="col-actions relation-actions-cell">
                    <button class="btn-icon btn-danger relation-delete-btn" data-owner-object-id="${relationOwnerObjectId}" data-relation-id="${parseInt(relation.id || 0, 10)}" aria-label="Ta bort relation med ${escapeHtml(displayName)}" title="Ta bort">
                        <span aria-hidden="true">🗑️</span><span class="sr-only">Ta bort</span>
                    </button>
                </td>
            </tr>
        `;
    }

    async refresh() {
        await this.loadRelations();
    }
}

function setRelationModalFeedback(message = '', type = 'error') {
    const feedback = document.getElementById('relation-modal-feedback');
    if (!feedback) return;
    feedback.className = `relation-feedback ${type === 'success' ? 'relation-result-success' : type === 'error' ? 'relation-result-error' : ''}`;
    feedback.textContent = message;
}

function getObjectDisplayName(obj) {
    return obj?.data?.namn || obj?.data?.Namn || obj?.data?.name || obj?.data?.Name || obj?.auto_id || 'Okänt objekt';
}

function isFileObjectType(typeName) {
    const normalized = (typeName || '').toLowerCase().trim();
    return normalized === 'filobjekt' || normalized === 'ritningsobjekt';
}

function renderRelationModalSourceContext() {
    const sourceElement = document.getElementById('relation-modal-source');
    if (!sourceElement) return;

    const sourceIds = Array.isArray(relationModalState.sourceIds) ? relationModalState.sourceIds : [];
    if (sourceIds.length > 1) {
        const labels = relationModalState.sourceObjects
            .map(sourceObject => `${sourceObject.auto_id || sourceObject.id} • ${getObjectDisplayName(sourceObject)}`)
            .slice(0, 3);
        const summary = labels.length ? labels.join(', ') : sourceIds.map(id => `ID ${id}`).slice(0, 3).join(', ');
        const extraCount = Math.max(sourceIds.length - 3, 0);
        sourceElement.textContent = `Källobjekt (${sourceIds.length}): ${summary}${extraCount > 0 ? ` +${extraCount} till` : ''}`;
        return;
    }

    if (!relationModalState.sourceObject) {
        sourceElement.textContent = relationModalState.sourceId
            ? `Objekt-ID: ${relationModalState.sourceId}`
            : '';
        return;
    }

    const sourceObject = relationModalState.sourceObject;
    const autoId = sourceObject.auto_id || relationModalState.sourceId;
    const displayName = getObjectDisplayName(sourceObject);
    sourceElement.textContent = `Källobjekt: ${autoId} • ${displayName}`;
}

function setupRelationModalA11y(modal) {
    relationModalState.previousFocus = document.activeElement;
    relationModalState.focusableElements = Array.from(modal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'));

    relationModalState.keyHandler = (event) => {
        if (event.key === 'Escape') {
            event.preventDefault();
            closeRelationModal();
            return;
        }
        if (event.key === 'Tab' && relationModalState.focusableElements.length > 0) {
            const first = relationModalState.focusableElements[0];
            const last = relationModalState.focusableElements[relationModalState.focusableElements.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        }
    };

    modal.addEventListener('keydown', relationModalState.keyHandler);
    if (relationModalState.focusableElements.length > 0) {
        relationModalState.focusableElements[0].focus();
    }
}

function cleanupRelationModalA11y(modal) {
    if (relationModalState.keyHandler) {
        modal.removeEventListener('keydown', relationModalState.keyHandler);
    }
    relationModalState.keyHandler = null;
    relationModalState.focusableElements = [];
    if (relationModalState.previousFocus && typeof relationModalState.previousFocus.focus === 'function') {
        relationModalState.previousFocus.focus();
    }
    relationModalState.previousFocus = null;
}

async function loadRelationCandidates() {
    const result = await ObjectsAPI.getAllPaginated({
        type: relationModalState.selectedType,
        minimal: true
    });

    const loadedItems = Array.isArray(result) ? result : (result.items || []);
    const sourceIdSet = new Set((relationModalState.sourceIds || []).map(id => Number(id)));
    relationModalState.items = loadedItems.filter(item => {
        if (sourceIdSet.has(Number(item.id))) return false;
        return !isFileObjectType(item?.object_type?.name);
    });
}

function getRelationTableColumns() {
    const selectedType = relationModalState.objectTypes.find(type => type.name === relationModalState.selectedType);
    const dynamicField = selectedType?.fields?.find(field => field.field_name !== 'namn' && field.field_name !== 'name');
    const dynamicLabel = dynamicField?.display_name || 'Beskrivning';

    return [
        { field: 'display_name', label: 'Namn', sortType: 'text' },
        { field: 'type', label: 'Typ', sortType: 'text' },
        { field: 'dynamic', label: dynamicLabel, sortType: 'text', dynamicFieldName: dynamicField?.field_name },
        { field: 'actions', label: 'Välj', sortable: false }
    ];
}

function getRelationCellValue(item, column) {
    if (column.field === 'display_name') return getObjectDisplayName(item);
    if (column.field === 'type') return item.object_type?.name || '-';
    if (column.field === 'dynamic') {
        if (column.dynamicFieldName) return String(item.data?.[column.dynamicFieldName] || '-');
        return String(item.data?.beskrivning || item.data?.description || '-');
    }
    return '';
}

function applyRelationTableFilters() {
    const globalTerm = relationModalState.search.trim().toLowerCase();

    let items = relationModalState.items.filter(item => {
        if (!globalTerm) return true;

        const searchableValues = [
            getObjectDisplayName(item),
            item.auto_id || '',
            item.object_type?.name || '',
            item.data?.namn || '',
            item.data?.name || '',
            item.data?.beskrivning || '',
            item.data?.description || ''
        ];

        return searchableValues.some(value => String(value).toLowerCase().includes(globalTerm));
    });

    const columns = getRelationTableColumns();
    for (const [field, searchTerm] of Object.entries(relationModalState.columnSearches)) {
        if (!searchTerm) continue;
        const column = columns.find(col => col.field === field);
        if (!column) continue;
        const term = searchTerm.toLowerCase();
        items = items.filter(item => String(getRelationCellValue(item, column)).toLowerCase().includes(term));
    }

    if (relationModalState.sortField) {
        const column = columns.find(col => col.field === relationModalState.sortField);
        if (column?.sortable !== false) {
            const directionMultiplier = relationModalState.sortDirection === 'asc' ? 1 : -1;
            items = [...items].sort((a, b) => {
                const aValue = String(getRelationCellValue(a, column) || '');
                const bValue = String(getRelationCellValue(b, column) || '');
                return aValue.localeCompare(bValue, 'sv', { sensitivity: 'base' }) * directionMultiplier;
            });
        }
    }

    relationModalState.filteredItems = items;
    relationModalState.totalPages = Math.max(Math.ceil(items.length / relationModalState.perPage), 1);
    relationModalState.page = Math.min(relationModalState.page, relationModalState.totalPages);
}

function renderRelationTable() {
    const header = document.getElementById('relation-table-headers');
    const searchRow = document.getElementById('relation-table-search-row');
    const tbody = document.getElementById('relation-object-table-body');
    if (!header || !searchRow || !tbody) return;

    const columns = getRelationTableColumns();

    header.innerHTML = columns.map(column => {
        if (column.sortable === false) {
            return `<th>${escapeHtml(column.label)}</th>`;
        }
        const indicator = relationModalState.sortField === column.field
            ? (relationModalState.sortDirection === 'asc' ? '↑' : '↓')
            : '↕';

        return `<th data-sortable="true" data-field="${column.field}" style="cursor: pointer;">${escapeHtml(column.label)} <span class="sort-indicator">${indicator}</span></th>`;
    }).join('');

    searchRow.classList.add('column-search-row');
    searchRow.innerHTML = columns.map(column => {
        if (column.sortable === false) return '<th></th>';
        return `
            <th>
                <input type="text"
                       class="column-search-input"
                       placeholder="Sök..."
                       data-field="${column.field}"
                       value="${escapeHtml(relationModalState.columnSearches[column.field] || '')}">
            </th>
        `;
    }).join('');

    const startIndex = (relationModalState.page - 1) * relationModalState.perPage;
    const endIndex = startIndex + relationModalState.perPage;
    const pageItems = relationModalState.filteredItems.slice(startIndex, endIndex);

    if (pageItems.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="empty-state">Inga objekt hittades.</td></tr>';
        return;
    }

    tbody.innerHTML = pageItems.map(item => {
        const inBasket = relationModalState.basket.some(b => b.id === item.id);
        const dynamicValue = getRelationCellValue(item, columns[2]);
        return `
            <tr tabindex="0" role="button" class="relation-select-row" data-id="${item.id}" aria-label="Välj ${escapeHtml(getObjectDisplayName(item))}">
                <td>${escapeHtml(getObjectDisplayName(item))}</td>
                <td>${escapeHtml(item.object_type?.name || '-')}</td>
                <td>${escapeHtml(String(dynamicValue))}</td>
                <td>
                    <button
                        type="button"
                        class="btn btn-primary btn-sm relation-add-btn ${inBasket ? 'is-added' : ''}"
                        data-id="${item.id}"
                        aria-label="${inBasket ? `Redan tillagd: ${escapeHtml(getObjectDisplayName(item))}` : `Lägg till ${escapeHtml(getObjectDisplayName(item))}`}"
                        ${inBasket ? 'disabled' : ''}
                    >${inBasket ? '✓' : '+'}</button>
                </td>
            </tr>
        `;
    }).join('');

    header.querySelectorAll('th[data-sortable="true"]').forEach(headerCell => {
        headerCell.addEventListener('click', () => {
            const field = headerCell.dataset.field;
            if (relationModalState.sortField === field) {
                relationModalState.sortDirection = relationModalState.sortDirection === 'asc' ? 'desc' : 'asc';
            } else {
                relationModalState.sortField = field;
                relationModalState.sortDirection = 'asc';
            }
            applyRelationTableFilters();
            renderRelationTable();
            if (typeof relationModalState.updatePagination === 'function') {
                relationModalState.updatePagination();
            }
        });
    });

    searchRow.querySelectorAll('.column-search-input').forEach(input => {
        input.addEventListener('input', (event) => {
            const field = event.target.dataset.field;
            relationModalState.columnSearches[field] = event.target.value;
            relationModalState.page = 1;
            applyRelationTableFilters();
            renderRelationTable();
            if (typeof relationModalState.updatePagination === 'function') {
                relationModalState.updatePagination();
            }
        });
    });

    tbody.querySelectorAll('.relation-add-btn').forEach(btn => {
        btn.addEventListener('click', () => addToBasket(parseInt(btn.dataset.id, 10)));
    });

    tbody.querySelectorAll('.relation-select-row').forEach(row => {
        row.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                addToBasket(parseInt(row.dataset.id, 10));
            }
        });
    });
}

function addToBasket(objectId) {
    const object = relationModalState.items.find(item => item.id === objectId);
    if (!object) return;

    if (relationModalState.basket.some(item => item.id === objectId)) {
        setRelationModalFeedback('Objektet finns redan i korgen.');
        return;
    }
    if (relationModalState.basket.length >= RELATION_BASKET_LIMIT) {
        setRelationModalFeedback(`Max ${RELATION_BASKET_LIMIT} objekt i korgen.`);
        return;
    }

    relationModalState.basket.push(object);
    renderBasket();
    renderRelationTable();
    setRelationModalFeedback('Objekt tillagt i korgen.', 'success');
}

function removeFromBasket(objectId) {
    relationModalState.basket = relationModalState.basket.filter(item => item.id !== objectId);
    renderBasket();
    renderRelationTable();
}

function renderBasket() {
    const list = document.getElementById('relation-basket-list');
    const count = document.getElementById('relation-basket-count');
    if (!list || !count) return;

    count.textContent = String(relationModalState.basket.length);

    if (relationModalState.basket.length === 0) {
        list.innerHTML = '<p class="empty-state" style="padding: 8px;">Inga valda objekt.</p>';
        return;
    }

    list.innerHTML = relationModalState.basket.map(item => `
        <div class="basket-item">
            <div class="basket-item-main">
                <strong class="basket-item-title">${escapeHtml(getObjectDisplayName(item))}</strong>
                <small class="basket-item-meta">ID: ${item.id} • ${escapeHtml(item.object_type?.name || '-')}</small>
            </div>
            <button type="button" class="basket-remove-btn" data-id="${item.id}" aria-label="Ta bort ${escapeHtml(getObjectDisplayName(item))}">✕</button>
        </div>
    `).join('');

    list.querySelectorAll('.basket-remove-btn').forEach(button => {
        button.addEventListener('click', () => removeFromBasket(parseInt(button.dataset.id, 10)));
    });
}

function bindRelationModalEvents() {
    const searchInput = document.getElementById('relation-object-search');
    const typeFilter = document.getElementById('relation-object-type-filter');
    const prevButton = document.getElementById('relation-prev-page');
    const nextButton = document.getElementById('relation-next-page');
    const pageLabel = document.getElementById('relation-page-label');
    const clearBasket = document.getElementById('relation-clear-basket');

    if (searchInput) {
        searchInput.addEventListener('input', async (event) => {
            relationModalState.search = event.target.value;
            relationModalState.page = 1;
            await refreshCandidatesAndRender();
        });
    }

    if (typeFilter) {
        typeFilter.addEventListener('change', async (event) => {
            relationModalState.selectedType = event.target.value;
            relationModalState.page = 1;
            await refreshCandidatesAndRender();
        });
    }

    if (prevButton) {
        prevButton.addEventListener('click', async () => {
            if (relationModalState.page <= 1) return;
            relationModalState.page -= 1;
            await refreshCandidatesAndRender();
        });
    }

    if (nextButton) {
        nextButton.addEventListener('click', async () => {
            if (relationModalState.page >= relationModalState.totalPages) return;
            relationModalState.page += 1;
            await refreshCandidatesAndRender();
        });
    }

    if (clearBasket) {
        clearBasket.addEventListener('click', () => {
            relationModalState.basket = [];
            renderBasket();
            renderRelationTable();
            setRelationModalFeedback('Korgen rensades.', 'success');
        });
    }

    const updatePagination = () => {
        pageLabel.textContent = `Sida ${relationModalState.page} av ${relationModalState.totalPages}`;
        prevButton.disabled = relationModalState.page <= 1;
        nextButton.disabled = relationModalState.page >= relationModalState.totalPages;
    };

    relationModalState.updatePagination = updatePagination;
}

async function refreshCandidatesAndRender() {
    await loadRelationCandidates();
    applyRelationTableFilters();
    renderRelationTable();
    renderBasket();
    if (typeof relationModalState.updatePagination === 'function') {
        relationModalState.updatePagination();
    }
}

async function showAddRelationModal(objectIdOrIds) {
    const modal = document.getElementById('relation-modal');
    const overlay = document.getElementById('modal-overlay');
    if (!modal || !overlay) return;

    const normalizedSourceIds = Array.isArray(objectIdOrIds) ? objectIdOrIds : [objectIdOrIds];
    relationModalState.sourceIds = Array.from(new Set(
        normalizedSourceIds
            .map(id => Number(id))
            .filter(id => Number.isFinite(id) && id > 0)
    ));
    relationModalState.sourceId = relationModalState.sourceIds[0] || null;
    relationModalState.sourceObject = null;
    relationModalState.sourceObjects = [];
    relationModalState.selectedType = '';
    relationModalState.search = '';
    relationModalState.page = 1;
    relationModalState.basket = [];
    relationModalState.columnSearches = {};
    relationModalState.sortField = null;
    relationModalState.sortDirection = 'asc';

    try {
        if (!relationModalState.sourceIds.length) {
            showToast('Minst ett källobjekt krävs för att skapa relationer', 'error');
            return;
        }

        relationModalState.sourceObjects = (await Promise.all(
            relationModalState.sourceIds.map(async (sourceId) => {
                try {
                    return await ObjectsAPI.getById(sourceId);
                } catch (sourceError) {
                    console.warn('Failed to load source object for relation modal context:', sourceId, sourceError);
                    return null;
                }
            })
        )).filter(Boolean);
        relationModalState.sourceObject = relationModalState.sourceObjects[0] || null;
        if (relationModalState.sourceIds.length === 1 && !relationModalState.sourceObject) {
            showToast('Kunde inte läsa källobjekt för relationer', 'error');
            return;
        }
        renderRelationModalSourceContext();

        relationModalState.objectTypes = (await ObjectTypesAPI.getAll(true)).filter(type => !isFileObjectType(type.name));

        const typeFilter = document.getElementById('relation-object-type-filter');
        if (typeFilter) {
            typeFilter.innerHTML = '<option value="">Alla objekttyper</option>' + relationModalState.objectTypes.map(type => `<option value="${escapeHtml(type.name)}">${escapeHtml(type.name)}</option>`).join('');
        }

        modal.dataset.objectId = String(relationModalState.sourceId || '');
        overlay.style.display = 'block';
        modal.style.display = 'block';
        bindRelationModalEvents();
        setupRelationModalA11y(modal);
        await refreshCandidatesAndRender();
        setRelationModalFeedback('');
    } catch (error) {
        console.error('Failed to open relation modal:', error);
        showToast('Kunde inte öppna relationpanelen', 'error');
    }
}

function closeRelationModal() {
    const modal = document.getElementById('relation-modal');
    const overlay = document.getElementById('modal-overlay');
    if (!modal || !overlay) return;

    cleanupRelationModalA11y(modal);
    overlay.style.display = 'none';
    modal.style.display = 'none';
    relationModalState.sourceObject = null;
    relationModalState.sourceObjects = [];
    relationModalState.sourceIds = [];
    relationModalState.sourceId = null;
    document.getElementById('relation-form')?.reset();
    renderRelationModalSourceContext();
    setRelationModalFeedback('');
}

async function saveRelation(event) {
    event.preventDefault();

    const sourceIds = (relationModalState.sourceIds || [])
        .map(id => Number(id))
        .filter(id => Number.isFinite(id) && id > 0);
    const note = document.getElementById('relation-metadata-note')?.value?.trim();
    const description = document.getElementById('relation-description')?.value?.trim();

    if (!sourceIds.length) {
        setRelationModalFeedback('Källobjekt krävs.');
        return;
    }

    if (relationModalState.basket.length === 0) {
        setRelationModalFeedback('Lägg till minst ett objekt i korgen innan du kopplar.');
        return;
    }

    const relationsPayload = relationModalState.basket.map(item => ({
        targetId: item.id,
        metadata: {
            ...(note ? { note } : {}),
            ...(description ? { description } : {})
        }
    }));

    try {
        let createdCount = 0;
        let failedCount = 0;
        let requestFailures = 0;

        for (const sourceId of sourceIds) {
            try {
                const result = await ObjectsAPI.addRelationsBatch({ sourceId, relations: relationsPayload });
                createdCount += result?.summary?.created || 0;
                failedCount += result?.summary?.failed || 0;
            } catch (error) {
                requestFailures += 1;
                failedCount += relationsPayload.length;
                console.error(`Failed to create relations for source object ${sourceId}:`, error);
            }
        }

        const totalRequested = sourceIds.length * relationsPayload.length;
        const totalFailed = failedCount;

        if (totalFailed > 0) {
            const failureSuffix = requestFailures > 0
                ? ` (${requestFailures} källobjekt kunde inte nå API:t)`
                : '';
            setRelationModalFeedback(`Skapade ${createdCount} av ${totalRequested} relation(er), ${totalFailed} misslyckades${failureSuffix}.`, 'error');
        } else {
            showToast(`Skapade ${createdCount} relation(er) från ${sourceIds.length} källobjekt.`, 'success');
            closeRelationModal();
        }

        await refreshAllViews();
    } catch (error) {
        console.error('Failed to create relations:', error);
        setRelationModalFeedback(error.message || 'Kunde inte koppla relationer.');
    }
}

async function deleteRelation(objectId, relationId) {
    if (!confirm('Är du säker på att du vill ta bort relationen?')) return;

    try {
        await ObjectsAPI.deleteRelation(objectId, relationId);
        showToast('Relation borttagen', 'success');
        await refreshAllViews();
    } catch (error) {
        console.error('Failed to delete relation:', error);
        showToast(error.message || 'Kunde inte ta bort relation', 'error');
    }
}

async function refreshAllViews() {
    try {
        const relationManager = window.currentRelationManager;
        if (relationManager) await relationManager.refresh();
    } catch (error) {
        console.error('Failed to refresh relation manager:', error);
    }

    try {
        if (window.treeViewInstance && window.treeViewActive) await window.treeViewInstance.refresh();
    } catch (error) {
        console.error('Failed to refresh tree view:', error);
    }

    try {
        if (window.currentObjectDetailComponent) await window.currentObjectDetailComponent.loadRelations();
    } catch (error) {
        console.error('Failed to refresh detail view relations:', error);
    }
}
