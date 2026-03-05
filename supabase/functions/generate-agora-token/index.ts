import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const AGORA_APP_ID = '7fbe9dab88334b8181c19874a3ad0931';

// ===== Agora Token Builder (pure implementation, no npm dependency) =====

const VERSION = "006";
const PRIVILEGES = {
  kJoinChannel: 1,
  kPublishAudioStream: 2,
  kPublishVideoStream: 3,
  kPublishDataStream: 4,
};

function encodeUint16(val: number): Uint8Array {
  const buf = new Uint8Array(2);
  buf[0] = val & 0xff;
  buf[1] = (val >> 8) & 0xff;
  return buf;
}

function encodeUint32(val: number): Uint8Array {
  const buf = new Uint8Array(4);
  buf[0] = val & 0xff;
  buf[1] = (val >> 8) & 0xff;
  buf[2] = (val >> 16) & 0xff;
  buf[3] = (val >> 24) & 0xff;
  return buf;
}

function encodeString(str: string): Uint8Array {
  const encoded = new TextEncoder().encode(str);
  const lenBuf = encodeUint16(encoded.length);
  const result = new Uint8Array(lenBuf.length + encoded.length);
  result.set(lenBuf);
  result.set(encoded, lenBuf.length);
  return result;
}

function encodeBytes(data: Uint8Array): Uint8Array {
  const lenBuf = encodeUint16(data.length);
  const result = new Uint8Array(lenBuf.length + data.length);
  result.set(lenBuf);
  result.set(data, lenBuf.length);
  return result;
}

function concatArrays(...arrays: Uint8Array[]): Uint8Array {
  const totalLength = arrays.reduce((acc, arr) => acc + arr.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

function packPrivileges(privileges: Record<number, number>): Uint8Array {
  const entries = Object.entries(privileges);
  let result = encodeUint16(entries.length);
  for (const [key, value] of entries) {
    result = concatArrays(result, encodeUint16(Number(key)), encodeUint32(value));
  }
  return result;
}

function packContent(uid: number, salt: number, ts: number, privileges: Record<number, number>): Uint8Array {
  return concatArrays(
    encodeUint32(uid),
    encodeUint32(salt),
    encodeUint32(ts),
    packPrivileges(privileges)
  );
}

async function hmacSign(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, data);
  return new Uint8Array(signature);
}

function toBase64(data: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < data.length; i++) {
    binary += String.fromCharCode(data[i]);
  }
  return btoa(binary);
}

async function buildToken(
  appId: string,
  appCertificate: string,
  channelName: string,
  uid: number,
  privilegeExpiredTs: number
): Promise<string> {
  const ts = Math.floor(Date.now() / 1000);
  const salt = Math.floor(Math.random() * 0xFFFFFFFF);

  const privileges: Record<number, number> = {
    [PRIVILEGES.kJoinChannel]: privilegeExpiredTs,
    [PRIVILEGES.kPublishAudioStream]: privilegeExpiredTs,
    [PRIVILEGES.kPublishVideoStream]: privilegeExpiredTs,
    [PRIVILEGES.kPublishDataStream]: privilegeExpiredTs,
  };

  const content = packContent(uid, salt, ts, privileges);

  // Sign: HMAC-SHA256(appCertificate, appId + channelName + uidStr + content)
  const uidStr = uid === 0 ? '' : String(uid);
  const certKey = new TextEncoder().encode(appCertificate);

  const signData = concatArrays(
    new TextEncoder().encode(appId),
    new TextEncoder().encode(channelName),
    new TextEncoder().encode(uidStr),
    content
  );

  const signature = await hmacSign(certKey, signData);

  // Pack final token
  const tokenContent = concatArrays(
    encodeString(appId),
    encodeUint32(ts),
    encodeUint32(salt),
    encodeBytes(signature),
    encodeBytes(content)
  );

  return VERSION + toBase64(tokenContent);
}

// ===== End Token Builder =====

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return hash;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const body = await req.json().catch(() => ({}));
    const { channelName } = body;

    if (!channelName) {
      return new Response(JSON.stringify({ error: 'channelName is required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const appCertificate = Deno.env.get('AGORA_APP_CERTIFICATE');

    if (!appCertificate) {
      console.error('Missing AGORA_APP_CERTIFICATE');
      return new Response(JSON.stringify({ error: 'Server configuration error: missing certificate' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const uid = Math.abs(hashCode(user.id)) % 100000000;
    const expirationTimeInSeconds = 3600;
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const privilegeExpiredTs = currentTimestamp + expirationTimeInSeconds;

    console.log(`Generating token for channel: ${channelName}, uid: ${uid}`);

    const token = await buildToken(
      AGORA_APP_ID,
      appCertificate,
      channelName,
      uid,
      privilegeExpiredTs
    );

    console.log('Token generated successfully');

    return new Response(
      JSON.stringify({ token, uid, channelName }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('Agora token generation error:', err);
    return new Response(
      JSON.stringify({ error: 'Token generation failed', message: String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
