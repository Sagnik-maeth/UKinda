import { z } from "zod";
import { ALL_TAGS, AVAILABILITY, LOOKING_FOR } from "./constants";

export const ProfileInput = z.object({
  year: z.number().int().min(1).max(6),
  branch: z.string().trim().max(40).optional(),
  sliders: z.array(z.number().int().min(1).max(5)).length(6),
  tags: z.array(z.enum(ALL_TAGS as [string, ...string[]])).min(3).max(10),
  lookingFor: z.array(z.enum(LOOKING_FOR)).min(1),
  availability: z.array(z.enum(AVAILABILITY)).min(1),
  weekend: z.string().trim().min(10).max(300),
  talkAbout: z.string().trim().min(5).max(300),
  lookingForText: z.string().trim().min(5).max(300),
  unpopularOpinion: z.string().trim().max(200).optional(),
  favorites: z.string().trim().max(200).optional(),
});

export type ProfileInput = z.infer<typeof ProfileInput>;
