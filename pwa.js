(function () {
  if (!("serviceWorker" in navigator)) return;

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(error => {
      console.error("HoneyPro service worker registration failed:", error);
    });
  });

  let installPrompt = null;
  const installButton = document.getElementById("installAppButton");

  window.addEventListener("beforeinstallprompt", event => {
    event.preventDefault();
    installPrompt = event;
    if (installButton) installButton.hidden = false;
  });

  if (installButton) {
    installButton.addEventListener("click", async () => {
      if (!installPrompt) {
        alert("To install HoneyPro on Android, open this website in Chrome, tap the three-dot menu, then choose Install app or Add to Home screen.");
        return;
      }
      installPrompt.prompt();
      await installPrompt.userChoice;
      installPrompt = null;
      installButton.hidden = true;
    });
  }

  window.addEventListener("appinstalled", () => {
    if (installButton) installButton.hidden = true;
  });
})();