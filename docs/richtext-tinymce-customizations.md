# Richtext / TinyMCE Customizations

Detta dokument beskriver hur richtext-lösningen i projektet är uppbyggd och vilka anpassningar som har gjorts runt TinyMCE. Syftet är att en annan AI eller utvecklare ska kunna återskapa lösningen utan att behöva läsa hela implementationen först.

## Översikt

Projektet använder inte TinyMCE som en isolerad standardeditor. Lösningen består av tre lager:

1. `ObjectFormComponent` renderar och initierar richtextfält.
2. TinyMCE används som primär editor när biblioteket finns tillgängligt.
3. En egen fallback-editor med `contenteditable` används när TinyMCE inte kan laddas.

Dessutom passerar innehållet genom en egen HTML-sanering innan det sparas eller visas.

## Primära filer

- [static/js/components/object-form.js](/workspaces/Byggdelsuppdelning---DEMO/static/js/components/object-form.js)
- [static/js/utils.js](/workspaces/Byggdelsuppdelning---DEMO/static/js/utils.js)
- [static/js/components/object-detail-panel.js](/workspaces/Byggdelsuppdelning---DEMO/static/js/components/object-detail-panel.js)
- [templates/index.html](/workspaces/Byggdelsuppdelning---DEMO/templates/index.html)

## Datamodell

Richtext är en vanlig fälttyp i objektmodellen:

- fälttyp: `richtext`
- värdet lagras som HTML-sträng
- HTML saneras innan den sparas tillbaka till formulärfältet

Det finns ingen separat richtext-tabell eller separat dokumentmodell för editorns innehåll.

## Rendering i formuläret

Richtextfält renderas i `renderField(field)` i [static/js/components/object-form.js](/workspaces/Byggdelsuppdelning---DEMO/static/js/components/object-form.js).

När `field.field_type === 'richtext'` renderas tre delar:

1. En knapp för att öppna editorn i separat fönster
2. En dold/underliggande `textarea`
3. En fallback-editor (`contenteditable`) som visas om TinyMCE saknas

Viktiga egenskaper:

- `textarea.rich-text-textarea[data-richtext="true"]` används som initieringsmarkör
- innehållet försaneras med `sanitizeRichTextHtml(value)`
- fallback-editorn får samma initiala HTML som `textarea`

## TinyMCE som primär editor

Initiering sker i `initializeRichTextEditors(scopeNode)` i [static/js/components/object-form.js](/workspaces/Byggdelsuppdelning---DEMO/static/js/components/object-form.js).

### Nuvarande beteende

- TinyMCE laddas dynamiskt om den inte redan finns i `window.tinymce`
- flera lokala/CDN-kandidater provas i `ensureTinyMceLoaded()`
- varje richtext-`textarea` initieras separat
- om TinyMCE inte kan laddas används fallback-editorn

### TinyMCE-konfiguration som ska återskapas

Primär editor använder bland annat:

- `menubar: 'file edit view insert format tools table help'`
- `branding: false`
- `promotion: false`
- `statusbar: true`
- `plugins: 'advlist autolink lists link image charmap preview anchor searchreplace visualblocks code fullscreen insertdatetime media table help wordcount paste autoresize nonbreaking'`
- `toolbar: 'undo redo | blocks fontfamily fontsize | bold italic underline strikethrough | forecolor backcolor | alignleft aligncenter alignright alignjustify | bullist numlist dashlist outdent indent | link image media table | copyformat applyformat removeformat code fullscreen'`
- `toolbar_mode: 'sliding'`
- `paste_data_images: true`
- `paste_as_text: false`
- `paste_remove_styles_if_webkit: false`
- `paste_webkit_styles: 'all'`
- `paste_merge_formats: true`
- `paste_retain_style_properties: 'font-family font-size font-weight font-style text-decoration color background-color'`
- `valid_styles` för att tillåta font, färg, alignment, spacing och list-styles
- `nonbreaking_force_tab: true`
- `automatic_uploads: false`
- `convert_urls: false`
- `browser_spellcheck: true`

### Editorstandard för Word-lik text

För att matcha Word-dokument bättre har editorn fått en standard som ligger närmare moderna Word-dokument:

- standardfont: `Aptos`
- standardstorlek: `12pt`
- fontlista innehåller `Aptos` och `Aptos Display`
- storlekslista innehåller bland annat `12pt` och `13pt`

Detta sätts via:

- `font_family_formats`
- `font_size_formats`
- `content_style`

## Separat richtext-fönster

Projektet har en egen modal för större redigering i stället för att enbart använda inline-editorn.

Detta implementeras i:

- `bindRichTextWindowButtons(scopeNode)`
- `ensureRichTextWindow()`
- `buildWindowTinyMceConfig(textareaElement)`
- `openRichTextWindow(scopeNode, fieldName, fieldLabel)`
- `saveRichTextWindowContent(showSavedToast)`
- `closeRichTextWindow(saveBack)`

### Beteende

- knappen `Öppna i fönster` öppnar aktuell richtext i en modal
- modalen använder egen TinyMCE-instans när möjligt
- annars används en enkel fallback `contenteditable`
- innehållet synkas tillbaka till ursprungsfältet när modalen sparas eller stängs

Detta är en viktig del av lösningen. En AI som ska återskapa systemet ska inte anta att endast inline-TinyMCE används.

## Egen fallback-editor

Fallback-logik finns i `initializeFallbackRichTextEditors(scopeNode, textareas)` i [static/js/components/object-form.js](/workspaces/Byggdelsuppdelning---DEMO/static/js/components/object-form.js).

Fallback-editorn använder:

- `contenteditable`
- `document.execCommand(...)`
- en enkel toolbar med egna knappar

Funktioner i fallback:

- fet
- kursiv
- understruken
- punktlista
- numrerad lista
- egen strecklista
- indent / outdent
- tabbinsättning
- bild via URL
- kopiera format
- applicera format
- rensa format

Paste i fallback fångas manuellt:

- om `text/html` finns används den
- annars används `text/plain`
- innehållet saneras med `sanitizeRichTextHtml()` före infogning

## Egen TinyMCE-toolbar

TinyMCE har utökats med tre egna knappar i `registerTinyMceFormatButtons(editor)`:

- `dashlist`
- `copyformat`
- `applyformat`

### `dashlist`

Detta är en projektanpassad variant av lista som använder CSS-klassen `dash-list` på `ul`.

Implementation:

- TinyMCE: `toggleTinyMceDashList(editor)`
- fallback: `toggleFallbackDashList(editor)`

### `copyformat` och `applyformat`

Projektet har en egen funktion för formatpensel-liknande beteende.

Relevanta metoder:

- `captureTinyMceFormat(editor)`
- `applyTinyMceFormat(editor, copiedFormat)`
- `captureFallbackFormat(editor)`
- `applyFallbackFormat(editor, copiedFormat)`
- `updateRichTextApplyButtonState()`

Format som fångas:

- bold
- italic
- underline
- strikethrough
- textfärg
- bakgrundsfärg
- font family
- font size

Observera att detta inte är TinyMCE:s inbyggda “format painter”, utan en egen implementation ovanpå editorn.

## HTML-sanering

All richtext passerar genom `sanitizeRichTextHtml(html)` i [static/js/utils.js](/workspaces/Byggdelsuppdelning---DEMO/static/js/utils.js).

Detta är en central del av lösningen. Om en AI ska återskapa editorn men missar saneringen kommer resultatet inte bete sig likadant.

### Syfte

- tillåta användbar formatering från Word och manuellt arbete
- skydda mot osäkra attribut/taggar
- normalisera innehåll före lagring och visning

### Tillåtna taggar

Exempel på tillåtna taggar:

- `p`, `div`, `span`, `br`
- `strong`, `b`, `em`, `i`, `u`
- `s`, `strike`, `mark`
- `ul`, `ol`, `li`
- `h1` till `h6`
- `blockquote`
- `a`
- `img`
- `table`, `thead`, `tbody`, `tfoot`, `tr`, `td`, `th`, `caption`, `colgroup`, `col`
- `hr`, `sup`, `sub`, `pre`, `code`

### Tillåtna attribut och styles

Saneringen tillåter ett begränsat urval av attribut per tagg, bland annat:

- `href`, `target`, `rel` på länkar
- `src`, `alt`, `title`, `style` på bilder
- `style` på flera block- och inlineelement
- `class` på `ul`, men bara säkra klasser

Tillåtna CSS-egenskaper inkluderar bland annat:

- `font-family`
- `font-size`
- `font-weight`
- `font-style`
- `text-decoration*`
- `color`
- `background-color`
- `text-align`
- `text-indent`
- `line-height`
- `margin*`
- `padding*`
- `list-style-type`
- `list-style-position`
- tabell/border-egenskaper

### Word-specifika justeringar

Saneringen är lättad för att behålla mer Word-format än en strikt minimal sanitizer:

- fler blockstilar tillåts
- fler liststilar tillåts
- `Mso...`-klasser på `ul` får överleva
- extrema spacing-värden filtreras bort för att undvika trasig layout

Detta är en medveten kompromiss mellan fidelity och säkerhet/renhet.

## Synk mellan editor och lagrat värde

Systemet sparar inte TinyMCE:s råa innehåll rakt av.

I stället sker typiskt följande:

1. användaren redigerar i TinyMCE eller fallback
2. `editor.save()` eller fallback-sync körs
3. HTML saneras med `sanitizeRichTextHtml()`
4. det sanerade värdet skrivs tillbaka till `textarea`

Detta sker bland annat i:

- `initializeRichTextEditors(...)`
- `saveRichTextWindowContent(...)`
- `syncFallbackRichTextEditor(...)`
- `getRichTextFieldValue(...)`
- `syncRichTextEditors(...)`

## Visning i detaljpanelen

Richtext visas inte bara som vanlig HTML i detaljpanelen.

I [static/js/components/object-detail-panel.js](/workspaces/Byggdelsuppdelning---DEMO/static/js/components/object-detail-panel.js):

- richtext identifieras explicit eller heuristiskt via HTML-innehåll
- en förhandsvisning visas i detaljpanelen
- innehållet kan öppnas i separat viewer-modal
- även där saneras HTML igen före visning

Det betyder att lösningen har både:

- editormodal för redigering
- viewermodal för läsning

## Viktiga designbeslut

En AI som ska återskapa lösningen bör följa dessa principer:

1. Bygg richtext som en del av formulärsystemet, inte som en separat fristående komponent först.
2. Behåll en dold `textarea` som sanningskälla för submit/sparflöde.
3. Lägg saneringen i ett gemensamt utility-lager.
4. Ha fallback när TinyMCE inte kan laddas.
5. Stöd både inline-redigering och “öppna i fönster”.
6. Lägg projektunika formatknappar ovanpå TinyMCE i stället för att modifiera TinyMCE:s källkod.

## Det som inte är moddat

Följande är viktigt att förstå:

- TinyMCE:s egna källfiler under `static/vendor/tinymce/` är inte modifierade
- anpassningen ligger i integrationen runt TinyMCE
- projektet använder TinyMCE 7.9.2 som vendorad dependency

## Kända risker och begränsningar

- Word-paste är fortfarande känsligt eftersom Word ofta använder tema-/klassbaserad styling
- `document.execCommand()` i fallback-editorn är gammal web-API men används här för enkelhet
- saneringen är medvetet mer tillåtande än en mycket strikt sanitizer, vilket kräver fortsatt vaksamhet
- editorns upplevelse styrs både av TinyMCE-konfiguration och av efterföljande sanering; båda måste återskapas

## Minsta checklista för att återskapa lösningen

Om en AI ska bygga samma lösning i ett nytt projekt bör den minst återskapa:

1. Ett metadata-drivet richtextfält som renderar `textarea + open-in-window + fallback`.
2. Dynamisk TinyMCE-laddning med fallback till `contenteditable`.
3. TinyMCE-toolbar med `dashlist`, `copyformat`, `applyformat`.
4. Word-vänlig TinyMCE-konfiguration med `Aptos`, `12pt`, paste-style retention och tillåtna `valid_styles`.
5. En central `sanitizeRichTextHtml()` med samma tillåtna taggar, attribut och CSS-regler.
6. Synklogik som alltid skriver tillbaka sanerad HTML till `textarea`.
7. En separat viewer-modal för att läsa richtext i detaljpanelen.

