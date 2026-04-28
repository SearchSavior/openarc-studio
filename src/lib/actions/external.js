import { openUrl } from '@tauri-apps/plugin-opener';
import { appState } from '$lib/state.svelte';

/**
 * Svelte action for external links
 * * @param {HTMLAnchorElement} node - The anchor element this action is applied to.
 */
export function external(node) {
  const handleClick = async (event) => {
    const href = node.href;

    if (!href || !href.startsWith('http')) {
      return;
    }
    event.preventDefault();

    try {
      const confirmed = await appState.confirmLink(href);
      if (confirmed) {
        await openUrl(href);
      }
    } catch (error) {
      appState.addLog("error", `Failed to open external link: ${href}`);
    }
  };

  node.addEventListener('click', handleClick);

  return {
    destroy() {
      node.removeEventListener('click', handleClick);
    }
  };
}
