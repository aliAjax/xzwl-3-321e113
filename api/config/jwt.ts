export const jwtConfig = {
  secret: process.env.JWT_SECRET || 'dev-secret-key',
  expiresIn: '24h',
};
