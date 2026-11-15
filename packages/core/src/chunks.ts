import { SLIDERS } from "./constants";
import type { ProfileInput } from "./schemas";

function slidersToText(values: number[]) {
  return values.map((value, index) => {
    const [low, high] = SLIDERS[index];
    if (value <= 2) return `${value === 1 ? "very much" : "fairly"} ${low.replace(/^very /, "")}`;
    if (value >= 4) return `${value === 5 ? "very much" : "fairly"} ${high.replace(/^very /, "")}`;
    return `balanced between ${low} and ${high}`;
  }).join(", ");
}

export function buildChunks(profile: ProfileInput) {
  return {
    PERSONALITY: `My personality: I'm ${slidersToText(profile.sliders)}.${profile.unpopularOpinion ? ` My unpopular opinion: ${profile.unpopularOpinion}` : ""}`,
    INTERESTS: `My interests are ${profile.tags.join(", ")}. I could talk for hours about ${profile.talkAbout}.${profile.favorites ? ` Currently into ${profile.favorites}.` : ""}`,
    LIFESTYLE: `My perfect weekend: ${profile.weekend}. I'm usually free in the ${profile.availability.join(", ")}.`,
    INTENT: `I'm looking for: ${profile.lookingFor.join(", ")}. ${profile.lookingForText}`,
  } as const;
}
