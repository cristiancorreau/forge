/**
 * ApprovalPort — canal de solicitud/resolución de permisos (SPEC-076 § 3).
 * Implementación: hooks PreToolUse + MCP (SPEC-081).
 */
import type { Approval } from '../types.js';

export interface ApprovalPort {
  request(req: { sessionId: string; kind: string; payload: unknown }): Promise<string>; // approvalId
  resolve(approvalId: string, resolution: 'allow' | 'deny' | 'always'): Promise<void>;
  onRequest(handler: (approval: Approval) => void): () => void;
}
