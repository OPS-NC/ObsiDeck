export type VaultErrorCode =
  | "INVALID_INPUT"
  | "INVALID_PATH"
  | "INVALID_NAME"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "ALREADY_EXISTS"
  | "NOT_A_FILE"
  | "NOT_A_DIRECTORY"
  | "UNSUPPORTED_TYPE"
  | "TOO_LARGE"
  | "CONFLICT";

const STATUS: Record<VaultErrorCode, number> = {
  INVALID_INPUT: 400,
  INVALID_PATH: 400,
  INVALID_NAME: 400,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  ALREADY_EXISTS: 409,
  NOT_A_FILE: 400,
  NOT_A_DIRECTORY: 400,
  UNSUPPORTED_TYPE: 415,
  TOO_LARGE: 413,
  CONFLICT: 409,
};

/** Error safe to return to the client: messages never contain host paths. */
export class VaultError extends Error {
  readonly code: VaultErrorCode;
  readonly status: number;
  readonly details?: Record<string, unknown>;

  constructor(code: VaultErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "VaultError";
    this.code = code;
    this.status = STATUS[code];
    this.details = details;
  }
}

export function isErrnoException(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && typeof (err as NodeJS.ErrnoException).code === "string";
}
