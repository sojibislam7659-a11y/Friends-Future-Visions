-- Development-only role alignment: the application supports Member and Super Admin only.
CREATE OR REPLACE FUNCTION private.has_portal_access()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = (SELECT auth.uid())
      AND p.role IN ('super_admin','member')
  );
$function$;

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
  FROM public.profiles AS p
  WHERE p.id = (SELECT auth.uid());

  IF v_role IS NULL OR v_role NOT IN ('super_admin','member') THEN
    RAISE EXCEPTION 'Committee access required' USING ERRCODE = '42501';
  END IF;

  RETURN private.get_financial_summary();
END;
$function$;

CREATE OR REPLACE FUNCTION public.is_committee_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT private.is_super_admin();
$function$;
