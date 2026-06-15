import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";

const LEGACY_CACHE_RESET_KEY = "zhimeng-cache-reset-20260615-v1";

function shouldResetLegacyCaches() {
  return typeof window !== "undefined"
    && window.location.protocol.startsWith("http")
    && window.location.hostname !== "localhost"
    && window.location.hostname !== "127.0.0.1";
}

async function resetLegacyPwaCaches() {
  if (!shouldResetLegacyCaches()) return;
  if (window.localStorage.getItem(LEGACY_CACHE_RESET_KEY) === "done") return;

  const hadServiceWorkerController = Boolean(navigator.serviceWorker?.controller);

  try {
    const registrations = "serviceWorker" in navigator
      ? await navigator.serviceWorker.getRegistrations()
      : [];
    await Promise.all(registrations.map((registration) => registration.unregister()));
  } catch (error) {
    console.info("[Zhimeng] Legacy service worker cleanup skipped.", error);
  }

  try {
    const keys = "caches" in window ? await caches.keys() : [];
    await Promise.all(keys.map((key) => caches.delete(key)));
  } catch (error) {
    console.info("[Zhimeng] Legacy cache cleanup skipped.", error);
  }

  window.localStorage.setItem(LEGACY_CACHE_RESET_KEY, "done");
  if (hadServiceWorkerController) {
    window.location.reload();
  }
}

void resetLegacyPwaCaches();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
