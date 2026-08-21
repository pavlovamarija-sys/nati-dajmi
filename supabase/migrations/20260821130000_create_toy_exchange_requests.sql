create table public.toy_exchange_requests (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null
    references public.toy_exchange_listings (id)
    on delete no action,
  requester_user_id uuid not null
    references auth.users (id)
    on delete cascade,
  owner_user_id uuid not null
    references auth.users (id)
    on delete cascade,
  status text not null default 'PENDING',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  responded_at timestamptz null,

  constraint toy_exchange_requests_status_valid
    check (status in ('PENDING', 'ACCEPTED', 'REJECTED')),
  constraint toy_exchange_requests_participants_distinct
    check (requester_user_id <> owner_user_id),
  constraint toy_exchange_requests_lifecycle_valid
    check (
      (status = 'PENDING' and responded_at is null) or
      (status in ('ACCEPTED', 'REJECTED') and responded_at is not null)
    ),
  constraint toy_exchange_requests_timestamps_ordered
    check (
      updated_at >= created_at and
      (responded_at is null or responded_at >= created_at)
    )
);

create unique index toy_exchange_requests_one_pending_per_requester_listing_idx
  on public.toy_exchange_requests (requester_user_id, listing_id)
  where status = 'PENDING';

create unique index toy_exchange_requests_one_accepted_per_listing_idx
  on public.toy_exchange_requests (listing_id)
  where status = 'ACCEPTED';

create index toy_exchange_requests_requester_created_at_idx
  on public.toy_exchange_requests (requester_user_id, created_at desc);

create index toy_exchange_requests_owner_status_created_at_idx
  on public.toy_exchange_requests (owner_user_id, status, created_at desc);

create index toy_exchange_requests_listing_created_at_idx
  on public.toy_exchange_requests (listing_id, created_at desc);

create or replace function public.enforce_toy_exchange_request_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  listing_owner uuid;
  listing_status text;
begin
  if tg_op = 'INSERT' then
    select owner_user_id, status
      into listing_owner, listing_status
    from public.toy_exchange_listings
    where id = new.listing_id
    for update;

    if listing_owner is null then
      raise exception 'Exchange listing is unavailable.';
    end if;
    if listing_status <> 'AVAILABLE' then
      raise exception 'Exchange listing is not available.';
    end if;
    if new.requester_user_id = listing_owner then
      raise exception 'Users cannot request their own listing.';
    end if;
    if exists (
      select 1
      from public.toy_exchange_requests
      where listing_id = new.listing_id
        and status = 'ACCEPTED'
    ) then
      raise exception 'Exchange listing already has an accepted request.';
    end if;

    new.owner_user_id := listing_owner;
    new.status := 'PENDING';
    new.created_at := now();
    new.updated_at := new.created_at;
    new.responded_at := null;
    return new;
  end if;

  if new.id is distinct from old.id or
     new.listing_id is distinct from old.listing_id or
     new.requester_user_id is distinct from old.requester_user_id or
     new.owner_user_id is distinct from old.owner_user_id or
     new.created_at is distinct from old.created_at then
    raise exception 'Exchange request identity cannot be changed.';
  end if;

  if old.status <> 'PENDING' then
    raise exception 'Completed exchange requests cannot be changed.';
  end if;
  if new.status not in ('ACCEPTED', 'REJECTED') then
    raise exception 'Invalid exchange request transition.';
  end if;

  new.responded_at := now();
  new.updated_at := new.responded_at;
  return new;
end;
$$;

create trigger toy_exchange_requests_enforce_lifecycle
before insert or update on public.toy_exchange_requests
for each row
execute function public.enforce_toy_exchange_request_lifecycle();

create or replace function public.respond_to_toy_exchange_request(
  p_request_id uuid,
  p_decision text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  request_row public.toy_exchange_requests;
  listing_status text;
begin
  if caller_id is null then
    raise exception 'Authentication required.';
  end if;
  if p_decision not in ('ACCEPT', 'REJECT') then
    raise exception 'Invalid exchange request decision.';
  end if;

  select * into request_row
  from public.toy_exchange_requests
  where id = p_request_id;

  if request_row.id is null or request_row.owner_user_id <> caller_id then
    raise exception 'Exchange request not found.';
  end if;

  select status into listing_status
  from public.toy_exchange_listings
  where id = request_row.listing_id
  for update;

  select * into request_row
  from public.toy_exchange_requests
  where id = p_request_id
  for update;

  if request_row.status <> 'PENDING' then
    raise exception 'Exchange request is not pending.';
  end if;
  if p_decision = 'ACCEPT' and listing_status <> 'AVAILABLE' then
    raise exception 'Exchange listing is not available.';
  end if;

  if p_decision = 'ACCEPT' then
    update public.toy_exchange_requests
      set status = 'ACCEPTED'
      where id = request_row.id
      returning * into request_row;

    update public.toy_exchange_requests
      set status = 'REJECTED'
      where listing_id = request_row.listing_id
        and id <> request_row.id
        and status = 'PENDING';
  else
    update public.toy_exchange_requests
      set status = 'REJECTED'
      where id = request_row.id
      returning * into request_row;
  end if;

  return jsonb_build_object(
    'id', request_row.id,
    'listing_id', request_row.listing_id,
    'status', request_row.status,
    'created_at', request_row.created_at,
    'responded_at', request_row.responded_at
  );
end;
$$;

revoke all on function public.respond_to_toy_exchange_request(uuid, text) from public;
grant execute on function public.respond_to_toy_exchange_request(uuid, text) to authenticated;

alter table public.toy_exchange_requests enable row level security;

create policy "Participants can read their own toy exchange requests"
on public.toy_exchange_requests
for select
to authenticated
using (
  requester_user_id = (select auth.uid()) or
  owner_user_id = (select auth.uid())
);
