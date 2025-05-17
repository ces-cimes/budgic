import { persistentStore } from '$lib/core/persistence.svelte';
import { CategorySchema, createCategory, validateCategoryArray } from '../models/types';
import type { Category } from '$lib/core/models/types';

class CategoryService {
    private _store = persistentStore<Category[], 'id'>(
        'categories',
        [
            // income
            createCategory({
                name: 'Salary & Work',
                type: 'income'
            }),
            createCategory({
                name: 'Other Income',
                type: 'income'
            }),

            // expenses
            createCategory({
                name: 'Housing & Essentials',
                type: 'expense'
            }),
            createCategory({
                name: 'Food',
                type: 'expense'
            }),
            createCategory({
                name: 'Transportation',
                type: 'expense'
            }),
            createCategory({
                name: 'Health & Care',
                type: 'expense'
            }),
            createCategory({
                name: 'Discretionary',
                type: 'expense'
            }),
            createCategory({
                name: 'Subs',
                type: 'expense'
            }),
            createCategory({
                name: 'Occasional',
                type: 'expense'
            }),

            // savings
            createCategory({
                name: 'Laptop',
                type: 'expense'
            }),
            createCategory({
                name: 'Emergency',
                type: 'expense'
            }),
            createCategory({
                name: 'Vacation',
                type: 'expense'
            }),
        ],
        {
            isCollection: true,
            idKey: 'id',
            validate: validateCategoryArray
        }
    );

    get categories() { return this._store.value; }

    async createCategory(data: Partial<Category>): Promise<Category> {
        const newCategory = createCategory(data);
        await this._store.addItem(newCategory);
        return newCategory;
    }

    async updateCategory(id: string, updates: Partial<Category>): Promise<void> {
        const category = await this.getCategoryById(id);
        if (!category) throw new Error('Category not found');
        
        const updatedCategory = { ...category, ...updates };
        await this._store.updateItem(id, updatedCategory);
    }

    async deleteCategory(id: string): Promise<void> {
        await this.updateCategory(id, { isDeleted: true });
    }

    getCategoryById(id: string) {
        return this._store.getItem(id);
    }

    // Move category to a new parent
    async moveCategory(id: string, newParentId: string | null): Promise<void> {
        const category = await this.getCategoryById(id);
        if (!category) throw new Error('Category not found');
        
        // Convert null to undefined to match the type expected by parentId
        const normalizedParentId = newParentId !== null ? newParentId : undefined;

        // Check for circular reference
        if (normalizedParentId) {
            let currentParentId = normalizedParentId;
            while (currentParentId) {
                if (currentParentId === id) {
                    throw new Error('Cannot move category to its own descendant');
                }
                const parent = await this.getCategoryById(currentParentId);
                if (parent?.parentId !== undefined) {
                    currentParentId = parent?.parentId;
                }
            }
        }

        await this._store.updateItem(id, { parentId: normalizedParentId });
    }

    // Get hierarchical path for a category (from top-level parent to current category)
    async getCategoryPath(id: string): Promise<string[]> {
        const path: string[] = [];
        let currentId: string | undefined = id;

        while (currentId) {
            const category = await this.getCategoryById(currentId);
            if (!category) break;
            
            path.unshift(category.name);
            currentId = category.parentId;
        }

        return path;
    }

    // Get all categories of a specific type
    getCategoriesByType(type: Category['type']): Category[] {
        return this.categories.filter(category => category.type === type);
    }
}

export const categoryService = new CategoryService();