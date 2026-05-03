# forge

Framework de trabajo para equipos de desarrollo con agentes de IA.

Agnóstico a tecnología (PHP, Ruby, Go, TypeScript, Python…) y compatible con
Claude Code, OpenCode, Codex y otros runtimes de agentes.

## Estructura

```
forge/
├── core/
│   ├── agents/      ← Agentes genéricos (orchestrator, backend, frontend, etc.)
│   ├── skills/      ← Skills reutilizables entre proyectos
│   └── workflows/   ← Flujos de trabajo (SDD, sprint, review)
├── adapters/
│   ├── claude-code/ ← Genera .claude/ a partir del core
│   ├── opencode/    ← Genera AGENTS.md para OpenCode/Codex
│   └── kiro/        ← Genera .kiro/steering/ para Kiro
├── scripts/
│   ├── token-stats.py     ← Estadísticas de tokens por agente/equipo
│   ├── forge-init.py      ← Setup de un proyecto nuevo
│   └── build-progress.py ← Genera progress.html desde project.yaml
├── hooks/
│   └── pre-commit   ← Hook git: actualiza token stats antes de cada commit
├── templates/
│   ├── project.yaml.tpl   ← Plantilla de configuración de proyecto
│   └── progress.html.tpl  ← Plantilla de progress dashboard
└── docs/
    ├── methodology.md     ← SDD + 5-phase workflow
    └── whitepaper.md      ← (borrador) para publicación
```

## Inicio rápido

```bash
# 1. Clonar forge en tu proyecto
git submodule add https://github.com/tu-org/forge .agentic

# 2. Crear project.yaml en la raíz de tu proyecto
cp .agentic/templates/project.yaml.tpl project.yaml
# Editar project.yaml con los detalles del proyecto

# 3. Inicializar configuración del tool
python3 .agentic/scripts/forge-init.py --tool claude-code
# Genera .claude/agents/, .claude/skills/, CLAUDE.md, AGENTS.md

# 4. Activar hook de token stats
cp .agentic/hooks/pre-commit .githooks/pre-commit
chmod +x .githooks/pre-commit
git config core.hooksPath .githooks
```

## Filosofía

- **Spec-Driven Development (SDD)**: spec antes que código, siempre
- **Agentes especializados**: cada agente tiene un dominio claro y no sale de él
- **Compliance by design**: las reglas no-negociables van en el core, no en cada proyecto
- **Agnóstico al tool**: el mismo proyecto.yaml genera configs para cualquier runtime
