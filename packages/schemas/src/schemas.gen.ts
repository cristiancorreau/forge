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
    "description": "A permission request raised by an agent session, resolved from the UI. Enums aligned with the SPEC-081 wire contract (approval-request/approval-resolution): kind mirrors ApprovalRequest.kind and resolution mirrors ApprovalResolution.decision, so a persisted ApprovalRequest validates as-is.",
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
        "description": "Runtime session identifier (Claude Code session_id; opaque string, not a forgeId — same shape as ApprovalRequest.sessionId)",
        "type": "string",
        "minLength": 1
      },
      "kind": {
        "type": "string",
        "enum": [
          "tool_use",
          "plan",
          "question"
        ]
      },
      "payload": {
        "type": "object"
      },
      "resolution": {
        "type": "string",
        "enum": [
          "allow",
          "deny",
          "answer",
          "timeout"
        ]
      },
      "resolvedAt": {
        "$ref": "forge://schemas/v4/common#/$defs/timestamp"
      }
    }
  },
  approvalRequest: {
    "$schema": "http://json-schema.org/draft-07/schema#",
    "$id": "forge://schemas/v4/approval-request",
    "title": "ApprovalRequest",
    "description": "Wire contract of the approvals circuit (SPEC-081, forge half): the body that pre-approval-gate.cjs POSTs to /api/v1/approvals. The daemon (mingako) assigns id/createdAt and builds card, so those are optional on the wire. Forge owns this shape.",
    "type": "object",
    "additionalProperties": false,
    "required": [
      "sessionId",
      "kind",
      "tool",
      "payload",
      "timeoutMs"
    ],
    "properties": {
      "id": {
        "$ref": "forge://schemas/v4/common#/$defs/forgeId"
      },
      "sessionId": {
        "description": "Runtime session identifier (Claude Code session_id; opaque string, not a forgeId)",
        "type": "string"
      },
      "kind": {
        "type": "string",
        "enum": [
          "tool_use",
          "plan",
          "question"
        ]
      },
      "tool": {
        "description": "'Bash' | 'Edit' | 'Write' | 'ExitPlanMode' | 'AskUserQuestion' | 'ask_user' | ...",
        "type": "string",
        "minLength": 1
      },
      "card": {
        "description": "What the UI renders (built by the daemon via buildApprovalCard, SPEC-081 §5)",
        "type": "object",
        "additionalProperties": false,
        "required": [
          "title",
          "body",
          "control",
          "offerAlwaysForTask"
        ],
        "properties": {
          "title": {
            "type": "string"
          },
          "body": {
            "type": "string"
          },
          "control": {
            "type": "string",
            "enum": [
              "confirm",
              "radio",
              "checkbox",
              "text"
            ]
          },
          "options": {
            "type": "array",
            "items": {
              "type": "object",
              "additionalProperties": false,
              "required": [
                "id",
                "label"
              ],
              "properties": {
                "id": {
                  "type": "string"
                },
                "label": {
                  "type": "string"
                }
              }
            }
          },
          "offerAlwaysForTask": {
            "type": "boolean"
          }
        }
      },
      "payload": {
        "description": "Raw tool_input (audit trail); any JSON value"
      },
      "timeoutMs": {
        "type": "integer",
        "minimum": 1
      },
      "createdAt": {
        "$ref": "forge://schemas/v4/common#/$defs/timestamp"
      }
    }
  },
  approvalResolution: {
    "$schema": "http://json-schema.org/draft-07/schema#",
    "$id": "forge://schemas/v4/approval-resolution",
    "title": "ApprovalResolution",
    "description": "Wire contract of the approvals circuit (SPEC-081, forge half): the resolution returned by GET /api/v1/approvals/:id/wait and accepted by POST /api/v1/approvals/:id/resolve. decision 'timeout' always maps to DENY on the runtime side (kept distinct from 'deny' for audit). Forge owns this shape.",
    "type": "object",
    "additionalProperties": false,
    "required": [
      "decision",
      "resolvedBy",
      "resolvedAt"
    ],
    "properties": {
      "decision": {
        "type": "string",
        "enum": [
          "allow",
          "deny",
          "answer",
          "timeout"
        ]
      },
      "answer": {
        "description": "Human answer for kind question/plan",
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "optionIds": {
            "type": "array",
            "items": {
              "type": "string"
            }
          },
          "text": {
            "type": "string"
          }
        }
      },
      "reason": {
        "description": "Optional human-readable motive; the hook forwards it as permissionDecisionReason",
        "type": "string"
      },
      "alwaysForTask": {
        "description": "\"Always allow for this task\" (inserts an approval rule, SPEC-081 §6)",
        "type": "boolean"
      },
      "resolvedBy": {
        "type": "string",
        "enum": [
          "user",
          "rule",
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
      "perRuntime": {
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
  mcpPolicy: {
    "$schema": "http://json-schema.org/draft-07/schema#",
    "$id": "forge://schemas/v4/mcp-policy",
    "title": "McpPolicy",
    "description": "Política MCP efectiva de un proyecto forge, emitida por `forge generate` en .forge/mcp-policy.json (SPEC-083 P5). Default-deny: toda tool no listada en autoApprove requiere aprobación. Un orquestador (mingako) la consume para sandboxing y approval gates sin re-derivarla de project.yaml.",
    "type": "object",
    "additionalProperties": false,
    "required": [
      "schemaVersion",
      "generatedBy",
      "project",
      "defaultPolicy",
      "servers"
    ],
    "properties": {
      "schemaVersion": {
        "const": "1"
      },
      "generatedBy": {
        "type": "string",
        "pattern": "^forge@\\d+\\.\\d+\\.\\d+(-[0-9A-Za-z.-]+)?(\\+[0-9A-Za-z.-]+)?$"
      },
      "project": {
        "type": "string",
        "minLength": 1
      },
      "defaultPolicy": {
        "const": "deny"
      },
      "servers": {
        "type": "array",
        "items": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "name",
            "autoApprove"
          ],
          "properties": {
            "name": {
              "type": "string",
              "minLength": 1
            },
            "autoApprove": {
              "type": "array",
              "items": {
                "type": "string",
                "minLength": 1
              }
            }
          }
        }
      },
      "notes": {
        "type": "string"
      }
    }
  },
  daemonDiscovery: {
    "$schema": "http://json-schema.org/draft-07/schema#",
    "$id": "forge://schemas/v4/daemon-discovery",
    "title": "DaemonDiscovery",
    "description": "Discovery file ~/.forge/daemon.json written by the local orchestrator daemon (mingako) with mode 0600 and read by the pre-approval-gate.cjs hook to reach the approvals endpoint at http://127.0.0.1:<port>. Forge owns this shape; mingako owns the runtime semantics (SPEC-081 / SPEC-083 P6).",
    "type": "object",
    "additionalProperties": false,
    "required": [
      "pid",
      "port",
      "token",
      "startedAt"
    ],
    "properties": {
      "pid": {
        "type": "integer",
        "minimum": 1
      },
      "port": {
        "type": "integer",
        "minimum": 1,
        "maximum": 65535
      },
      "token": {
        "type": "string",
        "minLength": 1
      },
      "startedAt": {
        "$ref": "forge://schemas/v4/common#/$defs/timestamp"
      }
    }
  },
} as const;
