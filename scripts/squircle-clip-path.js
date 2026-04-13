/**
 * Generates CSS clip-path polygon for a squircle (superellipse) shape.
 * Based on the approach from https://jrabausch.github.io/squircle/
 *
 * One quadrant: parametric superellipse (n=4) from (0,r) to (r,0)
 *   x = r * cos(θ)^(2/n), y = r * sin(θ)^(2/n) for θ from π/2 down to 0
 *   With n=4: x = r*cos(θ)^0.5, y = r*sin(θ)^0.5
 *
 * The raw curve bulges outside the chord (concave clip). We reflect across the chord
 * x+y=r so the curve lies inside the corner triangle = convex (outward) corners.
 * Reflection: (x,y) -> (r-y, r-x).
 *
 * Usage: node scripts/squircle-clip-path.js <radius> [steps]
 *   e.g. node scripts/squircle-clip-path.js 24 14
 * Output is clockwise winding (convex fill). Use in .squircle-* { clip-path: polygon(...); } in app.css.
 * To add a new size, run: node scripts/squircle-clip-path.js <radius> 14
 *
 * @param {number} radius - Corner radius in pixels
 * @param {number} steps - Number of segments per corner (steps+1 points per corner)
 * @returns {string} - Full polygon string for clip-path (all 4 corners)
 */
function generateSquirclePolygon(radius, steps = 14) {
	const n = 5; // superellipse exponent (4 = squircle)
	const exp = 2 / n; // 0.5 for n=4
	const r = radius;

	/** One quadrant: from (0, r) to (r, 0), θ from π/2 to 0. Reflect across chord x+y=r for convex (inner) curve. */
	const quadrant = [];
	for (let i = 0; i <= steps; i++) {
		const theta = (Math.PI / 2) * (1 - i / steps);
		const u = r * Math.pow(Math.cos(theta), exp);
		const v = r * Math.pow(Math.sin(theta), exp);
		quadrant.push({ x: r - v, y: r - u });
	}

	// Winding must match jrabausch generator: TL (0,r)→(r,0), TR (r,0)→(0,r), BR (0,r)→(r,0), BL (r,0)→(0,r).
	// So TR and BL use quadrant in reverse order.
	const topLeft = quadrant.map(({ x, y }) => `${x.toFixed(2)}px ${y.toFixed(2)}px`);
	const topRight = [...quadrant]
		.reverse()
		.map(({ x, y }) => `calc(100% - ${x.toFixed(2)}px) ${y.toFixed(2)}px`);
	const bottomRight = quadrant.map(
		({ x, y }) => `calc(100% - ${x.toFixed(2)}px) calc(100% - ${y.toFixed(2)}px)`
	);
	const bottomLeft = [...quadrant]
		.reverse()
		.map(({ x, y }) => `${x.toFixed(2)}px calc(100% - ${y.toFixed(2)}px)`);

	/* Clockwise winding (TL→TR→BR→BL) = interior filled = convex corners. */
	const all = [...topLeft, ...topRight, ...bottomRight, ...bottomLeft];
	return all.join(',');
}

// CLI: output polygon for radius (default 24) and steps (default 14)
const radius = parseInt(process.argv[2] || '24', 10);
const steps = parseInt(process.argv[3] || '14', 10);
console.log(generateSquirclePolygon(radius, steps));
