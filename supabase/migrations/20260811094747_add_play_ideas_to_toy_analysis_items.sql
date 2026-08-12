alter table public.toy_analysis_items
  add column play_ideas jsonb not null default '[]'::jsonb,
  add constraint toy_analysis_items_play_ideas_is_array
    check (jsonb_typeof(play_ideas) = 'array');
