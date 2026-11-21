
CREATE OR REPLACE FUNCTION public.get_financial_summary()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_role text;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT p.role INTO v_role
  FROM public.profiles p
  WHERE p.id = (SELECT auth.uid());

  IF v_role IS NULL OR v_role NOT IN ('member','super_admin') THEN
    RAISE EXCEPTION 'Committee access required' USING ERRCODE = '42501';
  END IF;

  RETURN private.get_financial_summary();
END;
$function$;

REVOKE ALL ON FUNCTION public.get_financial_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_financial_summary() TO authenticated;
