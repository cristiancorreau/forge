# Checklist de liberación pública

## Seguridad y privacidad
- [ ] No hay nombres de clientes reales en archivos públicos
- [ ] No hay credenciales, tokens ni passwords
- [ ] No hay URLs internas ni dominios privados
- [ ] No hay referencias a órganos del Estado vinculados a personas concretas

## Técnico
- [ ] 464+ tests pasando
- [ ] manifest.json version coherente con `packages/cli/package.json` version
- [ ] CHANGELOG.md actualizado
- [ ] README.md completo con quick start funcional
- [ ] No hay referencias a `forge.py` en docs públicas (solo notas históricas o deprecadas)

## Legal
- [ ] LICENSE (Apache 2.0) presente en repo raíz
- [ ] Copyright headers correctos en archivos principales

## Operativo
- [ ] Al menos 2 devs pueden hacer PR reviews autónomamente
- [ ] GitHub Actions CI pasando en main
