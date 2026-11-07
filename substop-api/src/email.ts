export const AGENTMAIL_INBOX = "substop.customerservice@agentmail.to";

export const REGISTER_SUBJECT = "Köszönjük, hogy a SubStopot választottad!";
export const LOGIN_SUBJECT = "Új bejelentkezés a SubStop fiókodba";

const REGISTER_BODY = `Szia!

Köszönjük, hogy regisztráltál, és a SubStopot választottad! Ha bármi kérdésed van, csak válaszolj erre a levélre.

Üdv,
a SubStop csapat
`;

export function registerBody(): string {
  return REGISTER_BODY;
}

export function budapestStamp(now: Date): string {
  const parts = new Intl.DateTimeFormat("hu-HU", {
    timeZone: "Europe/Budapest",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  const formatted = `${part("year")}. ${part("month")} ${part("day")}. ${part("hour")}:${part("minute")}`;
  return `Időpont: ${formatted} (Europe/Budapest).`;
}

export function deviceSummary(userAgent: string | null): string {
  const ua = (userAgent || "").slice(0, 400);
  if (!ua.trim()) return "Eszköz: ismeretlen böngésző, ismeretlen rendszer.";
  return `Eszköz: ${browserName(ua)}, ${osName(ua)}.`;
}

function browserName(ua: string): string {
  if (/Edg\//.test(ua)) return "Edge";
  if (/OPR\/|Opera/.test(ua)) return "Opera";
  if (/Firefox\//.test(ua)) return "Firefox";
  if (/Chrome\//.test(ua)) return "Chrome";
  if (/Safari\//.test(ua)) return "Safari";
  return "ismeretlen böngésző";
}

function osName(ua: string): string {
  if (/Android/.test(ua)) return "Android";
  if (/iPhone|iPad|iPod/.test(ua)) return "iOS";
  if (/Windows NT/.test(ua)) return "Windows";
  if (/Mac OS X/.test(ua)) return "macOS";
  if (/CrOS/.test(ua)) return "ChromeOS";
  if (/Linux/.test(ua)) return "Linux";
  return "ismeretlen rendszer";
}

export function loginBody(now: Date, userAgent: string | null): string {
  const line = `${budapestStamp(now)} ${deviceSummary(userAgent)}`;
  return `Szia!

Új bejelentkezést észleltünk a fiókodban. Üdvözlünk az új eszközödön!
${line}

Ha nem te voltál, kérjük, azonnal változtasd meg a jelszavad, és írj nekünk.

Üdv,
a SubStop csapat
`;
}

export async function sendInboxEmail(
  apiKey: string | undefined,
  message: { to: string; subject: string; text: string; kind: "registration" | "login" },
): Promise<void> {
  if (!apiKey) {
    console.log(JSON.stringify({
      message: "AGENTMAIL_API_KEY unset, skipping email",
      kind: message.kind,
      subject: message.subject,
    }));
    return;
  }
  const url = `https://api.agentmail.to/v0/inboxes/${encodeURIComponent(AGENTMAIL_INBOX)}/messages/send`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      to: [message.to],
      subject: message.subject,
      text: message.text,
    }),
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    console.error(JSON.stringify({
      message: "agentmail send failed",
      kind: message.kind,
      status: response.status,
      detail,
    }));
  }
}
