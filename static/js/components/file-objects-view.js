/**
 * File Objects View Component
 * Lists all file-object-like object types in one dedicated SystemTable view.
 */

class FileObjectsViewComponent {
    constructor(containerId) {
        this.containerId = containerId;
        this.container = document.getElementById(containerId);
        this.rows = [];
        this.table = null;
    }

    normalizeTypeName(typeName) {
        return String(typeName || '').toLowerCase().replace(/\s+/g, '').trim();
    }

    isFileObjectTypeName(typeName) {
        const normalized = this.normalizeTypeName(typeName);
        return ['filobjekt', 'fileobject', 'ritningsobjekt', 'dokumentobjekt', 'documentobject'].includes(normalized);
    }

    getDisplayName(obj) {
        return obj?.data?.Namn || obj?.data?.namn || obj?.data?.Name || obj?.data?.name || obj?.id_full || 'Namnlöst objekt';
    }

    getDescription(obj) {
        return obj?.data?.Beskrivning || obj?.data?.beskrivning || obj?.data?.Description || obj?.data?.description || '';
    }

    async loadRows() {
        const allTypes = await ObjectTypesAPI.getAll(false);
        const fileTypes = (allTypes || []).filter(type => this.isFileObjectTypeName(type?.name));
        if (!fileTypes.length) {
            this.rows = [];
            return;
        }

        const objectLists = await Promise.all(
            fileTypes.map(type => ObjectsAPI.getAll({ type: type.name }))
        );

        const objectsById = new Map();
        objectLists.flat().forEach(obj => {
            const id = Number(obj?.id);
            if (!Number.isFinite(id)) return;
            objectsById.set(id, obj);
        });

        this.rows = Array.from(objectsById.values())
            .map(obj => ({
                id: Number(obj.id),
                autoId: obj.id_full || 'N/A',
                typeName: obj.object_type?.name || 'N/A',
                displayName: this.getDisplayName(obj),
                description: this.getDescription(obj),
                filesCount: Number.isFinite(Number(obj?.file_count)) ? Number(obj.file_count) : 0,
                updatedAt: obj.updated_at || obj.created_at || null
            }))
            .sort((a, b) => {
                const aTime = new Date(a.updatedAt || 0).getTime();
                const bTime = new Date(b.updatedAt || 0).getTime();
                return bTime - aTime;
            });
    }

    async render() {
        if (!this.container) return;

        this.container.innerHTML = `
            <div class="view-header">
                <h2>Filobjekt</h2>
                <div class="view-header-actions">
                    <button class="btn btn-primary" id="file-objects-create-btn" type="button">
                        Lägg till filer
                    </button>
                </div>
            </div>
            <div class="object-list-layout">
                <div class="object-list-wrapper">
                    <div id="file-objects-system-table"></div>
                </div>
                <div id="file-objects-detail-panel" class="detail-panel">
                    <div class="detail-panel-header">
                        <div class="detail-panel-heading">
                            <h2 id="file-objects-detail-title">Objektdetaljer</h2>
                            <p id="file-objects-detail-category" class="detail-panel-category">Kategori: -</p>
                        </div>
                        <div class="detail-panel-header-actions">
                            <button class="detail-panel-close" type="button" onclick="closeFileObjectDetailPanel()">&times;</button>
                        </div>
                    </div>
                    <div id="file-objects-detail-body" class="detail-panel-content">
                        <p class="empty-state">Välj ett filobjekt att visa</p>
                    </div>
                </div>
            </div>
        `;

        const createButton = document.getElementById('file-objects-create-btn');
        if (createButton) {
            createButton.addEventListener('click', () => {
                if (typeof showCreateFileObjectModal === 'function') {
                    showCreateFileObjectModal();
                }
            });
        }

        await this.loadRows();

        this.table = new SystemTable({
            containerId: 'file-objects-system-table',
            tableId: 'file-objects-system-table',
            columns: [
                {
                    field: 'autoId',
                    label: 'ID',
                    className: 'col-id'
                },
                {
                    field: 'typeName',
                    label: 'Typ',
                    className: 'col-type',
                    badge: 'type'
                },
                {
                    field: 'displayName',
                    label: 'Namn',
                    className: 'col-name'
                },
                {
                    field: 'description',
                    label: 'Beskrivning',
                    className: 'col-description'
                },
                {
                    field: 'filesCount',
                    label: 'Filer',
                    className: 'col-number'
                },
                {
                    field: 'actions',
                    label: 'Actions',
                    className: 'col-actions',
                    sortable: false,
                    searchable: false,
                    render: (row, table) => `
                        <button class="btn btn-sm btn-secondary file-object-open-btn" data-object-id="${row.id}" aria-label="Oppna ${table.escape(row.displayName)}">
                            Oppna
                        </button>
                    `
                }
            ],
            rows: this.rows,
            emptyText: 'Inga filobjekt hittades',
            onRender: () => {
                this.container.querySelectorAll('.file-object-open-btn').forEach(button => {
                    button.addEventListener('click', () => {
                        const objectId = parseInt(button.dataset.objectId || '', 10);
                        if (!Number.isFinite(objectId)) return;
                        openFileObjectFromList(objectId);
                    });
                });
            }
        });

        this.table.render();
    }
}
