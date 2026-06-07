import { BaseRepository } from './base';
import type { User, UserRole } from '../../shared/types';

interface UserWithPassword extends User {
  passwordHash: string;
}

class UserRepository extends BaseRepository<UserWithPassword> {
  protected tableName = 'users';
  protected fieldMap: Record<keyof UserWithPassword, string> = {
    id: 'id',
    username: 'username',
    passwordHash: 'password_hash',
    role: 'role',
    name: 'name',
    phone: 'phone',
    createdAt: 'created_at',
  };
  protected jsonFields: Array<keyof UserWithPassword> = [];

  findByUsername(username: string): UserWithPassword | undefined {
    return this.findOneByField('username', username);
  }

  findByRole(role: UserRole): UserWithPassword[] {
    return this.findByField('role', role, { orderBy: 'createdAt', orderDir: 'DESC' });
  }

  findByUsernameAndPassword(username: string, passwordHash: string): UserWithPassword | undefined {
    const row = this.db
      .prepare(`SELECT * FROM ${this.tableName} WHERE username = ? AND password_hash = ? LIMIT 1`)
      .get(username, passwordHash) as Record<string, unknown> | undefined;
    return row ? this.fromDatabase(row) : undefined;
  }

  createUser(data: Omit<UserWithPassword, 'id' | 'createdAt'> & { id?: string; createdAt?: string }): UserWithPassword {
    return this.create(data);
  }

  updateUser(id: string, data: Partial<Omit<UserWithPassword, 'id' | 'createdAt'>>): UserWithPassword | undefined {
    return this.update(id, data);
  }
}

export const userRepository = new UserRepository();
export { UserWithPassword };
