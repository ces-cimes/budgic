import { db, generateUUID } from '$lib/core/db';
import type { Tag, WhatTagType, WhyTagType } from '$lib/core/db';
import { priorityLevelMappingService } from './priority-level-mapping-service';
import { validationService } from './validation-service';
import { getDefaultColorForTag } from '$lib/utils/tag-utils';

class TagService {
    public get ready() {
        return Promise.resolve();
    }

    async createTag(data: Partial<Tag>): Promise<Tag> {
        // Validate tag data before creation
        const validation = await validationService.validateTagCreation(data);
        if (!validation.isValid) {
            throw new Error(`Invalid tag data: ${validation.errors.join(', ')}`);
        }

        const newTag: Tag = {
            id: generateUUID(),
            name: data.name!,
            dimension: data.dimension!,
            color: data.color || '#3B82F6',
            isActive: data.isActive ?? true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            deletedAt: null
        };
        
        await db.tags.add(newTag);
        return newTag;
    }

    async getTagById(id: string): Promise<Tag | undefined> {
        const tag = await db.tags.get(id);
        
        if (!tag) {
            console.debug('[TagService] Tag not found for ID:', id);
        }
        
        return tag;
    }

    async getTagsByDimension(dimension: string): Promise<Tag[]> {
        return await db.getTagsByDimension(dimension);
    }

    async getActiveTags(): Promise<Tag[]> {
        return await db.getActiveTags();
    }

    async getSystemTags(): Promise<Tag[]> {
        return await db.tags
            .filter(tag => {
                const isSystemDimension = ['what', 'why'].includes(tag.dimension);
                return isSystemDimension && !tag.deletedAt;
            })
            .toArray();
    }

    async getCustomTags(): Promise<Tag[]> {
        const systemDimensions = ['what', 'why'];
        
        return await db.tags
            .filter(tag => {
                const isCustomDimension = !systemDimensions.includes(tag.dimension);
                return isCustomDimension && !tag.deletedAt;
            })
            .toArray();
    }

    /**
     * Simplified tag creation - only 'what' and 'why' types
     */
    async createSimpleTag(name: string, type: 'what' | 'why', waterfallCategory?: string): Promise<Tag> {
        const newTag: Tag = {
            id: generateUUID(),
            name,
            dimension: type,
            color: getDefaultColorForTag(name),
            isActive: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            deletedAt: null
        };
        
        await db.tags.add(newTag);

        // If it's a 'why' tag and has a waterfall category, create the mapping
        if (type === 'why' && waterfallCategory) {
            await priorityLevelMappingService.createMapping({
                whyTag: name,
                priorityLevel: waterfallCategory as any,
                isActive: true
            });
        }
        
        return newTag;
    }

    async updateTag(id: string, data: Partial<Tag>): Promise<Tag | undefined> {
        const tag = await this.getTagById(id);
        if (!tag) {
            throw new Error(`Tag ${id} not found`);
        }

        // Validate tag data before update
        const validation = await validationService.validateTagUpdate(id, data);
        if (!validation.isValid) {
            throw new Error(`Invalid tag data: ${validation.errors.join(', ')}`);
        }

        const updatedTag: Tag = {
            ...tag,
            ...data,
            updatedAt: new Date().toISOString()
        };

        await db.tags.update(id, updatedTag);
        return updatedTag;
    }

    async deleteTag(id: string): Promise<void> {
        await db.softDeleteTag(id);
    }

    // Helper methods for system tags
    async getWhatTags(): Promise<Tag[]> {
        return await this.getTagsByDimension('what');
    }

    async getWhyTags(): Promise<Tag[]> {
        return await this.getTagsByDimension('why');
    }

    async initializeSystemTags(): Promise<void> {
        const whatTags = [
            'coffee', 'groceries', 'dining', 'gas', 'rent', 'utilities', 'entertainment',
            'clothing', 'electronics', 'medical', 'transportation', 'shopping', 'income',
            'freelance', 'investment', 'gift', 'salary', 'maintenance', 'insurance',
            'fitness', 'hobbies', 'streaming', 'parking', 'tolls', 'other'
        ];

        const whyTags = [
            'essential', 'discretionary', 'emergency', 'health', 'convenience', 'entertainment',
            'work', 'personal', 'family', 'social', 'education', 'investment', 'savings',
            'debt', 'income', 'other'
        ];

        // Create what tags
        for (const tagName of whatTags) {
            const existing = await this.getTagByNameAndDimension(tagName, 'what');
            if (!existing) {
                await this.createTag({
                    name: tagName,
                    dimension: 'what',
                    color: getDefaultColorForTag(tagName)
                });
            }
        }

        // Create why tags
        for (const tagName of whyTags) {
            const existing = await this.getTagByNameAndDimension(tagName, 'why');
            if (!existing) {
                await this.createTag({
                    name: tagName,
                    dimension: 'why',
                    color: getDefaultColorForTag(tagName)
                });
            }
        }
    }

    async getTagByNameAndDimension(name: string, dimension: string): Promise<Tag | undefined> {
        return await db.tags
            .where('name').equals(name)
            .and(tag => tag.dimension === dimension)
            .filter(tag => !tag.deletedAt)
            .first();
    }


}

export const tagService = new TagService(); 