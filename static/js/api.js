/**
 * API Module - Handles all API requests to the backend
 */

const API_BASE_URL = '/api';

/**
 * Generic fetch wrapper with error handling
 */
async function fetchAPI(endpoint, options = {}) {
    const url = `${API_BASE_URL}${endpoint}`;
    
    const defaultOptions = {
        headers: {
            'Content-Type': 'application/json',
        },
    };
    
    const config = { ...defaultOptions, ...options };
    
    try {
        showLoading();
        const response = await fetch(url, config);
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'An error occurred');
        }
        
        return data;
    } catch (error) {
        console.error('API Error:', error);
        throw error;
    } finally {
        hideLoading();
    }
}

// Health Check
async function checkHealth() {
    return fetchAPI('/health');
}

// Statistics
async function getStats() {
    return fetchAPI('/stats');
}

// Products API
const ProductsAPI = {
    getAll: (filters = {}) => {
        const params = new URLSearchParams();
        if (filters.status) params.append('status', filters.status);
        if (filters.search) params.append('search', filters.search);
        
        const query = params.toString();
        return fetchAPI(`/products${query ? '?' + query : ''}`);
    },
    
    getById: (id) => {
        return fetchAPI(`/products/${id}`);
    },
    
    create: (data) => {
        return fetchAPI('/products', {
            method: 'POST',
            body: JSON.stringify(data),
        });
    },
    
    update: (id, data) => {
        return fetchAPI(`/products/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data),
        });
    },
    
    delete: (id) => {
        return fetchAPI(`/products/${id}`, {
            method: 'DELETE',
        });
    },
};

// Components API
const ComponentsAPI = {
    getAll: (filters = {}) => {
        const params = new URLSearchParams();
        if (filters.type) params.append('type', filters.type);
        if (filters.search) params.append('search', filters.search);
        
        const query = params.toString();
        return fetchAPI(`/components${query ? '?' + query : ''}`);
    },
    
    getById: (id) => {
        return fetchAPI(`/components/${id}`);
    },
    
    create: (data) => {
        return fetchAPI('/components', {
            method: 'POST',
            body: JSON.stringify(data),
        });
    },
    
    update: (id, data) => {
        return fetchAPI(`/components/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data),
        });
    },
    
    delete: (id) => {
        return fetchAPI(`/components/${id}`, {
            method: 'DELETE',
        });
    },
};

// BOM API
const BOMAPI = {
    getForProduct: (productId) => {
        return fetchAPI(`/products/${productId}/bom`);
    },
    
    addItem: (productId, data) => {
        return fetchAPI(`/products/${productId}/bom`, {
            method: 'POST',
            body: JSON.stringify(data),
        });
    },
    
    updateItem: (bomId, data) => {
        return fetchAPI(`/bom/${bomId}`, {
            method: 'PUT',
            body: JSON.stringify(data),
        });
    },
    
    deleteItem: (bomId) => {
        return fetchAPI(`/bom/${bomId}`, {
            method: 'DELETE',
        });
    },
};

// Relations API
const RelationsAPI = {
    getForProduct: (productId) => {
        return fetchAPI(`/products/${productId}/relations`);
    },
    
    create: (productId, data) => {
        return fetchAPI(`/products/${productId}/relations`, {
            method: 'POST',
            body: JSON.stringify(data),
        });
    },
    
    delete: (relationId) => {
        return fetchAPI(`/relations/${relationId}`, {
            method: 'DELETE',
        });
    },
};
