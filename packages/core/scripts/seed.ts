import { prisma } from "@campus/db";
import { randomAlias, saveProfile, ProfileInput } from "../src/index";

const archetypes = [
  {
    tags: ["anime", "PC gaming", "memes", "coding"],
    lookingFor: ["gaming squad", "hangout friends", "deep talks"],
    sliders: [2, 4, 5, 5, 2, 5],
    weekend: "A late breakfast, a few rounds with friends, and one more anime episode than planned.",
    talkAbout: "co-op games, sci-fi anime, and why the best stories have weird side characters",
    lookingForText: "someone to play games with and get food after class",
    favorites: "story-heavy RPGs and anything with a good soundtrack",
  },
  {
    tags: ["gym", "cricket", "football", "running"],
    lookingFor: ["gym buddy", "hangout friends", "study buddy"],
    sliders: [4, 3, 3, 4, 4, 1],
    weekend: "An early run, a long brunch, and watching a match with whoever is around.",
    talkAbout: "training plans, cricket, and finding decent places to eat near campus",
    lookingForText: "a consistent gym partner who also enjoys relaxed plans",
    favorites: "live cricket, new playlists, and trying different cafés",
  },
  {
    tags: ["coding", "competitive programming", "AI/ML", "hackathons"],
    lookingFor: ["project/hackathon teammate", "study buddy", "deep talks"],
    sliders: [2, 2, 5, 5, 4, 5],
    weekend: "A hackathon, a coffee break, then a late-night rabbit hole on some new tool.",
    talkAbout: "building useful things, algorithms, and ideas that might become a side project",
    lookingForText: "curious people who like making things together without taking it too seriously",
    favorites: "open-source projects and practical machine learning",
  },
  {
    tags: ["playing music", "photography", "writing", "movies"],
    lookingFor: ["hangout friends", "deep talks", "project/hackathon teammate"],
    sliders: [3, 4, 5, 5, 1, 4],
    weekend: "Taking photos around town, listening to records, and writing down little observations.",
    talkAbout: "film soundtracks, creative routines, and the stories behind ordinary places",
    lookingForText: "people who want to swap playlists or make something creative",
    favorites: "indie music, thoughtful films, and photo walks",
  },
  {
    tags: ["reading", "chess", "movies", "food & cafés"],
    lookingFor: ["deep talks", "study buddy", "hangout friends"],
    sliders: [2, 2, 5, 3, 2, 4],
    weekend: "A quiet morning with a book followed by a long conversation over chai.",
    talkAbout: "fiction, philosophy, chess puzzles, and how people decide what matters",
    lookingForText: "a thoughtful friend who is equally happy chatting or sitting quietly",
    favorites: "short stories, clever mysteries, and chai",
  },
  {
    tags: ["travel", "food & cafés", "volunteering", "dance"],
    lookingFor: ["hangout friends", "deep talks", "study buddy"],
    sliders: [5, 5, 4, 5, 2, 3],
    weekend: "Finding a new food spot, making spontaneous plans, and calling home on the way back.",
    talkAbout: "places worth visiting, comfort food, and volunteering projects around campus",
    lookingForText: "friendly people for spontaneous plans, food runs, and honest conversations",
    favorites: "street food, travel vlogs, and upbeat playlists",
  },
];

async function main() {
  for (let index = 0; index < 40; index += 1) {
    const archetype = archetypes[index % archetypes.length];
    const email = `seed${String(index + 1).padStart(2, "0")}@${process.env.ALLOWED_EMAIL_DOMAIN ?? "iiitr.ac.in"}`;
    const input = ProfileInput.parse({
      year: (index % 5) + 1,
      sliders: archetype.sliders,
      tags: archetype.tags,
      lookingFor: archetype.lookingFor,
      availability: index % 2 ? ["evenings", "weekends"] : ["late night", "weekends"],
      weekend: archetype.weekend,
      talkAbout: archetype.talkAbout,
      lookingForText: archetype.lookingForText,
      favorites: archetype.favorites,
    });
    const user = await prisma.user.upsert({
      where: { email },
      update: {},
      create: { email, ...randomAlias() },
    });
    await saveProfile(user.id, input);
    console.log("Seeded", email);
  }

  const demoInput = ProfileInput.parse({
    year: 2,
    sliders: [2, 4, 5, 5, 2, 5],
    tags: ["anime", "PC gaming", "coding", "memes"],
    lookingFor: ["gaming squad", "hangout friends", "deep talks"],
    availability: ["evenings", "late night", "weekends"],
    weekend: "Gaming with friends, trying a new place to eat, and watching anime late.",
    talkAbout: "anime, co-op games, and small apps I want to build",
    lookingForText: "someone to hang out with and play games after class",
    favorites: "co-op games and sci-fi anime",
  });
  for (const email of ["demo1", "demo2"].map((name) => `${name}@${process.env.ALLOWED_EMAIL_DOMAIN ?? "iiitr.ac.in"}`)) {
    const user = await prisma.user.upsert({
      where: { email },
      update: {},
      create: { email, ...randomAlias() },
    });
    await saveProfile(user.id, demoInput);
    console.log("Seeded demo account", email);
  }
}

main()
  .catch((error: unknown) => {
    console.error("Seeding failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
