#!/usr/bin/env python3
"""
template-search.py — Busca templates y recursos para desarrollo con agentes IA.

Catálogo curado de frameworks, servidores MCP, skills y herramientas.
Funciona offline. Opcionalmente extiende con búsqueda en GitHub (--github).

Usage:
  python3 .agentic/scripts/aitmpl-search.py "fastapi"
  python3 .agentic/scripts/aitmpl-search.py "mcp postgres"
  python3 .agentic/scripts/aitmpl-search.py --category mcp-server
  python3 .agentic/scripts/aitmpl-search.py --list-categories
  python3 .agentic/scripts/aitmpl-search.py "rails" --github
  python3 .agentic/scripts/aitmpl-search.py --json "claude"
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
import textwrap
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Optional

# ---------------------------------------------------------------------------
# Catálogo curado
# Campos: name, description, category, tags, url, language
#
# Categorías:
#   framework     — frameworks de desarrollo con agentes IA
#   mcp-server    — servidores Model Context Protocol
#   skill         — skills/comandos para Claude Code
#   tool          — herramientas de CLI o automatización
#   profile       — profiles de stack para forge
#   resource      — documentación, listas y guías
# ---------------------------------------------------------------------------

CATALOG: list[dict] = [

    # ── Frameworks ──────────────────────────────────────────────────────────

    {
        "name":        "cristiancorreau/forge",
        "description": "Framework de desarrollo con agentes IA para equipos. Profiles para Next.js, Astro, FastAPI, Rails, NestJS, Express, Expo y más. Wizard CLI interactivo.",
        "category":    "framework",
        "tags":        ["claude-code", "agents", "typescript", "python", "ruby", "nextjs", "astro", "fastapi", "rails", "nestjs", "express", "expo"],
        "url":         "https://github.com/cristiancorreau/forge",
        "language":    "Python",
    },
    {
        "name":        "paul-gauthier/aider",
        "description": "Pair programming con LLMs en la terminal. Soporta Claude, GPT-4, Gemini. Edita archivos directamente y hace commits automáticos.",
        "category":    "framework",
        "tags":        ["claude", "gpt4", "pair-programming", "git", "terminal"],
        "url":         "https://github.com/paul-gauthier/aider",
        "language":    "Python",
    },
    {
        "name":        "BuilderIO/micro-agent",
        "description": "Agente IA que escribe código hasta que los tests pasan. TDD automático: genera código iterativamente hasta lograr green tests.",
        "category":    "framework",
        "tags":        ["tdd", "testing", "code-generation", "claude", "openai"],
        "url":         "https://github.com/BuilderIO/micro-agent",
        "language":    "TypeScript",
    },
    {
        "name":        "anthropics/anthropic-quickstarts",
        "description": "Quickstarts oficiales de Anthropic: customer support agent, computer use, multi-agent portfolio. Ejemplos de referencia.",
        "category":    "framework",
        "tags":        ["claude", "anthropic", "multi-agent", "computer-use", "quickstart"],
        "url":         "https://github.com/anthropics/anthropic-quickstarts",
        "language":    "Python",
    },
    {
        "name":        "anthropics/claude-code-action",
        "description": "GitHub Action oficial para usar Claude Code en CI/CD. Permite que Claude revise PRs, corrija bugs y responda issues automáticamente.",
        "category":    "framework",
        "tags":        ["claude-code", "github-actions", "ci-cd", "pr-review"],
        "url":         "https://github.com/anthropics/claude-code-action",
        "language":    "TypeScript",
    },

    # ── MCP Servers — oficiales ──────────────────────────────────────────────

    {
        "name":        "MCP — filesystem",
        "description": "Acceso seguro al sistema de archivos local con control de directorios permitidos. Leer, escribir, listar y buscar archivos.",
        "category":    "mcp-server",
        "tags":        ["filesystem", "files", "read", "write", "mcp", "oficial"],
        "url":         "https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem",
        "language":    "TypeScript",
        "install": {
            "slug": "filesystem",
            "command": "npx",
            "args": ["-y", "@modelcontextprotocol/server-filesystem", "{ALLOWED_DIR}"],
            "params": [{"key": "ALLOWED_DIR", "label": "Directorio permitido", "default": "."}],
            "env": [],
        },
    },
    {
        "name":        "MCP — git",
        "description": "Operaciones git: leer historial, diffs, commits, branches y status. Integración completa con repositorios git locales.",
        "category":    "mcp-server",
        "tags":        ["git", "version-control", "commits", "diff", "mcp", "oficial"],
        "url":         "https://github.com/modelcontextprotocol/servers/tree/main/src/git",
        "language":    "Python",
        "install": {
            "slug": "git",
            "command": "uvx",
            "args": ["mcp-server-git", "--repository", "{REPO_PATH}"],
            "params": [{"key": "REPO_PATH", "label": "Ruta del repositorio git", "default": "."}],
            "env": [],
        },
    },
    {
        "name":        "MCP — github",
        "description": "Integración con la API de GitHub: repos, issues, PRs, branches, commits, búsqueda de código. Requiere GITHUB_TOKEN.",
        "category":    "mcp-server",
        "tags":        ["github", "issues", "pull-requests", "api", "mcp", "oficial"],
        "url":         "https://github.com/modelcontextprotocol/servers/tree/main/src/github",
        "language":    "TypeScript",
        "install": {
            "slug": "github",
            "command": "npx",
            "args": ["-y", "@modelcontextprotocol/server-github"],
            "params": [],
            "env": [{"key": "GITHUB_TOKEN", "label": "GitHub personal access token (ghp_...)"}],
        },
    },
    {
        "name":        "MCP — postgres",
        "description": "Acceso read-only a bases de datos PostgreSQL. Ejecutar queries, explorar schemas y tablas. Ideal para análisis de datos.",
        "category":    "mcp-server",
        "tags":        ["postgres", "postgresql", "database", "sql", "mcp", "oficial"],
        "url":         "https://github.com/modelcontextprotocol/servers/tree/main/src/postgres",
        "language":    "TypeScript",
        "install": {
            "slug": "postgres",
            "command": "npx",
            "args": ["-y", "@modelcontextprotocol/server-postgres", "{CONNECTION_STRING}"],
            "params": [{"key": "CONNECTION_STRING", "label": "PostgreSQL connection string", "default": "postgresql://localhost/mydb"}],
            "env": [],
        },
    },
    {
        "name":        "MCP — sqlite",
        "description": "Interacción con bases de datos SQLite: queries, introspección de schema, gestión de datos. Memo de conocimiento incorporado.",
        "category":    "mcp-server",
        "tags":        ["sqlite", "database", "sql", "local", "mcp", "oficial"],
        "url":         "https://github.com/modelcontextprotocol/servers/tree/main/src/sqlite",
        "language":    "Python",
        "install": {
            "slug": "sqlite",
            "command": "uvx",
            "args": ["mcp-server-sqlite", "--db-path", "{DB_PATH}"],
            "params": [{"key": "DB_PATH", "label": "Ruta del archivo SQLite", "default": "./data.db"}],
            "env": [],
        },
    },
    {
        "name":        "MCP — fetch",
        "description": "Fetch de URLs y conversión a Markdown. Permite a Claude leer páginas web, documentación y APIs HTTP.",
        "category":    "mcp-server",
        "tags":        ["http", "fetch", "web", "scraping", "markdown", "mcp", "oficial"],
        "url":         "https://github.com/modelcontextprotocol/servers/tree/main/src/fetch",
        "language":    "Python",
        "install": {
            "slug": "fetch",
            "command": "uvx",
            "args": ["mcp-server-fetch"],
            "params": [],
            "env": [],
        },
    },
    {
        "name":        "MCP — brave-search",
        "description": "Búsqueda web con Brave Search API. Web search y local search con privacidad. Requiere BRAVE_API_KEY.",
        "category":    "mcp-server",
        "tags":        ["search", "web-search", "brave", "internet", "mcp", "oficial"],
        "url":         "https://github.com/modelcontextprotocol/servers/tree/main/src/brave-search",
        "language":    "TypeScript",
        "install": {
            "slug": "brave-search",
            "command": "npx",
            "args": ["-y", "@modelcontextprotocol/server-brave-search"],
            "params": [],
            "env": [{"key": "BRAVE_API_KEY", "label": "Brave Search API key"}],
        },
    },
    {
        "name":        "MCP — slack",
        "description": "Integración con Slack: enviar mensajes, leer canales, gestionar usuarios. Requiere Slack Bot Token.",
        "category":    "mcp-server",
        "tags":        ["slack", "messaging", "communication", "mcp", "oficial"],
        "url":         "https://github.com/modelcontextprotocol/servers/tree/main/src/slack",
        "language":    "TypeScript",
        "install": {
            "slug": "slack",
            "command": "npx",
            "args": ["-y", "@modelcontextprotocol/server-slack"],
            "params": [],
            "env": [
                {"key": "SLACK_BOT_TOKEN", "label": "Slack Bot Token (xoxb-...)"},
                {"key": "SLACK_TEAM_ID",   "label": "Slack Team ID"},
            ],
        },
    },
    {
        "name":        "MCP — puppeteer",
        "description": "Automatización de browser con Puppeteer: navegar, hacer screenshots, rellenar formularios y ejecutar JavaScript.",
        "category":    "mcp-server",
        "tags":        ["puppeteer", "browser", "automation", "screenshot", "scraping", "mcp", "oficial"],
        "url":         "https://github.com/modelcontextprotocol/servers/tree/main/src/puppeteer",
        "language":    "TypeScript",
        "install": {
            "slug": "puppeteer",
            "command": "npx",
            "args": ["-y", "@modelcontextprotocol/server-puppeteer"],
            "params": [],
            "env": [],
        },
    },
    {
        "name":        "MCP — sequential-thinking",
        "description": "Herramienta de razonamiento paso a paso con revisión y backtracking. Para problemas complejos que requieren análisis estructurado.",
        "category":    "mcp-server",
        "tags":        ["reasoning", "thinking", "analysis", "chain-of-thought", "mcp", "oficial"],
        "url":         "https://github.com/modelcontextprotocol/servers/tree/main/src/sequentialthinking",
        "language":    "TypeScript",
        "install": {
            "slug": "sequential-thinking",
            "command": "npx",
            "args": ["-y", "@modelcontextprotocol/server-sequential-thinking"],
            "params": [],
            "env": [],
        },
    },
    {
        "name":        "MCP — memory",
        "description": "Grafo de conocimiento persistente. Claude puede guardar y recuperar información entre conversaciones con entidades y relaciones.",
        "category":    "mcp-server",
        "tags":        ["memory", "knowledge-graph", "persistence", "mcp", "oficial"],
        "url":         "https://github.com/modelcontextprotocol/servers/tree/main/src/memory",
        "language":    "TypeScript",
        "install": {
            "slug": "memory",
            "command": "npx",
            "args": ["-y", "@modelcontextprotocol/server-memory"],
            "params": [],
            "env": [],
        },
    },
    {
        "name":        "MCP — everything",
        "description": "Servidor MCP de referencia con prompts, tools y resources de ejemplo. Útil para probar clientes MCP y aprender el protocolo.",
        "category":    "mcp-server",
        "tags":        ["reference", "testing", "demo", "mcp", "oficial"],
        "url":         "https://github.com/modelcontextprotocol/servers/tree/main/src/everything",
        "language":    "TypeScript",
        "install": {
            "slug": "everything",
            "command": "npx",
            "args": ["-y", "@modelcontextprotocol/server-everything"],
            "params": [],
            "env": [],
        },
    },

    # ── MCP Servers — comunidad ───────────────────────────────────────────────

    {
        "name":        "MCP — supabase (comunidad)",
        "description": "Integración con Supabase: ejecutar queries SQL, gestionar tablas, auth y storage via MCP.",
        "category":    "mcp-server",
        "tags":        ["supabase", "postgres", "database", "auth", "storage", "mcp"],
        "url":         "https://github.com/supabase-community/supabase-mcp",
        "language":    "TypeScript",
        "install": {
            "slug": "supabase",
            "command": "npx",
            "args": ["-y", "@supabase/mcp-server-supabase", "--access-token", "{ACCESS_TOKEN}"],
            "params": [{"key": "ACCESS_TOKEN", "label": "Supabase personal access token"}],
            "env": [],
        },
    },
    {
        "name":        "MCP — Cloudflare",
        "description": "Gestión de Workers, KV, R2, D1, AI Gateway y Vectorize de Cloudflare via MCP. Oficial de Cloudflare.",
        "category":    "mcp-server",
        "tags":        ["cloudflare", "workers", "kv", "r2", "d1", "edge", "mcp"],
        "url":         "https://github.com/cloudflare/mcp-server-cloudflare",
        "language":    "TypeScript",
        "install": {
            "slug": "cloudflare",
            "command": "npx",
            "args": ["-y", "@cloudflare/mcp-server-cloudflare"],
            "params": [],
            "env": [{"key": "CLOUDFLARE_API_TOKEN", "label": "Cloudflare API token"}],
        },
    },
    {
        "name":        "MCP — Vercel",
        "description": "Gestión de proyectos, deploys, dominios y logs de Vercel via MCP. Integración oficial.",
        "category":    "mcp-server",
        "tags":        ["vercel", "deploy", "serverless", "hosting", "mcp"],
        "url":         "https://github.com/vercel/mcp-server",
        "language":    "TypeScript",
        "install": {
            "slug": "vercel",
            "command": "npx",
            "args": ["-y", "@vercel/mcp-adapter"],
            "params": [],
            "env": [{"key": "VERCEL_TOKEN", "label": "Vercel API token"}],
        },
    },
    {
        "name":        "MCP — Linear",
        "description": "Integración con Linear: crear y consultar issues, proyectos y cycles. Para equipos que usan Linear como tracker.",
        "category":    "mcp-server",
        "tags":        ["linear", "project-management", "issues", "mcp"],
        "url":         "https://github.com/linear/linear-mcp",
        "language":    "TypeScript",
        "install": {
            "slug": "linear",
            "command": "npx",
            "args": ["-y", "@linear/mcp-server"],
            "params": [],
            "env": [{"key": "LINEAR_API_KEY", "label": "Linear API key"}],
        },
    },
    {
        "name":        "MCP — Playwright",
        "description": "Automatización de browser con Playwright via MCP. Navegación, screenshots, testing E2E e interacción con páginas web.",
        "category":    "mcp-server",
        "tags":        ["playwright", "browser", "e2e", "testing", "automation", "mcp"],
        "url":         "https://github.com/microsoft/playwright-mcp",
        "language":    "TypeScript",
        "install": {
            "slug": "playwright",
            "command": "npx",
            "args": ["-y", "@playwright/mcp@latest"],
            "params": [],
            "env": [],
        },
    },
    {
        "name":        "MCP — Sentry",
        "description": "Consulta issues, eventos y trazas de Sentry. Permite a Claude diagnosticar errores de producción directamente.",
        "category":    "mcp-server",
        "tags":        ["sentry", "errors", "monitoring", "debugging", "mcp"],
        "url":         "https://github.com/getsentry/sentry-mcp",
        "language":    "Python",
        "install": {
            "slug": "sentry",
            "command": "uvx",
            "args": ["mcp-server-sentry"],
            "params": [],
            "env": [{"key": "SENTRY_AUTH_TOKEN", "label": "Sentry auth token"}],
        },
    },
    {
        "name":        "MCP — Docker",
        "description": "Gestión de contenedores, imágenes y volúmenes Docker via MCP. Ejecutar y gestionar el ciclo de vida de containers.",
        "category":    "mcp-server",
        "tags":        ["docker", "containers", "devops", "infrastructure", "mcp"],
        "url":         "https://github.com/ckreiling/mcp-server-docker",
        "language":    "Python",
        "install": {
            "slug": "docker",
            "command": "uvx",
            "args": ["mcp-server-docker"],
            "params": [],
            "env": [],
        },
    },
    {
        "name":        "MCP — AWS (aws-kb-retrieval)",
        "description": "Retrieval desde AWS Knowledge Base. Para proyectos en AWS que usan Bedrock Knowledge Bases.",
        "category":    "mcp-server",
        "tags":        ["aws", "bedrock", "knowledge-base", "rag", "mcp", "oficial"],
        "url":         "https://github.com/modelcontextprotocol/servers/tree/main/src/aws-kb-retrieval-server",
        "language":    "TypeScript",
        "install": {
            "slug": "aws-kb",
            "command": "npx",
            "args": ["-y", "@modelcontextprotocol/server-aws-kb-retrieval"],
            "params": [],
            "env": [
                {"key": "AWS_ACCESS_KEY_ID",     "label": "AWS Access Key ID"},
                {"key": "AWS_SECRET_ACCESS_KEY",  "label": "AWS Secret Access Key"},
                {"key": "AWS_REGION",             "label": "AWS Region", "default": "us-east-1"},
            ],
        },
    },

    # ── Profiles de forge ─────────────────────────────────────────────────────

    {
        "name":        "forge profile — hono-drizzle",
        "description": "Agente api-engineer especializado en Hono + Drizzle ORM + TypeScript. Incluye rutas, schemas, migraciones y tests.",
        "category":    "profile",
        "tags":        ["hono", "drizzle", "typescript", "api", "orm", "edge"],
        "url":         "https://github.com/cristiancorreau/forge/tree/main/profiles/hono-drizzle",
        "language":    "TypeScript",
    },
    {
        "name":        "forge profile — nextjs-admin",
        "description": "Agente admin-engineer para dashboards con Next.js 15 + shadcn/ui. Componentes, tablas de datos y gestión interna.",
        "category":    "profile",
        "tags":        ["nextjs", "shadcn", "react", "dashboard", "admin", "typescript"],
        "url":         "https://github.com/cristiancorreau/forge/tree/main/profiles/nextjs-admin",
        "language":    "TypeScript",
    },
    {
        "name":        "forge profile — astro",
        "description": "Agente frontend-engineer para sitios con Astro. SSG/SSR, islands architecture, Content Collections y Tailwind.",
        "category":    "profile",
        "tags":        ["astro", "ssg", "ssr", "islands", "typescript", "tailwind", "static"],
        "url":         "https://github.com/cristiancorreau/forge/tree/main/profiles/astro",
        "language":    "TypeScript",
    },
    {
        "name":        "forge profile — fastapi",
        "description": "Agente api-engineer para FastAPI + Python. Endpoints async, Pydantic schemas, SQLAlchemy y pytest.",
        "category":    "profile",
        "tags":        ["fastapi", "python", "async", "pydantic", "sqlalchemy", "pytest"],
        "url":         "https://github.com/cristiancorreau/forge/tree/main/profiles/fastapi",
        "language":    "Python",
    },
    {
        "name":        "forge profile — rails",
        "description": "Agente fullstack-engineer para Ruby on Rails. Modelos, migraciones, controllers, views y RSpec.",
        "category":    "profile",
        "tags":        ["rails", "ruby", "activerecord", "rspec", "fullstack"],
        "url":         "https://github.com/cristiancorreau/forge/tree/main/profiles/rails",
        "language":    "Ruby",
    },
    {
        "name":        "forge profile — nestjs",
        "description": "Agente api-engineer para NestJS + TypeScript. Módulos, guards, decorators y arquitectura escalable.",
        "category":    "profile",
        "tags":        ["nestjs", "typescript", "node", "api", "modules", "guards"],
        "url":         "https://github.com/cristiancorreau/forge/tree/main/profiles/nestjs",
        "language":    "TypeScript",
    },
    {
        "name":        "forge profile — express",
        "description": "Agente api-engineer para Express + Node.js + TypeScript. Middleware, rutas, validación y Jest.",
        "category":    "profile",
        "tags":        ["express", "nodejs", "typescript", "middleware", "api"],
        "url":         "https://github.com/cristiancorreau/forge/tree/main/profiles/express",
        "language":    "TypeScript",
    },
    {
        "name":        "forge profile — expo",
        "description": "Agente mobile-engineer para React Native con Expo. Navegación, componentes nativos y EAS.",
        "category":    "profile",
        "tags":        ["expo", "react-native", "mobile", "ios", "android", "typescript"],
        "url":         "https://github.com/cristiancorreau/forge/tree/main/profiles/expo",
        "language":    "TypeScript",
    },
    {
        "name":        "forge profile — playwright-crawler",
        "description": "Agente scanner-engineer para scraping y crawling con Playwright. Extracción de datos, screenshots y automatización.",
        "category":    "profile",
        "tags":        ["playwright", "scraping", "crawler", "browser", "automation", "typescript"],
        "url":         "https://github.com/cristiancorreau/forge/tree/main/profiles/playwright-crawler",
        "language":    "TypeScript",
    },
    {
        "name":        "forge profile — django",
        "description": "Agente api-engineer para Django 4.x + DRF + PostgreSQL + pytest-django. Modelos, migraciones, serializers, viewsets y tests.",
        "category":    "profile",
        "tags":        ["django", "python", "drf", "postgresql", "rest-api", "pytest"],
        "url":         "https://github.com/cristiancorreau/forge/tree/main/profiles/django",
        "language":    "Python",
    },
    {
        "name":        "forge profile — vuenuxt",
        "description": "Agente frontend-engineer para Nuxt 3 + Vue 3 + Pinia + TypeScript. Pages, componentes, composables y SSR.",
        "category":    "profile",
        "tags":        ["nuxt", "vue", "typescript", "pinia", "ssr", "tailwind"],
        "url":         "https://github.com/cristiancorreau/forge/tree/main/profiles/vuenuxt",
        "language":    "TypeScript",
    },
    {
        "name":        "forge profile — go-gin",
        "description": "Agente api-engineer para Go + Gin/Echo + sqlc + PostgreSQL + testify. Handlers, services, repositories e migrations.",
        "category":    "profile",
        "tags":        ["go", "golang", "gin", "echo", "sqlc", "postgresql", "rest-api"],
        "url":         "https://github.com/cristiancorreau/forge/tree/main/profiles/go-gin",
        "language":    "Go",
    },
    {
        "name":        "forge profile — sveltekit",
        "description": "Agente frontend-engineer para SvelteKit 2 + Svelte 5 + TypeScript + Tailwind. Routes, components, load functions y form actions.",
        "category":    "profile",
        "tags":        ["sveltekit", "svelte", "typescript", "tailwind", "ssr", "vite"],
        "url":         "https://github.com/cristiancorreau/forge/tree/main/profiles/sveltekit",
        "language":    "TypeScript",
    },
    {
        "name":        "forge profile — laravel",
        "description": "Tres agentes para proyectos Laravel: api-engineer (Sanctum + Eloquent + Form Requests), fullstack-engineer (Blade + Livewire 3 o Inertia) y migration-specialist (upgrade L6→L13 paso a paso con breaking changes por versión).",
        "category":    "profile",
        "tags":        ["laravel", "php", "eloquent", "sanctum", "livewire", "blade", "inertia", "migration", "upgrade"],
        "url":         "https://github.com/cristiancorreau/forge/tree/main/profiles/laravel",
        "language":    "PHP",
    },
    {
        "name":        "forge profile — wordpress",
        "description": "Tres agentes para proyectos WordPress: wp-engineer (FSE + bloques Gutenberg + Interactivity API + WP REST API), divi-engineer (Divi Theme Builder + módulos ET_Builder_Module + Dynamic Content) y elementor-engineer (Elementor Pro + widgets personalizados + Dynamic Tags + Loop Grid).",
        "category":    "profile",
        "tags":        ["wordpress", "php", "gutenberg", "fse", "divi", "elementor", "page-builder", "blocks", "theme-builder"],
        "url":         "https://github.com/cristiancorreau/forge/tree/main/profiles/wordpress",
        "language":    "PHP",
    },

    # ── Tools ────────────────────────────────────────────────────────────────

    {
        "name":        "anthropics/claude-code (CLI)",
        "description": "Claude Code oficial — CLI para desarrollo con agentes IA directamente en la terminal. Instalación: npm i -g @anthropic-ai/claude-code",
        "category":    "tool",
        "tags":        ["claude-code", "cli", "terminal", "official"],
        "url":         "https://docs.anthropic.com/claude-code",
        "language":    "TypeScript",
    },
    {
        "name":        "modelcontextprotocol/inspector",
        "description": "Inspector visual para servidores MCP. Permite probar y depurar servers MCP en una interfaz web interactiva.",
        "category":    "tool",
        "tags":        ["mcp", "debugging", "inspector", "testing", "development"],
        "url":         "https://github.com/modelcontextprotocol/inspector",
        "language":    "TypeScript",
    },

    # ── Resources ─────────────────────────────────────────────────────────────

    {
        "name":        "modelcontextprotocol/servers (todos)",
        "description": "Repositorio oficial con todos los servers MCP de referencia: filesystem, git, github, postgres, sqlite, fetch, slack, puppeteer, memory y más.",
        "category":    "resource",
        "tags":        ["mcp", "servers", "reference", "official"],
        "url":         "https://github.com/modelcontextprotocol/servers",
        "language":    "TypeScript",
    },
    {
        "name":        "punkpeye/awesome-mcp-servers",
        "description": "Lista curada de servidores MCP de la comunidad. Cubre bases de datos, APIs, herramientas de desarrollo, comunicación y más.",
        "category":    "resource",
        "tags":        ["mcp", "awesome", "curated", "list", "community"],
        "url":         "https://github.com/punkpeye/awesome-mcp-servers",
        "language":    "",
    },
    {
        "name":        "Documentación oficial MCP",
        "description": "Documentación del Model Context Protocol: guías para construir servers y clients, especificación del protocolo y ejemplos.",
        "category":    "resource",
        "tags":        ["mcp", "docs", "specification", "protocol", "official"],
        "url":         "https://modelcontextprotocol.io",
        "language":    "",
    },
    {
        "name":        "Documentación Claude Code",
        "description": "Docs oficiales de Claude Code: hooks, slash commands, configuración de agentes, CLAUDE.md, MCP y más.",
        "category":    "resource",
        "tags":        ["claude-code", "docs", "hooks", "agents", "official"],
        "url":         "https://docs.anthropic.com/claude-code",
        "language":    "",
    },
]

CATEGORIES = sorted(set(t["category"] for t in CATALOG))

# ---------------------------------------------------------------------------
# Búsqueda local
# ---------------------------------------------------------------------------

def _search_local(query: str, category: Optional[str] = None) -> list[dict]:
    terms = query.lower().split() if query else []
    results = []
    for item in CATALOG:
        if category and item["category"] != category:
            continue
        if not terms:
            results.append((0, item))
            continue
        haystack = " ".join([
            item["name"],
            item["description"],
            item["category"],
            " ".join(item["tags"]),
            item.get("language", ""),
        ]).lower()
        score = sum(1 for t in terms if t in haystack)
        if score > 0:
            results.append((score, item))

    results.sort(key=lambda x: x[0], reverse=True)
    return [x[1] for x in results]


# ---------------------------------------------------------------------------
# GitHub API (opcional, --github)
# ---------------------------------------------------------------------------

CACHE_FILE = Path.home() / ".forge" / "template-search-cache.json"
CACHE_TTL  = 1800


def _cache_load() -> dict:
    if not CACHE_FILE.exists():
        return {}
    try:
        with open(CACHE_FILE) as f:
            data = json.load(f)
        if time.time() - data.get("_ts", 0) > CACHE_TTL:
            return {}
        return data
    except (json.JSONDecodeError, OSError):
        return {}


def _cache_save(data: dict) -> None:
    CACHE_FILE.parent.mkdir(parents=True, exist_ok=True)
    data["_ts"] = time.time()
    try:
        with open(CACHE_FILE, "w") as f:
            json.dump(data, f)
    except OSError:
        pass


def _fetch_github(query: str, limit: int) -> list[dict]:
    cache     = _cache_load()
    cache_key = f"gh_{query}_{limit}"
    if cache_key in cache:
        return cache[cache_key]

    topic_q = "topic:claude-code OR topic:mcp-server OR topic:ai-agent"
    full_q  = urllib.parse.urlencode({
        "q":        f"{query} ({topic_q})",
        "sort":     "stars",
        "order":    "desc",
        "per_page": min(limit, 20),
    })
    url     = f"https://api.github.com/search/repositories?{full_q}"
    headers = {
        "Accept":     "application/vnd.github+json",
        "User-Agent": "forge-template-search/2.0",
    }
    token = os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN")
    if token:
        headers["Authorization"] = f"Bearer {token}"

    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        if e.code == 403:
            print("  Límite de GitHub alcanzado. Exporta GITHUB_TOKEN para más requests.", file=sys.stderr)
        return []
    except (urllib.error.URLError, json.JSONDecodeError, OSError):
        return []

    results = []
    for item in data.get("items", []):
        results.append({
            "name":        item.get("full_name", ""),
            "description": item.get("description") or "",
            "category":    "github",
            "tags":        item.get("topics", []),
            "url":         item.get("html_url", ""),
            "language":    item.get("language") or "",
            "stars":       item.get("stargazers_count", 0),
        })

    cache[cache_key] = results
    _cache_save(cache)
    return results


# ---------------------------------------------------------------------------
# Output
# ---------------------------------------------------------------------------

CATEGORY_LABELS = {
    "framework":  "Framework",
    "mcp-server": "MCP Server",
    "skill":      "Skill",
    "tool":       "Herramienta",
    "profile":    "Profile forge",
    "resource":   "Recurso",
    "github":     "GitHub",
}


def _print_results(results: list[dict], as_json: bool) -> None:
    if as_json:
        print(json.dumps(results, ensure_ascii=False, indent=2))
        return
    if not results:
        print("Sin resultados. Prueba con otro término o usa --list-categories.")
        return
    for i, t in enumerate(results, 1):
        cat  = CATEGORY_LABELS.get(t.get("category", ""), t.get("category", ""))
        name = t.get("name", "")
        desc = t.get("description", "")
        tags = t.get("tags", [])
        url  = t.get("url", "")
        lang = t.get("language", "")
        stars = t.get("stars")

        meta_parts = [f"[{cat}]"]
        if lang:
            meta_parts.append(lang)
        if stars:
            meta_parts.append(f"★ {stars:,}")
        meta = "  ".join(meta_parts)

        print(f"{i:>2}. {name}")
        if desc:
            for line in textwrap.wrap(desc, width=68, initial_indent="     ",
                                      subsequent_indent="     "):
                print(line)
        if tags:
            tag_str = "  ".join(f"#{t}" for t in tags[:8])
            print(f"     {tag_str}")
        print(f"     {meta}")
        print(f"     {url}")
        print()


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Busca templates y recursos para desarrollo con agentes IA.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=textwrap.dedent("""\
            Ejemplos:
              %(prog)s "fastapi"
              %(prog)s "mcp postgres"
              %(prog)s --category mcp-server
              %(prog)s --category profile
              %(prog)s "rails" --github
              %(prog)s --list-categories
        """),
    )
    parser.add_argument("query",            nargs="?", default="",
                        help="Término de búsqueda")
    parser.add_argument("--limit",          type=int, default=20, metavar="N",
                        help="Máximo de resultados (default: 20)")
    parser.add_argument("--json",           dest="as_json", action="store_true",
                        help="Salida en JSON")
    parser.add_argument("--category", "-c", metavar="CAT",
                        help=f"Filtrar por categoría: {', '.join(CATEGORIES)}")
    parser.add_argument("--github",         action="store_true",
                        help="Extender con búsqueda en GitHub API (requiere red)")
    parser.add_argument("--list-categories", action="store_true",
                        help="Listar categorías disponibles y cantidad de items")

    args = parser.parse_args()

    if args.list_categories:
        print("Categorías disponibles:\n")
        for cat in CATEGORIES:
            count = sum(1 for t in CATALOG if t["category"] == cat)
            label = CATEGORY_LABELS.get(cat, cat)
            print(f"  {cat:<16} {label}  ({count} items)")
        print(f"\nTotal catálogo: {len(CATALOG)} items\n")
        return

    if not args.query and not args.category:
        parser.print_help()
        sys.exit(1)

    results = _search_local(args.query, args.category)

    if args.github and args.query:
        print("Buscando en GitHub...", file=sys.stderr)
        gh = _fetch_github(args.query, args.limit)
        seen = {r["url"] for r in results}
        for item in gh:
            if item["url"] not in seen:
                results.append(item)
                seen.add(item["url"])

    results = results[: args.limit]

    if not args.as_json:
        source = "catálogo local" + (" + GitHub" if args.github else "")
        print(f"Resultados: {len(results)} ({source})\n", file=sys.stderr)

    _print_results(results, args.as_json)


if __name__ == "__main__":
    main()
