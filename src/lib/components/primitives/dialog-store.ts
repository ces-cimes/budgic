import type { Component } from 'svelte';
import { writable } from 'svelte/store';

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

export const dialogStore = writable<DialogState>(initialState);

export function getState(): DialogState {
    let state: DialogState;
    dialogStore.subscribe(value => {
        state = value;
    })();
    return state!;
}

export function newDialog(content: { component: Component; props?: Record<string, unknown> }) {
    dialogStore.update(currentState => {
        // If there's already content, start transition
        if (currentState.content) {
            const newState = {
                ...currentState,
                isTransitioning: true
            };
            
            // Wait for fade out before showing new content
            setTimeout(() => {
                dialogStore.set({
                    isOpen: true,
                    content,
                    isTransitioning: false
                });
            }, 300); // Match the transition duration
            
            return newState;
        } else {
            // Otherwise, show new content immediately
            return {
                isOpen: true,
                content,
                isTransitioning: false
            };
        }
    });
}

export function closeDialog() {
    dialogStore.update(currentState => ({
        ...currentState,
        isTransitioning: true
    }));

    setTimeout(() => {
        dialogStore.set(initialState);
    }, 300); // Match the transition duration
} 