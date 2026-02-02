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
                            <th data-sortable data-sort-type="text" style="width: 50%;">Namn</th>
                            <th data-sortable data-sort-type="text" style="width: 20%;">ID</th>
                            <th data-sortable data-sort-type="text" style="width: 30%;">Typ</th>
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
        const indent = level * 20;
        
        let html = '';
        
        if (node.type === 'group') {
            // Type group node
            html += `
                <tr class="tree-node tree-node-group" data-node-id="${node.id}">
                    <td style="padding-left: ${indent}px">
                        ${hasChildren ? `
                            <span class="tree-toggle ${isExpanded ? 'expanded' : ''}">
                                ${isExpanded ? '▼' : '▶'}
                            </span>
                        ` : '<span class="tree-spacer"></span>'}
                        <span class="tree-label tree-label-group">${node.name}</span>
                    </td>
                    <td></td>
                    <td>
                        <span class="tree-count">(${node.children?.length || 0})</span>
                    </td>
                </tr>
            `;
        } else {
            // Regular node - display as table row with columns
            html += `
                <tr class="tree-node" data-node-id="${node.id}" data-node-type="${node.type}">
                    <td style="padding-left: ${indent}px">
                        ${hasChildren ? `
                            <span class="tree-toggle ${isExpanded ? 'expanded' : ''}">
                                ${isExpanded ? '▼' : '▶'}
                            </span>
                        ` : '<span class="tree-spacer"></span>'}
                        <span class="tree-label">${node.name}</span>
                    </td>
                    <td>
                        <span class="tree-badge">${node.auto_id || ''}</span>
                    </td>
                    <td>${node.type || ''}</td>
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
    
    attachEventListeners() {
        // Toggle expand/collapse
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
        
        // Node click
        const nodes = this.container.querySelectorAll('.tree-node');
        nodes.forEach(node => {
            node.addEventListener('click', (e) => {
                const nodeId = node.dataset.nodeId;
                const nodeType = node.dataset.nodeType;
                
                // Don't trigger for group nodes
                if (nodeType && nodeType !== 'group' && this.onNodeClick) {
                    this.onNodeClick(parseInt(nodeId), nodeType);
                }
                
                // Highlight selected node
                nodes.forEach(n => n.classList.remove('tree-node-selected'));
                node.classList.add('tree-node-selected');
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
