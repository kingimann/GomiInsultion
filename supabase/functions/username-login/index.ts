// Lets people sign in with a username OR an email. The username -> email lookup happens here, on the server,
// so nobody can look up another person's email address from their username. Any failure returns the same generic error.
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const fail = async () => { await new Promise((r) => setTimeout(r, 400)); return json({ error: 'Incorrect username/email or password.' }, 400); };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const { identifier, password } = await req.json();
    const id = String(identifier ?? '').trim();
    if (!id || !password || id.length > 200 || String(password).length > 500) return await fail();
    const url = Deno.env.get('SUPABASE_URL')!;
    let email = id;
    if (!id.includes('@')) {
      const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
      const { data } = await admin.from('profiles').select('email').ilike('username', id.replace(/[%_\\]/g, '\\$&')).limit(1).maybeSingle();
      if (!data?.email) return await fail();
      email = data.email;
    }
    const headers: Record<string, string> = { apikey: Deno.env.get('SUPABASE_ANON_KEY')!, 'Content-Type': 'application/json' };
    const ip = req.headers.get('x-forwarded-for'); if (ip) headers['x-forwarded-for'] = ip;
    const r = await fetch(`${url}/auth/v1/token?grant_type=password`, { method: 'POST', headers, body: JSON.stringify({ email, password }) });
    const session = await r.json();
    if (!r.ok || !session.access_token) return await fail();
    return json(session);
  } catch (_e) { return await fail(); }
});
