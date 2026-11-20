let deferredInstallPrompt = null;

window.addEventListener("beforeinstallprompt", event => {
  event.preventDefault();
  deferredInstallPrompt = event;
  window.dispatchEvent(new Event("ffv-install-available"));
});

window.addEventListener("appinstalled", () => {
  deferredInstallPrompt = null;
  window.dispatchEvent(new Event("ffv-app-installed"));
});

export async function registerPwa() {
  if (!("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.register("./sw.js", { scope: "./", updateViaCache: "none" });
  } catch (error) {
    console.warn("PWA service worker registration failed", error);
    return null;
  }
}

export async function installPwa() {
  if (!deferredInstallPrompt) return { available: false };
  const prompt = deferredInstallPrompt;
  deferredInstallPrompt = null;
  await prompt.prompt();
  const choice = await prompt.userChoice;
  return { available: true, outcome: choice?.outcome || "dismissed" };
}
