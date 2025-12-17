import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface PushNotificationRequest {
  type: "message" | "group_message" | "call" | "group_call";
  recipientIds: string[];
  senderId: string;
  senderName: string;
  content?: string;
  conversationId?: string;
  callType?: "audio" | "video";
  groupName?: string;
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify user authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
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
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const ONESIGNAL_APP_ID = Deno.env.get("ONESIGNAL_APP_ID");
    const ONESIGNAL_REST_API_KEY = Deno.env.get("ONESIGNAL_REST_API_KEY");

    if (!ONESIGNAL_APP_ID || !ONESIGNAL_REST_API_KEY) {
      console.error("OneSignal credentials not configured");
      return new Response(
        JSON.stringify({ error: "OneSignal not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const request: PushNotificationRequest = await req.json();
    console.log("Push notification request:", JSON.stringify(request));

    // Verify the sender matches the authenticated user
    if (request.senderId !== user.id) {
      return new Response(
        JSON.stringify({ success: false, error: "Sender mismatch" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { type, recipientIds, senderId, senderName, content, callType, groupName } = request;

    if (!recipientIds || recipientIds.length === 0) {
      return new Response(
        JSON.stringify({ success: false, message: "No recipients" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const filteredRecipients = recipientIds.filter(id => id !== senderId);
    
    if (filteredRecipients.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No external recipients" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let notificationContent: { en: string; hi: string };
    let headings: { en: string; hi: string };

    switch (type) {
      case "message":
        headings = {
          en: `New message from ${senderName}`,
          hi: `${senderName} का नया संदेश`
        };
        notificationContent = {
          en: content && content.length > 50 ? content.substring(0, 50) + "..." : content || "Sent you a message",
          hi: content && content.length > 50 ? content.substring(0, 50) + "..." : content || "आपको एक संदेश भेजा"
        };
        break;

      case "group_message":
        headings = {
          en: `${senderName} in ${groupName || "Group"}`,
          hi: `${groupName || "ग्रुप"} में ${senderName}`
        };
        notificationContent = {
          en: content && content.length > 50 ? content.substring(0, 50) + "..." : content || "Sent a message in the group",
          hi: content && content.length > 50 ? content.substring(0, 50) + "..." : content || "ग्रुप में संदेश भेजा"
        };
        break;

      case "call":
        headings = {
          en: `${callType === "video" ? "Video" : "Audio"} Call`,
          hi: `${callType === "video" ? "वीडियो" : "ऑडियो"} कॉल`
        };
        notificationContent = {
          en: `${senderName} is calling you`,
          hi: `${senderName} आपको कॉल कर रहा है`
        };
        break;

      case "group_call":
        headings = {
          en: `Group ${callType === "video" ? "Video" : "Audio"} Call`,
          hi: `ग्रुप ${callType === "video" ? "वीडियो" : "ऑडियो"} कॉल`
        };
        notificationContent = {
          en: `${senderName} started a group call in ${groupName || "Group"}`,
          hi: `${senderName} ने ${groupName || "ग्रुप"} में ग्रुप कॉल शुरू किया`
        };
        break;

      default:
        headings = { en: "Campus Talks", hi: "Campus Talks" };
        notificationContent = { en: "You have a new notification", hi: "आपके पास एक नई सूचना है" };
    }

    // OneSignal API request
    const oneSignalPayload = {
      app_id: ONESIGNAL_APP_ID,
      headings: headings,
      contents: notificationContent,
      include_external_user_ids: filteredRecipients,
      channel_for_external_user_ids: "push",
      priority: 10,
      ttl: 86400,
      ios_sound: "default",
      android_sound: "default"
    };

    console.log("Sending to OneSignal:", JSON.stringify(oneSignalPayload));

    const oneSignalResponse = await fetch("https://onesignal.com/api/v1/notifications", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Basic ${ONESIGNAL_REST_API_KEY}`
      },
      body: JSON.stringify(oneSignalPayload)
    });

    const responseData = await oneSignalResponse.json();
    console.log("OneSignal response:", JSON.stringify(responseData));

    if (!oneSignalResponse.ok) {
      console.error("OneSignal API error:", responseData);
      return new Response(
        JSON.stringify({ success: false, error: responseData }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, data: responseData }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Error sending push notification:", errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
