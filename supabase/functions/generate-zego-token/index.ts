import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// ZegoCloud Token04 generation
function generateToken04(
  appId: number,
  userId: string,
  serverSecret: string,
  effectiveTimeInSeconds: number
): string {
  if (!serverSecret || serverSecret.length !== 32) {
    throw new Error('Invalid server secret');
  }

  const createTime = Math.floor(Date.now() / 1000);
  const expireTime = createTime + effectiveTimeInSeconds;
  const nonce = Math.floor(Math.random() * 2147483647);

  const payload = JSON.stringify({
    app_id: appId,
    user_id: userId,
    nonce: nonce,
    ctime: createTime,
    expire: expireTime,
  });

  // Convert server secret hex to bytes (key for AES)
  const keyBytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++) {
    keyBytes[i] = parseInt(serverSecret.substring(i * 2, i * 2 + 2), 16);
  }

  // Generate random IV
  const iv = crypto.getRandomValues(new Uint8Array(16));

  // AES-128-CBC encrypt
  const encoder = new TextEncoder();
  const payloadBytes = encoder.encode(payload);

  // PKCS7 padding
  const blockSize = 16;
  const paddingLength = blockSize - (payloadBytes.length % blockSize);
  const paddedPayload = new Uint8Array(payloadBytes.length + paddingLength);
  paddedPayload.set(payloadBytes);
  for (let i = payloadBytes.length; i < paddedPayload.length; i++) {
    paddedPayload[i] = paddingLength;
  }

  // Import key and encrypt using Web Crypto API
  return crypto.subtle.importKey('raw', keyBytes, { name: 'AES-CBC' }, false, ['encrypt'])
    .then(key => crypto.subtle.encrypt({ name: 'AES-CBC', iv }, key, paddedPayload))
    .then(encrypted => {
      const encryptedBytes = new Uint8Array(encrypted);

      // Build binary token: expire(8) + iv_len(2) + iv + payload_len(2) + encrypted_payload
      const buf = new ArrayBuffer(8 + 2 + iv.length + 2 + encryptedBytes.length);
      const view = new DataView(buf);
      const arr = new Uint8Array(buf);

      // Expire time as int64 (write as two int32)
      view.setInt32(0, 0, false); // high 32 bits = 0
      view.setInt32(4, expireTime, false); // low 32 bits

      // IV length + IV
      view.setUint16(8, iv.length, false);
      arr.set(iv, 10);

      // Encrypted payload length + payload
      view.setUint16(10 + iv.length, encryptedBytes.length, false);
      arr.set(encryptedBytes, 12 + iv.length);

      // Base64 encode and prepend version "04"
      const base64 = btoa(String.fromCharCode(...arr));
      return '04' + base64;
    }) as unknown as string;
}

async function generateToken04Async(
  appId: number,
  userId: string,
  serverSecret: string,
  effectiveTimeInSeconds: number
): Promise<string> {
  const createTime = Math.floor(Date.now() / 1000);
  const expireTime = createTime + effectiveTimeInSeconds;
  const nonce = Math.floor(Math.random() * 2147483647);

  const payload = JSON.stringify({
    app_id: appId,
    user_id: userId,
    nonce: nonce,
    ctime: createTime,
    expire: expireTime,
  });

  // Convert server secret hex to bytes (key for AES)
  const keyBytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++) {
    keyBytes[i] = parseInt(serverSecret.substring(i * 2, i * 2 + 2), 16);
  }

  // Generate random IV
  const iv = crypto.getRandomValues(new Uint8Array(16));

  // AES-128-CBC encrypt
  const encoder = new TextEncoder();
  const payloadBytes = encoder.encode(payload);

  // PKCS7 padding
  const blockSize = 16;
  const paddingLength = blockSize - (payloadBytes.length % blockSize);
  const paddedPayload = new Uint8Array(payloadBytes.length + paddingLength);
  paddedPayload.set(payloadBytes);
  for (let i = payloadBytes.length; i < paddedPayload.length; i++) {
    paddedPayload[i] = paddingLength;
  }

  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-CBC' }, false, ['encrypt']);
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-CBC', iv }, key, paddedPayload);
  const encryptedBytes = new Uint8Array(encrypted);

  // Build binary token
  const totalLen = 8 + 2 + iv.length + 2 + encryptedBytes.length;
  const buf = new ArrayBuffer(totalLen);
  const view = new DataView(buf);
  const arr = new Uint8Array(buf);

  // Expire time as int64 (big-endian)
  view.setInt32(0, 0, false);
  view.setInt32(4, expireTime, false);

  // IV length + IV
  view.setUint16(8, iv.length, false);
  arr.set(iv, 10);

  // Encrypted payload length + payload  
  view.setUint16(10 + iv.length, encryptedBytes.length, false);
  arr.set(encryptedBytes, 12 + iv.length);

  // Base64 encode
  let binary = '';
  for (let i = 0; i < arr.length; i++) {
    binary += String.fromCharCode(arr[i]);
  }
  const base64 = btoa(binary);
  return '04' + base64;
}

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
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }

    const userId = data.user.id;
    const appId = 884450076;
    const serverSecret = Deno.env.get('ZEGOCLOUD_SERVER_SECRET')!;

    // Generate token valid for 24 hours
    const zegoToken = await generateToken04Async(appId, userId, serverSecret, 86400);

    return new Response(
      JSON.stringify({ token: zegoToken, userId }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('Token generation error:', err);
    return new Response(
      JSON.stringify({ error: 'Token generation failed' }),
      { status: 500, headers: corsHeaders }
    );
  }
});
