/**
 * ManagedMultiSelect
 * Shared chip-based multi-select used across object forms and bulk edit flows.
 */
(function initManagedMultiSelect(global) {
    function escape(value) {
        if (typeof global.escapeHtml === 'function') {
            return global.escapeHtml(String(value));
        }
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function normalizeValues(values) {
        return Array.from(new Set((Array.isArray(values) ? values : [])
            .map(value => String(value || '').trim())
            .filter(Boolean)));
    }

    function buildAttrString(attributes = {}) {
        return Object.entries(attributes)
            .filter(([_key, value]) => value !== null && value !== undefined && value !== false)
            .map(([key, value]) => (value === true ? key : `${key}="${escape(value)}"`))
            .join(' ');
    }

    function buildOptionMarkup(option, selectedValues = []) {
        const optionValue = String(option?.value || '').trim();
        const optionLabel = String(option?.label || optionValue).trim();
        const isSelected = selectedValues.includes(optionValue);
        return `
            <button
                type="button"
                class="managed-multi-option-chip ${isSelected ? 'selected' : ''}"
                data-managed-multi-option="${escape(optionValue)}"
                data-search-label="${escape(optionLabel.toLowerCase())}"
                aria-pressed="${isSelected ? 'true' : 'false'}"
                title="${escape(optionLabel)}">
                ${escape(optionLabel)}
            </button>
        `;
    }

    function render(config = {}) {
        const fieldName = String(config.fieldName || '').trim();
        const inputId = String(config.inputId || `field-${fieldName}`).trim();
        const inputName = String(config.inputName || fieldName).trim();
        const options = Array.isArray(config.options) ? config.options : [];
        const selectedValues = normalizeValues(config.selectedValues);
        const actions = Array.isArray(config.actions)
            ? config.actions
            : [
                { key: 'select-all', label: 'Alla', className: 'btn btn-secondary btn-sm' },
                { key: 'clear', label: 'Rensa', className: 'btn btn-secondary btn-sm' }
            ];
        const hiddenSelectAttrs = buildAttrString({
            id: inputId,
            name: inputName,
            class: config.hiddenSelectClass || 'managed-multi-select-native',
            'data-managed-multi-hidden': 'true',
            multiple: true,
            required: config.required ? true : false,
            ...(config.hiddenSelectAttributes || {})
        });
        const hiddenOptionsHtml = options.map(opt => `
            <option value="${escape(opt.value)}" ${selectedValues.includes(String(opt.value)) ? 'selected' : ''}>${escape(opt.label)}</option>
        `).join('');
        const chipOptionsHtml = options.map(opt => buildOptionMarkup(opt, selectedValues)).join('');

        return `
            <div class="managed-multi-select" data-managed-multi-field="${escape(fieldName)}">
                <select ${hiddenSelectAttrs}>
                    ${hiddenOptionsHtml}
                </select>
                <div class="managed-multi-select-toolbar">
                    <input type="text"
                           class="form-control managed-multi-select-search"
                           data-managed-multi-search="${escape(fieldName)}"
                           placeholder="${escape(config.searchPlaceholder || 'Sök och klicka för att lägga till flera val...')}">
                    <div class="managed-multi-select-actions">
                        ${actions.map(action => `
                            <button type="button"
                                    class="${escape(action.className || 'btn btn-secondary btn-sm')}"
                                    data-managed-multi-action="${escape(action.key)}">
                                ${escape(action.label || action.key)}
                            </button>
                        `).join('')}
                    </div>
                </div>
                <div class="managed-multi-select-summary" data-managed-multi-summary="${escape(fieldName)}"></div>
                <div class="managed-multi-select-options" data-managed-multi-options="${escape(fieldName)}">
                    ${chipOptionsHtml}
                </div>
            </div>
        `;
    }

    function syncSummary(wrapper, hiddenSelect) {
        if (!wrapper || !hiddenSelect) return;
        const summary = wrapper.querySelector('[data-managed-multi-summary]');
        if (!summary) return;

        const selectedOptions = Array.from(hiddenSelect.selectedOptions || [])
            .map(option => String(option.textContent || '').trim())
            .filter(Boolean);

        if (!selectedOptions.length) {
            summary.innerHTML = '<span class="managed-multi-select-placeholder">Inga valda</span>';
            return;
        }

        summary.innerHTML = selectedOptions.map(label => `
            <span class="managed-multi-selected-badge">${escape(label)}</span>
        `).join('');
    }

    function sync(wrapper) {
        if (!wrapper) return;
        const hiddenSelect = wrapper.querySelector('select[data-managed-multi-hidden="true"]');
        if (!hiddenSelect) return;

        const selectedValues = new Set(
            Array.from(hiddenSelect.selectedOptions || [])
                .map(option => String(option.value || '').trim())
                .filter(Boolean)
        );

        wrapper.querySelectorAll('[data-managed-multi-option]').forEach(button => {
            const value = String(button.getAttribute('data-managed-multi-option') || '').trim();
            const isSelected = selectedValues.has(value);
            button.classList.toggle('selected', isSelected);
            button.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
        });

        syncSummary(wrapper, hiddenSelect);
    }

    function filter(wrapper, searchTerm = '') {
        if (!wrapper) return;
        const normalized = String(searchTerm || '').trim().toLowerCase();
        wrapper.querySelectorAll('[data-managed-multi-option]').forEach(button => {
            const label = String(button.getAttribute('data-search-label') || '').toLowerCase();
            button.style.display = !normalized || label.includes(normalized) ? '' : 'none';
        });
    }

    function getSelectedValues(wrapper) {
        const hiddenSelect = wrapper?.querySelector?.('select[data-managed-multi-hidden="true"]');
        if (!hiddenSelect) return [];
        return Array.from(hiddenSelect.selectedOptions || [])
            .map(option => String(option.value || '').trim())
            .filter(Boolean);
    }

    function setValues(wrapper, values = []) {
        const hiddenSelect = wrapper?.querySelector?.('select[data-managed-multi-hidden="true"]');
        if (!hiddenSelect) return;
        const nextValues = new Set(normalizeValues(values));
        Array.from(hiddenSelect.options || []).forEach(option => {
            option.selected = nextValues.has(String(option.value || '').trim());
        });
        sync(wrapper);
    }

    function rebuildOptions(wrapper, options = [], selectedValues = []) {
        const hiddenSelect = wrapper?.querySelector?.('select[data-managed-multi-hidden="true"]');
        const optionsHost = wrapper?.querySelector?.('[data-managed-multi-options]');
        if (!hiddenSelect || !optionsHost) return;

        const normalizedSelected = normalizeValues(selectedValues);
        hiddenSelect.innerHTML = (Array.isArray(options) ? options : []).map(opt => `
            <option value="${escape(opt.value)}" ${normalizedSelected.includes(String(opt.value)) ? 'selected' : ''}>${escape(opt.label)}</option>
        `).join('');
        optionsHost.innerHTML = (Array.isArray(options) ? options : [])
            .map(opt => buildOptionMarkup(opt, normalizedSelected))
            .join('');
    }

    function init(container, config = {}) {
        if (!container) return;
        const wrappers = container.matches?.('[data-managed-multi-field]')
            ? [container]
            : Array.from(container.querySelectorAll('[data-managed-multi-field]'));

        wrappers.forEach(wrapper => {
            const hiddenSelect = wrapper.querySelector('select[data-managed-multi-hidden="true"]');
            const searchInput = wrapper.querySelector('[data-managed-multi-search]');
            if (!hiddenSelect) return;

            wrapper.querySelectorAll('[data-managed-multi-option]').forEach(button => {
                button.onclick = () => {
                    const optionValue = String(button.getAttribute('data-managed-multi-option') || '').trim();
                    const optionNode = Array.from(hiddenSelect.options || [])
                        .find(option => String(option.value || '').trim() === optionValue);
                    if (!optionNode) return;
                    optionNode.selected = !optionNode.selected;
                    sync(wrapper);
                    if (typeof config.onChange === 'function') {
                        config.onChange(wrapper, hiddenSelect, getSelectedValues(wrapper));
                    }
                };
            });

            wrapper.querySelectorAll('[data-managed-multi-action]').forEach(button => {
                button.onclick = () => {
                    const action = String(button.getAttribute('data-managed-multi-action') || '').trim();
                    if (action === 'select-all' || action === 'clear') {
                        Array.from(hiddenSelect.options || [])
                            .filter(option => String(option.value || '').trim())
                            .forEach(option => {
                                option.selected = action === 'select-all';
                            });
                        sync(wrapper);
                        if (typeof config.onChange === 'function') {
                            config.onChange(wrapper, hiddenSelect, getSelectedValues(wrapper));
                        }
                        return;
                    }

                    if (typeof config.onAction === 'function') {
                        config.onAction(action, wrapper, hiddenSelect, getSelectedValues(wrapper));
                    }
                };
            });

            if (searchInput) {
                searchInput.oninput = () => {
                    filter(wrapper, searchInput.value);
                };
            }

            filter(wrapper, searchInput?.value || '');
            sync(wrapper);
        });
    }

    global.ManagedMultiSelect = {
        buildOptionMarkup,
        render,
        init,
        sync,
        filter,
        getSelectedValues,
        setValues,
        rebuildOptions
    };
})(window);
