//
//  lib/sequence.js
//
//  A pre-show and a post-show are the same thing: a run of full-screen lines,
//  some on a timer and some waiting for a click, with a music bed under them
//  and optionally a voice clip on any one of them.
//
//  Held as data rather than as another hand-built HTML file, because writing a
//  new page by hand is what happened for every school and every client. One
//  shape, and an export that bakes a copy for a laptop with no internet.
//

import fs from "fs";
import path from "path";

// The pre-show exactly as it runs today, so preloading it and changing nothing
// behaves identically. Times are absolute milliseconds from the start, lifted
// from preshow.html's own sequence.
export const DEFAULT_PRESHOW = {
  title: "Pre-show",
  musicUrl: "/music.mp3",
  fadeOutAtMs: 70800,
  fadeMs: 3000,
  steps: [
    { atMs: 500,   main: "In just a few moments...", sub: "We'll experience something extraordinary together." },
    { atMs: 5700,  main: "This isn't just my show." },
    { atMs: 9200,  main: "It's about all of us." },
    { atMs: 13200, main: "Everyone in this room will be part of the experience." },
    { atMs: 18200, main: "No one will be embarrassed.", sub: "That's my promise." },
    { atMs: 23200, main: "I'm not a psychic.", sub: "I'm here to entertain, amaze, and create impossible moments." },
    { atMs: 27600, main: "One important thing." },
    { atMs: 30600, main: "Please don't try to figure things out.", sub: "It will ruin the effect for you and for others." },
    { atMs: 35200, main: "Questions?", sub: "Come find me after the show. I'd love to meet you." },
    { atMs: 39700, main: "Focus on the center of the screen.", sub: "Keep your eyes on the wheel." },
    // Silent, just look. No text over it; the ask comes after.
    { atMs: 44200, wheel: true },
    { atMs: 51200, main: "" },
    { atMs: 52800, main: "Think of a number", sub: "Between 10 and 50.", gold: true },
    { atMs: 56800, main: "Lock it in.", sub: "Don't say it out loud." },
    { atMs: 61300, main: "Remember it.", gold: true },
    { atMs: 65300, main: "The show has already begun.", sub: "Remember your number.", gold: true },
    // Hard black. The music has finished its own ending by here.
    { atMs: 73800, main: "" },
    // Plays alone in the dark, once the music has gone silent.
    { atMs: 74100, main: "", voiceUrl: "/announcer.mp3" },
    // From here it waits for a click on each one.
    { click: true, main: "Power of\nINFLUENCE", gold: true },
    { click: true, main: "Say “NOT TODAY”\nto\nFailure", gold: true },
    { click: true, main: "\"Empathy\"", gold: true },
    { click: true, main: "Two heads\nare\nbetter\nthan One", gold: true },
    { click: true, main: "Moment\nis\nNOW", gold: true },
  ],
};

export const DEFAULT_POSTSHOW = { title: "Post-show", musicUrl: "", steps: [] };

export function defaultsFor(kind) {
  return JSON.parse(JSON.stringify(kind === "preshow" ? DEFAULT_PRESHOW : DEFAULT_POSTSHOW));
}

// A sequence a room has configured, or the built-in one if it never has.
export function sequenceFor(state, kind) {
  const stored = state && state.sequences && state.sequences[kind];
  if (stored && Array.isArray(stored.steps) && stored.steps.length) return stored;
  return defaultsFor(kind);
}

// ── Export ────────────────────────────────────────────────────────────────
//
// Audio is inlined as base64 rather than linked. The point of the export is a
// file that runs on a laptop in a hall with no internet, and a linked clip is
// exactly the thing that fails there -- silently, in front of everyone, having
// worked perfectly at home.

const MIME = { ".mp3": "audio/mpeg", ".m4a": "audio/mp4", ".wav": "audio/wav" };

async function inline(url, dirs) {
  if (!url) return "";
  if (url.startsWith("data:")) return url;
  if (/^https?:\/\//i.test(url)) {
    try {
      const res = await fetch(url);
      if (!res.ok) return url;                 // leave the link; better than nothing
      const buf = Buffer.from(await res.arrayBuffer());
      const type = res.headers.get("content-type") || "audio/mpeg";
      return `data:${type};base64,${buf.toString("base64")}`;
    } catch { return url; }
  }
  const rel = url.replace(/^\//, "");
  for (const dir of dirs) {
    const file = path.join(dir, rel.replace(/^media\//, ""));
    try {
      if (!fs.existsSync(file)) continue;
      const type = MIME[path.extname(file).toLowerCase()] || "audio/mpeg";
      return `data:${type};base64,${fs.readFileSync(file).toString("base64")}`;
    } catch { /* try the next */ }
  }
  return url;
}

export async function inlineAll(seq, dirs) {
  const out = JSON.parse(JSON.stringify(seq));
  out.musicUrl = await inline(out.musicUrl, dirs);
  for (const step of out.steps || []) {
    if (step.voiceUrl) step.voiceUrl = await inline(step.voiceUrl, dirs);
  }
  return out;
}
