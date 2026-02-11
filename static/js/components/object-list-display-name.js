(function (globalScope) {
    const DISPLAY_FALLBACK_FIELDS = ['name', 'title', 'label'];

    function normalizeTypeName(typeName) {
        return (typeName || '').toString().trim().toLowerCase();
    }

    function getValueByField(data = {}, fieldName = '') {
        if (!fieldName || !data || typeof data !== 'object') return '';

        if (Object.prototype.hasOwnProperty.call(data, fieldName)) {
            return data[fieldName];
        }

        const lowerFieldName = fieldName.toLowerCase();
        const matchedKey = Object.keys(data).find((key) => key.toLowerCase() === lowerFieldName);
        return matchedKey ? data[matchedKey] : '';
    }

    function isNonEmpty(value) {
        return value !== null && value !== undefined && String(value).trim() !== '';
    }

    function resolveObjectDisplayName(obj, typeDisplayFieldMap = {}) {
        const data = obj?.data || {};
        const typeName = normalizeTypeName(obj?.object_type?.name);
        const configuredDisplayField = typeDisplayFieldMap[typeName];

        if (configuredDisplayField) {
            const configuredValue = getValueByField(data, configuredDisplayField);
            if (isNonEmpty(configuredValue)) {
                return String(configuredValue).trim();
            }
        }

        for (const fallbackField of DISPLAY_FALLBACK_FIELDS) {
            const fallbackValue = getValueByField(data, fallbackField);
            if (isNonEmpty(fallbackValue)) {
                return String(fallbackValue).trim();
            }
        }

        return obj?.auto_id || '';
    }

    const api = {
        resolveObjectDisplayName,
        normalizeTypeName,
        getValueByField
    };

    globalScope.ObjectListDisplayName = api;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof window !== 'undefined' ? window : globalThis);
