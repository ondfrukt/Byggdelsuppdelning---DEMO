/**
 * TreeView Component
 * Displays hierarchical tree structure of objects
 */

class TreeView {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.data = [];
        this.viewMode = this.loadViewMode();
        this.modeStateStorageKey = 'tree-view-mode-states';
        this.defaultColumnSearches = this.getDefaultColumnSearches();
        this.modeStates = this.loadModeStates();
        this.expandedNodes = new Set();
        this.onNodeClick = null;
        this.tableSortInstance = null;
        this.selectedObjectId = window.currentSelectedObjectId || null;
        this.columnSearches = { ...this.defaultColumnSearches };
        this.restoreModeState(this.viewMode);
        this.columnVisibility = this.loadColumnVisibility();
        this.renderedTreeData = [];
        this.searchExpandedNodes = new Set();
        this.searchDebounceTimer = null;
        this.searchDebounceMs = 350;
        this.searchFocusState = null;
        this.hasLoadedData = false;
    }
    
    async loadData() {
        try {
            const params = new URLSearchParams({ view: this.viewMode });
            const response = await fetch(`/api/objects/tree?${params.toString()}`);
            if (!response.ok) {
                throw new Error('Failed to load tree data');
            }
            this.data = await response.json();
            this.hasLoadedData = true;
        } catch (error) {
            console.error('Error loading tree:', error);
            throw error;
        }
    }
    
    async render(options = {}) {
        if (!this.container) return;

        if (options.reloadData || !this.hasLoadedData) {
            await this.loadData();
        }

        const filteredData = this.getFilteredTreeData();
        this.renderedTreeData = filteredData;
        const visibleColumns = this.getVisibleColumns();
        const treeHtml = filteredData.length
            ? filteredData.map(node => this.renderNode(node, 0, visibleColumns)).join('')
            : `<tr><td colspan="${visibleColumns.length}" class="empty-state">${this.escapeHtml(this.getEmptyStateText())}</td></tr>`;

        this.container.innerHTML = `
            <div class="tree-view">
                <div class="tree-toolbar">
                    <div class="tree-view-mode-buttons" role="group" aria-label="Trädvy-läge">
                        <button type="button" class="btn btn-sm tree-view-mode-btn ${this.viewMode === 'byggdelar' ? 'active' : ''}" data-view-mode="byggdelar">Byggdelar</button>
                        <button type="button" class="btn btn-sm tree-view-mode-btn ${this.viewMode === 'utrymmen' ? 'active' : ''}" data-view-mode="utrymmen">Utrymmen</button>
                        <button type="button" class="btn btn-sm tree-view-mode-btn ${this.viewMode === 'system' ? 'active' : ''}" data-view-mode="system">System</button>
                    </div>
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
                <div class="table-container tree-table-container">
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

    getDefaultColumnSearches() {
        return {
            name: '',
            id: '',
            type: '',
            kravtext: '',
            beskrivning: '',
            files: '',
            has_files: ''
        };
    }

    loadViewMode() {
        try {
            const stored = localStorage.getItem('tree-view-mode');
            if (stored === 'byggdelar' || stored === 'utrymmen' || stored === 'system') {
                return stored;
            }
        } catch (_error) {
            // Ignore storage errors
        }
        return 'byggdelar';
    }

    saveViewMode() {
        try {
            localStorage.setItem('tree-view-mode', this.viewMode);
        } catch (_error) {
            // Ignore storage errors
        }
    }

    loadModeStates() {
        try {
            const raw = sessionStorage.getItem(this.modeStateStorageKey);
            if (!raw) return {};
            const parsed = JSON.parse(raw);
            return parsed && typeof parsed === 'object' ? parsed : {};
        } catch (_error) {
            return {};
        }
    }

    saveModeStates() {
        try {
            sessionStorage.setItem(this.modeStateStorageKey, JSON.stringify(this.modeStates || {}));
        } catch (_error) {
            // Ignore storage errors
        }
    }

    persistCurrentModeState() {
        const mode = this.viewMode;
        if (!['byggdelar', 'utrymmen', 'system'].includes(mode)) return;

        this.modeStates[mode] = {
            expandedNodes: Array.from(this.expandedNodes || []),
            columnSearches: { ...(this.columnSearches || {}) }
        };
        this.saveModeStates();
    }

    restoreModeState(mode) {
        const state = this.modeStates?.[mode];
        if (!state || typeof state !== 'object') {
            this.expandedNodes = new Set();
            this.columnSearches = { ...this.defaultColumnSearches };
            return;
        }

        const expandedNodes = Array.isArray(state.expandedNodes) ? state.expandedNodes : [];
        const columnSearches = state.columnSearches && typeof state.columnSearches === 'object'
            ? state.columnSearches
            : {};

        this.expandedNodes = new Set(expandedNodes.map(item => String(item)));
        this.columnSearches = {
            ...this.defaultColumnSearches,
            ...columnSearches
        };
    }

    getEmptyStateText() {
        if (this.viewMode === 'utrymmen') return 'Inga utrymmen ännu';
        if (this.viewMode === 'system') return 'Inga systemobjekt ännu';
        return 'Inga byggdelar ännu';
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
        const classNames = this.getTreeColumnClassNames(column);
        const extraClass = classNames.length ? ` class="${classNames.join(' ')}"` : '';
        return `<th${extraClass}>${this.escapeHtml(column.label)}</th>`;
    }

    renderSearchCell(column) {
        if (column.id === 'has_files') {
            const checked = this.columnSearches.has_files === '1' ? 'checked' : '';
            return `<th class="col-paperclip" title="Visa endast objekt med filer">
                <input type="checkbox" class="tree-column-search-input tree-paperclip-filter" data-field="has_files" ${checked}>
            </th>`;
        }
        const classNames = this.getTreeColumnClassNames(column);
        const extraClass = classNames.length ? ` class="${classNames.join(' ')}"` : '';
        return `<th${extraClass}><input type="text" class="tree-column-search-input" data-field="${column.id}" placeholder="Sök..." value="${this.escapeHtml(this.columnSearches[column.id] || '')}"></th>`;
    }

    getTreeColumnClassNames(column) {
        const classes = [];
        if (column?.paperclip) classes.push('col-paperclip');
        if (column?.id) classes.push(`col-${column.id}`);
        return classes;
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
                const classNames = this.getTreeColumnClassNames(column);
                const classAttr = classNames.length ? ` class="${classNames.join(' ')}"` : '';
                if (index !== 0) {
                    return `<td${classAttr}></td>`;
                }
                return `
                    <td${classAttr} style="padding-left: ${indent}px">
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
                const classNames = this.getTreeColumnClassNames(column);
                const classAttr = classNames.length ? ` class="${classNames.join(' ')}"` : '';
                if (column.id === 'name') {
                    return `
                        <td${classAttr} style="padding-left: ${indent}px">
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
                    const displayId = node.id_full || node.id_full || '';
                    return `<td${classAttr}>${displayId ? `<a href="javascript:void(0)" class="tree-id-link" data-node-id="${node.id}" data-node-type="${node.type}">${this.highlightMatch(displayId, 'id')}</a>` : ''}</td>`;
                }
                if (column.id === 'type') {
                    return `<td${classAttr}>${this.renderTypeBadge(node.type || '')}</td>`;
                }
                if (column.id === 'kravtext') {
                    return `<td${classAttr}>${kravtext}</td>`;
                }
                if (column.id === 'beskrivning') {
                    return `<td${classAttr}>${beskrivning}</td>`;
                }
                if (column.id === 'has_files') {
                    return `<td class="col-paperclip" data-value="${hasFiles ? files.length : 0}">${hasFiles ? `<span title="${files.length} fil(er) kopplade">📎</span>` : ''}</td>`;
                }
                if (column.id === 'files') {
                    return `<td${classAttr}>${filesHtml}</td>`;
                }
                return `<td${classAttr}></td>`;
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

    escapeHtmlWithLineBreaks(value) {
        return this.escapeHtml(value).replace(/\r?\n/g, '<br>');
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
            return this.escapeHtmlWithLineBreaks(text);
        }

        const pattern = new RegExp(this.escapeRegExp(trimmedTerm), 'ig');
        let result = '';
        let lastIndex = 0;
        let match = pattern.exec(text);

        while (match) {
            const start = match.index;
            const end = start + match[0].length;
            result += this.escapeHtmlWithLineBreaks(text.slice(lastIndex, start));
            result += `<mark class="tree-search-hit">${this.escapeHtmlWithLineBreaks(text.slice(start, end))}</mark>`;
            lastIndex = end;
            match = pattern.exec(text);
        }

        result += this.escapeHtmlWithLineBreaks(text.slice(lastIndex));
        return result;
    }

    hasActiveSearch() {
        return Object.values(this.columnSearches).some(value => String(value || '').trim() !== '');
    }

    getNodeSearchValue(node, field) {
        if (field === 'name') return node?.name || '';
        if (field === 'id') return `${node?.id_full || ''} ${node?.id_full || ''}`.trim();
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
        const viewModeButtons = this.container.querySelectorAll('.tree-view-mode-btn[data-view-mode]');
        if (viewModeButtons.length > 0) {
            viewModeButtons.forEach(button => {
                button.addEventListener('click', async () => {
                    const nextMode = button.dataset.viewMode;
                    if (!['byggdelar', 'utrymmen', 'system'].includes(nextMode)) return;
                    if (nextMode === this.viewMode) return;
                    this.persistCurrentModeState();
                    this.viewMode = nextMode;
                    this.saveViewMode();
                    this.restoreModeState(nextMode);
                    await this.render({ reloadData: true });
                });
            });
        }

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
                    this.persistCurrentModeState();
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
                    this.persistCurrentModeState();
                    this.render();
                }, this.searchDebounceMs);
            });
        });

        const treeTableBody = this.container.querySelector('#tree-table tbody');
        if (!treeTableBody) return;

        treeTableBody.addEventListener('mousedown', (e) => {
            const node = e.target.closest('.tree-node');
            if (!node) return;
            if (node.dataset.hasChildren !== 'true') return;
            if (e.detail < 2) return;
            if (e.target.closest('a, button, input, textarea, select, label')) return;
            e.preventDefault();
        });

        treeTableBody.addEventListener('click', (e) => {
            const fileLink = e.target.closest('.tree-file-link');
            if (fileLink) {
                e.stopPropagation();
                return;
            }

            const idLink = e.target.closest('.tree-id-link');
            if (idLink) {
                e.preventDefault();
                e.stopPropagation();

                const nodeId = parseInt(idLink.dataset.nodeId, 10);
                const nodeType = idLink.dataset.nodeType;
                this.setSelectedObjectId(nodeId);

                if (this.onNodeClick) {
                    this.onNodeClick(nodeId, nodeType);
                }
                return;
            }

            const toggle = e.target.closest('.tree-toggle');
            if (toggle) {
                e.stopPropagation();
                const node = toggle.closest('.tree-node');
                if (!node) return;
                this.toggleNodeExpansion(node.dataset.nodeId);
                return;
            }

            const node = e.target.closest('.tree-node');
            if (!node) return;
            if (node.dataset.hasChildren !== 'true') return;
            if (e.target.closest('a, button, input, textarea, select, label')) return;
            if (e.detail > 1) return; // Double-click handled separately.
            this.toggleNodeExpansion(node.dataset.nodeId);
        });

        treeTableBody.addEventListener('dblclick', (e) => {
            const node = e.target.closest('.tree-node');
            if (!node) return;
            if (node.dataset.hasChildren !== 'true') return;
            if (e.target.closest('a, button, input, textarea, select, label')) return;

            e.preventDefault();
            e.stopPropagation();
            this.toggleSubtreeExpansion(node.dataset.nodeId);
        });
    }

    toggleNodeExpansion(nodeId) {
        if (!nodeId) return;
        if (this.expandedNodes.has(nodeId)) {
            this.expandedNodes.delete(nodeId);
        } else {
            this.expandedNodes.add(nodeId);
        }
        this.persistCurrentModeState();
        this.render();
    }

    toggleSubtreeExpansion(nodeId) {
        if (!nodeId) return;

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
        this.persistCurrentModeState();
        this.render();
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
        await this.render({ reloadData: true });
    }
}
