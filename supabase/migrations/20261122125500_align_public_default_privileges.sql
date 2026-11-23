-- Match Development's default privileges for future objects created by postgres
-- in public. This prevents new tables/functions/sequences inheriting anon grants.

begin;

do $preflight$
begin
  if not exists (
    select 1 from pg_default_acl
    where defaclrole='postgres'::regrole
      and defaclnamespace='public'::regnamespace
  ) then
    raise exception 'Preflight failed: postgres public-schema default ACLs were not found';
  end if;
end;
$preflight$;

alter default privileges for role postgres in schema public
  revoke all privileges on tables from anon;
alter default privileges for role postgres in schema public
  revoke all privileges on sequences from anon;
alter default privileges for role postgres in schema public
  revoke execute on functions from anon;
alter default privileges for role postgres in schema public
  revoke references,trigger,truncate on tables from authenticated;

commit;
