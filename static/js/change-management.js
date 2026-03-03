function getChangeObjectName(objectPayload = {}) {
    const data = objectPayload?.data || {};
    return data.Namn || data.namn || data.Name || data.name || objectPayload?.id_full || objectPayload?.auto_id || '-';
}

function formatImpactActionLabel(action) {
    if (action === 'cancellation') return 'Cancellation';
    return 'To Be Replaced';
}

class ChangeManagementView {
    constructor(containerId) {
        this.containerId = containerId;
        this.container = document.getElementById(containerId);
        this.items = [];
        this.table = null;
    }

    async render() {
        if (!this.container) return;

        this.container.innerHTML = `
            <div class="table-container">
                <div id="change-management-table"></div>
            </div>
        `;

        await this.loadItems();
    }

    async loadItems() {
        try {
            this.items = await ChangeManagementAPI.getAll();
            this.renderTable();
        } catch (error) {
            console.error('Failed to load change management items:', error);
            showToast('Kunde inte ladda Change Management', 'error');
        }
    }

    renderTable() {
        if (typeof SystemTable === 'undefined') return;

        this.table = new SystemTable({
            containerId: 'change-management-table',
            tableId: 'change-management-system-table',
            columns: [
                {
                    field: 'display_id',
                    label: 'ID',
                    className: 'col-id',
                    render: (row, table) => `
                        <button class="btn-link change-open-detail-btn" data-id="${row.id}">
                            ${table.highlightText(row.display_id || `CO-${row.id}`, 'display_id')}
                        </button>
                    `
                },
                { field: 'type', label: 'Typ', className: 'col-type', badge: 'type' },
                { field: 'title', label: 'Namn', className: 'col-name' },
                { field: 'description', label: 'Beskrivning', className: 'col-description' },
                { field: 'status', label: 'Status', className: 'col-status' },
                {
                    field: 'actions',
                    label: 'Actions',
                    className: 'col-actions',
                    sortable: false,
                    searchable: false,
                    render: (row) => `
                        <button class="btn-icon btn-primary change-edit-btn" data-id="${row.id}" title="Redigera">✎</button>
                        <button class="btn-icon btn-danger change-delete-btn" data-id="${row.id}" title="Ta bort">🗑️</button>
                    `
                }
            ],
            rows: this.items,
            emptyText: 'Inga change-objekt hittades',
            onRender: () => this.bindTableActions()
        });

        this.table.render();
    }

    bindTableActions() {
        const root = document.getElementById('change-management-table');
        if (!root) return;

        root.querySelectorAll('.change-open-detail-btn').forEach((button) => {
            button.addEventListener('click', async () => {
                const id = Number(button.dataset.id);
                if (!Number.isFinite(id)) return;
                await openChangeItemDetailView(id);
            });
        });

        root.querySelectorAll('.change-edit-btn').forEach((button) => {
            button.addEventListener('click', async () => {
                const id = Number(button.dataset.id);
                if (!Number.isFinite(id)) return;
                await showEditChangeItemModal(id);
            });
        });

        root.querySelectorAll('.change-delete-btn').forEach((button) => {
            button.addEventListener('click', async () => {
                const id = Number(button.dataset.id);
                if (!Number.isFinite(id)) return;
                await deleteChangeItem(id);
            });
        });
    }
}

class ChangeManagementDetailView {
    constructor(containerId) {
        this.containerId = containerId;
        this.container = document.getElementById(containerId);
        this.currentItem = null;
        this.impacts = [];
        this.impactsTable = null;
    }

    async render(itemId) {
        if (!this.container) return;

        try {
            this.currentItem = await ChangeManagementAPI.getById(itemId);
            this.impacts = await ChangeManagementAPI.getImpacts(itemId);
        } catch (error) {
            console.error('Failed to load change detail:', error);
            showToast(error.message || 'Kunde inte ladda change-detaljer', 'error');
            return;
        }

        this.container.innerHTML = `
            <div class="view-header">
                <h2>${escapeHtml(this.currentItem.display_id || `CO-${this.currentItem.id}`)} - ${escapeHtml(this.currentItem.title || '')}</h2>
                <div class="view-header-actions">
                    <button class="btn btn-secondary" id="change-detail-back-btn">Tillbaka</button>
                    <button class="btn btn-primary" id="change-detail-edit-btn">Redigera</button>
                </div>
            </div>

            <div class="admin-tabs change-detail-tabs">
                <button class="admin-tab active" data-change-tab="overview">Översikt</button>
                <button class="admin-tab" data-change-tab="objects">Objekt</button>
            </div>

            <div class="admin-tab-content">
                <div class="admin-tab-panel active" data-change-panel="overview">
                    <div class="detail-grid">
                        <div class="detail-item">
                            <span class="detail-label">ID</span>
                            <span class="detail-value">${escapeHtml(this.currentItem.display_id || `CO-${this.currentItem.id}`)}</span>
                        </div>
                        <div class="detail-item">
                            <span class="detail-label">Typ</span>
                            <span class="detail-value">${escapeHtml(this.currentItem.type || '-')}</span>
                        </div>
                        <div class="detail-item">
                            <span class="detail-label">Status</span>
                            <span class="detail-value">${escapeHtml(this.currentItem.status || '-')}</span>
                        </div>
                        <div class="detail-item">
                            <span class="detail-label">Titel</span>
                            <span class="detail-value">${escapeHtml(this.currentItem.title || '-')}</span>
                        </div>
                        <div class="detail-item">
                            <span class="detail-label">Description</span>
                            <span class="detail-value">${escapeHtml(this.currentItem.description || '-')}</span>
                        </div>
                    </div>
                </div>

                <div class="admin-tab-panel" data-change-panel="objects">
                    <div class="admin-panel-header">
                        <h3>Påverkade objekt</h3>
                        <button class="btn btn-primary" id="change-add-object-btn">Lägg till objekt</button>
                    </div>
                    <div class="table-container">
                        <div id="change-impacts-table"></div>
                    </div>
                </div>
            </div>
        `;

        this.bindEvents();
        this.renderImpactsTable();
    }

    bindEvents() {
        const backButton = document.getElementById('change-detail-back-btn');
        if (backButton) {
            backButton.addEventListener('click', async () => {
                await switchView('change-management');
            });
        }

        const editButton = document.getElementById('change-detail-edit-btn');
        if (editButton) {
            editButton.addEventListener('click', async () => {
                if (!this.currentItem?.id) return;
                await showEditChangeItemModal(this.currentItem.id);
            });
        }

        document.querySelectorAll('.change-detail-tabs .admin-tab').forEach((tabButton) => {
            tabButton.addEventListener('click', () => {
                const selectedTab = tabButton.dataset.changeTab;
                document.querySelectorAll('.change-detail-tabs .admin-tab').forEach(btn => {
                    btn.classList.toggle('active', btn.dataset.changeTab === selectedTab);
                });
                document.querySelectorAll('[data-change-panel]').forEach(panel => {
                    panel.classList.toggle('active', panel.dataset.changePanel === selectedTab);
                });
            });
        });

        const addObjectButton = document.getElementById('change-add-object-btn');
        if (addObjectButton) {
            addObjectButton.addEventListener('click', async () => {
                await this.openObjectPicker();
            });
        }
    }

    renderImpactsTable() {
        if (typeof SystemTable === 'undefined') return;

        const rows = this.impacts.map((impact) => {
            const objectPayload = impact.object || {};
            return {
                impact_id: impact.id,
                object_id: objectPayload.id,
                id_full: objectPayload.id_full || objectPayload.auto_id || '-',
                object_type: objectPayload.object_type?.name || '-',
                name: getChangeObjectName(objectPayload),
                version: objectPayload.version || '-',
                base_id: objectPayload.base_id || objectPayload.main_id || '-',
                status: objectPayload.status || '-',
                impact_action: impact.impact_action || 'to_be_replaced'
            };
        });

        this.impactsTable = new SystemTable({
            containerId: 'change-impacts-table',
            tableId: `change-impacts-table-${this.currentItem?.id || 'none'}`,
            columns: [
                {
                    field: 'id_full',
                    label: 'ID',
                    className: 'col-id',
                    render: (row, table) => `
                        <button class="btn-link change-open-object-btn" data-object-id="${row.object_id}">
                            ${table.highlightText(row.id_full, 'id_full')}
                        </button>
                    `
                },
                { field: 'object_type', label: 'Typ', className: 'col-type', badge: 'type' },
                { field: 'name', label: 'Namn', className: 'col-name' },
                { field: 'version', label: 'Version', className: 'col-status' },
                { field: 'base_id', label: 'BaseID', className: 'col-id' },
                { field: 'status', label: 'Status', className: 'col-status' },
                {
                    field: 'impact_action',
                    label: 'Åtgärd',
                    className: 'col-status',
                    render: (row, table) => `
                        <select class="form-control change-impact-action-select" data-impact-id="${row.impact_id}">
                            <option value="to_be_replaced" ${row.impact_action === 'to_be_replaced' ? 'selected' : ''}>To Be Replaced</option>
                            <option value="cancellation" ${row.impact_action === 'cancellation' ? 'selected' : ''}>Cancellation</option>
                        </select>
                        <small>${table.highlightText(formatImpactActionLabel(row.impact_action), 'impact_action')}</small>
                    `
                },
                {
                    field: 'actions',
                    label: 'Actions',
                    className: 'col-actions',
                    sortable: false,
                    searchable: false,
                    render: (row) => `<button class="btn-icon btn-danger change-impact-remove-btn" data-impact-id="${row.impact_id}" title="Ta bort">🗑️</button>`
                }
            ],
            rows,
            emptyText: 'Inga objekt kopplade',
            onRender: () => this.bindImpactTableActions()
        });

        this.impactsTable.render();
    }

    bindImpactTableActions() {
        const root = document.getElementById('change-impacts-table');
        if (!root || !this.currentItem?.id) return;

        root.querySelectorAll('.change-open-object-btn').forEach((button) => {
            button.addEventListener('click', async () => {
                const objectId = Number(button.dataset.objectId);
                if (!Number.isFinite(objectId)) return;
                await switchView('objects');
                await openDetailPanel(objectId);
            });
        });

        root.querySelectorAll('.change-impact-action-select').forEach((select) => {
            select.addEventListener('change', async () => {
                const impactId = Number(select.dataset.impactId);
                if (!Number.isFinite(impactId)) return;

                try {
                    await ChangeManagementAPI.updateImpact(this.currentItem.id, impactId, {
                        impact_action: select.value
                    });
                    await this.refreshImpacts();
                    showToast('Objektåtgärd uppdaterad', 'success');
                } catch (error) {
                    console.error('Failed to update impact action:', error);
                    showToast(error.message || 'Kunde inte uppdatera åtgärd', 'error');
                }
            });
        });

        root.querySelectorAll('.change-impact-remove-btn').forEach((button) => {
            button.addEventListener('click', async () => {
                const impactId = Number(button.dataset.impactId);
                if (!Number.isFinite(impactId)) return;
                await this.deleteImpact(impactId);
            });
        });
    }

    async openObjectPicker() {
        if (!this.currentItem?.id || typeof showAddRelationModal !== 'function') return;

        try {
            await showAddRelationModal([], {
                mode: 'select',
                title: `Lägg till objekt till ${this.currentItem.display_id || `CO-${this.currentItem.id}`}`,
                description: 'Välj objekt som ska påverkas av change-objektet.',
                confirmLabel: 'Lägg till',
                hideSettings: true,
                allowNoSource: true,
                onSubmit: async ({ selectedItems }) => {
                    const items = Array.isArray(selectedItems) ? selectedItems : [];
                    for (const item of items) {
                        const objectId = Number(item?.id);
                        if (!Number.isFinite(objectId)) continue;
                        try {
                            await ChangeManagementAPI.addImpact(this.currentItem.id, {
                                object_id: objectId,
                                impact_action: 'to_be_replaced'
                            });
                        } catch (error) {
                            if (String(error.message || '').includes('already')) continue;
                            throw error;
                        }
                    }
                    await this.refreshImpacts();
                }
            });
        } catch (error) {
            console.error('Failed to add objects to change item:', error);
            showToast(error.message || 'Kunde inte lägga till objekt', 'error');
        }
    }

    async refreshImpacts() {
        if (!this.currentItem?.id) return;
        this.impacts = await ChangeManagementAPI.getImpacts(this.currentItem.id);
        this.renderImpactsTable();
    }

    async deleteImpact(impactId) {
        if (!this.currentItem?.id) return;
        if (!confirm('Ta bort objektet från change-listan?')) return;

        try {
            await ChangeManagementAPI.deleteImpact(this.currentItem.id, impactId);
            await this.refreshImpacts();
            showToast('Objekt borttaget från change', 'success');
        } catch (error) {
            console.error('Failed to delete impact:', error);
            showToast(error.message || 'Kunde inte ta bort objekt', 'error');
        }
    }
}

window.changeManagementView = null;
window.changeManagementDetailView = null;
window.currentChangeItemId = null;

async function loadChangeManagementView() {
    if (!window.changeManagementView) {
        window.changeManagementView = new ChangeManagementView('change-management-container');
    }
    await window.changeManagementView.render();
}

async function openChangeItemDetailView(itemId) {
    window.currentChangeItemId = itemId;
    showView('change-management-detail-view');
    updateNavigation('change-management');

    if (!window.changeManagementDetailView) {
        window.changeManagementDetailView = new ChangeManagementDetailView('change-management-detail-container');
    }
    await window.changeManagementDetailView.render(itemId);
}

function showCreateChangeItemModal() {
    const modal = document.getElementById('change-item-modal');
    const overlay = document.getElementById('modal-overlay');
    const form = document.getElementById('change-item-form');

    if (!modal || !overlay || !form) return;

    form.reset();
    modal.dataset.mode = 'create';
    modal.dataset.itemId = '';
    const title = document.getElementById('change-item-modal-title');
    if (title) title.textContent = 'Skapa Change';
    modal.style.display = 'block';
    overlay.style.display = 'block';
}

async function showEditChangeItemModal(itemId) {
    const modal = document.getElementById('change-item-modal');
    const overlay = document.getElementById('modal-overlay');
    const title = document.getElementById('change-item-modal-title');

    if (!modal || !overlay) return;

    try {
        const item = await ChangeManagementAPI.getById(itemId);
        document.getElementById('change-type').value = item.type || 'CRQ';
        document.getElementById('change-title').value = item.title || '';
        document.getElementById('change-description').value = item.description || '';
        document.getElementById('change-status').value = item.status || 'Open';

        modal.dataset.mode = 'edit';
        modal.dataset.itemId = String(itemId);
        if (title) title.textContent = 'Redigera Change';
        modal.style.display = 'block';
        overlay.style.display = 'block';
    } catch (error) {
        console.error('Failed to load change item for edit:', error);
        showToast(error.message || 'Kunde inte ladda change', 'error');
    }
}

async function saveChangeItem(event) {
    event.preventDefault();

    const modal = document.getElementById('change-item-modal');
    if (!modal) return;

    const mode = modal.dataset.mode || 'create';
    const itemId = Number(modal.dataset.itemId);
    const payload = {
        type: document.getElementById('change-type').value,
        title: document.getElementById('change-title').value.trim(),
        description: document.getElementById('change-description').value.trim(),
        status: document.getElementById('change-status').value.trim()
    };

    if (!payload.title) {
        showToast('Titel är obligatorisk', 'error');
        return;
    }

    try {
        let savedItemId = itemId;

        if (mode === 'edit' && Number.isFinite(itemId)) {
            const updatedItem = await ChangeManagementAPI.update(itemId, payload);
            savedItemId = Number(updatedItem?.id || itemId);
            showToast('Change uppdaterad', 'success');
        } else {
            const createdItem = await ChangeManagementAPI.create(payload);
            savedItemId = Number(createdItem?.id);
            showToast('Change skapad', 'success');
        }

        closeModal();

        if (window.changeManagementView) {
            await window.changeManagementView.loadItems();
        }

        if (window.currentChangeItemId && window.changeManagementDetailView) {
            await window.changeManagementDetailView.render(window.currentChangeItemId);
        } else if (Number.isFinite(savedItemId) && mode === 'create') {
            await openChangeItemDetailView(savedItemId);
        }
    } catch (error) {
        console.error('Failed to save change item:', error);
        showToast(error.message || 'Kunde inte spara change', 'error');
    }
}

async function deleteChangeItem(itemId) {
    if (!confirm('Är du säker på att du vill ta bort denna change?')) return;

    try {
        await ChangeManagementAPI.delete(itemId);
        showToast('Change borttagen', 'success');

        if (window.currentChangeItemId === itemId) {
            window.currentChangeItemId = null;
            await switchView('change-management');
        } else if (window.changeManagementView) {
            await window.changeManagementView.loadItems();
        }
    } catch (error) {
        console.error('Failed to delete change item:', error);
        showToast(error.message || 'Kunde inte ta bort change', 'error');
    }
}
