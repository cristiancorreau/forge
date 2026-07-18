/* GENERADO por scripts/generate.mjs — NO EDITAR */

export interface ValidationError {
  instancePath: string;
  schemaPath: string;
  keyword: string;
  params: Record<string, unknown>;
  message?: string;
}

export interface ValidateFn {
  (data: unknown): boolean;
  errors?: ValidationError[] | null;
}

export declare const validateProject: ValidateFn;
export declare const validateHarness: ValidateFn;
export declare const validateTeam: ValidateFn;
export declare const validateTeamRole: ValidateFn;
export declare const validateTask: ValidateFn;
export declare const validateSession: ValidateFn;
export declare const validateApproval: ValidateFn;
export declare const validateApprovalRequest: ValidateFn;
export declare const validateApprovalResolution: ValidateFn;
export declare const validateEvent: ValidateFn;
export declare const validateProjectExport: ValidateFn;
export declare const validateMcpPolicy: ValidateFn;
export declare const validateDaemonDiscovery: ValidateFn;
