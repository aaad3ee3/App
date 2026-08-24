import { OAuth2Client } from "google-auth-library";
import { env } from "../../config/env";
import { HttpError } from "../../plugins/error-handler.plugin";

export interface GoogleIdentity {
  email: string;
  fullName: string | null;
}

/**
 * Cached because the client keeps Google's signing certificates in memory — building a new
 * one per sign-in would refetch them every time.
 */
let client: OAuth2Client | null = null;

function acceptedAudiences(): string[] {
  const extra = (env.GOOGLE_OAUTH_CLIENT_IDS ?? "").split(",");
  // The server client ID is always accepted: it is the audience the app is told to request,
  // so rejecting it would mean shipping a configuration that cannot succeed.
  return [env.GOOGLE_SERVER_CLIENT_ID ?? "", ...extra]
    .map((id) => id.trim())
    .filter((id) => id.length > 0);
}

export function isGoogleSignInConfigured(): boolean {
  return acceptedAudiences().length > 0;
}

/**
 * Verifies a Google ID token and returns the identity it proves.
 *
 * The signature check is done locally against Google's published certificates rather than
 * by calling their tokeninfo endpoint — same guarantee, no per-login round trip, and no
 * dependency on Google being reachable at the exact moment a customer signs in.
 *
 * Two checks matter beyond the signature:
 *
 * - **audience** — `verifyIdToken` rejects any token not minted for one of our client IDs.
 *   Without it, a token issued to any other app would be accepted, and anyone could sign
 *   in as anyone by presenting a token they obtained legitimately elsewhere.
 * - **email_verified** — we treat a Google email as proof the holder controls that address,
 *   which is what makes it safe to sign them into an existing password account with the
 *   same email. That inference only holds if Google actually verified it.
 */
export async function verifyGoogleIdToken(idToken: string): Promise<GoogleIdentity> {
  const audience = acceptedAudiences();
  if (audience.length === 0) {
    throw new HttpError(503, "google_signin_unavailable", "تسجيل الدخول بجوجل غير مفعّل حالياً");
  }

  client ??= new OAuth2Client();

  let payload;
  try {
    const ticket = await client.verifyIdToken({ idToken, audience });
    payload = ticket.getPayload();
  } catch {
    // Deliberately no detail: expired, wrong audience, and forged all look the same to the
    // caller, and the distinction is only useful to someone probing.
    throw new HttpError(401, "invalid_google_token", "تعذّر التحقق من حساب جوجل");
  }

  if (!payload?.email) {
    throw new HttpError(401, "invalid_google_token", "حساب جوجل بدون بريد إلكتروني");
  }
  if (!payload.email_verified) {
    throw new HttpError(401, "google_email_unverified", "بريد حساب جوجل غير موثّق");
  }

  return {
    email: payload.email.trim().toLowerCase(),
    fullName: payload.name?.trim() || null,
  };
}
