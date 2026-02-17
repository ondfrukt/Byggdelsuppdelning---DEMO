/**
 * File Objects View Component
 * Lists all file objects in the system in one dedicated view.
 */

class FileObjectsViewComponent {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.rows = [];
        this.searchTerm = '';
    }

    isFileObjectTypeName(typeName) {
        const normalized = (typeName || '').toLowerCase().trim();
        return normalized === 'filobjekt' || normalized === 'ritningsobjekt';
    }

    getDisplayName(obj) {
        return obj?.data?.Namn || obj?.data?.namn || obj?.data?.Name || obj?.data?.name || obj?.auto_id || 'Namnlöst objekt';
    }

    async loadRows() {
        const allTypes = await ObjectTypesAPI.getAll(false);
        const fileTypes = (allTypes || []).filter(type => this.isFileObjectTypeName(type.name));
        if (!fileTypes.length) {
            this.rows = [];
            return;
        }

        const objectLists = await Promise.all(
            fileTypes.map(type => ObjectsAPI.getAll({ type: type.name }))
        );

        const objects = objectLists.flat();
        const enrichedRows = await Promise.all(objects.map(async (obj) => {
            let documentsCount = 0;
            try {
                const docs = await ObjectsAPI.getDocuments(obj.id);
                documentsCount = Array.isArray(docs) ? docs.length : 0;
            } catch (_error) {
                documentsCount = 0;
            }

            return {
                id: obj.id,
                autoId: obj.auto_id || 'N/A',
                displayName: this.getDisplayName(obj),
                typeName: obj.object_type?.name || 'N/A',
                documentsCount,
                updatedAt: obj.updated_at || obj.created_at || null
            };
        }));

        this.rows = enrichedRows.sort((a, b) => {
            const aTime = new Date(a.updatedAt || 0).getTime();
            const bTime = new Date(b.updatedAt || 0).getTime();
            return bTime - aTime;
        });
    }

    getFilteredRows() {
        const term = this.searchTerm.trim().toLowerCase();
        if (!term) return this.rows;
        return this.rows.filter(row => {
            return (
                String(row.autoId).toLowerCase().includes(term) ||
                String(row.displayName).toLowerCase().includes(term) ||
                String(row.typeName).toLowerCase().includes(term)
            );
        });
    }

    async render() {
        if (!this.container) return;

        this.container.innerHTML = `
            <div class="section">
                <div class="view-header">
                    <h2>Filobjekt</h2>
                </div>
                <div class="file-objects-toolbar">
                    <input type="text" id="file-objects-search" class="search-input" placeholder="Sök på ID, namn eller typ...">
                </div>
                <div class="table-container file-objects-table-container">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>ID</th>
                                <th>Namn</th>
                                <th>Typ</th>
                                <th>Filer</th>
                                <th>Uppdaterad</th>
                                <th>Öppna</th>
                            </tr>
                        </thead>
                        <tbody id="file-objects-table-body">
                            <tr><td colspan="6" class="loading">Laddar filobjekt...</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
        `;

        const searchInput = document.getElementById('file-objects-search');
        if (searchInput) {
            searchInput.addEventListener('input', (event) => {
                this.searchTerm = event.target.value || '';
                this.renderRows();
            });
        }

        await this.loadRows();
        this.renderRows();
    }

    renderRows() {
        const tbody = document.getElementById('file-objects-table-body');
        if (!tbody) return;

        const rows = this.getFilteredRows();
        if (!rows.length) {
            tbody.innerHTML = '<tr><td colspan="6" class="loading">Inga filobjekt hittades</td></tr>';
            return;
        }

        tbody.innerHTML = rows.map(row => `
            <tr>
                <td><strong>${escapeHtml(row.autoId)}</strong></td>
                <td>${escapeHtml(row.displayName)}</td>
                <td>${escapeHtml(row.typeName)}</td>
                <td>${row.documentsCount}</td>
                <td>${formatDate(row.updatedAt)}</td>
                <td>
                    <button class="btn btn-sm btn-secondary" onclick="openFileObjectFromList(${row.id})">Öppna</button>
                </td>
            </tr>
        `).join('');
    }
}
