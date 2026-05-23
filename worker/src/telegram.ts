import type { Env } from "./index";

export interface SendOpts {
  dry?: boolean;
}

export async function sendTelegram(
  env: Env,
  text: string,
  opts: SendOpts = {},
): Promise<void> {
  if (opts.dry) {
    console.log("[dry] telegram:", text);
    return;
  }
  const url = `https://api.telegram.org/bot${env.TG_API_KEY}/sendMessage`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: env.TG_CHANNEL,
      text,
      parse_mode: "Markdown",
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`telegram send failed: ${res.status} ${body}`);
  }
}
