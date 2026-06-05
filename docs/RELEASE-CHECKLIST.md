# Checklist de liberación pública

## Seguridad y privacidad
- [ ] No hay nombres de clientes reales en archivos públicos
- [ ] No hay credenciales, tokens ni passwords
- [ ] No hay URLs internas ni dominios privados
- [ ] No hay referencias a órganos del Estado vinculados a personas concretas

## Técnico
- [ ] Tests pasando (`cd packages/cli && npm run build:all && npm test`)
- [ ] Coherencia de versión: las **4 fuentes** leen la misma versión —
      `packages/cli/package.json`, `packages/cli/src/version.ts`, `manifest.json`
      y `.forge/manifest.json`
- [ ] CHANGELOG.md actualizado
- [ ] README.md completo con quick start funcional
- [ ] No hay referencias a la CLI Python legacy (`forge.py` / `scripts/*.py`) en
      docs públicas (solo notas históricas en CHANGELOG.md / MIGRATION.md)

## Legal
- [ ] LICENSE (Apache 2.0) presente en repo raíz
- [ ] Copyright headers correctos en archivos principales

## Operativo
- [ ] Al menos 2 devs pueden hacer PR reviews autónomamente
- [ ] GitHub Actions CI pasando en main
