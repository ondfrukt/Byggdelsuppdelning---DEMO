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
    }

    isFileObjectType(typeName) {
        const normalized = (typeName || '').toLowerCase().trim();
        return normalized === 'filobjekt' || normalized === 'ritningsobjekt';
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
        const linkedTitle = this.compactMode ? '' : (this.isCurrentObjectFileObject ? '<h4>Länkade objekt</h4>' : '<h4>Filer via kopplade filobjekt</h4>');
        const filesTitle = this.compactMode ? '' : '<h4>Filer på filobjekt</h4>';
        const actionButtons = '';

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

        const modals = this.isCurrentObjectFileObject ? '' : '';

        const indirectFilesHint = this.isCurrentObjectFileObject ? '' : `
                <p class="text-muted">Visar endast filer som är kopplade via filobjekt.</p>`;


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
        const nameMatchers = ['filobjekt', 'ritningsobjekt', 'dokumentobjekt', 'dokument', 'ritning'];
        return objectTypes.find(type => nameMatchers.some(matcher => (type.name || '').toLowerCase().includes(matcher))) || null;
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
            const relations = await ObjectsAPI.getRelations(this.objectId);
            this.linkedFileObjects = (relations || [])
                .filter(relation => {
                    const linkedObject = relation.direction === 'incoming' ? relation.source_object : relation.target_object;
                    const typeName = (linkedObject?.object_type?.name || '').toLowerCase();
                    return this.isFileObjectType(typeName) || typeName.includes('dokument');
                })
                .map(relation => ({
                    relationId: relation.id,
                    linkedObject: relation.direction === 'incoming' ? relation.source_object : relation.target_object,
                    direction: relation.direction,
                    relationType: relation.relation_type
                }));

            const documentsByObject = await Promise.all(
                this.linkedFileObjects.map(async item => {
                    const linkedObject = item.linkedObject || {};
                    try {
                        const documents = await ObjectsAPI.getDocuments(linkedObject.id);
                        return (documents || []).map(doc => ({
                            ...doc,
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

        container.innerHTML = this.indirectDocuments.map(doc => `
            <div class="document-item ${this.compactMode ? 'compact' : ''}">
                <div class="document-icon">${this.getFileIcon(doc.filename)}</div>
                <div class="document-info">
                    <strong>${escapeHtml(doc.original_filename || doc.filename)}</strong>
                    <small>
                        ${escapeHtml(doc.document_type || 'Okänd filtyp')} •
                        ${this.formatFileSize(doc.file_size)} •
                        Från ${escapeHtml(doc.linkedObjectName)} (${escapeHtml(doc.linkedObjectAutoId || 'N/A')})
                    </small>
                </div>
                <div class="document-actions">
                    <button class="btn btn-sm btn-secondary"
                            onclick="downloadDocument(${doc.linkedObjectId}, ${doc.id})"
                            title="Ladda ner fil">
                        ${this.compactMode ? '↓' : 'Ladda ner'}
                    </button>
                </div>
            </div>
        `).join('');
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
        this.openModal(`document-object-modal-${this.objectId}`);
    }

    async openLinkExistingDocumentsModal() {
        await this.loadAvailableDocumentObjects();
        this.renderAvailableDocumentObjects();
        this.openModal(`existing-document-modal-${this.objectId}`);
    }

    async loadAvailableDocumentObjects() {
        const allObjects = await ObjectsAPI.getAllPaginated({ minimal: true });
        const linkedIds = new Set(this.linkedDocumentObjects.map(item => item.linkedObject?.id));
        this.availableDocumentObjects = (Array.isArray(allObjects) ? allObjects : allObjects.items || []).filter(obj => {
            const typeName = (obj.object_type?.name || '').toLowerCase();
            const isDocumentType = this.isFileObjectType(typeName) || typeName.includes('dokument');
            return isDocumentType && obj.id !== this.objectId && !linkedIds.has(obj.id);
        });
    }

    renderAvailableDocumentObjects() {
        const list = document.getElementById(`existing-document-list-${this.objectId}`);
        if (!list) return;

        if (!this.availableDocumentObjects.length) {
            list.innerHTML = '<p class="empty-state">Inga tillgängliga filobjekt att koppla</p>';
            return;
        }

        list.innerHTML = this.availableDocumentObjects.map(obj => {
            const displayName = obj.data?.Namn || obj.data?.namn || obj.data?.name || obj.auto_id;
            return `
                <label class="existing-document-option">
                    <input type="checkbox" value="${obj.id}">
                    <span>
                        <strong>${escapeHtml(displayName || 'Namnlöst objekt')}</strong><br>
                        <small>${escapeHtml(obj.auto_id || 'N/A')} • ${escapeHtml(obj.object_type?.name || 'Okänd typ')}</small>
                    </span>
                </label>
            `;
        }).join('');
    }

    async createAndLinkDocumentObject() {
        const nameInput = document.getElementById(`document-object-name-${this.objectId}`);
        const objectName = (nameInput?.value || '').trim();

        if (!objectName) {
            showToast('Ange ett namn på filobjektet', 'error');
            return;
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
                target_object_id: createdObject.id,
                relation_type: 'dokumenterar'
            });

            showToast('Filobjekt skapat och kopplat', 'success');
            this.closeModal(`document-object-modal-${this.objectId}`);
            if (nameInput) nameInput.value = '';
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
                target_object_id: targetId,
                relation_type: 'dokumenterar'
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
