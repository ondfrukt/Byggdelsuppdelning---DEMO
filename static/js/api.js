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
        
        // Check if response is JSON before parsing
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            // If not JSON, it's likely an error page (404, 500, etc.)
            throw new Error(`Server error: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        
        if (!response.ok) {
            const error = new Error(data.error || 'An error occurred');
            // Preserve additional error details from backend
            if (data.details) {
                error.details = data.details;
            }
            throw error;
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

// Object Types API
const ObjectTypesAPI = {
    getAll: (includeFields = false) => {
        const params = includeFields ? '?include_fields=true' : '';
        return fetchAPI(`/object-types${params}`);
    },
    
    getById: (id) => {
        return fetchAPI(`/object-types/${id}`);
    },
    
    create: (data) => {
        return fetchAPI('/object-types', {
            method: 'POST',
            body: JSON.stringify(data),
        });
    },
    
    update: (id, data) => {
        return fetchAPI(`/object-types/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data),
        });
    },
    
    delete: (id) => {
        return fetchAPI(`/object-types/${id}`, {
            method: 'DELETE',
        });
    },
    
    // Field management
    addField: (typeId, fieldData) => {
        return fetchAPI(`/object-types/${typeId}/fields`, {
            method: 'POST',
            body: JSON.stringify(fieldData),
        });
    },
    
    updateField: (typeId, fieldId, fieldData) => {
        return fetchAPI(`/object-types/${typeId}/fields/${fieldId}`, {
            method: 'PUT',
            body: JSON.stringify(fieldData),
        });
    },
    
    deleteField: (typeId, fieldId) => {
        return fetchAPI(`/object-types/${typeId}/fields/${fieldId}`, {
            method: 'DELETE',
        });
    },
};

// Objects API
const ObjectsAPI = {
    getAll: (filters = {}) => {
        const params = new URLSearchParams();
        if (filters.type) params.append('type', filters.type);
        if (filters.search) params.append('search', filters.search);
        
        const query = params.toString();
        return fetchAPI(`/objects${query ? '?' + query : ''}`);
    },
    
    getById: (id) => {
        return fetchAPI(`/objects/${id}`);
    },

    getAllPaginated: (filters = {}) => {
        const params = new URLSearchParams();
        if (filters.type) params.append('type', filters.type);
        if (filters.search) params.append('search', filters.search);
        if (filters.page) params.append('page', filters.page);
        if (filters.per_page) params.append('per_page', filters.per_page);
        if (filters.minimal) params.append('minimal', 'true');

        const query = params.toString();
        return fetchAPI(`/objects${query ? '?' + query : ''}`);
    },
    
    create: (data) => {
        return fetchAPI('/objects', {
            method: 'POST',
            body: JSON.stringify(data),
        });
    },
    
    update: (id, data) => {
        return fetchAPI(`/objects/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data),
        });
    },
    
    delete: (id) => {
        return fetchAPI(`/objects/${id}`, {
            method: 'DELETE',
        });
    },
    
    // Relations
    getRelations: (objectId) => {
        return fetchAPI(`/objects/${objectId}/relations`);
    },
    
    addRelation: (objectId, relationData) => {
        return fetchAPI(`/objects/${objectId}/relations`, {
            method: 'POST',
            body: JSON.stringify(relationData),
        });
    },
    
    deleteRelation: (objectId, relationId) => {
        return fetchAPI(`/objects/${objectId}/relations/${relationId}`, {
            method: 'DELETE',
        });
    },


    addRelationsBatch: (payload) => {
        return fetchAPI('/relations/batch', {
            method: 'POST',
            body: JSON.stringify(payload),
        });
    },

    // Documents
    getDocuments: (objectId) => {
        return fetchAPI(`/objects/${objectId}/documents`);
    },
    
    uploadDocument: async (objectId, file, metadata = {}) => {
        const formData = new FormData();
        formData.append('file', file);
        if (metadata.description) {
            formData.append('description', metadata.description);
        }
        if (metadata.document_type) {
            formData.append('document_type', metadata.document_type);
        }
        
        const url = `${API_BASE_URL}/objects/${objectId}/documents`;
        try {
            showLoading();
            const response = await fetch(url, {
                method: 'POST',
                body: formData,
            });
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.error || 'Upload failed');
            }
            
            return data;
        } catch (error) {
            console.error('Upload Error:', error);
            throw error;
        } finally {
            hideLoading();
        }
    },
    
    downloadDocument: (objectId, documentId) => {
        window.open(`${API_BASE_URL}/objects/${objectId}/documents/${documentId}`, '_blank');
    },
    
    deleteDocument: (objectId, documentId) => {
        return fetchAPI(`/objects/${objectId}/documents/${documentId}`, {
            method: 'DELETE',
        });
    },
};

// Search API
const SearchAPI = {
    search: (query, filters = {}) => {
        const params = new URLSearchParams();
        if (query) params.append('q', query);
        if (filters.type) params.append('type', filters.type);
        
        const queryString = params.toString();
        return fetchAPI(`/search${queryString ? '?' + queryString : ''}`);
    },
};
