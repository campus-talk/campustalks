import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Use service role for cleanup operations (no auth needed - this is a maintenance task)
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // Delete expired statuses (older than 24 hours)
    const { data: deletedStatuses, error: statusError } = await adminClient
      .from('statuses')
      .delete()
      .lt('expires_at', new Date().toISOString())
      .select('id');

    if (statusError) {
      console.error('Status cleanup error:', statusError);
    }

    // Delete messages marked as deleted_for_everyone
    const { data: deletedMessages, error: messageError } = await adminClient
      .from('messages')
      .delete()
      .eq('deleted_for_everyone', true)
      .select('id');

    if (messageError) {
      console.error('Message cleanup error:', messageError);
    }

    // NEW: Cleanup expired message envelopes (48h+ old or delivered 1h+ ago)
    const { data: deletedEnvelopes, error: envelopeError } = await adminClient
      .from('message_envelopes')
      .delete()
      .or(`expires_at.lt.${new Date().toISOString()},and(is_delivered.eq.true,delivered_at.lt.${new Date(Date.now() - 3600000).toISOString()})`)
      .select('id');

    if (envelopeError) {
      console.error('Envelope cleanup error:', envelopeError);
    }

    // NEW: Cleanup expired delete instructions (7 days+)
    const { data: deletedInstructions, error: instructionError } = await adminClient
      .from('delete_instructions')
      .delete()
      .lt('expires_at', new Date().toISOString())
      .select('id');

    if (instructionError) {
      console.error('Delete instruction cleanup error:', instructionError);
    }

    // Delete orphaned status views (where status no longer exists)
    const { error: viewsError } = await adminClient.rpc('cleanup_expired_statuses');

    console.log(`Cleanup complete: ${deletedStatuses?.length || 0} statuses, ${deletedMessages?.length || 0} messages, ${deletedEnvelopes?.length || 0} envelopes, ${deletedInstructions?.length || 0} delete instructions`);

    return new Response(
      JSON.stringify({
        success: true,
        deletedStatuses: deletedStatuses?.length || 0,
        deletedMessages: deletedMessages?.length || 0,
        deletedEnvelopes: deletedEnvelopes?.length || 0,
        deletedInstructions: deletedInstructions?.length || 0,
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Cleanup error:', errorMessage);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});
