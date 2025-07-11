import type { Component } from 'svelte';

type DialogState = {
    isOpen: boolean;
    content: {
        component: Component;
        props?: Record<string, unknown>;
    } | null;
    isTransitioning: boolean;
};

const initialState: DialogState = {
    isOpen: false,
    content: null,
    isTransitioning: false
};

let state = $state(initialState);

export function getState() {
    return state;
}

export function newDialog(content: { component: Component; props?: Record<string, unknown> }) {
    // If there's already content, start transition
    if (state.content) {
        state = {
            ...state,
            isTransitioning: true
        };
        
        // Wait for fade out before showing new content
        setTimeout(() => {
            state = {
                isOpen: true,
                content,
                isTransitioning: false
            };
        }, 300); // Match the transition duration
    } else {
        // Otherwise, show new content immediately
        state = {
            isOpen: true,
            content,
            isTransitioning: false
        };
    }
}

export function closeDialog() {
    state = {
        ...state,
        isTransitioning: true
    };

    setTimeout(() => {
        state = initialState;
    }, 300); // Match the transition duration
} 