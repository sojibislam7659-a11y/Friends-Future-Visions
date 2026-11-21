-- The public ticker has been removed. Revoke the now-unneeded table-level grant as well.
REVOKE SELECT ON TABLE public.site_settings FROM anon;
