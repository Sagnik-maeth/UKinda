import { SLIDERS } from "./constants";
import type { ProfileInput } from "./schemas";

// Natural phrasing per slider (same order as SLIDERS): [leans low, middle, leans high].
// Values 1 and 5 use the SLIDERS labels directly ("very introverted", "a night owl", ...).
const PHRASES: readonly [string, string, string][] = [
  ["a bit introverted", "somewhere between introvert and extrovert", "a bit extroverted"],
  ["more of a planner", "a mix of planner and spontaneous", "fairly spontaneous"],
  ["more into light banter", "equally into banter and deep talks", "more into deep conversations"],
  ["mostly a comfort-zone person", "open to new things but I like my comfort zone", "usually up for trying new things"],
  ["fairly chill", "chill but competitive when it counts", "a bit competitive"],
  ["more of an early bird", "neither an early bird nor a night owl", "more of a night owl"],
];
if (PHRASES.length !== SLIDERS.length) throw new Error("chunks.ts PHRASES must match SLIDERS");

function sliderText(value: number, index: number) {
  const [low, high] = SLIDERS[index];
  const [leanLow, middle, leanHigh] = PHRASES[index];
  if (value <= 1) return low;
  if (value === 2) return leanLow;
  if (value === 3) return middle;
  if (value === 4) return leanHigh;
  return high;
}

/** Trims, capitalises and ends with exactly one sentence terminator (fixes "late.." and "gaming squad. someone"). */
function sentence(text: string) {
  const clean = text.trim().replace(/[\s.]+$/, "");
  if (!clean) return "";
  const capitalised = clean[0].toUpperCase() + clean.slice(1);
  return /[!?…)"'\p{Extended_Pictographic}]$/u.test(capitalised) ? capitalised : `${capitalised}.`;
}

function list(items: readonly string[]) {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

export function buildChunks(profile: ProfileInput) {
  const traits = profile.sliders.map(sliderText);
  const opinion = profile.unpopularOpinion?.trim();
  const favorites = profile.favorites?.trim().replace(/[\s.]+$/, "");
  return {
    PERSONALITY: `My personality: I'm ${list(traits)}.${opinion ? ` My unpopular opinion: ${sentence(opinion)}` : ""}`,
    INTERESTS:
      `My interests are ${list(profile.tags)}. I could talk for hours about ${profile.talkAbout.trim().replace(/[\s.]+$/, "")}.` +
      (favorites ? ` Currently into ${favorites}.` : ""),
    LIFESTYLE: `My perfect weekend: ${sentence(profile.weekend)} I'm usually free ${list(profile.availability.map((slot) =>
      slot === "weekends" ? "on weekends" : slot === "late night" ? "late at night" : `in the ${slot}`))}.`,
    INTENT: `I'm looking for ${list(profile.lookingFor.map((item) => (/s$/.test(item) ? item : `a ${item}`)))}. ${sentence(profile.lookingForText)}`,
  } as const;
}
