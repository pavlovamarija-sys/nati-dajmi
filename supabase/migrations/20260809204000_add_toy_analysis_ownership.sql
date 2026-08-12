-- Existing test analyses are intentionally preserved with a null owner.
alter table public.toy_analyses
  add column user_id uuid null;

alter table public.toy_analyses
  add constraint toy_analyses_user_id_fkey
  foreign key (user_id)
  references auth.users (id)
  on delete cascade;

create index toy_analyses_user_id_idx
  on public.toy_analyses (user_id);

-- NOT VALID preserves legacy null rows while enforcing ownership for every new row.
-- After legacy test data is removed or assigned, validate this constraint and make
-- the column formally NOT NULL in a later migration.
alter table public.toy_analyses
  add constraint toy_analyses_new_rows_require_user_id
  check (user_id is not null) not valid;

create policy "Authenticated users can read their own toy analyses"
on public.toy_analyses
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Authenticated users can read items from their own toy analyses"
on public.toy_analysis_items
for select
to authenticated
using (
  exists (
    select 1
    from public.toy_analyses
    where toy_analyses.id = toy_analysis_items.analysis_id
      and toy_analyses.user_id = (select auth.uid())
  )
);
