// A view choice changes presentation only; active Bluetooth connections stay intact.
export function resolveDeviceView(preference, coarsePointer) {
  if (preference === 'mobile' || preference === 'desktop') return preference;
  return coarsePointer ? 'mobile' : 'desktop';
}

export function createDeviceView(onChange, host = window) {
  const media = host.matchMedia('(pointer: coarse)');
  const query = new URL(host.location.href).searchParams.get('view');
  let preference = query === 'mobile' || query === 'desktop' ? query : 'auto';
  let current;
  function refresh() {
    current = resolveDeviceView(preference, media.matches);
    onChange(current, preference);
  }
  const mediaChanged = () => { if (preference === 'auto') refresh(); };
  media.addEventListener?.('change', mediaChanged);
  refresh();
  return {
    get current() { return current; },
    select(value) {
      if (!['auto', 'mobile', 'desktop'].includes(value)) return;
      preference = value;
      const url = new URL(host.location.href);
      if (value === 'auto') url.searchParams.delete('view');
      else url.searchParams.set('view', value);
      try { host.history.replaceState(null, '', url.href); } catch { /* view still works */ }
      refresh();
    },
    dispose() { media.removeEventListener?.('change', mediaChanged); },
  };
}
