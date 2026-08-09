import jwt from 'jsonwebtoken';

export function verifyNhostToken(authHeader: string | undefined) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('Missing or invalid Authorization header');
  }
  
  const token = authHeader.split(' ')[1];
  const secret = process.env.NHOST_JWT_SECRET;
  
  if (!secret) {
    throw new Error('NHOST_JWT_SECRET environment variable is not set');
  }
  
  return jwt.verify(token, secret) as jwt.JwtPayload;
}
