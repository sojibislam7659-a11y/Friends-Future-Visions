-- Cover the updated_by foreign key used by site settings administration.
CREATE INDEX IF NOT EXISTS site_settings_updated_by_idx
  ON public.site_settings (updated_by);
