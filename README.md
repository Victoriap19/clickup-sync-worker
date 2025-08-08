# ClickUp Sync Worker

Este Cloudflare Worker sincroniza automáticamente custom fields de tareas padre a sus subtareas en ClickUp.

## Características

- ✅ Endpoint público que recibe webhooks de ClickUp
- ✅ Verificación de firma para seguridad
- ✅ Sincronización automática de custom fields seleccionados
- ✅ KV storage para idempotencia (no procesa cambios duplicados)
- ✅ Filtrado por custom fields específicos

## Configuración

### 1. Variables de Entorno

Necesitas configurar las siguientes variables de entorno:

```bash
# Token de ClickUp (obtener desde https://app.clickup.com/settings/apps)
npx wrangler secret put CLICKUP_TOKEN

# Secreto del webhook (se configura después de crear el webhook en ClickUp)
npx wrangler secret put WEBHOOK_SECRET
```

### 2. Custom Fields a Sincronizar

Edita el archivo `src/index.ts` y agrega los IDs de los custom fields que quieres sincronizar en el array `FIELDS_WHITELIST`:

```typescript
const FIELDS_WHITELIST = new Set<string>([
  "abcd1234", // ID del custom field 1
  "efgh5678", // ID del custom field 2
]);
```

### 3. Obtener Custom Field IDs

Para obtener los IDs de los custom fields, puedes usar el script incluido:

```bash
# Usando npm script
npm run get-fields <TASK_ID> <CLICKUP_TOKEN>

# O directamente
node scripts/get-custom-fields.js <TASK_ID> <CLICKUP_TOKEN>
```

Ejemplo:
```bash
npm run get-fields abc123 pk_123456_ABCDEF
```

El script te mostrará todos los custom fields de la tarea y te dará el código listo para copiar en `FIELDS_WHITELIST`.

### 4. Desplegar el Worker

```bash
npm run deploy
```

### 5. Crear el Webhook en ClickUp

1. Ve a tu espacio de ClickUp
2. Ve a Settings > Apps
3. Crea una nueva app
4. En la sección de webhooks, agrega:
   - **URL**: `https://clickup-sync.TU_SUBDOMINIO.workers.dev`
   - **Events**: Selecciona `taskUpdated`
   - **Secret**: Genera un secreto y configúralo como `WEBHOOK_SECRET`

## Uso

Una vez configurado, el worker automáticamente:

1. Recibe webhooks cuando se actualiza una tarea
2. Verifica que el cambio sea en un custom field de la lista blanca
3. Obtiene todas las subtareas de la tarea padre
4. Copia el valor del custom field a todas las subtareas
5. Marca el cambio como procesado para evitar duplicados

## Desarrollo Local

```bash
# Instalar dependencias
npm install

# Ejecutar en modo desarrollo
npm run dev

# Probar el endpoint
curl -X POST http://localhost:8787 \
  -H "Content-Type: application/json" \
  -d '{"event":"taskUpdated","task_id":"test","history_items":[]}'
```

## Estructura del Proyecto

- `src/index.ts` - Código principal del worker
- `wrangler.jsonc` - Configuración de Wrangler
- `package.json` - Dependencias del proyecto

## Troubleshooting

### Error de verificación de firma
- Asegúrate de que `WEBHOOK_SECRET` esté configurado correctamente
- Verifica que el secreto en ClickUp coincida con el del worker

### Custom fields no se sincronizan
- Verifica que los IDs en `FIELDS_WHITELIST` sean correctos
- Asegúrate de que las tareas tengan subtareas
- Revisa los logs del worker para errores específicos

### Errores de API
- Verifica que `CLICKUP_TOKEN` tenga permisos suficientes
- Asegúrate de que el token no haya expirado
