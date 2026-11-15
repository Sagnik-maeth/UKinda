export const TAG_GROUPS = {
  Tech: ["coding", "competitive programming", "AI/ML", "web dev", "open source", "cybersecurity", "hackathons"],
  Creative: ["playing music", "singing", "drawing", "photography", "writing", "content creation", "dance"],
  Sports: ["cricket", "football", "badminton", "gym", "running", "yoga", "chess"],
  Entertainment: ["anime", "K-drama", "movies", "web series", "PC gaming", "mobile gaming", "memes"],
  Lifestyle: ["food & cafés", "travel", "reading", "startups", "investing", "volunteering", "spirituality"],
} as const;

export const ALL_TAGS = Object.values(TAG_GROUPS).flat();
export const LOOKING_FOR = [
  "study buddy",
  "gym buddy",
  "gaming squad",
  "hangout friends",
  "deep talks",
  "project/hackathon teammate",
] as const;
export const AVAILABILITY = ["mornings", "afternoons", "evenings", "late night", "weekends"] as const;

export const SLIDERS = [
  ["very introverted", "very extroverted"],
  ["a strict planner", "totally spontaneous"],
  ["into light banter", "into deep conversations"],
  ["a comfort-zone person", "always trying new things"],
  ["super chill", "very competitive"],
  ["an early bird", "a night owl"],
] as const;

export const FACET_WEIGHTS = {
  PERSONALITY: 0.3,
  INTERESTS: 0.4,
  LIFESTYLE: 0.15,
  INTENT: 0.15,
} as const;
