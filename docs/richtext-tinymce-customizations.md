# Richtext / TinyMCE

Det här dokumentet beskriver hur richtextfält fungerar i projektet idag.

## Översikt

Richtext är inte en fristående modul utan en del av objektformulären. Lösningen består av fyra delar:

1. formulärrendering i `ObjectFormComponent`
2. TinyMCE som primär editor när den finns tillgänglig
3. en egen fallback-editor med `contenteditable`
4. HTML-sanering före lagring och visning

## Viktiga filer

- [static/js/components/object-form.js](/workspaces/Byggdelsuppdelning---DEMO/static/js/components/object-form.js)
- [static/js/utils.js](/workspaces/Byggdelsuppdelning---DEMO/static/js/utils.js)
- [static/js/components/object-detail-panel.js](/workspaces/Byggdelsuppdelning---DEMO/static/js/components/object-detail-panel.js)
- [templates/index.html](/workspaces/Byggdelsuppdelning---DEMO/templates/index.html)

## Datamodell

Richtext är en vanlig fälttyp:

- `field_type = richtext`
- värdet lagras som HTML i objektets vanliga fältdata
- ingen separat tabell används för editorinnehåll

## Runtime-beteende

När ett richtextfält renderas skapas normalt:

- en underliggande `textarea`
- en knapp för att öppna större redigeringsfönster
- en fallback-editor om TinyMCE inte kan användas

TinyMCE laddas dynamiskt. Om den inte kan laddas fortsätter formuläret att fungera med fallback-editorn i stället för att fältet går sönder.

## TinyMCE-anpassningar

Projektet använder inte TinyMCE helt standardmässigt. Det finns egen konfiguration för bland annat:

- verktygsfält
- Word-lik standardtypografi
- listor, tabeller och media
- egna formatknappar som `dashlist`, `copyformat` och `applyformat`

Den större poängen är inte exakt varje config-flagga, utan att editorn är anpassad för att klara mer realistisk dokumenttext än ett minimalt richtextfält.

## Separat redigeringsfönster

Richtext kan öppnas i ett större modal-fönster. Det är en viktig del av användarflödet och inte bara ett komplement.

När användaren öppnar fältet i separat fönster:

- en ny editorinstans skapas för modalens innehåll
- ändringar synkas tillbaka till ursprungsfältet
- fallback används även här om TinyMCE saknas

Om man återskapar lösningen behöver man alltså stödja både inline-redigering och modalredigering.

## Fallback-editor

Fallback-läget bygger på `contenteditable` och en enkel egen toolbar. Den stöder fortfarande grundläggande formatering som:

- bold, italic, underline och strikethrough
- punktlistor, numrerade listor och dash-listor
- indent / outdent
- enkel formatkopiering
- inklistring av HTML eller plain text

Fallbacken är avsiktligt enkel men funktionell nog för att formuläret ska vara användbart utan TinyMCE.

## HTML-sanering

All richtext passerar genom `sanitizeRichTextHtml(...)` i [static/js/utils.js](/workspaces/Byggdelsuppdelning---DEMO/static/js/utils.js).

Saneringen gör tre saker:

- filtrerar bort osäkra taggar och attribut
- normaliserar innehållet före lagring
- behåller tillräckligt mycket stilinformation för att Word-lik text inte ska förstöras helt

Det är alltså inte en ultrahård sanitizer, utan en medveten kompromiss mellan säkerhet och formateringsbevarande.

## Viktigt att komma ihåg

- richtext är ett vanligt objektfält, inte ett separat subsystem
- TinyMCE är primär editor men inte ett krav för att UI:t ska fungera
- modalredigering är en del av standardflödet
- saneringen är central för att beteendet ska matcha systemet
