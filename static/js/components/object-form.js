/**
 * Object Form Component
 * Dynamically generates forms based on ObjectType fields
 */

class ObjectFormComponent {
    constructor(objectType, existingObject = null) {
        this.objectType = objectType;
        this.existingObject = existingObject;
        this.fields = [];
        this.buildingPartCategories = [];
        this.managedListValues = {};
        this.richTextWindowState = null;
        this.richTextCopiedFormat = null;
        this.richTextApplyButtonApis = new Set();
    }
    
    async loadFields() {
        try {
            const typeData = await ObjectTypesAPI.getById(this.objectType.id);
            this.fields = typeData.fields || [];
            await this.loadDynamicSelectOptions();
        } catch (error) {
            console.error('Failed to load fields:', error);
            throw error;
        }
    }

    async loadDynamicSelectOptions() {
        const needsBuildingPartCategories = this.fields.some(field => {
            if (field.field_type !== 'select') return false;
            const options = this.normalizeFieldOptions(field.field_options || field.options);
            return options?.source === 'building_part_categories';
        });

        const managedListIds = this.fields
            .filter(field => field.field_type === 'select')
            .map(field => this.normalizeFieldOptions(field.field_options || field.options))
            .filter(options => options?.source === 'managed_list')
            .map(options => Number(options.list_id))
            .filter(listId => Number.isFinite(listId) && listId > 0);

        if (!needsBuildingPartCategories) {
            this.buildingPartCategories = [];
        } else {
            try {
                this.buildingPartCategories = await BuildingPartCategoriesAPI.getAll();
            } catch (error) {
                console.error('Failed to load building part categories for object form:', error);
                this.buildingPartCategories = [];
            }
        }

        this.managedListValues = {};
        if (managedListIds.length > 0) {
            const uniqueIds = Array.from(new Set(managedListIds));
            await Promise.all(uniqueIds.map(async (listId) => {
                try {
                    const managedList = await ManagedListsAPI.getById(listId, true, false);
                    this.managedListValues[listId] = (managedList?.items || [])
                        .filter(item => item.is_active !== false)
                        .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
                        .map(item => item.value)
                        .filter(Boolean);
                } catch (error) {
                    console.error(`Failed to load managed list ${listId} for object form:`, error);
                    this.managedListValues[listId] = [];
                }
            }));
        }
    }
    
    async render(containerId) {
        await this.loadFields();
        
        const container = document.getElementById(containerId);
        if (!container) return;
        
        const formHtml = this.fields.map(field => this.renderField(field)).join('');
        
        // Render metadata fields before dynamic fields
        const metadataFieldsHtml = this.renderMetadataFields();
        
        // Don't create a nested form - just render the fields directly
        // The parent form in index.html (object-main-form) will handle submission
        container.innerHTML = `
            <div id="object-form-fields">
                ${metadataFieldsHtml}
                ${formHtml}
            </div>
        `;

        await this.initializeRichTextEditors(container);
        this.applyConnectionNameRules();
    }

    normalizeFieldKey(value) {
        return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    }

    isConnectionObjectType() {
        const typeName = this.objectType?.name || this.existingObject?.object_type?.name || '';
        return this.normalizeFieldKey(typeName).includes('anslutning');
    }

    findFieldByAliases(aliases = []) {
        const aliasKeys = new Set(aliases.map(alias => this.normalizeFieldKey(alias)));
        return (this.fields || []).find(field => aliasKeys.has(this.normalizeFieldKey(field.field_name)));
    }

    applyConnectionNameRules() {
        if (!this.isConnectionObjectType()) return;

        const form = document.getElementById('object-main-form');
        if (!form) return;

        const nameField = this.findFieldByAliases(['namn', 'name']);
        const delAField = this.findFieldByAliases(['del_a', 'dela', 'del a']);
        const delBField = this.findFieldByAliases(['del_b', 'delb', 'del b']);
        if (!nameField || !delAField || !delBField) return;

        const nameInput = form.elements[nameField.field_name];
        const delAInput = form.elements[delAField.field_name];
        const delBInput = form.elements[delBField.field_name];
        if (!nameInput || !delAInput || !delBInput) return;

        nameInput.readOnly = true;
        nameInput.classList.add('readonly-autogenerated');
        nameInput.title = 'Genereras automatiskt från Del A och Del B';

        const updateGeneratedName = () => {
            const partA = String(delAInput.value || '').trim();
            const partB = String(delBInput.value || '').trim();
            if (!partA || !partB) {
                nameInput.value = '';
                return;
            }
            const orderedParts = [partA, partB].sort((a, b) =>
                a.localeCompare(b, 'sv', { sensitivity: 'base' })
            );
            nameInput.value = `${orderedParts[0]} - ${orderedParts[1]}`;
        };

        delAInput.addEventListener('input', updateGeneratedName);
        delBInput.addEventListener('input', updateGeneratedName);
        updateGeneratedName();
    }
    
    renderField(field) {
        const value = this.existingObject?.data?.[field.field_name] || '';
        const required = field.is_required ? 'required' : '';
        const label = `${field.display_name || field.field_name}${field.is_required ? ' *' : ''}`;
        const layoutClass = this.getFieldLayoutClass(field.field_type);
        
        let inputHtml = '';
        
        switch (field.field_type) {
            case 'text':
                inputHtml = `
                    <input type="text" 
                           id="field-${field.field_name}" 
                           name="${field.field_name}"
                           value="${escapeHtml(value)}"
                           ${required}
                           class="form-control">
                `;
                break;
                
            case 'textarea':
                inputHtml = `
                    <textarea id="field-${field.field_name}" 
                              name="${field.field_name}"
                              rows="4"
                              ${required}
                              class="form-control">${escapeHtml(value)}</textarea>
                `;
                break;

            case 'richtext': {
                const safeHtml = sanitizeRichTextHtml(value);
                inputHtml = `
                    <div class="rich-text-field" data-field-name="${field.field_name}">
                        <div class="rich-text-inline-actions">
                            <button type="button"
                                    class="btn btn-secondary btn-sm rich-text-open-window-btn"
                                    data-richtext-open-window="true"
                                    data-field-name="${field.field_name}"
                                    data-field-label="${escapeHtml(field.display_name || field.field_name)}">
                                Öppna i fönster
                            </button>
                        </div>
                        <textarea id="field-${field.field_name}"
                                  name="${field.field_name}"
                                  ${required}
                                  class="form-control rich-text-textarea"
                                  data-richtext="true">${escapeHtml(safeHtml)}</textarea>
                        <div class="rich-text-fallback" data-richtext-fallback-for="field-${field.field_name}" style="display:none;">
                            <div class="rich-text-toolbar" role="toolbar" aria-label="Verktyg för formatering">
                                <button type="button" class="btn-icon" data-editor-command="bold" title="Fet">B</button>
                                <button type="button" class="btn-icon" data-editor-command="italic" title="Kursiv"><em>I</em></button>
                                <button type="button" class="btn-icon" data-editor-command="underline" title="Understruken"><u>U</u></button>
                                <button type="button" class="btn-icon" data-editor-command="insertUnorderedList" title="Punktlista">• List</button>
                                <button type="button" class="btn-icon" data-editor-command="insertOrderedList" title="Numrerad lista">1. List</button>
                                <button type="button" class="btn-icon" data-editor-action="toggleDashList" title="Strecklista">- List</button>
                                <button type="button" class="btn-icon" data-editor-command="indent" title="Öka indrag">→|</button>
                                <button type="button" class="btn-icon" data-editor-command="outdent" title="Minska indrag">|←</button>
                                <button type="button" class="btn-icon" data-editor-action="insertTab" title="Infoga tabb">Tab</button>
                                <button type="button" class="btn-icon" data-editor-action="insertImageUrl" title="Infoga bild via URL">Bild</button>
                                <button type="button" class="btn-icon" data-editor-action="copyFormat" title="Kopiera format">Kopiera format</button>
                                <button type="button" class="btn-icon" data-editor-action="applyFormat" title="Applicera format">Applicera format</button>
                                <button type="button" class="btn-icon" data-editor-command="removeFormat" title="Rensa format">Tx</button>
                            </div>
                            <div class="rich-text-editor form-control"
                                 contenteditable="true"
                                 data-richtext-fallback-editor-for="field-${field.field_name}">${safeHtml}</div>
                        </div>
                    </div>
                `;
                break;
            }
                
            case 'number':
                inputHtml = `
                    <input type="number" 
                           id="field-${field.field_name}" 
                           name="${field.field_name}"
                           value="${value}"
                           step="any"
                           ${required}
                           class="form-control">
                `;
                break;
                
            case 'decimal':
                inputHtml = `
                    <input type="number" 
                           id="field-${field.field_name}" 
                           name="${field.field_name}"
                           value="${value}"
                           step="0.01"
                           ${required}
                           class="form-control">
                `;
                break;
                
            case 'date':
                const dateValue = value ? formatDateForInput(value) : '';
                inputHtml = `
                    <input type="date" 
                           id="field-${field.field_name}" 
                           name="${field.field_name}"
                           value="${dateValue}"
                           ${required}
                           class="form-control">
                `;
                break;
                
            case 'datetime':
                const datetimeValue = value ? formatDateTimeForInput(value) : '';
                inputHtml = `
                    <input type="datetime-local" 
                           id="field-${field.field_name}" 
                           name="${field.field_name}"
                           value="${datetimeValue}"
                           ${required}
                           class="form-control">
                `;
                break;
                
            case 'boolean':
                const checked = value === true || value === 'true' ? 'checked' : '';
                inputHtml = `
                    <div class="checkbox-wrapper">
                        <input type="checkbox" 
                               id="field-${field.field_name}" 
                               name="${field.field_name}"
                               ${checked}
                               class="form-checkbox">
                        <label for="field-${field.field_name}" class="checkbox-label">
                            ${field.help_text || 'Aktivera'}
                        </label>
                    </div>
                `;
                break;
                
            case 'select':
                const options = this.getSelectOptions(field);
                const optionsHtml = options.map(opt => 
                    `<option value="${escapeHtml(opt)}" ${value === opt ? 'selected' : ''}>
                        ${escapeHtml(opt)}
                    </option>`
                ).join('');
                inputHtml = `
                    <select id="field-${field.field_name}" 
                            name="${field.field_name}"
                            ${required}
                            class="form-control">
                        <option value="">Välj...</option>
                        ${optionsHtml}
                    </select>
                `;
                break;
                
            default:
                inputHtml = `
                    <input type="text" 
                           id="field-${field.field_name}" 
                           name="${field.field_name}"
                           value="${escapeHtml(value)}"
                           ${required}
                           class="form-control">
                `;
        }
        
        return `
            <div class="form-group ${layoutClass}">
                <label for="field-${field.field_name}">${label}</label>
                ${inputHtml}
                ${field.help_text ? `<small class="form-help">${escapeHtml(field.help_text)}</small>` : ''}
            </div>
        `;
    }

    getFieldLayoutClass(fieldType) {
        if (fieldType === 'richtext' || fieldType === 'textarea') {
            return 'form-group-full';
        }
        return 'form-group-compact';
    }

    getTinyMceSelectionNode(editor) {
        const selectedNode = editor?.selection?.getNode?.();
        if (!selectedNode) return null;
        return selectedNode.nodeType === Node.TEXT_NODE ? selectedNode.parentElement : selectedNode;
    }

    getComputedNodeStyle(node) {
        if (!node) return null;
        const win = node.ownerDocument?.defaultView || window;
        return win.getComputedStyle(node);
    }

    normalizeTinyMceCopiedFormat(format) {
        if (!format) return null;
        return {
            bold: Boolean(format.bold),
            italic: Boolean(format.italic),
            underline: Boolean(format.underline),
            strikethrough: Boolean(format.strikethrough),
            forecolor: format.forecolor || '',
            backcolor: format.backcolor || '',
            fontFamily: format.fontFamily || '',
            fontSize: format.fontSize || ''
        };
    }

    captureTinyMceFormat(editor) {
        if (!editor) return null;
        const node = this.getTinyMceSelectionNode(editor);
        if (!node) return null;

        const computed = this.getComputedNodeStyle(node);
        const textDecoration = (computed?.textDecorationLine || '').toLowerCase();
        const fontWeight = Number.parseInt(computed?.fontWeight || '400', 10);

        return this.normalizeTinyMceCopiedFormat({
            bold: editor.formatter.match('bold') || fontWeight >= 600,
            italic: editor.formatter.match('italic') || (computed?.fontStyle || '').toLowerCase() === 'italic',
            underline: editor.formatter.match('underline') || textDecoration.includes('underline'),
            strikethrough: editor.formatter.match('strikethrough') || textDecoration.includes('line-through'),
            forecolor: computed?.color || '',
            backcolor: computed?.backgroundColor || '',
            fontFamily: computed?.fontFamily || '',
            fontSize: computed?.fontSize || ''
        });
    }

    setTinyMceInlineFormatState(editor, formatName, shouldApply) {
        const isApplied = editor.formatter.match(formatName);
        if (shouldApply && !isApplied) editor.formatter.apply(formatName);
        if (!shouldApply && isApplied) editor.formatter.remove(formatName);
    }

    applyTinyMceFormat(editor, copiedFormat) {
        if (!editor || !copiedFormat) return;

        this.setTinyMceInlineFormatState(editor, 'bold', copiedFormat.bold);
        this.setTinyMceInlineFormatState(editor, 'italic', copiedFormat.italic);
        this.setTinyMceInlineFormatState(editor, 'underline', copiedFormat.underline);
        this.setTinyMceInlineFormatState(editor, 'strikethrough', copiedFormat.strikethrough);

        if (copiedFormat.fontFamily) {
            editor.execCommand('FontName', false, copiedFormat.fontFamily);
        }
        if (copiedFormat.fontSize) {
            editor.execCommand('FontSize', false, copiedFormat.fontSize);
        }
        if (copiedFormat.forecolor) {
            editor.execCommand('ForeColor', false, copiedFormat.forecolor);
        }
        if (copiedFormat.backcolor && copiedFormat.backcolor !== 'rgba(0, 0, 0, 0)' && copiedFormat.backcolor !== 'transparent') {
            editor.execCommand('HiliteColor', false, copiedFormat.backcolor);
        }
    }

    findTinyMceListNode(editor) {
        const node = this.getTinyMceSelectionNode(editor);
        if (!node) return null;
        return editor.dom.getParent(node, 'ul,ol');
    }

    toggleTinyMceDashList(editor) {
        if (!editor) return;
        editor.undoManager.transact(() => {
            let listNode = this.findTinyMceListNode(editor);
            if (!listNode) {
                editor.execCommand('InsertUnorderedList');
                listNode = this.findTinyMceListNode(editor);
            } else if (listNode.nodeName === 'OL') {
                editor.execCommand('InsertUnorderedList');
                listNode = this.findTinyMceListNode(editor);
            }

            if (!listNode || listNode.nodeName !== 'UL') return;
            if (editor.dom.hasClass(listNode, 'dash-list')) {
                editor.dom.removeClass(listNode, 'dash-list');
                if (!listNode.className.trim()) {
                    listNode.removeAttribute('class');
                }
            } else {
                editor.dom.addClass(listNode, 'dash-list');
            }
        });
        editor.nodeChanged();
    }

    updateRichTextApplyButtonState() {
        const enabled = Boolean(this.richTextCopiedFormat);
        this.richTextApplyButtonApis.forEach(api => {
            api.setEnabled(enabled);
        });
        document.querySelectorAll('[data-editor-action="applyFormat"]').forEach(button => {
            button.disabled = !enabled;
        });
    }

    registerTinyMceFormatButtons(editor) {
        editor.ui.registry.addButton('dashlist', {
            text: '- List',
            tooltip: 'Växla strecklista',
            onAction: () => {
                this.toggleTinyMceDashList(editor);
            }
        });

        editor.ui.registry.addButton('copyformat', {
            text: 'Kopiera',
            tooltip: 'Kopiera format',
            onAction: () => {
                const copiedFormat = this.captureTinyMceFormat(editor);
                if (!copiedFormat) {
                    editor.notificationManager.open({
                        text: 'Markera text med format att kopiera först.',
                        type: 'warning'
                    });
                    return;
                }
                this.richTextCopiedFormat = copiedFormat;
                this.updateRichTextApplyButtonState();
                editor.notificationManager.open({
                    text: 'Formatering kopierad.',
                    type: 'success'
                });
            }
        });

        editor.ui.registry.addButton('applyformat', {
            text: 'Applicera',
            tooltip: 'Applicera kopierat format',
            onAction: () => {
                if (!this.richTextCopiedFormat) {
                    editor.notificationManager.open({
                        text: 'Kopiera format först.',
                        type: 'warning'
                    });
                    return;
                }
                this.applyTinyMceFormat(editor, this.richTextCopiedFormat);
                editor.nodeChanged();
            },
            onSetup: (api) => {
                this.richTextApplyButtonApis.add(api);
                api.setEnabled(Boolean(this.richTextCopiedFormat));
                return () => {
                    this.richTextApplyButtonApis.delete(api);
                };
            }
        });
    }

    captureFallbackFormat(editor) {
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) return null;
        const range = selection.getRangeAt(0);
        const anchorNode = range.startContainer?.nodeType === Node.TEXT_NODE
            ? range.startContainer.parentElement
            : range.startContainer;
        if (!anchorNode || !editor.contains(anchorNode)) return null;

        const computed = this.getComputedNodeStyle(anchorNode);
        const textDecoration = (computed?.textDecorationLine || '').toLowerCase();
        const fontWeight = Number.parseInt(computed?.fontWeight || '400', 10);
        return this.normalizeTinyMceCopiedFormat({
            bold: fontWeight >= 600,
            italic: (computed?.fontStyle || '').toLowerCase() === 'italic',
            underline: textDecoration.includes('underline'),
            strikethrough: textDecoration.includes('line-through'),
            forecolor: computed?.color || '',
            backcolor: computed?.backgroundColor || '',
            fontFamily: computed?.fontFamily || '',
            fontSize: computed?.fontSize || ''
        });
    }

    applyFallbackFormat(editor, copiedFormat) {
        if (!editor || !copiedFormat) return;
        editor.focus();
        document.execCommand('styleWithCSS', false, true);

        const setToggle = (command, shouldApply) => {
            const isApplied = document.queryCommandState(command);
            if (Boolean(shouldApply) !== Boolean(isApplied)) {
                document.execCommand(command, false, null);
            }
        };

        setToggle('bold', copiedFormat.bold);
        setToggle('italic', copiedFormat.italic);
        setToggle('underline', copiedFormat.underline);
        setToggle('strikeThrough', copiedFormat.strikethrough);

        if (copiedFormat.fontFamily) {
            document.execCommand('fontName', false, copiedFormat.fontFamily);
        }
        if (copiedFormat.forecolor) {
            document.execCommand('foreColor', false, copiedFormat.forecolor);
        }
        if (copiedFormat.backcolor && copiedFormat.backcolor !== 'rgba(0, 0, 0, 0)' && copiedFormat.backcolor !== 'transparent') {
            document.execCommand('hiliteColor', false, copiedFormat.backcolor);
        }
    }

    getFallbackSelectionContainer(editor) {
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) return null;
        const range = selection.getRangeAt(0);
        const node = range.startContainer?.nodeType === Node.TEXT_NODE
            ? range.startContainer.parentElement
            : range.startContainer;
        if (!node || !editor.contains(node)) return null;
        return node;
    }

    toggleFallbackDashList(editor) {
        if (!editor) return;
        editor.focus();

        let containerNode = this.getFallbackSelectionContainer(editor);
        let listNode = containerNode?.closest('ul,ol');

        if (!listNode) {
            document.execCommand('insertUnorderedList', false, null);
            containerNode = this.getFallbackSelectionContainer(editor);
            listNode = containerNode?.closest('ul,ol');
        } else if (listNode.tagName === 'OL') {
            document.execCommand('insertUnorderedList', false, null);
            containerNode = this.getFallbackSelectionContainer(editor);
            listNode = containerNode?.closest('ul,ol');
        }

        if (!listNode || listNode.tagName !== 'UL') return;
        if (listNode.classList.contains('dash-list')) {
            listNode.classList.remove('dash-list');
            if (!listNode.className.trim()) {
                listNode.removeAttribute('class');
            }
        } else {
            listNode.classList.add('dash-list');
        }
    }

    async initializeRichTextEditors(scopeNode) {
        if (!scopeNode) return;
        const textareas = scopeNode.querySelectorAll('textarea.rich-text-textarea[data-richtext="true"]');
        if (textareas.length === 0) return;

        const tinyMceReady = await this.ensureTinyMceLoaded();
        if (!tinyMceReady || !window.tinymce || typeof window.tinymce.init !== 'function') {
            console.warn('TinyMCE is not available; using fallback rich text editor');
            this.initializeFallbackRichTextEditors(scopeNode, textareas);
            this.bindRichTextWindowButtons(scopeNode);
            return;
        }

        textareas.forEach(textarea => {
            const existing = window.tinymce.get(textarea.id);
            if (existing) existing.remove();

            window.tinymce.init({
                target: textarea,
                menubar: 'file edit view insert format tools table help',
                branding: false,
                promotion: false,
                statusbar: true,
                min_height: 240,
                plugins: 'advlist autolink lists link image charmap preview anchor searchreplace visualblocks code fullscreen insertdatetime media table help wordcount paste autoresize nonbreaking',
                toolbar: 'undo redo | blocks fontfamily fontsize | bold italic underline strikethrough | forecolor backcolor | alignleft aligncenter alignright alignjustify | bullist numlist dashlist outdent indent | link image media table | copyformat applyformat removeformat code fullscreen',
                toolbar_mode: 'sliding',
                font_size_formats: '8pt 10pt 12pt 14pt 16pt 18pt 20pt 24pt 28pt 32pt 36pt 48pt',
                font_family_formats: 'Arial=arial,helvetica,sans-serif; Helvetica=helvetica,arial,sans-serif; Times New Roman=times new roman,times,serif; Georgia=georgia,serif; Verdana=verdana,geneva,sans-serif; Tahoma=tahoma,arial,helvetica,sans-serif; Courier New=courier new,courier,monospace',
                paste_data_images: true,
                paste_as_text: false,
                paste_remove_styles_if_webkit: false,
                paste_webkit_styles: 'all',
                paste_merge_formats: true,
                nonbreaking_force_tab: true,
                automatic_uploads: false,
                convert_urls: false,
                browser_spellcheck: true,
                contextmenu: 'undo redo | bold italic underline | link image inserttable | cell row column deletetable',
                content_style: 'body { font-family: Segoe UI, Arial, sans-serif; font-size: 14px; line-height: 1.45; } p { margin: 0 0 0.35rem; } img { max-width: 100%; height: auto; } ul.dash-list { list-style: none; padding-left: 1.2rem; } ul.dash-list > li { position: relative; } ul.dash-list > li::before { content: "- "; position: absolute; left: -1rem; }',
                setup: (editor) => {
                    this.registerTinyMceFormatButtons(editor);

                    const syncEditor = () => {
                        editor.save();
                        textarea.value = sanitizeRichTextHtml(textarea.value || '');
                    };

                    editor.on('init', () => {
                        const initial = sanitizeRichTextHtml(editor.getContent({ format: 'html' }) || '');
                        if (initial !== editor.getContent({ format: 'html' })) {
                            editor.setContent(initial, { format: 'html' });
                        }
                        syncEditor();
                    });

                    editor.on('change input undo redo keyup', syncEditor);
                }
            });
        });

        this.bindRichTextWindowButtons(scopeNode);
    }

    async ensureTinyMceLoaded() {
        if (window.tinymce && typeof window.tinymce.init === 'function') {
            return true;
        }

        if (ObjectFormComponent._tinymceLoadPromise) {
            return ObjectFormComponent._tinymceLoadPromise;
        }

        const staticScript = document.querySelector('script[src*="tinymce.min.js"]');
        const baseLocalSrc = staticScript?.src || 'https://cdn.jsdelivr.net/npm/tinymce@7/tinymce.min.js';
        const candidates = Array.from(new Set([
            baseLocalSrc,
            'https://cdn.jsdelivr.net/npm/tinymce@7/tinymce.min.js',
            '/static/vendor/tinymce/tinymce.min.js',
            `${window.location.origin}/static/vendor/tinymce/tinymce.min.js`
        ]));

        const loadScript = (src) => new Promise((resolve) => {
            const existing = document.querySelector(`script[src="${src}"]`);
            if (existing) {
                if (window.tinymce && typeof window.tinymce.init === 'function') {
                    resolve(true);
                    return;
                }
                existing.addEventListener('load', () => resolve(Boolean(window.tinymce)), { once: true });
                existing.addEventListener('error', () => resolve(false), { once: true });
                setTimeout(() => resolve(Boolean(window.tinymce)), 3000);
                return;
            }

            const script = document.createElement('script');
            script.src = src;
            script.async = true;
            script.onload = () => resolve(Boolean(window.tinymce));
            script.onerror = () => resolve(false);
            document.head.appendChild(script);
            setTimeout(() => resolve(Boolean(window.tinymce)), 6000);
        });

        ObjectFormComponent._tinymceLoadPromise = (async () => {
            for (const src of candidates) {
                const loaded = await loadScript(src);
                if (loaded && window.tinymce && typeof window.tinymce.init === 'function') {
                    return true;
                }
                console.warn('TinyMCE not ready after load attempt:', src);
            }
            console.error('Failed to initialize TinyMCE from all local sources:', candidates);
            return false;
        })();

        return ObjectFormComponent._tinymceLoadPromise;
    }

    bindRichTextWindowButtons(scopeNode) {
        if (!scopeNode) return;
        scopeNode.querySelectorAll('[data-richtext-open-window="true"]').forEach(button => {
            button.onclick = () => {
                const fieldName = button.dataset.fieldName;
                const fieldLabel = button.dataset.fieldLabel || fieldName || 'Formaterad text';
                this.openRichTextWindow(scopeNode, fieldName, fieldLabel);
            };
        });
    }

    ensureRichTextWindow() {
        let modal = document.getElementById('richtext-editor-window');
        if (modal) return modal;

        modal = document.createElement('div');
        modal.id = 'richtext-editor-window';
        modal.className = 'richtext-editor-window';
        modal.innerHTML = `
            <div class="richtext-editor-window-backdrop">
                <div class="richtext-editor-window-dialog" role="dialog" aria-modal="true" aria-labelledby="richtext-editor-window-title">
                    <div class="richtext-editor-window-header">
                        <h3 id="richtext-editor-window-title">Richtext-editor</h3>
                        <button type="button" class="close-btn" data-action="close-richtext-editor-window" aria-label="Stäng">&times;</button>
                    </div>
                    <div class="richtext-editor-window-body">
                        <textarea id="richtext-editor-window-textarea" class="form-control"></textarea>
                        <div id="richtext-editor-window-fallback" class="richtext-editor-window-fallback" contenteditable="true" style="display:none;"></div>
                    </div>
                    <div class="richtext-editor-window-footer">
                        <button type="button" class="btn btn-primary" data-action="save-richtext-editor-window">Spara</button>
                        <button type="button" class="btn btn-secondary" data-action="close-richtext-editor-window">Stäng</button>
                    </div>
                </div>
            </div>
        `;

        modal.addEventListener('click', (event) => {
            const backdrop = modal.querySelector('.richtext-editor-window-backdrop');
            if (event.target === backdrop || event.target.closest('[data-action="close-richtext-editor-window"]')) {
                this.closeRichTextWindow(true);
            }
            if (event.target.closest('[data-action="save-richtext-editor-window"]')) {
                this.saveRichTextWindowContent(true);
            }
        });

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && modal.classList.contains('active')) {
                this.closeRichTextWindow(true);
            }
        });

        document.body.appendChild(modal);
        return modal;
    }

    buildWindowTinyMceConfig(textareaElement) {
        return {
            target: textareaElement,
            menubar: 'file edit view insert format tools table help',
            branding: false,
            promotion: false,
            statusbar: true,
            min_height: 420,
            plugins: 'advlist autolink lists link image charmap preview anchor searchreplace visualblocks code fullscreen insertdatetime media table help wordcount paste nonbreaking',
            toolbar: 'undo redo | blocks fontfamily fontsize | bold italic underline strikethrough | forecolor backcolor | alignleft aligncenter alignright alignjustify | bullist numlist dashlist outdent indent | link image media table | copyformat applyformat removeformat code fullscreen',
            toolbar_mode: 'sliding',
            resize: false,
            font_size_formats: '8pt 10pt 12pt 14pt 16pt 18pt 20pt 24pt 28pt 32pt 36pt 48pt',
            font_family_formats: 'Arial=arial,helvetica,sans-serif; Helvetica=helvetica,arial,sans-serif; Times New Roman=times new roman,times,serif; Georgia=georgia,serif; Verdana=verdana,geneva,sans-serif; Tahoma=tahoma,arial,helvetica,sans-serif; Courier New=courier new,courier,monospace',
            paste_data_images: true,
            paste_as_text: false,
            paste_remove_styles_if_webkit: false,
            paste_webkit_styles: 'all',
            paste_merge_formats: true,
            nonbreaking_force_tab: true,
            automatic_uploads: false,
            convert_urls: false,
            browser_spellcheck: true,
            contextmenu: 'undo redo | bold italic underline | link image inserttable | cell row column deletetable',
            content_style: 'body { font-family: Segoe UI, Arial, sans-serif; font-size: 14px; line-height: 1.45; } p { margin: 0 0 0.35rem; } img { max-width: 100%; height: auto; } ul.dash-list { list-style: none; padding-left: 1.2rem; } ul.dash-list > li { position: relative; } ul.dash-list > li::before { content: "- "; position: absolute; left: -1rem; }',
            setup: (editor) => {
                this.registerTinyMceFormatButtons(editor);
                editor.on('change input undo redo keyup', () => {
                    editor.save();
                });
            }
        };
    }

    async openRichTextWindow(scopeNode, fieldName, fieldLabel) {
        if (!scopeNode || !fieldName) return;
        const form = document.getElementById('object-main-form');
        if (!form) return;

        if (document.getElementById('richtext-editor-window')?.classList.contains('active')) {
            this.saveRichTextWindowContent(false);
            this.closeRichTextWindow(false);
        }

        const modal = this.ensureRichTextWindow();
        const titleNode = modal.querySelector('#richtext-editor-window-title');
        const modalTextarea = modal.querySelector('#richtext-editor-window-textarea');
        const fallbackEditor = modal.querySelector('#richtext-editor-window-fallback');
        const sourceTextarea = form.elements[fieldName];
        if (!modalTextarea || !fallbackEditor || !sourceTextarea) return;

        const initialContent = this.getRichTextFieldValue(fieldName, form) || '';
        this.richTextWindowState = {
            form,
            scopeNode,
            fieldName,
            sourceId: `field-${fieldName}`
        };

        if (titleNode) {
            titleNode.textContent = `${fieldLabel} (Richtext-editor)`;
        }

        modalTextarea.value = initialContent;
        fallbackEditor.innerHTML = initialContent;
        modal.classList.add('active');

        const tinyReady = await this.ensureTinyMceLoaded();
        if (tinyReady && window.tinymce && typeof window.tinymce.init === 'function') {
            const existingModalEditor = window.tinymce.get('richtext-editor-window-textarea');
            if (existingModalEditor) existingModalEditor.remove();

            fallbackEditor.style.display = 'none';
            modalTextarea.style.display = 'block';

            // Initialize only after modal is visible, otherwise TinyMCE can render toolbar without edit area.
            await new Promise(resolve => requestAnimationFrame(resolve));
            await window.tinymce.init(this.buildWindowTinyMceConfig(modalTextarea));

            const modalEditor = window.tinymce.get('richtext-editor-window-textarea');
            if (modalEditor) {
                modalEditor.setContent(initialContent, { format: 'html' });
            }
        } else {
            modalTextarea.style.display = 'none';
            fallbackEditor.style.display = 'block';
        }
    }

    saveRichTextWindowContent(showSavedToast = false) {
        if (!this.richTextWindowState) return;
        const { form, fieldName, sourceId } = this.richTextWindowState;
        const sourceTextarea = form?.elements?.[fieldName];
        if (!sourceTextarea) return;

        const modalEditor = window.tinymce && typeof window.tinymce.get === 'function'
            ? window.tinymce.get('richtext-editor-window-textarea')
            : null;
        const modalFallback = document.getElementById('richtext-editor-window-fallback');

        let content = '';
        if (modalEditor && typeof modalEditor.getContent === 'function') {
            content = modalEditor.getContent({ format: 'html' }) || '';
        } else if (modalFallback) {
            content = modalFallback.innerHTML || '';
        }

        const cleanHtml = sanitizeRichTextHtml(content);
        sourceTextarea.value = cleanHtml;

        const sourceTiny = window.tinymce && typeof window.tinymce.get === 'function'
            ? window.tinymce.get(sourceId)
            : null;
        if (sourceTiny && typeof sourceTiny.setContent === 'function') {
            sourceTiny.setContent(cleanHtml, { format: 'html' });
            sourceTiny.save();
        }

        const sourceFallback = form.querySelector(`[data-richtext-fallback-editor-for="${CSS.escape(sourceId)}"]`);
        if (sourceFallback) {
            sourceFallback.innerHTML = cleanHtml;
            this.syncFallbackRichTextEditor(sourceFallback, sourceTextarea);
        }

        if (showSavedToast) {
            showToast('Text sparad i formuläret', 'success');
        }
    }

    closeRichTextWindow(saveBack = true) {
        if (saveBack) {
            this.saveRichTextWindowContent(false);
        }

        const modalEditor = window.tinymce && typeof window.tinymce.get === 'function'
            ? window.tinymce.get('richtext-editor-window-textarea')
            : null;
        if (modalEditor && typeof modalEditor.remove === 'function') {
            modalEditor.remove();
        }

        const modal = document.getElementById('richtext-editor-window');
        if (!modal) return;
        modal.classList.remove('active');
    }

    initializeFallbackRichTextEditors(scopeNode, textareas) {
        const insertSanitizedHtml = (editor, html, textarea) => {
            const sanitized = sanitizeRichTextHtml(html);
            if (!sanitized) return;
            editor.focus();
            document.execCommand('insertHTML', false, sanitized);
            this.syncFallbackRichTextEditor(editor, textarea);
        };

        textareas.forEach(textarea => {
            const fieldId = textarea.id;
            const fallback = scopeNode.querySelector(`[data-richtext-fallback-for="${CSS.escape(fieldId)}"]`);
            const editor = fallback?.querySelector(`[data-richtext-fallback-editor-for="${CSS.escape(fieldId)}"]`);
            if (!fallback || !editor) return;

            textarea.style.display = 'none';
            fallback.style.display = 'block';

            const initial = sanitizeRichTextHtml(textarea.value || '');
            editor.innerHTML = initial;
            textarea.value = initial;

            editor.addEventListener('input', () => this.syncFallbackRichTextEditor(editor, textarea));
            editor.addEventListener('blur', () => this.syncFallbackRichTextEditor(editor, textarea));
            editor.addEventListener('keydown', (event) => {
                if (event.key !== 'Tab') return;
                event.preventDefault();
                document.execCommand('insertHTML', false, '&nbsp;&nbsp;&nbsp;&nbsp;');
                this.syncFallbackRichTextEditor(editor, textarea);
            });
            editor.addEventListener('paste', (event) => {
                event.preventDefault();
                const html = event.clipboardData?.getData('text/html');
                const plain = event.clipboardData?.getData('text/plain');
                if (html) {
                    insertSanitizedHtml(editor, html, textarea);
                } else if (plain) {
                    const escaped = escapeHtml(plain).replace(/\n/g, '<br>');
                    insertSanitizedHtml(editor, escaped, textarea);
                }
            });

            fallback.querySelectorAll('[data-editor-command]').forEach(button => {
                button.addEventListener('click', () => {
                    editor.focus();
                    document.execCommand(button.dataset.editorCommand, false, null);
                    this.syncFallbackRichTextEditor(editor, textarea);
                });
            });

            fallback.querySelectorAll('[data-editor-action="insertTab"]').forEach(button => {
                button.addEventListener('click', () => {
                    editor.focus();
                    document.execCommand('insertHTML', false, '&nbsp;&nbsp;&nbsp;&nbsp;');
                    this.syncFallbackRichTextEditor(editor, textarea);
                });
            });

            fallback.querySelectorAll('[data-editor-action="insertImageUrl"]').forEach(button => {
                button.addEventListener('click', () => {
                    const src = prompt('Ange bild-URL (https://...)');
                    if (!src) return;
                    const safeSrc = String(src).trim();
                    if (!/^(https?:|\/|data:image\/(?:png|jpeg|jpg|gif|webp);base64,)/i.test(safeSrc)) {
                        showToast('Ogiltig bild-URL', 'error');
                        return;
                    }
                    insertSanitizedHtml(editor, `<img src="${escapeHtml(safeSrc)}" alt="Infogad bild" style="max-width: 100%; height: auto;">`, textarea);
                });
            });

            fallback.querySelectorAll('[data-editor-action="toggleDashList"]').forEach(button => {
                button.addEventListener('click', () => {
                    this.toggleFallbackDashList(editor);
                    this.syncFallbackRichTextEditor(editor, textarea);
                });
            });

            fallback.querySelectorAll('[data-editor-action="copyFormat"]').forEach(button => {
                button.addEventListener('click', () => {
                    const copiedFormat = this.captureFallbackFormat(editor);
                    if (!copiedFormat) {
                        showToast('Markera text med format att kopiera först', 'warning');
                        return;
                    }
                    this.richTextCopiedFormat = copiedFormat;
                    this.updateRichTextApplyButtonState();
                    showToast('Formatering kopierad', 'success');
                });
            });

            fallback.querySelectorAll('[data-editor-action="applyFormat"]').forEach(button => {
                button.disabled = !this.richTextCopiedFormat;
                button.addEventListener('click', () => {
                    if (!this.richTextCopiedFormat) {
                        showToast('Kopiera format först', 'warning');
                        return;
                    }
                    this.applyFallbackFormat(editor, this.richTextCopiedFormat);
                    this.syncFallbackRichTextEditor(editor, textarea);
                });
            });
        });
    }

    syncFallbackRichTextEditor(editor, textarea) {
        if (!editor || !textarea) return;
        const cleanHtml = sanitizeRichTextHtml(editor.innerHTML);
        textarea.value = cleanHtml;
        if (editor.innerHTML !== cleanHtml) {
            editor.innerHTML = cleanHtml;
        }
    }

    getRichTextFieldValue(fieldName, form) {
        if (!fieldName || !form) return null;

        const textareaId = `field-${fieldName}`;
        const tinyEditor = window.tinymce && typeof window.tinymce.get === 'function'
            ? window.tinymce.get(textareaId)
            : null;

        if (tinyEditor && typeof tinyEditor.getContent === 'function') {
            const content = tinyEditor.getContent({ format: 'html' }) || '';
            return sanitizeRichTextHtml(content);
        }

        const fallbackEditor = form.querySelector(`[data-richtext-fallback-editor-for="${CSS.escape(textareaId)}"]`);
        if (fallbackEditor) {
            return sanitizeRichTextHtml(fallbackEditor.innerHTML || '');
        }

        const input = form.elements[fieldName];
        if (!input) return null;
        return sanitizeRichTextHtml(input.value || '');
    }

    syncRichTextEditors(scopeNode = null) {
        if (this.richTextWindowState && document.getElementById('richtext-editor-window')?.classList.contains('active')) {
            this.saveRichTextWindowContent(false);
        }

        const root = scopeNode || document;

        root.querySelectorAll('[data-richtext-fallback-editor-for]').forEach(editor => {
            const fieldId = editor.dataset.richtextFallbackEditorFor;
            const textarea = root.querySelector(`#${CSS.escape(fieldId)}`);
            if (!textarea) return;
            this.syncFallbackRichTextEditor(editor, textarea);
        });

        if (!window.tinymce || !Array.isArray(window.tinymce.editors)) return;
        window.tinymce.editors.forEach(editor => {
            const element = editor?.getElement?.();
            if (!element) return;
            if (scopeNode && !scopeNode.contains(element)) return;
            editor.save();
            element.value = sanitizeRichTextHtml(element.value || '');
        });
    }
    
    renderMetadataFields() {
        const statusValue = this.existingObject?.status || 'In work';
        const versionValue = this.existingObject?.version || '001';
        const mainIdValue = this.existingObject?.main_id || '';
        const isEditLikeMode = Boolean(this.existingObject?.id);
        
        return `
            <div class="form-section form-section-full">
                <h4>Metadata</h4>
                <div class="metadata-grid">
                    <div class="form-group form-group-compact">
                        <label for="field-status">Status *</label>
                        <select id="field-status" name="status" class="form-control" required>
                            <option value="In work" ${statusValue === 'In work' ? 'selected' : ''}>In work</option>
                            <option value="Released" ${statusValue === 'Released' ? 'selected' : ''}>Released</option>
                            <option value="Obsolete" ${statusValue === 'Obsolete' ? 'selected' : ''}>Obsolete</option>
                            <option value="Canceled" ${statusValue === 'Canceled' ? 'selected' : ''}>Canceled</option>
                        </select>
                    </div>
                    ${!isEditLikeMode ? `
                        <div class="form-group form-group-compact">
                            <label for="field-version">Version</label>
                            <input type="text" 
                                   id="field-version" 
                                   name="version"
                                   value="${escapeHtml(versionValue)}"
                                   class="form-control"
                                   readonly>
                            <small class="form-help">Version is automatically updated</small>
                        </div>
                        <div class="form-group form-group-compact">
                            <label for="field-main_id">MainID</label>
                            <input type="text" 
                                   id="field-main_id" 
                                   name="main_id"
                                   value="${escapeHtml(mainIdValue)}"
                                   class="form-control"
                                   readonly>
                            <small class="form-help">MainID is automatically generated on creation</small>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    }
    
    parseOptions(optionsString) {
        if (!optionsString) return [];
        
        // If it's already an array, return it directly
        if (Array.isArray(optionsString)) {
            return optionsString;
        }
        
        // If it's an object (but not an array), try to extract values
        if (typeof optionsString === 'object') {
            // Dynamic option source is handled separately in getSelectOptions.
            if (optionsString.source) {
                return Array.isArray(optionsString.values) ? optionsString.values : [];
            }
            // If it has a values property that's an array, use that
            if (Array.isArray(optionsString.values)) {
                return optionsString.values;
            }
            // Otherwise, try to get Object.values
            return Object.values(optionsString).filter(v => v !== null && v !== undefined);
        }
        
        // If it's a string, try parsing or splitting
        if (typeof optionsString === 'string') {
            try {
                // Try parsing as JSON array first
                const parsed = JSON.parse(optionsString);
                if (Array.isArray(parsed)) {
                    return parsed;
                }
                // If parsed as object, return its values
                if (typeof parsed === 'object') {
                    return Object.values(parsed).filter(v => v !== null && v !== undefined);
                }
            } catch {
                // Fall back to comma-separated
                return optionsString.split(',').map(s => s.trim()).filter(s => s);
            }
        }
        
        return [];
    }

    normalizeFieldOptions(options) {
        if (!options) return null;
        if (typeof options === 'object') return options;
        if (typeof options !== 'string') return null;
        try {
            return JSON.parse(options);
        } catch (_error) {
            return null;
        }
    }

    getSelectOptions(field) {
        const normalizedOptions = this.normalizeFieldOptions(field.field_options || field.options);
        if (normalizedOptions?.source === 'building_part_categories') {
            return (this.buildingPartCategories || []).map(category => category.name).filter(Boolean);
        }
        if (normalizedOptions?.source === 'managed_list') {
            const listId = Number(normalizedOptions?.list_id);
            if (!Number.isFinite(listId) || listId <= 0) return [];
            return this.managedListValues[listId] || [];
        }
        return this.parseOptions(field.field_options || field.options);
    }
    
    getFormData() {
        // Get the parent form (object-main-form) which contains all fields
        const form = document.getElementById('object-main-form');
        if (!form) return null;
        this.syncRichTextEditors(form);
        
        const data = {};
        
        // Get metadata fields
        const statusInput = form.elements['status'];
        if (statusInput) {
            data.status = statusInput.value;
        }
        
        const versionInput = form.elements['version'];
        if (versionInput) {
            data.version = versionInput.value;
        }
        
        const mainIdInput = form.elements['main_id'];
        if (mainIdInput && mainIdInput.value) {
            data.main_id = mainIdInput.value;
        }
        
        // Get dynamic fields
        this.fields.forEach(field => {
            const input = form.elements[field.field_name];
            if (!input) return;
            
            let value;
            
            if (field.field_type === 'boolean') {
                value = input.checked;
            } else if (field.field_type === 'number' || field.field_type === 'decimal') {
                value = input.value ? parseFloat(input.value) : null;
            } else if (field.field_type === 'richtext') {
                const richValue = this.getRichTextFieldValue(field.field_name, form);
                value = richValue ? richValue : null;
            } else {
                value = input.value || null;
            }
            
            data[field.field_name] = value;
        });
        
        return data;
    }
    
    validate() {
        // Get the parent form (object-main-form) which contains all fields
        const form = document.getElementById('object-main-form');
        if (!form) {
            console.error('Validation failed: form element not found');
            return false;
        }
        this.syncRichTextEditors(form);
        
        // Check if fields are loaded
        if (!this.fields || this.fields.length === 0) {
            console.error('Validation failed: no fields defined');
            return false;
        }
        
        // Check if all required fields have values
        let isValid = true;
        const missingFields = [];
        
        this.fields.forEach(field => {
            if (!field.is_required) return;
            
            const input = form.elements[field.field_name];
            if (!input) {
                isValid = false;
                missingFields.push({
                    name: field.display_name || field.field_name,
                    type: field.field_type,
                    value: null,
                    reason: 'Element not found in form'
                });
                console.warn(`Required field not found in form: ${field.field_name}`);
                return;
            }
            
            if (field.field_type === 'boolean') {
                // Boolean fields don't need to be checked (checkbox can be unchecked)
                return;
            }
            
            const value = field.field_type === 'richtext'
                ? this.getRichTextFieldValue(field.field_name, form)
                : input.value;
            const comparableValue = field.field_type === 'richtext'
                ? stripHtmlTags(value || '')
                : value;
            // Check for empty values (covers both empty strings and whitespace)
            // For text-based inputs, also check trimmed value to catch whitespace-only entries
            if (comparableValue === null || comparableValue === undefined || (typeof comparableValue === 'string' && comparableValue.trim() === '')) {
                isValid = false;
                missingFields.push({
                    name: field.display_name || field.field_name,
                    type: field.field_type,
                    value: comparableValue
                });
                // Add error styling
                input.classList.add('error');
            } else {
                // Remove error styling
                input.classList.remove('error');
            }
        });
        
        if (!isValid && missingFields.length > 0) {
            console.warn('Form validation failed. Missing or empty required fields:', missingFields);
            console.warn('Please ensure all fields marked with * are filled in:');
            missingFields.forEach(field => {
                if (field.reason) {
                    console.warn(`  - ${field.name}: ${field.reason}`);
                } else {
                    console.warn(`  - ${field.name} (${field.type}): current value = "${field.value}"`);
                }
            });
        }
        
        return isValid;
    }
}

// Helper function to format date for input
function formatDateForInput(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toISOString().split('T')[0];
}

// Helper function to format datetime for input
function formatDateTimeForInput(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toISOString().slice(0, 16);
}
