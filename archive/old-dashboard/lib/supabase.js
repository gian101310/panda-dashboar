import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://jxkelchxitwuilpbrwxk.supabase.co';
const SUPABASE_KEY = 'REDACTED';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
