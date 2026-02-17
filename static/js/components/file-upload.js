/**
 * File Upload Component
 * Handles document upload, listing, and management
 */

class FileUploadComponent {
    constructor(containerId, objectId, options = {}) {
        this.container = document.getElementById(containerId);
        this.objectId = objectId;
        this.documents = [];
        this.linkedDocumentObjects = [];
        this.documentObjectType = null;
        this.availableDocumentObjects = [];
        this.linkedFileObjects = [];
        this.indirectDocuments = [];
        this.options = options;
        this.compactMode = options.compactMode === true;
        this.currentObject = null;
        this.isCurrentObjectFileObject = false;
        this.existingDocumentColumnSearches = {
            id: '',
            name: '',
            type: '',
            files: '',
            metadata: ''
        };
    }

    isFileObjectType(typeName) {
        const normalized = (typeName || '').toLowerCase().trim();
        return normalized === 'filobjekt';
    }

    async loadCurrentObject() {
        this.currentObject = await ObjectsAPI.getById(this.objectId);
        const typeName = this.currentObject?.object_type?.name;
        this.isCurrentObjectFileObject = this.isFileObjectType(typeName);
    }
    
    async render() {
        if (!this.container) return;
        await this.loadCurrentObject();

        const rootClass = this.compactMode ? 'file-upload file-upload-compact' : 'file-upload';
        const linkedTitle = this.compactMode ? '' : (this.isCurrentObjectFileObject ? '<h4>Länkade objekt</h4>' : '<h4>Kopplade filer</h4>');
        const filesTitle = this.compactMode ? '' : '<h4>Filer på filobjekt</h4>';
        const actionButtons = this.isCurrentObjectFileObject ? '' : `
                <div class="file-link-toolbar">
                    <button class="btn btn-sm btn-secondary file-link-toolbar-btn" id="link-existing-file-object-btn-${this.objectId}" title="Koppla befintligt filobjekt" aria-label="Koppla befintligt filobjekt">🔗</button>
                    <button class="btn btn-sm btn-primary file-link-toolbar-btn" id="create-file-object-btn-${this.objectId}" title="Skapa nytt filobjekt" aria-label="Skapa nytt filobjekt">➕</button>
                </div>
        `;

        const fileSection = this.isCurrentObjectFileObject ? `
                <div class="upload-area" id="upload-area-${this.objectId}">
                    <div class="upload-content">
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                            <polyline points="17 8 12 3 7 8"></polyline>
                            <line x1="12" y1="3" x2="12" y2="15"></line>
                        </svg>
                        <p>Dra och släpp filer här eller <label for="file-input-${this.objectId}" class="file-label">välj filer</label></p>
                        <input type="file" id="file-input-${this.objectId}" multiple style="display: none;">
                    </div>
                </div>

                <div class="progress-bar" id="progress-bar-${this.objectId}" style="display: none;">
                    <div class="progress-fill" id="progress-fill-${this.objectId}"></div>
                </div>

                <div class="documents-list current-documents-list">
                    ${filesTitle}
                    <div id="documents-list-${this.objectId}"></div>
                </div>` : '';

        const modals = this.isCurrentObjectFileObject ? '' : `
                <div id="existing-document-modal-${this.objectId}" class="modal document-object-modal" role="dialog" aria-modal="true" aria-labelledby="existing-document-title-${this.objectId}">
                    <div class="modal-content document-object-modal-content">
                        <div class="modal-header">
                            <h3 id="existing-document-title-${this.objectId}">Koppla befintligt filobjekt</h3>
                            <button class="close-btn" type="button" data-close-modal="existing-document-modal-${this.objectId}">&times;</button>
                        </div>
                        <div style="padding: var(--spacing-lg);">
                            <div class="relation-filters">
                                <input type="text" id="existing-document-search-${this.objectId}" class="search-input" placeholder="Sök filobjekt...">
                            </div>
                            <div class="table-container relation-table-container">
                                <table class="data-table sortable-table" id="existing-document-table-${this.objectId}">
                                    <thead>
                                        <tr>
                                            <th class="col-actions" style="width: 36px;"><input type="checkbox" id="existing-document-select-all-${this.objectId}" aria-label="Markera alla"></th>
                                            <th class="col-id" data-sortable data-sort-type="text">ID</th>
                                            <th class="col-name" data-sortable data-sort-type="text">Namn</th>
                                            <th class="col-type" data-sortable data-sort-type="text">Typ</th>
                                            <th class="col-number" data-sortable data-sort-type="number">Filer</th>
                                            <th class="col-description" data-sortable data-sort-type="text">Metadata</th>
                                        </tr>
                                        <tr class="column-search-row">
                                            <th class="col-actions"></th>
                                            <th class="col-id"><input type="text" class="column-search-input existing-document-column-filter" data-filter-field="id" placeholder="ID"></th>
                                            <th class="col-name"><input type="text" class="column-search-input existing-document-column-filter" data-filter-field="name" placeholder="Namn"></th>
                                            <th class="col-type"><input type="text" class="column-search-input existing-document-column-filter" data-filter-field="type" placeholder="Typ"></th>
                                            <th class="col-number"><input type="text" class="column-search-input existing-document-column-filter" data-filter-field="files" placeholder="Filer"></th>
                                            <th class="col-description"><input type="text" class="column-search-input existing-document-column-filter" data-filter-field="metadata" placeholder="Metadata"></th>
                                        </tr>
                                    </thead>
                                    <tbody id="existing-document-list-${this.objectId}"></tbody>
                                </table>
                            </div>
                            <div class="modal-footer">
                                <button class="btn btn-secondary" type="button" data-close-modal="existing-document-modal-${this.objectId}">Avbryt</button>
                                <button class="btn btn-primary" type="button" id="confirm-link-existing-btn-${this.objectId}">Koppla valda</button>
                            </div>
                        </div>
                    </div>
                </div>

                <div id="document-object-modal-${this.objectId}" class="modal document-object-modal" role="dialog" aria-modal="true" aria-labelledby="create-document-title-${this.objectId}">
                    <div class="modal-content document-object-modal-content">
                        <div class="modal-header">
                            <h3 id="create-document-title-${this.objectId}">Skapa nytt filobjekt</h3>
                            <button class="close-btn" type="button" data-close-modal="document-object-modal-${this.objectId}">&times;</button>
                        </div>
                        <div style="padding: var(--spacing-lg);">
                            <div class="form-group">
                                <label for="document-object-name-${this.objectId}">Namn på filobjekt *</label>
                                <input id="document-object-name-${this.objectId}" type="text" class="form-control" placeholder="Ange namn">
                            </div>
                            <div class="form-group">
                                <label for="create-document-file-input-${this.objectId}">Filer *</label>
                                <input id="create-document-file-input-${this.objectId}" type="file" class="form-control" multiple>
                            </div>
                            <div class="modal-footer">
                                <button class="btn btn-secondary" type="button" data-close-modal="document-object-modal-${this.objectId}">Avbryt</button>
                                <button class="btn btn-primary" type="button" id="confirm-create-document-btn-${this.objectId}">Skapa och koppla</button>
                            </div>
                        </div>
                    </div>
                </div>
        `;

        const indirectFilesHint = '';


        this.container.innerHTML = `
            <div class="${rootClass}">
                ${actionButtons}

                <div class="documents-list linked-documents-list">
                    ${linkedTitle}
                    ${indirectFilesHint}
                    <div id="linked-documents-list-${this.objectId}"></div>
                </div>
                ${modals}
                ${fileSection}
            </div>
        `;

        this.attachEventListeners();
        await this.loadDocumentObjectType();
        if (this.isCurrentObjectFileObject) {
            await this.loadLinkedBusinessObjects();
            await this.loadDocuments();
        } else {
            await this.loadFilesViaLinkedDocumentObjects();
        }
    }

    attachEventListeners() {
        const uploadArea = document.getElementById(`upload-area-${this.objectId}`);
        const fileInput = document.getElementById(`file-input-${this.objectId}`);
        const linkExistingBtn = document.getElementById(`link-existing-file-object-btn-${this.objectId}`);
        const createFileObjectBtn = document.getElementById(`create-file-object-btn-${this.objectId}`);
        const confirmLinkExistingBtn = document.getElementById(`confirm-link-existing-btn-${this.objectId}`);
        const confirmCreateDocumentBtn = document.getElementById(`confirm-create-document-btn-${this.objectId}`);
        const createDocumentFileInput = document.getElementById(`create-document-file-input-${this.objectId}`);
        const existingSearchInput = document.getElementById(`existing-document-search-${this.objectId}`);
        const selectAllCheckbox = document.getElementById(`existing-document-select-all-${this.objectId}`);
        const columnFilters = this.container.querySelectorAll('.existing-document-column-filter');

        if (linkExistingBtn) {
            linkExistingBtn.addEventListener('click', () => this.openLinkExistingDocumentsModal());
        }

        if (createFileObjectBtn) {
            createFileObjectBtn.addEventListener('click', () => this.openCreateDocumentObjectModal());
        }

        if (confirmLinkExistingBtn) {
            confirmLinkExistingBtn.addEventListener('click', () => this.linkSelectedExistingDocumentObjects());
        }

        if (confirmCreateDocumentBtn) {
            confirmCreateDocumentBtn.addEventListener('click', () => this.createAndLinkDocumentObject());
        }

        if (createDocumentFileInput) {
            createDocumentFileInput.addEventListener('change', (e) => {
                const files = Array.from(e.target.files || []);
                this.selectedFiles = files;
            });
        }

        if (existingSearchInput) {
            existingSearchInput.addEventListener('input', (event) => {
                this.renderAvailableDocumentObjects((event.target.value || '').trim());
            });
        }

        columnFilters.forEach(input => {
            input.addEventListener('input', () => {
                const filterField = input.getAttribute('data-filter-field');
                if (!filterField) return;
                this.existingDocumentColumnSearches[filterField] = (input.value || '').trim().toLowerCase();
                this.renderAvailableDocumentObjects((existingSearchInput?.value || '').trim());
            });
        });

        if (selectAllCheckbox) {
            selectAllCheckbox.addEventListener('change', () => {
                const list = document.getElementById(`existing-document-list-${this.objectId}`);
                if (!list) return;
                list.querySelectorAll('input[type="checkbox"][data-file-object-checkbox="true"]').forEach(input => {
                    input.checked = selectAllCheckbox.checked;
                });
            });
        }

        this.container.querySelectorAll('[data-close-modal]').forEach(btn => {
            btn.addEventListener('click', () => {
                const modalId = btn.getAttribute('data-close-modal');
                if (modalId) this.closeModal(modalId);
            });
        });

        // Drag and drop
        if (uploadArea) {
            uploadArea.addEventListener('dragover', (e) => {
                e.preventDefault();
                uploadArea.classList.add('dragover');
            });
            
            uploadArea.addEventListener('dragleave', () => {
                uploadArea.classList.remove('dragover');
            });
            
            uploadArea.addEventListener('drop', (e) => {
                e.preventDefault();
                uploadArea.classList.remove('dragover');
                
                const files = Array.from(e.dataTransfer.files);
                this.prepareUpload(files);
            });
        }
        
        // File input
        if (fileInput) {
            fileInput.addEventListener('change', (e) => {
                const files = Array.from(e.target.files);
                this.prepareUpload(files);
            });
        }
    }
    
    async prepareUpload(files) {
        if (!files || files.length === 0) return;

        this.selectedFiles = files;

        const uploadArea = document.getElementById(`upload-area-${this.objectId}`);
        if (uploadArea) {
            const content = uploadArea.querySelector('.upload-content p');
            if (content) {
                content.textContent = `${files.length} fil(er) valda. Laddar upp...`;
            }
        }

        if (this.isCurrentObjectFileObject) {
            await this.uploadFiles();
        }

        return this.selectedFiles;
    }
    
    async uploadFiles() {
        if (!this.selectedFiles || this.selectedFiles.length === 0) return;
        
        const progressBar = document.getElementById(`progress-bar-${this.objectId}`);
        const progressFill = document.getElementById(`progress-fill-${this.objectId}`);
        
        if (progressBar) progressBar.style.display = 'block';
        
        try {
            for (let i = 0; i < this.selectedFiles.length; i++) {
                const file = this.selectedFiles[i];
                
                if (progressFill) {
                    const progress = ((i + 1) / this.selectedFiles.length) * 100;
                    progressFill.style.width = `${progress}%`;
                }
                
                await ObjectsAPI.uploadDocument(this.objectId, file);
            }
            
            showToast('Dokument uppladdade', 'success');
            await this.loadDocuments();
            this.resetUploadForm();
        } catch (error) {
            console.error('Upload failed:', error);
            showToast(error.message || 'Uppladdning misslyckades', 'error');
        } finally {
            if (progressBar) progressBar.style.display = 'none';
            if (progressFill) progressFill.style.width = '0%';
        }
    }
    
    resetUploadForm() {
        this.selectedFiles = null;
        
        const fileInput = document.getElementById(`file-input-${this.objectId}`);
        if (fileInput) fileInput.value = '';
        
        const uploadArea = document.getElementById(`upload-area-${this.objectId}`);
        if (uploadArea) {
            const content = uploadArea.querySelector('.upload-content p');
            if (content) {
                content.innerHTML = 'Dra och släpp filer här eller <label for="file-input-' + this.objectId + '" class="file-label">välj filer</label>';
            }
        }
    }
    
    async loadDocuments() {
        try {
            this.documents = await ObjectsAPI.getDocuments(this.objectId);
            this.renderDocuments();
        } catch (error) {
            console.error('Failed to load documents:', error);
        }
    }

    async loadDocumentObjectType() {
        try {
            const objectTypes = await ObjectTypesAPI.getAll(true);
            this.documentObjectType = this.findDocumentObjectType(objectTypes || []);
        } catch (error) {
            console.error('Failed to load object types for document flow:', error);
        }
    }

    findDocumentObjectType(objectTypes) {
        return objectTypes.find(type => (type.name || '').toLowerCase().trim() === 'filobjekt') || null;
    }

    async loadLinkedBusinessObjects() {
        try {
            const relations = await ObjectsAPI.getRelations(this.objectId);
            this.linkedDocumentObjects = (relations || [])
                .filter(relation => {
                    const linkedObject = relation.direction === 'incoming' ? relation.source_object : relation.target_object;
                    const typeName = (linkedObject?.object_type?.name || '').toLowerCase();
                    return !this.isFileObjectType(typeName);
                })
                .map(relation => ({
                    relationId: relation.id,
                    linkedObject: relation.direction === 'incoming' ? relation.source_object : relation.target_object,
                    direction: relation.direction,
                    relationType: relation.relation_type
                }));

            this.renderLinkedDocumentObjects();
        } catch (error) {
            console.error('Failed to load linked business objects:', error);
        }
    }

    getObjectNameFieldName(objectType) {
        if (!objectType?.fields) return null;
        const preferred = objectType.fields.find(field => ['namn', 'name'].includes((field.field_name || '').toLowerCase()));
        if (preferred) return preferred.field_name;

        const firstTextField = objectType.fields.find(field => ['text', 'textarea'].includes(field.field_type));
        return firstTextField?.field_name || null;
    }

    async loadLinkedDocumentObjects() {
        await this.loadFilesViaLinkedDocumentObjects();
    }

    async loadFilesViaLinkedDocumentObjects() {
        try {
            const linked = await ObjectsAPI.getLinkedFileObjects(this.objectId);
            this.linkedFileObjects = (linked || []).map(item => ({
                relationId: item.relation_id,
                linkedObject: item.file_object || {}
            }));

            const documentsByObject = await Promise.all(
                this.linkedFileObjects.map(async item => {
                    const linkedObject = item.linkedObject || {};
                    try {
                        const documents = await ObjectsAPI.getDocuments(linkedObject.id);
                        return (documents || []).map(doc => ({
                            ...doc,
                            relationId: item.relationId,
                            linkedObjectId: linkedObject.id,
                            linkedObjectAutoId: linkedObject.auto_id,
                            linkedObjectName: linkedObject.data?.Namn || linkedObject.data?.namn || linkedObject.data?.name || linkedObject.auto_id || 'Filobjekt'
                        }));
                    } catch (error) {
                        console.error('Failed to load documents for linked file object:', linkedObject.id, error);
                        return [];
                    }
                })
            );

            this.indirectDocuments = documentsByObject.flat();
            this.renderIndirectDocuments();
        } catch (error) {
            console.error('Failed to load files via linked file objects:', error);
        }
    }

    renderIndirectDocuments() {
        const container = document.getElementById(`linked-documents-list-${this.objectId}`);
        if (!container) return;

        if (!this.indirectDocuments.length) {
            container.innerHTML = '<p class="empty-state">Inga filer hittades via kopplade filobjekt</p>';
            return;
        }

        container.innerHTML = this.indirectDocuments.map(doc => {
            const relationId = parseInt(doc.relationId || 0, 10);
            const unlinkButton = relationId > 0
                ? `<button class="btn btn-sm btn-danger file-mini-action"
                            onclick="unlinkDocumentObject(${this.objectId}, ${relationId})"
                            title="Ta bort koppling till filobjekt">
                        ✕
                    </button>`
                : '';

            return `
            <div class="document-item document-item-detailed ${this.compactMode ? 'compact' : ''}">
                <div class="document-icon">${this.getFileIcon(doc.filename)}</div>
                <div class="document-info">
                    <strong>${escapeHtml(doc.original_filename || doc.filename)}</strong>
                    <small>
                        ${escapeHtml(doc.document_type || 'Okänd filtyp')} •
                        ${this.formatFileSize(doc.file_size)} •
                        ${formatDate(doc.uploaded_at)} •
                        Från ${escapeHtml(doc.linkedObjectName)} (${escapeHtml(doc.linkedObjectAutoId || 'N/A')})
                    </small>
                </div>
                <div class="document-actions">
                    <button class="btn btn-sm btn-secondary file-mini-action"
                            onclick="downloadDocument(${doc.linkedObjectId}, ${doc.id})"
                            title="Ladda ner fil">
                        ↓
                    </button>
                    <button class="btn btn-sm btn-secondary file-mini-action"
                            onclick="viewObjectDetail(${doc.linkedObjectId})"
                            title="Öppna filobjekt">
                        ↗
                    </button>
                    ${unlinkButton}
                </div>
            </div>
        `;
        }).join('');
    }

    renderLinkedDocumentObjects() {
        const container = document.getElementById(`linked-documents-list-${this.objectId}`);
        if (!container) return;

        if (!this.linkedDocumentObjects.length) {
            container.innerHTML = `<p class="empty-state">${this.isCurrentObjectFileObject ? 'Inga objekt kopplade ännu' : 'Inga filobjekt kopplade ännu'}</p>`;
            return;
        }

        container.innerHTML = this.linkedDocumentObjects.map(item => {
            const obj = item.linkedObject || {};
            const displayName = obj.data?.Namn || obj.data?.namn || obj.data?.name || obj.auto_id || 'Okänt objekt';
            return `
                <div class="document-item ${this.compactMode ? 'compact' : ''}">
                    <div class="document-icon">🔗</div>
                    <div class="document-info">
                        <strong>${escapeHtml(displayName)}</strong>
                        <small>${escapeHtml(obj.auto_id || 'N/A')} • ${escapeHtml(obj.object_type?.name || 'Okänd typ')}</small>
                    </div>
                    <div class="document-actions">
                        <button class="btn btn-sm btn-secondary" onclick="viewObjectDetail(${parseInt(obj.id || 0, 10)})" title="Öppna objekt">${this.compactMode ? '↗' : 'Öppna'}</button>
                        <button class="btn btn-sm btn-danger" onclick="unlinkDocumentObject(${this.objectId}, ${parseInt(item.relationId, 10)})" title="Koppla bort">${this.compactMode ? '✕' : 'Koppla bort'}</button>
                    </div>
                </div>
            `;
        }).join('');
    }

    openCreateDocumentObjectModal() {
        if (!this.documentObjectType) {
            showToast('Kunde inte hitta en objekttyp för filobjekt', 'error');
            return;
        }
        this.resetUploadForm();
        this.selectedFiles = [];
        const createDocumentFileInput = document.getElementById(`create-document-file-input-${this.objectId}`);
        if (createDocumentFileInput) createDocumentFileInput.value = '';
        this.openModal(`document-object-modal-${this.objectId}`);
    }

    async openLinkExistingDocumentsModal() {
        await this.loadAvailableDocumentObjects();
        this.existingDocumentColumnSearches = { id: '', name: '', type: '', files: '', metadata: '' };
        this.renderAvailableDocumentObjects();
        this.openModal(`existing-document-modal-${this.objectId}`);
        const searchInput = document.getElementById(`existing-document-search-${this.objectId}`);
        if (searchInput) searchInput.value = '';
        const selectAll = document.getElementById(`existing-document-select-all-${this.objectId}`);
        if (selectAll) selectAll.checked = false;
        const columnFilters = this.container?.querySelectorAll('.existing-document-column-filter') || [];
        columnFilters.forEach(input => {
            input.value = '';
        });
        const tableId = `existing-document-table-${this.objectId}`;
        const tableElement = document.getElementById(tableId);
        if (tableElement && typeof TableSort !== 'undefined' && tableElement.dataset.sortInitialized !== 'true') {
            new TableSort(tableId);
            tableElement.dataset.sortInitialized = 'true';
        }
    }

    async loadAvailableDocumentObjects() {
        const allObjects = await ObjectsAPI.getAllPaginated({ minimal: true });
        const linkedIds = new Set(this.linkedFileObjects.map(item => item.linkedObject?.id));
        const fileObjects = (Array.isArray(allObjects) ? allObjects : allObjects.items || []).filter(obj => {
            const typeName = (obj.object_type?.name || '').toLowerCase();
            return this.isFileObjectType(typeName) && obj.id !== this.objectId && !linkedIds.has(obj.id);
        });

        this.availableDocumentObjects = await Promise.all(fileObjects.map(async (obj) => {
            try {
                const docs = await ObjectsAPI.getDocuments(obj.id);
                return { ...obj, documents_count: Array.isArray(docs) ? docs.length : 0 };
            } catch (_error) {
                return { ...obj, documents_count: 0 };
            }
        }));
    }

    buildMetadataSummary(data) {
        if (!data || typeof data !== 'object') return '-';
        const entries = Object.entries(data)
            .filter(([, value]) => value !== null && value !== undefined && String(value).trim() !== '')
            .slice(0, 3)
            .map(([key, value]) => `${key}: ${String(value)}`);
        return entries.length ? entries.join(' | ') : '-';
    }

    getMetadataSearchText(data) {
        if (!data || typeof data !== 'object') return '';
        try {
            return JSON.stringify(data).toLowerCase();
        } catch (_error) {
            return '';
        }
    }

    renderAvailableDocumentObjects(searchTerm = '') {
        const list = document.getElementById(`existing-document-list-${this.objectId}`);
        if (!list) return;

        const normalizedSearch = (searchTerm || '').toLowerCase();
        const filteredObjects = this.availableDocumentObjects.filter(obj => {
            const displayName = obj.data?.Namn || obj.data?.namn || obj.data?.name || obj.auto_id || '';
            const metadata = this.buildMetadataSummary(obj.data);
            const metadataFullSearch = this.getMetadataSearchText(obj.data);
            const passesGlobal = !normalizedSearch || (
                String(displayName).toLowerCase().includes(normalizedSearch) ||
                String(obj.auto_id || '').toLowerCase().includes(normalizedSearch) ||
                String(obj.object_type?.name || '').toLowerCase().includes(normalizedSearch) ||
                String(metadata).toLowerCase().includes(normalizedSearch) ||
                metadataFullSearch.includes(normalizedSearch)
            );

            const passesId = !this.existingDocumentColumnSearches.id ||
                String(obj.auto_id || '').toLowerCase().includes(this.existingDocumentColumnSearches.id);
            const passesName = !this.existingDocumentColumnSearches.name ||
                String(displayName).toLowerCase().includes(this.existingDocumentColumnSearches.name);
            const passesType = !this.existingDocumentColumnSearches.type ||
                String(obj.object_type?.name || '').toLowerCase().includes(this.existingDocumentColumnSearches.type);
            const passesFiles = !this.existingDocumentColumnSearches.files ||
                String(parseInt(obj.documents_count || 0, 10)).includes(this.existingDocumentColumnSearches.files);
            const passesMetadata = !this.existingDocumentColumnSearches.metadata ||
                metadataFullSearch.includes(this.existingDocumentColumnSearches.metadata) ||
                String(metadata).toLowerCase().includes(this.existingDocumentColumnSearches.metadata);

            return passesGlobal && passesId && passesName && passesType && passesFiles && passesMetadata;
        });

        if (!filteredObjects.length) {
            list.innerHTML = '<tr><td colspan="6" class="loading">Inga tillgängliga filobjekt att koppla</td></tr>';
            return;
        }

        list.innerHTML = filteredObjects.map(obj => {
            const displayName = obj.data?.Namn || obj.data?.namn || obj.data?.name || obj.auto_id;
            const metadata = this.buildMetadataSummary(obj.data);
            return `
                <tr>
                    <td class="col-actions"><input type="checkbox" value="${obj.id}" data-file-object-checkbox="true"></td>
                    <td class="col-id" data-value="${escapeHtml(obj.auto_id || 'N/A')}"><strong>${escapeHtml(obj.auto_id || 'N/A')}</strong></td>
                    <td class="col-name" data-value="${escapeHtml(displayName || '')}">${escapeHtml(displayName || 'Namnlöst objekt')}</td>
                    <td class="col-type" data-value="${escapeHtml(obj.object_type?.name || '')}">${escapeHtml(obj.object_type?.name || 'Okänd typ')}</td>
                    <td class="col-number" data-value="${parseInt(obj.documents_count || 0, 10)}">${parseInt(obj.documents_count || 0, 10)}</td>
                    <td class="col-description" data-value="${escapeHtml(metadata)}"><small>${escapeHtml(metadata)}</small></td>
                </tr>
            `;
        }).join('');
    }

    async createAndLinkDocumentObject() {
        const nameInput = document.getElementById(`document-object-name-${this.objectId}`);
        const createDocumentFileInput = document.getElementById(`create-document-file-input-${this.objectId}`);
        const objectName = (nameInput?.value || '').trim();

        if (!objectName) {
            showToast('Ange ett namn på filobjektet', 'error');
            return;
        }

        if (createDocumentFileInput && (!this.selectedFiles || this.selectedFiles.length === 0)) {
            const files = Array.from(createDocumentFileInput.files || []);
            this.selectedFiles = files;
        }

        if (!this.selectedFiles || this.selectedFiles.length === 0) {
            showToast('Välj minst en fil innan du skapar dokumentobjektet', 'error');
            return;
        }

        const nameField = this.getObjectNameFieldName(this.documentObjectType);
        if (!nameField) {
            showToast('Filobjekttypen saknar ett textfält för namn', 'error');
            return;
        }

        try {
            // 1) Skapa dokumentobjekt
            const createdObject = await ObjectsAPI.create({
                object_type_id: this.documentObjectType.id,
                data: { [nameField]: objectName }
            });

            // 2) Ladda upp valda filer på det skapade dokumentobjektet
            await this.uploadFilesToObject(createdObject.id, this.selectedFiles);

            // 3) Koppla dokumentobjektet till aktivt objekt
            await ObjectsAPI.addRelation(this.objectId, {
                target_object_id: createdObject.id
            });

            showToast('Filobjekt skapat och kopplat', 'success');
            this.closeModal(`document-object-modal-${this.objectId}`);
            if (nameInput) nameInput.value = '';
            if (createDocumentFileInput) createDocumentFileInput.value = '';
            this.resetUploadForm();
            await this.loadLinkedDocumentObjects();
        } catch (error) {
            console.error('Failed to create and link document object:', error);
            showToast(error.message || 'Kunde inte skapa/koppla filobjekt', 'error');
        }
    }

    async uploadFilesToObject(targetObjectId, files) {
        const progressBar = document.getElementById(`progress-bar-${this.objectId}`);
        const progressFill = document.getElementById(`progress-fill-${this.objectId}`);
        if (progressBar) progressBar.style.display = 'block';

        try {
            for (let i = 0; i < files.length; i++) {
                if (progressFill) {
                    const progress = ((i + 1) / files.length) * 100;
                    progressFill.style.width = `${progress}%`;
                }
                await ObjectsAPI.uploadDocument(targetObjectId, files[i]);
            }
        } finally {
            if (progressBar) progressBar.style.display = 'none';
            if (progressFill) progressFill.style.width = '0%';
        }
    }

    async linkSelectedExistingDocumentObjects() {
        const list = document.getElementById(`existing-document-list-${this.objectId}`);
        if (!list) return;

        const selectedIds = Array.from(list.querySelectorAll('input[type="checkbox"]:checked')).map(input => parseInt(input.value, 10));
        if (!selectedIds.length) {
            showToast('Välj minst ett filobjekt att koppla', 'error');
            return;
        }

        try {
            await Promise.all(selectedIds.map(targetId => ObjectsAPI.addRelation(this.objectId, {
                target_object_id: targetId
            })));

            showToast('Valda filobjekt kopplades', 'success');
            this.closeModal(`existing-document-modal-${this.objectId}`);
            await this.loadLinkedDocumentObjects();
        } catch (error) {
            console.error('Failed to link existing document objects:', error);
            showToast(error.message || 'Kunde inte koppla valda filobjekt', 'error');
        }
    }

    openModal(modalId) {
        const overlay = document.getElementById('modal-overlay');
        const modal = document.getElementById(modalId);
        if (overlay) overlay.style.display = 'block';
        if (modal) modal.style.display = 'block';
    }

    closeModal(modalId) {
        const overlay = document.getElementById('modal-overlay');
        const modal = document.getElementById(modalId);
        if (modal) modal.style.display = 'none';

        const stillOpenModal = Array.from(document.querySelectorAll('.modal')).some(item => item.style.display === 'block');
        if (overlay && !stillOpenModal) {
            overlay.style.display = 'none';
        }
    }
    
    renderDocuments() {
        const listContainer = document.getElementById(`documents-list-${this.objectId}`);
        if (!listContainer) return;
        
        if (!this.documents || this.documents.length === 0) {
            listContainer.innerHTML = '<p class="empty-state">Inga dokument uppladdade ännu</p>';
            return;
        }
        
        listContainer.innerHTML = this.documents.map(doc => `
            <div class="document-item ${this.compactMode ? 'compact' : ''}">
                <div class="document-icon">
                    ${this.getFileIcon(doc.filename)}
                </div>
                <div class="document-info">
                    <strong>${escapeHtml(doc.original_filename || doc.filename)}</strong>
                    <small>
                        ${doc.document_type || 'Okänd filtyp'} • 
                        ${this.formatFileSize(doc.file_size)} • 
                        ${formatDate(doc.uploaded_at)}
                    </small>
                </div>
                <div class="document-actions">
                    <button class="btn btn-sm btn-secondary" 
                            onclick="downloadDocument(${this.objectId}, ${doc.id})"
                            title="Ladda ner dokument">
                        ${this.compactMode ? '↓' : 'Ladda ner'}
                    </button>
                    <button class="btn btn-sm btn-danger" 
                            onclick="deleteDocument(${this.objectId}, ${doc.id})"
                            title="Ta bort dokument">
                        ${this.compactMode ? '🗑' : 'Ta bort'}
                    </button>
                </div>
            </div>
        `).join('');
    }
    
    getFileIcon(filename) {
        const ext = (filename || '').split('.').pop().toLowerCase();
        const icons = {
            pdf: '📄',
            doc: '📝',
            docx: '📝',
            xls: '📊',
            xlsx: '📊',
            jpg: '🖼️',
            jpeg: '🖼️',
            png: '🖼️',
            gif: '🖼️',
            webp: '🖼️',
            dwg: '📐',
            dxf: '📐',
            rvt: '🏗️'
        };
        return icons[ext] || '📎';
    }
    
    formatFileSize(bytes) {
        if (!bytes) return 'N/A';
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }
    
    async refresh() {
        if (this.isCurrentObjectFileObject) {
            await this.loadDocuments();
            return;
        }
        await this.loadFilesViaLinkedDocumentObjects();
    }
}

// Global functions
function downloadDocument(objectId, documentId) {
    ObjectsAPI.downloadDocument(objectId, documentId);
}

async function deleteDocument(objectId, documentId) {
    if (!confirm('Är du säker på att du vill ta bort detta dokument?')) {
        return;
    }
    
    try {
        await ObjectsAPI.deleteDocument(objectId, documentId);
        showToast('Dokument borttaget', 'success');
        
        // Refresh if component exists
        const fileUpload = window.currentFileUpload;
        if (fileUpload) {
            await fileUpload.refresh();
        }
    } catch (error) {
        console.error('Failed to delete document:', error);
        showToast(error.message || 'Kunde inte ta bort dokument', 'error');
    }
}

async function unlinkDocumentObject(objectId, relationId) {
    if (!confirm('Är du säker på att du vill koppla bort filobjektet?')) {
        return;
    }

    try {
        await ObjectsAPI.deleteRelation(objectId, relationId);
        showToast('Filobjekt bortkopplat', 'success');
        const fileUpload = window.currentFileUpload;
        if (fileUpload) {
            await fileUpload.loadFilesViaLinkedDocumentObjects();
        }
    } catch (error) {
        console.error('Failed to unlink document object:', error);
        showToast(error.message || 'Kunde inte koppla bort filobjekt', 'error');
    }
}
