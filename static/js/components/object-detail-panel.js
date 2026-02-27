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
        this.richTextValues = {};
        
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
        
        const previousObjectId = this.objectId;
        const isObjectChange = Boolean(objectId && String(objectId) !== String(previousObjectId));

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

        if (isObjectChange) {
            // Reset globally cached component references when the viewed object changes.
            window.currentFileUpload = null;
        }

        if (this.activeTab === 'relations') {
            await this.loadRelationsIfNeeded();
        } else if (this.activeTab === 'files') {
            await this.loadFilesIfNeeded();
        }
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

        // Rich text open handlers (detail panel layout only)
        const richTextButtons = this.container.querySelectorAll('[data-open-richtext-key]');
        richTextButtons.forEach(node => {
            node.addEventListener('click', (event) => {
                event.preventDefault();
                this.openRichTextViewer(node.dataset.openRichtextKey);
            });
            node.addEventListener('keydown', (event) => {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                this.openRichTextViewer(node.dataset.openRichtextKey);
            });
        });
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
                        <p class="side-panel-subtitle">${obj.id_full || obj.auto_id} • ${obj.object_type?.name || 'Objekt'}</p>
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
                <button class="tab-btn ${this.activeTab === 'files' ? 'active' : ''}" 
                        data-tab="files">
                    Filer
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
        } else if (this.activeTab === 'files') {
            return this.renderFilesTab();
        }
        
        return '';
    }
    
    renderDetails() {
        const obj = this.objectData;
        const data = obj.data || {};
        this.richTextValues = {};
        let richTextCounter = 0;
        const objectTypeFields = Array.isArray(obj.object_type?.fields)
            ? obj.object_type.fields.slice().sort((a, b) => (a.display_order || 9999) - (b.display_order || 9999))
            : [];
        const fieldMap = new Map(objectTypeFields.map(field => [String(field.field_name || ''), field]));
        const normalizedFieldMap = new Map(
            objectTypeFields.map(field => [this.normalizeFieldKey(field.field_name), field])
        );
        const normalizedDataMap = new Map(
            Object.entries(data).map(([key, value]) => [this.normalizeFieldKey(key), { key, value }])
        );
        const renderedFieldKeys = new Set();
        
        let html = `<div class="detail-list ${this.options.layout === 'detail' ? 'detail-list-grid' : ''}">`;
        
        // Add compact header row for detail panel layout
        if (this.options.layout === 'detail') {
            const typeColor = getObjectTypeColor(obj.object_type?.name);
            html += `
                <div class="detail-list-header">
                    <div class="detail-header-item">
                        <span class="detail-label">ID</span>
                        <span class="detail-value"><strong>${obj.id_full || obj.auto_id}</strong></span>
                    </div>
                    <div class="detail-header-item">
                        <span class="detail-label">Typ</span>
                        <span class="detail-value">
                            <span class="object-type-badge" data-type="${obj.object_type?.name || ''}" style="background-color: ${typeColor}">
                                ${obj.object_type?.name || 'N/A'}
                            </span>
                        </span>
                    </div>
                    <div class="detail-header-item">
                        <span class="detail-label">Skapad</span>
                        <span class="detail-value">${formatDate(obj.created_at)}</span>
                    </div>
                </div>
                <div class="detail-list-header">
                    <div class="detail-header-item">
                        <span class="detail-label">Status</span>
                        <span class="detail-value">${obj.status || 'N/A'}</span>
                    </div>
                    <div class="detail-header-item">
                        <span class="detail-label">Version</span>
                        <span class="detail-value">${obj.version || 'v1'}</span>
                    </div>
                    <div class="detail-header-item">
                        <span class="detail-label">BaseID</span>
                        <span class="detail-value">${obj.main_id || obj.auto_id || 'N/A'}</span>
                    </div>
                </div>
            `;
        }
        
        if (this.options.layout === 'detail') {
            html += '<div class="detail-field-grid">';
        }

        // Render object data fields in configured order
        for (const field of objectTypeFields) {
            const fieldName = String(field.field_name || '');
            const normalizedName = this.normalizeFieldKey(fieldName);
            const entry = normalizedDataMap.get(normalizedName);
            renderedFieldKeys.add(normalizedName);

            const key = entry?.key || fieldName;
            const value = entry?.value;
            const label = field?.display_name || key;
            const looksLikeHtml = typeof value === 'string' && /<\s*[a-z][^>]*>/i.test(value);
            const resolvedFieldType = field?.field_type || (looksLikeHtml ? 'richtext' : undefined);
            const hasValue = !(value === null || value === undefined || value === '');
            const formattedValue = formatFieldValue(value, resolvedFieldType);
            const isRichText = this.options.layout === 'detail' && resolvedFieldType === 'richtext' && hasValue;
            const detailWidthClass = this.getDetailWidthClass(field, isRichText);
            const detailItemClass = isRichText
                ? `detail-item detail-item-richtext ${detailWidthClass}`
                : `detail-item ${detailWidthClass}`;
            const valueClass = isRichText ? 'detail-value richtext-value' : 'detail-value';
            const richTextKey = isRichText ? `richtext-${richTextCounter++}` : '';

            if (isRichText) {
                const rawHtml = sanitizeRichTextHtml(String(value || ''));
                this.richTextValues[richTextKey] = {
                    label,
                    html: rawHtml || formattedValue
                };
            }

            const richTextHtml = isRichText
                ? String(this.richTextValues[richTextKey]?.html || '').trim()
                : '';
            const valueMarkup = isRichText
                ? `
                    <div class="${valueClass}">
                        <div class="richtext-preview-text">${richTextHtml || '<p>Innehåll finns</p>'}</div>
                        <button type="button"
                                class="btn btn-secondary btn-sm richtext-open-btn"
                                data-open-richtext-key="${richTextKey}">
                            Öppna innehåll
                        </button>
                    </div>
                `
                : `<div class="${valueClass}">${formattedValue}</div>`;
            
            html += `
                <div class="${detailItemClass}">
                    <span class="detail-label">${label}${isRichText ? '<span class="detail-richtext-hint"> (öppnas i egen ruta)</span>' : ''}</span>
                    ${valueMarkup}
                </div>
            `;
        }

        // Render any unknown data keys after configured fields.
        for (const [key, value] of Object.entries(data)) {
            const normalizedKey = this.normalizeFieldKey(key);
            if (renderedFieldKeys.has(normalizedKey)) continue;
            if (value === null || value === undefined) continue;

            const field = fieldMap.get(String(key))
                || normalizedFieldMap.get(normalizedKey);
            const label = field?.display_name || key;
            const looksLikeHtml = typeof value === 'string' && /<\s*[a-z][^>]*>/i.test(value);
            const resolvedFieldType = field?.field_type || (looksLikeHtml ? 'richtext' : undefined);
            const formattedValue = formatFieldValue(value, resolvedFieldType);
            const isRichText = this.options.layout === 'detail' && resolvedFieldType === 'richtext';
            const detailWidthClass = this.getDetailWidthClass(field, isRichText);
            const detailItemClass = isRichText
                ? `detail-item detail-item-richtext ${detailWidthClass}`
                : `detail-item ${detailWidthClass}`;
            const valueClass = isRichText ? 'detail-value richtext-value' : 'detail-value';
            const richTextKey = isRichText ? `richtext-${richTextCounter++}` : '';

            if (isRichText) {
                const rawHtml = sanitizeRichTextHtml(String(value || ''));
                this.richTextValues[richTextKey] = {
                    label,
                    html: rawHtml || formattedValue
                };
            }

            const richTextHtml = isRichText
                ? String(this.richTextValues[richTextKey]?.html || '').trim()
                : '';
            const valueMarkup = isRichText
                ? `
                    <div class="${valueClass}">
                        <div class="richtext-preview-text">${richTextHtml || '<p>Innehåll finns</p>'}</div>
                        <button type="button"
                                class="btn btn-secondary btn-sm richtext-open-btn"
                                data-open-richtext-key="${richTextKey}">
                            Öppna innehåll
                        </button>
                    </div>
                `
                : `<div class="${valueClass}">${formattedValue}</div>`;

            html += `
                <div class="${detailItemClass}">
                    <span class="detail-label">${label}${isRichText ? '<span class="detail-richtext-hint"> (öppnas i egen ruta)</span>' : ''}</span>
                    ${valueMarkup}
                </div>
            `;
        }

        if (this.options.layout === 'detail') {
            html += '</div>';
        }
        
        if (objectTypeFields.length === 0 && Object.keys(data).length === 0 && this.options.layout === 'side') {
            html += '<p class="empty-state">Ingen data registrerad</p>';
        }
        
        html += '</div>';
        return html;
    }

    normalizeFieldKey(key) {
        return String(key || '').trim().toLowerCase();
    }

    getDetailWidthClass(field, isRichText = false) {
        if (isRichText) return 'detail-width-full';
        const width = String(field?.detail_width || '').toLowerCase();
        if (width === 'full') return 'detail-width-full';
        if (width === 'third') return 'detail-width-third';
        if (width === 'half') return 'detail-width-half';

        const fieldType = String(field?.field_type || '').toLowerCase();
        return (fieldType === 'richtext' || fieldType === 'textarea') ? 'detail-width-full' : 'detail-width-half';
    }
    
    renderRelationsTab() {
        const obj = this.objectData;
        const containerId = `panel-relations-container-${obj.id}`;
        
        return `<div id="${containerId}"></div>`;
    }
    
    renderFilesTab() {
        const obj = this.objectData;
        const containerId = `panel-files-container-${obj.id}`;
        
        const tabClass = this.options.layout === 'detail' ? 'documents-tab-content compact-documents' : 'documents-tab-content';
        return `<div id="${containerId}" class="${tabClass}"></div>`;
    }
    
    async loadRelationsIfNeeded() {
        if (this.activeTab !== 'relations' || !this.objectData) return;
        
        const containerId = `panel-relations-container-${this.objectData.id}`;
        const container = document.getElementById(containerId);
        
        if (!container || container.dataset.loaded) return;
        
        try {
            const relationManager = new RelationManagerComponent(containerId, this.objectData.id);
            window.currentRelationManager = relationManager;
            await relationManager.render();
            container.dataset.loaded = 'true';
        } catch (error) {
            console.error('Failed to load relations:', error);
        }
    }
    
    async loadFilesIfNeeded() {
        if (this.activeTab !== 'files' || !this.objectData) return;
        
        const containerId = `panel-files-container-${this.objectData.id}`;
        const container = document.getElementById(containerId);
        
        if (!container || container.dataset.loaded) return;
        
        try {
            const fileUpload = new FileUploadComponent(containerId, this.objectData.id, {
                compactMode: this.options.layout === 'detail'
            });
            window.currentFileUpload = fileUpload;
            await fileUpload.render();
            container.dataset.loaded = 'true';
        } catch (error) {
            console.error('Failed to load files:', error);
        }
    }
    
    async switchTab(tab) {
        this.activeTab = tab;
        await this.render();
        
        // Load content for the newly selected tab
        if (tab === 'relations') {
            await this.loadRelationsIfNeeded();
        } else if (tab === 'files') {
            await this.loadFilesIfNeeded();
        }
    }

    ensureRichTextViewer() {
        let viewer = document.getElementById('richtext-viewer');
        if (viewer) return viewer;

        viewer = document.createElement('div');
        viewer.id = 'richtext-viewer';
        viewer.className = 'richtext-viewer';
        viewer.innerHTML = `
            <div class="richtext-viewer-backdrop">
                <div class="richtext-viewer-dialog" role="dialog" aria-modal="true" aria-labelledby="richtext-viewer-title">
                    <div class="richtext-viewer-header">
                        <h3 id="richtext-viewer-title">Formaterad text</h3>
                        <button type="button" class="close-btn" data-action="close-richtext-viewer" aria-label="Stäng">&times;</button>
                    </div>
                    <div id="richtext-viewer-content" class="richtext-viewer-content"></div>
                </div>
            </div>
        `;

        viewer.addEventListener('click', (event) => {
            const backdrop = viewer.querySelector('.richtext-viewer-backdrop');
            if (event.target === backdrop || event.target.closest('[data-action="close-richtext-viewer"]')) {
                this.closeRichTextViewer();
            }
        });

        document.addEventListener('keydown', (event) => {
            const isOpen = viewer.classList.contains('active');
            if (isOpen && event.key === 'Escape') {
                this.closeRichTextViewer();
            }
        });

        document.body.appendChild(viewer);
        return viewer;
    }

    openRichTextViewer(richTextKey) {
        if (!richTextKey || !this.richTextValues[richTextKey]) return;

        const viewer = this.ensureRichTextViewer();
        const titleNode = viewer.querySelector('#richtext-viewer-title');
        const contentNode = viewer.querySelector('#richtext-viewer-content');
        const richText = this.richTextValues[richTextKey];
        if (!titleNode || !contentNode || !richText) return;

        titleNode.textContent = richText.label || 'Formaterad text';
        let html = String(richText.html || '');
        if (!/<\s*[a-z][^>]*>/i.test(html) && /&lt;\s*[a-z][^&]*&gt;/i.test(html)) {
            const decoder = document.createElement('textarea');
            decoder.innerHTML = html;
            html = sanitizeRichTextHtml(decoder.value || '');
        }
        contentNode.innerHTML = html || '-';
        viewer.classList.add('active');
    }

    closeRichTextViewer() {
        const viewer = document.getElementById('richtext-viewer');
        if (!viewer) return;
        viewer.classList.remove('active');
    }
    
    close() {
        this.closeRichTextViewer();
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
