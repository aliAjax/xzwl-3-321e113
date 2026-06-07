import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import db from '../db';
import { jwtConfig } from '../config/jwt';
import { User, AuthResponse, LoginRequest } from '@shared/types';

interface UserRow {
  id: string;
  username: string;
  password_hash: string;
  role: string;
  name: string;
  phone: string;
  driver_id?: string;
  created_at: string;
}

export const authService = {
  async login(loginRequest: LoginRequest): Promise<AuthResponse | null> {
    const { username, password } = loginRequest;

    const userRow = db.prepare(`
      SELECT id, username, password_hash, role, name, phone, driver_id, created_at
      FROM users
      WHERE username = ?
    `).get(username) as UserRow | undefined;

    if (!userRow) {
      return null;
    }

    const isPasswordValid = await bcrypt.compare(password, userRow.password_hash);
    if (!isPasswordValid) {
      return null;
    }

    const user: User = {
      id: userRow.id,
      username: userRow.username,
      role: userRow.role as User['role'],
      name: userRow.name,
      phone: userRow.phone,
      driverId: userRow.driver_id,
      createdAt: userRow.created_at,
    };

    const token = jwt.sign(user, jwtConfig.secret, {
      expiresIn: jwtConfig.expiresIn,
    });

    return { token, user };
  },

  generateToken(user: User): string {
    return jwt.sign(user, jwtConfig.secret, {
      expiresIn: jwtConfig.expiresIn,
    });
  },

  verifyToken(token: string): User | null {
    try {
      return jwt.verify(token, jwtConfig.secret) as User;
    } catch (error) {
      return null;
    }
  },
};
