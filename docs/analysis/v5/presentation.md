# forge v2.0+ — Análisis técnico independiente v5

**Evaluación dual-agent para equipos en Claude Code / OpenCode / Codex**  
Mayo 2026

---

## El problema: configurar agentes IA es más difícil de lo que parece

Un desarrollador que adopta Claude Code por primera vez se enfrenta a decisiones sin respuestas obvias:

- ¿Qué modelo asigno a cada agente? ¿Todos Sonnet? ¿Cuándo Opus?
- ¿Cómo instruyo al agente para que no salga de su directorio?
- ¿Cómo coordino que frontend y backend trabajen en paralelo sin conflictos?
- ¿Cuáles son las convenciones de Drizzle ORM que el agente debería conocer?
- ¿Cómo sé después de un mes que mis agentes no se desviaron del estándar?

Sin una solución estructurada, cada equipo descubre estas respuestas por prueba y error, produciendo configuraciones de calidad variable e irrepetibles entre proyectos.

---

## Lo que forge propone resolver

forge es un framework instalado como git submodule que genera configuraciones de agentes para cuatro runtimes: Claude Code, OpenCode, Kiro y Codex CLI.

**Propuesta de valor concreta:**

| Sin forge | Con forge |
|-----------|-----------|
| Agentes genéricos sin conocimiento de stack | 13 profiles con conocimiento específico verificado en código |
| Configuración manual por proyecto | Wizard de 10 preguntas que genera `project.yaml` válido |
| Sin forma de detectar deriva de agentes | Audit con `--json` y exit code 1, integrable en CI |
| Una config, un runtime | 4 adapters: Claude Code, OpenCode, Kiro, Codex |
| Sin compliance automático | Agente `compliance-reviewer` con GDPR, LGPD, CCPA, HIPAA, PCI-DSS |

---

## Benchmark: forge vs alternativas (escala 1-5)

| Criterio | forge | .cursorrules | CLAUDE.md manual | aider | DIY .claude/agents |
|----------|:-----:|:------------:|:----------------:|:-----:|:------------------:|
| Multi-agente con roles | **5** | 1 | 2 | 1 | 4 |
| Profiles por stack | **5** | 1 | 1 | 1 | 3 |
| Audit / drift detection | **5** | 1 | 1 | 1 | 1 |
| Multi-runtime | **5** | 1 | 2 | 1 | 2 |
| Compliance integrado | **4** | 1 | 2 | 1 | 3 |
| Catálogo MCP integrado | **4** | 1 | 1 | 1 | 1 |
| Setup inicial (facilidad) | 4 | **5** | 3 | 4 | 2 |
| Control sobre el contexto | 4 | 4 | **5** | 4 | **5** |
| Curva de aprendizaje | 3 | **5** | 4 | 4 | 2 |

forge es la única alternativa con audit de deriva, multi-runtime nativo y profiles curados. El costo es una curva de aprendizaje mayor.

---

## Benchmark: cuándo usar cada alternativa

| Herramienta | Mejor caso de uso |
|-------------|-------------------|
| **forge** | Equipo 2-8 personas, stack cubierto, Mac/Linux, compliance requerido |
| **.cursorrules** | Dev individual en Cursor, instrucciones de estilo simples |
| **CLAUDE.md manual** | Dev experimentado que quiere control total, sin dependencias |
| **aider** | Sesiones de pair programming en terminal, proyectos individuales |
| **DIY .claude/agents/** | Equipo que ya domina Claude Code y prefiere sin herramientas |

---

## Fortalezas reales verificadas en código

**1. Conocimiento de stack codificado, no boilerplate**

El `api-engineer` de `hono-drizzle` conoce:
- Drizzle no siempre genera migración `down` — hay que escribirla a mano
- Comando exacto: `pnpm --filter=api db:generate`
- Tests deben usar BD real (no mock del ORM)
- Multi-tenancy con `tenant_id` en cada query

Este conocimiento no existe en ninguna alternativa directa.

**2. Audit de deriva integrable en CI**

```bash
python3 .agentic/scripts/forge-audit.py --json | jq '.summary.errors'
```

Exit code 1 si hay errores. Ninguna alternativa libre tiene equivalente.

**3. Suite de 358 tests para el tooling interno**

210 funciones + parametrización. Los tests de profiles validan automáticamente que cualquier profile nuevo tenga todos los campos obligatorios.

---

## Problemas reales sin resolver

**1. Incompatibilidad Windows — Alta severidad**

`import termios` en línea 19 de `forge.py` sin guard. En Windows: `ModuleNotFoundError` sin mensaje orientativo. El requisito de macOS/Linux no está documentado en ningún lugar visible.

**2. Extensión VS Code — inaccesible**

624 líneas de TypeScript compiladas. Status bar, tree views, 6 comandos en Command Palette. Pero: sin campo `publisher`, sin `.vsix`, sin documentación de instalación. Valor potencial alto, valor real actual: cero para usuarios externos.

**3. Gobernanza sin mecanismos formales**

Sin tags semánticos, sin CHANGELOG, sin CI/CD propio. `VERSION = "2.0"` hardcodeado. Un adoptador no puede saber cuándo ocurre un breaking change ni fijar una versión estable.

**Otros problemas confirmados:** URL incorrecta en README (`socialweb-cl` vs `socialwebcl`), 4 profiles sin documentar en `agent-standard.md`, referencias a dominio `aitmpl.com` removido del código pero presente en docs.

---

## Veredicto: cuándo usar forge

**Sí, si:**
- macOS o Linux (Windows es bloqueante)
- Stack cubierto por los 13 profiles
- Equipo de 2+ personas
- Necesidad de compliance (GDPR, LGPD, Ley 21.719, CCPA, HIPAA, PCI-DSS)
- Alguien del equipo entiende git submodules

**No, si:**
- Desarrollador iniciándose en Claude Code que quiere empezar simple
- Windows sin WSL
- Proyecto personal o de un solo archivo
- El equipo prefiere control total sobre el contexto de sus agentes
- No hay disposición a gestionar dependencia externa sin releases formales

**Score global:** 5.7/10 — Valor diferencial real en su nicho, con deuda técnica relevante en gobernanza y onboarding.

---

## Roadmap sugerido (prioridad del análisis)

| Prioridad | Acción | Impacto |
|-----------|--------|---------|
| **P0** | Guard de plataforma con mensaje claro en Windows | Desbloquea adoptadores Windows |
| **P0** | Corregir URL en README + agregar instrucciones de `submodule update` | Elimina fricción de onboarding más visible |
| **P0** | Publicar extensión VS Code o documentar instalación local | Convierte componente inaccesible en funcionalidad real |
| **P1** | Documentar 4 profiles faltantes en `agent-standard.md` | Baja fricción, alta confianza |
| **P1** | GitHub Actions con `pytest` en cada push | Credibilidad de calidad continua |
| **P1** | Tests para adapter Codex | Paridad con adapters OpenCode y Kiro |
| **P1** | Limpiar referencias a `aitmpl.com` en docs y skills | Consistencia entre código y documentación |
| **P2** | Releases semánticos con tags y CHANGELOG | Adopción sostenible a largo plazo |
| **P2** | Modo no-interactivo para el wizard | Uso en CI y scripts de onboarding |
| **P2** | Verificar convención `codex.md` en Codex CLI real | Validar utilidad real del adapter |
