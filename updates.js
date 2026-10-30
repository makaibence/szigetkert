/** Cache readiness and an explicit saved reload, without clearing the player's city. */
export async function setupOffline({ save, toast }) {
  const status = document.getElementById('offlinestatus');
  const button = document.getElementById('checkupdate');
  if (!('serviceWorker' in navigator)) {
    status.textContent = 'Az offline módhoz HTTPS-cím és támogatott böngésző szükséges.';
    button.hidden = true;
    return;
  }
  let registration,
    ready = false,
    applying = false;
  const refresh = () => {
    status.textContent = registration?.waiting
      ? 'Új változat letöltve. Frissítés előtt a szigeted mentődik.'
      : ready
        ? 'Offline játékra kész.' + (navigator.onLine ? '' : ' Most internet nélkül játszol.')
        : 'Offline fájlok letöltése… Az első alkalommal maradj interneten.';
    button.textContent = registration?.waiting ? 'Mentés és frissítés' : 'Frissítés keresése';
  };
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (applying) location.reload();
  });
  window.addEventListener('online', refresh);
  window.addEventListener('offline', refresh);
  button.onclick = async () => {
    if (registration?.waiting) {
      if (!save()) {
        toast('A mentés nem sikerült. Frissítés előtt exportáld a szigetedet.');
        return;
      }
      applying = true;
      registration.waiting.postMessage({ type: 'ACTIVATE_UPDATE' });
      return;
    }
    if (!navigator.onLine) {
      toast('A frissítések kereséséhez internet kell.');
      return;
    }
    try {
      button.disabled = true;
      await registration?.update();
      refresh();
      toast('Frissítés keresése elindult. Ha elkészült, itt jelezzük.');
    } catch {
      toast('Most nem érhető el frissítés. Később újrapróbálhatod.');
    } finally {
      button.disabled = false;
    }
  };
  try {
    registration = await navigator.serviceWorker.register('./sw.js');
    const watch = () => {
      const worker = registration.installing;
      worker?.addEventListener('statechange', () => {
        if (worker.state === 'installed') refresh();
        if (worker.state === 'redundant' && !ready)
          status.textContent = 'Az offline letöltés nem sikerült. Internet mellett nyisd meg újra.';
      });
      refresh();
    };
    registration.addEventListener('updatefound', watch);
    watch();
    await navigator.serviceWorker.ready;
    ready = true;
    refresh();
  } catch {
    status.textContent = 'Az offline mód nem indult el. HTTPS-címről vagy localhostról nyisd meg.';
    button.hidden = true;
  }
}
