export interface Env {
  CLICKUP_TOKEN: pk_144062129_RJTSLR3NCV7S7QGKQLXLQH0NC5BWG0LW;
  WEBHOOK_SECRET: string; // setéalo después de crear el webhook
  STORE: KVNamespace;
}

/** ===================== Helpers ===================== **/
async function verifySignature(env: Env, rawBody: ArrayBuffer, signature: string | null) {
  // Durante el setup inicial podés dejar WEBHOOK_SECRET vacío (saltea verificación)
  if (!env.WEBHOOK_SECRET) return true;
  if (!signature) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(env.WEBHOOK_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );
  return crypto.subtle.verify("HMAC", key, hexToBuf(signature), rawBody);
}

function hexToBuf(hex: string) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  return bytes.buffer;
}

type HistoryItem = {
  id: string;
  field?: string; // "custom_field" si cambió un CF
  custom_field?: { id: string };
  after?: any;    // valor nuevo (según tipo de campo)
};

type WebhookBody = {
  event: string;  // "taskUpdated"
  task_id: string;
  history_items?: HistoryItem[];
};

// ⚠️ Poné acá los IDs de los custom fields a replicar
const FIELDS_WHITELIST = new Set<string>([
  // "abcd1234", "efgh5678"
]);

async function clickup(path: string, env: Env, init?: RequestInit) {
  const headers = {
    "Authorization": env.CLICKUP_TOKEN,
    "Content-Type": "application/json",
    ...(init?.headers || {})
  };
  return fetch(`https://api.clickup.com/api/v2${path}`, { ...init, headers });
}

// Más robusto: usar el endpoint específico de subtasks
async function getSubtaskIds(parentTaskId: string, env: Env): Promise<string[]> {
  const res = await clickup(`/task/${parentTaskId}/subtask`, env);
  if (!res.ok) throw new Error(`Get subtasks failed: ${res.status}`);
  const data = await res.json<any>();
  return (data?.tasks || []).map((t: any) => t.id);
}

// ClickUp espera distintos formatos según tipo de CF
function normalizeAfterValue(after: any) {
  if (after == null) return null;
  // Dropdowns suelen venir con { id, value } o directamente option_id
  if (typeof after === "object") {
    if ("id" in after) return after.id;          // option_id
    if ("value" in after) return after.value;    // valor primitivo
  }
  return after; // string/number/bool
}

async function setCustomField(taskId: string, fieldId: string, value: any, env: Env) {
  const res = await clickup(`/task/${taskId}/field/${fieldId}`, env, {
    method: "POST",
    body: JSON.stringify({ value })
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Set field ${fieldId} on ${taskId} failed: ${res.status} - ${txt}`);
  }
}

/** ===================== Worker ===================== **/
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Soportá GET para que no de 405 si abrís la URL en el navegador
    if (request.method !== "POST") {
      return new Response("ok", { status: 200 });
    }

    // Firma
    const raw = await request.arrayBuffer();
    const signature = request.headers.get("X-Signature");
    const valid = await verifySignature(env, raw, signature);
    if (!valid) return new Response("invalid signature", { status: 401 });

    // Payload
    const body = JSON.parse(new TextDecoder().decode(raw)) as WebhookBody;
    if (body.event !== "taskUpdated" || !body.history_items?.length) {
      return new Response("ignored", { status: 200 });
    }

    // Filtrá solo cambios de custom fields whitelisted
    const changed = body.history_items.filter(
      (h) => h.field === "custom_field" && h.custom_field?.id && FIELDS_WHITELIST.has(h.custom_field.id)
    );
    if (changed.length === 0) {
      return new Response("no relevant changes", { status: 200 });
    }

    // Procesar cada cambio una única vez (idempotencia)
    for (const h of changed) {
      const histKey = `hist:${body.task_id}:${h.id}`;
      const seen = await env.STORE.get(histKey);
      if (seen) continue;

      const fieldId = h.custom_field!.id;
      const newValue = normalizeAfterValue(h.after);

      // Traer subtasks
      const subtaskIds = await getSubtaskIds(body.task_id, env);
      for (const sid of subtaskIds) {
        await setCustomField(sid, fieldId, newValue, env);
      }

      // Marcar como procesado 7 días
      await env.STORE.put(histKey, "1", { expirationTtl: 60 * 60 * 24 * 7 });
    }

    return new Response("done", { status: 200 });
  },
};
