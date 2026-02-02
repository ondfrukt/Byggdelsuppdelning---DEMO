/**
 * Products Module - Handles all product-related functionality
 */

let currentProduct = null;
let currentEditingProduct = null;

// Load and display all products
async function loadProducts(filters = {}) {
    try {
        const products = await ProductsAPI.getAll(filters);
        displayProductsTable(products);
    } catch (error) {
        showToast('Fel vid laddning av produkter: ' + error.message, 'error');
    }
}

// Display products in table
function displayProductsTable(products) {
    const tbody = document.getElementById('products-table-body');
    
    if (products.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="empty-state">Inga produkter hittades</td></tr>';
        return;
    }
    
    tbody.innerHTML = products.map(product => `
        <tr onclick="showProductDetail(${product.id})">
            <td>${product.article_number}</td>
            <td>${product.name}</td>
            <td>${product.version}</td>
            <td><span class="status-badge ${getStatusClass(product.status)}">${product.status}</span></td>
            <td>${formatDate(product.created_at)}</td>
            <td onclick="event.stopPropagation()">
                <div class="action-btns">
                    <button class="btn btn-sm btn-primary" onclick="editProduct(${product.id})">Redigera</button>
                    <button class="btn btn-sm btn-danger" onclick="deleteProduct(${product.id})">Ta bort</button>
                </div>
            </td>
        </tr>
    `).join('');
}

// Show product detail view
async function showProductDetail(productId) {
    try {
        const product = await ProductsAPI.getById(productId);
        currentProduct = product;
        
        // Display product info
        const infoDiv = document.getElementById('product-info');
        infoDiv.innerHTML = `
            <div class="detail-item">
                <span class="detail-label">Artikelnummer</span>
                <span class="detail-value">${product.article_number}</span>
            </div>
            <div class="detail-item">
                <span class="detail-label">Namn</span>
                <span class="detail-value">${product.name}</span>
            </div>
            <div class="detail-item">
                <span class="detail-label">Version</span>
                <span class="detail-value">${product.version}</span>
            </div>
            <div class="detail-item">
                <span class="detail-label">Status</span>
                <span class="detail-value"><span class="status-badge ${getStatusClass(product.status)}">${product.status}</span></span>
            </div>
            <div class="detail-item">
                <span class="detail-label">Beskrivning</span>
                <span class="detail-value">${product.description || '-'}</span>
            </div>
            <div class="detail-item">
                <span class="detail-label">Skapad</span>
                <span class="detail-value">${formatDateTime(product.created_at)}</span>
            </div>
            <div class="detail-item">
                <span class="detail-label">Uppdaterad</span>
                <span class="detail-value">${formatDateTime(product.updated_at)}</span>
            </div>
        `;
        
        // Update title
        document.getElementById('product-detail-title').textContent = product.name;
        
        // Load BOM and relations
        loadProductBOM(productId);
        loadProductRelations(productId);
        
        // Show the detail view
        showView('product-detail-view');
    } catch (error) {
        showToast('Fel vid laddning av produkt: ' + error.message, 'error');
    }
}

// Show products view
function showProductsView() {
    showView('products-view');
    updateNavigation('products');
    loadProducts();
}

// Show create product modal
function showCreateProductModal() {
    currentEditingProduct = null;
    document.getElementById('product-modal-title').textContent = 'Skapa Produkt';
    document.getElementById('product-form').reset();
    openModal('product-modal');
}

// Edit product
async function editProduct(productId) {
    try {
        const product = await ProductsAPI.getById(productId);
        currentEditingProduct = product;
        
        document.getElementById('product-modal-title').textContent = 'Redigera Produkt';
        document.getElementById('product-name').value = product.name;
        document.getElementById('product-article-number').value = product.article_number;
        document.getElementById('product-version').value = product.version;
        document.getElementById('product-status').value = product.status;
        document.getElementById('product-description').value = product.description || '';
        
        openModal('product-modal');
    } catch (error) {
        showToast('Fel vid laddning av produkt: ' + error.message, 'error');
    }
}

// Edit current product (from detail view)
function editCurrentProduct() {
    if (currentProduct) {
        editProduct(currentProduct.id);
    }
}

// Save product (create or update)
async function saveProduct(event) {
    event.preventDefault();
    
    const data = {
        name: document.getElementById('product-name').value,
        article_number: document.getElementById('product-article-number').value,
        version: document.getElementById('product-version').value,
        status: document.getElementById('product-status').value,
        description: document.getElementById('product-description').value,
    };
    
    try {
        if (currentEditingProduct) {
            await ProductsAPI.update(currentEditingProduct.id, data);
            showToast('Produkt uppdaterad', 'success');
            
            // If we're viewing this product, refresh the detail view
            if (currentProduct && currentProduct.id === currentEditingProduct.id) {
                showProductDetail(currentEditingProduct.id);
            }
        } else {
            await ProductsAPI.create(data);
            showToast('Produkt skapad', 'success');
        }
        
        closeModal();
        loadProducts();
    } catch (error) {
        showToast('Fel: ' + error.message, 'error');
    }
}

// Delete product
async function deleteProduct(productId) {
    if (!confirmAction('Är du säker på att du vill ta bort denna produkt?')) {
        return;
    }
    
    try {
        await ProductsAPI.delete(productId);
        showToast('Produkt borttagen', 'success');
        loadProducts();
    } catch (error) {
        showToast('Fel vid borttagning: ' + error.message, 'error');
    }
}

// Delete current product (from detail view)
async function deleteCurrentProduct() {
    if (!currentProduct) return;
    
    if (!confirmAction('Är du säker på att du vill ta bort denna produkt?')) {
        return;
    }
    
    try {
        await ProductsAPI.delete(currentProduct.id);
        showToast('Produkt borttagen', 'success');
        showProductsView();
    } catch (error) {
        showToast('Fel vid borttagning: ' + error.message, 'error');
    }
}

// Setup product filters
function setupProductFilters() {
    const searchInput = document.getElementById('product-search');
    const statusFilter = document.getElementById('product-status-filter');
    
    const debouncedLoad = debounce(() => {
        const filters = {
            search: searchInput.value,
            status: statusFilter.value
        };
        loadProducts(filters);
    }, 300);
    
    searchInput.addEventListener('input', debouncedLoad);
    statusFilter.addEventListener('change', debouncedLoad);
}
