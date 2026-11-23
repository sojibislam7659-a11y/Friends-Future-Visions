-- Reduce anonymous Data API access to the two intentionally public datasets.
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM anon;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM anon;

GRANT SELECT ON TABLE public.committee_rules TO anon;
CREATE POLICY "Site settings: public ticker read"
  ON public.site_settings
  FOR SELECT
  TO anon
  USING (setting_key IN ('ticker_message','ticker_enabled'));
GRANT SELECT ON TABLE public.site_settings TO anon;

-- Prevent future public-schema objects created by postgres from inheriting anon access.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM anon;
