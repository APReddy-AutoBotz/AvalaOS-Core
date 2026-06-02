-- KlarityPM Delivery App-ID Mapping
-- Keeps PostgreSQL UUID primary keys while preserving stable UI IDs during the migration from prototype data.

ALTER TABLE projects ADD COLUMN IF NOT EXISTS app_id TEXT;
ALTER TABLE epics ADD COLUMN IF NOT EXISTS app_id TEXT;
ALTER TABLE sprints ADD COLUMN IF NOT EXISTS app_id TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS app_id TEXT;

DROP INDEX IF EXISTS idx_projects_org_app_id;
DROP INDEX IF EXISTS idx_epics_org_app_id;
DROP INDEX IF EXISTS idx_sprints_org_app_id;
DROP INDEX IF EXISTS idx_tasks_org_app_id;

CREATE UNIQUE INDEX idx_projects_org_app_id ON projects(org_id, app_id);
CREATE UNIQUE INDEX idx_epics_org_app_id ON epics(org_id, app_id);
CREATE UNIQUE INDEX idx_sprints_org_app_id ON sprints(org_id, app_id);
CREATE UNIQUE INDEX idx_tasks_org_app_id ON tasks(org_id, app_id);
