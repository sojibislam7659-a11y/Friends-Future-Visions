create table if not exists public.site_settings (
  setting_key text primary key
    check (setting_key in ('ticker_message','ticker_enabled')),
  setting_value text not null,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint site_settings_value_length check (char_length(setting_value) <= 2000)
);

alter table public.site_settings enable row level security;
alter table public.site_settings force row level security;

revoke all on table public.site_settings from anon;
grant select, insert, update, delete on table public.site_settings to authenticated;

create policy "Site settings: approved portal users read"
  on public.site_settings for select to authenticated
  using ((select private.has_portal_access()));

create policy "Site settings: Super Admin insert"
  on public.site_settings for insert to authenticated
  with check ((select private.is_super_admin()));

create policy "Site settings: Super Admin update"
  on public.site_settings for update to authenticated
  using ((select private.is_super_admin()))
  with check ((select private.is_super_admin()));

create policy "Site settings: Super Admin delete"
  on public.site_settings for delete to authenticated
  using ((select private.is_super_admin()));

insert into public.site_settings(setting_key,setting_value)
values
  ('ticker_message','আপনাকে ফ্রেন্ডস ফিউচার ভিশন ফরইভার এ স্বাগতম। আপনাকে আমাদের কোম্পানির পার্টনারশিপ ও মেম্বার হওয়ার জন্য অনেক অনেক শুভেচ্ছা জানাই। নিজের আইডি পাসওয়ার্ড নিজের কাছে রাখুন। অন্যদের সাথে শেয়ার করা থেকে বিরত থাকুন। নিজের বকেয়া প্রতি মাসের নির্ধারিত সময় (মাসের ১৫ তারিখের মধ্যে) এর মধ্যে দায়িত্বপ্রাপ্তদের হাতে বুঝিয়ে দিন। ধন্যবাদ। ইন শাহ আল্লাহ আমাদের স্বপ্ন বাস্তব হবে সকলে একসাথে থাকলে।'),
  ('ticker_enabled','true')
on conflict (setting_key) do nothing;
