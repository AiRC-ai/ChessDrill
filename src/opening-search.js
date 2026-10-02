const normalize = value => String(value ?? '')
  .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
  .toLocaleLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

const terms = query => normalize(query).split(' ').filter(Boolean);
const matches = (value, words) => words.every(word => value.includes(word));

export function openingMatchesSearch(opening, query) {
  const words = terms(query);
  return !!words.length && (matches(normalize(opening.name), words) || normalize(opening.eco) === normalize(query));
}

export function filterOpeningLines(openings, query) {
  const words = terms(query);
  if (!words.length) return openings;
  return openings.flatMap(opening => {
    const needle = normalize(query);
    const rank = line => {
      const name=normalize(line.name),full=normalize(`${opening.name} ${line.name}`);
      return name===needle||full===needle||normalize(line.eco)===needle?0:name.startsWith(needle)||full.startsWith(needle)?1:2;
    };
    const lines = openingMatchesSearch(opening, query) ? opening.lines : opening.lines.filter(line =>
      matches(normalize(`${opening.name} ${line.name} ${line.eco}`), words)).sort((a,b)=>rank(a)-rank(b));
    return lines.length ? [{...opening, lines}] : [];
  });
}
