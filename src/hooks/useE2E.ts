import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  generateKeyPair,
  getStoredPrivateKey,
  encryptMessage,
  decryptMessage,
  serializePublicKey,
  deserializePublicKey,
} from "@/lib/e2eCrypto";

/**
 * Hook that manages E2E encryption keys and provides encrypt/decrypt helpers.
 * - On mount: ensures user has a key pair (generates if missing)
 * - Provides encrypt/decrypt for a given conversation partner
 */
export function useE2E(currentUserId: string) {
  const [ready, setReady] = useState(false);
  const privateKeyRef = useRef<CryptoKey | null>(null);
  const publicKeyCacheRef = useRef<Map<string, JsonWebKey>>(new Map());

  // Initialize: ensure we have a key pair
  useEffect(() => {
    if (!currentUserId) return;

    (async () => {
      try {
        let privateKey = await getStoredPrivateKey();

        if (!privateKey) {
          // Generate new key pair
          const { publicKeyJwk, privateKey: newPrivateKey } = await generateKeyPair();
          privateKey = newPrivateKey;

          // Store public key in database
          await (supabase as any).from("user_public_keys").upsert({
            user_id: currentUserId,
            public_key: serializePublicKey(publicKeyJwk),
            updated_at: new Date().toISOString(),
          }, { onConflict: "user_id" });
        }

        privateKeyRef.current = privateKey;
        setReady(true);
      } catch (err) {
        console.error("E2E init error:", err);
        // Still mark ready so messaging works (unencrypted fallback)
        setReady(true);
      }
    })();
  }, [currentUserId]);

  // Fetch another user's public key
  const getPublicKey = useCallback(async (userId: string): Promise<JsonWebKey | null> => {
    // Check cache
    const cached = publicKeyCacheRef.current.get(userId);
    if (cached) return cached;

    const { data } = await supabase
      .from("user_public_keys")
      .select("public_key")
      .eq("user_id", userId)
      .maybeSingle();

    if (data?.public_key) {
      const jwk = deserializePublicKey(data.public_key);
      publicKeyCacheRef.current.set(userId, jwk);
      return jwk;
    }
    return null;
  }, []);

  // Encrypt a message for a specific user
  const encrypt = useCallback(async (plaintext: string, recipientUserId: string): Promise<string | null> => {
    if (!privateKeyRef.current) return null;

    try {
      const theirKey = await getPublicKey(recipientUserId);
      if (!theirKey) return null;

      return await encryptMessage(plaintext, privateKeyRef.current, theirKey);
    } catch (err) {
      console.error("Encryption error:", err);
      return null;
    }
  }, [getPublicKey]);

  // Decrypt a message from a specific user
  const decrypt = useCallback(async (encrypted: string, senderUserId: string): Promise<string | null> => {
    if (!privateKeyRef.current) return null;

    try {
      const theirKey = await getPublicKey(senderUserId);
      if (!theirKey) return null;

      return await decryptMessage(encrypted, privateKeyRef.current, theirKey);
    } catch (err) {
      console.error("Decryption error:", err);
      return null;
    }
  }, [getPublicKey]);

  return { ready, encrypt, decrypt };
}
