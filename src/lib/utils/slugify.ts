const CHAR_MAP: Record<string, string> = {
  "\u0103": "a", "\u0102": "a", // ă Ă
  "\u00e2": "a", "\u00c2": "a", // â Â
  "\u00ee": "i", "\u00ce": "i", // î Î
  "\u0219": "s", "\u0218": "s", // ș Ș
  "\u015f": "s", "\u015e": "s", // ş Ş
  "\u021b": "t", "\u021a": "t", // ț Ț
  "\u0163": "t", "\u0162": "t", // ţ Ţ
  "\u00e0": "a", "\u00e1": "a", "\u00e4": "a", "\u00e5": "a",
  "\u00e8": "e", "\u00e9": "e", "\u00eb": "e",
  "\u00f2": "o", "\u00f3": "o", "\u00f6": "o",
  "\u00f9": "u", "\u00fa": "u", "\u00fc": "u",
  "\u00f1": "n",
};

export function slugify(text: string): string {
  return text
    .split("")
    .map((char) => CHAR_MAP[char] ?? char)
    .join("")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}
