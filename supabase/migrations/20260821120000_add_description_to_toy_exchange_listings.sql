alter table public.toy_exchange_listings
  add column description text null,
  add constraint toy_exchange_listings_description_valid
    check (
      description is null or
      (
        btrim(description) <> '' and
        char_length(description) <= 1000
      )
    );

create or replace function public.enforce_toy_exchange_listing_description_history()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'WITHDRAWN' and
     new.description is distinct from old.description then
    raise exception 'Withdrawn listing history cannot be changed.';
  end if;

  return new;
end;
$$;

create trigger toy_exchange_listings_enforce_description_history
before update of description on public.toy_exchange_listings
for each row
execute function public.enforce_toy_exchange_listing_description_history();
