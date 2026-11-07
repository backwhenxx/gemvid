const RE = /^(rb|rba|ph|pht|phh|sf):[\w.-]+$/;
/** Все id библиотеки в props (+ анимации по умолчанию для людей). */
export const collect = (P: Record<string, any>) => {
  const out = new Set<string>();
  const walk = (o: any) => {
    if (typeof o === 'string') RE.test(o) && out.add(o);
    else if (Array.isArray(o)) o.forEach(walk);
    else if (o && typeof o === 'object') Object.values(o).forEach(walk);
  };
  walk(P);
  for (const a of P.actors ?? []) {
    if (!String(a.anim ?? '').startsWith('#')) out.add(a.anim ?? 'rba:m_idle_neutral_01');
    if (a.path && !String(a.walk ?? '').startsWith('#')) out.add(a.walk ?? 'rba:m_walk_neutral_01');
  }
  return [...out].sort();
};
