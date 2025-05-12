import type { Config } from "tailwindcss";

const config: Config = {
	content: [
        './node_modules/layerchart/**/*.{svelte,js}' // <--- Add this
      ],
};

export default config;
