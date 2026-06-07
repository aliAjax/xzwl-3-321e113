import type { SignOptions } from 'jsonwebtoken';

export const jwtConfig = {
  secret: process.env.JWT_SECRET || 'dev-secret-key',
  expiresIn: '24h' as SignOptions['expiresIn'],
};
