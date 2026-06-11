
create policy "Portraits owner read" on storage.objects for select
  using (bucket_id = 'portraits' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "Portraits owner insert" on storage.objects for insert
  with check (bucket_id = 'portraits' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "Portraits owner update" on storage.objects for update
  using (bucket_id = 'portraits' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "Portraits owner delete" on storage.objects for delete
  using (bucket_id = 'portraits' and auth.uid()::text = (storage.foldername(name))[1]);
