CREATE OR REPLACE FUNCTION private.set_member_contribution_rate(p_member_id uuid,p_amount numeric,p_effective_from date)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
  current_rate public.member_contribution_rates%rowtype;
  next_start date;
BEGIN
  IF NOT (SELECT private.is_super_admin()) THEN RAISE EXCEPTION 'Super Admin permission required'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 OR p_amount <> round(p_amount,2) OR p_amount > 999999999999.99 THEN
    RAISE EXCEPTION 'Monthly amount must be positive and use no more than two decimal places';
  END IF;
  IF p_effective_from IS NULL OR extract(day FROM p_effective_from) <> 1 THEN
    RAISE EXCEPTION 'Effective date must be the first day of a month';
  END IF;
  IF p_effective_from < DATE '2027-01-01' OR p_effective_from > DATE '2031-12-01' THEN
    RAISE EXCEPTION 'Effective date must be within January 2027–December 2031';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.members WHERE id=p_member_id AND status='active') THEN
    RAISE EXCEPTION 'Active member not found';
  END IF;
  SELECT * INTO current_rate FROM public.member_contribution_rates
  WHERE member_id=p_member_id AND effective_from<=p_effective_from
    AND (effective_to IS NULL OR effective_to>=p_effective_from)
  ORDER BY effective_from DESC LIMIT 1 FOR UPDATE;
  SELECT min(effective_from) INTO next_start FROM public.member_contribution_rates
  WHERE member_id=p_member_id AND effective_from>p_effective_from;
  IF FOUND AND current_rate.effective_from=p_effective_from THEN
    UPDATE public.member_contribution_rates SET monthly_amount=p_amount WHERE id=current_rate.id;
  ELSE
    UPDATE public.member_contribution_rates SET effective_to=p_effective_from-1
    WHERE member_id=p_member_id AND effective_from<p_effective_from
      AND (effective_to IS NULL OR effective_to>=p_effective_from);
    INSERT INTO public.member_contribution_rates(member_id,monthly_amount,effective_from,effective_to,created_by)
    VALUES(p_member_id,p_amount,p_effective_from,CASE WHEN next_start IS NULL THEN NULL ELSE next_start-1 END,(SELECT auth.uid()));
  END IF;
  UPDATE public.members SET monthly_contribution=p_amount,
    contribution_start_date=coalesce(contribution_start_date,p_effective_from) WHERE id=p_member_id;
END;
$function$;
