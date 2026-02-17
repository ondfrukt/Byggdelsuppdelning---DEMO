/**
 * TreeView Component
 * Displays hierarchical tree structure of objects
 */

class TreeView {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.data = [];
        this.expandedNodes = new Set();
        this.onNodeClick = null;
        this.tableSortInstance = null;
        this.selectedObjectId = window.currentSelectedObjectId || null;
        this.columnSearches = {
            name: '',
            id: '',
            type: '',
            kravtext: '',
            beskrivning: '',
            files: ''
        };
        this.searchExpandedNodes = new Set();
        this.searchDebounceTimer = null;
        this.searchDebounceMs = 350;
        this.searchFocusState = null;
    }
    
    async loadData() {
        try {
            const response = await fetch('/api/objects/tree');
            if (!response.ok) {
                throw new Error('Failed to load tree data');
            }
            this.data = await response.json();
        } catch (error) {
            console.error('Error loading tree:', error);
            throw error;
        }
    }
    
    async render(options = {}) {
        if (!this.container) return;
        
        await this.loadData();
        
        if (this.data.length === 0) {
            this.container.innerHTML = '<p class="empty-state">Inga byggdelar ännu</p>';
            return;
        }
        
        const filteredData = this.getFilteredTreeData();
        const treeHtml = filteredData.map(node => this.renderNode(node, 0)).join('');
        
        this.container.innerHTML = `
            <div class="tree-view">
                <table class="tree-table" id="tree-table">
                    <thead>
                        <tr>
                            <th>Namn</th>
                            <th>ID</th>
                            <th>Typ</th>
                            <th>Kravtext</th>
                            <th>Beskrivning</th>
                            <th class="col-paperclip">📎</th>
                            <th>Filer</th>
                        </tr>
                        <tr class="tree-search-row">
                            <th><input type="text" class="tree-column-search-input" data-field="name" placeholder="Sök..." value="${this.escapeHtml(this.columnSearches.name || '')}"></th>
                            <th><input type="text" class="tree-column-search-input" data-field="id" placeholder="Sök..." value="${this.escapeHtml(this.columnSearches.id || '')}"></th>
                            <th><input type="text" class="tree-column-search-input" data-field="type" placeholder="Sök..." value="${this.escapeHtml(this.columnSearches.type || '')}"></th>
                            <th><input type="text" class="tree-column-search-input" data-field="kravtext" placeholder="Sök..." value="${this.escapeHtml(this.columnSearches.kravtext || '')}"></th>
                            <th><input type="text" class="tree-column-search-input" data-field="beskrivning" placeholder="Sök..." value="${this.escapeHtml(this.columnSearches.beskrivning || '')}"></th>
                            <th class="col-paperclip"></th>
                            <th><input type="text" class="tree-column-search-input" data-field="files" placeholder="Sök..." value="${this.escapeHtml(this.columnSearches.files || '')}"></th>
                        </tr>
                    </thead>
                    <tbody>
                        ${treeHtml}
                    </tbody>
                </table>
            </div>
        `;
        
        this.attachEventListeners();
        this.applySelectionToDOM();
        if (options.preserveSearchFocus) {
            this.restoreSearchFocus();
        }
        
        // Tree view sorting is intentionally disabled.
        this.tableSortInstance = null;
    }
    
    renderNode(node, level) {
        const hasChildren = node.children && node.children.length > 0;
        const forceExpanded = this.hasActiveSearch() && this.searchExpandedNodes.has(String(node.id));
        const isExpanded = forceExpanded || this.expandedNodes.has(node.id);
        const indent = level * 12; // Reduced indentation (~25% less) for denser hierarchy
        
        let html = '';
        
        if (node.type === 'group') {
            // Type group node
            html += `
                <tr class="tree-node tree-node-group ${hasChildren ? 'has-children' : ''}" data-node-id="${node.id}" data-has-children="${hasChildren}">
                    <td style="padding-left: ${indent}px">
                        ${hasChildren ? `
                            <span class="tree-toggle ${isExpanded ? 'expanded' : ''}">
                                ${isExpanded ? '▼' : '▶'}
                            </span>
                        ` : '<span class="tree-spacer"></span>'}
                        <span class="tree-label tree-label-group">${this.highlightMatch(node.name, 'name')} <span class="tree-count">(${node.children?.length || 0})</span></span>
                    </td>
                    <td></td>
                    <td></td>
                    <td></td>
                    <td></td>
                    <td class="col-paperclip"></td>
                    <td></td>
                </tr>
            `;
        } else {
            const kravtext = this.highlightMatch(node.kravtext || '', 'kravtext');
            const beskrivning = this.highlightMatch(node.beskrivning || '', 'beskrivning');
            const files = Array.isArray(node.files) ? node.files : [];
            const hasFiles = files.length > 0;
            const filesHtml = this.renderFiles(files);
            const isSelected = String(this.selectedObjectId ?? '') === String(node.id);

            // Regular node - display as table row with columns
            html += `
                <tr class="tree-node ${hasChildren ? 'has-children' : ''} ${isSelected ? 'tree-node-selected' : ''}" data-node-id="${node.id}" data-node-type="${node.type}" data-has-children="${hasChildren}" aria-selected="${isSelected ? 'true' : 'false'}">
                    <td style="padding-left: ${indent}px">
                        ${hasChildren ? `
                            <span class="tree-toggle ${isExpanded ? 'expanded' : ''}">
                                ${isExpanded ? '▼' : '▶'}
                            </span>
                        ` : '<span class="tree-spacer"></span>'}
                        <span class="tree-label">${this.highlightMatch(node.name, 'name')}</span>
                    </td>
                    <td>
                        ${node.auto_id ? `<a href="javascript:void(0)" class="tree-id-link" data-node-id="${node.id}" data-node-type="${node.type}">${this.highlightMatch(node.auto_id, 'id')}</a>` : ''}
                    </td>
                    <td>${this.highlightMatch(node.type || '', 'type')}</td>
                    <td>${kravtext}</td>
                    <td>${beskrivning}</td>
                    <td class="col-paperclip" data-value="${hasFiles ? files.length : 0}">${hasFiles ? `<span title="${files.length} fil(er) kopplade">📎</span>` : ''}</td>
                    <td>${filesHtml}</td>
                </tr>
            `;
        }
        
        // Render children if expanded
        if (hasChildren && isExpanded) {
            node.children.forEach(child => {
                html += this.renderNode(child, level + 1);
            });
        }
        
        return html;
    }

    renderFiles(files) {
        if (!Array.isArray(files) || files.length === 0) {
            return '';
        }

        const fileSearchTerm = this.columnSearches.files || '';

        return files
            .map(file => {
                const rawFileDescription = file.description || file.original_filename || file.filename || 'Dokument';
                const fileDescription = this.highlightByTerm(rawFileDescription, fileSearchTerm);
                const fileTitle = this.escapeHtml(rawFileDescription);
                const rawFileUrl = `/api/objects/documents/${file.id}/download`;
                const isPdf = this.isPdfEntry(file);
                const fileUrl = typeof normalizePdfOpenUrl === 'function'
                    ? normalizePdfOpenUrl(rawFileUrl, isPdf)
                    : (isPdf ? `${rawFileUrl}?inline=1` : rawFileUrl);
                const previewClass = isPdf ? ' js-pdf-preview-link' : '';
                const previewAttr = isPdf ? ` data-preview-url="${this.escapeHtml(fileUrl)}"` : '';
                return `<a href="${this.escapeHtml(fileUrl)}" class="tree-file-link${previewClass}" data-document-id="${file.id}"${previewAttr} title="Öppna ${fileTitle}" target="_blank" rel="noopener noreferrer">${fileDescription}</a>`;
            })
            .join('<br>');
    }

    isPdfEntry(file) {
        const name = String(file?.original_filename || file?.filename || '').toLowerCase();
        const mimeType = String(file?.mime_type || '').toLowerCase();
        return mimeType === 'application/pdf' || name.endsWith('.pdf');
    }

    escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    escapeRegExp(value) {
        return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    highlightMatch(value, field) {
        return this.highlightByTerm(value, this.columnSearches[field] || '');
    }

    highlightByTerm(value, term) {
        const text = String(value ?? '');
        const trimmedTerm = String(term || '').trim();
        if (!trimmedTerm) {
            return this.escapeHtml(text);
        }

        const pattern = new RegExp(this.escapeRegExp(trimmedTerm), 'ig');
        let result = '';
        let lastIndex = 0;
        let match = pattern.exec(text);

        while (match) {
            const start = match.index;
            const end = start + match[0].length;
            result += this.escapeHtml(text.slice(lastIndex, start));
            result += `<mark class="tree-search-hit">${this.escapeHtml(text.slice(start, end))}</mark>`;
            lastIndex = end;
            match = pattern.exec(text);
        }

        result += this.escapeHtml(text.slice(lastIndex));
        return result;
    }

    hasActiveSearch() {
        return Object.values(this.columnSearches).some(value => String(value || '').trim() !== '');
    }

    getNodeSearchValue(node, field) {
        if (field === 'name') return node?.name || '';
        if (field === 'id') return node?.auto_id || '';
        if (field === 'type') return node?.type || '';
        if (field === 'kravtext') return node?.kravtext || '';
        if (field === 'beskrivning') return node?.beskrivning || '';
        if (field === 'files') {
            if (!Array.isArray(node?.files)) return '';
            return node.files
                .map(file => file?.description || file?.original_filename || file?.filename || '')
                .join(' ');
        }
        return '';
    }

    nodeMatchesActiveSearch(node) {
        const activeFields = Object.entries(this.columnSearches).filter(([, value]) => String(value || '').trim() !== '');
        if (!activeFields.length) return true;

        return activeFields.every(([field, term]) => {
            const searchValue = this.getNodeSearchValue(node, field);
            return String(searchValue || '').toLowerCase().includes(String(term).trim().toLowerCase());
        });
    }

    filterTreeNode(node) {
        const children = Array.isArray(node?.children) ? node.children : [];
        const filteredChildren = [];

        children.forEach(child => {
            const filteredChild = this.filterTreeNode(child);
            if (filteredChild) {
                filteredChildren.push(filteredChild);
            }
        });

        const nodeMatches = this.nodeMatchesActiveSearch(node);
        const keepNode = nodeMatches || filteredChildren.length > 0;
        if (!keepNode) return null;

        if (filteredChildren.length > 0) {
            this.searchExpandedNodes.add(String(node.id));
        }

        return {
            ...node,
            children: filteredChildren
        };
    }

    getFilteredTreeData() {
        if (!this.hasActiveSearch()) {
            this.searchExpandedNodes = new Set();
            return this.data;
        }

        this.searchExpandedNodes = new Set();
        return this.data
            .map(node => this.filterTreeNode(node))
            .filter(node => node !== null);
    }
    
    attachEventListeners() {
        // Column search
        this.container.querySelectorAll('.tree-column-search-input').forEach(input => {
            input.addEventListener('input', (event) => {
                const field = event.target.getAttribute('data-field');
                if (!field || !(field in this.columnSearches)) return;
                this.columnSearches[field] = (event.target.value || '');
                this.searchFocusState = {
                    field,
                    start: event.target.selectionStart ?? String(event.target.value || '').length,
                    end: event.target.selectionEnd ?? String(event.target.value || '').length
                };

                if (this.searchDebounceTimer) {
                    clearTimeout(this.searchDebounceTimer);
                }

                this.searchDebounceTimer = setTimeout(() => {
                    this.searchDebounceTimer = null;
                    this.render({ preserveSearchFocus: true });
                }, this.searchDebounceMs);
            });
        });

        // Toggle expand/collapse on toggle icon click
        const toggles = this.container.querySelectorAll('.tree-toggle');
        toggles.forEach(toggle => {
            toggle.addEventListener('click', (e) => {
                e.stopPropagation();
                const node = toggle.closest('.tree-node');
                const nodeId = node.dataset.nodeId;
                
                if (this.expandedNodes.has(nodeId)) {
                    this.expandedNodes.delete(nodeId);
                } else {
                    this.expandedNodes.add(nodeId);
                }
                
                this.render();
            });
        });
        
        // File link click - do not trigger row toggle
        const fileLinks = this.container.querySelectorAll('.tree-file-link');
        fileLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                e.stopPropagation();
            });
        });

        // ID link click - opens detail view
        const idLinks = this.container.querySelectorAll('.tree-id-link');
        idLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                
                const nodeId = link.dataset.nodeId;
                const nodeType = link.dataset.nodeType;
                this.setSelectedObjectId(parseInt(nodeId, 10));
                
                if (this.onNodeClick) {
                    this.onNodeClick(parseInt(nodeId), nodeType);
                }
            });
        });
        
        // Row click - toggle expand/collapse for nodes with children
        const nodes = this.container.querySelectorAll('.tree-node');
        nodes.forEach(node => {
            node.addEventListener('click', (e) => {
                const hasChildren = node.dataset.hasChildren === 'true';
                
                // Only toggle if node has children
                if (hasChildren) {
                    const nodeId = node.dataset.nodeId;
                    
                    if (this.expandedNodes.has(nodeId)) {
                        this.expandedNodes.delete(nodeId);
                    } else {
                        this.expandedNodes.add(nodeId);
                    }
                    
                    this.render();
                }
            });
        });
    }
    
    setNodeClickHandler(handler) {
        this.onNodeClick = handler;
    }

    restoreSearchFocus() {
        if (!this.searchFocusState?.field || !this.container) return;

        const selector = `.tree-column-search-input[data-field="${this.searchFocusState.field}"]`;
        const input = this.container.querySelector(selector);
        if (!input) return;

        input.focus();
        const maxLen = String(input.value || '').length;
        const start = Math.max(0, Math.min(this.searchFocusState.start ?? maxLen, maxLen));
        const end = Math.max(start, Math.min(this.searchFocusState.end ?? maxLen, maxLen));
        input.setSelectionRange(start, end);
    }

    setSelectedObjectId(objectId) {
        this.selectedObjectId = objectId !== null && objectId !== undefined ? Number(objectId) : null;
        this.applySelectionToDOM();
    }

    applySelectionToDOM() {
        if (!this.container) return;
        const selectedId = String(this.selectedObjectId ?? '');
        this.container.querySelectorAll('.tree-node[data-node-type]').forEach(node => {
            const isSelected = node.dataset.nodeId === selectedId;
            node.classList.toggle('tree-node-selected', isSelected);
            node.setAttribute('aria-selected', isSelected ? 'true' : 'false');
        });
    }
    
    async refresh() {
        await this.render();
    }
}
