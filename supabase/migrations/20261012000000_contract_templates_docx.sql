-- Modelos de contrato em DOCX: bucket 'documentos' passa a aceitar Word (.docx) além de PDF e imagens
update storage.buckets
   set allowed_mime_types = array[
     'image/jpeg', 'image/png', 'image/webp', 'application/pdf',
     'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
   ]
 where id = 'documentos';
