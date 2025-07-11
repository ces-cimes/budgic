import { db, generateUUID } from '$lib/core/db';
import type { z } from 'zod';
import type { Payee as PayeeType } from '$lib/core/db';
import { validationService } from './validation-service';

export type Payee = PayeeType;

class PayeeService {
    async createPayee(data: Omit<Payee, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>): Promise<Payee> {
        // Validate payee data before creation
        const validation = await validationService.validateTagCreation(data as any);
        if (!validation.isValid) {
            throw new Error(`Invalid payee data: ${validation.errors.join(', ')}`);
        }

        const payee: Payee = {
            id: generateUUID(),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            deletedAt: null,
            ...data
        };
        await db.payees.add(payee);
        return payee;
    }

    async getPayeeById(id: string): Promise<Payee | undefined> {
        return db.payees.get(id);
    }

    async getAllPayees(): Promise<Payee[]> {
        return db.payees.filter(p => !p.deletedAt).toArray();
    }

    async searchPayeesByName(query: string): Promise<Payee[]> {
        return db.payees.filter(p => !p.deletedAt && p.name.toLowerCase().includes(query.toLowerCase())).toArray();
    }

    async updatePayee(id: string, updates: Partial<Payee>): Promise<void> {
        // Validate payee data before update
        const validation = await validationService.validateTagUpdate(id, updates as any);
        if (!validation.isValid) {
            throw new Error(`Invalid payee data: ${validation.errors.join(', ')}`);
        }

        await db.payees.update(id, { ...updates, updatedAt: new Date().toISOString() });
    }

    async softDeletePayee(id: string): Promise<void> {
        await db.payees.update(id, { deletedAt: new Date().toISOString() });
    }
}

export const payeeService = new PayeeService(); 