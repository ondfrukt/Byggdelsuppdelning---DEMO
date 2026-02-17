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
        'Filobjekt': '#9b59b6',
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

function isPdfUrl(url) {
    if (!url) return false;
    const cleanUrl = String(url).split('?')[0].split('#')[0].toLowerCase();
    return cleanUrl.endsWith('.pdf');
}

function normalizePdfOpenUrl(url, isPdf = null) {
    if (!url) return '';

    const resolvedPdf = typeof isPdf === 'boolean' ? isPdf : isPdfUrl(url);
    if (!resolvedPdf) return String(url);

    try {
        const parsed = new URL(String(url), window.location.origin);
        parsed.searchParams.set('inline', '1');
        if (parsed.origin === window.location.origin) {
            return `${parsed.pathname}${parsed.search}${parsed.hash}`;
        }
        return parsed.toString();
    } catch (_error) {
        const separator = String(url).includes('?') ? '&' : '?';
        return `${url}${separator}inline=1`;
    }
}

function createPdfPreviewTooltip() {
    let tooltip = document.getElementById('pdf-preview-tooltip');
    if (tooltip) return tooltip;

    tooltip = document.createElement('div');
    tooltip.id = 'pdf-preview-tooltip';
    tooltip.className = 'pdf-preview-tooltip';
    tooltip.innerHTML = `
        <div class="pdf-preview-tooltip-title">PDF-förhandsvisning</div>
        <iframe class="pdf-preview-frame" title="PDF-förhandsvisning" loading="lazy"></iframe>
    `;
    document.body.appendChild(tooltip);
    return tooltip;
}

function initializePdfHoverPreview() {
    const tooltip = createPdfPreviewTooltip();
    const previewFrame = tooltip.querySelector('.pdf-preview-frame');
    const titleNode = tooltip.querySelector('.pdf-preview-tooltip-title');
    const previewMetaCache = new Map();
    let activeLink = null;
    let hoverToken = 0;

    const hidePreview = () => {
        tooltip.classList.remove('visible');
        activeLink = null;
        if (previewFrame) {
            previewFrame.src = 'about:blank';
        }
    };

    const applyTooltipSize = (ratio) => {
        const safeRatio = Number.isFinite(ratio) && ratio > 0 ? ratio : 0.75;
        const maxWidth = Math.min(Math.floor(window.innerWidth * 0.62), 720);
        const maxHeight = Math.min(Math.floor(window.innerHeight * 0.78), 760);
        const minWidth = 220;
        const minHeight = 260;

        let width = safeRatio >= 1 ? 520 : 360;
        width = Math.max(minWidth, Math.min(width, maxWidth));
        let height = Math.round(width / safeRatio) + 34;

        if (height > maxHeight) {
            height = maxHeight;
            width = Math.round((height - 34) * safeRatio);
        }

        width = Math.max(minWidth, Math.min(width, maxWidth));
        height = Math.max(minHeight, Math.min(height, maxHeight));

        tooltip.style.width = `${width}px`;
        tooltip.style.height = `${height}px`;
    };

    const extractDocumentId = (link, href) => {
        const explicit = link.getAttribute('data-document-id');
        if (explicit && /^\d+$/.test(explicit)) {
            return explicit;
        }
        const match = String(href || '').match(/\/documents\/(\d+)\/download/i);
        return match ? match[1] : '';
    };

    const loadPreviewMeta = async (link, href) => {
        const ratioAttr = link.getAttribute('data-pdf-page-ratio');
        if (ratioAttr) {
            return parseFloat(ratioAttr);
        }

        const docId = extractDocumentId(link, href);
        if (!docId) return null;

        if (previewMetaCache.has(docId)) {
            return previewMetaCache.get(docId);
        }

        try {
            const response = await fetch(`/api/objects/documents/${docId}/preview-meta`);
            if (!response.ok) return null;
            const meta = await response.json();
            const ratio = parseFloat(meta.page_ratio);
            if (!Number.isFinite(ratio) || ratio <= 0) return null;
            previewMetaCache.set(docId, ratio);
            link.setAttribute('data-pdf-page-ratio', String(ratio));
            return ratio;
        } catch (_error) {
            return null;
        }
    };

    const movePreview = (event) => {
        if (!activeLink) return;
        const margin = 18;
        const width = tooltip.offsetWidth || 340;
        const height = tooltip.offsetHeight || 430;
        let left = event.clientX + margin;
        let top = event.clientY + margin;

        if (left + width > window.innerWidth) {
            left = Math.max(8, event.clientX - width - margin);
        }
        if (top + height > window.innerHeight) {
            top = Math.max(8, window.innerHeight - height - 8);
        }

        tooltip.style.left = `${left}px`;
        tooltip.style.top = `${top}px`;
    };

    document.addEventListener('mouseover', (event) => {
        const link = event.target.closest('.js-pdf-preview-link');
        if (!link) return;

        const href = link.getAttribute('data-preview-url') || link.getAttribute('href');
        if (!href) return;

        const currentToken = ++hoverToken;
        activeLink = link;
        const linkText = (link.textContent || '').trim() || 'PDF-dokument';
        if (titleNode) {
            titleNode.textContent = linkText;
        }
        applyTooltipSize(parseFloat(link.getAttribute('data-pdf-page-ratio')) || 0.75);
        if (previewFrame) {
            const previewUrl = `${normalizePdfOpenUrl(href, true)}#page=1&view=FitH&toolbar=0&navpanes=0&scrollbar=0`;
            previewFrame.src = previewUrl;
        }
        tooltip.classList.add('visible');

        loadPreviewMeta(link, href).then((ratio) => {
            if (!ratio || currentToken !== hoverToken || activeLink !== link) return;
            applyTooltipSize(ratio);
        });
    });

    document.addEventListener('mousemove', movePreview);

    document.addEventListener('mouseout', (event) => {
        if (!activeLink) return;
        const toElement = event.relatedTarget;
        if (toElement && (toElement === activeLink || activeLink.contains(toElement))) {
            return;
        }
        hidePreview();
    });

    window.addEventListener('scroll', hidePreview, true);
    window.addEventListener('blur', hidePreview);
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

    const relationModal = document.getElementById('relation-modal');
    if (relationModal && relationModal.style.display === 'block' && typeof closeRelationModal === 'function') {
        closeRelationModal();
        return;
    }
    
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

initializePdfHoverPreview();
