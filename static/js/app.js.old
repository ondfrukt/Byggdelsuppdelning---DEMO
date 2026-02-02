/**
 * Main Application Module
 * Initializes the PLM Demo System and handles routing
 */

// Initialize the application
document.addEventListener('DOMContentLoaded', async () => {
    console.log('PLM Demo System starting...');
    
    // Setup navigation
    setupNavigation();
    
    // Setup tab navigation
    setupTabs();
    
    // Setup filters
    setupProductFilters();
    setupComponentFilters();
    
    // Load dashboard by default
    loadDashboard();
    
    // Check API health
    try {
        const health = await checkHealth();
        console.log('API Health:', health);
    } catch (error) {
        console.error('API Health Check failed:', error);
        showToast('Varning: Kunde inte ansluta till API', 'warning');
    }
});

// Setup main navigation
function setupNavigation() {
    const navBtns = document.querySelectorAll('.nav-btn');
    
    navBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const view = btn.dataset.view;
            
            switch (view) {
                case 'dashboard':
                    loadDashboard();
                    break;
                case 'products':
                    showProductsView();
                    break;
                case 'components':
                    showComponentsView();
                    break;
            }
        });
    });
}

// Setup tab navigation in product detail view
function setupTabs() {
    const tabBtns = document.querySelectorAll('.tab-btn');
    
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabName = btn.dataset.tab;
            
            // Remove active class from all tabs
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            
            // Add active class to clicked tab
            btn.classList.add('active');
            document.getElementById(`tab-${tabName}`).classList.add('active');
        });
    });
}

// Load dashboard
async function loadDashboard() {
    showView('dashboard-view');
    updateNavigation('dashboard');
    
    try {
        const stats = await getStats();
        displayStats(stats);
    } catch (error) {
        showToast('Fel vid laddning av statistik: ' + error.message, 'error');
    }
}

// Display statistics on dashboard
function displayStats(stats) {
    // Update stat cards
    document.getElementById('stat-products').textContent = stats.total_products || 0;
    document.getElementById('stat-components').textContent = stats.total_components || 0;
    document.getElementById('stat-bom-items').textContent = stats.total_bom_items || 0;
    document.getElementById('stat-relations').textContent = stats.total_relations || 0;
    
    // Display products by status
    const statusDiv = document.getElementById('products-by-status');
    if (stats.products_by_status && Object.keys(stats.products_by_status).length > 0) {
        statusDiv.innerHTML = Object.entries(stats.products_by_status).map(([status, count]) => `
            <div class="status-item">
                <span class="status-badge ${getStatusClass(status)}">${status}</span>
                <strong>${count} produkter</strong>
            </div>
        `).join('');
    } else {
        statusDiv.innerHTML = '<p class="empty-state">Ingen data tillgänglig</p>';
    }
    
    // Display recent products
    const recentDiv = document.getElementById('recent-products');
    if (stats.recent_products && stats.recent_products.length > 0) {
        recentDiv.innerHTML = stats.recent_products.map(product => `
            <div class="recent-item" onclick="showProductDetail(${product.id})" style="cursor: pointer;">
                <div>
                    <strong>${product.name}</strong>
                    <p style="color: var(--text-secondary); font-size: 0.875rem;">${product.article_number}</p>
                </div>
                <span class="status-badge ${getStatusClass(product.status)}">${product.status}</span>
            </div>
        `).join('');
    } else {
        recentDiv.innerHTML = '<p class="empty-state">Inga produkter ännu</p>';
    }
}

// Error handler for uncaught errors
window.addEventListener('error', (event) => {
    console.error('Uncaught error:', event.error);
});

// Log when app is ready
console.log('PLM Demo System loaded successfully');
