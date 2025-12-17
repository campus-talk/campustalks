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
    // Verify user authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false },
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Use service role for cleanup operations
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

    // Delete orphaned status views (where status no longer exists)
    const { error: viewsError } = await adminClient.rpc('cleanup_expired_statuses');

    console.log(`Cleanup complete: ${deletedStatuses?.length || 0} statuses, ${deletedMessages?.length || 0} messages`);

    return new Response(
      JSON.stringify({
        success: true,
        deletedStatuses: deletedStatuses?.length || 0,
        deletedMessages: deletedMessages?.length || 0,
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
