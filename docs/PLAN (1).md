# 🎭 CampusMatch: Anonymous Friend Matching (3-Hour Build Plan)

> **One-liner:** Students sign up with a campus email, fill a 2-minute profile about their personality and interests, and get matched with similar people **anonymously**. Embeddings in a vector DB do the matching. When two people both say "connect", a chat opens.

This file is the single source of truth. Tick the boxes as you go.

---

## 0. TL;DR Decisions (don't re-debate these during the 3 hours)

| Decision | Choice | Why |
|---|---|---|
| Backend | **FastAPI (Python)** | Embeddings and the vector DB are Python-native, and it has WebSockets built in |
| Embeddings | **`sentence-transformers/all-MiniLM-L6-v2`** (384-dim, runs locally) | Free, fast on CPU, no API key, good enough for short text |
| Vector DB | **ChromaDB** (persistent, local) | `pip install` and go. Supports metadata filters and cosine distance |
| Relational DB | **SQLite + SQLModel** | Users, likes, matches, messages. Zero setup |
| Chat | **FastAPI WebSockets** (+ messages saved in SQLite) | No extra service |
| Frontend | **React + Vite + Tailwind** | Fast to scaffold. Everyone knows it |
| Auth | **Email + OTP, or a simple JWT on `@iiitr.ac.in` emails** (mock the OTP for the demo) | Keeps it campus-only without building real email delivery |
| Identity | **Random alias + emoji avatar** (e.g., "Curious Otter 🦦") | Anonymous by default |

> **Fallback if the team prefers JS/managed services:** Supabase (Auth + Postgres + `pgvector` + Realtime for chat) with OpenAI `text-embedding-3-small`. It's less code for chat, but needs API keys and internet.

---

## 1. Scope: What We Build in 3 Hours

### ✅ MVP (must ship)
1. **Sign up / log in** with a campus email (domain check). An alias is auto-generated.
2. **Onboarding profile form**: personality, interests, free text (see §2).
3. **Embedding pipeline**: profile → facet chunks → embeddings → ChromaDB.
4. **Match feed**: top-10 recommended people, each with a match % and a "why you matched" line.
5. **Connect / Skip**: a mutual connect creates a match.
6. **1:1 real-time chat** between matched users.
7. **Seed script** with about 40 fake profiles so the demo looks alive.

### 🟡 Stretch (only if ahead of schedule)
- **Mutual identity reveal**: both press "Reveal", and then real names show.
- **Icebreaker generator** based on shared interests (template-based, no LLM needed).
- **Report / block** button (do at least the block if possible; it matters for an anonymous app).
- **"Looking for" modes**: study buddy / gym partner / gaming squad / deep talks / hackathon teammate.
- **Typing indicator, unread badges.**
- **Event-based matching**: "Who's going to the fest?"

### ❌ Out of scope (explicitly cut)
Group chats, image upload, push notifications, real email delivery, mobile app, ML fine-tuning.

---

## 2. Profile Info to Collect (designed to embed well)

Keep onboarding **under 2 minutes**. Mix **structured fields**, which feed filters and tag overlap, with **free text**, which carries the semantic signal for embeddings.

### A. Basics (structured, never shown publicly except year)
| Field | Type | Used for |
|---|---|---|
| Email (`@iiitr.ac.in`) | text | Auth only. **Never shown** |
| Real name | text | Only on mutual reveal (stretch) |
| Year | 1st–4th / PG | Filter + display |
| Branch | dropdown (optional) | Display only if the user opts in |
| Alias + emoji | auto-generated, can be re-rolled | Public identity |

### B. Personality (quick quiz, 6 sliders, 1–5)
A lightweight Big-Five-style set:
1. I recharge by being around people ↔ alone (**introvert/extrovert**)
2. I plan everything ↔ I go with the flow (**planner/spontaneous**)
3. I love deep 2 AM conversations ↔ I prefer light banter (**deep/light**)
4. I'm into trying new things ↔ I like my comfort zone (**openness**)
5. I'm competitive ↔ chill (**competitiveness**)
6. Night owl ↔ early bird (**schedule**)

> Convert the sliders into a **sentence** for embedding (e.g., "I'm fairly introverted, spontaneous, love deep conversations…"). Sentence-transformers understand text, not raw numbers. Also keep the raw numbers for a small numeric similarity bonus.

### C. Interests (multi-select tags, pick 3–10)
Group them so the UI is quick:
- **Tech:** coding, competitive programming, AI/ML, web dev, open source, cybersecurity, hackathons
- **Creative:** music (playing), singing, drawing, photography, writing, content creation, dance
- **Sports & Fitness:** cricket, football, badminton, gym, running, yoga, chess
- **Entertainment:** anime, K-drama, movies, web series, gaming (PC/mobile/console), memes
- **Lifestyle:** food & cafés, travel, reading, startups, finance/investing, volunteering, spirituality

### D. Free-text prompts (the most important part for embeddings)
Make 3 of these required (short, 1–2 lines each):
1. **"A perfect weekend for me looks like…"**
2. **"I could talk for hours about…"**
3. **"I'm looking for someone to…"** (study with, go to the gym with, jam with, rant with…)
4. *(optional)* **"My unpopular opinion is…"** (great conversation starter)
5. *(optional)* **Favorite music / shows / games right now**

### E. Intent + availability (structured)
- **Looking for:** study buddy / gym buddy / gaming squad / hangout friends / deep talks / project or hackathon teammate (multi-select)
- **Free time:** mornings / afternoons / evenings / late night / weekends

---

## 3. How Matching Works

### 3.1 Chunking strategy: "facet chunks", not naive text splitting
Profiles are short, so splitting by character count is pointless. Instead, **build one chunk per facet**, so that "loves anime" doesn't get diluted by "early bird":

| Chunk (facet) | Built from | Weight |
|---|---|---|
| `personality` | slider sentence + unpopular opinion | 0.30 |
| `interests` | tags + "talk for hours about" + favorites | 0.40 |
| `lifestyle` | perfect weekend + availability | 0.15 |
| `intent` | "looking for" (tags + text) | 0.15 |

Each chunk → one embedding → stored in ChromaDB with metadata:
```json
{ "user_id": "u_123", "facet": "interests", "year": 2, "active": true }
```
ID format: `"{user_id}:{facet}"`. On a profile update, **upsert** the same IDs.

### 3.2 Embedding text templates (example)
```python
def build_chunks(p):
    return {
      "personality": f"Personality: {slider_to_text(p.sliders)}. Unpopular opinion: {p.unpopular_opinion}",
      "interests":   f"Interests: {', '.join(p.tags)}. I could talk for hours about {p.talk_about}. Currently into {p.favorites}.",
      "lifestyle":   f"My perfect weekend: {p.weekend}. I'm usually free {', '.join(p.availability)}.",
      "intent":      f"Looking for: {', '.join(p.looking_for)}. {p.looking_for_text}",
    }
```

### 3.3 Query = your own profile
The user's own facet chunks serve as the queries. This is exactly the "profile is also the query" idea:

```
for each facet f in user's chunks:
    results = chroma.query(query_embeddings=[emb_f], n_results=30,
                           where={"$and":[{"facet": f}, {"active": True}]})
    for each hit (other_user, distance):
        if other_user == me or blocked/skipped: continue
        sim = 1 - distance                       # cosine similarity
        semantic[other_user] += WEIGHT[f] * sim
```

### 3.4 Final score (hybrid = better than pure vectors)
```
final = 0.70 * semantic_score            # from the vector DB (above)
      + 0.20 * jaccard(my_tags, their_tags)
      + 0.10 * intent_overlap(looking_for) # boosts people who want the same kind of friend
```
- Show `round(final * 100)` as the **match %** (rescale to make it friendlier, e.g., map 0.3–0.9 → 60–98%).
- **"Why you matched"** = shared tags + the facet with the highest similarity, e.g., *"You both love anime & hackathons · similar weekend vibes."*
- **Diversity tweak (optional):** don't show more than 3 people in a row with an identical top tag.

### 3.5 Cold start
With a fresh DB, matching is empty. **Run the seed script first** (§7). Also, fall back to "random active users" if fewer than 5 results come back.

---

## 4. Architecture

```
┌──────────────┐   REST + WS    ┌───────────────────────────────┐
│ React (Vite) │ ─────────────▶ │ FastAPI                       │
│  - Auth      │                │  ├─ /auth   (JWT)             │
│  - Onboard   │                │  ├─ /profile → embed → Chroma │
│  - Matches   │ ◀───────────── │  ├─ /matches (vector search)  │
│  - Chat      │   WebSocket    │  ├─ /connect                  │
└──────────────┘                │  └─ /ws/chat/{match_id}       │
                                └──────┬───────────────┬────────┘
                                       │               │
                              ┌────────▼──────┐ ┌──────▼──────────┐
                              │ SQLite        │ │ ChromaDB        │
                              │ users, likes, │ │ facet chunk     │
                              │ matches, msgs │ │ embeddings      │
                              └───────────────┘ └─────────────────┘
                                       ▲
                       sentence-transformers (loaded once at startup)
```

---

## 5. Data Model (SQLite / SQLModel)

```python
User:     id, email (unique), real_name, alias, avatar_emoji, year, branch,
          created_at, onboarded: bool
Profile:  user_id (FK), sliders_json, tags_json, looking_for_json,
          availability_json, weekend, talk_about, looking_for_text,
          unpopular_opinion, favorites, updated_at
Like:     id, from_user, to_user, action ("connect" | "skip"), created_at
Match:    id, user_a, user_b, created_at, revealed_a: bool, revealed_b: bool
Message:  id, match_id, sender_id, text, created_at
Block:    id, blocker_id, blocked_id        # stretch
```
**Mutual connect rule:** when A sends "connect" to B, check whether B already sent "connect" to A. If so, create a `Match` and return `{matched: true, match_id}`.

---

## 6. API Endpoints

| Method | Path | Body / Notes |
|---|---|---|
| POST | `/auth/login` | `{email}` → checks for `@iiitr.ac.in` → returns JWT (mock OTP `000000` for the demo) |
| GET | `/me` | current user + onboarded flag |
| PUT | `/profile` | full profile → save → **build chunks → embed → upsert into Chroma** |
| GET | `/matches/recommendations` | top 10 `{user_id, alias, emoji, year, score, reasons[], tags[]}` |
| POST | `/connect/{user_id}` | `{action: "connect" \| "skip"}` → `{matched, match_id?}` |
| GET | `/chats` | list of my matches with last message |
| GET | `/chats/{match_id}/messages` | history (last 50) |
| WS | `/ws/chat/{match_id}?token=` | send/receive `{text}`. Check that the user belongs to the match |
| POST | `/reveal/{match_id}` | *(stretch)* |
| POST | `/block/{user_id}` | *(stretch)* |

**Never return** `email` or `real_name` in any recommendation or chat payload (unless both sides have revealed).

---

## 7. Folder Structure

```
campus-match/
├── PLAN.md                  ← this file
├── backend/
│   ├── requirements.txt
│   ├── .env                 # JWT_SECRET, ALLOWED_DOMAIN=iiitr.ac.in
│   ├── app/
│   │   ├── main.py          # FastAPI app, CORS, routers, model load on startup
│   │   ├── db.py            # SQLModel engine/session
│   │   ├── models.py        # tables from §5
│   │   ├── auth.py          # JWT create/verify, domain check
│   │   ├── embeddings.py    # load model, build_chunks(), embed()
│   │   ├── vectorstore.py   # chroma client, upsert_profile(), query_facet()
│   │   ├── matching.py      # hybrid scoring + reasons
│   │   ├── aliases.py       # adjective + animal + emoji generator
│   │   └── routers/
│   │       ├── profile.py
│   │       ├── matches.py
│   │       └── chat.py      # REST history + WebSocket manager
│   └── scripts/
│       └── seed.py          # 40 fake profiles → DB + Chroma
└── frontend/
    ├── src/
    │   ├── api.ts           # fetch wrapper with JWT
    │   ├── pages/
    │   │   ├── Login.tsx
    │   │   ├── Onboarding.tsx   # multi-step: quiz → tags → prompts → intent
    │   │   ├── Matches.tsx      # card list w/ score + reasons + Connect/Skip
    │   │   ├── Chats.tsx        # list of matches
    │   │   └── ChatRoom.tsx     # websocket chat
    │   └── components/ (MatchCard, TagPicker, Slider, ChatBubble)
    └── ...
```

`requirements.txt`
```
fastapi
uvicorn[standard]
sqlmodel
chromadb
sentence-transformers
python-jose[cryptography]
python-dotenv
```

> ⚠️ **Download the embedding model before the clock starts.** Run `python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('all-MiniLM-L6-v2')"` once so venue Wi-Fi can't block you.

---

## 8. Key Code Sketches

**embeddings.py**
```python
from sentence_transformers import SentenceTransformer
_model = SentenceTransformer("all-MiniLM-L6-v2")
def embed(texts: list[str]) -> list[list[float]]:
    return _model.encode(texts, normalize_embeddings=True).tolist()
```

**vectorstore.py**
```python
import chromadb
client = chromadb.PersistentClient(path="./chroma_data")
col = client.get_or_create_collection("profiles", metadata={"hnsw:space": "cosine"})

def upsert_profile(user_id, chunks: dict, year):
    facets = list(chunks)
    col.upsert(
        ids=[f"{user_id}:{f}" for f in facets],
        documents=[chunks[f] for f in facets],
        embeddings=embed([chunks[f] for f in facets]),
        metadatas=[{"user_id": user_id, "facet": f, "year": year, "active": True} for f in facets],
    )

def query_facet(emb, facet, k=30):
    return col.query(query_embeddings=[emb], n_results=k,
                     where={"$and": [{"facet": facet}, {"active": True}]})
```

**chat.py (WebSocket manager)**
```python
rooms: dict[int, set[WebSocket]] = {}

@router.websocket("/ws/chat/{match_id}")
async def chat_ws(ws: WebSocket, match_id: int, token: str):
    user = verify(token); assert_in_match(user, match_id)
    await ws.accept(); rooms.setdefault(match_id, set()).add(ws)
    try:
        while True:
            data = await ws.receive_json()
            msg = save_message(match_id, user.id, data["text"][:1000])
            for peer in rooms[match_id]:
                await peer.send_json(msg.dict())
    except WebSocketDisconnect:
        rooms[match_id].discard(ws)
```

---

## 9. ⏱️ 3-Hour Timeline

Assumes **3 people**: **B** = backend, **M** = matching/ML, **F** = frontend. With 2 people, M and B merge.

| Time | B (Backend) | M (Matching/ML) | F (Frontend) | ✅ Checkpoint |
|---|---|---|---|---|
| **0:00–0:15** | Repo, FastAPI skeleton, CORS, SQLite models | Install + download model, Chroma hello-world | Vite + Tailwind + router, page shells | Both servers run |
| **0:15–0:45** | `/auth/login` (JWT + domain check), `/me`, alias generator | `build_chunks`, `embed`, `upsert_profile` | Login page + Onboarding multi-step form | A profile can be submitted |
| **0:45–1:15** | `PUT /profile` wired to M's upsert | **`seed.py`** with 40 diverse profiles, then `matching.py` hybrid score + reasons | Matches page: cards with %, reasons, tags | 🎯 **Recommendations show for a seeded user** |
| **1:15–1:45** | `/connect` + mutual-match logic, `/chats` list | Tune weights and check that results *feel* right; add the fallback | Connect/Skip actions, "It's a match!" modal, Chats list | Two browsers can match |
| **1:45–2:20** | WebSocket chat + message history | Icebreaker suggestions from shared tags (stretch) | ChatRoom page with WS | 🎯 **Real-time chat works end-to-end** |
| **2:20–2:40** | Block endpoint, payload privacy audit (no emails leak) | Help with bugs | Polish: loading states, empty states, mobile layout | Feature freeze ❄️ |
| **2:40–3:00** | **Everyone:** full demo run-through ×2, fix blockers only, write the README, record a backup demo video | | | 🚀 Ship |

**Rule:** if a checkpoint is more than 15 minutes late, cut the next stretch item. Never cut the seed script or chat.

---

## 10. Seed Data Tips (this makes or breaks the demo)
- Create about 40 profiles across **5–6 clear "archetypes"**: gamer/anime night owl, gym and sports, coder/hackathon grinder, artsy/music, bookish/deep talker, foodie/traveler. Add some blends.
- Write **real-sounding free text**, not lorem ipsum. Vary it per profile (you can ask an LLM to generate the JSON in advance).
- Put it in `scripts/seed_profiles.json` so it's reproducible. `seed.py` loads it, inserts users, and upserts into Chroma.
- Prepare **2 demo accounts** whose profiles clearly match each other for the live chat demo.

---

## 11. Privacy & Safety Checklist (anonymous apps need this)
- [ ] Email and real name are never in any public API response
- [ ] Chat history is only accessible to the 2 match members (check on REST and WS)
- [ ] Message length is capped, and HTML is escaped on render (React does this by default; don't use `dangerouslySetInnerHTML`)
- [ ] Block hides both users from each other's recommendations and closes the chat
- [ ] Skipped users don't reappear (filter by the `Like` table)
- [ ] Only `@iiitr.ac.in` emails are allowed
- [ ] *(Mention in the pitch)* Rate limits, a report queue, and real OTP are next steps

---

## 12. Demo Script (2 minutes)
1. **Problem:** "It's hard to find your people on campus beyond your branch or hostel, and approaching people is awkward."
2. **Onboard live:** a fresh user fills the profile in about 60 seconds and gets the alias "Sleepy Panda 🐼".
3. **Matches:** show the top cards with match % and "why you matched". Explain facet embeddings + hybrid scoring in one sentence.
4. **Connect:** demo account #2 (other laptop) has already connected, so "It's a match! 🎉" appears.
5. **Chat:** send messages in real time across two screens, and click an icebreaker.
6. **Close:** privacy-first design, plus the roadmap (mutual reveal, events, group matching).

---

## 13. Future Roadmap (for the pitch / post-hackathon)
- Mutual identity reveal and "friend graph"
- **Feedback loop:** use connect/skip signals to re-weight facets per user
- LLM-generated "why you'd click" summaries and icebreakers
- Group matching (find 4 people for a trek or hackathon team)
- Club/event-based matching, interest-based communities
- Moderation: toxicity filter on chat, report queue, admin panel
- Swap Chroma for pgvector/Qdrant if scaling, and add real OTP email

---

## 14. Quick Start Commands
```bash
# backend
cd backend && python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python scripts/seed.py
uvicorn app.main:app --reload --port 8000

# frontend
cd frontend && npm create vite@latest . -- --template react-ts
npm i && npm i -D tailwindcss @tailwindcss/vite && npm i react-router-dom
npm run dev
```

---

## ✅ Master Checklist
- [ ] Model pre-downloaded, repo created, roles assigned
- [ ] Auth with domain check + alias
- [ ] Onboarding form (sliders, tags, 3 prompts, intent, availability)
- [ ] Facet chunking + embedding + Chroma upsert
- [ ] Seed data (40 profiles + 2 demo accounts)
- [ ] Hybrid matching + match % + reasons
- [ ] Connect/Skip + mutual match
- [ ] Real-time chat with history
- [ ] Privacy checks pass
- [ ] Demo rehearsed twice + backup video
