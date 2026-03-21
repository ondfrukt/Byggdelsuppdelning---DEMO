/**
 * CategoryAdmin – admin-komponent för klassifikationssystem och kategorinoder.
 * Integreras i admin-panelens flik-system.
 */

const REVIT_CATEGORIES = [
    '', 'Walls', 'Floors', 'Roofs', 'Doors', 'Windows',
    'Ceilings', 'Columns', 'Beams', 'Stairs', 'Ramps',
    'Generic Models', 'Furniture', 'Mechanical Equipment',
];

class CategoryAdmin {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.systems = [];
        this.selectedSystemId = null;
        this.treeData = [];          // root nodes for selected system
        this.expandedNodeIds = new Set();
        this.view = 'tree';          // 'tree' | 'system-list' | 'node-form' | 'system-form'
        this.editingNode = null;
        this.editingSystem = null;
        this.parentContext = null;   // {id, code, name, level} when adding child
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
            const roots = await this.api(
                'GET',
                `/api/category-nodes?system_id=${this.selectedSystemId}&level=1&include_children=true`
            );
            this.treeData = roots;
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
        } else if (this.view === 'node-form') {
            this.renderNodeForm();
        } else {
            this.renderTree();
        }
    }

    // -----------------------------------------------------------------------
    // Tree view
    // -----------------------------------------------------------------------
    async renderTree() {
        this.view = 'tree';
        await this.loadTree();
        const systemOptions = this.systems.map(s =>
            `<option value="${s.id}" ${s.id === this.selectedSystemId ? 'selected' : ''}>${escapeHtml(s.name)}${s.version ? ' (' + escapeHtml(s.version) + ')' : ''}</option>`
        ).join('');

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
                        ${this.selectedSystemId ? `<button class="btn btn-primary btn-sm" onclick="categoryAdmin.showNewRootNodeForm()">+ Ny rotnod</button>` : ''}
                    </div>
                </div>

                <div id="cat-tree-container" style="margin-top:16px;">
                    ${this.treeData.length === 0
                        ? '<p class="empty-state">Inga kategorinoder. Skapa en rotnod för att komma igång.</p>'
                        : this.treeData.map(n => this._renderNodeRow(n, 0)).join('')
                    }
                </div>
            </div>
        `;
    }

    _renderNodeRow(node, indent) {
        const hasChildren = node.children && node.children.length > 0;
        const isExpanded = this.expandedNodeIds.has(node.id);
        const toggleBtn = hasChildren
            ? `<button class="btn btn-link btn-sm" style="min-width:20px;padding:0 4px;" onclick="categoryAdmin.toggleExpand(${node.id})">${isExpanded ? '▾' : '▸'}</button>`
            : `<span style="display:inline-block;min-width:20px;"></span>`;

        const revit = node.revit_category ? `<span style="color:#888;font-size:12px;margin-left:8px;">${escapeHtml(node.revit_category ?? '')}</span>` : '';
        const inactiveTag = !node.is_active ? `<span style="color:#999;font-size:11px;margin-left:6px;">(inaktiv)</span>` : '';

        const row = `
            <div class="category-node-row" style="display:flex;align-items:center;padding:5px 8px;border-radius:4px;margin-left:${indent * 20}px;border-bottom:1px solid #f0f0f0;" onmouseover="this.style.background='#f8f8f8'" onmouseout="this.style.background=''">
                ${toggleBtn}
                <span style="font-size:11px;color:#888;min-width:28px;text-align:right;margin-right:6px;">Niv${node.level}</span>
                <span style="font-weight:600;min-width:60px;">${escapeHtml(node.code ?? '')}</span>
                <span style="margin-left:8px;flex:1;">${escapeHtml(node.name ?? '')}${revit}${inactiveTag}</span>
                <div style="display:flex;gap:4px;margin-left:8px;">
                    ${node.level < 3 ? `<button class="btn btn-secondary btn-sm" onclick="categoryAdmin.showAddChildForm(${node.id})">+ Undernod</button>` : ''}
                    <button class="btn btn-secondary btn-sm" onclick="categoryAdmin.showEditNodeForm(${node.id})">Redigera</button>
                    <button class="btn btn-danger btn-sm" onclick="categoryAdmin.deleteNode(${node.id})">Ta bort</button>
                </div>
            </div>
            ${hasChildren && isExpanded ? node.children.map(c => this._renderNodeRow(c, indent + 1)).join('') : ''}
        `;
        return row;
    }

    toggleExpand(nodeId) {
        if (this.expandedNodeIds.has(nodeId)) {
            this.expandedNodeIds.delete(nodeId);
        } else {
            this.expandedNodeIds.add(nodeId);
        }
        this.renderView();
    }

    onSystemChange(value) {
        this.selectedSystemId = value ? parseInt(value, 10) : null;
        this.expandedNodeIds.clear();
        this.renderView();
    }

    // -----------------------------------------------------------------------
    // System list view
    // -----------------------------------------------------------------------
    async showSystemList() {
        this.view = 'system-list';
        await this.loadSystems();
        this.renderSystemList();
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

    // -----------------------------------------------------------------------
    // Node form
    // -----------------------------------------------------------------------
    showNewRootNodeForm() {
        this.editingNode = null;
        this.parentContext = null;
        this.view = 'node-form';
        this.renderNodeForm();
    }

    async showAddChildForm(parentId) {
        try {
            const parent = await this.api('GET', `/api/category-nodes/${parentId}`);
            this.parentContext = parent;
            this.editingNode = null;
            this.view = 'node-form';
            this.renderNodeForm();
        } catch (e) {
            alert('Kunde inte hämta föräldernod: ' + e.message);
        }
    }

    async showEditNodeForm(nodeId) {
        try {
            const node = await this.api('GET', `/api/category-nodes/${nodeId}`);
            this.editingNode = node;
            this.parentContext = null;
            if (node.parent_id) {
                try {
                    this.parentContext = await this.api('GET', `/api/category-nodes/${node.parent_id}`);
                } catch (_) { /* ignore */ }
            }
            this.view = 'node-form';
            this.renderNodeForm();
        } catch (e) {
            alert('Kunde inte hämta nod: ' + e.message);
        }
    }

    renderNodeForm() {
        const n = this.editingNode;
        const parent = this.parentContext;
        const level = n ? n.level : (parent ? parent.level + 1 : 1);
        const title = n ? `Redigera: ${escapeHtml(n.code)} – ${escapeHtml(n.name)}` : 'Ny kategorinod';

        const parentInfo = parent
            ? `<div style="background:#f0f4ff;border-left:3px solid #4a6cf7;padding:8px 12px;border-radius:4px;margin-bottom:16px;font-size:13px;">
                   Skapar undernod till: <strong>${escapeHtml(parent.code)} – ${escapeHtml(parent.name)}</strong> (nivå ${parent.level})
               </div>`
            : '';

        const revitOptions = REVIT_CATEGORIES.map(c =>
            `<option value="${c}" ${(n?.revit_category || '') === c ? 'selected' : ''}>${c || '— Välj —'}</option>`
        ).join('');

        this.container.innerHTML = `
            <div class="category-admin">
                <div class="admin-panel-header">
                    <h3>${title}</h3>
                    <button class="btn btn-secondary btn-sm" onclick="categoryAdmin.showTree()">← Avbryt</button>
                </div>
                ${parentInfo}
                <form id="node-form" onsubmit="categoryAdmin.submitNodeForm(event)" style="max-width:520px;margin-top:16px;">
                    <div id="node-form-errors" style="color:#c0392b;margin-bottom:12px;display:none;"></div>

                    <div class="form-group">
                        <label>Nivå</label>
                        <input class="form-input" value="${level}" disabled style="background:#f5f5f5;color:#666;">
                    </div>
                    <div class="form-group">
                        <label>Kod *</label>
                        <input class="form-input" name="code" required value="${escapeHtml(n?.code || '')}" placeholder="T.ex. F, F2, F2.TRÄ">
                    </div>
                    <div class="form-group">
                        <label>Namn *</label>
                        <input class="form-input" name="name" required value="${escapeHtml(n?.name || '')}" placeholder="T.ex. Klimatskal">
                    </div>
                    <div class="form-group">
                        <label>Revit-kategori</label>
                        <select class="form-input" name="revit_category">${revitOptions}</select>
                    </div>
                    <div class="form-group">
                        <label>IFC-typ</label>
                        <input class="form-input" name="ifc_type" value="${escapeHtml(n?.ifc_type || '')}" placeholder="T.ex. IfcWall">
                    </div>
                    <div class="form-group">
                        <label>Beskrivning</label>
                        <textarea class="form-input" name="description" rows="3">${escapeHtml(n?.description || '')}</textarea>
                    </div>
                    <div class="form-group">
                        <label>Sorteringsordning</label>
                        <input class="form-input" type="number" name="sort_order" value="${n?.sort_order ?? 0}" style="width:100px;">
                    </div>
                    <div class="form-group">
                        <label style="display:flex;align-items:center;gap:8px;">
                            <input type="checkbox" name="is_active" ${(n?.is_active !== false) ? 'checked' : ''}> Aktiv
                        </label>
                    </div>
                    <div style="display:flex;gap:8px;margin-top:16px;">
                        <button type="submit" class="btn btn-primary">Spara</button>
                    </div>
                </form>
            </div>
        `;
    }

    async submitNodeForm(e) {
        e.preventDefault();
        const form = e.target;
        const errEl = form.querySelector('#node-form-errors');
        errEl.style.display = 'none';

        const n = this.editingNode;
        const parent = this.parentContext;
        const level = n ? n.level : (parent ? parent.level + 1 : 1);
        const parentId = n ? n.parent_id : (parent ? parent.id : null);
        const systemId = n ? n.system_id : this.selectedSystemId;

        const body = {
            system_id: systemId,
            parent_id: parentId,
            level,
            code: form.code.value.trim(),
            name: form.name.value.trim(),
            revit_category: form.revit_category.value || null,
            ifc_type: form.ifc_type.value.trim() || null,
            description: form.description.value.trim() || null,
            sort_order: parseInt(form.sort_order.value, 10) || 0,
            is_active: form.is_active.checked,
        };

        try {
            if (n) {
                await this.api('PUT', `/api/category-nodes/${n.id}`, body);
            } else {
                await this.api('POST', '/api/category-nodes', body);
            }
            this.editingNode = null;
            this.parentContext = null;
            await this.showTree();
        } catch (e) {
            errEl.textContent = e.message;
            errEl.style.display = 'block';
        }
    }

    async showTree() {
        this.view = 'tree';
        await this.renderTree();
    }

    // -----------------------------------------------------------------------
    // Delete node
    // -----------------------------------------------------------------------
    async deleteNode(nodeId) {
        if (!confirm('Ta bort kategorinoden? Den kan inte ha barn eller kopplade objekt.')) return;
        try {
            await this.api('DELETE', `/api/category-nodes/${nodeId}`);
            await this.renderTree();
        } catch (e) {
            alert('Kunde inte ta bort nod: ' + e.message);
        }
    }

}

// Singleton (matches pattern of other admin managers)
let categoryAdmin;

function initCategoryAdmin(containerId) {
    if (categoryAdmin) { categoryAdmin.renderView(); return; }
    categoryAdmin = new CategoryAdmin(containerId);
    categoryAdmin.init();
}
