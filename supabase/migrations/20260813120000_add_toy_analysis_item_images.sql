alter table public.toy_analysis_items
  add column image_path text null,
  add constraint toy_analysis_items_image_path_not_blank
    check (image_path is null or btrim(image_path) <> '');

-- The bucket remains private. Authenticated clients may access objects only inside
-- their own top-level folder: <auth.uid()>/<analysis-id>/<toy-item-id>.jpg.
create policy "Authenticated users can upload their own toy images"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'toy-shelf-images'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "Authenticated users can read their own toy images"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'toy-shelf-images'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "Authenticated users can delete their own toy images"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'toy-shelf-images'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

