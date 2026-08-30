import { db } from "../../db/knex";

export interface DeviceTokenRow {
  id: string;
  user_id: string;
  token: string;
  platform: "android" | "ios" | "web";
  last_seen_at: Date;
  created_at: Date;
}

/**
 * Records (or re-points) a device token.
 *
 * The conflict target is the token alone, and it reassigns `user_id`. That matters when
 * a phone changes hands or someone signs into a second account on the same device: the
 * token must move, or the previous account keeps receiving that phone's notifications —
 * a privacy leak, since those messages name order amounts and card codes.
 */
export async function upsertDeviceToken(input: {
  userId: string;
  token: string;
  platform: DeviceTokenRow["platform"];
}): Promise<void> {
  await db.raw(
    `INSERT INTO device_tokens (user_id, token, platform, last_seen_at)
     VALUES (?, ?, ?, now())
     ON CONFLICT (token)
     DO UPDATE SET user_id = EXCLUDED.user_id, platform = EXCLUDED.platform, last_seen_at = now()`,
    [input.userId, input.token, input.platform]
  );
}

export function listTokensForUser(userId: string): Promise<DeviceTokenRow[]> {
  return db<DeviceTokenRow>("device_tokens").where({ user_id: userId });
}

/** Removes tokens FCM has told us are dead, so we stop paying to send to them. */
export async function deleteTokens(tokens: string[]): Promise<number> {
  if (tokens.length === 0) return 0;
  return db("device_tokens").whereIn("token", tokens).del();
}

/** Used on sign-out, so a shared or sold device stops receiving the account's messages. */
export async function deleteTokenForUser(userId: string, token: string): Promise<number> {
  return db("device_tokens").where({ user_id: userId, token }).del();
}
