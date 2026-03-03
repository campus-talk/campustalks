import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const CF_API_BASE = 'https://api.cloudflare.com/client/v4';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify auth
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }

    const userId = claimsData.claims.sub as string;

    // Get request body
    const body = await req.json().catch(() => ({}));
    const { roomName, displayName, isVideoCall } = body;

    if (!roomName) {
      return new Response(JSON.stringify({ error: 'roomName is required' }), { status: 400, headers: corsHeaders });
    }

    const cfToken = Deno.env.get('CLOUDFLARE_API_TOKEN');
    const accountId = Deno.env.get('CLOUDFLARE_ACCOUNT_ID');
    const appId = Deno.env.get('CLOUDFLARE_RTK_APP_ID');

    if (!cfToken || !accountId || !appId) {
      console.error('Missing Cloudflare config:', { cfToken: !!cfToken, accountId: !!accountId, appId: !!appId });
      return new Response(JSON.stringify({ error: 'Server configuration error' }), { status: 500, headers: corsHeaders });
    }

    const cfHeaders = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${cfToken}`,
    };

    // Step 1: Create a meeting (or reuse existing one by roomName)
    // We use roomName as the meeting title for idempotency tracking
    const meetingRes = await fetch(
      `${CF_API_BASE}/accounts/${accountId}/realtime/kit/${appId}/meetings`,
      {
        method: 'POST',
        headers: cfHeaders,
        body: JSON.stringify({
          title: roomName,
        }),
      }
    );

    const meetingData = await meetingRes.json();
    
    if (!meetingRes.ok) {
      console.error('Meeting creation failed:', JSON.stringify(meetingData));
      return new Response(
        JSON.stringify({ error: 'Failed to create meeting', details: meetingData }),
        { status: 500, headers: corsHeaders }
      );
    }

    const meetingId = meetingData.result?.data?.id || meetingData.result?.id;
    
    if (!meetingId) {
      console.error('No meeting ID in response:', JSON.stringify(meetingData));
      return new Response(
        JSON.stringify({ error: 'Invalid meeting response', details: meetingData }),
        { status: 500, headers: corsHeaders }
      );
    }

    // Step 2: Add participant to get authToken
    // Use "group_call_host" preset for full permissions, or default preset
    const participantRes = await fetch(
      `${CF_API_BASE}/accounts/${accountId}/realtime/kit/${appId}/meetings/${meetingId}/participants`,
      {
        method: 'POST',
        headers: cfHeaders,
        body: JSON.stringify({
          name: displayName || 'User',
          preset_name: 'group_call_host',
          custom_participant_id: userId,
        }),
      }
    );

    const participantData = await participantRes.json();

    if (!participantRes.ok) {
      // If preset doesn't exist, try without specific preset
      if (participantRes.status === 404 || participantRes.status === 422) {
        const retryRes = await fetch(
          `${CF_API_BASE}/accounts/${accountId}/realtime/kit/${appId}/meetings/${meetingId}/participants`,
          {
            method: 'POST',
            headers: cfHeaders,
            body: JSON.stringify({
              name: displayName || 'User',
              custom_participant_id: userId,
            }),
          }
        );

        const retryData = await retryRes.json();
        
        if (!retryRes.ok) {
          console.error('Participant add failed (retry):', JSON.stringify(retryData));
          return new Response(
            JSON.stringify({ error: 'Failed to add participant', details: retryData }),
            { status: 500, headers: corsHeaders }
          );
        }

        const authToken = retryData.result?.data?.token || retryData.result?.token;
        
        return new Response(
          JSON.stringify({ authToken, meetingId, userId }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.error('Participant add failed:', JSON.stringify(participantData));
      return new Response(
        JSON.stringify({ error: 'Failed to add participant', details: participantData }),
        { status: 500, headers: corsHeaders }
      );
    }

    const authToken = participantData.result?.data?.token || participantData.result?.token;

    if (!authToken) {
      console.error('No authToken in response:', JSON.stringify(participantData));
      return new Response(
        JSON.stringify({ error: 'No auth token received', details: participantData }),
        { status: 500, headers: corsHeaders }
      );
    }

    return new Response(
      JSON.stringify({ authToken, meetingId, userId }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('RTK token generation error:', err);
    return new Response(
      JSON.stringify({ error: 'Token generation failed', message: String(err) }),
      { status: 500, headers: corsHeaders }
    );
  }
});
