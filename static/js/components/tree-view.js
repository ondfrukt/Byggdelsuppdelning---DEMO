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
            files: '',
            has_files: ''
        };
        this.columnVisibility = this.loadColumnVisibility();
        this.renderedTreeData = [];
        this.searchExpandedNodes = new Set();
        this.searchDebounceTimer = null;
        this.searchDebounceMs = 350;
        this.searchFocusState = null;
        this.pendingToggleTimer = null;
        this.pendingToggleDelayMs = 170;
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
        this.renderedTreeData = filteredData;
        const visibleColumns = this.getVisibleColumns();
        const treeHtml = filteredData.map(node => this.renderNode(node, 0, visibleColumns)).join('');

        this.container.innerHTML = `
            <div class="tree-view">
                <div class="tree-toolbar">
                    <button type="button" class="btn btn-secondary btn-sm" id="tree-column-config-btn">
                        ⚙️ Kolumner
                    </button>
                </div>
                <div id="tree-column-config-panel" class="column-config-panel" style="display: none;">
                    <div class="column-config-content">
                        <h4>Visa/Dölj Kolumner</h4>
                        <div id="tree-column-toggles"></div>
                    </div>
                </div>
                <table class="tree-table" id="tree-table">
                    <thead>
                        <tr>
                            ${visibleColumns.map(column => this.renderHeaderCell(column)).join('')}
                        </tr>
                        <tr class="tree-search-row">
                            ${visibleColumns.map(column => this.renderSearchCell(column)).join('')}
                        </tr>
                    </thead>
                    <tbody>
                        ${treeHtml}
                    </tbody>
                </table>
            </div>
        `;

        this.renderColumnConfig();
        this.attachEventListeners();
        this.applySelectionToDOM();
        if (options.preserveSearchFocus) {
            this.restoreSearchFocus();
        }
        
        // Tree view sorting is intentionally disabled.
        this.tableSortInstance = null;
    }

    getVisibleColumns() {
        const columns = [
            { id: 'name', label: 'Namn' },
            { id: 'id', label: 'ID' },
            { id: 'type', label: 'Typ' },
            { id: 'kravtext', label: 'Kravtext' },
            { id: 'beskrivning', label: 'Beskrivning' },
            { id: 'has_files', label: '📎', paperclip: true },
            { id: 'files', label: 'Filer' }
        ];
        return columns.filter(column => this.columnVisibility[column.id] !== false);
    }

    renderHeaderCell(column) {
        const extraClass = column.paperclip ? ' class="col-paperclip"' : '';
        return `<th${extraClass}>${this.escapeHtml(column.label)}</th>`;
    }

    renderSearchCell(column) {
        if (column.id === 'has_files') {
            const checked = this.columnSearches.has_files === '1' ? 'checked' : '';
            return `<th class="col-paperclip" title="Visa endast objekt med filer">
                <input type="checkbox" class="tree-column-search-input tree-paperclip-filter" data-field="has_files" ${checked}>
            </th>`;
        }
        return `<th><input type="text" class="tree-column-search-input" data-field="${column.id}" placeholder="Sök..." value="${this.escapeHtml(this.columnSearches[column.id] || '')}"></th>`;
    }

    renderColumnConfig() {
        const container = this.container?.querySelector('#tree-column-toggles');
        if (!container) return;

        const columns = [
            { id: 'name', label: 'Namn' },
            { id: 'id', label: 'ID' },
            { id: 'type', label: 'Typ' },
            { id: 'kravtext', label: 'Kravtext' },
            { id: 'beskrivning', label: 'Beskrivning' },
            { id: 'has_files', label: '📎' },
            { id: 'files', label: 'Filer' }
        ];

        container.innerHTML = columns.map(column => `
            <label class="column-toggle">
                <input type="checkbox" data-column-id="${column.id}" ${this.columnVisibility[column.id] !== false ? 'checked' : ''}>
                ${this.escapeHtml(column.label)}
            </label>
        `).join('');

        container.querySelectorAll('input[type="checkbox"]').forEach(input => {
            input.addEventListener('change', (event) => {
                const columnId = event.target.getAttribute('data-column-id');
                if (!columnId) return;
                this.columnVisibility[columnId] = event.target.checked;
                if (!event.target.checked) {
                    this.columnSearches[columnId] = '';
                }
                this.saveColumnVisibility();
                this.render();
            });
        });
    }

    loadColumnVisibility() {
        try {
            const raw = localStorage.getItem('tree-view-column-visibility');
            if (!raw) return {};
            const parsed = JSON.parse(raw);
            return parsed && typeof parsed === 'object' ? parsed : {};
        } catch (_error) {
            return {};
        }
    }

    saveColumnVisibility() {
        try {
            localStorage.setItem('tree-view-column-visibility', JSON.stringify(this.columnVisibility || {}));
        } catch (_error) {
            // Ignore storage errors
        }
    }

    renderNode(node, level, visibleColumns) {
        const hasChildren = node.children && node.children.length > 0;
        const forceExpanded = this.hasActiveSearch() && this.searchExpandedNodes.has(String(node.id));
        const isExpanded = forceExpanded || this.expandedNodes.has(node.id);
        const indent = level * 12; // Reduced indentation (~25% less) for denser hierarchy
        
        let html = '';
        
        if (node.type === 'group') {
            const cellsHtml = visibleColumns.map((column, index) => {
                if (index !== 0) {
                    return `<td${column.paperclip ? ' class="col-paperclip"' : ''}></td>`;
                }
                return `
                    <td style="padding-left: ${indent}px">
                        ${hasChildren ? `
                            <span class="tree-toggle ${isExpanded ? 'expanded' : ''}">
                                ${isExpanded ? '▼' : '▶'}
                            </span>
                        ` : '<span class="tree-spacer"></span>'}
                        <span class="tree-label tree-label-group">${this.highlightMatch(node.name, 'name')} <span class="tree-count">(${node.children?.length || 0})</span></span>
                    </td>
                `;
            }).join('');

            html += `
                <tr class="tree-node tree-node-group ${hasChildren ? 'has-children' : ''}" data-node-id="${node.id}" data-has-children="${hasChildren}" data-tree-level="${level}">
                    ${cellsHtml}
                </tr>
            `;
        } else {
            const kravtext = this.highlightMatch(node.kravtext || '', 'kravtext');
            const beskrivning = this.highlightMatch(node.beskrivning || '', 'beskrivning');
            const files = Array.isArray(node.files) ? node.files : [];
            const hasFiles = files.length > 0;
            const filesHtml = this.renderFiles(files);
            const isSelected = String(this.selectedObjectId ?? '') === String(node.id);

            const cellsHtml = visibleColumns.map(column => {
                if (column.id === 'name') {
                    return `
                        <td style="padding-left: ${indent}px">
                            ${hasChildren ? `
                                <span class="tree-toggle ${isExpanded ? 'expanded' : ''}">
                                    ${isExpanded ? '▼' : '▶'}
                                </span>
                            ` : '<span class="tree-spacer"></span>'}
                            <span class="tree-label">${this.highlightMatch(node.name, 'name')}</span>
                        </td>
                    `;
                }
                if (column.id === 'id') {
                    return `<td>${node.auto_id ? `<a href="javascript:void(0)" class="tree-id-link" data-node-id="${node.id}" data-node-type="${node.type}">${this.highlightMatch(node.auto_id, 'id')}</a>` : ''}</td>`;
                }
                if (column.id === 'type') {
                    return `<td>${this.renderTypeBadge(node.type || '')}</td>`;
                }
                if (column.id === 'kravtext') {
                    return `<td>${kravtext}</td>`;
                }
                if (column.id === 'beskrivning') {
                    return `<td>${beskrivning}</td>`;
                }
                if (column.id === 'has_files') {
                    return `<td class="col-paperclip" data-value="${hasFiles ? files.length : 0}">${hasFiles ? `<span title="${files.length} fil(er) kopplade">📎</span>` : ''}</td>`;
                }
                if (column.id === 'files') {
                    return `<td>${filesHtml}</td>`;
                }
                return '<td></td>';
            }).join('');

            html += `
                <tr class="tree-node ${hasChildren ? 'has-children' : ''} ${isSelected ? 'tree-node-selected' : ''}" data-node-id="${node.id}" data-node-type="${node.type}" data-has-children="${hasChildren}" data-tree-level="${level}" aria-selected="${isSelected ? 'true' : 'false'}">
                    ${cellsHtml}
                </tr>
            `;
        }
        
        // Render children if expanded
        if (hasChildren && isExpanded) {
            node.children.forEach(child => {
                html += this.renderNode(child, level + 1, visibleColumns);
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

    renderTypeBadge(typeName) {
        const rawType = String(typeName || '');
        const color = typeof getObjectTypeColor === 'function'
            ? getObjectTypeColor(rawType)
            : '#95a5a6';
        const label = this.highlightMatch(rawType, 'type');
        return `<span class="object-type-badge" style="background-color: ${color};">${label}</span>`;
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
        if (field === 'has_files') return Array.isArray(node?.files) && node.files.length > 0 ? '1' : '';
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

    findNodeById(nodes, nodeId) {
        const stack = Array.isArray(nodes) ? [...nodes] : [];
        const target = String(nodeId);

        while (stack.length > 0) {
            const current = stack.pop();
            if (String(current?.id) === target) return current;
            const children = Array.isArray(current?.children) ? current.children : [];
            for (let i = children.length - 1; i >= 0; i -= 1) {
                stack.push(children[i]);
            }
        }

        return null;
    }

    collectExpandableNodeIds(node, ids = []) {
        if (!node || !Array.isArray(node.children) || node.children.length === 0) {
            return ids;
        }

        ids.push(String(node.id));
        node.children.forEach(child => this.collectExpandableNodeIds(child, ids));
        return ids;
    }
    
    attachEventListeners() {
        const configButton = this.container.querySelector('#tree-column-config-btn');
        const configPanel = this.container.querySelector('#tree-column-config-panel');
        if (configButton && configPanel) {
            configButton.addEventListener('click', () => {
                configPanel.style.display = configPanel.style.display === 'none' ? 'block' : 'none';
            });
        }

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
        this.container.querySelectorAll('.tree-paperclip-filter').forEach(input => {
            input.addEventListener('change', (event) => {
                const field = event.target.getAttribute('data-field');
                if (!field || !(field in this.columnSearches)) return;
                this.columnSearches[field] = event.target.checked ? '1' : '';
                this.searchFocusState = null;

                if (this.searchDebounceTimer) {
                    clearTimeout(this.searchDebounceTimer);
                }
                this.searchDebounceTimer = setTimeout(() => {
                    this.searchDebounceTimer = null;
                    this.render();
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
        // Double-click toggles the whole subtree.
        const nodes = this.container.querySelectorAll('.tree-node');
        nodes.forEach(node => {
            const nodeLevel = parseInt(node.dataset.treeLevel || '0', 10);
            const disableDoubleClickRule = nodeLevel === 1;

            node.addEventListener('mousedown', (e) => {
                const hasChildren = node.dataset.hasChildren === 'true';
                if (!hasChildren) return;
                if (disableDoubleClickRule) return;
                if (e.detail < 2) return;

                // Keep native behavior on explicit interactive controls.
                if (e.target.closest('a, button, input, textarea, select, label')) return;
                e.preventDefault();
            });

            node.addEventListener('click', (e) => {
                const hasChildren = node.dataset.hasChildren === 'true';
                
                // Only toggle if node has children
                if (hasChildren) {
                    const nodeId = node.dataset.nodeId;

                    if (disableDoubleClickRule) {
                        if (this.expandedNodes.has(nodeId)) {
                            this.expandedNodes.delete(nodeId);
                        } else {
                            this.expandedNodes.add(nodeId);
                        }
                        this.render();
                        return;
                    }

                    if (this.pendingToggleTimer) {
                        clearTimeout(this.pendingToggleTimer);
                        this.pendingToggleTimer = null;
                    }

                    this.pendingToggleTimer = setTimeout(() => {
                        this.pendingToggleTimer = null;
                        if (this.expandedNodes.has(nodeId)) {
                            this.expandedNodes.delete(nodeId);
                        } else {
                            this.expandedNodes.add(nodeId);
                        }
                        this.render();
                    }, this.pendingToggleDelayMs);
                }
            });

            node.addEventListener('dblclick', (e) => {
                const hasChildren = node.dataset.hasChildren === 'true';
                if (!hasChildren) return;
                if (disableDoubleClickRule) return;

                e.preventDefault();
                e.stopPropagation();

                if (this.pendingToggleTimer) {
                    clearTimeout(this.pendingToggleTimer);
                    this.pendingToggleTimer = null;
                }

                const nodeId = node.dataset.nodeId;
                const sourceTree = this.renderedTreeData || this.getFilteredTreeData();
                const nodeData = this.findNodeById(sourceTree, nodeId);
                const expandableIds = this.collectExpandableNodeIds(nodeData, []);
                if (!expandableIds.length) return;

                const allExpanded = expandableIds.every(id => this.expandedNodes.has(id));
                if (allExpanded) {
                    expandableIds.forEach(id => this.expandedNodes.delete(id));
                } else {
                    expandableIds.forEach(id => this.expandedNodes.add(id));
                }

                this.render();
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
