ALTER TABLE public.profiles
ADD COLUMN password_change_required_at timestamptz;

CREATE OR REPLACE FUNCTION public.complete_required_password_change()
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
  v_required_at timestamptz;
  v_auth_updated_at timestamptz;
  v_must_change boolean;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  SELECT p.must_change_password,p.password_change_required_at,u.updated_at
  INTO v_must_change,v_required_at,v_auth_updated_at
  FROM public.profiles p
  JOIN public.members m ON m.auth_user_id=p.id AND m.status='active'
  JOIN auth.users u ON u.id=p.id
  WHERE p.id=v_user_id AND p.role='member';
  IF NOT FOUND THEN RAISE EXCEPTION 'Active member account required' USING ERRCODE='42501'; END IF;
  IF v_must_change AND (v_required_at IS NULL OR v_auth_updated_at IS NULL OR v_auth_updated_at<=v_required_at) THEN
    RAISE EXCEPTION 'A new password must be saved before completing this step' USING ERRCODE='42501';
  END IF;
  UPDATE public.profiles SET must_change_password=false,password_change_required_at=NULL
  WHERE id=v_user_id AND must_change_password=true;
  RETURN true;
END;
$function$;
