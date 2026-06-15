(() => {
  const resetKey = "zhimeng-cache-reset-20260615-v1";

  if (!("serviceWorker" in navigator)) return;

  window.addEventListener("load", async () => {
    try {
      if (window.localStorage.getItem(resetKey) === "done") return;
      window.localStorage.setItem(resetKey, "done");
      await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    } catch (error) {
      console.info("[Zhimeng] Legacy service worker retirement skipped.", error);
    }
  });
})();
