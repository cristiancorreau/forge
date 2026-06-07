# Configuración de OIDC Trusted Publisher en npm

Guía one-time para el mantenedor del paquete `@cristiancorreau/forge`.

---

## Por qué OIDC en lugar de NPM_TOKEN

El workflow `release.yml` publica sin `NPM_TOKEN`. En cambio, GitHub Actions solicita
un token OIDC efímero directamente a npm durante cada ejecución del job. Ventajas:

- **Sin secreto long-lived**: no hay token que rotar, filtrar ni revocar.
- **Scope mínimo**: el token solo sirve para esa ejecución, ese paquete, ese workflow.
- **Provenance automático**: `npm publish --provenance` adjunta una attestation firmada
  al artefacto. Pero la attestation no protege un `NPM_TOKEN` largo que siga existiendo
  en Secrets — si el token se filtra, cualquiera puede publicar sin pasar por el workflow.
  OIDC elimina ese vector.

---

## Prerequisito: configurar el Trusted Publisher en npmjs.com

Esta acción es manual y one-time. El código del workflow ya está listo (líneas 37–39 y 106–108
de `.github/workflows/release.yml`); lo único que falta es el registro en el lado de npm.

### Pasos

1. Iniciar sesión en [npmjs.com](https://www.npmjs.com) con la cuenta dueña del paquete.
2. Ir al paquete `@cristiancorreau/forge`.
3. Abrir la pestaña **Settings** del paquete.
4. Buscar la sección **Trusted Publishers** (verificar nombre exacto en la UI — puede variar
   según actualizaciones de npmjs.com).
5. Seleccionar **GitHub Actions** como proveedor.
6. Completar los campos con los valores exactos que aparecen en el workflow:

   | Campo                  | Valor            |
   |------------------------|------------------|
   | Owner / Organization   | `cristiancorreau` |
   | Repository             | `forge`           |
   | Workflow filename      | `release.yml`     |
   | Environment            | _(no declarado en el workflow — dejar vacío o "Any")_ |

   > El workflow `release.yml` no declara un campo `environment:` en el job `publish-npm`.
   > Si la UI de npm requiere un valor, verificar directamente en la pantalla de configuración
   > si acepta vacío o si hay una opción "sin environment".

7. Guardar / confirmar el Trusted Publisher.

---

## 2FA requerido

npm exige que la cuenta tenga 2FA habilitado en modo **auth-and-publish** (o hardware key)
para poder usar Trusted Publishing. Verificar en **Account Settings → Two-Factor Authentication**
que el nivel activo es `auth-and-publish`, no solo `auth-only`.

---

## Cómo validar post-setup

### Disparar el release

El workflow se activa con cualquier tag que siga el patrón `v[0-9]+.[0-9]+.[0-9]*`
(líneas 5–6 del workflow):

```bash
git tag v3.5.0
git push origin v3.5.0
```

### Confirmar autenticación por OIDC

1. En la pestaña **Actions** del repositorio, abrir la ejecución del workflow `release`.
2. En el job **Publish to npm**, el step **Publish (OIDC, no token)** debe completarse sin
   pedir credenciales. Si aparece un error de autenticación, ver Troubleshooting.
3. En npmjs.com, la versión publicada debe mostrar el badge **Provenance** (attestation
   generada por `--provenance`). Eso confirma que la publicación pasó por el workflow de CI
   y no fue manual.

---

## Troubleshooting

### Error al publicar sin Trusted Publisher configurado

Si el Trusted Publisher no está registrado en npm, el step falla con un error similar a:

```
npm error code E403
npm error 403 403 Forbidden - PUT https://registry.npmjs.org/@cristiancorreau%2fforge
npm error 403 In order to publish packages, you must install npm with a valid token.
```

o bien:

```
npm error This package does not have a trusted publisher configured for GitHub Actions.
```

**Solución**: completar los pasos de la sección anterior. No se necesita ningún cambio
en el código ni en los Secrets del repositorio.

### npm demasiado viejo para OIDC

El workflow actualiza npm antes de publicar (líneas 98–99: `npm install -g npm@latest`).
Si ese step falla, verificar conectividad del runner o anclar una versión mínima conocida
(`npm@>=11.5.1`) en lugar de `latest`.

---

## Referencias

- [npm Trusted Publishing docs](https://docs.npmjs.com/generating-provenance-statements)
- [GitHub OIDC + npm](https://github.blog/changelog/2023-09-26-npm-provenance-is-now-generally-available/)
- Workflow fuente: `.github/workflows/release.yml` (job `publish-npm`, líneas 33–108)
