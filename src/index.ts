export interface Env {
  CLICKUP_TOKEN: string;
  WEBHOOK_SECRET: string; // lo completamos después de crear el webhook
  STORE: KVNamespace;
}

// Helpers
async function verifySignature(env: Env, rawBody: ArrayBuffer, signature: string | null) {
  // Durante setup inicial, podés dejar WEBHOOK_SECRET vacío (para probar rápido)
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
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes.buffer;
}

type HistoryItem = {
  id: string;
  field?: string; // "custom_field" si es un cambio de custom field
  custom_field?: { id: string };
  after?: any;    // valor nuevo (para dropdown suele venir como option_id o estructura)
};

type WebhookBody = {
  event: string;  // "taskUpdated"
  task_id: string;
  history_items?: HistoryItem[];
};

// ⚠️ Poné acá los "custom_field_id" que querés replicar.
const FIELDS_WHITELIST = new Set<string>([
  // "abcd1234", "efgh5678"
]);

async function fetchClickUp(path: string, env: Env, init?: RequestInit) {
  const headers = {
    "Authorization": env.CLICKUP_TOKEN,
    "Content-Type": "application/json",
    ...(init?.headers || {})
  };
  return fetch(`https://api.clickup.com/api/v2${path}`, { ...init, headers });
}

async function getTaskWithSubtasks(taskId: string, env: Env) {
  const res = await fetchClickUp(`/task/${taskId}?include_subtasks=true`, env);
  if (!res.ok) throw new Error(`Get task failed: ${res.status}`);
  return res.json<any>();
}

async function setCustomField(subtaskId: string, fieldId: string, value: any, env: Env) {
  const res = await fetchClickUp(`/task/${subtaskId}/field/${fieldId}`, env, {
    method: "POST",
    body: JSON.stringify({ value })
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Set field ${fieldId} on ${subtaskId} failed: ${res.status} - ${txt}`);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== "POST") {
      return new Response("ok", { status: 200 });
    }

    const raw = await request.arrayBuffer();
    const signature = request.headers.get("X-Signature");

    // Verificar firma (si WEBHOOK_SECRET está seteado)
    const valid = await verifySignature(env, raw, signature);
    if (!valid) return new Response("invalid signature", { status: 401 });

    const body = JSON.parse(new TextDecoder().decode(raw)) as WebhookBody;

    if (body.event !== "taskUpdated" || !body.history_items?.length) {
      return new Response("ignored", { status: 200 });
    }

    // Filtrá cambios solo en los custom fields que te interesan
    const changedCF = body.history_items.filter(
      (h) => h.field === "custom_field" && h.custom_field?.id && FIELDS_WHITELIST.has(h.custom_field.id)
    );

    if (changedCF.length === 0) {
      return new Response("no relevant changes", { status: 200 });
    }

    // Evitar reprocesar el mismo cambio (idempotencia)
    for (const h of changedCF) {
      const histKey = `hist:${body.task_id}:${h.id}`;
      const seen = await env.STORE.get(histKey);
      if (seen) continue;

      // Traer task y subtasks
      const task = await getTaskWithSubtasks(body.task_id, env);
      const subtasks = (task?.subtasks || task?.tasks || []).map((t: any) => t.id) as string[];

      const fieldId = h.custom_field!.id;
      // OJO: para dropdowns, ClickUp espera option_id, no el label.
      // En muchos casos "h.after" ya trae el formato correcto. Si no, habrá que mapear.
      const newValue = (h as any).after?.value ?? h.after ?? null;

      // Actualizar cada subtask
      for (const sid of subtasks) {
        await setCustomField(sid, fieldId, newValue, env);
      }

      // marcar como procesado por 7 días
      await env.STORE.put(histKey, "1", { expirationTtl: 60 * 60 * 24 * 7 });
    }

    return new Response("done", { status: 200 });
  },
};
