import type { NextFunction, Request, Response } from 'express';
import { forbidden, unauthorized } from '../lib/errors.js';
import { resolveSession, SESSION_COOKIE } from '../lib/session.js';

export async function loadUser(req: Request, _res: Response, next: NextFunction) {
  req.user = (await resolveSession(req.cookies?.[SESSION_COOKIE])) ?? undefined;
  next();
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) throw unauthorized();
  next();
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) throw unauthorized();
  if (req.user.role !== 'ADMIN') throw forbidden('Réservé aux administrateurs');
  next();
}

/**
 * Protection CSRF : toute requête qui modifie l'état doit porter un en-tête personnalisé.
 * Un formulaire d'un autre site ne peut pas l'ajouter, et CORS bloque les scripts tiers.
 */
export function requireCsrfHeader(req: Request, _res: Response, next: NextFunction) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.get('x-requested-with') !== 'parcheesi') throw forbidden('En-tête X-Requested-With manquant');
  next();
}
