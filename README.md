# forge

[![tests](https://github.com/cristiancorreau/forge/actions/workflows/tests.yml/badge.svg)](https://github.com/cristiancorreau/forge/actions/workflows/tests.yml)
[![npm](https://img.shields.io/npm/v/@cristiancorreau/forge)](https://www.npmjs.com/package/@cristiancorreau/forge)
[![license](https://img.shields.io/badge/license-Apache%202.0-green)](LICENSE)

**Configura cualquier proyecto para trabajar con agentes IA en un comando.**

Wizard interactivo que detecta tu stack, instala agentes especializados, genera guardrails y mantiene un manifest con SHA-256 para auditar cada cambio.

---

## Quick start

```bash
npx @cristiancorreau/forge init
```

Sin instalación global. Sin Python. Solo Node.js.

---

## Cómo funciona

El wizard detecta y configura el proyecto en cinco pasos:

1. **Detecta el stack** — lee `package.json`, lockfiles y `Dockerfile` para identificar framework, lenguaje y dependencias.
2. **Selecciona agentes** — muestra un selector de flechas con los agentes disponibles para tu stack (TypeScript, Python, Ruby, Go, PHP).
3. **Instala configuración** — escribe `.claude/agents/`, `CLAUDE.md`, `settings.json` y `architecture.rules` en el repositorio.
4. **Instala hooks** — genera hooks de guardrail en JavaScript puro; sin dependencias de Python ni binarios externos.
5. **Crea el manifest** — `forge/.forge/manifest.json` con SHA-256 de cada archivo gestionado para rastrear derivaciones futuras.

---

## Comandos

| Comando | Qué hace |
|---------|----------|
| `forge init` | Wizard completo: detecta stack, instala agentes, hooks y genera configuración |
| `forge audit` | Verifica el estado del proyecto contra el manifest; detecta archivos modificados o faltantes |
| `forge generate` | Regenera configuración desde el estado actual del proyecto sin ejecutar el wizard completo |
| `forge validate` | Valida que los archivos generados cumplan el esquema esperado |
| `forge doctor` | Health-check del entorno: Node.js, git, runtime de IA activo, permisos |

---

## Runtimes soportados

| Runtime | Soporte |
|---------|---------|
| **Claude Code** | Completo — agentes, `CLAUDE.md`, `settings.json`, hooks |
| **OpenCode** | `AGENTS.md` generado |
| **Codex CLI** | `AGENTS.md` enriquecido para contexto de proyecto |
| **Kiro** | Steering files |

---

## Stacks soportados

| Lenguaje | Frameworks |
|----------|------------|
| TypeScript | Hono, Next.js, NestJS, Astro |
| Python | FastAPI, Django |
| Ruby | Rails |
| Go | Gin |
| PHP | Laravel |

Cada stack instala agentes especializados con reglas de arquitectura, convenciones de código y patrones específicos del framework.

---

## Sin Python requerido

Toda la CLI corre en Node.js. Los hooks de guardrail son JavaScript puro.

No hay `pip install`, no hay `requirements.txt`, no hay dependencias de sistema fuera de Node.js 18+.

---

## Comparativa

| Herramienta | Agentes especializados | Hooks de guardrail | Manifest con SHA-256 | Multi-runtime |
|-------------|------------------------|-------------------|----------------------|---------------|
| **forge** | Sí | Sí | Sí | Claude Code, OpenCode, Codex, Kiro |
| `cc-sdd` | No — plantillas SDD | No | No | Claude Code |
| `autoskills` | No — skills genéricos | No | No | Claude Code |

---

## Documentación

- [Guía completa](docs/guide.md)
- [Runtimes](docs/runtimes/)

---

## Licencia

Apache 2.0 — Copyright [Cristian Correa](https://github.com/cristiancorreau), 2026.
