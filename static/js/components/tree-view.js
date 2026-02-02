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
                ${treeHtml}
            </div>
        `;
        
        this.attachEventListeners();
    }
    
    renderNode(node, level) {
        const hasChildren = node.children && node.children.length > 0;
        const isExpanded = this.expandedNodes.has(node.id);
        const indent = level * 20;
        
        let html = '';
        
        if (node.type === 'group') {
            // Type group node
            html += `
                <div class="tree-node tree-node-group" style="padding-left: ${indent}px" data-node-id="${node.id}">
                    ${hasChildren ? `
                        <span class="tree-toggle ${isExpanded ? 'expanded' : ''}">
                            ${isExpanded ? '▼' : '▶'}
                        </span>
                    ` : '<span class="tree-spacer"></span>'}
                    <span class="tree-label tree-label-group">${node.name}</span>
                    <span class="tree-count">(${node.children.length})</span>
                </div>
            `;
        } else {
            // Regular node
            html += `
                <div class="tree-node" style="padding-left: ${indent}px" data-node-id="${node.id}" data-node-type="${node.type}">
                    ${hasChildren ? `
                        <span class="tree-toggle ${isExpanded ? 'expanded' : ''}">
                            ${isExpanded ? '▼' : '▶'}
                        </span>
                    ` : '<span class="tree-spacer"></span>'}
                    <span class="tree-label">${node.name}</span>
                    <span class="tree-badge">${node.auto_id || node.type}</span>
                </div>
            `;
        }
        
        // Render children if expanded
        if (hasChildren && isExpanded) {
            html += '<div class="tree-children">';
            node.children.forEach(child => {
                html += this.renderNode(child, level + 1);
            });
            html += '</div>';
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
