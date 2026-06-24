import jwt from 'jsonwebtoken';
import type { Request, Response } from 'express';

const COOKIE = 'reach_token';

export interface JwtPayload {
  userId: string;
  organizationId: string;
  email: string;
  role: string;
}

export function signToken(payload: JwtPayload): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET not set');
  return jwt.sign(payload, secret, { expiresIn: '7d' });
}

export function verifyToken(token: string): JwtPayload {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET not set');
  return jwt.verify(token, secret) as JwtPayload;
}

export function setAuthCookie(res: Response, token: string): void {
  res.cookie(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

export function clearAuthCookie(res: Response): void {
  res.clearCookie(COOKIE);
}

export function getTokenFromRequest(req: Request): string | null {
  return req.cookies?.[COOKIE] ?? null;
}
