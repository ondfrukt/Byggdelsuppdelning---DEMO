/**
 * Object Detail Component
 * Displays object details with tabs for data, relations, and documents
 */

class ObjectDetailComponent {
    constructor(containerId, objectId) {
        this.container = document.getElementById(containerId);
        this.objectId = objectId;
        this.object = null;
        this.activeTab = 'grunddata';
    }
    
    async render() {
        if (!this.container) return;
        
        try {
            this.object = await ObjectsAPI.getById(this.objectId);
            
            this.container.innerHTML = `
                <div class="object-detail">
                    <div class="view-header">
                        <div>
                            <button class="btn btn-secondary" onclick="goBack()">← Tillbaka</button>
                            <h2>${this.object.id_full || this.object.auto_id} - ${this.getDisplayName()}</h2>
                        </div>
                        <div>
                            <button class="btn btn-primary" onclick="editObject(${this.objectId})">
                                Redigera
                            </button>
                            <button class="btn btn-danger" onclick="deleteObject(${this.objectId})">
                                Ta bort
                            </button>
                        </div>
                    </div>
                    
                    <div class="tabs">
                        <button class="tab-btn active" data-tab="grunddata">Grunddata</button>
                        <button class="tab-btn" data-tab="relationer">Relationer</button>
                        <button class="tab-btn" data-tab="dokument">Dokument</button>
                    </div>
                    
                    <div id="tab-grunddata" class="tab-content active">
                        ${this.renderGrunddata()}
                    </div>
                    
                    <div id="tab-relationer" class="tab-content">
                        <div id="relations-container-${this.objectId}"></div>
                    </div>
                    
                    <div id="tab-dokument" class="tab-content">
                        <div id="documents-container-${this.objectId}"></div>
                    </div>
                </div>
            `;
            
            this.attachEventListeners();
            
            // Initialize relation and document managers
            if (this.activeTab === 'relationer') {
                await this.loadRelations();
            } else if (this.activeTab === 'dokument') {
                await this.loadDocuments();
            }
        } catch (error) {
            console.error('Failed to load object:', error);
            showToast('Kunde inte ladda objekt', 'error');
        }
    }
    
    getDisplayName() {
        if (this.object.data) {
            return this.object.data.namn || this.object.data.name || 
                   this.object.data.title || this.object.object_type?.name || 'Objekt';
        }
        return this.object.object_type?.name || 'Objekt';
    }
    
    renderGrunddata() {
        const fields = [];
        
        // Basic info
        fields.push(`
            <div class="detail-item">
                <span class="detail-label">ID</span>
                <span class="detail-value">${this.object.id_full || 'N/A'}</span>
            </div>
        `);

        fields.push(`
            <div class="detail-item">
                <span class="detail-label">BaseID</span>
                <span class="detail-value">${this.object.main_id || this.object.auto_id || 'N/A'}</span>
            </div>
        `);
        
        fields.push(`
            <div class="detail-item">
                <span class="detail-label">Typ</span>
                <span class="detail-value">
                    <span class="object-type-badge" style="background-color: ${getObjectTypeColor(this.object.object_type?.name)}">
                        ${this.object.object_type?.name || 'N/A'}
                    </span>
                </span>
            </div>
        `);
        
        // Metadata fields
        fields.push(`
            <div class="detail-item">
                <span class="detail-label">Status</span>
                <span class="detail-value">
                    <span class="status-badge status-${(this.object.status || 'In work').toLowerCase().replace(' ', '-')}">
                        ${this.object.status || 'In work'}
                    </span>
                </span>
            </div>
        `);
        
        fields.push(`
            <div class="detail-item">
                <span class="detail-label">Version</span>
                <span class="detail-value">${this.object.version || 'v1'}</span>
            </div>
        `);
        
        // Dynamic fields from object data
        if (this.object.data) {
            const objectTypeFields = Array.isArray(this.object.object_type?.fields) ? this.object.object_type.fields : [];
            const fieldTypeByName = new Map(objectTypeFields.map(field => [String(field.field_name || ''), field.field_type]));
            Object.entries(this.object.data).forEach(([key, value]) => {
                const fieldType = fieldTypeByName.get(String(key)) || undefined;
                fields.push(`
                    <div class="detail-item">
                        <span class="detail-label">${this.formatFieldName(key)}</span>
                        <span class="detail-value">${this.formatValue(value, fieldType)}</span>
                    </div>
                `);
            });
        }
        
        // Timestamps
        fields.push(`
            <div class="detail-item">
                <span class="detail-label">Skapad</span>
                <span class="detail-value">${formatDateTime(this.object.created_at)}</span>
            </div>
        `);
        
        fields.push(`
            <div class="detail-item">
                <span class="detail-label">Uppdaterad</span>
                <span class="detail-value">${formatDateTime(this.object.updated_at)}</span>
            </div>
        `);
        
        return `<div class="detail-grid">${fields.join('')}</div>`;
    }
    
    formatFieldName(name) {
        return name.charAt(0).toUpperCase() + name.slice(1).replace(/_/g, ' ');
    }
    
    formatValue(value, fieldType = undefined) {
        if (value === null || value === undefined) return 'N/A';
        if (typeof value === 'boolean') return value ? 'Ja' : 'Nej';
        if (typeof value === 'object') return JSON.stringify(value);
        if (fieldType === 'textarea') return escapeHtml(String(value)).replace(/\r?\n/g, '<br>');
        return escapeHtml(String(value));
    }
    
    attachEventListeners() {
        // Tab switching
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const tab = e.target.dataset.tab;
                await this.switchTab(tab);
            });
        });
    }
    
    async switchTab(tabName) {
        this.activeTab = tabName;
        
        // Update tab buttons
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabName);
        });
        
        // Update tab contents
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });
        document.getElementById(`tab-${tabName}`).classList.add('active');
        
        // Load data for the active tab
        if (tabName === 'relationer') {
            await this.loadRelations();
        } else if (tabName === 'dokument') {
            await this.loadDocuments();
        }
    }
    
    async loadRelations() {
        const container = document.getElementById(`relations-container-${this.objectId}`);
        if (!container) return;
        
        const relationManager = new RelationManagerComponent(
            `relations-container-${this.objectId}`,
            this.objectId
        );
        window.currentRelationManager = relationManager;
        await relationManager.render();
    }
    
    async loadDocuments() {
        const container = document.getElementById(`documents-container-${this.objectId}`);
        if (!container) return;
        
        const fileUpload = new FileUploadComponent(
            `documents-container-${this.objectId}`,
            this.objectId
        );
        window.currentFileUpload = fileUpload;
        await fileUpload.render();
    }
    
    async refresh() {
        await this.render();
    }
}
