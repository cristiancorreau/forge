-- 002-projects-metadata — registro multi-proyecto (SPEC-077 § 4)
-- Agrega el subconjunto cacheado de project.yaml (metadata_json) y el estado
-- del proyecto (active | missing | invalid) a la tabla projects.
-- No crea índice de path: el UNIQUE (projects.path) ya viene de 001-init.sql.

ALTER TABLE projects ADD COLUMN metadata_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE projects ADD COLUMN status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','missing','invalid'));
