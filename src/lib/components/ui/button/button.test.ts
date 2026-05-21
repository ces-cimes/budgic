import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { Button } from './index.js';

describe('Button (component smoke)', () => {
	it('renders label and handles click', async () => {
		const user = userEvent.setup();
		const onClick = vi.fn();
		render(Button, { props: { 'aria-label': 'Save', onclick: onClick } });
		const btn = screen.getByRole('button', { name: 'Save' });
		await user.click(btn);
		expect(onClick).toHaveBeenCalledOnce();
	});
});
