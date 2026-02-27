/**
 * Main Application - Object-based Byggdelssystem
 */

let currentView = 'objects';
let currentObjectId = null;
let currentObjectListComponent = null;
let currentObjectDetailComponent = null;
let currentDetailPanelInstance = null;
let currentFileObjectsViewComponent = null;
window.currentSelectedObjectId = null;
let detailHistory = [];
let detailHistoryIndex = -1;
const DETAIL_HISTORY_STORAGE_KEY = 'detail_panel_history_v1';
window.currentDuplicateContext = null;
window.currentCreateObjectRelations = [];

// Initialize global window properties for cross-component access
window.treeViewActive = false;
window.treeViewInstance = null;
window.sidePanelInstance = null;

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
    restoreDetailHistory();
    ensureDetailHistoryControls();
    updateDetailHistoryButtons();
    await loadObjectsView();
});

// Initialize navigation
function initializeNavigation() {
    ensureTreeNavButton();
    const navBtns = document.querySelectorAll('.nav-btn');
    
    navBtns.forEach(btn => {
        btn.addEventListener('click', async () => {
            const view = btn.dataset.view;
            await switchView(view);
        });
    });
}

function ensureTreeNavButton() {
    const nav = document.querySelector('.nav');
    if (!nav) return;

    const hasTreeButton = Array.from(nav.querySelectorAll('.nav-btn'))
        .some(btn => btn.dataset.view === 'tree');
    if (hasTreeButton) return;

    const treeBtn = document.createElement('button');
    treeBtn.className = 'nav-btn';
    treeBtn.dataset.view = 'tree';
    treeBtn.textContent = 'Trädvy';

    const adminBtn = nav.querySelector('.nav-btn[data-view="admin"]');
    if (adminBtn) {
        nav.insertBefore(treeBtn, adminBtn);
    } else {
        nav.appendChild(treeBtn);
    }
}

// Switch between views
async function switchView(viewName) {
    currentView = viewName;
    updateNavigation(viewName);
    resetDetailHistory();
    closeDetailPanel();
    
    switch (viewName) {
        case 'objects':
            showView('objects-view');
            await loadObjectsView({
                objectType: null,
                title: 'Objekt',
                showCreateButton: true
            });
            break;
        case 'file-objects':
            showView('objects-view');
            await loadFileObjectsView();
            break;
        case 'tree':
            showView('objects-view');
            await loadTreeViewPage();
            break;
        case 'admin':
            showView('admin-view');
            closeDetailPanel();
            await loadAdminView();
            break;
    }
}

function updateTreeToggleButtonLabel() {
    const toggleButton = document.getElementById('toggle-tree-view-btn');
    if (!toggleButton) return;
    toggleButton.textContent = treeViewActive ? 'Objektvy' : 'Trädvy';
}

function updateObjectsWorkspaceHeader(options = {}) {
    const {
        title = 'Objekt',
        showCreateButton = true,
        createButtonLabel = 'Skapa Objekt',
        createButtonAction = 'showCreateObjectModal()'
    } = options;

    const objectsView = document.getElementById('objects-view');
    if (!objectsView) return;

    let titleElement = document.getElementById('objects-view-title');
    if (!titleElement) {
        titleElement = objectsView.querySelector('.view-header h2');
        if (titleElement) titleElement.id = 'objects-view-title';
    }

    const actionsContainer = objectsView.querySelector('.view-header-actions');
    if (!actionsContainer) return;

    if (titleElement) {
        titleElement.textContent = title;
    }

    // Normalize legacy markup: keep only one action button in this workspace header.
    Array.from(actionsContainer.querySelectorAll('button')).forEach(button => {
        if (button.id !== 'objects-create-btn') {
            button.remove();
        }
    });

    let createButton = document.getElementById('objects-create-btn');
    if (!createButton) {
        createButton = document.createElement('button');
        createButton.id = 'objects-create-btn';
        createButton.className = 'btn btn-primary';
        actionsContainer.appendChild(createButton);
    }

    createButton.style.display = showCreateButton ? 'inline-flex' : 'none';
    createButton.textContent = createButtonLabel;
    createButton.setAttribute('onclick', createButtonAction);
}

// Load objects view
async function loadObjectsView(options = {}) {
    const {
        objectType = null,
        title = 'Objekt',
        showCreateButton = true,
        createButtonLabel = 'Skapa Objekt',
        createButtonAction = 'showCreateObjectModal()'
    } = options;

    const objectListWrapper = document.getElementById('objects-container-wrapper');
    const treeWrapper = document.getElementById('tree-view-wrapper');
    if (!objectListWrapper) return;

    // Create container for object list if it doesn't exist
    if (!document.getElementById('objects-container')) {
        objectListWrapper.innerHTML = '<div id="objects-container"></div>';
    }
    
    updateObjectsWorkspaceHeader({
        title,
        showCreateButton,
        createButtonLabel,
        createButtonAction
    });

    // Show list view by default
    treeViewActive = false;
    window.treeViewActive = false;
    updateTreeToggleButtonLabel();

    objectListWrapper.style.display = 'block';
    if (treeWrapper) treeWrapper.style.display = 'none';
    
    currentObjectListComponent = new ObjectListComponent('objects-container', objectType);
    await currentObjectListComponent.render();
}

async function loadFileObjectsView() {
    await loadObjectsView({
        objectType: 'Filobjekt',
        title: 'Filobjekt',
        showCreateButton: true,
        createButtonLabel: 'Lägg till filer',
        createButtonAction: 'showCreateFileObjectModal()'
    });
}

// Toggle tree view
let treeViewActive = false;
let treeViewInstance = null;

function updateDetailPanelHeader(object) {
    const panelTitle = document.getElementById('detail-panel-title');
    const panelCategory = document.getElementById('detail-panel-category');

    const displayName =
        object?.data?.Namn ||
        object?.data?.namn ||
        object?.data?.Name ||
        object?.data?.name ||
        object?.data?.title ||
        object?.id_full ||
        object?.auto_id ||
        'Objektdetaljer';

    if (panelTitle) {
        panelTitle.textContent = displayName;
    }

    if (panelCategory) {
        panelCategory.textContent = `Kategori: ${object?.object_type?.name || '-'}`;
    }

    updateDetailHistoryButtons();
}

function applySelectedRowHighlight() {
    const selectedId = String(window.currentSelectedObjectId ?? '');
    document.querySelectorAll('.data-table tbody tr[data-object-id]').forEach(row => {
        const isSelected = row.dataset.objectId === selectedId;
        row.classList.toggle('selected-object-row', isSelected);
        row.setAttribute('aria-selected', isSelected ? 'true' : 'false');
    });
}

function setSelectedDetailObject(objectId) {
    const normalizedId = objectId !== null && objectId !== undefined ? Number(objectId) : null;
    currentObjectId = normalizedId;
    window.currentSelectedObjectId = normalizedId;
    applySelectedRowHighlight();

    if (window.treeViewInstance?.setSelectedObjectId) {
        window.treeViewInstance.setSelectedObjectId(normalizedId);
    }

    updateDetailHistoryButtons();
}

window.applySelectedRowHighlight = applySelectedRowHighlight;
window.setSelectedDetailObject = setSelectedDetailObject;
window.navigateDetailHistory = navigateDetailHistory;

function ensureDetailHistoryControls() {
    const header = document.querySelector('#detail-panel .detail-panel-header');
    if (!header) return;

    let actions = header.querySelector('.detail-panel-header-actions');
    if (!actions) {
        actions = document.createElement('div');
        actions.className = 'detail-panel-header-actions';

        const closeBtn = header.querySelector('.detail-panel-close');
        if (closeBtn) {
            header.insertBefore(actions, closeBtn);
            actions.appendChild(closeBtn);
        } else {
            header.appendChild(actions);
        }
    }

    let backBtn = document.getElementById('detail-nav-back');
    if (!backBtn) {
        backBtn = document.createElement('button');
        backBtn.id = 'detail-nav-back';
        backBtn.className = 'detail-panel-nav-btn';
        backBtn.type = 'button';
        backBtn.title = 'Föregående objekt';
        backBtn.setAttribute('aria-label', 'Föregående objekt');
        backBtn.disabled = true;
        backBtn.textContent = '←';
        backBtn.addEventListener('click', () => navigateDetailHistory(-1));
        actions.insertBefore(backBtn, actions.firstChild);
    }

    let forwardBtn = document.getElementById('detail-nav-forward');
    if (!forwardBtn) {
        forwardBtn = document.createElement('button');
        forwardBtn.id = 'detail-nav-forward';
        forwardBtn.className = 'detail-panel-nav-btn';
        forwardBtn.type = 'button';
        forwardBtn.title = 'Nästa objekt';
        forwardBtn.setAttribute('aria-label', 'Nästa objekt');
        forwardBtn.disabled = true;
        forwardBtn.textContent = '→';
        forwardBtn.addEventListener('click', () => navigateDetailHistory(1));
        actions.insertBefore(forwardBtn, backBtn.nextSibling);
    }

    let editBtn = document.getElementById('detail-nav-edit');
    if (!editBtn) {
        editBtn = document.createElement('button');
        editBtn.id = 'detail-nav-edit';
        editBtn.className = 'detail-panel-nav-btn';
        editBtn.type = 'button';
        editBtn.title = 'Redigera objekt';
        editBtn.setAttribute('aria-label', 'Redigera objekt');
        editBtn.disabled = true;
        editBtn.textContent = '✎';
        editBtn.addEventListener('click', () => editCurrentDetailObject());
        actions.insertBefore(editBtn, forwardBtn.nextSibling);
    }

    let duplicateBtn = document.getElementById('detail-nav-duplicate');
    if (!duplicateBtn) {
        duplicateBtn = document.createElement('button');
        duplicateBtn.id = 'detail-nav-duplicate';
        duplicateBtn.className = 'detail-panel-nav-btn';
        duplicateBtn.type = 'button';
        duplicateBtn.title = 'Duplicera objekt';
        duplicateBtn.setAttribute('aria-label', 'Duplicera objekt');
        duplicateBtn.disabled = true;
        duplicateBtn.textContent = '⧉';
        duplicateBtn.addEventListener('click', () => duplicateCurrentDetailObject());
        actions.insertBefore(duplicateBtn, editBtn.nextSibling);
    }
}

function updateDetailHistoryButtons() {
    ensureDetailHistoryControls();
    const backBtn = document.getElementById('detail-nav-back');
    const forwardBtn = document.getElementById('detail-nav-forward');
    const editBtn = document.getElementById('detail-nav-edit');
    const duplicateBtn = document.getElementById('detail-nav-duplicate');
    if (!backBtn || !forwardBtn || !editBtn || !duplicateBtn) return;

    const hasBack = detailHistoryIndex > 0;
    const hasForward = detailHistoryIndex >= 0 && detailHistoryIndex < detailHistory.length - 1;
    const hasCurrent = Number.isFinite(currentObjectId);
    backBtn.disabled = !hasBack;
    forwardBtn.disabled = !hasForward;
    editBtn.disabled = !hasCurrent;
    duplicateBtn.disabled = !hasCurrent;
}

function editCurrentDetailObject() {
    if (!Number.isFinite(currentObjectId)) return;
    editObject(currentObjectId);
}

async function duplicateCurrentDetailObject() {
    if (!Number.isFinite(currentObjectId)) return;

    try {
        await showDuplicateObjectModal(currentObjectId);
    } catch (error) {
        console.error('Failed to duplicate object:', error);
        showToast(error.message || 'Kunde inte duplicera objekt', 'error');
    }
}

function getObjectDisplayNameForDuplicate(obj) {
    if (!obj) return 'Okänt objekt';
    return (
        obj.data?.Namn ||
        obj.data?.namn ||
        obj.data?.Name ||
        obj.data?.name ||
        obj.id_full ||
        obj.auto_id ||
        'Okänt objekt'
    );
}

function getLinkedObjectFromRelationForDuplicate(sourceObjectId, relation) {
    const isOutgoing = Number(relation.source_object_id) === Number(sourceObjectId);
    return isOutgoing ? relation.target_object : relation.source_object;
}

function getDuplicateRelationRowDescription(row) {
    if (row.description) return row.description;
    if (row.relationDescription) return row.relationDescription;
    return '-';
}

function getDuplicateSortIndicator(field) {
    const context = window.currentDuplicateContext;
    if (!context || context.sortField !== field) return '↕';
    return context.sortDirection === 'asc' ? '↑' : '↓';
}

function getDuplicateRowFieldValue(row, field) {
    if (field === 'auto_id') return String(row.autoId || '');
    if (field === 'type') return String(row.type || '');
    if (field === 'name') return String(row.name || '');
    if (field === 'description') return String(getDuplicateRelationRowDescription(row) || '');
    return '';
}

function buildDuplicateRelationRows() {
    const context = window.currentDuplicateContext;
    if (!context) return [];

    const rows = [];

    context.relations.forEach(relation => {
        if (!context.selectedRelationIds.has(relation.id)) return;
        const linkedObject = context.linkedObjectByRelationId.get(relation.id) || {};
        rows.push({
            key: `existing-${relation.id}`,
            kind: 'existing',
            id: relation.id,
            autoId: linkedObject.id_full || linkedObject.auto_id || linkedObject.id || '?',
            type: linkedObject.object_type?.name || '-',
            name: getObjectDisplayNameForDuplicate(linkedObject),
            description: linkedObject.data?.beskrivning || linkedObject.data?.description || '',
            relationDescription: relation.description || ''
        });
    });

    Array.from(context.additionalObjects.values()).forEach(obj => {
        rows.push({
            key: `added-${obj.id}`,
            kind: 'added',
            id: obj.id,
            autoId: obj.id_full || obj.auto_id || obj.id || '?',
            type: obj.object_type?.name || '-',
            name: getObjectDisplayNameForDuplicate(obj),
            description: obj.data?.beskrivning || obj.data?.description || '',
            relationDescription: 'Ny relation vid duplicering'
        });
    });

    return rows;
}

function applyDuplicateRowFiltersAndSort(rows) {
    const context = window.currentDuplicateContext;
    if (!context) return rows;

    const globalSearch = (context.search || '').trim().toLowerCase();
    let filtered = rows.filter(row => {
        if (!globalSearch) return true;
        const haystack = [
            row.autoId,
            row.type,
            row.name,
            getDuplicateRelationRowDescription(row)
        ].map(value => String(value || '').toLowerCase());
        return haystack.some(value => value.includes(globalSearch));
    });

    Object.entries(context.columnSearches || {}).forEach(([field, searchTerm]) => {
        const normalizedTerm = String(searchTerm || '').trim().toLowerCase();
        if (!normalizedTerm) return;
        filtered = filtered.filter(row => getDuplicateRowFieldValue(row, field).toLowerCase().includes(normalizedTerm));
    });

    const sortField = context.sortField || 'name';
    const sortDirection = context.sortDirection === 'desc' ? 'desc' : 'asc';
    filtered = [...filtered].sort((a, b) => {
        const aValue = getDuplicateRowFieldValue(a, sortField);
        const bValue = getDuplicateRowFieldValue(b, sortField);
        const comparison = aValue.localeCompare(bValue, 'sv', { sensitivity: 'base' });
        return sortDirection === 'asc' ? comparison : -comparison;
    });

    return filtered;
}

function renderDuplicateSelectionSection() {
    const rows = applyDuplicateRowFiltersAndSort(buildDuplicateRelationRows());
    const rowsHtml = rows.map(row => {
        const typeColor = getObjectTypeColor(row.type);
        return `
        <tr>
            <td class="col-id">${escapeHtml(String(row.autoId))}</td>
            <td class="col-type">
                <span class="object-type-badge" style="background-color: ${typeColor}">
                    ${escapeHtml(String(row.type))}
                </span>
            </td>
            <td class="col-name">${escapeHtml(String(row.name))}</td>
            <td class="col-description">${formatFieldValue(getDuplicateRelationRowDescription(row), 'textarea')}</td>
            <td class="col-actions">
                <button
                    type="button"
                    class="btn-icon btn-danger duplicate-remove-row-btn"
                    data-kind="${row.kind}"
                    data-id="${row.id}"
                    title="Ta bort objekt"
                    aria-label="Ta bort ${escapeHtml(String(row.name))}"
                >🗑️</button>
            </td>
        </tr>
    `;
    }).join('');

    return `
        <div class="form-section duplicate-options-section">
            <div class="duplicate-options-header">
                <h4>Relationer och kopplade filer som följer med</h4>
                <button type="button" id="duplicate-add-objects-btn" class="btn btn-primary btn-sm">Lägg till objekt</button>
            </div>
            <div class="filters duplicate-table-filters">
                <input
                    type="text"
                    id="duplicate-selection-search"
                    class="search-input"
                    placeholder="Sök..."
                    value="${escapeHtml(String(window.currentDuplicateContext?.search || ''))}"
                >
            </div>
            <div class="table-container duplicate-relations-table-container">
                <table class="data-table duplicate-relations-table">
                    <thead>
                        <tr>
                            <th class="col-id" data-sortable="true" data-field="auto_id" style="cursor:pointer;">ID <span class="sort-indicator">${getDuplicateSortIndicator('auto_id')}</span></th>
                            <th class="col-type" data-sortable="true" data-field="type" style="cursor:pointer;">Typ <span class="sort-indicator">${getDuplicateSortIndicator('type')}</span></th>
                            <th class="col-name" data-sortable="true" data-field="name" style="cursor:pointer;">Namn <span class="sort-indicator">${getDuplicateSortIndicator('name')}</span></th>
                            <th class="col-description" data-sortable="true" data-field="description" style="cursor:pointer;">Beskrivning <span class="sort-indicator">${getDuplicateSortIndicator('description')}</span></th>
                            <th class="col-actions"></th>
                        </tr>
                        <tr class="column-search-row">
                            <th class="col-id"><input type="text" class="column-search-input duplicate-column-search-input" data-field="auto_id" placeholder="Sök..." value="${escapeHtml(String(window.currentDuplicateContext?.columnSearches?.auto_id || ''))}"></th>
                            <th class="col-type"><input type="text" class="column-search-input duplicate-column-search-input" data-field="type" placeholder="Sök..." value="${escapeHtml(String(window.currentDuplicateContext?.columnSearches?.type || ''))}"></th>
                            <th class="col-name"><input type="text" class="column-search-input duplicate-column-search-input" data-field="name" placeholder="Sök..." value="${escapeHtml(String(window.currentDuplicateContext?.columnSearches?.name || ''))}"></th>
                            <th class="col-description"><input type="text" class="column-search-input duplicate-column-search-input" data-field="description" placeholder="Sök..." value="${escapeHtml(String(window.currentDuplicateContext?.columnSearches?.description || ''))}"></th>
                            <th class="col-actions"></th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows.length ? rowsHtml : '<tr><td colspan="5" class="empty-state">Inga objekt valda.</td></tr>'}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

function captureDuplicateSearchFocusState() {
    const context = window.currentDuplicateContext;
    if (!context) return;

    const activeElement = document.activeElement;
    if (!(activeElement instanceof HTMLInputElement)) {
        context.searchFocusState = null;
        return;
    }

    if (activeElement.classList.contains('duplicate-column-search-input') && activeElement.dataset.field) {
        context.searchFocusState = {
            kind: 'column',
            field: activeElement.dataset.field,
            selectionStart: Number.isInteger(activeElement.selectionStart) ? activeElement.selectionStart : null,
            selectionEnd: Number.isInteger(activeElement.selectionEnd) ? activeElement.selectionEnd : null
        };
        return;
    }

    if (activeElement.id === 'duplicate-selection-search') {
        context.searchFocusState = {
            kind: 'global',
            selectionStart: Number.isInteger(activeElement.selectionStart) ? activeElement.selectionStart : null,
            selectionEnd: Number.isInteger(activeElement.selectionEnd) ? activeElement.selectionEnd : null
        };
        return;
    }

    context.searchFocusState = null;
}

function restoreDuplicateSearchFocusState() {
    const context = window.currentDuplicateContext;
    const state = context?.searchFocusState;
    if (!state) return;

    let input = null;
    if (state.kind === 'global') {
        input = document.getElementById('duplicate-selection-search');
    } else if (state.kind === 'column' && state.field) {
        const escapedField = state.field.replace(/["\\]/g, '\\$&');
        input = document.querySelector(`.duplicate-column-search-input[data-field="${escapedField}"]`);
    }

    if (!input) return;

    input.focus({ preventScroll: true });
    if (Number.isInteger(state.selectionStart) && Number.isInteger(state.selectionEnd)) {
        try {
            input.setSelectionRange(state.selectionStart, state.selectionEnd);
        } catch (_error) {
            // Best effort
        }
    }
}

function getSelectedDuplicateRelationPayload() {
    const context = window.currentDuplicateContext;
    if (!context) {
        return { relationIds: [], additionalTargetIds: [] };
    }

    return {
        relationIds: Array.from(context.selectedRelationIds.values()),
        additionalTargetIds: Array.from(context.additionalObjects.keys())
    };
}

function bindDuplicateSelectionEvents() {
    const context = window.currentDuplicateContext;
    if (!context) return;

    const addButton = document.getElementById('duplicate-add-objects-btn');
    if (addButton) {
        addButton.addEventListener('click', async () => {
            if (!context || !Number.isFinite(context.sourceObjectId)) return;

            try {
                await showAddRelationModal(context.sourceObjectId, {
                    mode: 'select',
                    title: 'Lägg till objekt',
                    description: 'Sök och välj ett eller flera objekt i korgen.',
                    confirmLabel: 'Lägg till',
                    hideSettings: true,
                    onSubmit: async ({ selectedItems }) => {
                        (selectedItems || []).forEach(item => {
                            const itemId = Number(item.id);
                            if (!Number.isFinite(itemId)) return;
                            if (context.selectedLinkedObjectIds.has(itemId)) return;
                            context.additionalObjects.set(itemId, item);
                            context.selectedLinkedObjectIds.add(itemId);
                        });
                        renderDuplicateSelectionUI();
                    }
                });
            } catch (error) {
                console.error('Failed to open add-object picker for duplicate:', error);
                showToast(error.message || 'Kunde inte öppna lägg till-panelen', 'error');
            }
        });
    }

    const globalSearchInput = document.getElementById('duplicate-selection-search');
    if (globalSearchInput) {
        globalSearchInput.addEventListener('input', (event) => {
            context.search = event.target.value;
            renderDuplicateSelectionUI();
        });
    }

    document.querySelectorAll('.duplicate-column-search-input').forEach(input => {
        input.addEventListener('input', (event) => {
            const field = event.target.dataset.field;
            context.columnSearches[field] = event.target.value;
            renderDuplicateSelectionUI();
        });
    });

    document.querySelectorAll('.duplicate-relations-table th[data-sortable="true"]').forEach(header => {
        header.addEventListener('click', () => {
            const field = header.dataset.field;
            if (!field) return;
            if (context.sortField === field) {
                context.sortDirection = context.sortDirection === 'asc' ? 'desc' : 'asc';
            } else {
                context.sortField = field;
                context.sortDirection = 'asc';
            }
            renderDuplicateSelectionUI();
        });
    });

    document.querySelectorAll('.duplicate-remove-row-btn').forEach(button => {
        button.addEventListener('click', () => {
            if (!context) return;

            const rowKind = button.dataset.kind;
            const rowId = Number(button.dataset.id);
            if (!Number.isFinite(rowId)) return;

            if (rowKind === 'existing') {
                context.selectedRelationIds.delete(rowId);
                const linkedObjectId = context.linkedObjectIdByRelationId.get(rowId);
                if (Number.isFinite(linkedObjectId)) {
                    const hasOtherRelation = Array.from(context.selectedRelationIds.values()).some(relationId => {
                        return context.linkedObjectIdByRelationId.get(relationId) === linkedObjectId;
                    });
                    if (!hasOtherRelation && !context.additionalObjects.has(linkedObjectId)) {
                        context.selectedLinkedObjectIds.delete(linkedObjectId);
                    }
                }
            } else if (rowKind === 'added') {
                context.additionalObjects.delete(rowId);
                context.selectedLinkedObjectIds.delete(rowId);
            }

            renderDuplicateSelectionUI();
        });
    });
}

function renderDuplicateSelectionUI() {
    const container = document.getElementById('duplicate-options-container');
    if (!container) return;
    captureDuplicateSearchFocusState();
    container.innerHTML = renderDuplicateSelectionSection();
    bindDuplicateSelectionEvents();
    restoreDuplicateSearchFocusState();
}

function splitMetadataFromFormData(formData) {
    const metadata = {
        status: formData?.status || 'In work'
    };

    const objectData = {};
    Object.entries(formData || {}).forEach(([key, value]) => {
        if (key === 'status' || key === 'version' || key === 'main_id') return;
        objectData[key] = value;
    });

    return { metadata, objectData };
}

async function showDuplicateObjectModal(objectId) {
    const modal = document.getElementById('object-modal');
    const overlay = document.getElementById('modal-overlay');
    const typeSelect = document.getElementById('object-type-select');
    const formContainer = document.getElementById('object-form-container');

    if (!modal || !overlay || !typeSelect || !formContainer) return;

    window.currentObjectForm = null;
    window.currentDuplicateContext = null;
    resetCreateObjectRelationSelection();
    setCreateObjectRelationsVisible(false);
    formContainer.innerHTML = '';

    const sourceObject = await ObjectsAPI.getById(objectId);
    const typeData = await ObjectTypesAPI.getById(sourceObject.object_type.id);

    const relations = await ObjectsAPI.getRelations(objectId);

    typeSelect.innerHTML = `<option value="${typeData.id}" selected>${typeData.name}</option>`;
    typeSelect.disabled = true;

    const formComponent = new ObjectFormComponent(typeData, sourceObject);
    await formComponent.render('object-form-container');
    window.currentObjectForm = formComponent;

    const duplicateOptions = document.createElement('div');
    duplicateOptions.id = 'duplicate-options-container';
    formContainer.appendChild(duplicateOptions);
    const normalizedRelations = (relations || [])
        .map(rel => ({ ...rel, id: Number(rel.id) }))
        .filter(rel => Number.isFinite(rel.id));

    const selectedRelationIds = new Set(normalizedRelations.map(rel => rel.id));
    const linkedObjectByRelationId = new Map();
    const linkedObjectIdByRelationId = new Map();
    const selectedLinkedObjectIds = new Set();
    normalizedRelations.forEach(rel => {
        const linkedObject = getLinkedObjectFromRelationForDuplicate(objectId, rel);
        linkedObjectByRelationId.set(rel.id, linkedObject);
        const linkedObjectId = Number(linkedObject?.id);
        if (Number.isFinite(linkedObjectId)) {
            linkedObjectIdByRelationId.set(rel.id, linkedObjectId);
            selectedLinkedObjectIds.add(linkedObjectId);
        }
    });

    window.currentDuplicateContext = {
        sourceObjectId: Number(objectId),
        relations: normalizedRelations,
        selectedRelationIds,
        linkedObjectByRelationId,
        linkedObjectIdByRelationId,
        selectedLinkedObjectIds,
        additionalObjects: new Map(),
        search: '',
        columnSearches: {
            auto_id: '',
            type: '',
            name: '',
            description: ''
        },
        sortField: 'name',
        sortDirection: 'asc',
        searchFocusState: null
    };
    renderDuplicateSelectionUI();

    modal.dataset.mode = 'duplicate';
    modal.dataset.objectId = String(objectId);
    modal.style.display = 'block';
    overlay.style.display = 'block';
}

function persistDetailHistory() {
    try {
        const payload = {
            history: detailHistory,
            index: detailHistoryIndex
        };
        sessionStorage.setItem(DETAIL_HISTORY_STORAGE_KEY, JSON.stringify(payload));
    } catch (_error) {
        // Best effort only.
    }
}

function restoreDetailHistory() {
    try {
        const raw = sessionStorage.getItem(DETAIL_HISTORY_STORAGE_KEY);
        if (!raw) return;

        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed?.history)) return;

        const sanitizedHistory = parsed.history
            .map(item => Number(item))
            .filter(item => Number.isFinite(item));

        detailHistory = sanitizedHistory;
        detailHistoryIndex = Number.isInteger(parsed?.index) ? parsed.index : (sanitizedHistory.length - 1);
        if (detailHistoryIndex < 0 || detailHistoryIndex >= detailHistory.length) {
            detailHistoryIndex = detailHistory.length - 1;
        }
    } catch (_error) {
        detailHistory = [];
        detailHistoryIndex = -1;
    }
}

function resetDetailHistory() {
    detailHistory = [];
    detailHistoryIndex = -1;
    try {
        sessionStorage.removeItem(DETAIL_HISTORY_STORAGE_KEY);
    } catch (_error) {
        // Best effort only.
    }
}

function pushDetailHistory(objectId) {
    const normalized = Number(objectId);
    if (!Number.isFinite(normalized)) return;

    if (detailHistoryIndex >= 0 && detailHistory[detailHistoryIndex] === normalized) {
        updateDetailHistoryButtons();
        return;
    }

    if (detailHistoryIndex < detailHistory.length - 1) {
        detailHistory = detailHistory.slice(0, detailHistoryIndex + 1);
    }

    detailHistory.push(normalized);
    detailHistoryIndex = detailHistory.length - 1;
    persistDetailHistory();
    updateDetailHistoryButtons();
}

async function navigateDetailHistory(step) {
    if (!step || !detailHistory.length) return;

    const nextIndex = detailHistoryIndex + (step > 0 ? 1 : -1);
    if (nextIndex < 0 || nextIndex >= detailHistory.length) return;

    detailHistoryIndex = nextIndex;
    const targetObjectId = detailHistory[detailHistoryIndex];
    persistDetailHistory();
    updateDetailHistoryButtons();
    await openDetailPanel(targetObjectId, { fromHistory: true });
}


async function toggleTreeView() {
    const targetView = treeViewActive ? 'objects' : 'tree';
    await switchView(targetView);
}

async function loadTreeViewPage() {
    const objectsWrapper = document.getElementById('objects-container-wrapper');
    const treeWrapper = document.getElementById('tree-view-wrapper');
    if (!treeWrapper) return;

    // Reset and collapse detail panel when switching views
    closeDetailPanel();

    updateObjectsWorkspaceHeader({
        title: 'Trädvy',
        showCreateButton: true
    });

    treeViewActive = true;
    window.treeViewActive = true;
    updateTreeToggleButtonLabel();

    if (objectsWrapper) objectsWrapper.style.display = 'none';
    treeWrapper.style.display = 'block';

    // Initialize tree view if not already done
    if (!treeViewInstance) {
        treeViewInstance = new TreeView('tree-view-container');
        window.treeViewInstance = treeViewInstance; // Update global reference
        
        // Set up click handler
        treeViewInstance.setNodeClickHandler(async (objectId, objectType) => {
            await openDetailPanel(objectId);
        });
    }

    await treeViewInstance.render();
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
    // Open detail panel instead of navigating to detail view
    await openDetailPanel(objectId);
}

// Open detail panel
async function openDetailPanel(objectId, options = {}) {
    const { fromHistory = false } = options;
    const panel = document.getElementById('detail-panel');
    const panelBody = document.getElementById('detail-panel-body');
    
    if (!panel || !panelBody) return;
    
    try {
        // If panel is closed and user opens a new object directly, start a fresh history chain.
        if (!fromHistory && !panel.classList.contains('active')) {
            resetDetailHistory();
        }

        if (!fromHistory) {
            pushDetailHistory(objectId);
        } else {
            updateDetailHistoryButtons();
        }

        setSelectedDetailObject(objectId);

        // Visa panel direkt och låt CSS hantera animationen
        panel.classList.add('active');
        
        // Ladda objektdata
        const object = await ObjectsAPI.getById(objectId);
        
        // Uppdatera panel-header (namn + kategori)
        updateDetailPanelHeader(object);
        
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
    const panelTitle = document.getElementById('detail-panel-title');
    const panelCategory = document.getElementById('detail-panel-category');
    const panelBody = document.getElementById('detail-panel-body');

    resetDetailHistory();

    if (panel) panel.classList.remove('active');

    if (panelTitle) panelTitle.textContent = 'Objektdetaljer';
    if (panelCategory) panelCategory.textContent = 'Kategori: -';
    if (panelBody) panelBody.innerHTML = '<p class="empty-state">Välj ett objekt att visa</p>';

    setSelectedDetailObject(null);
    
    // Clean up the instance
    if (currentDetailPanelInstance) {
        currentDetailPanelInstance.close();
    }
    updateDetailHistoryButtons();
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
        case 'richtext': {
            const sanitized = sanitizeRichTextHtml(String(value));
            return sanitized || '-';
        }
        case 'textarea':
            return escapeHtml(String(value)).replace(/\r?\n/g, '<br>');
        default:
            return escapeHtml(String(value));
    }
}

function resetCreateObjectRelationSelection() {
    window.currentCreateObjectRelations = [];
}

function setCreateObjectRelationsVisible(visible) {
    const group = document.getElementById('object-create-relations-group');
    if (!group) return;
    group.style.display = visible ? '' : 'none';
}

function getCreateObjectRelationLabel(item) {
    const autoId = String(item?.auto_id || '').trim();
    const typeName = String(item?.type_name || '').trim();
    const name = String(item?.display_name || '').trim();
    if (autoId && typeName && name) return `${autoId} • ${typeName} • ${name}`;
    if (autoId && name) return `${autoId} • ${name}`;
    return name || autoId || 'Okänt objekt';
}

function renderCreateObjectRelationSelection() {
    const listContainer = document.getElementById('object-create-relations-list');
    const actionButton = document.getElementById('object-create-relations-btn');
    if (!listContainer || !actionButton) return;

    const selected = Array.isArray(window.currentCreateObjectRelations)
        ? window.currentCreateObjectRelations
        : [];

    if (!selected.length) {
        listContainer.innerHTML = '<p class="empty-state">Inga relationer valda</p>';
    } else {
        listContainer.innerHTML = `
            <ul>
                ${selected.map(item => `<li>${escapeHtml(getCreateObjectRelationLabel(item))}</li>`).join('')}
            </ul>
        `;
    }

    actionButton.textContent = selected.length > 0
        ? `Uppdatera relationer (${selected.length})`
        : 'Lägg till relationer';
}

async function openCreateObjectRelationPicker() {
    const objectModal = document.getElementById('object-modal');
    if (!objectModal || objectModal.dataset.mode !== 'create') return;
    if (typeof showAddRelationModal !== 'function') {
        showToast('Relationpanelen är inte tillgänglig', 'error');
        return;
    }

    try {
        await showAddRelationModal([], {
            mode: 'select',
            title: 'Välj relationer för nytt objekt',
            description: 'Sök och välj objekt som ska kopplas när objektet skapas.',
            confirmLabel: 'Använd urval',
            hideSettings: true,
            allowNoSource: true,
            onSubmit: async ({ selectedItems }) => {
                const normalized = (Array.isArray(selectedItems) ? selectedItems : [])
                    .map(item => ({
                        id: Number(item?.id),
                        auto_id: item?.auto_id || '',
                        type_name: item?.object_type?.name || '',
                        display_name: getObjectDisplayName(item)
                    }))
                    .filter(item => Number.isFinite(item.id));
                const uniqueById = new Map(normalized.map(item => [item.id, item]));
                window.currentCreateObjectRelations = Array.from(uniqueById.values());
                renderCreateObjectRelationSelection();
            }
        });
    } catch (error) {
        console.error('Failed to open relation picker for create modal:', error);
        showToast(error.message || 'Kunde inte öppna relationpanelen', 'error');
    }
}

// Create new object
async function showCreateObjectModal() {
    const modal = document.getElementById('object-modal');
    const overlay = document.getElementById('modal-overlay');
    
    if (!modal || !overlay) return;
    
    // Clear previous form data
    window.currentObjectForm = null;
    window.currentDuplicateContext = null;
    resetCreateObjectRelationSelection();
    setCreateObjectRelationsVisible(true);
    renderCreateObjectRelationSelection();
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

async function showCreateFileObjectModal() {
    const modal = document.getElementById('object-modal');
    const overlay = document.getElementById('modal-overlay');
    const typeSelect = document.getElementById('object-type-select');

    if (!modal || !overlay || !typeSelect) return;

    // Clear previous form data
    window.currentObjectForm = null;
    window.currentDuplicateContext = null;
    resetCreateObjectRelationSelection();
    setCreateObjectRelationsVisible(false);
    const formContainer = document.getElementById('object-form-container');
    if (formContainer) {
        formContainer.innerHTML = '';
    }

    try {
        const types = await ObjectTypesAPI.getAll();
        const fileObjectTypeRef = (types || []).find(type => (type.name || '').toLowerCase().trim() === 'filobjekt');
        if (!fileObjectTypeRef) {
            showToast('Kunde inte hitta objekttypen Filobjekt', 'error');
            return;
        }
        const fileObjectType = await ObjectTypesAPI.getById(fileObjectTypeRef.id);

        typeSelect.disabled = true;
        typeSelect.innerHTML = `<option value="${fileObjectType.id}" selected>${fileObjectType.name}</option>`;

        window.currentObjectForm = null;
        window.currentFileObjectTypeForBatch = fileObjectType;

        window.currentFileObjectBatchUpload = {
            rows: [],
            table: null,
            nextRowId: 1
        };

        // Render only the batch file upload UI for this flow (no full object form)
        if (formContainer) {
            formContainer.innerHTML = `
                <div id="file-object-upload-group" class="form-group">
                    <label>Filer *</label>
                    <div class="upload-area create-file-object-dropzone" id="file-object-batch-dropzone">
                        <div class="upload-content">
                            <p>Dra och släpp filer här eller <label for="file-object-files" class="file-label">välj filer</label></p>
                            <input type="file" id="file-object-files" class="form-control" multiple style="display:none;">
                        </div>
                    </div>
                    <div class="batch-file-actions">
                        <button type="button" class="btn btn-secondary btn-sm" id="file-object-batch-merge-btn">Slå ihop markerade</button>
                        <button type="button" class="btn btn-secondary btn-sm" id="file-object-batch-clear-btn">Rensa filer</button>
                    </div>
                    <div id="file-object-batch-table"></div>
                </div>
            `;
        }

        setupFileObjectBatchUpload();

        modal.dataset.mode = 'create-file-object';
        modal.style.display = 'block';
        overlay.style.display = 'block';
    } catch (error) {
        console.error('Failed to prepare file object modal:', error);
        showToast('Kunde inte öppna dialog för filobjekt', 'error');
    }
}

function stripFilenameExtension(filename) {
    const value = String(filename || '').trim();
    const lastDot = value.lastIndexOf('.');
    if (lastDot <= 0) return value;
    return value.substring(0, lastDot);
}

function getFileObjectNameFieldName() {
    const objectType = window.currentFileObjectTypeForBatch;
    const fields = Array.isArray(objectType?.fields) ? objectType.fields : [];
    const preferred = fields.find(field => ['namn', 'name'].includes(String(field.field_name || '').toLowerCase()));
    if (preferred) return preferred.field_name;
    const firstText = fields.find(field => ['text', 'textarea'].includes(String(field.field_type || '').toLowerCase()));
    return firstText?.field_name || null;
}

function syncFileObjectNameFieldFromBatchRows() {
    // No visible object form in batch mode; keep as no-op.
}

function parseFieldOptionsForAutoValue(fieldOptions) {
    if (!fieldOptions) return null;
    if (Array.isArray(fieldOptions)) return fieldOptions;
    if (typeof fieldOptions === 'object') return fieldOptions;
    if (typeof fieldOptions === 'string') {
        try {
            const parsed = JSON.parse(fieldOptions);
            return parsed;
        } catch (_error) {
            const values = fieldOptions.split(',').map(item => item.trim()).filter(Boolean);
            return values.length ? values : null;
        }
    }
    return null;
}

function getAutoValueForRequiredField(field, objectName) {
    const fieldName = String(field.field_name || '').toLowerCase();
    const fieldType = String(field.field_type || '').toLowerCase();

    if (fieldName === 'namn' || fieldName === 'name') return objectName;
    if (field.default_value !== undefined && field.default_value !== null && String(field.default_value) !== '') {
        return field.default_value;
    }

    if (fieldType === 'boolean') return false;
    if (fieldType === 'number' || fieldType === 'decimal') return 0;
    if (fieldType === 'date') return new Date().toISOString().split('T')[0];
    if (fieldType === 'select') {
        const options = parseFieldOptionsForAutoValue(field.field_options || field.options);
        if (Array.isArray(options) && options.length) return options[0];
        if (options && Array.isArray(options.values) && options.values.length) return options.values[0];
        return null;
    }

    return '-';
}

function buildAutoFileObjectData(objectType, objectName) {
    const fields = Array.isArray(objectType?.fields) ? objectType.fields : [];
    const data = {};
    const errors = [];

    fields.forEach(field => {
        if (!field?.is_required) return;
        const value = getAutoValueForRequiredField(field, objectName);
        if (value === null || value === undefined || value === '') {
            errors.push(`Obligatoriskt fält "${field.field_name}" saknar auto-värde`);
            return;
        }
        data[field.field_name] = value;
    });

    return { data, errors };
}

function bindDropzone(dropzone, onFiles) {
    if (!dropzone || typeof onFiles !== 'function') return;
    let dragDepth = 0;
    const isFileDrag = (event) => {
        const types = Array.from(event?.dataTransfer?.types || []);
        return types.includes('Files');
    };

    const setDragState = (active) => {
        if (active) dropzone.classList.add('dragover');
        else dropzone.classList.remove('dragover');
    };

    dropzone.addEventListener('dragenter', (event) => {
        if (!isFileDrag(event)) return;
        event.preventDefault();
        dragDepth += 1;
        setDragState(true);
    });

    dropzone.addEventListener('dragover', (event) => {
        if (!isFileDrag(event)) return;
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
        setDragState(true);
    });

    dropzone.addEventListener('dragleave', (event) => {
        if (!isFileDrag(event)) return;
        event.preventDefault();
        dragDepth = Math.max(0, dragDepth - 1);
        if (dragDepth === 0) setDragState(false);
    });

    dropzone.addEventListener('drop', (event) => {
        if (!isFileDrag(event)) return;
        event.preventDefault();
        dragDepth = 0;
        setDragState(false);
        onFiles(Array.from(event.dataTransfer?.files || []));
    });
}

function setupFileObjectBatchUpload() {
    const fileInput = document.getElementById('file-object-files');
    const dropzone = document.getElementById('file-object-batch-dropzone');
    const mergeBtn = document.getElementById('file-object-batch-merge-btn');
    const clearBtn = document.getElementById('file-object-batch-clear-btn');

    if (fileInput) {
        fileInput.addEventListener('change', (event) => {
            const files = Array.from(event.target.files || []);
            addFilesToFileObjectBatch(files);
            fileInput.value = '';
        });
    }
    if (dropzone) {
        bindDropzone(dropzone, (files) => addFilesToFileObjectBatch(files));
    }
    if (mergeBtn) {
        mergeBtn.addEventListener('click', () => mergeSelectedFileObjectBatchRows());
    }
    if (clearBtn) {
        clearBtn.addEventListener('click', () => clearFileObjectBatchRows());
    }

    renderFileObjectBatchTable();
}

function addFilesToFileObjectBatch(files) {
    const state = window.currentFileObjectBatchUpload;
    if (!state) return;

    const incoming = Array.isArray(files) ? files.filter(Boolean) : [];
    if (!incoming.length) return;

    const existingKeys = new Set(state.rows.map(row => `${row.filename}|${row.file?.size}|${row.file?.lastModified}`));
    incoming.forEach(file => {
        const key = `${file.name}|${file.size}|${file.lastModified}`;
        if (existingKeys.has(key)) return;
        existingKeys.add(key);
        state.rows.push({
            row_id: state.nextRowId++,
            selected: false,
            filename: file.name,
            object_name: stripFilenameExtension(file.name) || 'Filobjekt',
            file
        });
    });

    syncFileObjectNameFieldFromBatchRows();
    renderFileObjectBatchTable();
}

function clearFileObjectBatchRows() {
    const state = window.currentFileObjectBatchUpload;
    if (!state) return;
    state.rows = [];
    state.table = null;
    renderFileObjectBatchTable();
}

function mergeSelectedFileObjectBatchRows() {
    const state = window.currentFileObjectBatchUpload;
    if (!state) return;

    const selectedRows = state.rows.filter(row => row.selected);
    if (selectedRows.length < 2) {
        showToast('Markera minst två filer att slå ihop', 'error');
        return;
    }

    const mergedName = String(selectedRows[0].object_name || '').trim();
    if (!mergedName) {
        showToast('Första markerade raden saknar filobjektnamn', 'error');
        return;
    }

    state.rows = state.rows.map(row => (row.selected ? { ...row, object_name: mergedName } : row));
    syncFileObjectNameFieldFromBatchRows();
    renderFileObjectBatchTable();
}

function renderFileObjectBatchTable() {
    const containerId = 'file-object-batch-table';
    const container = document.getElementById(containerId);
    const state = window.currentFileObjectBatchUpload;
    if (!container || !state) return;

    if (!state.rows.length) {
        container.innerHTML = '<p class="empty-state">Inga filer valda</p>';
        return;
    }

    if (typeof SystemTable === 'undefined') {
        container.innerHTML = '<p class="empty-state">Kunde inte ladda tabellkomponenten</p>';
        return;
    }

    state.table = new SystemTable({
        containerId,
        tableId: 'file-object-batch-table-inner',
        columns: [
            {
                field: 'selected',
                label: '',
                className: 'col-actions',
                sortable: false,
                searchable: false,
                render: (row) => `<input type="checkbox" class="file-object-batch-select" data-row-id="${row.row_id}" ${row.selected ? 'checked' : ''}>`
            },
            {
                field: 'filename',
                label: 'Filnamn',
                className: 'col-name'
            },
            {
                field: 'object_name',
                label: 'Filobjektnamn',
                className: 'col-description',
                render: (row, table) => `
                    <input type="text"
                           class="form-control file-object-batch-name"
                           data-row-id="${row.row_id}"
                           value="${table.escape(row.object_name || '')}"
                           placeholder="Ange filobjektnamn">
                `
            }
        ],
        rows: state.rows.map(row => ({
            row_id: row.row_id,
            selected: row.selected,
            filename: row.filename,
            object_name: row.object_name
        })),
        emptyText: 'Inga filer valda',
        onRender: () => {
            container.querySelectorAll('.file-object-batch-select').forEach(node => {
                node.addEventListener('change', () => {
                    const rowId = parseInt(node.dataset.rowId || '', 10);
                    if (!Number.isFinite(rowId)) return;
                    state.rows = state.rows.map(row => (row.row_id === rowId ? { ...row, selected: node.checked } : row));
                });
            });
            container.querySelectorAll('.file-object-batch-name').forEach(node => {
                node.addEventListener('input', () => {
                    const rowId = parseInt(node.dataset.rowId || '', 10);
                    if (!Number.isFinite(rowId)) return;
                    state.rows = state.rows.map(row => (row.row_id === rowId ? { ...row, object_name: node.value } : row));
                    syncFileObjectNameFieldFromBatchRows();
                });
            });
        }
    });
    state.table.render();
}

// Edit object
async function editObject(objectId) {
    try {
        const object = await ObjectsAPI.getById(objectId);
        const typeData = await ObjectTypesAPI.getById(object.object_type.id);
        
        const modal = document.getElementById('object-modal');
        const overlay = document.getElementById('modal-overlay');
        
        if (!modal || !overlay) return;
        resetCreateObjectRelationSelection();
        setCreateObjectRelationsVisible(false);
        
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
        window.currentDuplicateContext = null;
        
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

    if (window.tinymce && typeof window.tinymce.triggerSave === 'function') {
        window.tinymce.triggerSave();
    }
    
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

    const isBatchFileMode = mode === 'create-file-object';

    if (!isBatchFileMode && !window.currentObjectForm) {
        showToast('Formulär ej tillgängligt', 'error');
        return;
    }

    if (!isBatchFileMode && !window.currentObjectForm.validate()) {
        showToast('Fyll i alla obligatoriska fält', 'error');
        return;
    }

    const typeId = parseInt(document.getElementById('object-type-select').value);
    const formData = isBatchFileMode ? {} : window.currentObjectForm.getFormData();
    const { metadata, objectData } = isBatchFileMode
        ? { metadata: { status: 'In work' }, objectData: {} }
        : splitMetadataFromFormData(formData);

    const data = {
        object_type_id: typeId,
        status: metadata.status || 'In work',
        data: objectData
    };
    try {
        if (mode === 'create') {
            const createdObject = await ObjectsAPI.create(data);
            showToast('Objekt skapat', 'success');
            const createdObjectId = Number(createdObject?.id);
            const selectedRelations = Array.isArray(window.currentCreateObjectRelations)
                ? window.currentCreateObjectRelations
                : [];
            if (Number.isFinite(createdObjectId) && selectedRelations.length > 0) {
                try {
                    const result = await ObjectsAPI.addRelationsBatch({
                        sourceId: createdObjectId,
                        relations: selectedRelations.map(item => ({ targetId: item.id }))
                    });
                    const createdCount = Number(result?.summary?.created || 0);
                    const failedCount = Number(result?.summary?.failed || 0);
                    if (failedCount > 0) {
                        showToast(`Objekt skapat. ${createdCount} relation(er) kopplades, ${failedCount} misslyckades.`, 'error');
                    } else {
                        showToast(`${createdCount} relation(er) kopplades`, 'success');
                    }
                } catch (relationError) {
                    console.error('Failed to create selected relations for new object:', relationError);
                    showToast('Objekt skapat, men relationer kunde inte kopplas', 'error');
                }
            }
            resetCreateObjectRelationSelection();
        } else if (mode === 'create-file-object') {
            const batchState = window.currentFileObjectBatchUpload;
            const rows = Array.isArray(batchState?.rows) ? batchState.rows : [];
            if (!rows.length) {
                showToast('Välj minst en fil', 'error');
                return;
            }

            const fileObjectType = window.currentFileObjectTypeForBatch || await ObjectTypesAPI.getById(typeId);
            if (!fileObjectType) {
                showToast('Kunde inte ladda filobjekttyp', 'error');
                return;
            }

            const grouped = new Map();
            for (const row of rows) {
                const objectName = String(row.object_name || '').trim();
                if (!objectName) {
                    showToast(`Ange filobjektnamn för filen "${row.filename}"`, 'error');
                    return;
                }
                if (!grouped.has(objectName)) grouped.set(objectName, []);
                grouped.get(objectName).push(row.file);
            }

            let createdCount = 0;
            for (const [objectName, files] of grouped.entries()) {
                const autoDataResult = buildAutoFileObjectData(fileObjectType, objectName);
                if (autoDataResult.errors.length) {
                    showToast(autoDataResult.errors[0], 'error');
                    return;
                }

                const groupedData = {
                    object_type_id: typeId,
                    status: 'In work',
                    data: autoDataResult.data
                };
                const createdObject = await ObjectsAPI.create(groupedData);
                for (const file of files) {
                    await ObjectsAPI.uploadDocument(createdObject.id, file);
                }
                createdCount += 1;
            }
            showToast(`${createdCount} filobjekt skapade med filer`, 'success');
            window.currentFileObjectBatchUpload = null;
            window.currentFileObjectTypeForBatch = null;
        } else if (mode === 'duplicate') {
            const { relationIds, additionalTargetIds } = getSelectedDuplicateRelationPayload();
            const sourceObjectId = Number(objectId);
            if (!Number.isFinite(sourceObjectId)) {
                throw new Error('Kunde inte läsa källobjekt för duplicering');
            }

            const duplicatedObject = await ObjectsAPI.duplicate(sourceObjectId, {
                status: metadata.status,
                data: objectData,
                relation_ids: relationIds,
                additional_target_ids: additionalTargetIds
            });

            showToast('Objekt duplicerat', 'success');
            closeModal();

            if (currentObjectListComponent?.refresh) {
                await currentObjectListComponent.refresh();
            }
            if (treeViewActive && treeViewInstance?.render) {
                await treeViewInstance.render();
            }

            if (duplicatedObject?.id) {
                await openDetailPanel(duplicatedObject.id);
            }
            return;
        } else {
            await ObjectsAPI.update(objectId, data);
            showToast('Objekt uppdaterat', 'success');
        }

        const savedObjectId = Number(objectId);
        closeModal();

        // Refresh current view
        if (currentObjectListComponent) {
            await currentObjectListComponent.refresh();
        }
        if (treeViewActive && treeViewInstance?.render) {
            await treeViewInstance.render();
        }
        if (currentObjectDetailComponent) {
            await currentObjectDetailComponent.refresh();
        }

        // Ensure full detail panel refresh after editing the currently open object.
        const detailPanel = document.getElementById('detail-panel');
        const selectedObjectId = Number(window.currentSelectedObjectId);
        const shouldRefreshDetailPanel =
            mode === 'edit' &&
            Number.isFinite(savedObjectId) &&
            detailPanel?.classList.contains('active') &&
            selectedObjectId === savedObjectId;

        if (shouldRefreshDetailPanel) {
            await openDetailPanel(savedObjectId, { fromHistory: true });
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
        
        // Keep user in current workspace (objects/file-objects/tree) and refresh it.
        await switchView(currentView || 'objects');
    } catch (error) {
        console.error('Failed to delete object:', error);
        showToast(error.message || 'Kunde inte ta bort objekt', 'error');
    }
}

// Go back to previous view
function goBack() {
    switchView('objects');
}

async function openFileObjectFromList(objectId) {
    await switchView('objects');
    await openDetailPanel(objectId);
}
