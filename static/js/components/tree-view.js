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
    
    async render() {
        if (!this.container) return;
        
        await this.loadData();
        
        if (this.data.length === 0) {
            this.container.innerHTML = '<p class="empty-state">Inga byggdelar ännu</p>';
            return;
        }
        
        const treeHtml = this.data.map(node => this.renderNode(node, 0)).join('');
        
        this.container.innerHTML = `
            <div class="tree-view">
                <table class="tree-table sortable-table" id="tree-table">
                    <thead>
                        <tr>
                            <th data-sortable data-sort-type="text" style="width: 34%;">Namn</th>
                            <th data-sortable data-sort-type="text" style="width: 14%;">ID</th>
                            <th data-sortable data-sort-type="text" style="width: 12%;">Typ</th>
                            <th data-sortable data-sort-type="text" style="width: 14%;">Kravtext</th>
                            <th data-sortable data-sort-type="text" style="width: 14%;">Beskrivning</th>
                            <th data-sortable data-sort-type="text" style="width: 12%;">Filer</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${treeHtml}
                    </tbody>
                </table>
            </div>
        `;
        
        this.attachEventListeners();
        
        // Clean up previous TableSort instance
        // Note: Since innerHTML is replaced, old DOM elements and their event listeners 
        // are automatically garbage collected. We just null the reference here.
        if (this.tableSortInstance) {
            this.tableSortInstance = null;
        }
        
        // Initialize sorting after render
        if (typeof TableSort !== 'undefined') {
            this.tableSortInstance = new TableSort('tree-table');
        }
    }
    
    renderNode(node, level) {
        const hasChildren = node.children && node.children.length > 0;
        const isExpanded = this.expandedNodes.has(node.id);
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
                        <span class="tree-label tree-label-group">${this.escapeHtml(node.name)} <span class="tree-count">(${node.children?.length || 0})</span></span>
                    </td>
                    <td></td>
                    <td></td>
                    <td></td>
                    <td></td>
                    <td></td>
                </tr>
            `;
        } else {
            const kravtext = this.escapeHtml(node.kravtext || '');
            const beskrivning = this.escapeHtml(node.beskrivning || '');
            const filesHtml = this.renderFiles(node.files || []);

            // Regular node - display as table row with columns
            html += `
                <tr class="tree-node ${hasChildren ? 'has-children' : ''}" data-node-id="${node.id}" data-node-type="${node.type}" data-has-children="${hasChildren}">
                    <td style="padding-left: ${indent}px">
                        ${hasChildren ? `
                            <span class="tree-toggle ${isExpanded ? 'expanded' : ''}">
                                ${isExpanded ? '▼' : '▶'}
                            </span>
                        ` : '<span class="tree-spacer"></span>'}
                        <span class="tree-label">${this.escapeHtml(node.name)}</span>
                    </td>
                    <td>
                        ${node.auto_id ? `<a href="javascript:void(0)" class="tree-id-link" data-node-id="${node.id}" data-node-type="${node.type}">${this.escapeHtml(node.auto_id)}</a>` : ''}
                    </td>
                    <td>${this.escapeHtml(node.type || '')}</td>
                    <td>${kravtext}</td>
                    <td>${beskrivning}</td>
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

        return files
            .map(file => {
                const fileName = this.escapeHtml(file.original_filename || file.filename || 'Fil');
                const fileUrl = `/api/objects/documents/${file.id}/download`;
                return `<a href="${this.escapeHtml(fileUrl)}" class="tree-file-link" title="Ladda ner ${fileName}">${fileName}</a>`;
            })
            .join('<br>');
    }

    escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }
    
    attachEventListeners() {
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
                
                if (this.onNodeClick) {
                    this.onNodeClick(parseInt(nodeId), nodeType);
                }
                
                // Highlight selected node
                const nodes = this.container.querySelectorAll('.tree-node');
                nodes.forEach(n => n.classList.remove('tree-node-selected'));
                link.closest('.tree-node').classList.add('tree-node-selected');
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
    
    async refresh() {
        await this.render();
    }
}
