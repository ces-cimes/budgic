/**
 * Safe arithmetic expression evaluation (no eval).
 * Supports + - * / parentheses, unary +/-, decimals.
 * Comma treated as decimal separator (normalized to dot before parse).
 */

export interface EvaluateExpressionResult {
	result: number | null;
	isExpression: boolean;
	error?: string;
}

const MAX_LEN = 256;

/** Heuristic: user likely intends an expression (not a plain number). */
export function looksLikeExpression(raw: string): boolean {
	const s = raw.trim().replace(/,/g, '.');
	if (!s || s.length > MAX_LEN) return false;
	// Scientific notation not supported; treat lone number as not "expression UI"
	if (/[()]/.test(s)) return true;
	if (/[*\/]/.test(s)) return true;
	// Binary + or - between digit-like regions
	if (/\d\s*\+\s*\d/.test(s)) return true;
	if (/\d\s*-\s*\d/.test(s)) return true;
	// Unary minus after operator or '(' is still "expression" if followed by more ops
	if (/[+\-*/]\s*-\s*\d/.test(s)) return true;
	return false;
}

function normalizeInput(raw: string): string {
	return raw.trim().replace(/,/g, '.').replace(/\s+/g, '');
}

class Parser {
	private readonly s: string;
	private i = 0;

	constructor(s: string) {
		this.s = s;
	}

	parse(): number {
		const n = this.parseExpr();
		this.skipSpaces();
		if (this.i < this.s.length) {
			throw new Error('Unexpected character');
		}
		return n;
	}

	private skipSpaces(): void {
		while (this.i < this.s.length && /\s/.test(this.s[this.i]!)) this.i++;
	}

	private peek(): string | undefined {
		return this.s[this.i];
	}

	private eat(ch: string): boolean {
		this.skipSpaces();
		if (this.s[this.i] === ch) {
			this.i++;
			return true;
		}
		return false;
	}

	private parseExpr(): number {
		let left = this.parseTerm();
		this.skipSpaces();
		while (true) {
			const ch = this.peek();
			if (ch === '+') {
				this.i++;
				left += this.parseTerm();
			} else if (ch === '-') {
				this.i++;
				left -= this.parseTerm();
			} else break;
			this.skipSpaces();
		}
		return left;
	}

	private parseTerm(): number {
		let left = this.parseFactor();
		this.skipSpaces();
		while (true) {
			const ch = this.peek();
			if (ch === '*') {
				this.i++;
				left *= this.parseFactor();
			} else if (ch === '/') {
				this.i++;
				const right = this.parseFactor();
				if (right === 0) throw new Error('Division by zero');
				left /= right;
			} else break;
			this.skipSpaces();
		}
		return left;
	}

	private parseFactor(): number {
		this.skipSpaces();
		const ch = this.peek();
		if (ch === '+') {
			this.i++;
			return this.parseFactor();
		}
		if (ch === '-') {
			this.i++;
			return -this.parseFactor();
		}
		if (ch === '(') {
			this.i++;
			const inner = this.parseExpr();
			this.skipSpaces();
			if (this.peek() !== ')') throw new Error('Missing )');
			this.i++;
			return inner;
		}
		return this.parseNumber();
	}

	private parseNumber(): number {
		this.skipSpaces();
		const start = this.i;
		let sawDigit = false;
		if (this.peek() === '.') {
			this.i++;
			while (/\d/.test(this.peek() ?? '')) {
				sawDigit = true;
				this.i++;
			}
		} else {
			while (/\d/.test(this.peek() ?? '')) {
				sawDigit = true;
				this.i++;
			}
			if (this.peek() === '.') {
				this.i++;
				while (/\d/.test(this.peek() ?? '')) {
					sawDigit = true;
					this.i++;
				}
			}
		}
		if (!sawDigit) throw new Error('Number expected');
		const slice = this.s.slice(start, this.i);
		const n = Number(slice);
		if (!Number.isFinite(n)) throw new Error('Invalid number');
		return n;
	}
}

/**
 * Evaluate a user-entered expression string.
 * Empty or whitespace → null result, not an error.
 */
export function evaluateExpression(raw: string): EvaluateExpressionResult {
	const trimmed = raw.trim();
	if (!trimmed) {
		return { result: null, isExpression: false };
	}
	if (trimmed.length > MAX_LEN) {
		return { result: null, isExpression: false, error: 'Expression too long' };
	}

	const normalized = normalizeInput(raw);
	if (!normalized) {
		return { result: null, isExpression: false };
	}

	const isExpression = looksLikeExpression(raw);

	try {
		const parser = new Parser(normalized);
		const result = parser.parse();
		if (!Number.isFinite(result)) {
			return { result: null, isExpression, error: 'Result is not a finite number' };
		}
		return { result, isExpression };
	} catch (e) {
		const msg = e instanceof Error ? e.message : 'Invalid expression';
		return { result: null, isExpression: true, error: msg };
	}
}

/**
 * Format a number for display in an amount field after successful eval.
 */
export function formatEvaluatedNumber(value: number, decimalPlaces: number): string {
	if (!Number.isFinite(value)) return '';
	const dp = Math.max(0, Math.min(20, decimalPlaces));
	if (dp === 0) return String(Math.round(value));
	return value.toFixed(dp).replace(/\.?0+$/, '');
}
