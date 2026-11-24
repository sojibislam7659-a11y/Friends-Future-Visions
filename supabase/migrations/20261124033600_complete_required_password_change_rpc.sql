-- Allow an authenticated active member to clear the temporary-password flag
-- only after Supabase Auth has stored a different password hash.
create or replace function public.complete_required_password_change()
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_updated integer;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.profiles p
    join public.members m on m.auth_user_id = p.id
    where p.id = v_user_id
      and p.role = 'member'
      and p.must_change_password = true
      and m.status = 'active'
  ) then
    raise exception 'No active required password change exists for this account'
      using errcode = '42501';
  end if;

  update public.profiles
  set must_change_password = false
  where id = v_user_id
    and role = 'member'
    and must_change_password = true;

  get diagnostics v_updated = row_count;
  if v_updated <> 1 then
    raise exception 'Required password change could not be completed'
      using errcode = '42501';
  end if;
end;
$function$;

revoke all on function public.complete_required_password_change() from public;
revoke all on function public.complete_required_password_change() from anon;
grant execute on function public.complete_required_password_change() to authenticated;