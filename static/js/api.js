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
        return fetchAPI(`/object-types${params}`).then((types) => {
            if (typeof setObjectTypeColorMapFromTypes === 'function') {
                setObjectTypeColorMapFromTypes(types);
            }
            return types;
        });
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

    duplicate: (id, payload = {}) => {
        return fetchAPI(`/objects/${id}/duplicate`, {
            method: 'POST',
            body: JSON.stringify(payload),
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

    getFieldOverrides: (objectId) => {
        return fetchAPI(`/objects/${objectId}/field-overrides`);
    },

    updateFieldOverrides: (objectId, overrides) => {
        return fetchAPI(`/objects/${objectId}/field-overrides`, {
            method: 'PUT',
            body: JSON.stringify({ overrides }),
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
    
    downloadDocument: (_objectId, documentId) => {
        window.open(`${API_BASE_URL}/objects/documents/${documentId}/download?download=1`, '_blank');
    },
    
    deleteDocument: (_objectId, documentId) => {
        return fetchAPI(`/objects/documents/${documentId}`, {
            method: 'DELETE',
        });
    },

    getLinkedFileObjects: (objectId) => {
        return fetchAPI(`/objects/${objectId}/linked-file-objects`);
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


// Managed Lists API
function getManagedListLocaleParam() {
    const browserLocale = String((typeof navigator !== 'undefined' && navigator && navigator.language) || '').trim();
    if (!browserLocale) return '';
    return browserLocale;
}

const ManagedListsAPI = {
    getAll: (includeInactive = false, includeItems = false, includeLinks = false) => {
        const params = new URLSearchParams();
        if (includeInactive) params.append('include_inactive', 'true');
        if (includeItems) params.append('include_items', 'true');
        if (includeLinks) params.append('include_links', 'true');
        const locale = getManagedListLocaleParam();
        if (locale) params.append('locale', locale);
        const query = params.toString();
        return fetchAPI(`/managed-lists${query ? '?' + query : ''}`);
    },

    getById: (id, includeItems = true, includeInactiveItems = false, includeLinks = false) => {
        const params = new URLSearchParams();
        if (includeItems) params.append('include_items', 'true');
        if (includeInactiveItems) params.append('include_inactive_items', 'true');
        if (includeLinks) params.append('include_links', 'true');
        const locale = getManagedListLocaleParam();
        if (locale) params.append('locale', locale);
        const query = params.toString();
        return fetchAPI(`/managed-lists/${id}${query ? '?' + query : ''}`);
    },

    create: (data) => fetchAPI('/managed-lists', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) => fetchAPI(`/managed-lists/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id) => fetchAPI(`/managed-lists/${id}`, { method: 'DELETE' }),

    getItems: (listId, includeInactive = false, filters = {}) => {
        const params = new URLSearchParams();
        if (includeInactive) params.append('include_inactive', 'true');
        if (filters.parent_item_id) params.append('parent_item_id', String(filters.parent_item_id));
        if (filters.parent_list_id) params.append('parent_list_id', String(filters.parent_list_id));
        if (filters.list_link_id) params.append('list_link_id', String(filters.list_link_id));
        if (Object.prototype.hasOwnProperty.call(filters, 'tree_parent_item_id')) {
            const raw = filters.tree_parent_item_id;
            if (raw === null || raw === '' || raw === undefined) {
                params.append('tree_parent_item_id', 'null');
            } else {
                params.append('tree_parent_item_id', String(raw));
            }
        }
        const locale = getManagedListLocaleParam();
        if (locale) params.append('locale', locale);
        const query = params.toString();
        return fetchAPI(`/managed-lists/${listId}/items${query ? '?' + query : ''}`);
    },
    addItem: (listId, data) => fetchAPI(`/managed-lists/${listId}/items`, { method: 'POST', body: JSON.stringify(data) }),
    updateItem: (listId, itemId, data) => fetchAPI(`/managed-lists/${listId}/items/${itemId}`, { method: 'PUT', body: JSON.stringify(data) }),
    deleteItem: (listId, itemId) => fetchAPI(`/managed-lists/${listId}/items/${itemId}`, { method: 'DELETE' }),
    getLinks: (filters = {}) => {
        const params = new URLSearchParams();
        if (filters.include_inactive) params.append('include_inactive', 'true');
        if (filters.parent_list_id) params.append('parent_list_id', String(filters.parent_list_id));
        if (filters.child_list_id) params.append('child_list_id', String(filters.child_list_id));
        const query = params.toString();
        return fetchAPI(`/managed-lists/links${query ? '?' + query : ''}`);
    },
    addLink: (data) => fetchAPI('/managed-lists/links', { method: 'POST', body: JSON.stringify(data) }),
    deleteLink: (linkId) => fetchAPI(`/managed-lists/links/${linkId}`, { method: 'DELETE' }),
    getItemLinks: (filters = {}) => {
        const params = new URLSearchParams();
        if (filters.include_inactive) params.append('include_inactive', 'true');
        if (filters.list_link_id) params.append('list_link_id', String(filters.list_link_id));
        if (filters.parent_item_id) params.append('parent_item_id', String(filters.parent_item_id));
        if (filters.child_item_id) params.append('child_item_id', String(filters.child_item_id));
        const query = params.toString();
        return fetchAPI(`/managed-lists/item-links${query ? '?' + query : ''}`);
    },
    addItemLink: (data) => fetchAPI('/managed-lists/item-links', { method: 'POST', body: JSON.stringify(data) }),
    deleteItemLink: (itemLinkId) => fetchAPI(`/managed-lists/item-links/${itemLinkId}`, { method: 'DELETE' }),
    getChildren: (listId, includeInactive = false) => {
        const params = new URLSearchParams();
        if (includeInactive) params.append('include_inactive', 'true');
        const query = params.toString();
        return fetchAPI(`/managed-lists/${listId}/children${query ? '?' + query : ''}`);
    },
    getParents: (listId, includeInactive = false) => {
        const params = new URLSearchParams();
        if (includeInactive) params.append('include_inactive', 'true');
        const query = params.toString();
        return fetchAPI(`/managed-lists/${listId}/parents${query ? '?' + query : ''}`);
    }
};

const ListsAPI = {
    getAll: (filters = {}) => {
        const params = new URLSearchParams();
        if (filters.include_inactive) params.append('include_inactive', 'true');
        if (filters.search) params.append('search', String(filters.search));
        const query = params.toString();
        return fetchAPI(`/lists${query ? '?' + query : ''}`);
    },
    getById: (listId, includeItems = true, includeInactiveItems = true) => {
        const params = new URLSearchParams();
        if (includeItems) params.append('include_items', 'true');
        if (includeInactiveItems) params.append('include_inactive_items', 'true');
        const query = params.toString();
        return fetchAPI(`/lists/${listId}${query ? '?' + query : ''}`);
    },
    create: (data) => fetchAPI('/lists', { method: 'POST', body: JSON.stringify(data) }),
    update: (listId, data) => fetchAPI(`/lists/${listId}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (listId) => fetchAPI(`/lists/${listId}`, { method: 'DELETE' }),
    getTree: (listId, includeInactive = true) => {
        const params = new URLSearchParams();
        if (includeInactive) params.append('include_inactive', 'true');
        const query = params.toString();
        return fetchAPI(`/lists/${listId}/tree${query ? '?' + query : ''}`);
    },
    addItem: (listId, data) => fetchAPI(`/lists/${listId}/items`, { method: 'POST', body: JSON.stringify(data) }),
    updateItem: (itemId, data) => fetchAPI(`/list-items/${itemId}`, { method: 'PUT', body: JSON.stringify(data) }),
    deleteItem: (itemId) => fetchAPI(`/list-items/${itemId}`, { method: 'DELETE' }),
    moveItem: (itemId, data) => fetchAPI(`/list-items/${itemId}/move`, { method: 'POST', body: JSON.stringify(data) }),
    export: (listId, format = 'json') => {
        const safeFormat = String(format || 'json').toLowerCase();
        window.open(`${API_BASE_URL}/lists/${listId}/export?format=${encodeURIComponent(safeFormat)}`, '_blank');
    },
    importJson: (listId, payload) => fetchAPI(`/lists/${listId}/import`, {
        method: 'POST',
        body: JSON.stringify(payload),
    })
};

const FieldBindingsAPI = {
    getAll: (filters = {}) => {
        const params = new URLSearchParams();
        if (filters.list_id) params.append('list_id', String(filters.list_id));
        if (filters.object_type) params.append('object_type', String(filters.object_type));
        const query = params.toString();
        return fetchAPI(`/field-bindings${query ? '?' + query : ''}`);
    },
    create: (data) => fetchAPI('/field-bindings', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) => fetchAPI(`/field-bindings/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id) => fetchAPI(`/field-bindings/${id}`, { method: 'DELETE' })
};

const RelationTypeRulesAPI = {
    getAll: () => {
        return fetchAPI('/relation-type-rules');
    },

    upsert: (payload) => {
        return fetchAPI('/relation-type-rules', {
            method: 'POST',
            body: JSON.stringify(payload),
        });
    },

    update: (id, payload) => {
        return fetchAPI(`/relation-type-rules/${id}`, {
            method: 'PUT',
            body: JSON.stringify(payload),
        });
    },

    delete: (id) => {
        return fetchAPI(`/relation-type-rules/${id}`, {
            method: 'DELETE',
        });
    }
};

const ChangeManagementAPI = {
    getAll: (filters = {}) => {
        const params = new URLSearchParams();
        if (filters.type) params.append('type', filters.type);
        if (filters.search) params.append('search', filters.search);
        const query = params.toString();
        return fetchAPI(`/change-management${query ? '?' + query : ''}`);
    },

    getById: (id) => fetchAPI(`/change-management/${id}`),

    create: (data) => fetchAPI('/change-management', {
        method: 'POST',
        body: JSON.stringify(data),
    }),

    update: (id, data) => fetchAPI(`/change-management/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
    }),

    delete: (id) => fetchAPI(`/change-management/${id}`, {
        method: 'DELETE',
    }),

    getImpacts: (itemId) => fetchAPI(`/change-management/${itemId}/impacts`),

    addImpact: (itemId, payload) => fetchAPI(`/change-management/${itemId}/impacts`, {
        method: 'POST',
        body: JSON.stringify(payload),
    }),

    updateImpact: (itemId, impactId, payload) => fetchAPI(`/change-management/${itemId}/impacts/${impactId}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
    }),

    deleteImpact: (itemId, impactId) => fetchAPI(`/change-management/${itemId}/impacts/${impactId}`, {
        method: 'DELETE',
    }),
};

// Field Templates API
const FieldTemplatesAPI = {
    getAll: (includeInactive = false) => {
        const params = new URLSearchParams();
        if (includeInactive) params.append('include_inactive', 'true');
        const query = params.toString();
        return fetchAPI(`/field-templates${query ? '?' + query : ''}`);
    },

    create: (data) => {
        return fetchAPI('/field-templates', {
            method: 'POST',
            body: JSON.stringify(data),
        });
    },

    update: (templateId, data) => {
        return fetchAPI(`/field-templates/${templateId}`, {
            method: 'PUT',
            body: JSON.stringify(data),
        });
    },

    delete: (templateId) => {
        return fetchAPI(`/field-templates/${templateId}`, {
            method: 'DELETE',
        });
    },
};
