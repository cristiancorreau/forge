# forge v2.0.2 — Análisis técnico independiente v7

**Evaluación dual-agent · Mayo 2026**

---

## El problema: configurar equipos de agentes IA es no-trivial

Un dev que adopta Claude Code hoy tiene que resolver por su cuenta:

- ¿Qué modelo asigno a cada agente? ¿Cuándo Opus, cuándo Sonnet?
- ¿Cómo instruyo al agente para que no salga de su directorio?
- ¿Cómo sé en 3 meses que mis agentes no se desviaron del estándar?
- Si tengo un proyecto Laravel 6, ¿cómo llego a Laravel 13?

Sin una solución estructurada: cada equipo descubre esto por prueba y error. Cada proyecto empieza desde cero.

---

## Lo que forge v2.0.2 provee

| Necesidad | Solución |
|-----------|----------|
| Agentes genéricos de calidad variable | 7 agentes Tier 1 con instrucciones verificadas |
| Configuración por stack | 15 profiles (Laravel, WordPress, FastAPI, Rails, NestJS…) |
| Sin forma de detectar deriva | `forge-audit --json` con exit code 1, integrable en CI |
| Setup manual por proyecto | Wizard de 10 preguntas → `project.yaml` válido |
| Un runtime | 4 adapters: Claude Code, OpenCode, Kiro, Codex |
| Compliance ignorado | `compliance-reviewer` con GDPR, LGPD, CCPA, HIPAA, PCI-DSS |

---

## Lo más valioso de v7: migration-specialist de Laravel

```
Laravel 6  →  Laravel 7   Illuminate\Support\Str::orderedUuid(), guards de auth
Laravel 7  →  Laravel 8   Jetstream/Fortify, Model::factory(), controllers resource
Laravel 8  →  Laravel 9   tipado en Model::query(), Carbon v3, bcrypt()
Laravel 9  →  Laravel 10  eliminación de Route::name() globales, PHP 8.1 requerido
Laravel 10 →  Laravel 11  bootstrap/app.php reemplaza App\Http\Kernel
Laravel 11 →  Laravel 12  Defer::dispatch, deprecación helpers sin prefijo
Laravel 12 →  Laravel 13  PHP 8.4 nativo, enum backed strings
```

Un agente con este conocimiento codificado = semana de lectura evitada.

---

## Deuda técnica v5 → v7: cerrada

| Bug P0/P1 en v5 | Estado v7 |
|-----------------|-----------|
| Windows: `ModuleNotFoundError` | ✅ Mensaje orientativo, exit limpio |
| URL submodule incorrecta | ✅ Corregida en todos los archivos |
| VS Code: 624 líneas inaccesibles | ✅ Documentada, instalable vía VSIX |
| JSON `summary` ausente en audit | ✅ Presente, verificado por tests |
| `--forge` y `--only` sin implementar | ✅ Implementados |
| 4 profiles sin documentar | ✅ 15/15 en referencia |

Patrón del log: 4 commits `fix()` antes de 2 `feat()`.

---

## Audit terminal: antes vs después

**v5** — Cada agente OK mostraba sub-checks (líneas redundantes):
```
  ✓  backend-engineer
       ✓ conforme al estándar forge
  ✓  orchestrator
       ✓ conforme al estándar forge
```

**v7** — OK colapsados en una línea por tier:
```
  ✓  backend-engineer  ·  orchestrator  ·  test-engineer
```

Y las oportunidades con descripción y trigger en cards numeradas:
```
  [2] security-audit                      [Skill  /security-audit]
       Checklist de seguridad para endpoints, auth y datos sensibles.
       Detecta vulnerabilidades antes de cada PR.
```

---

## Score v7 vs v5

| Dimensión | v5 | v7 |
|-----------|:--:|:--:|
| Instalación | 4 | **8** |
| Developer Experience | 6 | **8** |
| Cobertura de stacks | 7 | **8** |
| CI/CD | 5 | 5 |
| Gobernanza | 3 | 3.5 |
| Runtime agnosticismo | 8 | 8 |
| Extensibilidad | 7 | **8** |
| Calidad de tests | 7 | **8** |
| **Global** | **5.7** | **7.0** |

---

## Lo que falta (y no es menor)

**GitHub Actions**: forge promueve CI pero no lo tiene internamente. Sin workflow, los 464 tests no se corren ante cada commit externo.

**Releases semánticos**: versión `2.0.2` en código pero sin tag git. Los adoptadores que siguen `main` no tienen señal de breaking changes.

**VS Code Marketplace**: la extensión (1071 líneas, funcional) no tiene campo `publisher` en `package.json`. No está en el Marketplace. Barrera de instalación innecesaria.

**SendMessage como API**: el orchestrator usa `SendMessage({ to: "backend-engineer" })` como primitiva de coordinación. Esta API no aparece en la documentación pública de Claude Code. Si es convención de texto, funciona hasta que no.

---

## Veredicto diferenciado

**Adoptar si:**
- Equipo de 2-8 personas, macOS/Linux
- Stack cubierto por alguno de los 15 profiles
- Proyecto Laravel legacy que necesita upgrade guide
- Requisitos de compliance: GDPR, LGPD, Ley 21.719

**No adoptar si:**
- Proyecto individual o muy simple
- Windows sin WSL
- Stack no cubierto (Angular, Remix, Spring Boot…)
- Preferencia de control total sobre el contexto de agentes

**Condición técnica al adoptar:**
```bash
# Fijar a commit, no seguir main (hasta que haya tags semánticos)
git -C .agentic checkout <commit-hash>
```

---

Análisis completo: `docs/analysis/v7/` · forge v2.0.2 · Dual-agent methodology
