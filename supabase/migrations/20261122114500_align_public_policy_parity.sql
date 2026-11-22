-- Align remaining shared public-table RLS policies with Development.
-- Policy metadata only; no table rows are modified.

begin;

do $preflight$
begin
  if exists (
    select 1
    from unnest(array['committee_documents','payment_methods','payment_submissions','notifications']) as required(table_name)
    where to_regclass('public.' || required.table_name) is null
  ) then
    raise exception 'Preflight failed: one or more public policy target tables are missing';
  end if;
  if to_regprocedure('private.is_super_admin()') is null
     or to_regprocedure('private.has_portal_access()') is null then
    raise exception 'Preflight failed: portal authorization helpers are missing';
  end if;
end;
$preflight$;

-- Committee documents: replace the Production ALL policy with the three
-- Development Super Admin operation policies.
drop policy if exists "Committee documents: Super Admin manage" on public.committee_documents;
drop policy if exists "Committee documents: Super Admin insert" on public.committee_documents;
drop policy if exists "Committee documents: Super Admin update" on public.committee_documents;
drop policy if exists "Committee documents: Super Admin delete" on public.committee_documents;

create policy "Committee documents: Super Admin insert"
on public.committee_documents for insert to authenticated
with check ((select private.is_super_admin()));
create policy "Committee documents: Super Admin update"
on public.committee_documents for update to authenticated
using ((select private.is_super_admin()))
with check ((select private.is_super_admin()));
create policy "Committee documents: Super Admin delete"
on public.committee_documents for delete to authenticated
using ((select private.is_super_admin()));

-- Payment methods: same granular Super Admin policy model as Development.
drop policy if exists "Payment methods: Super Admin manage" on public.payment_methods;
drop policy if exists "Payment methods: Super Admin insert" on public.payment_methods;
drop policy if exists "Payment methods: Super Admin update" on public.payment_methods;
drop policy if exists "Payment methods: Super Admin delete" on public.payment_methods;

create policy "Payment methods: Super Admin insert"
on public.payment_methods for insert to authenticated
with check ((select private.is_super_admin()));
create policy "Payment methods: Super Admin update"
on public.payment_methods for update to authenticated
using ((select private.is_super_admin()))
with check ((select private.is_super_admin()));
create policy "Payment methods: Super Admin delete"
on public.payment_methods for delete to authenticated
using ((select private.is_super_admin()));

-- Payment submissions: Super Admin may review/update or delete, but member
-- submission creation remains governed by the existing member-owned INSERT policy.
drop policy if exists "Payments: Super Admin full access" on public.payment_submissions;
drop policy if exists "Payments: Super Admin update" on public.payment_submissions;
drop policy if exists "Payments: Super Admin delete" on public.payment_submissions;

create policy "Payments: Super Admin update"
on public.payment_submissions for update to authenticated
using ((select private.is_super_admin()))
with check ((select private.is_super_admin()));
create policy "Payments: Super Admin delete"
on public.payment_submissions for delete to authenticated
using ((select private.is_super_admin()));

-- Notifications: require an active portal session for own-row reads/updates;
-- Super Admin may additionally read all notification rows.
drop policy if exists notifications_read_own on public.notifications;
drop policy if exists notifications_read_own_or_super_admin on public.notifications;
create policy notifications_read_own_or_super_admin
on public.notifications for select to authenticated
using (
  (select private.has_portal_access())
  and (
    user_id = (select auth.uid())
    or (select private.is_super_admin())
  )
);

drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own
on public.notifications for update to authenticated
using (
  (select private.has_portal_access())
  and user_id = (select auth.uid())
)
with check (
  (select private.has_portal_access())
  and user_id = (select auth.uid())
);

commit;
