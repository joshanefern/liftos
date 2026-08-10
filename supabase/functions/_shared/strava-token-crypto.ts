// ============================================================================
// Strava OAuth token encryption (app-side AES-GCM-256).
//
// Used by strava-oauth and strava-fetch-activities Edge Functions.
//
// Why app-side and not pgsodium / vault:
//   pgsodium primitives (crypto_aead_det_encrypt) require execute privilege
//   that postgres does not hold on Supabase-managed projects, and the
//   role-membership escape hatch (GRANT pgsodium_keyholder TO postgres) is
//   gated on ADMIN OPTION that's only held by supabase_admin. Vault is the
//   same pgsodium graph one layer up. App-side AES-GCM sidesteps the entire
//   permission model and keeps the same security posture (encryption at rest
//   with a symmetric key separated from data).
//
// Key: STRAVA_TOKEN_ENCRYPTION_KEY env var, base64-encoded 32 bytes (256-bit).
// Generate with:   openssl rand -base64 32
//
// Ciphertext format: "<iv_b64>.<ciphertext_b64>"
//   - iv_b64: base64 of a fresh 12-byte (96-bit) IV, randomized per encrypt
//   - ciphertext_b64: base64 of AES-GCM output (ciphertext || 16-byte tag)
//   - Separator '.' is unambiguous because base64 never contains '.'
// ============================================================================

const KEY_ENV = "STRAVA_TOKEN_ENCRYPTION_KEY";

const decodeBase64 = (s: string): Uint8Array =>
  Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

const encodeBase64 = (bytes: Uint8Array): string => {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
};

let cachedKey: CryptoKey | null = null;

const loadKey = async (): Promise<CryptoKey> => {
  if (cachedKey) return cachedKey;
  const keyB64 = Deno.env.get(KEY_ENV);
  if (!keyB64) {
    throw new Error(`${KEY_ENV} not set in Functions Secrets`);
  }
  const keyBytes = decodeBase64(keyB64);
  if (keyBytes.length !== 32) {
    throw new Error(
      `${KEY_ENV} must decode to exactly 32 bytes (got ${keyBytes.length})`,
    );
  }
  cachedKey = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );
  return cachedKey;
};

export const encryptStravaToken = async (plaintext: string): Promise<string> => {
  const key = await loadKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      new TextEncoder().encode(plaintext),
    ),
  );
  return `${encodeBase64(iv)}.${encodeBase64(ct)}`;
};

export const decryptStravaToken = async (
  ciphertext: string,
): Promise<string> => {
  const dot = ciphertext.indexOf(".");
  if (dot < 0) {
    throw new Error("malformed Strava token ciphertext (expected iv.ct)");
  }
  const iv = decodeBase64(ciphertext.slice(0, dot));
  const ct = decodeBase64(ciphertext.slice(dot + 1));
  const key = await loadKey();
  const plainBytes = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    ct,
  );
  return new TextDecoder().decode(plainBytes);
};
