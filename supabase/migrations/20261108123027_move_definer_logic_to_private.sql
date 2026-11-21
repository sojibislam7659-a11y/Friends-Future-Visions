-- Keep exposed public RPCs SECURITY INVOKER.
-- Privileged work remains in private helpers with explicit Super Admin checks.

CREATE OR REPLACE FUNCTION private.get_financial_summary_for_user()
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

CREATE OR REPLACE FUNCTION private.review_private_document(
  p_document_id uuid,
  p_approved boolean,
  p_admin_note text DEFAULT NULL::text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  d public.member_private_documents%rowtype;
BEGIN
  IF NOT (SELECT private.is_super_admin()) THEN
    RAISE EXCEPTION 'Super Admin permission required';
  END IF;

  SELECT * INTO d
  FROM public.member_private_documents
  WHERE id = p_document_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Document not found'; END IF;
  IF d.status <> 'pending' THEN RAISE EXCEPTION 'Document already reviewed'; END IF;

  IF p_approved AND d.document_type = 'nominee_photo' THEN
    IF d.storage_path NOT LIKE (d.owner_user_id::text || '/%') THEN
      RAISE EXCEPTION 'Document path does not belong to owner';
    END IF;
    UPDATE public.members
      SET nominee_photo_path = d.storage_path
      WHERE id = d.member_id;
  END IF;

  UPDATE public.member_private_documents
    SET status = CASE WHEN p_approved THEN 'approved' ELSE 'rejected' END,
        admin_note = p_admin_note,
        reviewed_by = (SELECT auth.uid()),
        reviewed_at = now()
    WHERE id = p_document_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_financial_summary()
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path TO ''
AS $function$
  SELECT private.get_financial_summary_for_user();
$function$;

CREATE OR REPLACE FUNCTION public.review_payment_submission(
  p_submission_id uuid,
  p_approved boolean,
  p_admin_note text DEFAULT NULL::text,
  p_account_type text DEFAULT 'cash'::text
)
RETURNS void
LANGUAGE sql
SECURITY INVOKER
SET search_path TO ''
AS $function$
  SELECT private.review_payment_submission(p_submission_id,p_approved,p_admin_note,p_account_type);
$function$;

CREATE OR REPLACE FUNCTION public.review_private_document(
  p_document_id uuid,
  p_approved boolean,
  p_admin_note text DEFAULT NULL::text
)
RETURNS void
LANGUAGE sql
SECURITY INVOKER
SET search_path TO ''
AS $function$
  SELECT private.review_private_document(p_document_id,p_approved,p_admin_note);
$function$;

CREATE OR REPLACE FUNCTION public.set_current_committee_document(p_document_id uuid)
RETURNS void
LANGUAGE sql
SECURITY INVOKER
SET search_path TO ''
AS $function$
  SELECT private.set_current_committee_document(p_document_id);
$function$;

REVOKE ALL ON FUNCTION private.get_financial_summary_for_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.review_private_document(uuid,boolean,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.review_payment_submission(uuid,boolean,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.set_current_committee_document(uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION private.get_financial_summary_for_user() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.review_private_document(uuid,boolean,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.review_payment_submission(uuid,boolean,text,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.set_current_committee_document(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_financial_summary() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.review_payment_submission(uuid,boolean,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.review_private_document(uuid,boolean,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_current_committee_document(uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_financial_summary() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.review_payment_submission(uuid,boolean,text,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.review_private_document(uuid,boolean,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_current_committee_document(uuid) TO authenticated, service_role;
