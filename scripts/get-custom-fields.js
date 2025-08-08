#!/usr/bin/env node
/**
 * Uso:
 *  node scripts/get-custom-fields.js list <LIST_ID> <CLICKUP_TOKEN>
 *  node scripts/get-custom-fields.js task <TASK_ID> <CLICKUP_TOKEN>
 */

const [,, mode, id, token] = process.argv;
if (!mode || !id || !token) {
  console.log('Uso:');
  console.log('  node scripts/get-custom-fields.js list <LIST_ID> <CLICKUP_TOKEN>');
  console.log('  node scripts/get-custom-fields.js task <TASK_ID> <CLICKUP_TOKEN>');
  process.exit(1);
}

const base = 'https://api.clickup.com/api/v2';

async function req(path) {
  const res = await fetch(base + path, {
    headers: { Authorization: token, 'Content-Type': 'application/json' }
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json();
}

(async () => {
  try {
    if (mode === 'list') {
      const data = await req(`/list/${id}/field`);
      const fields = data?.fields || [];
      console.log('FIELDS_WHITELIST snippet:\n');
      console.log('const FIELDS_WHITELIST = new Set<string>([');
      for (const f of fields) {
        console.log(`  "${f.id}", // ${f.name} (${f.type_config?.type || 'unknown'})`);
      }
      console.log(']);');
    } else if (mode === 'task') {
      const data = await req(`/task/${id}`);
      const cfs = data?.custom_fields || [];
      console.log(`Task: ${data?.name} (${data?.id})\nCustom Fields:`);
      for (const f of cfs) {
        console.log(`- ${f.id} | ${f.name} | value=${JSON.stringify(f.value)}`);
      }
    } else {
      console.log('Modo inválido. Usa "list" o "task".');
      process.exit(1);
    }
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
})();
