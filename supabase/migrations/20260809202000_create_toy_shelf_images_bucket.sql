-- Toy shelf photos are private inputs for a future secure analysis backend.
-- No client storage policies are added until authentication and ownership are defined.
insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'toy-shelf-images',
  'toy-shelf-images',
  false,
  10485760,
  array[
    'image/jpeg',
    'image/png',
    'image/webp'
  ]::text[]
);
