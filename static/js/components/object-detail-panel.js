/**
 * ObjectDetailPanel Component
 * Unified component for displaying object details in both tree view and object list contexts
 * Replaces both side-panel and detail-panel implementations
 */

class ObjectDetailPanel {
    constructor(containerId, options = {}) {
        this.container = document.getElementById(containerId);
        this.objectId = null;
        this.objectData = null;
        this.activeTab = 'details';
        
        // Configuration options
        this.options = {
            layout: options.layout || 'side', // 'side' for tree view, 'detail' for object list
            onClose: options.onClose || null,
            showHeader: options.showHeader !== false, // Show header by default
            ...options
        };
    }
    
    async loadObject(objectId) {
        try {
            this.objectId = objectId;
            const response = await fetch(`/api/objects/${objectId}`);
            if (!response.ok) {
                throw new Error('Failed to load object');
            }
            this.objectData = await response.json();
        } catch (error) {
            console.error('Error loading object:', error);
            throw error;
        }
    }
    
    async render(objectId) {
        if (!this.container) return;
        
        if (objectId) {
            await this.loadObject(objectId);
        }
        
        if (!this.objectData) {
            this.container.innerHTML = '<p class="empty-state">Välj ett objekt att visa</p>';
            return;
        }
        
        const obj = this.objectData;
        const displayName = obj.data?.Namn || obj.data?.namn || obj.auto_id;
        
        // Determine CSS class based on layout
        const panelClass = this.options.layout === 'detail' ? 'detail-panel-content-inner' : 'side-panel';
        
        this.container.innerHTML = `
            <div class="${panelClass}">
                ${this.renderHeader(obj, displayName)}
                ${this.renderTabs()}
                ${this.renderContent()}
            </div>
        `;
        
        // Attach event listeners after rendering
        this.attachEventListeners();
    }
    
    attachEventListeners() {
        if (!this.container) return;
        
        // Add tab click listeners
        const tabButtons = this.container.querySelectorAll('.tab-btn');
        tabButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const tab = btn.dataset.tab;
                this.switchTab(tab);
            });
        });
        
        // Add close button listener for side panel
        const closeBtn = this.container.querySelector('.close-panel-btn');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                this.close();
            });
        }
    }
    
    renderHeader(obj, displayName) {
        if (!this.options.showHeader && this.options.layout === 'detail') {
            return ''; // Header is rendered outside for detail panel
        }
        
        if (this.options.layout === 'side') {
            return `
                <div class="side-panel-header">
                    <div>
                        <h3>${displayName}</h3>
                        <p class="side-panel-subtitle">${obj.auto_id} • ${obj.object_type?.name || 'Objekt'}</p>
                    </div>
                    <button class="btn btn-sm btn-secondary close-panel-btn">✕</button>
                </div>
            `;
        }
        
        return '';
    }
    
    renderTabs() {
        const tabClass = this.options.layout === 'side' ? 'side-panel-tabs' : 'tabs';
        
        return `
            <div class="${tabClass}">
                <button class="tab-btn ${this.activeTab === 'details' ? 'active' : ''}" 
                        data-tab="details">
                    Grunddata
                </button>
                <button class="tab-btn ${this.activeTab === 'relations' ? 'active' : ''}" 
                        data-tab="relations">
                    Relationer
                </button>
                <button class="tab-btn ${this.activeTab === 'documents' ? 'active' : ''}" 
                        data-tab="documents">
                    Dokument
                </button>
            </div>
        `;
    }
    
    renderContent() {
        const contentClass = this.options.layout === 'side' ? 'side-panel-content' : 'panel-content';
        
        return `
            <div class="${contentClass}">
                ${this.renderTabContent()}
            </div>
        `;
    }
    
    renderTabContent() {
        if (this.activeTab === 'details') {
            return this.renderDetails();
        } else if (this.activeTab === 'relations') {
            return this.renderRelationsTab();
        } else if (this.activeTab === 'documents') {
            return this.renderDocumentsTab();
        }
        
        return '';
    }
    
    renderDetails() {
        const obj = this.objectData;
        const data = obj.data || {};
        
        let html = '<div class="detail-list">';
        
        // Add compact header row for detail panel layout
        if (this.options.layout === 'detail') {
            const typeColor = getObjectTypeColor(obj.object_type?.name);
            html += `
                <div class="detail-list-header">
                    <div class="detail-header-item">
                        <span class="detail-label">ID</span>
                        <span class="detail-value"><strong>${obj.auto_id}</strong></span>
                    </div>
                    <div class="detail-header-item">
                        <span class="detail-label">TYP</span>
                        <span class="detail-value">
                            <span class="object-type-badge" data-type="${obj.object_type?.name || ''}" style="background-color: ${typeColor}">
                                ${obj.object_type?.name || 'N/A'}
                            </span>
                        </span>
                    </div>
                    <div class="detail-header-item">
                        <span class="detail-label">SKAPAD</span>
                        <span class="detail-value">${formatDate(obj.created_at)}</span>
                    </div>
                </div>
                <div class="detail-list-header">
                    <div class="detail-header-item">
                        <span class="detail-label">STATUS</span>
                        <span class="detail-value">${obj.status || 'N/A'}</span>
                    </div>
                    <div class="detail-header-item">
                        <span class="detail-label">VERSION</span>
                        <span class="detail-value">${obj.version || 'N/A'}</span>
                    </div>
                    <div class="detail-header-item">
                        <span class="detail-label">ID (Full)</span>
                        <span class="detail-value">${obj.id_full || obj.auto_id}</span>
                    </div>
                </div>
            `;
        }
        
        // Render object data fields
        for (const [key, value] of Object.entries(data)) {
            if (value !== null && value !== undefined) {
                // Find field definition for better display
                const field = obj.object_type?.fields?.find(f => f.field_name === key);
                const label = field?.display_name || key;
                const formattedValue = this.options.layout === 'detail' 
                    ? formatFieldValue(value, field?.field_type)
                    : escapeHtml(String(value));
                
                html += `
                    <div class="detail-item">
                        <span class="detail-label">${label}</span>
                        <span class="detail-value">${formattedValue}</span>
                    </div>
                `;
            }
        }
        
        if (Object.keys(data).length === 0 && this.options.layout === 'side') {
            html += '<p class="empty-state">Ingen data registrerad</p>';
        }
        
        html += '</div>';
        return html;
    }
    
    renderRelationsTab() {
        const obj = this.objectData;
        const containerId = `panel-relations-container-${obj.id}`;
        
        return `<div id="${containerId}"></div>`;
    }
    
    renderDocumentsTab() {
        const obj = this.objectData;
        const containerId = `panel-documents-container-${obj.id}`;
        
        return `<div id="${containerId}"></div>`;
    }
    
    async loadRelationsIfNeeded() {
        if (this.activeTab !== 'relations' || !this.objectData) return;
        
        const containerId = `panel-relations-container-${this.objectData.id}`;
        const container = document.getElementById(containerId);
        
        if (!container || container.dataset.loaded) return;
        
        try {
            const relationManager = new RelationManagerComponent(containerId, this.objectData.id);
            await relationManager.render();
            container.dataset.loaded = 'true';
        } catch (error) {
            console.error('Failed to load relations:', error);
        }
    }
    
    async loadDocumentsIfNeeded() {
        if (this.activeTab !== 'documents' || !this.objectData) return;
        
        const containerId = `panel-documents-container-${this.objectData.id}`;
        const container = document.getElementById(containerId);
        
        if (!container || container.dataset.loaded) return;
        
        try {
            const fileUpload = new FileUploadComponent(containerId, this.objectData.id);
            await fileUpload.render();
            container.dataset.loaded = 'true';
        } catch (error) {
            console.error('Failed to load documents:', error);
        }
    }
    
    async switchTab(tab) {
        this.activeTab = tab;
        await this.render();
        
        // Load content for the newly selected tab
        if (tab === 'relations') {
            await this.loadRelationsIfNeeded();
        } else if (tab === 'documents') {
            await this.loadDocumentsIfNeeded();
        }
    }
    
    close() {
        if (this.options.onClose) {
            this.options.onClose();
        } else if (this.container) {
            this.container.innerHTML = '';
        }
        this.objectId = null;
        this.objectData = null;
    }
}

// Helper function for backward compatibility
function createObjectDetailPanel(containerId, options) {
    const panel = new ObjectDetailPanel(containerId, options);
    window[`objectDetailPanelInstance_${containerId}`] = panel;
    return panel;
}
