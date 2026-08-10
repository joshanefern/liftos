-- ============================================================================
-- Drop the pgsodium-backed Strava token wrappers.
--
-- Strava token storage now uses app-side AES-GCM-256 in the Edge Functions
-- (see supabase/functions/_shared/strava-token-crypto.ts). The
-- encrypt_strava_token / decrypt_strava_token SECURITY DEFINER wrappers
-- from 20260512000000_pgsodium_strava_tokens.sql are unused and dropped here.
--
-- Why we pivoted away from pgsodium:
--   pgsodium's AEAD primitives require execute privilege that postgres does
--   not hold on Supabase-managed projects. The supported escape hatch — GRANT
--   pgsodium_keyholder TO postgres — requires ADMIN OPTION on the role,
--   which only supabase_admin holds. Both `GRANT EXECUTE ON FUNCTION
--   pgsodium.crypto_aead_det_encrypt ...` (42501, not the owner) and
--   `GRANT pgsodium_keyholder TO postgres` (42501, no ADMIN OPTION) fail
--   from the SQL editor. Vault sits on the same pgsodium graph and risks
--   the same wall one layer up, plus a schema change.
--
-- App-side AES-GCM keeps the same security posture (encryption at rest with
-- a symmetric key separated from data) and sidesteps the permission graph.
-- wearable_integrations.access_token / refresh_token columns are unchanged;
-- they now hold "iv_b64.ct_b64" AES-GCM ciphertext instead of pgsodium.
--
-- The pgsodium key 'strava_tokens' is left dormant. pgsodium doesn't expose
-- a clean drop_key counterpart to create_key; the key is inert with the
-- wrappers gone and removing it isn't worth the complexity.
-- ============================================================================

DROP FUNCTION IF EXISTS public.encrypt_strava_token(TEXT);
DROP FUNCTION IF EXISTS public.decrypt_strava_token(TEXT);
