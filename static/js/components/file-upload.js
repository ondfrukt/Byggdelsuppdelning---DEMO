/**
 * File Upload Component
 * Handles document upload, listing, and management
 */

class FileUploadComponent {
    constructor(containerId, objectId) {
        this.container = document.getElementById(containerId);
        this.objectId = objectId;
        this.documents = [];
    }
    
    async render() {
        if (!this.container) return;
        
        this.container.innerHTML = `
            <div class="file-upload">
                <div class="upload-area" id="upload-area-${this.objectId}">
                    <div class="upload-content">
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                            <polyline points="17 8 12 3 7 8"></polyline>
                            <line x1="12" y1="3" x2="12" y2="15"></line>
                        </svg>
                        <p>Dra och släpp filer här eller <label for="file-input-${this.objectId}" class="file-label">välj filer</label></p>
                        <input type="file" 
                               id="file-input-${this.objectId}" 
                               multiple 
                               style="display: none;">
                    </div>
                </div>

                <div class="progress-bar" id="progress-bar-${this.objectId}" style="display: none;">
                    <div class="progress-fill" id="progress-fill-${this.objectId}"></div>
                </div>
                
                <div class="documents-list">
                    <h4>Uppladdade Dokument</h4>
                    <div id="documents-list-${this.objectId}"></div>
                </div>
            </div>
        `;
        
        this.attachEventListeners();
        await this.loadDocuments();
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

        await this.uploadFiles();
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
    
    renderDocuments() {
        const listContainer = document.getElementById(`documents-list-${this.objectId}`);
        if (!listContainer) return;
        
        if (!this.documents || this.documents.length === 0) {
            listContainer.innerHTML = '<p class="empty-state">Inga dokument uppladdade ännu</p>';
            return;
        }
        
        listContainer.innerHTML = this.documents.map(doc => `
            <div class="document-item">
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
                            onclick="downloadDocument(${this.objectId}, ${doc.id})">
                        Ladda ner
                    </button>
                    <button class="btn btn-sm btn-danger" 
                            onclick="deleteDocument(${this.objectId}, ${doc.id})">
                        Ta bort
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
        await this.loadDocuments();
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
