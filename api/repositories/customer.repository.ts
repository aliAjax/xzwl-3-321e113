import { BaseRepository } from './base';
import type { Customer } from '../../shared/types';

class CustomerRepository extends BaseRepository<Customer> {
  protected tableName = 'customers';
  protected fieldMap: Record<keyof Customer, string> = {
    id: 'id',
    name: 'name',
    contactName: 'contact_name',
    phone: 'phone',
    driverId: 'driver_id',
    address: 'address',
    priority: 'priority',
    createdAt: 'created_at',
  };
  protected jsonFields: Array<keyof Customer> = [];

  findByName(name: string): Customer | undefined {
    return this.findOneByField('name', name);
  }

  findByPhone(phone: string): Customer | undefined {
    return this.findOneByField('phone', phone);
  }

  findByPriority(priority: number): Customer[] {
    return this.findByField('priority', priority, { orderBy: 'createdAt', orderDir: 'DESC' });
  }

  searchByName(name: string): Customer[] {
    const rows = this.db
      .prepare(`SELECT * FROM ${this.tableName} WHERE name LIKE ? ORDER BY created_at DESC`)
      .all(`%${name}%`) as Record<string, unknown>[];
    return rows.map(row => this.fromDatabase(row));
  }

  findAllSortedByPriority(): Customer[] {
    return this.findAll({ orderBy: 'priority', orderDir: 'DESC' });
  }

  createCustomer(data: Omit<Customer, 'id' | 'createdAt'> & { id?: string; createdAt?: string }): Customer {
    return this.create(data);
  }

  updateCustomer(id: string, data: Partial<Omit<Customer, 'id' | 'createdAt'>>): Customer | undefined {
    return this.update(id, data);
  }
}

export const customerRepository = new CustomerRepository();
