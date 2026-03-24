/**
 * CategoryAdmin – admin-komponent för klassifikationssystem och kategorinoder.
 * Integreras i admin-panelens flik-system.
 */

class CategoryAdmin {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.systems = [];
        this.selectedSystemId = null;
        this.treeData = [];
        this.expandedNodeIds = new Set();

        // Node selection / editing state
        this.selectedNodeId = null;   // id of node shown in editor panel
        this.editorMode = 'view';     // 'view' | 'new'
        this.newNodeParentId = null;  // parent id when creating (null = root)

        // System form view state
        this.view = 'tree';           // 'tree' | 'system-list' | 'system-form'
        this.editingSystem = null;
    }

    // -----------------------------------------------------------------------
    // Init
    // -----------------------------------------------------------------------
    async init() {
        if (!this.container) return;
        await this.loadSystems();
        if (this.systems.length > 0 && !this.selectedSystemId) {
            this.selectedSystemId = this.systems[0].id;
        }
        this.renderView();
    }

    // -----------------------------------------------------------------------
    // API helpers
    // -----------------------------------------------------------------------
    async api(method, path, body) {
        const opts = {
            method,
            headers: { 'Content-Type': 'application/json' },
        };
        if (body !== undefined) opts.body = JSON.stringify(body);
        const resp = await fetch(path, opts);
        const json = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error(json.error || `HTTP ${resp.status}`);
        return json;
    }

    async loadSystems() {
        try {
            this.systems = await this.api('GET', '/api/classification-systems?include_inactive=true');
        } catch (e) {
            console.error('Failed to load classification systems', e);
            this.systems = [];
        }
    }

    async loadTree() {
        if (!this.selectedSystemId) { this.treeData = []; return; }
        try {
            this.treeData = await this.api(
                'GET',
                `/api/category-nodes?system_id=${this.selectedSystemId}&level=1&include_children=true`
            );
        } catch (e) {
            console.error('Failed to load category tree', e);
            this.treeData = [];
        }
    }

    // -----------------------------------------------------------------------
    // Main render dispatcher
    // -----------------------------------------------------------------------
    renderView() {
        if (!this.container) return;
        if (this.view === 'system-list') {
            this.renderSystemList();
        } else if (this.view === 'system-form') {
            this.renderSystemForm();
        } else {
            this.renderTree();
        }
    }

    // -----------------------------------------------------------------------
    // Tree view  (two-column layout matching managed-lists pattern)
    // -----------------------------------------------------------------------
    async renderTree() {
        this.view = 'tree';
        await this.loadTree();
        this._renderTreeLayout();
    }

    _renderTreeLayout() {
        const systemOptions = this.systems.map(s =>
            `<option value="${s.id}" ${s.id === this.selectedSystemId ? 'selected' : ''}>${escapeHtml(s.name)}${s.version ? ' (' + escapeHtml(s.version) + ')' : ''}</option>`
        ).join('');

        const treeHtml = this.treeData.length
            ? this.treeData.map(n => this._renderNodeRow(n, 0)).join('')
            : '<p class="empty-state" style="padding:12px;">Inga kategorinoder. Skapa en rotnod för att komma igång.</p>';

        this.container.innerHTML = `
            <div class="category-admin">
                <div class="admin-panel-header">
                    <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
                        <h3 style="margin:0;">Kategorisystem</h3>
                        <select id="cat-system-select" class="form-input" style="width:220px;" onchange="categoryAdmin.onSystemChange(this.value)">
                            ${systemOptions || '<option value="">Inga system</option>'}
                        </select>
                    </div>
                    <div style="display:flex;gap:8px;">
                        <button class="btn btn-secondary btn-sm" onclick="categoryAdmin.showSystemList()">Hantera system</button>
                        ${this.selectedSystemId ? `<button class="btn btn-primary btn-sm" onclick="categoryAdmin.showNewNodeForm(null)">+ Ny rotnod</button>` : ''}
                    </div>
                </div>

                <div class="managed-list-tree-editor-layout">
                    <div class="managed-list-tree-panel">
                        <div class="section-header">
                            <h4>Träd</h4>
                        </div>
                        <div class="managed-list-tree-scroll">
                            ${treeHtml}
                        </div>
                    </div>
                    <div class="managed-list-editor-panel">
                        <div class="section-header">
                            <h4>Noddata</h4>
                        </div>
                        ${this._renderEditor()}
                    </div>
                </div>
            </div>
        `;
    }

    _renderNodeRow(node, depth) {
        const hasChildren = node.children && node.children.length > 0;
        const isExpanded = this.expandedNodeIds.has(node.id);
        const isSelected = this.selectedNodeId === node.id;

        const expanderSlot = hasChildren
            ? `<button type="button" class="tree-toggle ${isExpanded ? 'expanded' : ''}"
                   onclick="event.stopPropagation(); categoryAdmin.toggleExpand(${node.id})">
                   ${isExpanded ? '▾' : '▸'}
               </button>`
            : '<span class="tree-spacer"></span>';

        const inactiveFlag = !node.is_active
            ? '<span class="managed-list-node-flag">Inaktiv</span>'
            : '';

        const row = `
            <div class="managed-list-tree-row">
                <div class="managed-list-tree-node-row ${isSelected ? 'selected' : ''} ${!node.is_active ? 'inactive' : ''}"
                     style="padding-left:${8 + depth * 16}px;"
                     onclick="categoryAdmin.selectNode(${node.id})">
                    <span class="tree-expander-slot">${expanderSlot}</span>
                    <button type="button" class="managed-list-tree-node" style="cursor:pointer;">
                        <span class="managed-list-tree-node-label">${escapeHtml(node.name ?? '')}</span>
                        <span style="font-size:10px;color:var(--text-secondary);margin-left:4px;">Niv${node.level}</span>
                        ${inactiveFlag}
                        ${hasChildren ? `<span class="managed-list-tree-node-count">${node.children.length}</span>` : ''}
                    </button>
                    ${node.level < 3
                        ? `<button type="button" class="btn btn-sm btn-secondary managed-list-tree-add-child-btn" title="Lägg till undernod"
                               onclick="event.stopPropagation(); categoryAdmin.showNewNodeForm(${node.id})">+</button>`
                        : ''}
                    <button type="button" class="btn btn-sm btn-danger managed-list-tree-delete-btn" title="Ta bort nod"
                            onclick="event.stopPropagation(); categoryAdmin.deleteNode(${node.id})">-</button>
                </div>
                ${hasChildren && isExpanded
                    ? node.children.map(c => this._renderNodeRow(c, depth + 1)).join('')
                    : ''}
            </div>
        `;
        return row;
    }

    // -----------------------------------------------------------------------
    // Editor panel (right column)
    // -----------------------------------------------------------------------
    _renderEditor() {
        if (this.editorMode === 'new') {
            return this._renderNodeForm(null, this.newNodeParentId);
        }
        if (this.selectedNodeId !== null) {
            const node = this._findNode(this.selectedNodeId, this.treeData);
            if (node) return this._renderNodeForm(node, null);
        }
        return `
            <div class="managed-list-node-empty">
                <p>Välj en nod i trädet till vänster för att redigera.</p>
                <p>Använd + för att lägga till undernoder.</p>
            </div>
        `;
    }

    _renderNodeForm(node, parentId) {
        // Determine level and parent
        let level, parentName = null;
        if (node) {
            level = node.level;
            // parentName not needed for edit
        } else {
            // Creating new
            if (parentId) {
                const parent = this._findNode(parentId, this.treeData);
                level = parent ? parent.level + 1 : 1;
                parentName = parent ? parent.name : null;
            } else {
                level = 1;
            }
        }

        const parentInfo = parentName
            ? `<div style="background:#f0f4ff;border-left:3px solid #4a6cf7;padding:8px 12px;border-radius:4px;margin-bottom:16px;font-size:13px;">
                   Skapar undernod till: <strong>${escapeHtml(parentName)}</strong>
               </div>`
            : '';

        const cancelBtn = node
            ? ''
            : `<button type="button" class="btn btn-secondary btn-sm" onclick="categoryAdmin.cancelNewNode()">Avbryt</button>`;

        return `
            <div class="managed-list-node-editor managed-list-node-editor-compact">
                <div class="managed-list-node-editor-header">
                    <h5>${node ? escapeHtml(node.name) : 'Ny nod – nivå ' + level}</h5>
                    ${cancelBtn}
                </div>
                ${parentInfo}
                <div id="node-editor-errors" style="color:#c0392b;margin-bottom:8px;display:none;font-size:13px;"></div>
                <form id="node-editor-form" onsubmit="categoryAdmin.submitNodeForm(event)" autocomplete="off">
                    <div class="managed-list-node-language-grid managed-list-node-language-grid-compact">
                        <label>
                            <span>Kod</span>
                            <input type="text" class="form-control" name="code" value="${escapeHtml(node?.code || '')}" placeholder="T.ex. F2">
                        </label>
                        <label>
                            <span>Namn *</span>
                            <input type="text" class="form-control" name="name" required value="${escapeHtml(node?.name || '')}" placeholder="T.ex. Klimatskal">
                        </label>
                        <label style="grid-column: 1 / -1;">
                            <span>Beskrivning</span>
                            <textarea class="form-control" name="description" rows="3">${escapeHtml(node?.description || '')}</textarea>
                        </label>
                        <label>
                            <span>Sorteringsordning</span>
                            <input type="number" class="form-control" name="sort_order" value="${node?.sort_order ?? 0}" style="width:100px;">
                        </label>
                        <label class="managed-list-node-checkbox">
                            <input type="checkbox" name="is_active" ${(node?.is_active !== false) ? 'checked' : ''}>
                            Aktiv
                        </label>
                    </div>
                </form>
                <div class="managed-list-node-editor-footer">
                    <button class="btn btn-primary" onclick="categoryAdmin.submitNodeForm()">Spara</button>
                    ${node ? `<button type="button" class="btn btn-danger btn-sm" onclick="categoryAdmin.deleteNode(${node.id})">Ta bort</button>` : ''}
                </div>
            </div>
        `;
    }

    _findNode(id, nodes) {
        for (const n of nodes) {
            if (n.id === id) return n;
            if (n.children) {
                const found = this._findNode(id, n.children);
                if (found) return found;
            }
        }
        return null;
    }

    // -----------------------------------------------------------------------
    // Node interactions
    // -----------------------------------------------------------------------
    selectNode(nodeId) {
        this.selectedNodeId = nodeId;
        this.editorMode = 'view';
        this.newNodeParentId = null;
        this._refreshEditorPanel();
        this._refreshTreePanel();
    }

    showNewNodeForm(parentId) {
        this.newNodeParentId = parentId;
        this.editorMode = 'new';
        this.selectedNodeId = null;
        if (parentId) this.expandedNodeIds.add(parentId);
        this._refreshEditorPanel();
        this._refreshTreePanel();
    }

    cancelNewNode() {
        this.editorMode = 'view';
        this.newNodeParentId = null;
        this._refreshEditorPanel();
        this._refreshTreePanel();
    }

    toggleExpand(nodeId) {
        if (this.expandedNodeIds.has(nodeId)) {
            this.expandedNodeIds.delete(nodeId);
        } else {
            this.expandedNodeIds.add(nodeId);
        }
        this._refreshTreePanel();
    }

    onSystemChange(value) {
        this.selectedSystemId = value ? parseInt(value, 10) : null;
        this.expandedNodeIds.clear();
        this.selectedNodeId = null;
        this.editorMode = 'view';
        this.renderView();
    }

    // Re-render only the tree panel (preserves editor state)
    _refreshTreePanel() {
        const treePanel = this.container?.querySelector('.managed-list-tree-scroll');
        if (!treePanel) return;
        const treeHtml = this.treeData.length
            ? this.treeData.map(n => this._renderNodeRow(n, 0)).join('')
            : '<p class="empty-state" style="padding:12px;">Inga kategorinoder. Skapa en rotnod för att komma igång.</p>';
        treePanel.innerHTML = treeHtml;
    }

    // Re-render only the editor panel
    _refreshEditorPanel() {
        const editorPanel = this.container?.querySelector('.managed-list-editor-panel');
        if (!editorPanel) return;
        editorPanel.innerHTML = `
            <div class="section-header"><h4>Noddata</h4></div>
            ${this._renderEditor()}
        `;
    }

    // -----------------------------------------------------------------------
    // Submit node form
    // -----------------------------------------------------------------------
    async submitNodeForm(e) {
        if (e) e.preventDefault();
        const form = document.getElementById('node-editor-form');
        if (!form) return;
        const errEl = document.getElementById('node-editor-errors');
        if (errEl) errEl.style.display = 'none';

        const isNew = this.editorMode === 'new';
        const node = isNew ? null : this._findNode(this.selectedNodeId, this.treeData);

        let level, parentId;
        if (isNew) {
            const parentNode = this.newNodeParentId
                ? this._findNode(this.newNodeParentId, this.treeData)
                : null;
            level = parentNode ? parentNode.level + 1 : 1;
            parentId = this.newNodeParentId ?? null;
        } else {
            level = node.level;
            parentId = node.parent_id;
        }

        const body = {
            system_id: isNew ? this.selectedSystemId : node.system_id,
            parent_id: parentId,
            level,
            code: form.code.value.trim(),
            name: form.name.value.trim(),
            description: form.description.value.trim() || null,
            sort_order: parseInt(form.sort_order.value, 10) || 0,
            is_active: form.is_active.checked,
        };

        try {
            let saved;
            if (isNew) {
                saved = await this.api('POST', '/api/category-nodes', body);
            } else {
                saved = await this.api('PUT', `/api/category-nodes/${node.id}`, body);
            }
            this.editorMode = 'view';
            this.selectedNodeId = saved.id;
            this.newNodeParentId = null;
            if (parentId) this.expandedNodeIds.add(parentId);
            await this.loadTree();
            this._renderTreeLayout();
        } catch (err) {
            if (errEl) {
                errEl.textContent = err.message;
                errEl.style.display = 'block';
            }
        }
    }

    async deleteNode(nodeId) {
        if (!confirm('Ta bort noden? Detta kan inte ångras.')) return;
        try {
            await this.api('DELETE', `/api/category-nodes/${nodeId}`);
            if (this.selectedNodeId === nodeId) {
                this.selectedNodeId = null;
                this.editorMode = 'view';
            }
            await this.loadTree();
            this._renderTreeLayout();
        } catch (e) {
            alert('Kunde inte ta bort nod: ' + e.message);
        }
    }

    // -----------------------------------------------------------------------
    // System list view
    // -----------------------------------------------------------------------
    async showSystemList() {
        this.view = 'system-list';
        await this.loadSystems();
        this.renderSystemList();
    }

    async showTree() {
        this.view = 'tree';
        await this.renderTree();
    }

    renderSystemList() {
        this.view = 'system-list';
        const rows = this.systems.map(s => `
            <tr>
                <td>${escapeHtml(s.name ?? '')}</td>
                <td>${escapeHtml(s.version || '—')}</td>
                <td>${s.root_node_count ?? '—'}</td>
                <td>${s.is_active ? 'Ja' : 'Nej'}</td>
                <td>
                    <button class="btn btn-secondary btn-sm" onclick="categoryAdmin.showEditSystemForm(${s.id})">Redigera</button>
                </td>
            </tr>
        `).join('');

        this.container.innerHTML = `
            <div class="category-admin">
                <div class="admin-panel-header">
                    <h3>Klassifikationssystem</h3>
                    <div style="display:flex;gap:8px;">
                        <button class="btn btn-secondary btn-sm" onclick="categoryAdmin.showTree()">← Tillbaka</button>
                        <button class="btn btn-primary btn-sm" onclick="categoryAdmin.showNewSystemForm()">+ Nytt system</button>
                    </div>
                </div>
                <table class="admin-table" style="width:100%;margin-top:16px;border-collapse:collapse;">
                    <thead><tr style="border-bottom:2px solid #e0e0e0;text-align:left;">
                        <th style="padding:8px;">Namn</th>
                        <th style="padding:8px;">Version</th>
                        <th style="padding:8px;">Rotnoder</th>
                        <th style="padding:8px;">Aktiv</th>
                        <th style="padding:8px;"></th>
                    </tr></thead>
                    <tbody>${rows || '<tr><td colspan="5" class="empty-state">Inga system</td></tr>'}</tbody>
                </table>
            </div>
        `;
    }

    // -----------------------------------------------------------------------
    // System form
    // -----------------------------------------------------------------------
    showNewSystemForm() {
        this.editingSystem = null;
        this.view = 'system-form';
        this.renderSystemForm();
    }

    async showEditSystemForm(id) {
        try {
            this.editingSystem = await this.api('GET', `/api/classification-systems/${id}`);
        } catch (e) {
            alert('Kunde inte hämta system: ' + e.message);
            return;
        }
        this.view = 'system-form';
        this.renderSystemForm();
    }

    renderSystemForm() {
        const s = this.editingSystem;
        const title = s ? `Redigera: ${escapeHtml(s.name ?? '')}` : 'Nytt klassifikationssystem';
        const backFn = s ? 'categoryAdmin.showSystemList()' : 'categoryAdmin.showTree()';

        this.container.innerHTML = `
            <div class="category-admin">
                <div class="admin-panel-header">
                    <h3>${title}</h3>
                    <button class="btn btn-secondary btn-sm" onclick="${backFn}">← Avbryt</button>
                </div>
                <form id="system-form" onsubmit="categoryAdmin.submitSystemForm(event)" style="max-width:480px;margin-top:16px;">
                    <div id="system-form-errors" style="color:#c0392b;margin-bottom:12px;display:none;"></div>
                    <div class="form-group">
                        <label>Namn *</label>
                        <input class="form-input" name="name" required value="${escapeHtml(s?.name || '')}">
                    </div>
                    <div class="form-group">
                        <label>Beskrivning</label>
                        <textarea class="form-input" name="description" rows="3">${escapeHtml(s?.description || '')}</textarea>
                    </div>
                    <div class="form-group">
                        <label>Version</label>
                        <input class="form-input" name="version" value="${escapeHtml(s?.version || '')}">
                    </div>
                    <div class="form-group">
                        <label style="display:flex;align-items:center;gap:8px;">
                            <input type="checkbox" name="is_active" ${(s?.is_active !== false) ? 'checked' : ''}> Aktiv
                        </label>
                    </div>
                    <div style="display:flex;gap:8px;margin-top:16px;">
                        <button type="submit" class="btn btn-primary">Spara</button>
                        ${s ? `<button type="button" class="btn btn-danger" onclick="categoryAdmin.deleteSystem(${s.id})">Ta bort system</button>` : ''}
                    </div>
                </form>
            </div>
        `;
    }

    async submitSystemForm(e) {
        e.preventDefault();
        const form = e.target;
        const errEl = form.querySelector('#system-form-errors');
        errEl.style.display = 'none';

        const body = {
            name: form.name.value.trim(),
            description: form.description.value.trim() || null,
            version: form.version.value.trim() || null,
            is_active: form.is_active.checked,
        };

        try {
            if (this.editingSystem) {
                await this.api('PUT', `/api/classification-systems/${this.editingSystem.id}`, body);
            } else {
                const created = await this.api('POST', '/api/classification-systems', body);
                this.selectedSystemId = created.id;
            }
            await this.showSystemList();
        } catch (e) {
            errEl.textContent = e.message;
            errEl.style.display = 'block';
        }
    }

    async deleteSystem(id) {
        if (!confirm('Ta bort klassifikationssystemet? Detta går inte att ångra.')) return;
        try {
            await this.api('DELETE', `/api/classification-systems/${id}`);
            if (this.selectedSystemId === id) this.selectedSystemId = null;
            await this.showSystemList();
        } catch (e) {
            alert('Kunde inte ta bort: ' + e.message);
        }
    }
}

// Singleton (matches pattern of other admin managers)
let categoryAdmin;

function initCategoryAdmin(containerId) {
    const el = document.getElementById(containerId);
    if (categoryAdmin) {
        categoryAdmin.container = el;  // DOM kan ha återskapats – uppdatera referensen
        categoryAdmin.renderView();
        return;
    }
    categoryAdmin = new CategoryAdmin(containerId);
    categoryAdmin.init();
}
