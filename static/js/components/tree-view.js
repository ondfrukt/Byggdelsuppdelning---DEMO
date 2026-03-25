/**
 * TreeView
 * Visar kategori-nodträd med tillhörande objekt via TreeTable-standarden.
 */
class TreeView {
    constructor(containerId) {
        this.containerId = containerId;
        this.container = document.getElementById(containerId);
        this.viewMode = this._loadViewMode();
        this.treeTable = null;
        this.selectedObjectId = window.currentSelectedObjectId || null;
        this._clickHandler = null;
        this._data = [];
        this._availableFields = []; // [{field_name, display_name, field_type, is_tree_visible}]
        this._nodeTypeMap = {};     // numericId -> typeName
        this._categoryNodePathById = {}; // nodeId -> path_string
    }

    // -------------------------------------------------------------------------
    // Public API (used by app.js)
    // -------------------------------------------------------------------------

    setNodeClickHandler(handler) {
        this._clickHandler = handler;
    }

    setSelectedObjectId(id) {
        this.selectedObjectId = id != null ? Number(id) : null;
        this._applySelection();
    }

    // -------------------------------------------------------------------------
    // Render
    // -------------------------------------------------------------------------

    async render() {
        if (!this.container) return;

        this.container.innerHTML = this._buildShell();
        this._bindModeButtons();

        const inner = document.getElementById('tv-inner');
        inner.innerHTML = '<p style="padding:16px;color:var(--text-secondary);">Laddar…</p>';

        try {
            [this._data, this._availableFields] = await Promise.all([
                this._loadData(),
                this._loadAvailableFields(),
            ]);
        } catch (_e) {
            inner.innerHTML = '<p style="padding:16px;color:#c0392b;">Kunde inte ladda trädet.</p>';
            return;
        }

        this._nodeTypeMap = {};
        this._collectTypes(this._data);
        await this._preloadCategoryNodePaths();

        this.treeTable = new TreeTable({
            containerId: 'tv-inner',
            tableId: `tree-view-${this.viewMode}`,
            nodeId: 'id',
            nodeChildren: 'children',
            nameField: 'name',
            rows: this._data,
            emptyText: this._emptyText(),
            globalSearch: true,
            columnSearch: true,
            selectable: true,
            getRowId: (row) => row._node?.type === 'category_node' ? null : row._nodeId,
            batchActions: [
                {
                    label: 'Massredigera',
                    action: (selectedRows) => {
                        const ids = selectedRows
                            .filter(r => r._node?.type !== 'category_node')
                            .map(r => parseInt(r._nodeId, 10))
                            .filter(id => Number.isFinite(id));
                        if (ids.length && typeof openBulkEditForObjectIds === 'function') {
                            openBulkEditForObjectIds(ids);
                        }
                    }
                }
            ],
            columnVisibility: true,
            resizableColumns: true,
            reorderableColumns: true,
            columns: this._buildColumns(),
            onRender: () => this._onAfterRender(),
        });

        this.treeTable.render();
        this._loadFilesForNodes();
    }

    _collectObjectNodes(nodes, out = []) {
        if (!Array.isArray(nodes)) return out;
        for (const n of nodes) {
            if (n.type !== 'category_node') out.push(n);
            this._collectObjectNodes(n.children, out);
        }
        return out;
    }

    async _loadFilesForNodes() {
        const allNodes = this._collectObjectNodes(this._data);
        if (!allNodes.length) return;

        const ids = allNodes.map(n => n.id).join(',');
        try {
            const resp = await fetch(`/api/objects/files-batch?ids=${ids}`);
            if (!resp.ok) return;
            const fileMap = await resp.json();

            // Patch node data and re-render affected cells
            for (const node of allNodes) {
                const files = fileMap[String(node.id)];
                if (!files || !files.length) continue;
                node.files = files;
                node.file_count = files.length;
            }
            // Re-render the table to reflect updated file data
            if (this.treeTable) this.treeTable.render();
        } catch (_e) { /* silent */ }
    }

    // -------------------------------------------------------------------------
    // Shell HTML
    // -------------------------------------------------------------------------

    _buildShell() {
        const MODES = [
            { id: 'byggdelar', label: 'Byggdelar' },
            { id: 'utrymmen',  label: 'Utrymmen'  },
            { id: 'system',    label: 'System'     },
        ];
        const btns = MODES.map(m =>
            `<button type="button"
                     class="btn btn-sm tree-view-mode-btn${this.viewMode === m.id ? ' active' : ''}"
                     data-view-mode="${m.id}">${m.label}</button>`
        ).join('');

        return `<div class="tree-view">
                    <div class="tree-toolbar">
                        <div class="tree-view-mode-buttons" role="group" aria-label="Trädvy-läge">
                            ${btns}
                        </div>
                    </div>
                    <div id="tv-inner"></div>
                </div>`;
    }

    // -------------------------------------------------------------------------
    // Column definitions
    // -------------------------------------------------------------------------

    _buildColumns() {
        const SYSTEM_FIELDS = new Set(['id_full', 'object_type', 'created_at', 'files', 'files_indicator']);
        const isNameField = f => ['name', 'naam', 'namn'].includes(String(f.field_name).toLowerCase());

        // Fixed columns always present
        const fixed = [
            {
                field: 'name',
                label: 'Namn',
                className: 'col-name col-tree-name',
                width: 280,
                render: (node, table) => {
                    if (node.type === 'category_node') {
                        const objCount = (node.children || [])
                            .filter(c => c.type !== 'category_node').length;
                        const badge = objCount > 0
                            ? ` <span class="tree-count">(${objCount})</span>` : '';
                        return `<span class="tree-label tree-label-category">${table.highlightText(node.name || '', 'name')}${badge}</span>`;
                    }
                    return `<span class="tree-label">${table.highlightText(node.name || '', 'name')}</span>`;
                },
            },
            {
                field: 'type',
                label: 'Typ',
                className: 'col-type',
                width: 130,
                render: (node) => {
                    if (node.type === 'category_node') return '';
                    const color = typeof getObjectTypeColor === 'function'
                        ? getObjectTypeColor(node.type) : '#94a3b8';
                    return `<span class="object-type-badge" style="background-color:${escapeHtml(color)}">${escapeHtml(node.type || '')}</span>`;
                },
            },
            {
                field: 'id_full',
                label: 'ID',
                className: 'col-id',
                width: 110,
                hidden: false,
                render: (node) => node.type === 'category_node' ? '' : escapeHtml(node.id_full || ''),
            },
            {
                field: 'files',
                label: 'Filer',
                className: 'col-files',
                width: 160,
                hidden: true,
                render: (node) => {
                    if (node.type === 'category_node') return '';
                    const files = Array.isArray(node.files) ? node.files : [];
                    if (!files.length) return '';
                    return files.map(f => {
                        const name = escapeHtml(f.filename || 'Dokument');
                        const url = escapeHtml(f.url || '');
                        const isPdf = (f.mime_type || '').includes('pdf') || url.toLowerCase().includes('.pdf');
                        const previewAttr = isPdf ? ` data-preview-url="${url}"` : '';
                        const previewClass = isPdf ? ' js-pdf-preview-link' : '';
                        return `<a href="${url}" class="tree-file-link${previewClass}"${previewAttr} target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()" title="${name}">${name}</a>`;
                    }).join('<br>');
                },
            },
        ];

        // Dynamic columns from available fields — hidden by default unless is_tree_visible
        const dynamic = (this._availableFields || [])
            .filter(f => !SYSTEM_FIELDS.has(f.field_name) && !isNameField(f))
            .map(f => ({
                field: f.field_name,
                label: f.display_name || f.field_name,
                className: 'col-default',
                width: 160,
                hidden: !f.is_tree_visible,
                // value() is used by _nodeMatchesTable for column search — must return plain text
                value: (node) => {
                    if (node.type === 'category_node') return '';
                    const raw = node.data?.[f.field_name];
                    if (raw == null || raw === '') return '';
                    if (f.field_type === 'category_node') {
                        return this._categoryNodePathById[String(raw)] || String(raw);
                    }
                    return Array.isArray(raw) ? raw.join(', ') : String(raw);
                },
                render: (node, table) => {
                    if (node.type === 'category_node') return '';
                    const raw = node.data?.[f.field_name];
                    if (raw == null || raw === '') return '';
                    if (f.field_type === 'richtext') {
                        let html = String(raw);
                        if (!/<\s*[a-z][^>]*>/i.test(html) && /&lt;\s*[a-z][^&]*&gt;/i.test(html)) {
                            const decoder = document.createElement('textarea');
                            decoder.innerHTML = html;
                            html = decoder.value || '';
                        }
                        return html;
                    }
                    let str;
                    if (f.field_type === 'category_node') {
                        str = this._categoryNodePathById[String(raw)] || String(raw);
                    } else {
                        str = Array.isArray(raw) ? raw.join(', ') : String(raw);
                    }
                    return table.highlightText(escapeHtml(str), f.field_name);
                },
            }));

        return [...fixed, ...dynamic];
    }

    // -------------------------------------------------------------------------
    // Post-render: selection + row clicks
    // -------------------------------------------------------------------------

    _onAfterRender() {
        this._applySelection();
        this._bindRowClicks();
    }

    _applySelection() {
        const inner = document.getElementById('tv-inner');
        if (!inner) return;
        inner.querySelectorAll('tr.tree-node-selected').forEach(tr =>
            tr.classList.remove('tree-node-selected')
        );
        if (this.selectedObjectId == null) return;
        const tr = inner.querySelector(
            `tr.tree-node[data-node-id="${this.selectedObjectId}"]`
        );
        if (tr) tr.classList.add('tree-node-selected');
    }

    _bindRowClicks() {
        const inner = document.getElementById('tv-inner');
        if (!inner || inner._tvClickReady) return;
        inner._tvClickReady = true;

        inner.addEventListener('click', (e) => {
            // Let toggle handle itself
            if (e.target.closest('.tree-toggle')) return;
            if (e.target.closest('a, button')) return;
            // Modifier keys are handled by the selection mechanism
            if (e.shiftKey || e.ctrlKey || e.metaKey) return;

            const tr = e.target.closest('tr.tree-node');
            if (!tr) return;

            // Name column is reserved for expand/collapse — don't open detail panel
            const cell = e.target.closest('td');
            if (cell && cell.dataset.columnKey === 'name') return;

            const nodeId = tr.dataset.nodeId;
            // Category nodes start with 'cat-', skip them
            if (!nodeId || nodeId.startsWith('cat-')) return;

            const numId = parseInt(nodeId, 10);
            if (!Number.isFinite(numId)) return;

            this.selectedObjectId = numId;
            this._applySelection();

            if (typeof this._clickHandler === 'function') {
                this._clickHandler(numId, this._nodeTypeMap[numId] || '');
            }
        });
    }

    // -------------------------------------------------------------------------
    // Data loading
    // -------------------------------------------------------------------------

    async _loadAvailableFields() {
        try {
            const response = await fetch('/api/view-config/list-view');
            if (!response.ok) return [];
            const typeConfigs = Object.values(await response.json() || {});
            const fieldMap = new Map();
            typeConfigs.forEach(typeConfig => {
                (typeConfig?.available_fields || []).forEach(field => {
                    if (!field?.field_name || fieldMap.has(field.field_name)) return;
                    fieldMap.set(field.field_name, {
                        field_name: field.field_name,
                        display_name: field.display_name || field.field_name,
                        field_type: field.field_type,
                        is_tree_visible: !!field.is_tree_visible,
                    });
                });
            });
            return Array.from(fieldMap.values())
                .sort((a, b) => String(a.display_name).localeCompare(String(b.display_name), 'sv'));
        } catch (_e) {
            return [];
        }
    }

    async _loadData() {
        const VIEW_SYSTEM_MAP = {
            byggdelar: 'Byggdelar',
            utrymmen:  'Spaces',
            system:    'System',
        };
        const systemName = VIEW_SYSTEM_MAP[this.viewMode] || this.viewMode;
        const params = new URLSearchParams({ system_name: systemName });
        const response = await fetch(`/api/category-nodes/object-tree?${params.toString()}`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
    }

    _collectTypes(nodes) {
        if (!Array.isArray(nodes)) return;
        nodes.forEach(node => {
            if (node.type !== 'category_node' && node.id != null) {
                this._nodeTypeMap[Number(node.id)] = node.type;
            }
            this._collectTypes(node.children);
        });
    }

    async _preloadCategoryNodePaths() {
        const catFields = this._availableFields.filter(f => f.field_type === 'category_node');
        if (!catFields.length) return;

        const nodeIds = new Set();
        const collectFromNodes = (nodes) => {
            if (!Array.isArray(nodes)) return;
            nodes.forEach(node => {
                if (node.type !== 'category_node') {
                    catFields.forEach(f => {
                        const val = node.data?.[f.field_name];
                        if (val != null && val !== '') nodeIds.add(String(val));
                    });
                }
                collectFromNodes(node.children);
            });
        };
        collectFromNodes(this._data);

        const missing = [...nodeIds].filter(id => !this._categoryNodePathById[id]);
        if (!missing.length) return;

        try {
            const r = await fetch(`/api/category-nodes/batch?ids=${missing.join(',')}`);
            if (!r.ok) return;
            const map = await r.json();
            Object.entries(map).forEach(([id, node]) => {
                this._categoryNodePathById[id] = node?.path_string || node?.name || id;
            });
        } catch (_) {}
    }

    // -------------------------------------------------------------------------
    // View mode
    // -------------------------------------------------------------------------

    _bindModeButtons() {
        this.container.querySelectorAll('.tree-view-mode-btn[data-view-mode]')
            .forEach(btn => btn.addEventListener('click', async () => {
                const next = btn.dataset.viewMode;
                if (!['byggdelar', 'utrymmen', 'system'].includes(next)) return;
                if (next === this.viewMode) return;
                this.viewMode = next;
                this._saveViewMode();
                await this.render();
            }));
    }

    _emptyText() {
        if (this.viewMode === 'utrymmen') return 'Inga utrymmen ännu';
        if (this.viewMode === 'system')    return 'Inga systemobjekt ännu';
        return 'Inga byggdelar ännu';
    }

    _loadViewMode() {
        try {
            const s = localStorage.getItem('tree-view-mode');
            if (['byggdelar', 'utrymmen', 'system'].includes(s)) return s;
        } catch (_) { /* ignore */ }
        return 'byggdelar';
    }

    _saveViewMode() {
        try { localStorage.setItem('tree-view-mode', this.viewMode); } catch (_) { /* ignore */ }
    }
}
