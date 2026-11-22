-- Remove Production's legacy direct anon grants on public tables.
-- Development exposes only committee_rules SELECT to anon; RLS policies remain
-- the row-level authority for authenticated users.

begin;

do $preflight$
begin
  if to_regclass('public.committee_rules') is null then
    raise exception 'Preflight failed: public committee_rules table is missing';
  end if;

  if exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid=c.relnamespace
    join pg_attribute a on a.attrelid=c.oid and a.attnum>0 and not a.attisdropped
    cross join lateral aclexplode(a.attacl) acl
    where n.nspname='public'
      and c.relkind in ('r','p','v','m','f')
      and acl.grantee='anon'::regrole::oid
  ) then
    raise exception 'Preflight failed: anon has column-level grants; review them before revoking table ACLs';
  end if;
end;
$preflight$;

revoke all privileges on all tables in schema public from anon;
revoke all privileges on all sequences in schema public from anon;

-- Public committee rules are the only table exposed to unauthenticated readers.
grant select on table public.committee_rules to anon;

commit;
