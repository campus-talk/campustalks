import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { RtcTokenBuilder, RtcRole } from "https://esm.sh/agora-token@2.0.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }

    const body = await req.json().catch(() => ({}));
    const { channelName, isVideoCall } = body;

    if (!channelName) {
      return new Response(JSON.stringify({ error: 'channelName is required' }), { status: 400, headers: corsHeaders });
    }

    const appId = '7fbe9dab88334b8181c19874a3ad0931';
    const appCertificate = Deno.env.get('AGORA_APP_CERTIFICATE');

    if (!appCertificate) {
      console.error('Missing AGORA_APP_CERTIFICATE');
      return new Response(JSON.stringify({ error: 'Server configuration error' }), { status: 500, headers: corsHeaders });
    }

    // Generate a UID from the user's UUID (hash to a number)
    const uid = Math.abs(hashCode(user.id)) % 100000000;

    const role = RtcRole.PUBLISHER;
    const expirationTimeInSeconds = 3600; // 1 hour
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const privilegeExpiredTs = currentTimestamp + expirationTimeInSeconds;

    const token = RtcTokenBuilder.buildTokenWithUid(
      appId,
      appCertificate,
      channelName,
      uid,
      role,
      privilegeExpiredTs
    );

    return new Response(
      JSON.stringify({ token, uid, channelName }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('Agora token generation error:', err);
    return new Response(
      JSON.stringify({ error: 'Token generation failed', message: String(err) }),
      { status: 500, headers: corsHeaders }
    );
  }
});

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return hash;
}
