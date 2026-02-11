-- migration.sql
-- Syfte: migrera felaktigt filägarskap till filobjekt och skapa spårbara länkar.
-- Antagande: PostgreSQL.
-- Kör i transaktion och verifiera audit-utdata före COMMIT.

BEGIN;

-- =====================================================
-- A) AUDIT (för rapportering före migrering)
-- =====================================================

-- 1) Dokument med ägare som inte är Filobjekt/Ritningsobjekt
SELECT
  d.id AS document_id,
  d.object_id AS current_owner_object_id,
  ot.name AS current_owner_type,
  d.original_filename,
  d.filename
FROM documents d
JOIN objects o ON o.id = d.object_id
JOIN object_types ot ON ot.id = o.object_type_id
WHERE lower(ot.name) NOT IN ('filobjekt', 'ritningsobjekt')
ORDER BY d.id;

-- 2) Dokument med ogiltig/saknad ägare (om FK historiskt varit avstängd)
SELECT d.id AS document_id, d.object_id AS broken_owner_id
FROM documents d
LEFT JOIN objects o ON o.id = d.object_id
WHERE o.id IS NULL;

-- 3) Relationer av typ 'dokumenterar' som inte inkluderar filobjekt på någon sida
SELECT
  r.id,
  r.source_object_id,
  so_t.name AS source_type,
  r.target_object_id,
  to_t.name AS target_type,
  r.relation_type
FROM object_relations r
JOIN objects so ON so.id = r.source_object_id
JOIN object_types so_t ON so_t.id = so.object_type_id
JOIN objects to_o ON to_o.id = r.target_object_id
JOIN object_types to_t ON to_t.id = to_o.object_type_id
WHERE lower(r.relation_type) = 'dokumenterar'
  AND lower(so_t.name) NOT IN ('filobjekt', 'ritningsobjekt')
  AND lower(to_t.name) NOT IN ('filobjekt', 'ritningsobjekt');

-- =====================================================
-- B) CANONICAL NAMN: Ritningsobjekt -> Filobjekt
-- =====================================================

UPDATE object_types
SET name = 'Filobjekt',
    description = COALESCE(description, 'Filer och dokument')
WHERE lower(name) = 'ritningsobjekt';

-- Om Filobjekt saknas helt, skapa typen (fält kan justeras enligt behov)
INSERT INTO object_types (name, description, icon, created_at, is_system)
SELECT 'Filobjekt', 'Filer och dokument', 'fa-file', NOW(), TRUE
WHERE NOT EXISTS (
  SELECT 1 FROM object_types WHERE lower(name) = 'filobjekt'
);

-- =====================================================
-- C) PREP: lägg till ny kolumn filobjekt_id om den saknas
-- =====================================================

ALTER TABLE documents
ADD COLUMN IF NOT EXISTS filobjekt_id INTEGER;

-- Synka initialt från gammal kolumn
UPDATE documents
SET filobjekt_id = object_id
WHERE filobjekt_id IS NULL;

-- =====================================================
-- D) MIGRERA felaktiga dokument till ny- eller återanvända filobjekt
-- Strategi här: ett nytt filobjekt per dokument för maximal spårbarhet.
-- =====================================================

-- Hämta filobjekttyp-id
WITH filobjekt_type AS (
  SELECT id FROM object_types WHERE lower(name) = 'filobjekt' LIMIT 1
),
invalid_docs AS (
  SELECT
    d.id AS document_id,
    d.object_id AS old_owner_id,
    d.original_filename,
    d.filename,
    d.uploaded_by,
    o.created_by
  FROM documents d
  JOIN objects o ON o.id = d.object_id
  JOIN object_types ot ON ot.id = o.object_type_id
  WHERE lower(ot.name) <> 'filobjekt'
),
created_file_objects AS (
  INSERT INTO objects (
    object_type_id,
    auto_id,
    created_at,
    updated_at,
    created_by,
    status,
    version,
    main_id,
    id_full
  )
  SELECT
    ft.id,
    CONCAT('FIL-MIG-', lpad(idv.document_id::text, 8, '0')),
    NOW(),
    NOW(),
    COALESCE(idv.uploaded_by, idv.created_by, 'migration'),
    'Released',
    '001',
    CONCAT('FIL-MIG-', lpad(idv.document_id::text, 8, '0')),
    CONCAT('FIL-MIG-', lpad(idv.document_id::text, 8, '0'), '.001')
  FROM invalid_docs idv
  CROSS JOIN filobjekt_type ft
  RETURNING id, auto_id
),
mapping AS (
  SELECT
    idv.document_id,
    idv.old_owner_id,
    cfo.id AS new_filobjekt_id
  FROM invalid_docs idv
  JOIN created_file_objects cfo
    ON cfo.auto_id = CONCAT('FIL-MIG-', lpad(idv.document_id::text, 8, '0'))
)
-- 1) Flytta dokumentägarskap
UPDATE documents d
SET filobjekt_id = m.new_filobjekt_id
FROM mapping m
WHERE d.id = m.document_id;

-- 2) Skapa spårbar länk från tidigare ägare till nytt filobjekt
WITH mapping AS (
  SELECT
    d.id AS document_id,
    d.object_id AS old_owner_id,
    d.filobjekt_id AS new_filobjekt_id
  FROM documents d
  JOIN objects fo ON fo.id = d.filobjekt_id
  JOIN object_types fot ON fot.id = fo.object_type_id
  WHERE lower(fot.name) = 'filobjekt'
)
INSERT INTO object_relations (
  source_object_id,
  target_object_id,
  relation_type,
  description,
  relation_metadata,
  created_at
)
SELECT
  m.old_owner_id,
  m.new_filobjekt_id,
  'dokumenterar',
  CONCAT('Migrerad länk för dokument-id ', m.document_id),
  jsonb_build_object('migrated', true, 'document_id', m.document_id),
  NOW()
FROM mapping m
WHERE m.old_owner_id <> m.new_filobjekt_id
  AND NOT EXISTS (
    SELECT 1
    FROM object_relations r
    WHERE r.source_object_id = m.old_owner_id
      AND r.target_object_id = m.new_filobjekt_id
      AND lower(r.relation_type) = 'dokumenterar'
  );

-- =====================================================
-- E) Slutlig synk: deprecate object_id (hanteras i ddl_changes.sql)
-- =====================================================

-- Valfri kontrollrapport efter migrering
SELECT
  d.id,
  d.object_id AS old_owner,
  d.filobjekt_id,
  ot.name AS filobjekt_type
FROM documents d
JOIN objects o ON o.id = d.filobjekt_id
JOIN object_types ot ON ot.id = o.object_type_id
ORDER BY d.id;

COMMIT;
