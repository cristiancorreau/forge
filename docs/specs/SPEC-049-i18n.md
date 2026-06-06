# SPEC-049 Multi-idioma (ES/EN) del CLI + docs bilingües

> Estado: APPROVED
> Responsable: forge-cli-engineer
> Creada: 2026-06-06 | Actualizada: 2026-06-06

## Contexto

El CLI estaba mezclado: help/header en inglés, TUI y comandos en español. Se
agrega i18n real (ES/EN) y documentación en ambos idiomas.

## Decisión

### CLI
- Nuevo `lib/i18n.ts`: `resolveLang()` (precedencia `--lang` > `FORGE_LANG` >
  locale del sistema `es*`→es > default `en`), `setLang/getLang`, `t(key, vars)`
  con interpolación `{var}`, y catálogo `MESSAGES = { en, es }`.
- `cli.ts` resuelve el idioma al inicio, lo propaga en `FORGE_LANG` (para que el
  relaunch del TUI bajo Bun lo herede), filtra `--lang` del dispatch de comandos,
  y arma el HELP con `t('help.full')`.
- Cobertura v1 (las superficies más visibles): help top-level completo, tagline
  del header, y el chrome del panel (título, secciones nav, footer). El i18n es
  extensible: más strings de comandos se pueden migrar a `t()` incrementalmente.

### Documentación
- README bilingüe: `README.md` (EN, idioma por defecto que ven GitHub y npm) +
  `README.es.md` (ES), con selector de idioma arriba en ambos.
- Docs user-facing traducidas a EN bajo `docs/en/` (guide, skills, tiers, wiki,
  runtimes/*), con selector en cada par ES/EN.

## No-objetivos v1
- No se traduce cada string de salida de cada comando (queda como migración
  incremental sobre la misma infra `t()`).
- No se traducen docs internas (specs, RFC, release-checklist).

## Criterios de aceptación
- [ ] `forge --lang es --help` en español; `--lang en` / locale en → inglés.
- [ ] `FORGE_LANG` y `--lang=es` funcionan; el TUI hereda el idioma vía `FORGE_LANG`.
- [ ] Paridad de claves ES/EN (test). `t()` interpola `{version}`.
- [ ] `README.md` (EN, por defecto) + `README.es.md` + `docs/en/*` existen con selector de idioma.
- [ ] `tsc` + `npm test` verdes (incl. windows).

## Impacto de compliance
No aplica.
