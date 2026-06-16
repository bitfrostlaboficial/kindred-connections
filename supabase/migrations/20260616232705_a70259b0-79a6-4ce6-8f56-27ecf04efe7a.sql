-- Public read for cover/field images
CREATE POLICY "Public read group-covers" ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'group-covers');
CREATE POLICY "Public read field-photos" ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'field-photos');

-- Authenticated users can manage their own folder (first path segment = user id)
CREATE POLICY "Users upload group-covers" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'group-covers' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Users update group-covers" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'group-covers' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Users delete group-covers" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'group-covers' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users upload field-photos" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'field-photos' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Users update field-photos" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'field-photos' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Users delete field-photos" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'field-photos' AND (storage.foldername(name))[1] = auth.uid()::text);