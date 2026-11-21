-- The scrolling ticker UI was removed from public and authenticated portal pages.
-- No anonymous visitor needs to read site_settings anymore.
DROP POLICY IF EXISTS "Site settings: public ticker read" ON public.site_settings;
