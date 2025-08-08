#!/usr/bin/env node

/**
 * Script para obtener los custom field IDs de ClickUp
 * Uso: node scripts/get-custom-fields.js <TASK_ID> <CLICKUP_TOKEN>
 */

const taskId = process.argv[2];
const token = process.argv[3];

if (!taskId || !token) {
  console.log('Uso: node scripts/get-custom-fields.js <TASK_ID> <CLICKUP_TOKEN>');
  console.log('');
  console.log('Ejemplo:');
  console.log('  node scripts/get-custom-fields.js abc123 pk_123456_ABCDEF');
  process.exit(1);
}

async function getCustomFields() {
  try {
    const response = await fetch(`https://api.clickup.com/api/v2/task/${taskId}?include_subtasks=true`, {
      headers: {
        'Authorization': token,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Error ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    
    console.log('📋 Custom Fields encontrados:');
    console.log('');
    
    if (data.custom_fields && data.custom_fields.length > 0) {
      data.custom_fields.forEach(field => {
        console.log(`ID: ${field.id}`);
        console.log(`Nombre: ${field.name}`);
        console.log(`Tipo: ${field.type}`);
        console.log('---');
      });
      
      console.log('');
      console.log('🔧 Para usar en FIELDS_WHITELIST:');
      console.log('const FIELDS_WHITELIST = new Set<string>([');
      data.custom_fields.forEach(field => {
        console.log(`  "${field.id}", // ${field.name}`);
      });
      console.log(']);');
    } else {
      console.log('❌ No se encontraron custom fields en esta tarea');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

getCustomFields();
