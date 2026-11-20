-- Cleanup: the public ticker read policy already exists in
-- 20261120220442_minimize_anonymous_api_access.sql.
-- Remove the redundant duplicate policy if this migration is replayed
-- against a database that received the first draft of this migration.
DROP POLICY IF EXISTS "Public ticker settings read" ON public.site_settings;
