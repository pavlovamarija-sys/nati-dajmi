create policy "Authenticated users can read valuations from their own toy analyses"
on public.toy_analysis_item_valuations
for select
to authenticated
using (
  exists (
    select 1
    from public.toy_analysis_items
    join public.toy_analyses
      on toy_analyses.id = toy_analysis_items.analysis_id
    where toy_analysis_items.id = toy_analysis_item_valuations.toy_analysis_item_id
      and toy_analyses.user_id = (select auth.uid())
  )
);

create policy "Authenticated users can insert valuations for their own toy analyses"
on public.toy_analysis_item_valuations
for insert
to authenticated
with check (
  exists (
    select 1
    from public.toy_analysis_items
    join public.toy_analyses
      on toy_analyses.id = toy_analysis_items.analysis_id
    where toy_analysis_items.id = toy_analysis_item_valuations.toy_analysis_item_id
      and toy_analyses.user_id = (select auth.uid())
  )
);

create policy "Authenticated users can update valuations from their own toy analyses"
on public.toy_analysis_item_valuations
for update
to authenticated
using (
  exists (
    select 1
    from public.toy_analysis_items
    join public.toy_analyses
      on toy_analyses.id = toy_analysis_items.analysis_id
    where toy_analysis_items.id = toy_analysis_item_valuations.toy_analysis_item_id
      and toy_analyses.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.toy_analysis_items
    join public.toy_analyses
      on toy_analyses.id = toy_analysis_items.analysis_id
    where toy_analysis_items.id = toy_analysis_item_valuations.toy_analysis_item_id
      and toy_analyses.user_id = (select auth.uid())
  )
);
