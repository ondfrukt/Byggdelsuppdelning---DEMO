-- Rensar kategorikopplingar för alla Assembly-, Space- och System-objekt.
-- Kör mot plm.db med: sqlite3 plm.db < scripts/clear_category_assignments.sql

-- Radera kategoritilldelningar
DELETE FROM object_category_assignments
WHERE object_id IN (
    SELECT o.id FROM objects o
    JOIN object_types ot ON ot.id = o.object_type_id
    WHERE ot.name IN ('Assembly', 'Space', 'System')
);

-- Rensa fältvärden av typ category_node
UPDATE object_data
SET value_text = NULL
WHERE object_id IN (
    SELECT o.id FROM objects o
    JOIN object_types ot ON ot.id = o.object_type_id
    WHERE ot.name IN ('Assembly', 'Space', 'System')
)
AND field_id IN (
    SELECT id FROM object_fields WHERE field_type = 'category_node'
);
