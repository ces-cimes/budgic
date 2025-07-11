/**
 * Generate a default color for a tag based on its name
 */
export function getDefaultColorForTag(tagName: string): string {
    // Simple color assignment based on tag name
    const colors = [
        '#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6',
        '#06B6D4', '#84CC16', '#F97316', '#EC4899', '#6366F1'
    ];
    
    const hash = tagName.split('').reduce((a, b) => {
        a = ((a << 5) - a) + b.charCodeAt(0);
        return a & a;
    }, 0);
    
    return colors[Math.abs(hash) % colors.length];
}

/**
 * Check if a tag dimension is a system dimension
 */
export function isSystemDimension(dimension: string): boolean {
    return ['what', 'why'].includes(dimension);
}

/**
 * Check if a tag dimension is a custom dimension
 */
export function isCustomDimension(dimension: string): boolean {
    return !isSystemDimension(dimension);
}

/**
 * Get tag category based on tag name (for waterfall budgeting)
 */
export function getTagCategory(tagName: string): 'survival' | 'security' | 'growth' | 'lifestyle' {
    const survivalTags = [
        'rent', 'mortgage', 'utilities', 'groceries', 'food', 'transport', 'transportation',
        'gas', 'fuel', 'healthcare', 'medical', 'insurance', 'essential', 'basic'
    ];
    
    const securityTags = [
        'emergency', 'savings', 'debt', 'loan', 'credit', 'retirement', '401k', 'ira',
        'investment', 'portfolio', 'safety', 'protection'
    ];
    
    const growthTags = [
        'education', 'learning', 'skills', 'training', 'course', 'book', 'investment',
        'business', 'entrepreneur', 'development', 'career', 'professional'
    ];
    
    const lifestyleTags = [
        'entertainment', 'hobbies', 'discretionary', 'luxury', 'vacation', 'travel',
        'dining', 'restaurant', 'shopping', 'clothing', 'electronics', 'gaming',
        'streaming', 'subscription', 'fitness', 'gym', 'sports'
    ];
    
    const lowerTagName = tagName.toLowerCase();
    
    if (survivalTags.some(tag => lowerTagName.includes(tag))) return 'survival';
    if (securityTags.some(tag => lowerTagName.includes(tag))) return 'security';
    if (growthTags.some(tag => lowerTagName.includes(tag))) return 'growth';
    if (lifestyleTags.some(tag => lowerTagName.includes(tag))) return 'lifestyle';
    
    // Default to lifestyle for unknown tags
    return 'lifestyle';
}

/**
 * Check if a tag is essential (survival category)
 */
export function isEssentialTag(tagName: string): boolean {
    return getTagCategory(tagName) === 'survival';
}

/**
 * Get suggestion priority based on category
 */
export function getSuggestionPriority(category: 'survival' | 'security' | 'growth' | 'lifestyle'): 'high' | 'medium' | 'low' {
    switch (category) {
        case 'survival': return 'high';
        case 'security': return 'high';
        case 'growth': return 'medium';
        case 'lifestyle': return 'low';
        default: return 'medium';
    }
}

/**
 * Validate tag name format
 */
export function validateTagName(name: string): { isValid: boolean; error?: string } {
    if (!name || name.trim().length === 0) {
        return { isValid: false, error: 'Tag name is required' };
    }
    
    if (name.trim().length < 2) {
        return { isValid: false, error: 'Tag name must be at least 2 characters long' };
    }
    
    if (name.trim().length > 50) {
        return { isValid: false, error: 'Tag name must be less than 50 characters' };
    }
    
    // Check for invalid characters
    const invalidChars = /[<>:"/\\|?*]/;
    if (invalidChars.test(name)) {
        return { isValid: false, error: 'Tag name contains invalid characters' };
    }
    
    return { isValid: true };
}

/**
 * Normalize tag name (lowercase, trim, replace spaces with hyphens)
 */
export function normalizeTagName(name: string): string {
    return name.toLowerCase().trim().replace(/\s+/g, '-');
}

/**
 * Check if two tag names are similar (for duplicate detection)
 */
export function areTagNamesSimilar(name1: string, name2: string): boolean {
    const normalized1 = normalizeTagName(name1);
    const normalized2 = normalizeTagName(name2);
    
    // Exact match
    if (normalized1 === normalized2) return true;
    
    // Check if one contains the other
    if (normalized1.includes(normalized2) || normalized2.includes(normalized1)) return true;
    
    // Simple similarity check (can be enhanced with more sophisticated algorithms)
    const words1 = normalized1.split('-');
    const words2 = normalized2.split('-');
    
    const commonWords = words1.filter(word => words2.includes(word));
    const similarity = commonWords.length / Math.max(words1.length, words2.length);
    
    return similarity >= 0.5; // 50% similarity threshold
} 