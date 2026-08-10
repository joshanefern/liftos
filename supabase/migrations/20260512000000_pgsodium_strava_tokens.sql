-- ============================================================================
-- pgsodium-backed encryption for Strava OAuth tokens
--
-- Adds a named key + SECURITY DEFINER helper functions for explicit encrypt /
-- decrypt of the access_token / refresh_token columns on wearable_integrations.
-- Edge Functions (running as service_role) call these via RPC. The column type
-- (TEXT) is unchanged — it now holds base64-encoded ciphertext.
-- ============================================================================

-- Idempotent key creation so this migration is safe to re-run.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pgsodium.valid_key WHERE name = 'strava_tokens') THEN
    PERFORM pgsodium.create_key(name => 'strava_tokens');
  END IF;
END $$;


CREATE OR REPLACE FUNCTION public.encrypt_strava_token(plaintext TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pgsodium
AS $$
DECLARE
  key_id UUID;
BEGIN
  SELECT id INTO key_id FROM pgsodium.valid_key WHERE name = 'strava_tokens' LIMIT 1;
  IF key_id IS NULL THEN
    RAISE EXCEPTION 'strava_tokens encryption key not found';
  END IF;
  RETURN encode(
    pgsodium.crypto_aead_det_encrypt(
      convert_to(plaintext, 'utf8'),
      convert_to('strava-token', 'utf8'),
      key_id
    ),
    'base64'
  );
END;
$$;


CREATE OR REPLACE FUNCTION public.decrypt_strava_token(ciphertext TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pgsodium
AS $$
DECLARE
  key_id UUID;
BEGIN
  SELECT id INTO key_id FROM pgsodium.valid_key WHERE name = 'strava_tokens' LIMIT 1;
  IF key_id IS NULL THEN
    RAISE EXCEPTION 'strava_tokens encryption key not found';
  END IF;
  RETURN convert_from(
    pgsodium.crypto_aead_det_decrypt(
      decode(ciphertext, 'base64'),
      convert_to('strava-token', 'utf8'),
      key_id
    ),
    'utf8'
  );
END;
$$;


-- Restrict who can call these. Edge Functions use service_role; clients should
-- never decrypt tokens directly.
REVOKE EXECUTE ON FUNCTION public.encrypt_strava_token(TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.encrypt_strava_token(TEXT) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.decrypt_strava_token(TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.decrypt_strava_token(TEXT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.encrypt_strava_token(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.decrypt_strava_token(TEXT) TO service_role;
