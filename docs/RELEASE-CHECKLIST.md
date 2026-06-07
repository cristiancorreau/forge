# Checklist de liberación pública

> forge ya está publicado en npm como `@cristiancorreau/forge` (v2.9.13). Este checklist se
> mantiene como gate recurrente: los ítems de seguridad/privacidad deben re-verificarse antes
> de cada release; los técnicos/legales/operativos reflejan el estado verificado del repo.

## Seguridad y privacidad (re-verificar en cada release)
- [ ] No hay nombres de clientes reales en archivos públicos
- [ ] No hay credenciales, tokens ni passwords
- [ ] No hay URLs internas ni dominios privados
- [ ] No hay referencias a órganos del Estado vinculados a personas concretas

## Técnico
- [x] Tests pasando — `cd packages/cli && npm test` (`commands.test.mjs` + `assets.test.mjs`, todos en verde)
- [x] Versión coherente entre `packages/cli/package.json` y `packages/cli/src/version.ts` (2.9.13)
- [x] CHANGELOG.md actualizado (release semántico lo mantiene)
- [x] README.md completo con quick start funcional

## Legal
- [x] LICENSE (Apache 2.0) presente en repo raíz
- [ ] Copyright headers correctos en archivos principales

## Operativo
- [ ] Al menos 2 devs pueden hacer PR reviews autónomamente
- [x] GitHub Actions CI pasando en main (`.github/workflows/tests.yml` + `release.yml`)
