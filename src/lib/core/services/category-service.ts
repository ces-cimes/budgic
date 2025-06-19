import { persistentStore } from '$lib/core/persistence.svelte';
import { CategorySchema, createCategory, validateCategory } from '../models/types';
import type { Category } from '$lib/core/models/types';
import type { CollectionStore } from '$lib/core/persistence.svelte';

class CategoryService {
    private _store = persistentStore<Category>(
        'categories',
        [],
        {
            isCollection: true,
            idKey: 'id',
            validate: (data: unknown): data is Category => {
                const result = validateCategory(data);
                if (!result) {
                    console.error('[CategoryService] Invalid category item:', data);
                }
                return result;
            },
            onError: (error) => console.error('[CategoryService] Persistence error:', error)
        }
    ) as CollectionStore<Category>;

    // Public interface
   public get ready() {
        return this._store.ready;
    }

    public isLoading() {
        return this._store.getIsLoading();
    }
    
    private get store(): CollectionStore<Category> {
        return this._store;
    }

    async load() {
        await this._store.loadMore();
    }

    async getCategories(): Promise<Category[]> {
        await this.ready;
        const categories = this.store.getValue().filter(
            (category: Category) => !category.isDeleted
        );
        console.debug("[CategoryService] Loaded accounts:", categories);
        return categories;
    }

    // Update all method calls to use typed store
    async createCategory(data: Partial<Category>): Promise<Category> {
        const newCategory = createCategory(data);
        await this.store.addItem(newCategory);
        return newCategory;
    }

    async updateCategory(id: string, updates: Partial<Category>): Promise<void> {
        await this.store.updateItem(id, updates);
    }

    async deleteCategory(id: string): Promise<void> {
        await this.ready;
        await this.updateCategory(id, { isDeleted: true });
        console.debug('[CategoryService] Category soft-deleted successfully: ', id);
    }

    async getCategoryById(id: string) {
        await this.ready;
        const category = await this.store.getItem(id);
        
        if (category) {
            console.debug('[CategoryService] Found category:', category);
        } else {
            console.debug('[CategoryService] Category not found for ID:', id);
        }
        
        return category;
    }

    async moveCategory(id: string, newParentId: string | null): Promise<void> {
        await this.ready;
        console.debug('[CategoryService] Moving category:', { id, newParentId });
        const category = await this.getCategoryById(id);
        if (!category) {
            console.error('[CategoryService] Category not found for move:', id);
            throw new Error('Category not found');
        }
        
        // Convert null to undefined to match the type expected by parentId
        const normalizedParentId = newParentId !== null ? newParentId : undefined;
        console.debug('[CategoryService] Normalized parent ID:', normalizedParentId);

        // Check for circular reference
        if (normalizedParentId) {
            console.debug('[CategoryService] Checking for circular references...');
            let currentParentId = normalizedParentId;
            let depth = 0;
            const maxDepth = 20; // Prevent infinite loops
            
            while (currentParentId && depth < maxDepth) {
                if (currentParentId === id) {
                    console.error('[CategoryService] Circular reference detected: cannot move category to its own descendant');
                    throw new Error('Cannot move category to its own descendant');
                }
                const parent = await this.getCategoryById(currentParentId);
                if (!parent) break;
                
                if (parent?.parentId !== undefined) {
                    currentParentId = parent?.parentId;
                    depth++;
                    console.debug(`[CategoryService] Checking parent at depth ${depth}:`, currentParentId);
                } else {
                    break;
                }
            }
            
            if (depth >= maxDepth) {
                console.error('[CategoryService] Maximum depth reached while checking for circular references');
                throw new Error('Category hierarchy too deep or circular reference detected');
            }
        }

        console.debug('[CategoryService] Updating category parent...');
        await this.store.updateItem(id, { parentId: normalizedParentId });
        console.debug('[CategoryService] Category moved successfully');
    }

    async getCategoryPath(id: string): Promise<string[]> {
        await this.ready;
        console.debug('[CategoryService] Getting path for category:', id);
        const path: string[] = [];
        let currentId: string | undefined = id;
        let depth = 0;
        const maxDepth = 20; // Prevent infinite loops

        while (currentId && depth < maxDepth) {
            const category = await this.getCategoryById(currentId);
            if (!category) {
                console.debug('[CategoryService] Category not found in path:', currentId);
                break;
            }
            
            path.unshift(category.name);
            console.debug(`[CategoryService] Path at depth ${depth}:`, path);
            currentId = category.parentId;
            depth++;
        }

        if (depth >= maxDepth) {
            console.error('[CategoryService] Maximum depth reached while building category path');
            throw new Error('Category hierarchy too deep');
        }

        console.debug('[CategoryService] Final category path:', path);
        return path;
    }

    async getCategoriesByType(type: Category['type']): Promise<Category[]> {
        await this.ready;
        console.debug('[CategoryService] Getting categories by type:', type);
        const categories = await this.getCategories();
        const filteredCategories = categories.filter(category => category.type === type);
        console.debug('[CategoryService] Found', filteredCategories.length, 'categories of type', type);
        return filteredCategories;
    }
}

export const categoryService = new CategoryService();