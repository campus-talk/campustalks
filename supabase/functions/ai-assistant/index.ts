import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface AIRequest {
  type: "tone_guard" | "smart_reply" | "spam_detection" | "reminder_detection" | "soften_message" | "auto_reply";
  message: string;
  context?: {
    conversationHistory?: string[];
    userPreferences?: {
      personality?: string;
      aboutMe?: string;
      strictness?: string;
    };
    modelPreference?: string;
  };
}

const getModel = (preference?: string) => {
  switch (preference) {
    case "fast": return "google/gemini-2.5-flash-lite";
    case "quality": return "google/gemini-2.5-pro";
    default: return "google/gemini-2.5-flash";
  }
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const { type, message, context }: AIRequest = await req.json();
    const model = getModel(context?.modelPreference);

    let systemPrompt = "";
    let userPrompt = "";

    switch (type) {
      case "tone_guard":
        const strictnessLevel = context?.userPreferences?.strictness || "medium";
        systemPrompt = `You are a message tone analyzer. Analyze the given message for toxicity and harsh language.
        
Strictness level: ${strictnessLevel}
- low: Only flag extremely rude, insulting, or very aggressive messages
- medium: Flag moderately harsh, rude, or negative messages  
- high: Flag even mildly rude or passive-aggressive messages

Respond ONLY with valid JSON in this exact format:
{
  "sentiment": "positive" | "neutral" | "negative",
  "toxicity": "none" | "mild" | "medium" | "high",
  "shouldWarn": boolean,
  "reason": "brief explanation if warning"
}`;
        userPrompt = `Analyze this message: "${message}"`;
        break;

      case "soften_message":
        const personality = context?.userPreferences?.personality || "";
        systemPrompt = `You are a helpful assistant that rewrites harsh messages in a polite, calm tone while keeping the same meaning. Keep the same language as the original message (Hindi, English, Hinglish, etc).
${personality ? `User's preferred style: ${personality}` : ""}

Respond ONLY with the softened message text, nothing else.`;
        userPrompt = `Rewrite this message in a softer, more polite way: "${message}"`;
        break;

      case "smart_reply":
        const aboutMe = context?.userPreferences?.aboutMe || "";
        const personalityPref = context?.userPreferences?.personality || "";
        systemPrompt = `You are a smart reply suggestion assistant. Generate 3 short, natural reply suggestions for the given message. 

Rules:
- Keep replies SHORT (max 7-8 words each)
- Match the language of the incoming message (Hindi, English, Hinglish, etc)
- Make them natural and conversational, not formal
- Don't be over-dramatic or use excessive emojis
${personalityPref ? `User's preferred reply style: ${personalityPref}` : ""}
${aboutMe ? `About the user replying: ${aboutMe}` : ""}

Respond ONLY with valid JSON in this exact format:
{
  "replies": ["reply1", "reply2", "reply3"]
}`;
        userPrompt = `Generate smart reply suggestions for: "${message}"`;
        break;

      case "spam_detection":
        systemPrompt = `You are a spam and scam detector. Analyze the given message for:
- Spam patterns (promotional content, bulk messaging)
- Scam/fraud indicators (lottery scams, loan scams, phishing)
- Dangerous or abusive content

Respond ONLY with valid JSON in this exact format:
{
  "isSuspicious": boolean,
  "flagType": "spam" | "scam" | "abuse" | "suspicious" | null,
  "confidence": number between 0 and 1,
  "reason": "brief explanation if flagged"
}`;
        userPrompt = `Analyze this message for spam/scam/abuse: "${message}"`;
        break;

      case "reminder_detection":
        systemPrompt = `You are a task and reminder detector. Analyze if the message mentions a task, deadline, or event that could be a reminder.

Look for patterns like:
- Time references (kal, tomorrow, 5 baje, next week, Sunday ko)
- Task words (करना है, submit, meeting, exam, call)
- Event mentions

Respond ONLY with valid JSON in this exact format:
{
  "hasReminder": boolean,
  "suggestedTitle": "short task title in same language" | null,
  "suggestedTime": "ISO datetime string if detectable" | null,
  "confidence": number between 0 and 1
}`;
        userPrompt = `Check if this message contains a reminder/task: "${message}"`;
        break;

      case "auto_reply":
        const autoReplyPrompt = context?.userPreferences?.personality || "You are a helpful assistant replying on behalf of the user.";
        const userAbout = context?.userPreferences?.aboutMe || "";
        const history = context?.conversationHistory?.slice(-5).join("\n") || "";
        
        systemPrompt = `${autoReplyPrompt}

${userAbout ? `About the user you're replying for: ${userAbout}` : ""}

You are replying to a message while the user is offline. Keep replies natural, helpful, and in the same language as the incoming message.`;
        userPrompt = `${history ? `Recent conversation:\n${history}\n\n` : ""}Reply to this message: "${message}"`;
        break;

      default:
        throw new Error(`Unknown AI request type: ${type}`);
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: 500,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded, please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const aiResponse = data.choices?.[0]?.message?.content || "";

    // Parse JSON response for certain types
    if (["tone_guard", "smart_reply", "spam_detection", "reminder_detection"].includes(type)) {
      try {
        const parsed = JSON.parse(aiResponse);
        return new Response(JSON.stringify({ success: true, data: parsed }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch {
        // If parsing fails, return raw response
        return new Response(JSON.stringify({ success: true, data: aiResponse }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    return new Response(JSON.stringify({ success: true, data: aiResponse }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("AI assistant error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
