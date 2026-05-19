import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { isDeviceAllowed, isValidDeviceId } from './device-auth';

const VALID = '550e8400-e29b-41d4-a716-446655440000';

describe('device-auth', () => {
	const env = process.env;

	beforeEach(() => {
		process.env = { ...env };
	});

	afterEach(() => {
		process.env = env;
	});

	it('validates UUID format', () => {
		expect(isValidDeviceId(VALID)).toBe(true);
		expect(isValidDeviceId('not-a-uuid')).toBe(false);
	});

	it('allows listed device ids', () => {
		process.env.ALLOWED_DEVICE_IDS = VALID;
		expect(isDeviceAllowed(VALID)).toBe(true);
		expect(isDeviceAllowed('550e8400-e29b-41d4-a716-446655440001')).toBe(false);
	});

	it('bypasses allowlist when ALLOW_DEVICE_AUTH_BYPASS is true', () => {
		process.env.ALLOWED_DEVICE_IDS = '';
		process.env.ALLOW_DEVICE_AUTH_BYPASS = 'true';
		expect(isDeviceAllowed(VALID)).toBe(true);
	});
});
