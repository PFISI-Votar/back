import type { NextFunction, Request, Response } from 'express';

export const requireHttpsMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  const isSecure = req.secure || req.headers['x-forwarded-proto'] === 'https';
  if (!isSecure) {
    res.status(403).json({ message: 'HTTPS requerido' });
    return;
  }
  next();
};
