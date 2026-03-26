-- Storage 버킷 생성 (이력서/포폴 PDF)
insert into storage.buckets (id, name, public)
values ('documents', 'documents', false);

-- Storage RLS: 본인 폴더만 접근
create policy "documents_select" on storage.objects
  for select using (bucket_id = 'documents' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "documents_insert" on storage.objects
  for insert with check (bucket_id = 'documents' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "documents_delete" on storage.objects
  for delete using (bucket_id = 'documents' and auth.uid()::text = (storage.foldername(name))[1]);
