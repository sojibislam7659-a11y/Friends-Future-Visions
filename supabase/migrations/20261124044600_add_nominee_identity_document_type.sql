alter table public.members
  add column if not exists nominee_identity_document_type text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.members'::regclass
      and conname = 'members_nominee_identity_document_type_check'
  ) then
    alter table public.members
      add constraint members_nominee_identity_document_type_check
      check (nominee_identity_document_type is null or nominee_identity_document_type in ('nid','birth_registration','passport'));
  end if;
end $$;

create or replace function public.save_member_admin_profile(
  p_member_id uuid,
  p_changes jsonb,
  p_rate_amount numeric default null,
  p_rate_effective_from date default null
)
returns jsonb
language plpgsql
set search_path to ''
as $function$
declare
  v_actor uuid := (select auth.uid());
  v_current public.members%rowtype;
  v_next public.members%rowtype;
begin
  if v_actor is null or not (select private.is_super_admin()) then
    raise exception 'Super Admin permission required' using errcode = '42501';
  end if;
  if p_member_id is null or p_changes is null or jsonb_typeof(p_changes) <> 'object' then
    raise exception 'A member ID and a JSON object of changes are required';
  end if;
  if (select count(*) from jsonb_object_keys(p_changes)) > 40 then
    raise exception 'Too many profile fields in one save';
  end if;
  if exists (
    select 1 from jsonb_object_keys(p_changes) as k(key)
    where k.key <> all (array[
      'member_no','full_name','phone','status','joined_at','full_name_bn',
      'father_name','mother_name','spouse_name','date_of_birth','gender',
      'profession','email','alternate_phone','whatsapp','present_address',
      'permanent_address','district','upazila','emergency_contact_name',
      'emergency_contact_relation','emergency_contact_phone','nominee_name',
      'nominee_relation','nominee_phone','nominee_address','member_note',
      'joining_date','data_consent','account_consent','profile_photo_path',
      'nominee_photo_path','member_identity_document_path',
      'member_identity_document_type','nominee_nid_path',
      'nominee_identity_document_type'
    ])
  ) then raise exception 'One or more profile fields are not editable'; end if;

  select * into v_current from public.members where id = p_member_id for update;
  if not found then raise exception 'Member not found'; end if;
  select * into v_next from jsonb_populate_record(v_current, p_changes) as populated;

  if v_next.full_name is null or length(trim(v_next.full_name)) = 0 then raise exception 'Full name is required'; end if;
  if v_next.joined_at is null then raise exception 'Joined date is required'; end if;
  if v_next.status not in ('pending','active','inactive') then raise exception 'Invalid member status'; end if;
  if v_next.date_of_birth is not null and v_next.date_of_birth > current_date then raise exception 'Date of birth cannot be in the future'; end if;
  if v_next.member_identity_document_type is not null and v_next.member_identity_document_type not in ('nid','birth_registration','passport') then raise exception 'Invalid member identity document type'; end if;
  if v_next.nominee_identity_document_type is not null and v_next.nominee_identity_document_type not in ('nid','birth_registration','passport') then raise exception 'Invalid nominee identity document type'; end if;
  if (p_rate_amount is null) <> (p_rate_effective_from is null) then raise exception 'Rate amount and effective date must be provided together'; end if;
  if p_rate_amount is not null and (p_rate_amount <= 0 or p_rate_amount <> round(p_rate_amount,2) or extract(day from p_rate_effective_from) <> 1) then raise exception 'Monthly rate must be positive and effective date must be the first day of a month'; end if;

  update public.members set
    member_no=v_next.member_no, full_name=v_next.full_name, phone=v_next.phone,
    status=v_next.status, joined_at=v_next.joined_at, full_name_bn=v_next.full_name_bn,
    father_name=v_next.father_name, mother_name=v_next.mother_name, spouse_name=v_next.spouse_name,
    date_of_birth=v_next.date_of_birth, gender=v_next.gender, profession=v_next.profession,
    email=v_next.email, alternate_phone=v_next.alternate_phone, whatsapp=v_next.whatsapp,
    present_address=v_next.present_address, permanent_address=v_next.permanent_address,
    district=v_next.district, upazila=v_next.upazila,
    emergency_contact_name=v_next.emergency_contact_name,
    emergency_contact_relation=v_next.emergency_contact_relation,
    emergency_contact_phone=v_next.emergency_contact_phone,
    nominee_name=v_next.nominee_name, nominee_relation=v_next.nominee_relation,
    nominee_phone=v_next.nominee_phone, nominee_address=v_next.nominee_address,
    member_note=v_next.member_note, joining_date=v_next.joining_date,
    data_consent=v_next.data_consent, account_consent=v_next.account_consent,
    profile_photo_path=v_next.profile_photo_path, nominee_photo_path=v_next.nominee_photo_path,
    member_identity_document_path=v_next.member_identity_document_path,
    member_identity_document_type=v_next.member_identity_document_type,
    nominee_nid_path=v_next.nominee_nid_path,
    nominee_identity_document_type=v_next.nominee_identity_document_type
  where id=p_member_id;

  if p_rate_amount is not null then perform private.set_member_contribution_rate(p_member_id,p_rate_amount,p_rate_effective_from); end if;
  return jsonb_build_object('saved',true,'rate_saved',p_rate_amount is not null);
end;
$function$;

revoke all on function public.save_member_admin_profile(uuid,jsonb,numeric,date) from public, anon;
grant execute on function public.save_member_admin_profile(uuid,jsonb,numeric,date) to authenticated;