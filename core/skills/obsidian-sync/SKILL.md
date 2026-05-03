# Skill: obsidian-sync

Mantiene un vault de Obsidian sincronizado con el código del proyecto.
Skill de integración — requiere Obsidian corriendo localmente con el plugin Local REST API.

Triggers: /obsidian-sync, "actualizar obsidian", "sync vault", "documentar cambios",
"nota diaria", "actualizar docs", "actualizar vault".

---

## Prerequisitos

1. **Obsidian corriendo** con el plugin "Local REST API" activo.
2. **Token configurado** — en `.env.local` o en `settings.local.json`:
   ```
   OBSIDIAN_TOKEN=<tu-token>
   OBSIDIAN_API=http://127.0.0.1:27123
   ```
3. **Vault path configurado** en `project.yaml`:
   ```yaml
   integrations:
     obsidian:
       vault_path: "docs/mi-vault"   # relativo a la raíz del proyecto
       map:                           # área modificada → nota del vault a actualizar
         api: "03-api/endpoints.md"
         database: "02-base-de-datos/migraciones.md"
         frontend: "01-arquitectura/componentes.md"
         deploy: "06-deploy/ci-cd.md"
         decisions: "08-decisiones/log-decisiones.md"
   ```

---

## Comandos MCP del plugin Local REST API

```bash
TOKEN=$OBSIDIAN_TOKEN
API=http://127.0.0.1:27123

# Leer una nota
curl -s -H "Authorization: Bearer $TOKEN" "$API/vault/<ruta-nota>.md"

# Reemplazar una nota completa (PUT)
curl -X PUT \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: text/markdown" \
  --data-binary "contenido" \
  "$API/vault/<ruta-nota>.md"

# Agregar al final de una nota (PATCH)
curl -X PATCH \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: text/markdown" \
  --data-binary "\n## Nuevo contenido" \
  "$API/vault/<ruta-nota>.md"
```

---

## Flujo de sync

### 1. Identificar qué cambió

```bash
git log --oneline --since="today" 2>/dev/null || git log --oneline -5
git diff --name-only HEAD~1 HEAD
```

### 2. Mapear cambios → notas del vault

Usar el mapa configurado en `project.yaml` (`integrations.obsidian.map`).
Si no hay mapa configurado, usar criterio propio:

| Tipo de cambio | Nota típica a actualizar |
|---------------|--------------------------|
| Nuevos endpoints de API | sección de API del vault |
| Cambios en schema de BD | sección de base de datos / migraciones |
| Nuevas páginas o componentes | sección de arquitectura / UI |
| Deploy / infra | sección de deploy / CI-CD |
| Decisión de arquitectura | log de decisiones / ADRs |

### 3. Leer nota actual → actualizar → verificar

```bash
# 1. Leer estado actual
curl -s -H "Authorization: Bearer $TOKEN" "$API/vault/<ruta>.md"

# 2. Preparar contenido actualizado (mantener lo que ya había, agregar lo nuevo)

# 3. Escribir con PUT o PATCH según si reemplaza o agrega
```

### 4. Crear o actualizar nota diaria

```bash
DATE=$(date +%Y-%m-%d)
curl -X PUT \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: text/markdown" \
  --data-binary "# $DATE

## Implementado
- [listar cambios del día]

## Archivos modificados
$(git diff --name-only HEAD~1 HEAD | sed 's/^/- /')

## Commits
$(git log --oneline --since="today")

## Decisiones
- [si se tomó alguna decisión de arquitectura]

## Pendiente
- [si quedó algo sin terminar]
" \
  "$API/vault/daily-notes/$DATE.md"
```

---

## Template de ADR (para sección de decisiones)

Si la implementación implicó una decisión de arquitectura no documentada:

```markdown
## ADR-NNN — Título de la decisión (YYYY-MM-DD)

**Contexto**: Por qué se necesitó tomar esta decisión.

**Decisión**: Qué se decidió hacer exactamente.

**Alternativas descartadas**: Qué otras opciones se evaluaron.

**Consecuencias**: Qué implica esta decisión hacia adelante.
```

---

## Cuándo NO usar este skill

- Si Obsidian no está corriendo localmente → skip, no falla el flujo
- Si el proyecto no tiene `integrations.obsidian` en `project.yaml` → skip
- Si el cambio es trivial (fix de typo, cambio de style) → skip

---

## Relación con otros skills

- Es invocado opcionalmente por `new-feature` (Fase 6) y `local2prod` (Paso 5).
- Es una integración opcional — si no está configurada, los skills que la invocan la saltean.
- No invoca otros skills.
