const SUPABASE_URL = "https://dsdthxypnyhowwcqembj.supabase.co";
// IMPORTANTE: aquí va la clave "anon" / "publishable" (Project Settings > API).
// NUNCA la "service_role": esa clave salta todas las reglas RLS y no debe
// estar en el navegador ni en el repositorio.
const SUPABASE_ANON_KEY = "sb_publishable_MS5DrtoxNUfxSf_K_X46oA_hYgp6N5N";
const sup = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
