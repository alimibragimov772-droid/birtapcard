-- ============================================================================
-- BirTap — RLS Hardening Migration
-- ============================================================================
-- WHY THIS FILE EXISTS
-- --------------------
-- The app/API layer (middleware, page guards, /api/*/manage routes) already
-- blocks owner/branch_manager from the UI and from the protected write
-- endpoints. But several pages (companies, users, telegram settings) used to
-- write to Supabase directly from the browser using the public anon key.
-- That key is visible in the client bundle, so ANY authenticated user could
-- open devtools and call supabase.from('companies').insert(...) (or worse,
-- profiles.update({ role: 'super_admin' }) on their own row) by hand —
-- completely bypassing the UI and the "canManage" checks in React.
--
-- The app code has been updated to route all writes through service-role
-- API routes (/api/companies/manage, /api/users/manage,
-- /api/telegram/settings, /api/branches/manage). This migration is the
-- second, independent line of defense: even if a write path is ever missed
-- in the app layer, the database itself refuses the write.
--
-- Run this once in the Supabase SQL editor (or via `supabase db push`).
-- It is idempotent — safe to re-run.
-- ============================================================================

-- ─── Helper: read the caller's role without recursive RLS ──────────────────
-- Querying `profiles` from inside a policy ON `profiles` would recurse.
-- SECURITY DEFINER lets this function bypass RLS internally while still
-- only ever returning the CALLER's own role.
create or replace function public.current_role_name()
returns text
language sql
security definer
stable
set search_path = public
as $$
  select role from public.profiles where user_id = auth.uid()
$$;

create or replace function public.current_company_id()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select company_id from public.profiles where user_id = auth.uid()
$$;

create or replace function public.current_branch_id()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select branch_id from public.profiles where user_id = auth.uid()
$$;

create or replace function public.is_super_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.current_role_name() = 'super_admin'
$$;

-- ─── companies ──────────────────────────────────────────────────────────────
alter table public.companies enable row level security;

drop policy if exists "companies_select" on public.companies;
drop policy if exists "companies_write_super_admin" on public.companies;

-- Everyone authenticated can SELECT, but owners only see their own company.
-- (branch_manager has no direct stake in companies, but reads are harmless
-- read-only metadata; tighten to company match if you want it stricter.)
create policy "companies_select" on public.companies
  for select to authenticated
  using (
    public.is_super_admin()
    or id = public.current_company_id()
  );

-- INSERT / UPDATE / DELETE: super_admin only. Owner/branch_manager get none.
create policy "companies_write_super_admin" on public.companies
  for all to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

-- ─── branches ───────────────────────────────────────────────────────────────
alter table public.branches enable row level security;

drop policy if exists "branches_select" on public.branches;
drop policy if exists "branches_write_super_admin" on public.branches;

create policy "branches_select" on public.branches
  for select to authenticated
  using (
    public.is_super_admin()
    or company_id = public.current_company_id()         -- owner: own network
    or id = public.current_branch_id()                   -- branch_manager: primary branch
    or id in (                                            -- branch_manager: any branch via branch_users
      select branch_id from public.branch_users where user_id = auth.uid()
    )
  );

create policy "branches_write_super_admin" on public.branches
  for all to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

-- ─── profiles ───────────────────────────────────────────────────────────────
alter table public.profiles enable row level security;

drop policy if exists "profiles_select" on public.profiles;
drop policy if exists "profiles_update_own_nonsensitive" on public.profiles;
drop policy if exists "profiles_write_super_admin" on public.profiles;
drop policy if exists "profiles_insert_super_admin" on public.profiles;
drop policy if exists "profiles_update_self_or_super_admin" on public.profiles;
drop policy if exists "profiles_delete_super_admin" on public.profiles;

-- super_admin sees everyone; everyone else sees only their own row.
create policy "profiles_select" on public.profiles
  for select to authenticated
  using (
    public.is_super_admin()
    or user_id = auth.uid()
  );

-- INSERT / DELETE: super_admin only (the app never creates/deletes
-- profile rows from the client — accounts come from Supabase Auth).
create policy "profiles_insert_super_admin" on public.profiles
  for insert to authenticated
  with check (public.is_super_admin());

create policy "profiles_delete_super_admin" on public.profiles
  for delete to authenticated
  using (public.is_super_admin());

-- UPDATE: a user may update their OWN row (e.g. editing full_name on the
-- Settings page), or a super_admin may update ANY row. This alone is not
-- enough to stop privilege escalation — see the trigger below, which is
-- the part that actually blocks an owner/branch_manager from changing
-- their own role/company_id/branch_id even though this policy lets the
-- UPDATE statement through.
create policy "profiles_update_self_or_super_admin" on public.profiles
  for update to authenticated
  using (public.is_super_admin() or user_id = auth.uid())
  with check (public.is_super_admin() or user_id = auth.uid());

-- Trigger: block changes to privilege-bearing columns (role, company_id,
-- branch_id) unless the actor is super_admin. This is what actually closes
-- the "owner promotes self to super_admin via direct PostgREST call" hole —
-- the UPDATE policy above intentionally allows self-updates (for full_name),
-- so the guard has to live here.
create or replace function public.guard_profiles_privileged_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_super_admin() then
    if new.role is distinct from old.role
       or new.company_id is distinct from old.company_id
       or new.branch_id is distinct from old.branch_id
    then
      raise exception 'Only super_admin may change role, company_id, or branch_id';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_profiles_privileged_columns on public.profiles;
create trigger trg_guard_profiles_privileged_columns
  before update on public.profiles
  for each row
  execute function public.guard_profiles_privileged_columns();

-- ─── branch_users ───────────────────────────────────────────────────────────
alter table public.branch_users enable row level security;

drop policy if exists "branch_users_select" on public.branch_users;
drop policy if exists "branch_users_write_super_admin" on public.branch_users;

create policy "branch_users_select" on public.branch_users
  for select to authenticated
  using (
    public.is_super_admin()
    or user_id = auth.uid()
    or branch_id = public.current_branch_id()
  );

create policy "branch_users_write_super_admin" on public.branch_users
  for all to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

-- ─── scan_events (analytics) ────────────────────────────────────────────────
-- Written exclusively by the public /r/qr and /r/nfc redirect routes via the
-- service-role client (anonymous scanners are never authenticated, and the
-- service role bypasses RLS by design). Authenticated users get SELECT only,
-- scoped to their own network/branch so an Owner can never see another
-- restaurant's stats and a Branch Manager can never see another branch's.
alter table public.scan_events enable row level security;

drop policy if exists "scan_events_select" on public.scan_events;
drop policy if exists "scan_events_no_direct_write" on public.scan_events;

create policy "scan_events_select" on public.scan_events
  for select to authenticated
  using (
    public.is_super_admin()
    or branch_id = public.current_branch_id()
    or branch_id in (
      select branch_id from public.branch_users where user_id = auth.uid()
    )
    or branch_id in (
      select id from public.branches where company_id = public.current_company_id()
    )
  );

-- No INSERT/UPDATE/DELETE policy is created for any authenticated role —
-- by default, with RLS enabled and no matching policy, all writes are
-- denied for the `authenticated` and `anon` roles. Only the service_role
-- key (used in app/r/qr, app/r/nfc, and the cron daily-report job) can
-- write to this table, because service_role bypasses RLS entirely.

-- ─── telegram_settings ──────────────────────────────────────────────────────
alter table public.telegram_settings enable row level security;

drop policy if exists "telegram_settings_select_super_admin" on public.telegram_settings;
drop policy if exists "telegram_settings_write_super_admin" on public.telegram_settings;

-- Telegram settings are a platform-level/admin concern — owner/branch_manager
-- never see or touch them in the UI, so lock the table to super_admin only.
create policy "telegram_settings_select_super_admin" on public.telegram_settings
  for select to authenticated
  using (public.is_super_admin());

create policy "telegram_settings_write_super_admin" on public.telegram_settings
  for all to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

-- ============================================================================
-- End of migration.
-- ============================================================================
