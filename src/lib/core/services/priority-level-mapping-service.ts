import { db, generateUUID } from '$lib/core/db';
import type { z } from 'zod';
import type { PriorityLevelMapping as PriorityLevelMappingType } from '$lib/core/db';
import { validationService } from './validation-service';

export type PriorityLevelMapping = PriorityLevelMappingType;

class PriorityLevelMappingService {
    async createMapping(data: Omit<PriorityLevelMapping, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>): Promise<PriorityLevelMapping> {
        // Validate mapping data before creation
        const validation = await validationService.validateTagCreation(data as any);
        if (!validation.isValid) {
            throw new Error(`Invalid mapping data: ${validation.errors.join(', ')}`);
        }

        const mapping: PriorityLevelMapping = {
            id: generateUUID(),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            deletedAt: null,
            ...data
        };
        await db.priorityLevelMappings.add(mapping);
        return mapping;
    }

    async getMappingById(id: string): Promise<PriorityLevelMapping | undefined> {
        return db.priorityLevelMappings.get(id);
    }

    async getAllMappings(): Promise<PriorityLevelMapping[]> {
        return db.priorityLevelMappings.filter(m => !m.deletedAt).toArray();
    }

    async getMappingsByWhyTag(whyTag: string): Promise<PriorityLevelMapping[]> {
        return db.priorityLevelMappings.filter(m => !m.deletedAt && m.whyTag === whyTag).toArray();
    }

    async updateMapping(id: string, updates: Partial<PriorityLevelMapping>): Promise<void> {
        // Validate mapping data before update
        const validation = await validationService.validateTagUpdate(id, updates as any);
        if (!validation.isValid) {
            throw new Error(`Invalid mapping data: ${validation.errors.join(', ')}`);
        }

        await db.priorityLevelMappings.update(id, { ...updates, updatedAt: new Date().toISOString() });
    }

    async softDeleteMapping(id: string): Promise<void> {
        await db.priorityLevelMappings.update(id, { deletedAt: new Date().toISOString() });
    }
}

export const priorityLevelMappingService = new PriorityLevelMappingService(); 