create table public.toy_analysis_item_valuations (
  id uuid primary key default gen_random_uuid(),
  toy_analysis_item_id uuid not null
    references public.toy_analysis_items (id)
    on delete cascade,
  estimated_value_denars integer not null,
  confidence numeric null,
  valuation_method text not null,
  valuation_version text not null,
  created_at timestamptz not null default now(),

  constraint toy_analysis_item_valuations_item_unique
    unique (toy_analysis_item_id),
  constraint toy_analysis_item_valuations_value_nonnegative
    check (estimated_value_denars >= 0),
  constraint toy_analysis_item_valuations_confidence_valid
    check (confidence is null or confidence between 0 and 1),
  constraint toy_analysis_item_valuations_method_not_blank
    check (btrim(valuation_method) <> ''),
  constraint toy_analysis_item_valuations_version_not_blank
    check (btrim(valuation_version) <> '')
);

alter table public.toy_analysis_item_valuations enable row level security;
