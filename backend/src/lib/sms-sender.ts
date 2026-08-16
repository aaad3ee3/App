import { env } from "../config/env";

/**
 * Outbound SMS.
 *
 * The app already *receives* SMS (the forwarder on the store's Libyana phone posts to
 * our webhook), but verification codes need the opposite direction, and Libya has no
 * mainstream programmable-SMS provider. So this is deliberately a thin, provider-agnostic
 * seam: point `SMS_GATEWAY_URL` at whatever you end up using — most merchants here run an
 * Android SMS-gateway app on the same phone that already forwards incoming messages.
 *
 * With no gateway configured, codes are written to the log instead of sent. That keeps
 * local development and the test suite working, and it is refused outright in production
 * (see config/env.ts) so nobody ships a build where "reset my password" silently prints
 * the code to a server log.
 */
export interface SmsSender {
  send(to: string, text: string): Promise<void>;
}

/** Development/test only. Prints the message so a developer can complete the flow. */
class ConsoleSmsSender implements SmsSender {
  async send(to: string, text: string): Promise<void> {
    // eslint-disable-next-line no-console
    console.info(`[sms:console] to=${to} text=${text}`);
  }
}

/**
 * POSTs JSON to a configurable endpoint. Field names are configurable because every
 * gateway app names them differently (`to`/`phone`/`number`, `message`/`text`/`body`).
 */
class HttpGatewaySmsSender implements SmsSender {
  constructor(
    private readonly url: string,
    private readonly toField: string,
    private readonly textField: string,
    private readonly apiKey: string | undefined
  ) {}

  async send(to: string, text: string): Promise<void> {
    const controller = new AbortController();
    // A hung gateway must not hold a customer's request open; the caller treats a
    // failure as "code not sent" and tells them to try again.
    const timeout = setTimeout(() => controller.abort(), 10_000);

    try {
      const response = await fetch(this.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
        },
        body: JSON.stringify({ [this.toField]: to, [this.textField]: text }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(`SMS gateway responded ${response.status}: ${body.slice(0, 200)}`);
      }
    } finally {
      clearTimeout(timeout);
    }
  }
}

let sender: SmsSender | null = null;

export function getSmsSender(): SmsSender {
  if (sender) return sender;

  sender = env.SMS_GATEWAY_URL
    ? new HttpGatewaySmsSender(
        env.SMS_GATEWAY_URL,
        env.SMS_GATEWAY_TO_FIELD,
        env.SMS_GATEWAY_TEXT_FIELD,
        env.SMS_GATEWAY_API_KEY
      )
    : new ConsoleSmsSender();

  return sender;
}

/** Test seam — lets the suite assert what would have been sent without a network call. */
export function setSmsSenderForTesting(custom: SmsSender | null): void {
  sender = custom;
}
