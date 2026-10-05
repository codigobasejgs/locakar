-- Logos da identidade visual: aumenta de 1 MB para 4 MB, sem alterar formatos ou permissões.
update storage.buckets
   set file_size_limit = 4 * 1024 * 1024
 where id = 'branding';
