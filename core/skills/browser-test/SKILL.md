# Skill: browser-test

Automatización de navegador para verificar UI en desarrollo, testear visualmente
flujos críticos y capturar evidencia. Usa `agent-browser` (CLI en Rust sobre CDP).

Triggers: /browser-test, "abrir en browser", "screenshot de", "verificar que
renderiza", "testear visualmente", "navegar a", "probar el flujo de", "ver cómo
se ve", "revisar esta URL", "capturar pantalla de", "test visual", "open <url>".

Prerequisito: `agent-browser` instalado globalmente.
  Instalar: `npm i -g agent-browser && agent-browser install`
  Verificar: `agent-browser --version`

---

## Cuándo usar este skill

- Verificar que una página renderiza correctamente antes de dar una tarea por terminada
- Testear visualmente flujos críticos (login, onboarding, formularios)
- Inspeccionar una URL que el usuario proporciona
- Capturar screenshots como evidencia de implementación o compliance
- Hacer diff visual entre dos versiones de una misma página
- Testear responsive en viewport mobile sin abrir DevTools manualmente
- Extraer contenido de una URL pública para investigación

---

## Flujo core

```bash
# 1. Navegar y ver qué hay
agent-browser open <url>
agent-browser snapshot -i           # accessibility tree — interactive elements only
                                    # produce refs @e1, @e2... para interactuar

# 2. Interactuar con refs del snapshot
agent-browser click @e3
agent-browser fill @e4 "texto"
agent-browser snapshot -i           # re-snapshot SIEMPRE después de un cambio de página

# 3. Capturar estado
agent-browser screenshot            # guarda a /tmp auto-named
agent-browser screenshot page.png   # o a un path específico
agent-browser close
```

Los refs (`@e1`, `@e2`...) se vuelven stale al cambiar la página. Siempre
re-snapshot antes del siguiente ref interaction.

---

## Casos de uso frecuentes

### Verificar que una ruta dev renderiza

```bash
agent-browser open http://localhost:3000/ruta
agent-browser snapshot -i            # leer si hay errores o elementos esperados
agent-browser screenshot check.png
agent-browser close
```

### Diff visual entre dos versiones

```bash
# Tomar baseline antes del cambio
agent-browser open http://localhost:3000/pagina && agent-browser screenshot baseline.png

# Después del cambio
agent-browser open http://localhost:3000/pagina && agent-browser diff screenshot --baseline baseline.png
```

### Testear en mobile viewport

```bash
agent-browser set device "iPhone 14"
agent-browser open <url>
agent-browser screenshot mobile.png
agent-browser close
```

### Extraer contenido de una URL

```bash
agent-browser open <url>
agent-browser snapshot                  # árbol completo, sin filtro -i
agent-browser get text "#main"          # extraer texto de un selector
agent-browser close
```

### Verificar web vitals

```bash
agent-browser vitals <url> --json       # LCP, CLS, TTFB, FCP, INP
```

### Inspeccionar network requests

```bash
agent-browser open <url>
agent-browser wait --load networkidle
agent-browser network requests --type xhr,fetch --json   # APIs llamadas
agent-browser network requests --method POST --json       # solo POSTs
```

---

## Selección de elementos

```bash
# Por ref del snapshot (recomendado — determinístico)
agent-browser click @e2

# Por CSS selector
agent-browser click "#submit-btn"
agent-browser click ".card:first-child"

# Por semántica (más robusto que CSS en apps dinámicas)
agent-browser find role button click --name "Guardar"
agent-browser find label "Email" fill "test@test.com"
agent-browser find text "Aceptar todo" click
```

---

## Captura de screenshots

```bash
agent-browser screenshot                          # PNG a /tmp, auto-named
agent-browser screenshot ./shots/page.png         # path específico
agent-browser screenshot --full                   # full page scroll
agent-browser screenshot --annotate               # overlay con refs numerados
agent-browser pdf report.pdf                      # PDF de la página actual
```

Con `--annotate`, los labels `[N]` corresponden a `@eN` — útil para debuggear
qué elemento es qué en páginas densas.

---

## Opciones útiles para testing local

```bash
# Ignorar HTTPS self-signed (localhost con cert local)
agent-browser --ignore-https-errors open https://localhost:3000

# Dark/Light mode
agent-browser set media dark
agent-browser screenshot dark-mode.png

# Viewport custom
agent-browser set viewport 1440 900
agent-browser set viewport 375 812    # iPhone SE
```

---

## Diagnóstico si algo falla

```bash
agent-browser doctor --quick         # verifica instalación de Chrome y daemon
agent-browser console                # ver errores de JS en la página
agent-browser errors                 # uncaught exceptions
agent-browser --headed open <url>    # abrir visible para debuggear manualmente
```

Si el binario no está en PATH:
- Buscar con: `which agent-browser` o `npm root -g`
- Invocar con ruta completa mientras se resuelve el PATH

---

## Relación con otros skills

- `security-audit`: usar browser-test para verificar visualmente que no hay info sensible expuesta en la UI.
- `new-feature`: al terminar una feature con UI, correr browser-test para capturar screenshot de evidencia.
- No depende de otros skills (es standalone).
