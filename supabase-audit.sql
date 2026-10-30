-- OIKKO: READ-ONLY SUPABASE AUDIT
-- Run this in Supabase SQL Editor before connecting real member data.
-- Every statement below is SELECT-only. It does not insert, update, delete,
-- alter policies, change settings, or expose member/customer row contents.
--
-- Review the results with the checklist in SUPABASE_READINESS.md.
-- IMPORTANT: Metadata inspection is not proof that the security design is correct.
-- Test access using separate admin and member accounts before production.

-- 1) Relevant public tables, columns, types, nullability and defaults.
SELECT
  c.table_name,
  c.ordinal_position,
  c.column_name,
  c.data_type,
  c.udt_name,
  c.is_nullable,
  c.column_default
FROM information_schema.columns AS c
WHERE c.table_schema = 'public'
  AND c.table_name IN (
    'profiles',
    'members',
    'financial_transactions',
    'payment_submissions'
  )
ORDER BY c.table_name, c.ordinal_position;

-- 2) Constraints on the committee tables (primary keys, foreign keys,
-- unique constraints and check constraints).
SELECT
  tc.table_name,
  tc.constraint_name,
  tc.constraint_type,
  cc.check_clause
FROM information_schema.table_constraints AS tc
LEFT JOIN information_schema.check_constraints AS cc
  ON cc.constraint_schema = tc.constraint_schema
 AND cc.constraint_name = tc.constraint_name
WHERE tc.table_schema = 'public'
  AND tc.table_name IN (
    'profiles',
    'members',
    'financial_transactions',
    'payment_submissions'
  )
ORDER BY tc.table_name, tc.constraint_type, tc.constraint_name;

-- 3) RLS enabled/forced state for the relevant public tables.
SELECT
  n.nspname AS schema_name,
  c.relname AS table_name,
  c.relrowsecurity AS rls_enabled,
  c.relforcerowsecurity AS rls_forced
FROM pg_class AS c
JOIN pg_namespace AS n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind IN ('r', 'p')
  AND c.relname IN (
    'profiles',
    'members',
    'financial_transactions',
    'payment_submissions'
  )
ORDER BY c.relname;

-- 4) Policies: command, roles, USING expression and WITH CHECK expression.
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual AS using_expression,
  with_check AS with_check_expression
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'profiles',
    'members',
    'financial_transactions',
    'payment_submissions'
  )
ORDER BY tablename, policyname;

-- 5) Committee-related helper functions and their security attributes.
-- Inspect function bodies for correct role checks and search_path handling.
SELECT
  n.nspname AS schema_name,
  p.proname AS function_name,
  pg_get_function_identity_arguments(p.oid) AS arguments,
  p.prosecdef AS security_definer,
  p.provolatile AS volatility,
  p.proconfig AS function_settings,
  pg_get_functiondef(p.oid) AS definition
FROM pg_proc AS p
JOIN pg_namespace AS n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND (
    p.proname ILIKE '%admin%'
    OR p.proname ILIKE '%member%'
    OR p.proname ILIKE '%oikko%'
  )
ORDER BY p.proname;

-- 6) Triggers attached to committee tables.
SELECT
  event_object_table AS table_name,
  trigger_name,
  event_manipulation,
  action_timing,
  action_statement
FROM information_schema.triggers
WHERE event_object_schema = 'public'
  AND event_object_table IN (
    'profiles',
    'members',
    'financial_transactions',
    'payment_submissions'
  )
ORDER BY event_object_table, trigger_name, event_manipulation;

-- 7) Storage bucket metadata only (no object names or file contents).
SELECT
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
FROM storage.buckets
ORDER BY name;

-- 8) Storage object policies, if the storage schema is available.
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual AS using_expression,
  with_check AS with_check_expression
FROM pg_policies
WHERE schemaname = 'storage'
  AND tablename IN ('objects', 'buckets')
ORDER BY tablename, policyname;

-- 9) Grants on committee tables. RLS still applies where enabled; grants
-- alone do not establish row-level privacy.
SELECT
  grantee,
  table_name,
  privilege_type,
  is_grantable
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name IN (
    'profiles',
    'members',
    'financial_transactions',
    'payment_submissions'
  )
ORDER BY table_name, grantee, privilege_type;
