CREATE TABLE public.admin_change_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  table_name text NOT NULL,
  record_id text,
  operation text NOT NULL CHECK (operation IN ('INSERT','UPDATE','DELETE')),
  old_record jsonb,
  new_record jsonb,
  changed_by uuid,
  changed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.admin_change_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_change_audit FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.admin_change_audit TO authenticated;
CREATE POLICY admin_change_audit_super_admin_read ON public.admin_change_audit FOR SELECT TO authenticated
USING ((SELECT private.is_super_admin()));
CREATE INDEX admin_change_audit_changed_at_idx ON public.admin_change_audit(changed_at DESC);
CREATE INDEX admin_change_audit_entity_idx ON public.admin_change_audit(table_name,record_id,changed_at DESC);

CREATE OR REPLACE FUNCTION private.audit_admin_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE old_data jsonb; new_data jsonb; entity_id text;
BEGIN
  IF TG_OP IN ('UPDATE','DELETE') THEN old_data:=to_jsonb(OLD); END IF;
  IF TG_OP IN ('INSERT','UPDATE') THEN new_data:=to_jsonb(NEW); END IF;
  entity_id:=coalesce(new_data->>'id',old_data->>'id');
  INSERT INTO public.admin_change_audit(table_name,record_id,operation,old_record,new_record,changed_by)
  VALUES(TG_TABLE_NAME,entity_id,TG_OP,old_data,new_data,(SELECT auth.uid()));
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$function$;

DO $$
DECLARE tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['members','profiles','member_contribution_rates','notices','site_settings','payment_methods','payment_submissions','committee_proofs','committee_documents','member_private_documents','profile_change_requests'] LOOP
    IF to_regclass('public.'||tbl) IS NOT NULL THEN
      EXECUTE format('DROP TRIGGER IF EXISTS audit_admin_change ON public.%I',tbl);
      EXECUTE format('CREATE TRIGGER audit_admin_change AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION private.audit_admin_change()',tbl);
    END IF;
  END LOOP;
END $$;
