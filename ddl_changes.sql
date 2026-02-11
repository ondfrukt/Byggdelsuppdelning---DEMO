-- ddl_changes.sql
-- Hårda DB-regler för att säkerställa:
-- 1) endast filobjekt äger filer
-- 2) dokumentrelationer går via filobjekt

BEGIN;

-- =====================================================
-- 1) documents: object_id -> filobjekt_id
-- =====================================================

ALTER TABLE documents
ADD COLUMN IF NOT EXISTS filobjekt_id INTEGER;

-- initial backfill
UPDATE documents
SET filobjekt_id = object_id
WHERE filobjekt_id IS NULL;

ALTER TABLE documents
ALTER COLUMN filobjekt_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_documents_filobjekt'
  ) THEN
    ALTER TABLE documents
      ADD CONSTRAINT fk_documents_filobjekt
      FOREIGN KEY (filobjekt_id)
      REFERENCES objects(id)
      ON DELETE RESTRICT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_documents_filobjekt_id ON documents(filobjekt_id);
CREATE INDEX IF NOT EXISTS idx_documents_uploaded_at ON documents(uploaded_at);

-- =====================================================
-- 2) Trigger: documents.filobjekt_id måste peka på objekttyp Filobjekt
-- =====================================================

CREATE OR REPLACE FUNCTION validate_document_owner_is_filobjekt()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  owner_type_name text;
BEGIN
  SELECT ot.name
    INTO owner_type_name
  FROM objects o
  JOIN object_types ot ON ot.id = o.object_type_id
  WHERE o.id = NEW.filobjekt_id;

  IF owner_type_name IS NULL THEN
    RAISE EXCEPTION 'Invalid filobjekt_id: % (object saknas)', NEW.filobjekt_id;
  END IF;

  IF lower(owner_type_name) <> 'filobjekt' THEN
    RAISE EXCEPTION 'Only Filobjekt can own files. owner_type=%', owner_type_name;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_document_owner_is_filobjekt ON documents;
CREATE TRIGGER trg_validate_document_owner_is_filobjekt
BEFORE INSERT OR UPDATE OF filobjekt_id
ON documents
FOR EACH ROW
EXECUTE FUNCTION validate_document_owner_is_filobjekt();

-- =====================================================
-- 3) object_relations: enforce relation_type='dokumenterar'
--    => exakt en sida måste vara Filobjekt
-- =====================================================

CREATE OR REPLACE FUNCTION validate_dokumenterar_relation_shape()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  source_type text;
  target_type text;
  source_is_file boolean;
  target_is_file boolean;
BEGIN
  IF lower(COALESCE(NEW.relation_type, '')) <> 'dokumenterar' THEN
    RETURN NEW;
  END IF;

  SELECT ot.name INTO source_type
  FROM objects o
  JOIN object_types ot ON ot.id = o.object_type_id
  WHERE o.id = NEW.source_object_id;

  SELECT ot.name INTO target_type
  FROM objects o
  JOIN object_types ot ON ot.id = o.object_type_id
  WHERE o.id = NEW.target_object_id;

  IF source_type IS NULL OR target_type IS NULL THEN
    RAISE EXCEPTION 'dokumenterar relation requires valid objects';
  END IF;

  source_is_file := lower(source_type) = 'filobjekt';
  target_is_file := lower(target_type) = 'filobjekt';

  IF source_is_file = target_is_file THEN
    RAISE EXCEPTION 'dokumenterar relation must connect exactly one Filobjekt and one non-Filobjekt';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_dokumenterar_relation_shape ON object_relations;
CREATE TRIGGER trg_validate_dokumenterar_relation_shape
BEFORE INSERT OR UPDATE OF source_object_id, target_object_id, relation_type
ON object_relations
FOR EACH ROW
EXECUTE FUNCTION validate_dokumenterar_relation_shape();

CREATE INDEX IF NOT EXISTS idx_object_relations_relation_type_source_target
  ON object_relations(relation_type, source_object_id, target_object_id);

-- =====================================================
-- 4) (Valfri men rekommenderad) teknisk typkod
-- =====================================================

ALTER TABLE object_types
ADD COLUMN IF NOT EXISTS code VARCHAR(50);

UPDATE object_types
SET code = 'FILE_OBJECT'
WHERE lower(name) = 'filobjekt'
  AND (code IS NULL OR code = '');

CREATE UNIQUE INDEX IF NOT EXISTS ux_object_types_code_not_null
ON object_types(code)
WHERE code IS NOT NULL;

-- =====================================================
-- 5) Deprecated cleanup (kör när applikation är uppdaterad)
-- =====================================================
-- ALTER TABLE documents DROP COLUMN object_id;

COMMIT;
