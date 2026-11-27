-- Add a safe display-name field for the contribution matrix and typed member uploads.
alter table public.members add column if not exists matrix_display_name text;
alter table public.member_private_documents add column if not exists identity_type text;

do $$ begin
 if not exists(select 1 from pg_constraint where conname='members_matrix_display_name_length_check') then
  alter table public.members add constraint members_matrix_display_name_length_check check(matrix_display_name is null or char_length(matrix_display_name)<=40);
 end if;
 if not exists(select 1 from pg_constraint where conname='member_private_documents_identity_type_check') then
  alter table public.member_private_documents add constraint member_private_documents_identity_type_check check(identity_type is null or identity_type in ('nid','birth_registration','passport'));
 end if;
end $$;

update public.members set matrix_display_name=case
 when member_no='M-001' then 'Sojib'
 when member_no='M-002' then 'Akash'
 when member_no='M-003' then 'Riyaz'
 when member_no='M-004' then 'Eyasin'
 when member_no='M-005' then 'Biplob'
 when member_no='M-006' then 'Sohag'
 when member_no='M-007' then 'Tanvir'
 else matrix_display_name end
where member_no in ('M-001','M-002','M-003','M-004','M-005','M-006','M-007');

create or replace function public.get_matrix_member_display_names()
returns table(member_id uuid, member_no text, display_name text)
language plpgsql
security definer
set search_path=''
as $function$
begin
 if (select auth.uid()) is null then
  raise exception 'Authentication required' using errcode='42501';
 end if;
 if not (select private.is_super_admin()) and not exists(
   select 1 from public.members m
   where m.auth_user_id=(select auth.uid()) and m.status='active'
 ) then
  raise exception 'Active member access required' using errcode='42501';
 end if;
 return query
 select m.id,m.member_no,
   coalesce(nullif(btrim(m.matrix_display_name),''),nullif(split_part(btrim(m.full_name),' ',1),''),'Member')
 from public.members m
 where m.status='active'
 order by m.member_no;
end;
$function$;
revoke all on function public.get_matrix_member_display_names() from public;
grant execute on function public.get_matrix_member_display_names() to authenticated;

create or replace function private.review_private_document(p_document_id uuid,p_approved boolean,p_admin_note text default null)
returns void
language plpgsql
security definer
set search_path=''
as $function$
declare d public.member_private_documents%rowtype;
begin
 if not (select private.is_super_admin()) then
  raise exception 'Super Admin permission required' using errcode='42501';
 end if;
 if p_approved is null then raise exception 'Approval decision is required'; end if;
 select * into d from public.member_private_documents where id=p_document_id for update;
 if not found then raise exception 'Document not found'; end if;
 if d.status<>'pending' then raise exception 'Document already reviewed'; end if;
 if p_approved then
  if d.document_type='nominee_photo' then
   if d.storage_path not like (d.owner_user_id::text||'/%') then raise exception 'Document path does not belong to owner'; end if;
   update public.members set nominee_photo_path=d.storage_path where id=d.member_id;
  elsif d.document_type in ('member_nid','nominee_nid') then
   if d.storage_path not like (d.owner_user_id::text||'/%') then raise exception 'Document path does not belong to owner'; end if;
   if d.identity_type is not null and d.identity_type not in ('nid','birth_registration','passport') then raise exception 'Invalid identity document type'; end if;
   if d.document_type='member_nid' then
    update public.members set member_identity_document_path=d.storage_path,
      member_identity_document_type=coalesce(d.identity_type,'nid') where id=d.member_id;
   else
    update public.members set nominee_nid_path=d.storage_path,
      nominee_identity_document_type=coalesce(d.identity_type,'nid') where id=d.member_id;
   end if;
  end if;
 end if;
 update public.member_private_documents set status=case when p_approved then 'approved' else 'rejected' end,
  admin_note=p_admin_note,reviewed_by=(select auth.uid()),reviewed_at=now() where id=p_document_id;
end;
$function$;
