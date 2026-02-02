/**
 * Relations Module - Handles product relations
 */

// Load relations for a product
async function loadProductRelations(productId) {
    try {
        const relations = await RelationsAPI.getForProduct(productId);
        displayRelations(relations);
    } catch (error) {
        showToast('Fel vid laddning av relationer: ' + error.message, 'error');
    }
}

// Display relations
function displayRelations(relations) {
    const container = document.getElementById('relations-container');
    
    let html = '';
    
    // Relations where this product is the parent
    if (relations.as_parent && relations.as_parent.length > 0) {
        html += '<div class="relations-section"><h4>Denna produkt:</h4>';
        relations.as_parent.forEach(rel => {
            html += `
                <div class="relation-item">
                    <div class="relation-info">
                        <span class="relation-type">${getRelationTypeLabel(rel.relation_type)}</span>
                        <strong>${rel.child_product ? rel.child_product.name : 'Okänd produkt'}</strong>
                        ${rel.description ? `<p>${rel.description}</p>` : ''}
                    </div>
                    <button class="btn btn-sm btn-danger" onclick="deleteRelation(${rel.id})">Ta bort</button>
                </div>
            `;
        });
        html += '</div>';
    }
    
    // Relations where this product is the child
    if (relations.as_child && relations.as_child.length > 0) {
        html += '<div class="relations-section"><h4>Relationer till denna produkt:</h4>';
        relations.as_child.forEach(rel => {
            html += `
                <div class="relation-item">
                    <div class="relation-info">
                        <strong>${rel.parent_product ? rel.parent_product.name : 'Okänd produkt'}</strong>
                        <span class="relation-type">${getRelationTypeLabel(rel.relation_type)}</span>
                        <span>denna produkt</span>
                        ${rel.description ? `<p>${rel.description}</p>` : ''}
                    </div>
                    <button class="btn btn-sm btn-danger" onclick="deleteRelation(${rel.id})">Ta bort</button>
                </div>
            `;
        });
        html += '</div>';
    }
    
    if (html === '') {
        html = '<p class="empty-state">Inga relationer definierade</p>';
    }
    
    container.innerHTML = html;
}

// Show add relation modal
async function showAddRelationModal() {
    if (!currentProduct) return;
    
    try {
        // Load all products for the dropdown (except current product)
        const products = await ProductsAPI.getAll();
        const select = document.getElementById('relation-product');
        
        select.innerHTML = '<option value="">Välj produkt...</option>' +
            products
                .filter(p => p.id !== currentProduct.id)
                .map(p => `<option value="${p.id}">${p.name} (${p.article_number})</option>`)
                .join('');
        
        document.getElementById('relation-form').reset();
        openModal('relation-modal');
    } catch (error) {
        showToast('Fel vid laddning av produkter: ' + error.message, 'error');
    }
}

// Save relation
async function saveRelation(event) {
    event.preventDefault();
    
    if (!currentProduct) return;
    
    const data = {
        child_product_id: parseInt(document.getElementById('relation-product').value),
        relation_type: document.getElementById('relation-type').value,
        description: document.getElementById('relation-description').value,
    };
    
    try {
        await RelationsAPI.create(currentProduct.id, data);
        showToast('Relation skapad', 'success');
        closeModal();
        loadProductRelations(currentProduct.id);
    } catch (error) {
        showToast('Fel: ' + error.message, 'error');
    }
}

// Delete relation
async function deleteRelation(relationId) {
    if (!confirmAction('Är du säker på att du vill ta bort denna relation?')) {
        return;
    }
    
    try {
        await RelationsAPI.delete(relationId);
        showToast('Relation borttagen', 'success');
        
        if (currentProduct) {
            loadProductRelations(currentProduct.id);
        }
    } catch (error) {
        showToast('Fel vid borttagning: ' + error.message, 'error');
    }
}
