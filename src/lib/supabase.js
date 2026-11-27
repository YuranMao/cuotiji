import { createClient } from '@supabase/supabase-js';

export const sb = createClient(
  import.meta.env.VITE_SUPABASE_URL || 'https://owuckenvwmdsithqvsod.supabase.co',
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_2Ccd-_BuUgE2RJ35YKyhBA_XhysffVW',
);

export async function uploadImage(input, folder = 'questions') {
  let file = input;
  if (typeof input === 'string') {
    if (!input.startsWith('data:')) return input;
    file = await (await fetch(input)).blob();
  }
  const extension = (file.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
  const path = `${folder}/${Date.now()}-${crypto.randomUUID()}.${extension}`;
  const { error } = await sb.storage.from('cuotiji').upload(path, file, { contentType: file.type });
  if (error) throw error;
  return sb.storage.from('cuotiji').getPublicUrl(path).data.publicUrl;
}
