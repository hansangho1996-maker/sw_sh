-- Run once in this project's Supabase SQL Editor.
begin;
create table if not exists public.sandwich_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state jsonb not null check (jsonb_typeof(state) = 'object'),
  revision bigint not null default 1 check (revision > 0),
  updated_at timestamptz not null default now()
);
alter table public.sandwich_accounts enable row level security;
revoke all on public.sandwich_accounts from anon, authenticated;
grant select, insert, update on public.sandwich_accounts to authenticated;
drop policy if exists sandwich_read_own on public.sandwich_accounts;
create policy sandwich_read_own on public.sandwich_accounts for select to authenticated
  using ((select auth.uid()) = user_id);
drop policy if exists sandwich_insert_own on public.sandwich_accounts;
create policy sandwich_insert_own on public.sandwich_accounts for insert to authenticated
  with check ((select auth.uid()) = user_id);
drop policy if exists sandwich_update_own on public.sandwich_accounts;
create policy sandwich_update_own on public.sandwich_accounts for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create or replace function public.sandwich_save(p_state jsonb, p_expected_revision bigint)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_current bigint;
  v_result public.sandwich_accounts%rowtype;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '28000'; end if;
  if jsonb_typeof(p_state) is distinct from 'object' or octet_length(p_state::text) > 100000 then
    raise exception 'INVALID_STATE' using errcode = '22023';
  end if;
  -- Serialize both the first insert and later updates for the signed-in user.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_uid::text, 0));
  select revision into v_current from public.sandwich_accounts where user_id = v_uid for update;
  if coalesce(v_current, 0) is distinct from p_expected_revision then
    raise exception 'SYNC_CONFLICT' using errcode = '40001';
  end if;
  if v_current is null then
    insert into public.sandwich_accounts(user_id, state, revision)
      values(v_uid, p_state, 1) returning * into v_result;
  else
    update public.sandwich_accounts set state = p_state, revision = revision + 1, updated_at = now()
      where user_id = v_uid returning * into v_result;
  end if;
  return jsonb_build_object('revision', v_result.revision, 'updated_at', v_result.updated_at);
end;
$$;
revoke all on function public.sandwich_save(jsonb, bigint) from public, anon;
grant execute on function public.sandwich_save(jsonb, bigint) to authenticated;
commit;
