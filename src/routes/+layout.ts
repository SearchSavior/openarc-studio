// tauri dont got nodejs server to do real ssr
// so we use adapter-static with index.html fallback to put site in spa mode
// See: https://svelte.dev/docs/kit/single-page-apps
// See: https://v2.tauri.app/start/frontend/sveltekit/ for more info
export const ssr = false;
