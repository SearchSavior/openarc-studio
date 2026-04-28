import { openUrl } from '@tauri-apps/plugin-opener';
import { appState } from '$lib/state.svelte';

/**
 * check for markdown links and open them in the default browser
 * * @param {HTMLElement} node - The container element.
 */
export function markdownLinks(node) {
  const handleClick = async (event) => {
    const anchor = event.target.closest('a');

    if (anchor && anchor.href && anchor.href.startsWith('http')) {
      event.preventDefault();

      try {
        const confirmed = await appState.confirmLink(anchor.href);
        if (confirmed) {
          await openUrl(anchor.href);
        }
      } catch (error) {
        appState.addLog("error", `Failed to open markdown link: ${anchor.href}`);
      }
    }
  };

  node.addEventListener('click', handleClick);

  return {
    destroy() {
      node.removeEventListener('click', handleClick);
    }
  };
}
