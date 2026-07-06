/** FakeApprovals — Map simple (SPEC-076 § 6). */
import type { ApprovalPort } from '../ports/approval.js';
import type { Approval } from '../types.js';

export class FakeApprovals implements ApprovalPort {
  readonly requests = new Map<string, Approval>();
  readonly resolutions: Array<{ approvalId: string; resolution: 'allow' | 'deny' | 'always' }> = [];
  private readonly handlers = new Set<(approval: Approval) => void>();
  private counter = 0;

  async request(req: { sessionId: string; kind: string; payload: unknown }): Promise<string> {
    const id = `apr-${String(++this.counter).padStart(4, '0')}`;
    const approval = {
      id,
      sessionId: req.sessionId,
      kind: req.kind,
      payload: (req.payload ?? {}) as Record<string, unknown>,
    } as Approval;
    this.requests.set(id, approval);
    for (const handler of this.handlers) handler(approval);
    return id;
  }

  async resolve(approvalId: string, resolution: 'allow' | 'deny' | 'always'): Promise<void> {
    this.resolutions.push({ approvalId, resolution });
    const approval = this.requests.get(approvalId);
    if (approval) {
      approval.resolution = resolution === 'deny' ? 'denied' : 'approved';
    }
  }

  onRequest(handler: (approval: Approval) => void): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }
}
