/**
 * Relation Manager Component
 * Manages relation entities between objects from both directions
 */

const RELATION_BASKET_LIMIT = 200;

const relationModalState = {
    sourceId: null,
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
        return relation.direction === 'incoming' ? (relation.source_object || {}) : (relation.target_object || {});
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

        listContainer.innerHTML = Object.entries(grouped).map(([key, rels]) => {
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
                        <thead><tr><th>ID</th><th>Namn</th><th>Typ</th><th style="width: 50px;"></th></tr></thead>
                        <tbody>${rels.map(rel => this.renderRelationRow(rel)).join('')}</tbody>
                    </table>
                </div>
            `;
        }).join('');

        listContainer.querySelectorAll('.btn-primary').forEach(btn => {
            btn.addEventListener('click', () => showAddRelationModal(parseInt(btn.dataset.objectId, 10), btn.dataset.relationType));
        });

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
                <td class="relation-id"><a href="#" data-object-id="${parseInt(linkedObject.id || 0, 10)}" class="relation-link">${escapeHtml(autoId)}</a></td>
                <td class="relation-name"><strong>${escapeHtml(displayName)}</strong></td>
                <td class="relation-type-cell">${escapeHtml(typeName)}</td>
                <td class="relation-actions-cell">
                    <button class="btn-icon btn-danger relation-delete-btn" data-owner-object-id="${relationOwnerObjectId}" data-relation-id="${parseInt(relation.id || 0, 10)}" aria-label="Ta bort relation med ${escapeHtml(displayName)}" title="Ta bort">
                        <span aria-hidden="true">🗑️</span><span class="sr-only">Ta bort</span>
                    </button>
                </td>
            </tr>
        `;
    }

    formatRelationType(type) {
        const types = {
            'består_av': 'Består av', 'variant_av': 'Variant av', 'ersätter': 'Ersätter', 'ersätts_av': 'Ersätts av',
            'kopplas_till': 'Kopplas till', 'dokumenterar': 'Dokumenterar', 'specificerar': 'Specificerar',
            'relaterad_till': 'Relaterad till', 'ingår_i': 'Ingår i'
        };
        return types[type] || type;
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
    relationModalState.items = loadedItems.filter(item => item.id !== relationModalState.sourceId);
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

async function showAddRelationModal(objectId, preSelectedType = null) {
    const modal = document.getElementById('relation-modal');
    const overlay = document.getElementById('modal-overlay');
    if (!modal || !overlay) return;

    relationModalState.sourceId = objectId;
    relationModalState.preSelectedType = preSelectedType;
    relationModalState.selectedType = '';
    relationModalState.search = '';
    relationModalState.page = 1;
    relationModalState.basket = [];
    relationModalState.columnSearches = {};
    relationModalState.sortField = null;
    relationModalState.sortDirection = 'asc';

    try {
        relationModalState.objectTypes = await ObjectTypesAPI.getAll(true);

        const typeFilter = document.getElementById('relation-object-type-filter');
        if (typeFilter) {
            typeFilter.innerHTML = '<option value="">Alla objekttyper</option>' + relationModalState.objectTypes.map(type => `<option value="${escapeHtml(type.name)}">${escapeHtml(type.name)}</option>`).join('');
            if (preSelectedType) {
                typeFilter.value = preSelectedType;
                relationModalState.selectedType = preSelectedType;
            }
        }

        const relationTypeSelect = document.getElementById('relation-type');
        if (relationTypeSelect && preSelectedType) {
            relationTypeSelect.value = preSelectedType;
        }

        modal.dataset.objectId = String(objectId);
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
    document.getElementById('relation-form')?.reset();
    setRelationModalFeedback('');
}

async function saveRelation(event) {
    event.preventDefault();

    const modal = document.getElementById('relation-modal');
    const objectId = parseInt(modal?.dataset.objectId || '0', 10);
    const relationType = document.getElementById('relation-type')?.value;
    const note = document.getElementById('relation-metadata-note')?.value?.trim();
    const description = document.getElementById('relation-description')?.value?.trim();

    if (!objectId || !relationType) {
        setRelationModalFeedback('Källobjekt och relationstyp krävs.');
        return;
    }

    if (relationModalState.basket.length === 0) {
        setRelationModalFeedback('Lägg till minst ett objekt i korgen innan du kopplar.');
        return;
    }

    const relationsPayload = relationModalState.basket.map(item => ({
        targetId: item.id,
        relationType,
        metadata: {
            ...(note ? { note } : {}),
            ...(description ? { description } : {})
        }
    }));

    try {
        const result = await ObjectsAPI.addRelationsBatch({ sourceId: objectId, relations: relationsPayload });
        const createdCount = result?.summary?.created || 0;
        const failedCount = result?.summary?.failed || 0;

        if (failedCount > 0) {
            setRelationModalFeedback(`Skapade ${createdCount} relation(er), ${failedCount} misslyckades.`, 'error');
        } else {
            showToast(`Skapade ${createdCount} relation(er).`, 'success');
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
