export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown
  ) {
    super(message);
  }
}

export const badRequest = (code: string, msg: string, details?: unknown) => new AppError(400, code, msg, details);
export const unauthorized = (msg = 'Authentification requise') => new AppError(401, 'UNAUTHORIZED', msg);
export const forbidden = (msg = 'Accès refusé') => new AppError(403, 'FORBIDDEN', msg);
export const notFound = (msg = 'Introuvable') => new AppError(404, 'NOT_FOUND', msg);
export const conflict = (code: string, msg: string) => new AppError(409, code, msg);
