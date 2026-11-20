-- Allow signed-out visitors to read only the two public scrolling-notice settings.
-- The table CHECK constraint also limits stored keys to these two values.
CREATE POLICY "Public ticker settings read"
  ON public.site_settings
  FOR SELECT
  TO anon
  USING (setting_key IN ('ticker_message', 'ticker_enabled'));
