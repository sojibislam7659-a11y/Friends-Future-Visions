CREATE TABLE private.password_rotation_guards (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  password_hash_fingerprint text NOT NULL,
  captured_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE private.password_rotation_guards ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.password_rotation_guards FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.capture_password_rotation_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE v_fingerprint text;
BEGIN
  IF NEW.must_change_password=true THEN
    SELECT md5(u.encrypted_password) INTO v_fingerprint FROM auth.users u
    WHERE u.id=NEW.id AND nullif(u.encrypted_password,'') IS NOT NULL;
    IF v_fingerprint IS NULL THEN RAISE EXCEPTION 'A password-backed Auth user is required for temporary-password rotation'; END IF;
    INSERT INTO private.password_rotation_guards(user_id,password_hash_fingerprint,captured_at)
    VALUES(NEW.id,v_fingerprint,now())
    ON CONFLICT(user_id) DO UPDATE SET password_hash_fingerprint=EXCLUDED.password_hash_fingerprint,captured_at=EXCLUDED.captured_at;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION private.guard_temporary_password_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE v_initial_fingerprint text; v_current_fingerprint text;
BEGIN
  IF OLD.must_change_password=true AND NEW.must_change_password=false THEN
    SELECT g.password_hash_fingerprint,md5(u.encrypted_password)
    INTO v_initial_fingerprint,v_current_fingerprint
    FROM private.password_rotation_guards g JOIN auth.users u ON u.id=g.user_id
    WHERE g.user_id=OLD.id FOR UPDATE OF g;
    IF v_initial_fingerprint IS NULL OR v_current_fingerprint IS NULL OR v_initial_fingerprint=v_current_fingerprint THEN
      RAISE EXCEPTION 'A different password must be saved before completing this step' USING ERRCODE='42501';
    END IF;
    DELETE FROM private.password_rotation_guards WHERE user_id=OLD.id;
    NEW.password_change_required_at:=NULL;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS capture_password_rotation_guard ON public.profiles;
CREATE TRIGGER capture_password_rotation_guard
AFTER INSERT OR UPDATE OF must_change_password,password_change_required_at ON public.profiles
FOR EACH ROW EXECUTE FUNCTION private.capture_password_rotation_guard();
