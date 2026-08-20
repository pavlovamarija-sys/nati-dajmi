alter table public.toy_analysis_items
  add column crop_expected boolean not null default false;

comment on column public.toy_analysis_items.crop_expected is
  'True when detector-first analysis requires an authoritative per-toy crop before valuation.';
