/**
 * Utility Functions
 */

// Loading spinner timeout reference
let loadingTimeout = null;

// Show loading spinner with delay to avoid flash for fast operations
function showLoading() {
    // Clear any existing timeout
    if (loadingTimeout) {
        clearTimeout(loadingTimeout);
    }
    
    // Only show spinner if loading takes more than 300ms
    loadingTimeout = setTimeout(() => {
        const spinner = document.getElementById('loading-spinner');
        if (spinner) {
            spinner.style.display = 'flex';
        }
    }, 300);
}

// Hide loading spinner
function hideLoading() {
    // Clear the timeout so spinner doesn't appear after loading is done
    if (loadingTimeout) {
        clearTimeout(loadingTimeout);
        loadingTimeout = null;
    }
    
    const spinner = document.getElementById('loading-spinner');
    if (spinner) {
        spinner.style.display = 'none';
    }
}

// Show toast notification
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'slideOut 0.3s ease-out';
        setTimeout(() => {
            container.removeChild(toast);
        }, 300);
    }, 3000);
}

// Format date
function formatDate(dateString) {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleDateString('sv-SE', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
    });
}

// Format datetime
function formatDateTime(dateString) {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleString('sv-SE', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

// Get status badge class
function getStatusClass(status) {
    const statusMap = {
        'Koncept': 'koncept',
        'Under utveckling': 'under-utveckling',
        'Godkänd': 'godkand',
        'Obsolete': 'obsolete'
    };
    return statusMap[status] || 'koncept';
}

// Get relation type label in Swedish
function getRelationTypeLabel(type) {
    const labels = {
        'består_av': 'Består av',
        'variant_av': 'Variant av',
        'ersätter': 'Ersätter',
        'ersätts_av': 'Ersätts av'
    };
    return labels[type] || type;
}

// Get object type color
function getObjectTypeColor(typeName) {
    const colors = {
        'Byggdel': '#3498db',
        'Produkt': '#2ecc71',
        'Kravställning': '#e74c3c',
        'Anslutning': '#f39c12',
        'Ritningsobjekt': '#9b59b6',
        'Egenskap': '#1abc9c',
        'Anvisning': '#34495e'
    };
    return colors[typeName] || '#95a5a6';
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return String(text).replace(/[&<>"']/g, m => map[m]);
}

// Confirmation dialog
function confirmAction(message) {
    return confirm(message);
}

// Modal functions
function openModal(modalId) {
    const overlay = document.getElementById('modal-overlay');
    const modal = document.getElementById(modalId);
    
    if (overlay && modal) {
        overlay.style.display = 'block';
        modal.style.display = 'block';
    }
}

function closeModal() {
    const overlay = document.getElementById('modal-overlay');
    const modals = document.querySelectorAll('.modal');
    
    if (overlay) {
        overlay.style.display = 'none';
    }
    
    modals.forEach(modal => {
        modal.style.display = 'none';
        modal.dataset.mode = '';
        modal.dataset.objectId = '';
        modal.dataset.typeId = '';
        modal.dataset.fieldId = '';
    });
    
    // Reset forms
    const forms = document.querySelectorAll('.modal form');
    forms.forEach(form => form.reset());
    
    // Clear dynamic content
    const objectFormContainer = document.getElementById('object-form-container');
    if (objectFormContainer) {
        objectFormContainer.innerHTML = '';
    }
    
    // Re-enable type select if it was disabled
    const typeSelect = document.getElementById('object-type-select');
    if (typeSelect) {
        typeSelect.disabled = false;
    }
    
    // Clear current form reference
    window.currentObjectForm = null;
}

// Show/hide views
function showView(viewId) {
    const views = document.querySelectorAll('.view');
    views.forEach(view => {
        view.classList.remove('active');
    });
    
    const targetView = document.getElementById(viewId);
    if (targetView) {
        targetView.classList.add('active');
    }
}

// Update navigation buttons
function updateNavigation(activeView) {
    const navBtns = document.querySelectorAll('.nav-btn');
    navBtns.forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.view === activeView) {
            btn.classList.add('active');
        }
    });
}

// Debounce function for search
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Add keyframe for slideOut animation
const style = document.createElement('style');
style.textContent = `
    @keyframes slideOut {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(400px);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);
