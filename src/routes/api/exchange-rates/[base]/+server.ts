/**
 * Exchange rates API proxy
 * Fetches rates from ExchangeRate-API server-side to avoid CORS in the browser.
 * GET /api/exchange-rates/USD returns { base, date, rates: { ... } }
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const EXCHANGERATE_API = 'https://api.exchangerate-api.com/v4/latest';

export const GET: RequestHandler = async ({ params }) => {
	const base = (params.base || 'USD').toUpperCase();
	if (!/^[A-Z]{3}$/.test(base)) {
		return json({ error: 'Invalid base currency' }, { status: 400 });
	}

	try {
		const res = await fetch(`${EXCHANGERATE_API}/${base}`, {
			headers: { Accept: 'application/json' }
		});
		if (!res.ok) {
			return json(
				{ error: `Exchange rate API error: ${res.status} ${res.statusText}` },
				{ status: res.status }
			);
		}
		const data = await res.json();
		// Ensure we have the shape the client expects
		if (!data || typeof data.rates !== 'object') {
			return json({ error: 'Invalid response from exchange rate API' }, { status: 502 });
		}
		return json({
			base: data.base || base,
			date: data.date || new Date().toISOString().slice(0, 10),
			rates: data.rates
		});
	} catch (e) {
		console.error('Exchange rate fetch failed:', e);
		return json(
			{ error: e instanceof Error ? e.message : 'Failed to fetch exchange rates' },
			{ status: 502 }
		);
	}
};

