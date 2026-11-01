-- AI Fashion Studio — Supabase lockdown for the FastAPI architecture.
--
-- Run this once in Supabase → SQL Editor AFTER Alembic has created the tables.
-- The FastAPI backend connects as the Postgres owner/service role, which
-- bypasses RLS. The public anon and authenticated roles get NO table access and
-- NO storage access: there are deliberately no permissive policies.
--
-- This project keeps its existing FastAPI/JWT authentication. It does not use
-- Supabase Auth, so there is no auth.uid() identity to write policies against.

begin;

-- 1. Deny the Supabase Data API direct access to every application table.
do $$
declare
  item record;
begin
  for item in
    select schemaname, tablename
    from pg_tables
    where schemaname = 'public'
  loop
    execute format(
      'alter table %I.%I enable row level security',
      item.schemaname, item.tablename
    );
    execute format(
      'revoke all on table %I.%I from anon, authenticated',
      item.schemaname, item.tablename
    );
  end loop;
end $$;

revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated;

-- 2. Create the private bucket used by the backend's Supabase Storage adapter.
--    Limit it to the MIME types the application actually writes. The 50 MB
--    bucket ceiling leaves room for generated PDF/ZIP print packages; image
--    uploads are still capped by MAX_UPLOAD_MB in the application. Vercel's
--    ~4.5 MB request/response cap applies on that host.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'media',
  'media',
  false,
  52428800,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf',
        'application/zip', 'application/json']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- 3. Do NOT add storage.objects policies for anon/authenticated.
--    The backend uses SUPABASE_SECRET_KEY, which bypasses Storage RLS.
--    Adding a broad policy here would make every user's photos public to any
--    holder of the publishable/anon key.

commit;

-- Verification (run separately):
--   select tablename, rowsecurity from pg_tables where schemaname = 'public';
--   select id, name, public from storage.buckets where id = 'media';
-- Both should show rowsecurity = true / public = false.
