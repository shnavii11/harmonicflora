# START HERE — your simple checklist (Vaishnavi)

Claude writes all the code. These are the only 4 things that need *you*. You don't have
to do them yet — during the build Claude will stop and say **"👉 Your turn"** at the
right moment. This is just so you know what's coming.

---

## ✅ Step 1 — Deepgram account + key  (needed at Phase E)

1. Open <https://console.deepgram.com/signup>
2. Sign up (free credit, no credit card).
3. Left menu → **API Keys** → **Create a New API Key**.
4. Copy the key immediately (you only see it once). Paste it somewhere safe for a minute.

## ✅ Step 2 — Put the key in the project  (needed at Phase E)

1. In the `harmonicflora` folder, make a file named exactly **`.env.local`**
2. Put this one line inside (replace with your real key):
   ```
   DEEPGRAM_API_KEY=paste_your_key_here
   ```
3. Save. Done. (This file never goes to GitHub — it's ignored on purpose.)

## ✅ Step 3 — Record 6 short voice clips  (needed at Phase D)

You'll record ~10–20 seconds each. Claude will give you a one-line command to record
straight to `.wav`, or you can use QuickTime → File → New Audio Recording.

Record these:
1. **Talking normally** with pauses between sentences.
2. **Humming** a little tune.
3. **Silence** — just let the room be quiet (fan/AC on is fine). Say nothing.
4. **Breathing** near the mic. No words.
5. **Talking with music/TV** playing in the background.
6. **Talking very softly.**

Save them into `benchmark/audio/`. Claude will help you label them.

## ✅ Step 4 — Deploy on Vercel  (needed at Phase F)

1. Open <https://vercel.com/signup> → sign in **with GitHub**.
2. Import the `harmonicflora` repo.
3. In project settings → **Environment Variables**, add:
   - Name: `DEEPGRAM_API_KEY`
   - Value: (the same key from Step 1)
4. Click **Deploy**. You get a live link. That link + the GitHub repo is your submission.

---

**That's everything.** For each step, when it's time, Claude will pause and walk you
through it live. You just follow along.

The full technical plan (for Claude) is in **PLAN.md** — you don't need to read it, but
it's there if you're curious.
