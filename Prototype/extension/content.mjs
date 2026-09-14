import { createPageAgent } from '../shared/page-agent.mjs';
const api = globalThis.browser ?? globalThis.chrome;
if (!globalThis.__dhristiController) {
  const controller = createPageAgent();
  globalThis.__dhristiController = controller;
  api.runtime.onMessage.addListener((message, sender, respond) => {
    if (sender.id !== api.runtime.id) return false;
    try {
      if (message.kind === 'collect') respond({ data: controller.collect() });
      else if (message.kind === 'fresh') {
        controller.assertFresh(message.revision);
        respond({ data: true });
      } else if (message.kind === 'execute') respond({ data: controller.execute(message.plan) });
    } catch (e) {
      respond({ error: e.message });
    }
    return false;
  });
}
