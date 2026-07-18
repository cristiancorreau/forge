/* GENERADO por scripts/generate.mjs — NO EDITAR */

export const COMMON_SCHEMA = {
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "forge://schemas/v4/common",
  "title": "Common",
  "description": "Shared $defs for the FORGE v4 domain contracts (SPEC-075).",
  "$defs": {
    "forgeId": {
      "type": "string",
      "pattern": "^(prj|hrn|tm|rol|tsk|ses|apr)_[0-9A-HJKMNP-TV-Z]{26}$"
    },
    "timestamp": {
      "type": "string",
      "format": "date-time"
    },
    "absolutePath": {
      "type": "string",
      "minLength": 1
    },
    "sha": {
      "type": "string",
      "pattern": "^[0-9a-f]{7,40}$"
    }
  }
} as const;

export const SCHEMAS = {
  project: {
    "$schema": "http://json-schema.org/draft-07/schema#",
    "$id": "forge://schemas/v4/project",
    "title": "Project",
    "description": "A project registered in the FORGE v4 daemon registry. Distinct from the per-project project.yaml config contract (core/schemas/project.schema.json).",
    "type": "object",
    "additionalProperties": false,
    "required": [
      "id",
      "name",
      "path",
      "createdAt"
    ],
    "properties": {
      "id": {
        "$ref": "forge://schemas/v4/common#/$defs/forgeId"
      },
      "name": {
        "type": "string",
        "minLength": 1
      },
      "path": {
        "$ref": "forge://schemas/v4/common#/$defs/absolutePath"
      },
      "vcsRemote": {
        "type": "string"
      },
      "profile": {
        "type": "string"
      },
      "createdAt": {
        "$ref": "forge://schemas/v4/common#/$defs/timestamp"
      },
      "lastSeenAt": {
        "$ref": "forge://schemas/v4/common#/$defs/timestamp"
      }
    }
  },
  harness: {
    "$schema": "http://json-schema.org/draft-07/schema#",
    "$id": "forge://schemas/v4/harness",
    "title": "Harness",
    "description": "A (runtime x account) execution target with an isolated HOME. runtime is a free string: the runtime catalog is validated by the daemon, not by the contract.",
    "type": "object",
    "additionalProperties": false,
    "required": [
      "id",
      "runtime",
      "label",
      "homeDir",
      "priority",
      "status",
      "createdAt"
    ],
    "properties": {
      "id": {
        "$ref": "forge://schemas/v4/common#/$defs/forgeId"
      },
      "runtime": {
        "type": "string",
        "minLength": 1
      },
      "label": {
        "type": "string",
        "minLength": 1
      },
      "homeDir": {
        "$ref": "forge://schemas/v4/common#/$defs/absolutePath"
      },
      "priority": {
        "type": "integer",
        "minimum": 0
      },
      "status": {
        "type": "string",
        "enum": [
          "active",
          "rate_limited",
          "disabled"
        ]
      },
      "rateLimitedUntil": {
        "$ref": "forge://schemas/v4/common#/$defs/timestamp"
      },
      "createdAt": {
        "$ref": "forge://schemas/v4/common#/$defs/timestamp"
      }
    }
  },
  team: {
    "$schema": "http://json-schema.org/draft-07/schema#",
    "$id": "forge://schemas/v4/team",
    "title": "Team",
    "description": "An agent team template.",
    "type": "object",
    "additionalProperties": false,
    "required": [
      "id",
      "name"
    ],
    "properties": {
      "id": {
        "$ref": "forge://schemas/v4/common#/$defs/forgeId"
      },
      "name": {
        "type": "string",
        "minLength": 1
      },
      "description": {
        "type": "string"
      }
    }
  },
  teamRole: {
    "$schema": "http://json-schema.org/draft-07/schema#",
    "$id": "forge://schemas/v4/team-role",
    "title": "TeamRole",
    "description": "A role inside a team: preferred runtime, system prompt reference and tool tier permissions.",
    "type": "object",
    "additionalProperties": false,
    "required": [
      "id",
      "teamId",
      "roleName"
    ],
    "properties": {
      "id": {
        "$ref": "forge://schemas/v4/common#/$defs/forgeId"
      },
      "teamId": {
        "$ref": "forge://schemas/v4/common#/$defs/forgeId"
      },
      "roleName": {
        "type": "string",
        "minLength": 1
      },
      "runtimePref": {
        "type": "string"
      },
      "systemPromptRef": {
        "type": "string"
      },
      "tierPermissions": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "allow": {
            "type": "array",
            "items": {
              "type": "string"
            }
          },
          "deny": {
            "type": "array",
            "items": {
              "type": "string"
            }
          }
        }
      }
    }
  },
  task: {
    "$schema": "http://json-schema.org/draft-07/schema#",
    "$id": "forge://schemas/v4/task",
    "title": "Task",
    "description": "A unit of work on a project, executed by agent sessions in a git worktree.",
    "type": "object",
    "additionalProperties": false,
    "required": [
      "id",
      "projectId",
      "title",
      "status",
      "createdAt",
      "updatedAt"
    ],
    "properties": {
      "id": {
        "$ref": "forge://schemas/v4/common#/$defs/forgeId"
      },
      "projectId": {
        "$ref": "forge://schemas/v4/common#/$defs/forgeId"
      },
      "teamId": {
        "$ref": "forge://schemas/v4/common#/$defs/forgeId"
      },
      "title": {
        "type": "string",
        "minLength": 1
      },
      "specRef": {
        "type": "string"
      },
      "status": {
        "type": "string",
        "enum": [
          "backlog",
          "queued",
          "running",
          "needs_input",
          "review",
          "done",
          "failed",
          "orphaned"
        ]
      },
      "worktreePath": {
        "$ref": "forge://schemas/v4/common#/$defs/absolutePath"
      },
      "baseSha": {
        "$ref": "forge://schemas/v4/common#/$defs/sha"
      },
      "createdAt": {
        "$ref": "forge://schemas/v4/common#/$defs/timestamp"
      },
      "updatedAt": {
        "$ref": "forge://schemas/v4/common#/$defs/timestamp"
      }
    }
  },
  session: {
    "$schema": "http://json-schema.org/draft-07/schema#",
    "$id": "forge://schemas/v4/session",
    "title": "Session",
    "description": "An agent session running a task on a harness (tmux-managed).",
    "type": "object",
    "additionalProperties": false,
    "required": [
      "id",
      "taskId",
      "harnessId",
      "status",
      "startedAt",
      "tokensIn",
      "tokensOut"
    ],
    "properties": {
      "id": {
        "$ref": "forge://schemas/v4/common#/$defs/forgeId"
      },
      "taskId": {
        "$ref": "forge://schemas/v4/common#/$defs/forgeId"
      },
      "harnessId": {
        "$ref": "forge://schemas/v4/common#/$defs/forgeId"
      },
      "roleName": {
        "type": "string"
      },
      "tmuxSession": {
        "type": "string"
      },
      "transcriptRef": {
        "type": "string"
      },
      "status": {
        "type": "string",
        "enum": [
          "starting",
          "running",
          "exited",
          "failed",
          "orphaned"
        ]
      },
      "startedAt": {
        "$ref": "forge://schemas/v4/common#/$defs/timestamp"
      },
      "endedAt": {
        "$ref": "forge://schemas/v4/common#/$defs/timestamp"
      },
      "tokensIn": {
        "type": "integer",
        "minimum": 0
      },
      "tokensOut": {
        "type": "integer",
        "minimum": 0
      },
      "handoffFrom": {
        "$ref": "forge://schemas/v4/common#/$defs/forgeId"
      }
    }
  },
  approval: {
    "$schema": "http://json-schema.org/draft-07/schema#",
    "$id": "forge://schemas/v4/approval",
    "title": "Approval",
    "description": "A permission request raised by an agent session, resolved from the UI.",
    "type": "object",
    "additionalProperties": false,
    "required": [
      "id",
      "sessionId",
      "kind",
      "payload"
    ],
    "properties": {
      "id": {
        "$ref": "forge://schemas/v4/common#/$defs/forgeId"
      },
      "sessionId": {
        "$ref": "forge://schemas/v4/common#/$defs/forgeId"
      },
      "kind": {
        "type": "string",
        "enum": [
          "tool_use",
          "plan_review",
          "question"
        ]
      },
      "payload": {
        "type": "object"
      },
      "resolution": {
        "type": "string",
        "enum": [
          "approved",
          "denied",
          "timeout"
        ]
      },
      "resolvedAt": {
        "$ref": "forge://schemas/v4/common#/$defs/timestamp"
      }
    }
  },
  event: {
    "$schema": "http://json-schema.org/draft-07/schema#",
    "$id": "forge://schemas/v4/event",
    "title": "Event",
    "description": "Append-only domain event. id is the SQLite rowid assigned by the store.",
    "type": "object",
    "additionalProperties": false,
    "required": [
      "id",
      "ts",
      "kind",
      "entity",
      "entityId"
    ],
    "properties": {
      "id": {
        "type": "integer",
        "minimum": 1
      },
      "ts": {
        "$ref": "forge://schemas/v4/common#/$defs/timestamp"
      },
      "kind": {
        "type": "string",
        "pattern": "^[a-z_]+\\.[a-z_]+$"
      },
      "entity": {
        "type": "string",
        "enum": [
          "project",
          "harness",
          "team",
          "team_role",
          "task",
          "session",
          "approval"
        ]
      },
      "entityId": {
        "type": "string",
        "minLength": 1
      },
      "payload": {
        "type": "object"
      }
    }
  },
  export: {
    "$schema": "http://json-schema.org/draft-07/schema#",
    "$id": "forge://schemas/v4/export",
    "title": "ProjectExport",
    "description": "Modelo resuelto de un proyecto forge, emitido por `forge export --json` (SPEC-083 P2). Manifiesto machine-readable que un orquestador (mingako) puede consumir para inyectar agentes, skills y MCP servers en su runtime.",
    "type": "object",
    "additionalProperties": false,
    "required": [
      "schemaVersion",
      "project",
      "agents",
      "commands",
      "skills",
      "mcpServers"
    ],
    "properties": {
      "schemaVersion": {
        "const": "1"
      },
      "project": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "name",
          "path",
          "runtimes",
          "profiles"
        ],
        "properties": {
          "name": {
            "type": "string",
            "minLength": 1
          },
          "path": {
            "type": "string",
            "minLength": 1
          },
          "mode": {
            "type": "string"
          },
          "runtimes": {
            "type": "array",
            "items": {
              "type": "string",
              "minLength": 1
            }
          },
          "profiles": {
            "type": "array",
            "items": {
              "type": "string",
              "minLength": 1
            }
          }
        }
      },
      "agents": {
        "type": "array",
        "items": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "name",
            "description",
            "sourceFile"
          ],
          "properties": {
            "name": {
              "type": "string",
              "minLength": 1
            },
            "description": {
              "type": "string"
            },
            "scope": {
              "type": "string"
            },
            "tools": {
              "type": "array",
              "items": {
                "type": "string",
                "minLength": 1
              }
            },
            "model": {
              "type": "string"
            },
            "skills": {
              "type": "array",
              "items": {
                "type": "string",
                "minLength": 1
              }
            },
            "mcpServers": {
              "type": "array",
              "items": {
                "type": "string",
                "minLength": 1
              }
            },
            "sourceFile": {
              "type": "string",
              "minLength": 1
            }
          }
        }
      },
      "commands": {
        "type": "array",
        "items": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "name",
            "sourceFile"
          ],
          "properties": {
            "name": {
              "type": "string",
              "minLength": 1
            },
            "sourceFile": {
              "type": "string",
              "minLength": 1
            }
          }
        }
      },
      "skills": {
        "type": "array",
        "items": {
          "type": "string",
          "minLength": 1
        }
      },
      "mcpServers": {
        "type": "array",
        "items": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "name"
          ],
          "properties": {
            "name": {
              "type": "string",
              "minLength": 1
            },
            "autoApprove": {
              "type": "array",
              "items": {
                "type": "string"
              }
            }
          }
        }
      },
      "porRuntime": {
        "type": "object",
        "additionalProperties": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "label",
            "kind",
            "surfaces"
          ],
          "properties": {
            "label": {
              "type": "string",
              "minLength": 1
            },
            "kind": {
              "enum": [
                "native",
                "rules"
              ]
            },
            "surfaces": {
              "type": "array",
              "items": {
                "type": "string",
                "minLength": 1
              }
            }
          }
        }
      }
    }
  },
} as const;
