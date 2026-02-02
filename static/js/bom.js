/**
 * BOM (Bill of Materials) Module
 */

// Load BOM for a product
async function loadProductBOM(productId) {
    try {
        const bomItems = await BOMAPI.getForProduct(productId);
        displayBOMTable(bomItems);
    } catch (error) {
        showToast('Fel vid laddning av BOM: ' + error.message, 'error');
    }
}

// Display BOM in table
function displayBOMTable(bomItems) {
    const tbody = document.getElementById('bom-table-body');
    
    if (bomItems.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="empty-state">Inga komponenter i BOM</td></tr>';
        return;
    }
    
    tbody.innerHTML = bomItems.map(item => `
        <tr>
            <td>${item.position || '-'}</td>
            <td>${item.component ? item.component.name : '-'}</td>
            <td>${item.component ? (item.component.type || '-') : '-'}</td>
            <td>${item.quantity}</td>
            <td>${item.component ? item.component.unit : '-'}</td>
            <td>${item.notes || '-'}</td>
            <td>
                <div class="action-btns">
                    <button class="btn btn-sm btn-danger" onclick="deleteBOMItem(${item.id})">Ta bort</button>
                </div>
            </td>
        </tr>
    `).join('');
}

// Show add BOM item modal
async function showAddBomItemModal() {
    if (!currentProduct) return;
    
    try {
        // Load all components for the dropdown
        const components = await ComponentsAPI.getAll();
        const select = document.getElementById('bom-component');
        
        select.innerHTML = '<option value="">Välj komponent...</option>' +
            components.map(c => `<option value="${c.id}">${c.name} (${c.type || '-'})</option>`).join('');
        
        document.getElementById('bom-form').reset();
        openModal('bom-modal');
    } catch (error) {
        showToast('Fel vid laddning av komponenter: ' + error.message, 'error');
    }
}

// Save BOM item
async function saveBomItem(event) {
    event.preventDefault();
    
    if (!currentProduct) return;
    
    const data = {
        component_id: parseInt(document.getElementById('bom-component').value),
        quantity: parseFloat(document.getElementById('bom-quantity').value),
        position: document.getElementById('bom-position').value ? parseInt(document.getElementById('bom-position').value) : null,
        notes: document.getElementById('bom-notes').value,
    };
    
    try {
        await BOMAPI.addItem(currentProduct.id, data);
        showToast('Komponent tillagd i BOM', 'success');
        closeModal();
        loadProductBOM(currentProduct.id);
    } catch (error) {
        showToast('Fel: ' + error.message, 'error');
    }
}

// Delete BOM item
async function deleteBOMItem(bomId) {
    if (!confirmAction('Är du säker på att du vill ta bort denna komponent från BOM?')) {
        return;
    }
    
    try {
        await BOMAPI.deleteItem(bomId);
        showToast('Komponent borttagen från BOM', 'success');
        
        if (currentProduct) {
            loadProductBOM(currentProduct.id);
        }
    } catch (error) {
        showToast('Fel vid borttagning: ' + error.message, 'error');
    }
}
