// A hyphen at a line end usually splits one word, but some French compounds really carry one.
// Exact pairs, because the second half alone also ends ordinary words: cou-leur, for-ce, mer-ci.
const INVERTED_VERBS = new Set(["a", "as", "ai", "est", "es", "suis", "sont", "ont", "avait", "avaient", "était", "étaient", "fait", "font", "dit", "disent", "disait", "répond", "répondit", "demande", "demanda", "ajoute", "ajouta", "pense", "pensa", "murmura", "cria", "reprit", "va", "vas", "vont", "peut", "peux", "veut", "veux", "sait", "sais", "doit", "dois", "faut", "fut", "sera", "serait", "aurait", "semble", "sembla", "crois", "vois", "voit", "vient", "viens", "prend", "prends", "pourrait", "voudrait", "devrait"]);
const INVERTED_SUBJECTS = new Set(["je", "tu", "il", "elle", "on", "nous", "vous", "ils", "elles", "ce", "t"]);
const IMPERATIVES = new Set(["dis", "donne", "regarde", "écoute", "attends", "laisse", "viens", "prends", "montre", "excuse", "pardonne", "tais", "lève"]);
const IMPERATIVE_OBJECTS = new Set(["moi", "toi", "lui", "nous", "en", "y", "le", "la", "les"]);
const HYPHENATED_PAIRS = new Set([
  "peut être", "est à", "à dire", "vis à", "à vis", "tête à", "à tête", "moi même", "toi même", "lui même", "elle même", "soi même", "nous mêmes", "vous même", "vous mêmes", "eux mêmes", "elles mêmes", "celui là", "celle là", "ceux là", "celles là", "celui ci", "celle ci", "ceux ci", "celles ci", "jusque là", "par là", "par ci", "là bas", "là haut", "là dessus", "là dessous", "là dedans", "au delà", "au dessus", "au dessous", "ci dessus", "ci dessous", "ci contre", "après midi", "grand mère", "grand père", "vas y", "t il", "t elle", "t on", "t ils", "t elles",
]);

function keepsLineEndHyphen(before: string, after: string): boolean {
  const first = before.normalize("NFC");
  const second = after.normalize("NFC");
  const left = first.toLowerCase();
  const right = second.toLowerCase();
  // Jean-Pierre, but not Mc-Donald or You-Tube, which are one name split at the line end
  const properName = second[0] !== right[0] && first[0] !== left[0] && first.length >= 3
    && first.at(-1) === left.at(-1) && !["mac", "you"].includes(left);
  return properName
    || HYPHENATED_PAIRS.has(`${left} ${right}`)
    || (INVERTED_VERBS.has(left) && INVERTED_SUBJECTS.has(right))
    || (IMPERATIVES.has(left) && IMPERATIVE_OBJECTS.has(right));
}

const ANY_SPLIT_WORD = /([\p{L}\p{M}]{1,40})-[ \t]*\r?\n[ \t]*(?=([\p{L}\p{M}]{1,40}))/gu;
const LATIN_SPLIT_WORD = /([\p{Script=Latin}\p{M}]{1,40})-[ \t]*\r?\n[ \t]*(?=([\p{Script=Latin}\p{M}]{1,40}))/gu;

export function rejoinLineEndHyphens(text: string, scripts: "any" | "latin" = "any"): string {
  return text.replace(scripts === "latin" ? LATIN_SPLIT_WORD : ANY_SPLIT_WORD, (_match, before: string, after: string) =>
    `${before}${keepsLineEndHyphen(before, after) ? "-" : ""}`);
}

// A block owns its paragraph boundary; printed line wrapping does not belong in reading text.
export function cleanText(text: string): string {
  return rejoinLineEndHyphens(text.replace(/\u00ad[ \t]*\r?\n[ \t]*/g, ""))
    .replace(/\u00ad|\u200b|\u200c|\u200d|\ufeff/g, "")
    .replace(/\s+/g, " ")
    .trim();
}


export const TEXT_KINDS = ["prose", "verse", "heading", "list", "footnote", "metadata", "furniture"] as const;
export type TextKind = typeof TEXT_KINDS[number];

export type TextBlock = { text: string; kind?: TextKind; breakBefore?: "line"; included?: boolean };

export function joinTextBlocks(blocks: TextBlock[]) {
  let text = "";
  const spans: { block: number; start: number; end: number }[] = [];
  let previous: TextBlock | undefined;
  for (const [block, source] of blocks.entries()) {
    if (source.included === false || !source.text) continue;
    if (previous) text += source.breakBefore === "line" && source.kind === "verse" && previous.kind === "verse" ? "\n" : "\n\n";
    const start = text.length;
    text += source.text;
    spans.push({ block, start, end: text.length });
    previous = source;
  }
  return { text, spans };
}

export function formatExtractedText(text: string, kind?: TextKind): string {
  if (kind !== "verse") return cleanText(text);
  return text.replace(/\r\n?/g, "\n").split("\n")
    .map((line) => line.replace(/\u00ad|\u200b|\u200c|\u200d|\ufeff/g, "").replace(/[ \t]+/g, " ").trim())
    .join("\n").trim();
}
