import { createClient } from '@supabase/supabase-js';
const SUPABASE_URL = 'https://jxkelchxitwuilpbrwxk.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp4a2VsY2h4aXR3dWlscGJyd3hrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mzg1MTI2NSwiZXhwIjoyMDg5NDI3MjY1fQ.OgNCKlZPy010de01wW02qH--Lb6zVYqPBxTEFpGrD5M';
export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
