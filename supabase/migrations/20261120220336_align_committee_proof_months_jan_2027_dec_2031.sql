-- Align proof metadata editing with the committee's January 2027–December 2031 period.
CREATE OR REPLACE FUNCTION public.save_committee_proof_metadata(p_changes jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_change record;
  v_saved integer := 0;
  v_rows integer;
BEGIN
  IF v_actor IS NULL OR NOT (SELECT private.is_super_admin()) THEN
    RAISE EXCEPTION 'Super Admin permission required' USING ERRCODE = '42501';
  END IF;
  IF p_changes IS NULL OR jsonb_typeof(p_changes) <> 'array' OR jsonb_array_length(p_changes) > 200 THEN
    RAISE EXCEPTION 'Proof changes must be a JSON array of at most 200 items';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_changes) e
    WHERE jsonb_typeof(e) <> 'object'
       OR NOT (e ? 'id' AND e ? 'proof_month' AND e ? 'title' AND e ? 'note' AND e ? 'published')
       OR nullif(trim(e->>'title'),'') IS NULL
       OR length(e->>'title') > 180
       OR length(coalesce(e->>'note','')) > 500
  ) THEN
    RAISE EXCEPTION 'Each proof requires a valid ID, month, title, note and published flag';
  END IF;
  IF (SELECT count(*) <> count(DISTINCT (e->>'id')::uuid) FROM jsonb_array_elements(p_changes) e) THEN
    RAISE EXCEPTION 'Duplicate proof IDs are not allowed';
  END IF;

  FOR v_change IN
    SELECT (e->>'id')::uuid AS id,
           (e->>'proof_month')::date AS proof_month,
           trim(e->>'title') AS title,
           nullif(trim(e->>'note'),'') AS note,
           (e->>'published')::boolean AS published
    FROM jsonb_array_elements(p_changes) e
    ORDER BY 1
  LOOP
    IF v_change.proof_month <> date_trunc('month',v_change.proof_month)::date
       OR v_change.proof_month < DATE '2027-01-01'
       OR v_change.proof_month >= DATE '2032-01-01' THEN
      RAISE EXCEPTION 'Proof month must be the first day of a month from Jan 2027 through Dec 2031';
    END IF;
    UPDATE public.committee_proofs
    SET proof_month=v_change.proof_month,title=v_change.title,note=v_change.note,published=v_change.published
    WHERE id=v_change.id;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows <> 1 THEN RAISE EXCEPTION 'Proof not found: %',v_change.id; END IF;
    v_saved := v_saved + 1;
  END LOOP;
  RETURN jsonb_build_object('saved',v_saved);
END;
$function$;
