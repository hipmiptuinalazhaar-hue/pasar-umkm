import applicationWorker from "./worker-entry.js";
import { handlePublicSeo } from "./public-seo.js";

export default {
  async fetch(request, env, ctx) {
    const seoResponse = await handlePublicSeo(request, env);
    if (seoResponse) return seoResponse;
    return applicationWorker.fetch(request, env, ctx);
  }
};
