// tauri doesnt have a nodejs server for ssr
// adapter-static with index.html fallback puts the site in spa mode
// See: https://svelte.dev/docs/kit/single-page-apps
// See: https://v2.tauri.app/start/frontend/sveltekit/ for more info
export const ssr = false;
