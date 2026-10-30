/** Preserve focused controls, scroll anchoring and pointer targets while live values update. */
export function patchMarkup(host, html) {
  const template = document.createElement('template');
  template.innerHTML = html;
  function update(parent, desired) {
    for (let i = 0; i < desired.childNodes.length; i++) {
      const next = desired.childNodes[i];
      let old = parent.childNodes[i];
      if (next.nodeType === 1 && next.id && old?.id !== next.id) {
        const found = [...parent.children].find((n) => n.id === next.id);
        if (found) {
          parent.insertBefore(found, old || null);
          old = found;
        }
      }
      if (!old) {
        parent.append(next.cloneNode(true));
        continue;
      }
      if (
        old.nodeType !== next.nodeType ||
        (next.nodeType === 1 && (old.tagName !== next.tagName || old.id !== next.id))
      ) {
        parent.replaceChild(next.cloneNode(true), old);
        continue;
      }
      if (next.nodeType === 3) {
        if (old.data !== next.data) old.data = next.data;
        continue;
      }
      if (next.nodeType !== 1) continue;
      for (const a of [...old.attributes])
        if (!next.hasAttribute(a.name)) old.removeAttribute(a.name);
      for (const a of next.attributes)
        if (old.getAttribute(a.name) !== a.value) old.setAttribute(a.name, a.value);
      if (old.tagName === 'INPUT' && document.activeElement !== old && old.value !== next.value)
        old.value = next.value;
      update(old, next);
    }
    while (parent.childNodes.length > desired.childNodes.length) parent.lastChild.remove();
  }
  update(host, template.content);
}
