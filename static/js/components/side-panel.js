/**
 * SidePanel Component
 * Displays object details in a side panel
 */

class SidePanel {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.objectId = null;
        this.objectData = null;
        this.activeTab = 'details';
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
        
        this.container.innerHTML = `
            <div class="side-panel">
                <div class="side-panel-header">
                    <div>
                        <h3>${displayName}</h3>
                        <p class="side-panel-subtitle">${obj.auto_id} • ${obj.object_type?.name || 'Objekt'}</p>
                    </div>
                    <button class="btn btn-sm btn-secondary" onclick="closeSidePanel()">✕</button>
                </div>
                
                <div class="side-panel-tabs">
                    <button class="tab-btn ${this.activeTab === 'details' ? 'active' : ''}" 
                            onclick="sidePanelInstance.switchTab('details')">
                        Grunddata
                    </button>
                    <button class="tab-btn ${this.activeTab === 'relations' ? 'active' : ''}" 
                            onclick="sidePanelInstance.switchTab('relations')">
                        Relationer
                    </button>
                    <button class="tab-btn ${this.activeTab === 'documents' ? 'active' : ''}" 
                            onclick="sidePanelInstance.switchTab('documents')">
                        Dokument
                    </button>
                </div>
                
                <div class="side-panel-content">
                    ${this.renderTabContent()}
                </div>
                
                <div class="side-panel-footer">
                    <button class="btn btn-primary" onclick="editObject(${obj.id})">
                        Redigera
                    </button>
                    <button class="btn btn-danger" onclick="deleteObject(${obj.id})">
                        Ta bort
                    </button>
                </div>
            </div>
        `;
    }
    
    renderTabContent() {
        const obj = this.objectData;
        
        if (this.activeTab === 'details') {
            return this.renderDetails();
        } else if (this.activeTab === 'relations') {
            return this.renderRelations();
        } else if (this.activeTab === 'documents') {
            return this.renderDocuments();
        }
        
        return '';
    }
    
    renderDetails() {
        const obj = this.objectData;
        const data = obj.data || {};
        
        let html = '<div class="detail-list">';
        
        for (const [key, value] of Object.entries(data)) {
            if (value !== null && value !== undefined) {
                html += `
                    <div class="detail-item">
                        <span class="detail-label">${key}</span>
                        <span class="detail-value">${escapeHtml(String(value))}</span>
                    </div>
                `;
            }
        }
        
        if (Object.keys(data).length === 0) {
            html += '<p class="empty-state">Ingen data registrerad</p>';
        }
        
        html += '</div>';
        return html;
    }
    
    renderRelations() {
        const obj = this.objectData;
        const relations = obj.relations || {};
        
        let html = '<div class="relations-list">';
        
        const relationTypes = Object.keys(relations);
        if (relationTypes.length === 0) {
            html += '<p class="empty-state">Inga relationer</p>';
        } else {
            relationTypes.forEach(relType => {
                html += `<div class="relation-group">
                    <h4>${relType}</h4>
                    <div class="relation-items">`;
                
                relations[relType].forEach(rel => {
                    const target = rel.target;
                    if (target) {
                        const targetName = target.data?.Namn || target.data?.namn || target.auto_id;
                        html += `
                            <div class="relation-item" onclick="viewObjectInSidePanel(${target.id})">
                                <strong>${targetName}</strong>
                                <small>${target.auto_id} • ${target.object_type?.name}</small>
                            </div>
                        `;
                    }
                });
                
                html += `</div></div>`;
            });
        }
        
        html += '</div>';
        return html;
    }
    
    renderDocuments() {
        const obj = this.objectData;
        const documents = obj.documents || [];
        
        let html = '<div class="documents-list">';
        
        if (documents.length === 0) {
            html += '<p class="empty-state">Inga dokument</p>';
        } else {
            documents.forEach(doc => {
                html += `
                    <div class="document-item">
                        <div class="document-info">
                            <strong>${doc.file_name}</strong>
                            <small>${doc.document_type || 'Dokument'}</small>
                        </div>
                        <button class="btn btn-sm btn-secondary" 
                                onclick="ObjectsAPI.downloadDocument(${obj.id}, ${doc.id})">
                            Ladda ner
                        </button>
                    </div>
                `;
            });
        }
        
        html += '</div>';
        return html;
    }
    
    switchTab(tab) {
        this.activeTab = tab;
        this.render();
    }
    
    close() {
        if (this.container) {
            this.container.innerHTML = '';
        }
        this.objectId = null;
        this.objectData = null;
    }
}

// Helper function to view object in side panel
function viewObjectInSidePanel(objectId) {
    if (window.sidePanelInstance) {
        window.sidePanelInstance.render(objectId);
    }
}

// Helper function to close side panel
function closeSidePanel() {
    if (window.sidePanelInstance) {
        window.sidePanelInstance.close();
    }
}
