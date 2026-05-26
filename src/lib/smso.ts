const SMSO_BASE = "https://app.smso.ro/api/v1";

export interface SmsoConfig {
  enabled: boolean;
  api_key: string;
  sender_id: string;
}

export interface SmsoSender {
  id: number;
  name: string;
}

export interface SmsoSendResult {
  success: boolean;
  responseToken?: string;
  transaction_cost?: number;
  error?: string;
}

const ERROR_MAP: Record<number, string> = {
  400: "Cerere invalida.",
  401: "Cheie API invalida.",
  402: "Credit insuficient.",
  403: "Continut blocat de SMSO.",
  405: "Numar dezabonat.",
  409: "Limita de trimitere depasita. Incearca mai tarziu.",
  422: "SMS international restrictionat.",
};

async function smsoGet(apiKey: string, path: string) {
  return fetch(`${SMSO_BASE}${path}`, {
    headers: { "X-Authorization": apiKey },
    cache: "no-store",
  });
}

async function smsoPost(apiKey: string, path: string, params: Record<string, string>) {
  return fetch(`${SMSO_BASE}${path}`, {
    method: "POST",
    headers: {
      "X-Authorization": apiKey,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(params).toString(),
    cache: "no-store",
  });
}

export async function getSenders(apiKey: string): Promise<SmsoSender[] | { error: string }> {
  try {
    const res = await smsoGet(apiKey, "/senders");
    const data = await res.json() as { status: number; data?: SmsoSender[]; message?: string };
    if (!res.ok || data.status !== 200) {
      return { error: ERROR_MAP[data.status] ?? data.message ?? "Eroare la obtinerea senderelor." };
    }
    return data.data ?? [];
  } catch {
    return { error: "Eroare de retea." };
  }
}

export async function checkCredit(apiKey: string): Promise<{ credit: number } | { error: string }> {
  try {
    const res = await smsoGet(apiKey, "/credit-check");
    const data = await res.json() as { status: number; credit_value?: number; message?: string };
    if (!res.ok || data.status !== 200) {
      return { error: ERROR_MAP[data.status] ?? data.message ?? "Eroare la verificarea creditului." };
    }
    return { credit: data.credit_value ?? 0 };
  } catch {
    return { error: "Eroare de retea." };
  }
}

export async function sendSms(
  apiKey: string,
  params: {
    to: string;
    sender: string;
    body: string;
    type?: "transactional" | "marketing" | "otp";
    remove_special_chars?: boolean;
  }
): Promise<SmsoSendResult> {
  try {
    const res = await smsoPost(apiKey, "/send", {
      to: params.to,
      sender: params.sender,
      body: params.body,
      type: params.type ?? "marketing",
      remove_special_chars: params.remove_special_chars !== false ? "1" : "0",
    });
    const data = await res.json() as { status: number; responseToken?: string; transaction_cost?: number; message?: string };
    if (res.ok && data.status === 200) {
      return { success: true, responseToken: data.responseToken, transaction_cost: data.transaction_cost };
    }
    return { success: false, error: ERROR_MAP[data.status] ?? data.message ?? "Eroare necunoscuta." };
  } catch {
    return { success: false, error: "Eroare de retea." };
  }
}
