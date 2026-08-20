create table public.toy_exchange_listings (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null
    references auth.users (id)
    on delete cascade,
  source_toy_analysis_item_id uuid not null
    references public.toy_analysis_items (id)
    on delete no action,
  source_valuation_id uuid not null
    references public.toy_analysis_item_valuations (id)
    on delete no action,

  name text not null,
  category text null,
  condition text not null,
  image_path text not null,
  asking_value_stars integer not null,
  source_estimated_value_denars integer not null,
  recommendation_at_publication text not null,
  status text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz null,
  withdrawn_at timestamptz null,

  constraint toy_exchange_listings_name_not_blank
    check (btrim(name) <> ''),
  constraint toy_exchange_listings_category_not_blank
    check (category is null or btrim(category) <> ''),
  constraint toy_exchange_listings_condition_valid
    check (condition in ('EXCELLENT', 'GOOD', 'FAIR', 'POOR')),
  constraint toy_exchange_listings_image_path_not_blank
    check (btrim(image_path) <> ''),
  constraint toy_exchange_listings_asking_value_nonnegative
    check (asking_value_stars >= 0),
  constraint toy_exchange_listings_source_value_nonnegative
    check (source_estimated_value_denars >= 0),
  constraint toy_exchange_listings_recommendation_valid
    check (recommendation_at_publication in ('KEEP', 'ROTATE', 'PASS_ON')),
  constraint toy_exchange_listings_status_valid
    check (status in ('DRAFT', 'AVAILABLE', 'WITHDRAWN')),
  constraint toy_exchange_listings_lifecycle_valid
    check (
      (
        status = 'DRAFT' and
        published_at is null and
        withdrawn_at is null
      ) or (
        status = 'AVAILABLE' and
        published_at is not null and
        withdrawn_at is null
      ) or (
        status = 'WITHDRAWN' and
        withdrawn_at is not null
      )
    ),
  constraint toy_exchange_listings_timestamps_ordered
    check (
      updated_at >= created_at and
      (published_at is null or published_at >= created_at) and
      (withdrawn_at is null or withdrawn_at >= created_at) and
      (
        published_at is null or
        withdrawn_at is null or
        withdrawn_at >= published_at
      )
    )
);

create unique index toy_exchange_listings_one_active_per_toy_idx
  on public.toy_exchange_listings (source_toy_analysis_item_id)
  where status in ('DRAFT', 'AVAILABLE');

create index toy_exchange_listings_owner_created_at_idx
  on public.toy_exchange_listings (owner_user_id, created_at desc);

create index toy_exchange_listings_owner_status_created_at_idx
  on public.toy_exchange_listings (owner_user_id, status, created_at desc);

create index toy_exchange_listings_available_created_at_idx
  on public.toy_exchange_listings (created_at desc)
  where status = 'AVAILABLE';

create index toy_exchange_listings_source_created_at_idx
  on public.toy_exchange_listings (source_toy_analysis_item_id, created_at desc);

create index toy_exchange_listings_source_valuation_idx
  on public.toy_exchange_listings (source_valuation_id);

create or replace function public.enforce_toy_exchange_listing_lifecycle()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
    new.updated_at := new.created_at;

    if new.status = 'DRAFT' then
      new.published_at := null;
      new.withdrawn_at := null;
    elsif new.status = 'AVAILABLE' then
      new.published_at := new.created_at;
      new.withdrawn_at := null;
    else
      raise exception 'Listings cannot be created as withdrawn.';
    end if;

    return new;
  end if;

  if new.owner_user_id is distinct from old.owner_user_id then
    raise exception 'Listing ownership cannot be changed.';
  end if;

  if new.created_at is distinct from old.created_at then
    raise exception 'Listing creation time cannot be changed.';
  end if;

  if old.status = 'WITHDRAWN' then
    if new.status <> 'WITHDRAWN' then
      raise exception 'Withdrawn listings cannot be reactivated.';
    end if;

    if new.name is distinct from old.name or
       new.category is distinct from old.category or
       new.condition is distinct from old.condition or
       new.image_path is distinct from old.image_path or
       new.asking_value_stars is distinct from old.asking_value_stars or
       new.source_toy_analysis_item_id is distinct from old.source_toy_analysis_item_id or
       new.source_valuation_id is distinct from old.source_valuation_id or
       new.source_estimated_value_denars is distinct from old.source_estimated_value_denars or
       new.recommendation_at_publication is distinct from old.recommendation_at_publication or
       new.published_at is distinct from old.published_at or
       new.withdrawn_at is distinct from old.withdrawn_at then
      raise exception 'Withdrawn listing history cannot be changed.';
    end if;

    return new;
  end if;

  if old.status = 'AVAILABLE' and new.status = 'DRAFT' then
    raise exception 'Available listings cannot return to draft status.';
  end if;

  if old.published_at is not null and (
    new.source_toy_analysis_item_id is distinct from old.source_toy_analysis_item_id or
    new.source_valuation_id is distinct from old.source_valuation_id or
    new.condition is distinct from old.condition or
    new.image_path is distinct from old.image_path or
    new.source_estimated_value_denars is distinct from old.source_estimated_value_denars or
    new.recommendation_at_publication is distinct from old.recommendation_at_publication
  ) then
    raise exception 'Published listing provenance cannot be changed.';
  end if;

  if old.status = 'DRAFT' and new.status = 'DRAFT' then
    new.published_at := null;
    new.withdrawn_at := null;
  elsif old.status = 'DRAFT' and new.status = 'AVAILABLE' then
    new.published_at := now();
    new.withdrawn_at := null;
  elsif old.status = 'DRAFT' and new.status = 'WITHDRAWN' then
    new.published_at := null;
    new.withdrawn_at := now();
  elsif old.status = 'AVAILABLE' and new.status = 'AVAILABLE' then
    new.published_at := old.published_at;
    new.withdrawn_at := null;
  elsif old.status = 'AVAILABLE' and new.status = 'WITHDRAWN' then
    new.published_at := old.published_at;
    new.withdrawn_at := now();
  else
    raise exception 'Invalid listing status transition.';
  end if;

  return new;
end;
$$;

create trigger toy_exchange_listings_enforce_lifecycle
before insert or update on public.toy_exchange_listings
for each row
execute function public.enforce_toy_exchange_listing_lifecycle();

create or replace function public.validate_toy_exchange_listing_source()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  source_data_changed boolean := true;
begin
  if tg_op = 'UPDATE' then
    source_data_changed :=
      (new.status = 'AVAILABLE' and old.status <> 'AVAILABLE') or
      new.source_toy_analysis_item_id is distinct from old.source_toy_analysis_item_id or
      new.source_valuation_id is distinct from old.source_valuation_id or
      new.condition is distinct from old.condition or
      new.image_path is distinct from old.image_path or
      new.source_estimated_value_denars is distinct from old.source_estimated_value_denars or
      new.recommendation_at_publication is distinct from old.recommendation_at_publication;
  end if;

  if source_data_changed then
    if not exists (
      select 1
      from public.toy_analysis_items
      join public.toy_analysis_item_valuations
        on toy_analysis_item_valuations.toy_analysis_item_id = toy_analysis_items.id
      where toy_analysis_items.id = new.source_toy_analysis_item_id
        and toy_analysis_item_valuations.id = new.source_valuation_id
        and toy_analysis_items.image_path = new.image_path
        and toy_analysis_items.recommendation = new.recommendation_at_publication
        and toy_analysis_item_valuations.confirmed_condition = new.condition
        and toy_analysis_item_valuations.condition_confirmation_type is not null
        and toy_analysis_item_valuations.condition_confirmed_at is not null
        and toy_analysis_item_valuations.base_second_hand_value_denars is not null
        and toy_analysis_item_valuations.ai_condition is not null
        and toy_analysis_item_valuations.ai_condition_notes is not null
        and toy_analysis_item_valuations.condition_adjustment_basis_points is not null
        and toy_analysis_item_valuations.estimated_value_denars =
          new.source_estimated_value_denars
    ) then
      raise exception 'Listing source data is invalid.';
    end if;
  end if;

  return new;
end;
$$;

create trigger toy_exchange_listings_validate_source
before insert or update on public.toy_exchange_listings
for each row
execute function public.validate_toy_exchange_listing_source();

create trigger toy_exchange_listings_set_updated_at
before update on public.toy_exchange_listings
for each row
execute function public.set_updated_at();

alter table public.toy_exchange_listings enable row level security;

create policy "Authenticated users can read their own toy exchange listings"
on public.toy_exchange_listings
for select
to authenticated
using (owner_user_id = (select auth.uid()));

create policy "Authenticated users can create listings for their own analyzed toys"
on public.toy_exchange_listings
for insert
to authenticated
with check (
  owner_user_id = (select auth.uid()) and
  exists (
    select 1
    from public.toy_analysis_items
    join public.toy_analyses
      on toy_analyses.id = toy_analysis_items.analysis_id
    where toy_analysis_items.id = source_toy_analysis_item_id
      and toy_analyses.user_id = (select auth.uid())
  ) and
  exists (
    select 1
    from public.toy_analysis_item_valuations
    where toy_analysis_item_valuations.id = source_valuation_id
      and toy_analysis_item_valuations.toy_analysis_item_id =
        source_toy_analysis_item_id
  )
);

create policy "Authenticated users can update their own toy exchange listings"
on public.toy_exchange_listings
for update
to authenticated
using (owner_user_id = (select auth.uid()))
with check (
  owner_user_id = (select auth.uid()) and
  exists (
    select 1
    from public.toy_analysis_items
    join public.toy_analyses
      on toy_analyses.id = toy_analysis_items.analysis_id
    where toy_analysis_items.id = source_toy_analysis_item_id
      and toy_analyses.user_id = (select auth.uid())
  ) and
  exists (
    select 1
    from public.toy_analysis_item_valuations
    where toy_analysis_item_valuations.id = source_valuation_id
      and toy_analysis_item_valuations.toy_analysis_item_id =
        source_toy_analysis_item_id
  )
);
