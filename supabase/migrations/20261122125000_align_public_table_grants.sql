-- Align Production's public table grants with least-privilege Development behavior.
-- Preserve the public committee-rules read surface and authenticated UI operations.

begin;

do $preflight$
begin
  if to_regclass('public.committee_rules') is null
     or to_regclass('public.member_contribution_rates') is null then
    raise exception 'Preflight failed: required grant target tables are missing';
  end if;

  if exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid=c.relnamespace
    join pg_attribute a on a.attrelid=c.oid and a.attnum>0 and not a.attisdropped
    cross join lateral aclexplode(a.attacl) acl
    where n.nspname='public'
      and c.relkind in ('r','p','v','m','f')
      and acl.grantee in ('anon'::regrole::oid,'authenticated'::regrole::oid)
      and (
        (acl.grantee='anon'::regrole::oid)
        or (c.relname in ('committee_rules','member_contribution_rates')
          and acl.grantee='authenticated'::regrole::oid)
      )
  ) then
    raise exception 'Preflight failed: column-level grants need manual review before table grant cleanup';
  end if;
end;
$preflight$;

-- Development exposes only committee_rules SELECT to unauthenticated users.
revoke all privileges on all tables in schema public from anon;
revoke all privileges on all sequences in schema public from anon;
grant select on table public.committee_rules to anon;

-- Remove privileges that bypass RLS or are not used by the browser application.
revoke references,trigger,truncate on all tables in schema public from authenticated;

-- Contribution rates are read directly but changed only through the audited,
-- Super Admin-only save_member_contribution_rates RPC.
revoke insert,update,delete on table public.member_contribution_rates from authenticated;

-- Rules are read directly and edited by Super Admin through UPDATE only.
revoke insert,delete on table public.committee_rules from authenticated;

commit;
