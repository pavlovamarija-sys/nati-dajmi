create table public.toy_analyses (
  id uuid primary key default gen_random_uuid(),
  child_age_months integer not null,
  image_path text null,
  status text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint toy_analyses_child_age_months_positive
    check (child_age_months > 0),
  constraint toy_analyses_status_valid
    check (status in ('pending', 'processing', 'completed', 'failed'))
);

create table public.toy_analysis_items (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid not null
    references public.toy_analyses (id)
    on delete cascade,
  name text not null,
  category text null,
  recommendation text not null,
  reason text not null,
  confidence numeric null,
  created_at timestamptz not null default now(),

  constraint toy_analysis_items_name_not_blank
    check (btrim(name) <> ''),
  constraint toy_analysis_items_recommendation_valid
    check (recommendation in ('KEEP', 'ROTATE', 'PASS_ON')),
  constraint toy_analysis_items_reason_not_blank
    check (btrim(reason) <> ''),
  constraint toy_analysis_items_confidence_valid
    check (confidence is null or confidence between 0 and 1)
);

create index toy_analysis_items_analysis_id_idx
  on public.toy_analysis_items (analysis_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger toy_analyses_set_updated_at
before update on public.toy_analyses
for each row
execute function public.set_updated_at();

alter table public.toy_analyses enable row level security;
alter table public.toy_analysis_items enable row level security;
