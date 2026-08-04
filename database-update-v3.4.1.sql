-- =====================================================
-- VERSION 3.4.1 — SECURE MANAGER PIN AUTHENTICATION
-- Digest-free session implementation for Supabase compatibility.
--
-- Run this complete script in DEV.
-- Run the same script in Production only when deploying Version 3.4.1.
--
-- Existing managers without a PIN receive temporary PIN 0000.
-- Change it immediately after first login.
-- =====================================================

create extension if not exists pgcrypto;

-- =====================================================
-- STAFF PIN FIELDS
-- =====================================================

alter table public.staff_members
add column if not exists manager_pin_hash text;

alter table public.staff_members
add column if not exists pin_failed_attempts integer
not null default 0;

alter table public.staff_members
add column if not exists pin_locked_until timestamptz;

alter table public.staff_members
add column if not exists pin_changed_at timestamptz;

alter table public.staff_members
drop constraint if exists staff_members_manager_pin_role_check;

alter table public.staff_members
add constraint staff_members_manager_pin_role_check
check (
  role = 'manager'
  or manager_pin_hash is null
);

-- Temporary PIN for existing managers only where no PIN exists.
update public.staff_members
set
  manager_pin_hash =
    extensions.crypt(
      '0000',
      extensions.gen_salt('bf', 10)
    ),
  pin_changed_at = now()
where role = 'manager'
  and manager_pin_hash is null;

-- =====================================================
-- MANAGER SESSION TABLE
-- =====================================================

create table if not exists public.manager_pin_sessions (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null
    references public.staff_members(id)
    on delete cascade,
  session_token text not null unique,
  device_id text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz
);

-- Upgrade an incomplete 3.4.0 attempt safely.
alter table public.manager_pin_sessions
add column if not exists session_token text;

alter table public.manager_pin_sessions
drop column if exists token_hash;

alter table public.manager_pin_sessions
alter column session_token set not null;

alter table public.manager_pin_sessions
enable row level security;

revoke all
on public.manager_pin_sessions
from anon, authenticated;

create index if not exists manager_pin_sessions_staff_idx
on public.manager_pin_sessions(staff_id);

create index if not exists manager_pin_sessions_expiry_idx
on public.manager_pin_sessions(expires_at);

create unique index if not exists manager_pin_sessions_token_idx
on public.manager_pin_sessions(session_token);

-- =====================================================
-- HIDE PIN SECURITY COLUMNS FROM NORMAL CLIENT READS
-- =====================================================

revoke select
on public.staff_members
from anon, authenticated;

grant select (
  id,
  name,
  active,
  role,
  created_at,
  display_order
)
on public.staff_members
to anon, authenticated;

-- =====================================================
-- INTERNAL SESSION LOOKUP
-- =====================================================

create or replace function public.manager_session_staff_id(
  p_token text
)
returns uuid
language sql
security definer
set search_path = public, extensions
stable
as $$
  select s.staff_id
  from public.manager_pin_sessions s
  join public.staff_members m
    on m.id = s.staff_id
  where s.session_token = p_token
    and s.revoked_at is null
    and s.expires_at > now()
    and m.role = 'manager'
  limit 1;
$$;

revoke all
on function public.manager_session_staff_id(text)
from public, anon, authenticated;

-- =====================================================
-- MANAGER PIN LOGIN
-- =====================================================

create or replace function public.manager_login_with_pin(
  p_staff_id uuid,
  p_pin text,
  p_device_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_staff public.staff_members%rowtype;
  v_token text;
  v_attempts integer;
begin
  if p_pin !~ '^[0-9]{4}$' then
    return jsonb_build_object(
      'success', false,
      'message', 'Enter a four-digit PIN.'
    );
  end if;

  select *
  into v_staff
  from public.staff_members
  where id = p_staff_id
  for update;

  if not found or v_staff.role <> 'manager' then
    return jsonb_build_object(
      'success', false,
      'message', 'This user is not a manager.'
    );
  end if;

  if v_staff.pin_locked_until is not null
     and v_staff.pin_locked_until > now() then
    return jsonb_build_object(
      'success', false,
      'message',
      'Too many incorrect attempts. Try again later.'
    );
  end if;

  if v_staff.manager_pin_hash is null
     or extensions.crypt(
       p_pin,
       v_staff.manager_pin_hash
     ) <> v_staff.manager_pin_hash then

    v_attempts :=
      coalesce(
        v_staff.pin_failed_attempts,
        0
      ) + 1;

    update public.staff_members
    set
      pin_failed_attempts =
        case
          when v_attempts >= 5 then 0
          else v_attempts
        end,
      pin_locked_until =
        case
          when v_attempts >= 5
            then now() + interval '15 minutes'
          else null
        end
    where id = p_staff_id;

    return jsonb_build_object(
      'success', false,
      'message',
        case
          when v_attempts >= 5
            then 'Too many incorrect attempts. Manager access is locked for 15 minutes.'
          else 'Incorrect PIN.'
        end
    );
  end if;

  update public.staff_members
  set
    pin_failed_attempts = 0,
    pin_locked_until = null
  where id = p_staff_id;

  v_token :=
    encode(
      extensions.gen_random_bytes(32),
      'hex'
    );

  insert into public.manager_pin_sessions (
    staff_id,
    session_token,
    device_id,
    expires_at
  )
  values (
    p_staff_id,
    v_token,
    p_device_id,
    now() + interval '8 hours'
  );

  delete from public.manager_pin_sessions
  where expires_at < now()
     or revoked_at is not null;

  return jsonb_build_object(
    'success', true,
    'token', v_token,
    'manager_name', v_staff.name,
    'expires_at',
      now() + interval '8 hours'
  );
end;
$$;

-- =====================================================
-- SESSION VALIDATION / SIGN OUT
-- =====================================================

create or replace function public.manager_validate_session(
  p_token text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_staff_id uuid;
  v_name text;
begin
  v_staff_id :=
    public.manager_session_staff_id(
      p_token
    );

  if v_staff_id is null then
    return jsonb_build_object(
      'valid', false
    );
  end if;

  select name
  into v_name
  from public.staff_members
  where id = v_staff_id;

  return jsonb_build_object(
    'valid', true,
    'staff_id', v_staff_id,
    'name', v_name
  );
end;
$$;

create or replace function public.manager_sign_out(
  p_token text
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  update public.manager_pin_sessions
  set revoked_at = now()
  where session_token = p_token
    and revoked_at is null;

  return true;
end;
$$;

-- =====================================================
-- CHANGE MANAGER PIN
-- =====================================================

create or replace function public.manager_change_pin(
  p_token text,
  p_current_pin text,
  p_new_pin text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_staff_id uuid;
  v_hash text;
begin
  v_staff_id :=
    public.manager_session_staff_id(
      p_token
    );

  if v_staff_id is null then
    return jsonb_build_object(
      'success', false,
      'message',
      'Manager session has expired.'
    );
  end if;

  if p_new_pin !~ '^[0-9]{4}$' then
    return jsonb_build_object(
      'success', false,
      'message',
      'New PIN must contain exactly four digits.'
    );
  end if;

  select manager_pin_hash
  into v_hash
  from public.staff_members
  where id = v_staff_id
  for update;

  if v_hash is null
     or extensions.crypt(
       p_current_pin,
       v_hash
     ) <> v_hash then
    return jsonb_build_object(
      'success', false,
      'message',
      'Current PIN is incorrect.'
    );
  end if;

  update public.staff_members
  set
    manager_pin_hash =
      extensions.crypt(
        p_new_pin,
        extensions.gen_salt('bf', 10)
      ),
    pin_changed_at = now(),
    pin_failed_attempts = 0,
    pin_locked_until = null
  where id = v_staff_id;

  return jsonb_build_object(
    'success', true,
    'message',
    'PIN changed successfully.'
  );
end;
$$;

-- =====================================================
-- PROTECTED STAFF MANAGEMENT
-- =====================================================

create or replace function public.manager_add_staff(
  p_token text,
  p_name text,
  p_role text default 'staff',
  p_pin text default null
)
returns table (
  id uuid,
  name text,
  active boolean,
  role text,
  created_at timestamptz,
  display_order integer
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_manager_id uuid;
  v_next_order integer;
  v_new_id uuid;
begin
  v_manager_id :=
    public.manager_session_staff_id(
      p_token
    );

  if v_manager_id is null then
    raise exception
      'Manager session has expired.';
  end if;

  if trim(coalesce(p_name, '')) = '' then
    raise exception
      'Enter a user name.';
  end if;

  if p_role not in (
    'staff',
    'manager'
  ) then
    raise exception
      'Invalid user role.';
  end if;

  if p_role = 'manager'
     and coalesce(p_pin, '')
       !~ '^[0-9]{4}$' then
    raise exception
      'Manager PIN must contain exactly four digits.';
  end if;

  select
    coalesce(
      max(s.display_order),
      0
    ) + 1
  into v_next_order
  from public.staff_members s;

  insert into public.staff_members (
    name,
    active,
    role,
    manager_pin_hash,
    pin_changed_at,
    display_order
  )
  values (
    trim(p_name),
    true,
    p_role,
    case
      when p_role = 'manager'
        then extensions.crypt(
          p_pin,
          extensions.gen_salt(
            'bf',
            10
          )
        )
      else null
    end,
    case
      when p_role = 'manager'
        then now()
      else null
    end,
    v_next_order
  )
  returning staff_members.id
  into v_new_id;

  return query
  select
    s.id,
    s.name,
    s.active,
    s.role,
    s.created_at,
    s.display_order
  from public.staff_members s
  where s.id = v_new_id;
end;
$$;

create or replace function public.manager_update_staff(
  p_token text,
  p_staff_id uuid,
  p_name text default null,
  p_active boolean default null,
  p_role text default null
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_manager_id uuid;
begin
  v_manager_id :=
    public.manager_session_staff_id(
      p_token
    );

  if v_manager_id is null then
    raise exception
      'Manager session has expired.';
  end if;

  if p_role is not null
     and p_role not in (
       'staff',
       'manager'
     ) then
    raise exception
      'Invalid user role.';
  end if;

  update public.staff_members
  set
    name =
      case
        when p_name is null
          then name
        else trim(p_name)
      end,
    active =
      coalesce(
        p_active,
        active
      ),
    role =
      coalesce(
        p_role,
        role
      ),
    manager_pin_hash =
      case
        when p_role = 'staff'
          then null
        else manager_pin_hash
      end
  where id = p_staff_id;

  return found;
end;
$$;

-- =====================================================
-- PROTECTED AUDIT VIEWER
-- =====================================================

create or replace function public.manager_list_audit(
  p_token text,
  p_action_type text default null,
  p_changed_by text default null,
  p_created_after timestamptz default null,
  p_offset integer default 0,
  p_limit integer default 21
)
returns setof public.audit_log
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if public.manager_session_staff_id(
    p_token
  ) is null then
    raise exception
      'Manager session has expired.';
  end if;

  return query
  select a.*
  from public.audit_log a
  where (
      p_action_type is null
      or a.action_type =
        p_action_type
    )
    and (
      p_changed_by is null
      or a.changed_by_name =
        p_changed_by
    )
    and (
      p_created_after is null
      or a.created_at >=
        p_created_after
    )
  order by a.created_at desc
  offset greatest(
    p_offset,
    0
  )
  limit least(
    greatest(
      p_limit,
      1
    ),
    100
  );
end;
$$;

-- =====================================================
-- FUNCTION PERMISSIONS
-- =====================================================

revoke all
on function public.manager_login_with_pin(
  uuid,
  text,
  text
)
from public;

revoke all
on function public.manager_validate_session(text)
from public;

revoke all
on function public.manager_sign_out(text)
from public;

revoke all
on function public.manager_change_pin(
  text,
  text,
  text
)
from public;

revoke all
on function public.manager_add_staff(
  text,
  text,
  text,
  text
)
from public;

revoke all
on function public.manager_update_staff(
  text,
  uuid,
  text,
  boolean,
  text
)
from public;

revoke all
on function public.manager_list_audit(
  text,
  text,
  text,
  timestamptz,
  integer,
  integer
)
from public;

grant execute
on function public.manager_login_with_pin(
  uuid,
  text,
  text
)
to anon, authenticated;

grant execute
on function public.manager_validate_session(text)
to anon, authenticated;

grant execute
on function public.manager_sign_out(text)
to anon, authenticated;

grant execute
on function public.manager_change_pin(
  text,
  text,
  text
)
to anon, authenticated;

grant execute
on function public.manager_add_staff(
  text,
  text,
  text,
  text
)
to anon, authenticated;

grant execute
on function public.manager_update_staff(
  text,
  uuid,
  text,
  boolean,
  text
)
to anon, authenticated;

grant execute
on function public.manager_list_audit(
  text,
  text,
  text,
  timestamptz,
  integer,
  integer
)
to anon, authenticated;
