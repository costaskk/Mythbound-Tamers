import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { createClient } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {Sparkles, PawPrint, Flame, Droplets, Leaf, Zap, Heart, Map, Backpack, Gamepad2, RotateCcw, Save, Upload, Volume2, VolumeX, Swords, Shield, Star, BookOpen, Wind, Mountain, Moon, BadgeCheck, Sun, CloudSun, Pencil, Users} from "lucide-react";

const SAVE_KEY = "mythbound_tamers_save_v4";
const OLD_SAVE_KEYS = ["mythbound_tamers_save_v6", "mythbound_tamers_save_v5", "mythbound_tamers_save_v4", "mythbound_tamers_save_v3", "mythbound_tamers_save_v2", "mythbound_tamers_save"];
const APP_VERSION = "0.63.0";
const APP_VERSION_CODE = 63;
const UPDATE_MANIFEST_URL = import.meta.env.VITE_UPDATE_MANIFEST_URL || "https://costaskk.github.io/Mythbound-Tamers/update-manifest.json";
const SHINY_RATE = 1 / 192;
const VALID_SCREENS = new Set(["title","story","starter","world","party","pc","shop","dex","account","multiplayer","friends","objectives","help","atlas","update","battle","gameover"]);

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_ANON_PUBLIC_KEY;
const supabase = SUPABASE_URL && SUPABASE_ANON_KEY ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
}) : null;

const MYTHBOUND_WORKER_URL = (import.meta.env.VITE_MYTHBOUND_WORKER_URL || "").replace(/\/$/, "");


function compareVersionString(a = "0.0.0", b = "0.0.0") {
  const pa = String(a).replace(/^v/i, "").split(".").map((n) => parseInt(n, 10) || 0);
  const pb = String(b).replace(/^v/i, "").split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const da = pa[i] || 0, db = pb[i] || 0;
    if (da > db) return 1;
    if (da < db) return -1;
  }
  return 0;
}
function pickLatestManifestEntry(raw) {
  if (!raw) return null;
  const candidates = [];
  if (raw.latest) candidates.push(raw.latest);
  if (Array.isArray(raw.releases)) candidates.push(...raw.releases);
  if (Array.isArray(raw.updates)) candidates.push(...raw.updates);
  if (Array.isArray(raw.versions)) candidates.push(...raw.versions);
  if (raw.version || raw.versionCode || raw.apkUrl || raw.downloadUrl || raw.url || raw.webUrl) candidates.push(raw);
  if (!candidates.length) return raw;

  const clean = candidates
    .filter(Boolean)
    .map((entry) => ({
      ...entry,
      version: String(entry.version || entry.tag || entry.name || raw.version || "0.0.0").replace(/^v/i, ""),
      versionCode: Number(entry.versionCode || entry.androidVersionCode || entry.code || 0),
      apkUrl: entry.apkUrl || entry.downloadUrl || entry.url || entry.webUrl || "",
      notes: entry.notes || entry.body || raw.notes || "",
      mandatory: Boolean(entry.mandatory || raw.mandatory),
      publishedAt: entry.publishedAt || entry.date || raw.publishedAt || "",
    }))
    .filter((entry) => entry.apkUrl || entry.versionCode || entry.version);

  clean.sort((a, b) => {
    const codeDiff = Number(b.versionCode || 0) - Number(a.versionCode || 0);
    if (codeDiff !== 0) return codeDiff;
    return compareVersionString(b.version, a.version);
  });
  return clean[0] || raw;
}
function manifestIsNewer(rawManifest) {
  const manifest = pickLatestManifestEntry(rawManifest);
  if (!manifest) return false;
  const remoteCode = Number(manifest.versionCode || manifest.androidVersionCode || manifest.code || 0);
  if (remoteCode && remoteCode > APP_VERSION_CODE) return true;
  return manifest.version && compareVersionString(manifest.version, APP_VERSION) > 0;
}
function manifestDownloadUrl(rawManifest) {
  const manifest = pickLatestManifestEntry(rawManifest);
  return manifest?.apkUrl || manifest?.downloadUrl || manifest?.url || manifest?.webUrl || "";
}
function normalizeUpdateManifest(rawManifest) {
  const manifest = pickLatestManifestEntry(rawManifest) || {};
  return {
    ...manifest,
    version: String(manifest.version || "0.0.0").replace(/^v/i, ""),
    versionCode: Number(manifest.versionCode || manifest.androidVersionCode || manifest.code || 0),
    apkUrl: manifestDownloadUrl(manifest),
    notes: manifest.notes || rawManifest?.notes || "New Mythbound Tamers update.",
    mandatory: Boolean(manifest.mandatory || rawManifest?.mandatory),
    publishedAt: manifest.publishedAt || rawManifest?.publishedAt || "",
    _rawManifest: rawManifest,
  };
}
async function startApkDownload(rawManifest, options = {}) {
  const manifest = normalizeUpdateManifest(rawManifest);
  const url = manifestDownloadUrl(manifest);
  if (!url) return { ok: false, mode: "none", message: "No APK URL in update manifest." };
  const fileName = `mythbound-tamers-v${manifest.version || APP_VERSION}.apk`;

  const nativeUpdater = window.Capacitor?.Plugins?.MythboundUpdater;
  if (nativeUpdater?.downloadAndInstallApk) {
    try {
      await nativeUpdater.downloadAndInstallApk({ url, fileName, openInstaller: true });
      return { ok: true, mode: "native", message: "APK downloaded in-app. Android installer should open automatically." };
    } catch (e) {
      if (options.nativeOnly) return { ok: false, mode: "native", message: e?.message || String(e) };
      console.warn("Native updater failed, falling back to browser download.", e);
    }
  }

  try {
    window.location.href = url;
    return { ok: true, mode: "browser", message: "Opening latest APK download URL." };
  } catch {
    try {
      window.open(url, "_blank", "noopener,noreferrer");
      return { ok: true, mode: "browser", message: "Opening latest APK download URL." };
    } catch (e) {
      return { ok: false, mode: "browser", message: e?.message || String(e) };
    }
  }
}


async function cleanupDownloadedUpdateApks() {
  try {
    const nativeUpdater = window.Capacitor?.Plugins?.MythboundUpdater;
    if (nativeUpdater?.cleanupDownloadedApks) await nativeUpdater.cleanupDownloadedApks({});
  } catch (e) {
    console.warn("APK cleanup skipped.", e);
  }
}


function hasNativeUpdaterBridge() {
  return Boolean(window.Capacitor?.Plugins?.MythboundUpdater?.downloadAndInstallApk);
}


const CAPTURE_ITEMS = {
  "Prism Capsule": { label: "Prism Capsule", price: 100, multiplier: 1, color: "from-cyan-300 to-fuchsia-300", description: "Standard capture item." },
  "Great Prism": { label: "Great Prism", price: 260, multiplier: 1.45, color: "from-sky-300 to-blue-500", description: "Better odds than a Prism Capsule." },
  "Ultra Prism": { label: "Ultra Prism", price: 650, multiplier: 2.1, color: "from-amber-200 to-orange-500", description: "Excellent odds on rare Mythlings." },
  "Dusk Prism": { label: "Dusk Prism", price: 420, multiplier: 1.3, nightMultiplier: 2.15, color: "from-purple-400 to-slate-900", description: "Strongest at night, caves, and ruins." },
  "Quick Prism": { label: "Quick Prism", price: 350, multiplier: 1.85, earlyOnly: true, color: "from-lime-200 to-cyan-300", description: "Best at the start of an encounter." },
};
const DEFAULT_CAPTURE_ITEMS = { "Prism Capsule": 8, "Great Prism": 1, "Ultra Prism": 0, "Dusk Prism": 0, "Quick Prism": 1 };
const SHOP_STOCK = [
  { kind: "capture", item: "Prism Capsule" },
  { kind: "capture", item: "Great Prism" },
  { kind: "capture", item: "Ultra Prism" },
  { kind: "capture", item: "Dusk Prism" },
  { kind: "capture", item: "Quick Prism" },
  { kind: "item", item: "Potion", price: 120, description: "Heals 35 HP." },
  { kind: "item", item: "Super Potion", price: 320, description: "Heals 80 HP." },
  { kind: "item", item: "Revive Herb", price: 700, description: "Restores a fainted Mythling to half HP." },
  { kind: "item", item: "Power Herb", price: 450, description: "Battle item: raises attack for this battle." },
  { kind: "item", item: "Guard Herb", price: 450, description: "Battle item: raises defense for this battle." },
  { kind: "item", item: "Antidote", price: 120, description: "Cures poison." },
  { kind: "item", item: "Burn Salve", price: 140, description: "Cures burn." },
  { kind: "item", item: "Ice Melt", price: 160, description: "Thaws a frozen Mythling." },
  { kind: "item", item: "Awakening", price: 130, description: "Wakes a sleeping Mythling." },
  { kind: "item", item: "Paralyze Heal", price: 150, description: "Cures paralysis." },
  { kind: "item", item: "Clarity Herb", price: 130, description: "Clears confusion." },
  { kind: "item", item: "Full Heal", price: 520, description: "Cures any status condition." },
  { kind: "item", item: "Prism Ether", price: 380, description: "Restores PP for your active Mythling's moves." },
  { kind: "item", item: "Max Resonance", price: 900, description: "Fully restores PP for the whole active team." },
];

const TYPES = {
  Flame: { icon: Flame, weakTo: "Aqua", strongTo: "Verdant", color: "from-orange-400 to-rose-500", hex: "#fb923c" },
  Aqua: { icon: Droplets, weakTo: "Volt", strongTo: "Flame", color: "from-cyan-300 to-blue-500", hex: "#38bdf8" },
  Verdant: { icon: Leaf, weakTo: "Flame", strongTo: "Volt", color: "from-lime-300 to-emerald-500", hex: "#84cc16" },
  Volt: { icon: Zap, weakTo: "Verdant", strongTo: "Aqua", color: "from-yellow-300 to-fuchsia-400", hex: "#facc15" },
  Stone: { icon: Mountain, weakTo: "Verdant", strongTo: "Air", color: "from-stone-300 to-amber-700", hex: "#a16207" },
  Air: { icon: Wind, weakTo: "Stone", strongTo: "Shadow", color: "from-sky-200 to-indigo-400", hex: "#7dd3fc" },
  Shadow: { icon: Moon, weakTo: "Air", strongTo: "Mystic", color: "from-purple-500 to-slate-950", hex: "#7e22ce" },
  Mystic: { icon: Sparkles, weakTo: "Shadow", strongTo: "Stone", color: "from-violet-300 to-fuchsia-500", hex: "#c084fc" },
  Ice: { icon: Droplets, weakTo: "Metal", strongTo: "Air", color: "from-cyan-100 to-blue-300", hex: "#bfdbfe" },
  Light: { icon: Sun, weakTo: "Shadow", strongTo: "Shadow", color: "from-yellow-100 to-orange-300", hex: "#fde68a" },
  Metal: { icon: Shield, weakTo: "Flame", strongTo: "Ice", color: "from-slate-300 to-zinc-600", hex: "#94a3b8" },
  Crystal: { icon: Sparkles, weakTo: "Metal", strongTo: "Toxic", color: "from-cyan-200 to-fuchsia-300", hex: "#a5f3fc" },
  Toxic: { icon: Leaf, weakTo: "Crystal", strongTo: "Verdant", color: "from-lime-500 to-purple-700", hex: "#65a30d" },
  Spirit: { icon: Moon, weakTo: "Light", strongTo: "Mystic", color: "from-indigo-300 to-slate-900", hex: "#818cf8" },
  Beast: { icon: PawPrint, weakTo: "Metal", strongTo: "Toxic", color: "from-orange-300 to-yellow-900", hex: "#c2410c" },
  Sound: { icon: Volume2, weakTo: "Crystal", strongTo: "Spirit", color: "from-pink-300 to-indigo-500", hex: "#f0abfc" },
};

const TYPE_MATCHUPS = {
  Flame: { strong: ["Verdant", "Ice", "Metal"], weak: ["Aqua", "Stone"] },
  Aqua: { strong: ["Flame", "Stone"], weak: ["Volt", "Verdant"] },
  Verdant: { strong: ["Aqua", "Volt", "Stone"], weak: ["Flame", "Toxic", "Ice"] },
  Volt: { strong: ["Aqua", "Air"], weak: ["Verdant", "Stone"] },
  Stone: { strong: ["Air", "Flame", "Volt"], weak: ["Aqua", "Verdant"] },
  Air: { strong: ["Shadow", "Toxic", "Verdant"], weak: ["Stone", "Ice", "Volt"] },
  Shadow: { strong: ["Mystic", "Light"], weak: ["Air", "Light", "Spirit"] },
  Mystic: { strong: ["Stone", "Beast"], weak: ["Shadow", "Spirit", "Toxic"] },
  Ice: { strong: ["Air", "Verdant", "Beast"], weak: ["Flame", "Metal", "Stone"] },
  Light: { strong: ["Shadow", "Spirit"], weak: ["Shadow", "Toxic"] },
  Metal: { strong: ["Ice", "Crystal", "Beast"], weak: ["Flame", "Volt", "Aqua"] },
  Crystal: { strong: ["Toxic", "Sound", "Mystic"], weak: ["Metal", "Stone"] },
  Toxic: { strong: ["Verdant", "Light", "Mystic"], weak: ["Crystal", "Air", "Metal"] },
  Spirit: { strong: ["Mystic", "Shadow"], weak: ["Light", "Sound"] },
  Beast: { strong: ["Toxic", "Sound"], weak: ["Metal", "Ice", "Mystic"] },
  Sound: { strong: ["Spirit", "Crystal"], weak: ["Beast", "Metal"] },
};


const EVOLUTION_FALLBACKS = {
  Flame: { title: "BLAZING ASCENSION", aura: "from-orange-500 via-rose-500 to-yellow-300", ring: "#fb923c", particles: "embers", verb: "ignites a new form" },
  Aqua: { title: "TIDAL AWAKENING", aura: "from-cyan-300 via-blue-500 to-indigo-600", ring: "#38bdf8", particles: "bubbles", verb: "surges into a new form" },
  Verdant: { title: "WORLDROOT BLOOM", aura: "from-lime-300 via-emerald-500 to-green-900", ring: "#84cc16", particles: "petals", verb: "blooms into a new form" },
  Volt: { title: "STORMCHARGE EVOLUTION", aura: "from-yellow-300 via-fuchsia-400 to-indigo-700", ring: "#facc15", particles: "sparks", verb: "overcharges into a new form" },
  Stone: { title: "MEGALITH RISE", aura: "from-stone-300 via-amber-700 to-slate-900", ring: "#a16207", particles: "runes", verb: "hardens into a new form" },
  Air: { title: "GALEWING ASCENT", aura: "from-sky-200 via-indigo-400 to-blue-900", ring: "#7dd3fc", particles: "feathers", verb: "soars into a new form" },
  Shadow: { title: "ECLIPSE METAMORPHOSIS", aura: "from-purple-700 via-black to-fuchsia-500", ring: "#7e22ce", particles: "shadows", verb: "vanishes and returns changed" },
  Mystic: { title: "PRISM REVELATION", aura: "from-violet-300 via-fuchsia-500 to-cyan-300", ring: "#c084fc", particles: "stars", verb: "shines into a new form" },
  Ice: { title: "AURORA TRANSFORMATION", aura: "from-cyan-100 via-blue-300 to-violet-300", ring: "#bfdbfe", particles: "snow", verb: "crystallizes into a new form" },
  Light: { title: "DAWN CORONATION", aura: "from-yellow-100 via-orange-300 to-white", ring: "#fde68a", particles: "sunbursts", verb: "is crowned by light" },
  Metal: { title: "FORGEBOUND UPGRADE", aura: "from-slate-300 via-zinc-600 to-cyan-200", ring: "#94a3b8", particles: "gears", verb: "reassembles into a new form" },
  Crystal: { title: "CRYSTAL RESONANCE", aura: "from-cyan-200 via-fuchsia-300 to-white", ring: "#a5f3fc", particles: "prisms", verb: "refracts into a new form" },
  Toxic: { title: "VENOM BLOOM", aura: "from-lime-500 via-purple-700 to-black", ring: "#65a30d", particles: "spores", verb: "mutates into a new form" },
  Spirit: { title: "SOULBOND AWAKENING", aura: "from-indigo-300 via-slate-900 to-fuchsia-400", ring: "#818cf8", particles: "wisps", verb: "answers an ancient spirit" },
  Beast: { title: "PRIMAL BREAKTHROUGH", aura: "from-orange-300 via-yellow-900 to-red-900", ring: "#c2410c", particles: "claws", verb: "roars into a new form" },
  Sound: { title: "RESONANT CHORUS", aura: "from-pink-300 via-indigo-500 to-cyan-300", ring: "#f0abfc", particles: "notes", verb: "echoes into a new form" },
};

const EVOLUTION_SIGNATURES = {
  pyrolynx: { title: "FIRST FLAME BOND", particles: "embers", call: "The forge spark answers your bond." },
  solarynx: { title: "SOLAR MANE CORONATION", particles: "sunbursts", call: "A miniature sun crowns the blazing mane." },
  tidemast: { title: "TIDE GUARDIAN OATH", particles: "bubbles", call: "Moonlit waves gather into loyal armor." },
  leviamast: { title: "LEVIATHAN MOON HOWL", particles: "moons", call: "The tides bow to its night howl." },
  florantler: { title: "GROVE CROWN BLOOM", particles: "petals", call: "Flowers spiral into a living crown." },
  gaianhart: { title: "WORLDROOT MAJESTY", particles: "leaves", call: "Ancient roots name it protector of forests." },
  stormaroo: { title: "TEMPEST KICKSTART", particles: "sparks", call: "Lightning races through every muscle." },
  thundaroo: { title: "DAWN THUNDER KING", particles: "sparks", call: "Morning thunder opens the sky." },
  lunamander: { title: "MOON ORACLE AWAKENING", particles: "moons", call: "Moonlight writes new runes across its skin." },
  eclipsander: { title: "TOTAL ECLIPSE FORM", particles: "shadows", call: "Light disappears, then returns as power." },
  elderboar: { title: "ANCIENT ROOT ARMOR", particles: "runes", call: "Old bark and stone lock around its heart." },
  galegryph: { title: "GRYPHON WIND RITE", particles: "feathers", call: "A spiral of feathers lifts it skyward." },
  granitus: { title: "LIVING MEGALITH RISE", particles: "runes", call: "Buried runes wake under its stone plates." },
  noctyra: { title: "NOCTURNE WING", particles: "shadows", call: "The cave steals the sound of its wings." },
  glaciermaw: { title: "GLACIER JAW FORM", particles: "snow", call: "A winter relic forms in its claws." },
  polarune: { title: "POLAR RUNE SOVEREIGN", particles: "snow", call: "Aurora runes carve a crown of frost." },
  magmole: { title: "MAGMA BURROWER IGNITION", particles: "embers", call: "Molten tunnels open under its paws." },
  calderox: { title: "CALDERA CORE AWAKENING", particles: "embers", call: "A volcano-heart beats beneath its armor." },
  reefserpent: { title: "CORAL SERPENT REEFSONG", particles: "bubbles", call: "Coral scales sing like a hidden reef." },
  duneguard: { title: "DUNE BASTION FORM", particles: "runes", call: "Sandstone locks into fortress armor." },
  thistlefiend: { title: "MIDNIGHT THORN TRICK", particles: "spores", call: "A flower laughs, then becomes a fiend." },
  prismhorn: { title: "PRISM HORN RESONANCE", particles: "prisms", call: "Every color splits through its crystal horn." },
  venomire: { title: "VENOM MIRE CROWN", particles: "spores", call: "Toxic mist blooms into royal venom." },
  phantelope: { title: "SPIRIT STAG MANIFEST", particles: "wisps", call: "A silent herd of spirits bows." },
  auroravulp: { title: "AURORA FOXFIRE", particles: "sunbursts", call: "Northern lights curl into foxfire tails." },
  steelfang: { title: "STEEL FANG ASSEMBLY", particles: "gears", call: "Gears lock into a predator's grin." },
  mechamane: { title: "MECHAMANE OVERDRIVE", particles: "gears", call: "The engine-heart roars like thunder." },
  howlitzer: { title: "SONIC HOWL BREAK", particles: "notes", call: "A howl cracks the air into rhythm." },
  resonark: { title: "RESONARK GRAND CHORUS", particles: "notes", call: "Every cave echoes its name at once." },
  titanursa: { title: "TITAN PAW AWAKENING", particles: "claws", call: "The mountain trembles under its paw." },
  worldursa: { title: "WORLDURSA PRIME ROAR", particles: "claws", call: "A primal roar shakes the horizon." },
  chimegeist: { title: "CHIME SPIRIT AWAKENING", particles: "notes", call: "A bell rings from the spirit world." },
  mantitan: { title: "MANTITAN PLATE SHIFT", particles: "gears", call: "Metal plates fold into battle wings." },
};

function getEvolutionStyle(fromMon, toMon) {
  const target = BESTIARY[toMon?.id] || {};
  const fallback = EVOLUTION_FALLBACKS[target.type] || EVOLUTION_FALLBACKS.Mystic;
  const signature = EVOLUTION_SIGNATURES[toMon?.id] || {};
  const seed = String(toMon?.id || "evolution").split("").reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
  return { ...fallback, ...signature, ring: signature.ring || fallback.ring, aura: signature.aura || fallback.aura, seed, fromName: displayName(fromMon), toName: BESTIARY[toMon?.id]?.name || displayName(toMon), toType: target.type || "Mystic" };
}

const BESTIARY = {
  emberlynx: { name: "Emberlynx", type: "Flame", species: "Ash Cat", cry: "mrrRAH!", stage: 1, evo: { to: "pyrolynx", method: "Reach Lv.8" }, base: [42, 14, 8, 12], skills: ["Cinder Paw", "Guard", "Flare Burst"], capture: 0.38, body: "cat", colors: ["#ff7a3d", "#ffc46b", "#4b1d17"], lore: "A forge kitten whose tail-flame brightens when it trusts its tamer." },
  pyrolynx: { name: "Pyrolynx", type: "Flame", species: "Blaze Panther", cry: "PYR-roar!", stage: 2, evo: { to: "solarynx", method: "Reach Lv.16 + win 2 trainer battles" }, base: [66, 22, 13, 18], skills: ["Cinder Paw", "Flare Burst", "Meteor Claw"], capture: 0.16, body: "cat", colors: ["#ff2f2f", "#ffd166", "#2b0f0f"], lore: "Its mane burns like a royal banner. It protects shrines from cold spirits." },
  solarynx: { name: "Solarynx", type: "Flame", species: "Solar Lion", cry: "SO-LA-ROAR!", stage: 3, base: [98, 34, 22, 25], skills: ["Flare Burst", "Meteor Claw", "Solar Crown"], capture: 0.05, body: "cat", colors: ["#dc2626", "#fef08a", "#451a03"], lore: "A final evolution said to carry a tiny sun inside its chest." },
  aquapup: { name: "Aquapup", type: "Aqua", species: "Tide Hound", cry: "wuu-BUB!", stage: 1, evo: { to: "tidemast", method: "Use Tide Pearl" }, base: [46, 11, 11, 10], skills: ["Bubble Bite", "Guard", "Healing Rain"], capture: 0.4, body: "dog", colors: ["#4dd7ff", "#d7fbff", "#174567"], lore: "A loyal hound that can hear underground rivers." },
  tidemast: { name: "Tidemast", type: "Aqua", species: "Tide Mastiff", cry: "AR-WOOOSH!", stage: 2, evo: { to: "leviamast", method: "Reach Lv.15 at night" }, base: [74, 17, 20, 13], skills: ["Bubble Bite", "Healing Rain", "Tidal Crush"], capture: 0.14, body: "dog", colors: ["#0891b2", "#ecfeff", "#082f49"], lore: "A coastal guardian that raises walls of water around villages." },
  leviamast: { name: "Leviamast", type: "Aqua", species: "Moon Tide Beast", cry: "LE-VIA-WOO!", stage: 3, base: [112, 26, 31, 18], skills: ["Healing Rain", "Tidal Crush", "Prism Nova"], capture: 0.04, body: "dog", colors: ["#0e7490", "#cffafe", "#020617"], lore: "Its howl pulls the tide. It evolves only under night waterlight." },
  leafawn: { name: "Leafawn", type: "Verdant", species: "Grove Deer", cry: "vii-LEAF!", stage: 1, evo: { to: "florantler", method: "Walk 35 steps" }, base: [44, 12, 9, 13], skills: ["Vine Kick", "Guard", "Bloom Heal"], capture: 0.42, body: "deer", colors: ["#83f26b", "#ffe2a8", "#225533"], lore: "Tiny flowers grow around its hooves after every victory." },
  florantler: { name: "Florantler", type: "Verdant", species: "Grove Stag", cry: "FLO-raaan!", stage: 2, evo: { to: "gaianhart", method: "Walk 90 steps + Shrine Key" }, base: [70, 18, 15, 19], skills: ["Vine Kick", "Bloom Heal", "Thorn Wall"], capture: 0.15, body: "deer", colors: ["#22c55e", "#fde68a", "#14532d"], lore: "A forest monarch with flowers growing from its antlers." },
  gaianhart: { name: "Gaianhart", type: "Verdant", species: "Worldroot Stag", cry: "GAIA-HAAART!", stage: 3, base: [106, 27, 25, 28], skills: ["Bloom Heal", "Thorn Wall", "Worldroot Ram"], capture: 0.04, body: "deer", colors: ["#16a34a", "#fef3c7", "#052e16"], lore: "A final evolution whose antlers bloom with miniature forests." },
  voltoroo: { name: "Voltoroo", type: "Volt", species: "Thunder Roo", cry: "kirr-ZAP!", stage: 1, evo: { to: "stormaroo", method: "Reach Lv.9" }, base: [38, 15, 7, 16], skills: ["Jolt Kick", "Guard", "Static Rush"], capture: 0.34, body: "roo", colors: ["#ffe45d", "#f66bff", "#463600"], lore: "It stores lightning in the gem on its chest." },
  stormaroo: { name: "Stormaroo", type: "Volt", species: "Tempest Kicker", cry: "KRAK-kaROO!", stage: 2, evo: { to: "thundaroo", method: "Reach Lv.18 in morning" }, base: [60, 24, 11, 25], skills: ["Jolt Kick", "Static Rush", "Thunder Crown"], capture: 0.13, body: "roo", colors: ["#fde047", "#a78bfa", "#1e1b4b"], lore: "It crosses valleys in one lightning-charged leap." },
  thundaroo: { name: "Thundaroo", type: "Volt", species: "Dawn Thunder King", cry: "THUN-DA-ROO!", stage: 3, base: [88, 35, 17, 36], skills: ["Static Rush", "Thunder Crown", "Prism Nova"], capture: 0.04, body: "roo", colors: ["#facc15", "#f0abfc", "#111827"], lore: "A morning-only evolution that kicks stormclouds open." },
  gloomander: { name: "Gloomander", type: "Mystic", species: "Moon Salamander", cry: "oom-naaa", stage: 1, evo: { to: "lunamander", method: "Use Moon Shard" }, base: [50, 13, 12, 9], skills: ["Moon Tap", "Guard", "Dream Pulse"], capture: 0.26, body: "lizard", colors: ["#b68cff", "#ffe8ff", "#26113f"], lore: "A cave spirit that knows forgotten shrine songs." },
  lunamander: { name: "Lunamander", type: "Mystic", species: "Moon Oracle", cry: "luu-MAAAH", stage: 2, evo: { to: "eclipsander", method: "Reach Lv.17 at night" }, base: [76, 18, 19, 14], skills: ["Moon Tap", "Dream Pulse", "Prism Nova"], capture: 0.12, body: "lizard", colors: ["#8b5cf6", "#fff1ff", "#14051f"], lore: "It reads moonlight like ancient writing." },
  eclipsander: { name: "Eclipsander", type: "Shadow", species: "Eclipse Oracle", cry: "E-CLIPSE!", stage: 3, base: [102, 30, 24, 22], skills: ["Dream Pulse", "Shadow Spiral", "Prism Nova"], capture: 0.04, body: "lizard", colors: ["#4c1d95", "#f5d0fe", "#020617"], lore: "It appears when moonlight and shadow become one." },
  ironboar: { name: "Ironboar", type: "Stone", species: "Moss Boar", cry: "GRUMM!", stage: 1, evo: { to: "elderboar", method: "Reach Lv.10" }, base: [62, 16, 15, 6], skills: ["Root Ram", "Guard", "Thorn Wall"], capture: 0.22, body: "boar", colors: ["#6fd158", "#8b6d4c", "#20351f"], lore: "A forest defender with bark-like armor." },
  elderboar: { name: "Elderboar", type: "Stone", species: "Ancient Root Boar", cry: "BRUUM-ROOO!", stage: 2, base: [94, 24, 25, 8], skills: ["Root Ram", "Thorn Wall", "Boulder Crash"], capture: 0.1, body: "boar", colors: ["#84cc16", "#78350f", "#1c1917"], lore: "Its back carries a miniature forest of sacred roots. It has no further evolution." },
  cloudfinch: { name: "Cloudfinch", type: "Air", species: "Sky Song Bird", cry: "fii-WISH!", stage: 1, evo: { to: "galegryph", method: "Win 3 trainer battles" }, base: [36, 12, 7, 18], skills: ["Gust Peck", "Guard", "Sky Dive"], capture: 0.44, body: "bird", colors: ["#bae6fd", "#ffffff", "#1e3a8a"], lore: "It sings before storms arrive." },
  galegryph: { name: "Galegryph", type: "Air", species: "Wind Gryphon", cry: "GRAA-wind!", stage: 2, base: [64, 22, 12, 27], skills: ["Gust Peck", "Sky Dive", "Cyclone Fang"], capture: 0.11, body: "bird", colors: ["#38bdf8", "#f8fafc", "#312e81"], lore: "A proud sky guardian. It has no further evolution." },
  pebbkit: { name: "Pebblit", type: "Stone", species: "Pebble Kit", cry: "tik-tok!", stage: 1, evo: { to: "granitus", method: "Use Sun Fossil" }, base: [48, 13, 17, 6], skills: ["Pebble Toss", "Guard", "Boulder Crash"], capture: 0.36, body: "boar", colors: ["#d6d3d1", "#a8a29e", "#292524"], lore: "It looks like a tiny boulder until it opens its huge friendly eyes." },
  granitus: { name: "Granitus", type: "Stone", species: "Living Megalith", cry: "GRAAAN!", stage: 2, base: [88, 22, 30, 5], skills: ["Pebble Toss", "Boulder Crash", "Thorn Wall"], capture: 0.08, body: "boar", colors: ["#a8a29e", "#fde68a", "#1c1917"], lore: "Ancient runes glow across its stone plates. It has no further evolution." },
  shadebat: { name: "Shadebat", type: "Shadow", species: "Cave Whisper", cry: "shiiik!", stage: 1, evo: { to: "noctyra", method: "Catch after shrine unlock" }, base: [34, 14, 8, 19], skills: ["Night Nip", "Guard", "Shadow Spiral"], capture: 0.34, body: "bird", colors: ["#581c87", "#d8b4fe", "#020617"], lore: "It steals echoes from caves and releases them as confusing songs." },
  noctyra: { name: "Noctyra", type: "Shadow", species: "Night Wing", cry: "NOX-tyyra!", stage: 2, base: [62, 25, 13, 25], skills: ["Night Nip", "Shadow Spiral", "Dream Pulse"], capture: 0.1, body: "bird", colors: ["#4c1d95", "#f0abfc", "#000000"], lore: "A silent shadow that only appears when the moon is hidden." },
  prismite: { name: "Prismite", type: "Mystic", species: "Prism Sprite", cry: "pri-zing!", stage: 1, base: [44, 16, 16, 16], skills: ["Moon Tap", "Guard", "Prism Nova"], capture: 0.18, body: "lizard", colors: ["#f0abfc", "#a5f3fc", "#312e81"], lore: "A single-stage rare Mythling born from broken Prism dust. It never evolves." },
  dawnhare: { name: "Dawnhare", type: "Air", species: "Sunrise Hare", cry: "hii-hop!", stage: 1, base: [40, 17, 8, 24], skills: ["Gust Peck", "Guard", "Sky Dive"], capture: 0.28, body: "roo", colors: ["#fde68a", "#bae6fd", "#7c2d12"], lore: "Only appears at morning. It races sunbeams and does not evolve." },
  nightmoth: { name: "Nightmoth", type: "Shadow", species: "Velvet Moth", cry: "mothhh", stage: 1, base: [46, 18, 10, 20], skills: ["Night Nip", "Guard", "Shadow Spiral"], capture: 0.25, body: "bird", colors: ["#312e81", "#c4b5fd", "#020617"], lore: "Only appears at night. It scatters dream-dust and does not evolve." },
  happi: { name: "Happi", type: "Sound", species: "Joy Waver", cry: "ha-pi-pi!", stage: 1, evo: { to: "jolli", method: "Reach Lv.10" }, base: [45, 14, 12, 17], skills: ["Happy Hop", "Guard", "Confetti Pop"], capture: 0.31, body: "buddy", colors: ["#f2a443", "#ffd36a", "#7c3f16"], lore: "A tiny joy spirit said to be born whenever a child laughs during a festival. It waves constantly and brightens sad roads." },
  jolli: { name: "Jolli", type: "Sound", species: "Cheer Buddy", cry: "jol-liii!", stage: 2, evo: { to: "jubilume", method: "Reach Lv.20 after winning 3 wild battles" }, base: [73, 24, 19, 29], skills: ["Happy Hop", "Confetti Pop", "Cheer Burst"], capture: 0.11, body: "buddy", colors: ["#ef9f38", "#ffe08c", "#4a2308"], lore: "It performs little dances before battle and scatters glowing joy-ribbons that calm frightened Mythlings." },
  jubilume: { name: "Jubilume", type: "Light", species: "Festival Heart", cry: "JU-bi-LUUME!", stage: 3, base: [108, 39, 31, 41], skills: ["Confetti Pop", "Cheer Burst", "Party Parade"], capture: 0.035, body: "buddy", colors: ["#ffb347", "#fff0a6", "#5b2b10"], lore: "A radiant final evolution whose smile is said to turn entire villages into all-night celebrations. Its body glows like warm lantern paper." },

  frostcub: { name: "Frostcub", type: "Aqua", species: "Snow Cub", cry: "brr-aw!", stage: 1, evo: { to: "glaciermaw", method: "Reach Lv.12 at night" }, base: [46, 15, 12, 9], skills: ["Bubble Bite", "Guard", "Tidal Crush"], capture: 0.33, body: "bear", colors: ["#93c5fd", "#eff6ff", "#1e3a8a"], lore: "A playful cub that freezes puddles with each step. It appears near lakes after sunset." },
  glaciermaw: { name: "Glaciermaw", type: "Aqua", species: "Ice Bear", cry: "GLAWWR!", stage: 2, evo: { to: "polarune", method: "Reach Lv.22 in Frost Hollow" }, base: [88, 28, 24, 12], skills: ["Bubble Bite", "Tidal Crush", "Boulder Crash"], capture: 0.1, body: "bear", colors: ["#60a5fa", "#e0f2fe", "#0f172a"], lore: "Its claws are frozen relics from the first winter of Luminara." },
  cindermole: { name: "Cindermole", type: "Flame", species: "Coal Mole", cry: "murk-fwoom!", stage: 1, evo: { to: "magmole", method: "Use Sun Fossil" }, base: [52, 17, 16, 7], skills: ["Cinder Paw", "Guard", "Boulder Crash"], capture: 0.3, body: "mole", colors: ["#fb923c", "#111827", "#7f1d1d"], lore: "It digs warm tunnels beneath Ash Field and leaves glowing pawprints." },
  magmole: { name: "Magmole", type: "Flame", species: "Lava Burrower", cry: "MAG-MURR!", stage: 2, evo: { to: "calderox", method: "Reach Lv.23 at Ash Field" }, base: [90, 30, 27, 10], skills: ["Flare Burst", "Boulder Crash", "Solar Crown"], capture: 0.09, body: "mole", colors: ["#ef4444", "#f97316", "#1f2937"], lore: "A volcanic guardian that can melt a tunnel through solid stone." },
  spriggeist: { name: "Spriggeist", type: "Verdant", species: "Tiny Forest Ghost", cry: "spri-hee!", stage: 1, base: [39, 14, 11, 18], skills: ["Vine Kick", "Moon Tap", "Bloom Heal"], capture: 0.24, body: "sprite", colors: ["#bbf7d0", "#86efac", "#14532d"], lore: "A rare single-stage Mythling. Children say it is a forest wish that learned to dance." },
  starwhale: { name: "Starwhale", type: "Mystic", species: "Dream Whale", cry: "oooo-WAHL", stage: 1, base: [120, 22, 24, 8], skills: ["Moon Tap", "Healing Rain", "Prism Nova"], capture: 0.04, body: "whale", colors: ["#a78bfa", "#c4b5fd", "#020617"], lore: "A legendary single-stage Mythling that swims through midnight clouds." },

  coralisk: { name: "Coralisk", type: "Aqua", species: "Reef Basilisk", cry: "cor-RAA!", stage: 1, evo: { to: "reefserpent", method: "Reach Lv.14 near Lake Shore" }, base: [50, 18, 13, 13], skills: ["Bubble Bite", "Guard", "Tidal Crush"], capture: 0.27, body: "lizard", colors: ["#22d3ee", "#fb7185", "#0f172a"], lore: "It hides among coral stones and polishes them with its tail." },
  reefserpent: { name: "Reefserpent", type: "Aqua", species: "Coral Serpent", cry: "REEF-SAAA!", stage: 2, base: [86, 29, 20, 22], skills: ["Bubble Bite", "Tidal Crush", "Prism Nova"], capture: 0.08, body: "dragon", colors: ["#06b6d4", "#fda4af", "#082f49"], lore: "Its scales grow like living coral. Sailors follow its glow home." },
  sandillo: { name: "Sandillo", type: "Stone", species: "Dune Armadillo", cry: "drr-roll!", stage: 1, evo: { to: "duneguard", method: "Reach Lv.13" }, base: [54, 15, 20, 8], skills: ["Pebble Toss", "Guard", "Boulder Crash"], capture: 0.31, body: "boar", colors: ["#facc15", "#a16207", "#422006"], lore: "It curls into a wheel and rolls down quarry slopes for fun." },
  duneguard: { name: "Duneguard", type: "Stone", species: "Dune Bastion", cry: "DUNE-GRAH!", stage: 2, base: [96, 26, 34, 9], skills: ["Pebble Toss", "Boulder Crash", "Thorn Wall"], capture: 0.08, body: "boar", colors: ["#eab308", "#fef3c7", "#451a03"], lore: "A fortress-like Mythling that guards forgotten desert gates." },
  mistowl: { name: "Mistowl", type: "Air", species: "Fog Owl", cry: "hoo-mist", stage: 1, base: [42, 16, 12, 25], skills: ["Gust Peck", "Guard", "Cyclone Fang"], capture: 0.22, body: "bird", colors: ["#c7d2fe", "#f8fafc", "#1e1b4b"], lore: "A single-stage owl that appears when morning fog touches Prism Ruins." },
  orchidimp: { name: "Orchidimp", type: "Verdant", species: "Orchid Trickster", cry: "imp-lee!", stage: 1, evo: { to: "thistlefiend", method: "Use Moon Shard" }, base: [41, 18, 10, 20], skills: ["Vine Kick", "Moon Tap", "Bloom Heal"], capture: 0.25, body: "sprite", colors: ["#f9a8d4", "#86efac", "#4a044e"], lore: "It looks like a flower until it laughs and runs away." },
  thistlefiend: { name: "Thistlefiend", type: "Shadow", species: "Thorn Gremlin", cry: "THISS-kik!", stage: 2, base: [78, 31, 16, 29], skills: ["Vine Kick", "Shadow Spiral", "Dream Pulse"], capture: 0.07, body: "sprite", colors: ["#be185d", "#a7f3d0", "#020617"], lore: "A mischievous evolution with moonlit thorns and a dangerous grin." },
  aurorabbit: { name: "Aurorabbit", type: "Mystic", species: "Aurora Rabbit", cry: "aura-hop!", stage: 1, base: [48, 17, 14, 27], skills: ["Moon Tap", "Guard", "Prism Nova"], capture: 0.16, body: "roo", colors: ["#99f6e4", "#f0abfc", "#0f172a"], lore: "A rare single-stage Mythling that appears in Frost Hollow at dawn." },

  lumifox: { name: "Lumifox", type: "Light", species: "Lantern Fox", cry: "lumi-yip!", stage: 1, evo: { to: "auroravulp", method: "Reach Lv.15 in morning" }, base: [43, 18, 12, 24], skills: ["Light Fang", "Guard", "Prism Nova"], capture: 0.22, body: "cat", colors: ["#fde68a", "#fef9c3", "#7c2d12"], lore: "Its tails glow like festival lanterns and guide lost tamers before sunrise." },
  auroravulp: { name: "Auroravulp", type: "Light", species: "Aurora Fox", cry: "AU-rooo!", stage: 2, base: [78, 31, 18, 34], skills: ["Light Fang", "Solar Crown", "Prism Nova"], capture: 0.07, body: "cat", colors: ["#facc15", "#a7f3d0", "#581c87"], lore: "A fox whose fur paints the sky with morning auroras." },
  gearmite: { name: "Gearmite", type: "Metal", species: "Clockwork Beetle", cry: "tik-KLINK!", stage: 1, evo: { to: "steelfang", method: "Reach Lv.14" }, base: [50, 16, 23, 9], skills: ["Metal Bite", "Guard", "Boulder Crash"], capture: 0.28, body: "boar", colors: ["#cbd5e1", "#64748b", "#111827"], lore: "A tiny machine-like Mythling that eats old coins and loose screws." },
  steelfang: { name: "Steelfang", type: "Metal", species: "Iron Saber", cry: "STEEL-RAH!", stage: 2, evo: { to: "mechamane", method: "Reach Lv.23 in Sun Quarry" }, base: [88, 30, 31, 17], skills: ["Metal Bite", "Boulder Crash", "Solar Crown"], capture: 0.08, body: "cat", colors: ["#e5e7eb", "#94a3b8", "#020617"], lore: "Its fangs can bite through cursed chains without leaving a scratch." },
  snowl: { name: "Snowl", type: "Ice", species: "Snowy Owl", cry: "sno-hoo!", stage: 1, evo: { to: "blizzowl", method: "Reach Lv.13 at night" }, base: [42, 15, 14, 24], skills: ["Frost Peck", "Guard", "Sky Dive"], capture: 0.24, body: "bird", colors: ["#eff6ff", "#bfdbfe", "#1e3a8a"], lore: "A quiet owl that leaves snowflake-shaped feathers behind." },
  blizzowl: { name: "Blizzowl", type: "Ice", species: "Blizzard Owl", cry: "BLIZZ-hoo!", stage: 2, base: [76, 28, 22, 34], skills: ["Frost Peck", "Cyclone Fang", "Prism Nova"], capture: 0.07, body: "bird", colors: ["#dbeafe", "#60a5fa", "#0f172a"], lore: "It can turn a battlefield silent by spreading diamond-like frost." },
  crysteel: { name: "Crysteel", type: "Crystal", species: "Shard Cub", cry: "kri-sting!", stage: 1, evo: { to: "prismhorn", method: "Reach Lv.16 in Prism Ruins" }, base: [50, 17, 22, 10], skills: ["Crystal Shard", "Guard", "Prism Nova"], capture: 0.22, body: "bear", colors: ["#a5f3fc", "#f0abfc", "#1e1b4b"], lore: "A crystalline cub born where moonlight touches broken Prism glass." },
  prismhorn: { name: "Prismhorn", type: "Crystal", species: "Prism Rhino", cry: "PRISM-RHOO!", stage: 2, base: [92, 31, 34, 13], skills: ["Crystal Shard", "Boulder Crash", "Prism Nova"], capture: 0.07, body: "boar", colors: ["#67e8f9", "#f5d0fe", "#312e81"], lore: "Its horn refracts attacks into harmless color when it protects its tamer." },
  toxifrog: { name: "Toxifrog", type: "Toxic", species: "Bog Tadpole", cry: "rib-bitzz!", stage: 1, evo: { to: "venomire", method: "Reach Lv.12 at night" }, base: [44, 19, 11, 17], skills: ["Toxic Sting", "Guard", "Bubble Bite"], capture: 0.3, body: "lizard", colors: ["#84cc16", "#a855f7", "#052e16"], lore: "It leaves glowing footprints in marsh mud and laughs at its own bubbles." },
  venomire: { name: "Venomire", type: "Toxic", species: "Bog Baron", cry: "VEN-OOOM!", stage: 2, base: [82, 32, 20, 24], skills: ["Toxic Sting", "Shadow Spiral", "Tidal Crush"], capture: 0.09, body: "lizard", colors: ["#65a30d", "#7e22ce", "#020617"], lore: "A poisonous marsh guardian whose crown is made of living moss." },
  spirikit: { name: "Spirikit", type: "Spirit", species: "Wish Kitten", cry: "mew-oooh", stage: 1, evo: { to: "phantelope", method: "Reach Lv.15 after shrine unlock" }, base: [38, 16, 12, 26], skills: ["Spirit Claw", "Moon Tap", "Guard"], capture: 0.24, body: "cat", colors: ["#c7d2fe", "#a78bfa", "#020617"], lore: "A tiny spirit that appears near old lanterns and follows kind tamers home." },
  phantelope: { name: "Phantelope", type: "Spirit", species: "Dream Antelope", cry: "PHAN-taaa!", stage: 2, base: [72, 28, 18, 36], skills: ["Spirit Claw", "Dream Pulse", "Cyclone Fang"], capture: 0.08, body: "deer", colors: ["#818cf8", "#e0e7ff", "#111827"], lore: "It runs across dreams, leaving silver hoofprints visible only at dawn." },
  neonsquid: { name: "Neonsquid", type: "Volt", species: "Neon Squid", cry: "zwiip-bloop!", stage: 1, base: [52, 21, 13, 21], skills: ["Jolt Kick", "Bubble Bite", "Static Rush"], capture: 0.18, body: "whale", colors: ["#22d3ee", "#f0abfc", "#0f172a"], lore: "A rare basin Mythling whose tentacles blink like city lights under water." },
  ionwyrm: { name: "Ionwyrm", type: "Volt", species: "Ion Dragon", cry: "ION-RAAAY!", stage: 1, base: [78, 33, 18, 30], skills: ["Static Rush", "Thunder Crown", "Prism Nova"], capture: 0.045, body: "dragon", colors: ["#facc15", "#22d3ee", "#111827"], lore: "A single-stage electric dragon said to nest inside thunderclouds above Neon Basin." },

  echopup: { name: "Echopup", type: "Sound", species: "Echo Pup", cry: "yip-yip-yaa!", stage: 1, evo: { to: "howlitzer", method: "Reach Lv.13 in Echo Caves" }, base: [44, 17, 11, 21], skills: ["Echo Pulse", "Guard", "Sonic Roar"], capture: 0.28, body: "dog", colors: ["#f9a8d4", "#c4b5fd", "#1e1b4b"], lore: "A playful pup whose bark bounces through caves as colored rings." },
  howlitzer: { name: "Howlitzer", type: "Sound", species: "Resonance Wolf", cry: "HOWWW-LITZ!", stage: 2, evo: { to: "resonark", method: "Reach Lv.24 in Echo Caves" }, base: [82, 31, 18, 32], skills: ["Echo Pulse", "Sonic Roar", "Spirit Claw"], capture: 0.08, body: "dog", colors: ["#f0abfc", "#818cf8", "#111827"], lore: "Its howl can shatter cursed glass and wake sleeping ruins." },
  cuboulder: { name: "Cuboulder", type: "Beast", species: "Stone Cub", cry: "cub-grr!", stage: 1, evo: { to: "titanursa", method: "Reach Lv.17 at Titan Pass" }, base: [64, 19, 19, 7], skills: ["Fang Rush", "Guard", "Boulder Crash"], capture: 0.24, body: "bear", colors: ["#d97706", "#fde68a", "#292524"], lore: "It looks cuddly until it rolls downhill like a living boulder." },
  titanursa: { name: "Titanursa", type: "Beast", species: "Mountain Titan Bear", cry: "TITAN-RAWR!", stage: 2, evo: { to: "worldursa", method: "Reach Lv.26 at Titan Pass" }, base: [118, 36, 33, 12], skills: ["Fang Rush", "Terra Howl", "Boulder Crash"], capture: 0.05, body: "bear", colors: ["#92400e", "#fbbf24", "#1c1917"], lore: "A colossal bear that sleeps standing up while guarding mountain passes." },
  bellimp: { name: "Bellimp", type: "Sound", species: "Bell Trickster", cry: "ding-imp!", stage: 1, evo: { to: "chimegeist", method: "Use Moon Shard at evening" }, base: [40, 16, 12, 25], skills: ["Echo Pulse", "Moon Tap", "Guard"], capture: 0.26, body: "sprite", colors: ["#fef3c7", "#f9a8d4", "#581c87"], lore: "A tiny spirit that rings invisible bells to confuse travelers." },
  chimegeist: { name: "Chimegeist", type: "Spirit", species: "Haunted Chime", cry: "CHIIIME!", stage: 2, base: [76, 29, 18, 31], skills: ["Echo Pulse", "Spirit Claw", "Dream Pulse"], capture: 0.07, body: "sprite", colors: ["#c4b5fd", "#fde68a", "#020617"], lore: "Its chimes are said to count down the seconds before a shrine opens." },
  ferroach: { name: "Ferroach", type: "Metal", species: "Iron Roach", cry: "krik-klink!", stage: 1, evo: { to: "mantitan", method: "Reach Lv.15" }, base: [47, 18, 24, 14], skills: ["Metal Bite", "Guard", "Toxic Sting"], capture: 0.25, body: "boar", colors: ["#cbd5e1", "#71717a", "#18181b"], lore: "A hard-shelled scavenger that cleans up ancient machinery." },
  mantitan: { name: "Mantitan", type: "Metal", species: "Titan Mantis", cry: "MAN-TI-TAN!", stage: 2, base: [86, 34, 28, 26], skills: ["Metal Bite", "Crystal Shard", "Fang Rush"], capture: 0.07, body: "bird", colors: ["#e5e7eb", "#22d3ee", "#0f172a"], lore: "Its bladed arms ring like swords when it moves." },
  polarune: { name: "Polarune", type: "Ice", species: "Rune Polar King", cry: "PO-LA-RUUUNE!", stage: 3, base: [126, 39, 36, 20], skills: ["Frost Peck", "Tidal Crush", "Aurora Verdict"], capture: 0.035, body: "bear", colors: ["#dbeafe", "#93c5fd", "#1e1b4b"], lore: "A third-stage Frost Hollow ruler whose rune-marked fur glows in blizzards." },
  calderox: { name: "Calderox", type: "Flame", species: "Volcanic Mole Titan", cry: "CAL-DE-ROX!", stage: 3, base: [122, 42, 38, 14], skills: ["Flare Burst", "Boulder Crash", "Magma Crown"], capture: 0.035, body: "mole", colors: ["#dc2626", "#fb923c", "#111827"], lore: "Its burrows become rivers of molten stone beneath Ash Field." },
  resonark: { name: "Resonark", type: "Sound", species: "Cathedral Wolf", cry: "REZ-O-NAAAARK!", stage: 3, base: [110, 39, 26, 42], skills: ["Echo Pulse", "Sonic Roar", "Cathedral Howl"], capture: 0.035, body: "dog", colors: ["#f0abfc", "#c4b5fd", "#020617"], lore: "A third-stage echo wolf whose howl turns caves into glowing cathedrals." },
  worldursa: { name: "Worldursa", type: "Beast", species: "Continental Bear", cry: "WORLD-URSA!", stage: 3, base: [148, 45, 44, 15], skills: ["Fang Rush", "Terra Howl", "Continental Slam"], capture: 0.025, body: "bear", colors: ["#78350f", "#fbbf24", "#0c0a09"], lore: "A mountain-sized guardian said to carry the weight of Titan Pass on its shoulders." },
  mechamane: { name: "Mechamane", type: "Metal", species: "Clockwork Lion", cry: "MECHA-RAAA!", stage: 3, base: [112, 42, 42, 27], skills: ["Metal Bite", "Crystal Shard", "Gear Eclipse"], capture: 0.035, body: "cat", colors: ["#e5e7eb", "#38bdf8", "#020617"], lore: "A polished metal lion whose mane ticks like a thousand ancient clocks." },

  nebcalf: { name: "Nebcalf", type: "Crystal", species: "Nebula Calf", cry: "neb-lii!", stage: 1, evo: { to: "starhorn", method: "Reach Lv.22 in Prism Ruins" }, base: [50, 21, 17, 30], skills: ["Crystal Shard", "Moon Tap", "Prism Nova"], capture: 0.14, body: "deer", colors: ["#a5f3fc", "#f0abfc", "#111827"], lore: "Its spots drift like little galaxies when it runs through broken Prism light." },
  starhorn: { name: "Starhorn", type: "Crystal", species: "Astral Stag", cry: "STAR-HOOORN!", stage: 2, evo: { to: "cosmohart", method: "Reach Lv.36 after seeing 35 Mythlings" }, base: [96, 38, 29, 45], skills: ["Crystal Shard", "Prism Nova", "Worldroot Ram"], capture: 0.045, body: "deer", colors: ["#67e8f9", "#f5d0fe", "#020617"], lore: "Its antlers are star maps. Old tamers say it can point toward lost dungeons." },
  cosmohart: { name: "Cosmohart", type: "Crystal", species: "Cosmic World Stag", cry: "COS-MO-HART!", stage: 3, base: [132, 52, 39, 58], skills: ["Chrono Fracture", "Prism Nova", "Worldroot Ram"], capture: 0.018, body: "deer", colors: ["#22d3ee", "#f0abfc", "#020617"], lore: "A rare third-stage cosmic guardian that carries a moving constellation in its chest." },
  emberimp: { name: "Emberimp", type: "Flame", species: "Coal Imp", cry: "imp-fizz!", stage: 1, evo: { to: "cinderjester", method: "Reach Lv.20 at Ember Roost" }, base: [42, 24, 10, 34], skills: ["Ember Hex", "Cinder Paw", "Mind Fog"], capture: 0.20, body: "sprite", colors: ["#fb923c", "#facc15", "#3b0764"], lore: "It juggles hot coals and laughs when sparks form tiny masks." },
  cinderjester: { name: "Cinderjester", type: "Flame", species: "Ash Jester", cry: "JES-TER-FWOOM!", stage: 2, base: [82, 42, 20, 48], skills: ["Ember Hex", "Magma Crown", "Dream Pulse"], capture: 0.055, body: "sprite", colors: ["#dc2626", "#facc15", "#111827"], lore: "A theatrical Flame Mythling whose burning masks confuse stronger foes." },
  kelpup: { name: "Kelpup", type: "Aqua", species: "Kelp Puppy", cry: "kelp-yip!", stage: 1, evo: { to: "marinoodle", method: "Reach Lv.18 at Tideglass Flats" }, base: [48, 18, 15, 28], skills: ["Bubble Bite", "Healing Rain", "Fang Rush"], capture: 0.25, body: "dog", colors: ["#38bdf8", "#86efac", "#064e3b"], lore: "A cheerful puppy covered in kelp ribbons that smell like fresh rain." },
  marinoodle: { name: "Marinoodle", type: "Aqua", species: "Sea Ribbon Hound", cry: "MARIN-WOO!", stage: 2, base: [88, 35, 27, 42], skills: ["Tidal Crush", "Healing Rain", "Fang Rush"], capture: 0.07, body: "dog", colors: ["#0ea5e9", "#99f6e4", "#082f49"], lore: "Its ribbon-like mane bends currents and wraps allies in healing water." },

  auroracalf: { name: "Auroracalf", type: "Ice", species: "Aurora Calf", cry: "au-roo!", stage: 1, evo: { to: "aurorox", method: "Reach Lv.24 in Frostglass Peaks" }, base: [54, 22, 20, 28], skills: ["Frost Peck", "Crystal Shard", "Aurora Verdict"], capture: 0.18, body: "deer", colors: ["#bae6fd", "#f0f9ff", "#312e81"], lore: "Its horns glow in soft colors when snow begins to fall." },
  aurorox: { name: "Aurorox", type: "Ice", species: "Aurora Ox", cry: "AU-RO-ROX!", stage: 2, evo: { to: "glacimarch", method: "Reach Lv.38 after Aurora Lens" }, base: [102, 39, 38, 32], skills: ["Frost Lock", "Aurora Verdict", "Worldroot Ram"], capture: 0.06, body: "deer", colors: ["#7dd3fc", "#e0f2fe", "#111827"], lore: "A proud mountain beast whose breath paints auroras across cave ceilings." },
  glacimarch: { name: "Glacimarch", type: "Ice", species: "Glacier Monarch", cry: "GLA-CI-MARCH!", stage: 3, base: [142, 55, 52, 40], skills: ["Aurora Verdict", "Frost Lock", "Worldroot Ram"], capture: 0.018, body: "deer", colors: ["#38bdf8", "#f8fafc", "#020617"], lore: "A rare monarch said to walk at the front of ancient glaciers." },
  sirenfin: { name: "Sirenfin", type: "Aqua", species: "Siren Fin", cry: "sii-ren!", stage: 1, evo: { to: "melodray", method: "Reach Lv.26 at Tideglass Flats" }, base: [46, 24, 14, 36], skills: ["Bubble Bite", "Siren Current", "Healing Rain"], capture: 0.20, body: "whale", colors: ["#67e8f9", "#f0fdfa", "#0f172a"], lore: "It sings over quiet waters to guide lost boats back to shore." },
  melodray: { name: "Melodray", type: "Sound", species: "Melody Ray", cry: "ME-LO-DRAY!", stage: 2, base: [92, 43, 25, 49], skills: ["Siren Current", "Prism Nova", "Healing Rain"], capture: 0.055, body: "whale", colors: ["#38bdf8", "#f9a8d4", "#1e1b4b"], lore: "Its wing-fins vibrate like harp strings in moonlit water." },
  drillbug: { name: "Drillbug", type: "Metal", species: "Drill Beetle", cry: "drill-kik!", stage: 1, evo: { to: "cometitan", method: "Reach Lv.28 in Ironrail Yard" }, base: [50, 28, 24, 22], skills: ["Metal Bite", "Comet Drill", "Guard"], capture: 0.17, body: "boar", colors: ["#cbd5e1", "#facc15", "#111827"], lore: "A metal beetle that leaves spiral tunnels in old rail stones." },
  cometitan: { name: "Cometitan", type: "Metal", species: "Comet Drill Titan", cry: "COME-TI-TAN!", stage: 2, base: [116, 55, 48, 30], skills: ["Comet Drill", "Gear Eclipse", "Boulder Crash"], capture: 0.04, body: "boar", colors: ["#94a3b8", "#fde047", "#020617"], lore: "Its drill horn falls like a comet when it charges downhill." },
  miragebud: { name: "Miragebud", type: "Mystic", species: "Mirage Bud", cry: "mira-bloom!", stage: 1, evo: { to: "dreamorchid", method: "Reach Lv.25 in Orchid Court" }, base: [42, 23, 13, 38], skills: ["Moon Tap", "Petal Mirage", "Bloom Heal"], capture: 0.22, body: "sprite", colors: ["#f0abfc", "#fdf2f8", "#4c1d95"], lore: "It bends moonlight into fake flowers that confuse predators." },
  dreamorchid: { name: "Dreamorchid", type: "Mystic", species: "Dream Orchid", cry: "DREAM-ORCHID!", stage: 2, base: [86, 44, 24, 51], skills: ["Petal Mirage", "Dream Pulse", "Lullaby Bell"], capture: 0.055, body: "sprite", colors: ["#d946ef", "#c4b5fd", "#111827"], lore: "A theatrical garden spirit that makes enemies battle their own dreams." },

  goldkit: { name: "Goldkit", type: "Light", species: "Market Kit", cry: "ching-mew!", stage: 1, evo: { to: "aurumane", method: "Reach Lv.23 after visiting Luminous Bazaar" }, base: [48, 24, 16, 40], skills: ["Starlight Pulse", "Bazaar Trick", "Fang Rush"], capture: 0.18, body: "cat", colors: ["#fde68a", "#fef3c7", "#7c2d12"], lore: "A lucky market Mythling whose bell collar rings near hidden treasure." },
  aurumane: { name: "Aurumane", type: "Light", species: "Golden Mane", cry: "AU-RU-MANE!", stage: 2, evo: { to: "solarchon", method: "Reach Lv.40 with 5000 coins" }, base: [92, 45, 30, 55], skills: ["Radiant Lance", "Bazaar Trick", "Solar Crown"], capture: 0.045, body: "cat", colors: ["#facc15", "#fff7ed", "#451a03"], lore: "Its mane shines like minted sunlight. Merchants treat it as a blessing." },
  solarchon: { name: "Solarchon", type: "Light", species: "Solar Archon", cry: "SOL-AR-CHON!", stage: 3, base: [130, 60, 42, 66], skills: ["Radiant Lance", "Solar Crown", "Prism Nova"], capture: 0.015, body: "cat", colors: ["#fbbf24", "#fef9c3", "#020617"], lore: "A regal final evolution that judges false promises by dimming its crown." },
  stormkid: { name: "Stormkid", type: "Sound", species: "Storm Bell Kid", cry: "ding-ZAP!", stage: 1, evo: { to: "thunderchoir", method: "Reach Lv.27 in Stormspire Cliffs" }, base: [44, 26, 14, 44], skills: ["Gust Peck", "Storm Sonata", "Static Rush"], capture: 0.20, body: "sprite", colors: ["#bae6fd", "#fef08a", "#1e1b4b"], lore: "It rings a tiny cloud-bell when it wants thunder to answer." },
  thunderchoir: { name: "Thunderchoir", type: "Sound", species: "Thunder Choir", cry: "THUN-DER-CHOIR!", stage: 2, base: [88, 49, 26, 58], skills: ["Storm Sonata", "Thunder Crown", "Cyclone Fang"], capture: 0.055, body: "bird", colors: ["#7dd3fc", "#facc15", "#111827"], lore: "A many-voiced sky Mythling whose chorus makes lightning fall in rhythm." },
  glasswyrm: { name: "Glasswyrm", type: "Crystal", species: "Glass Wyrm", cry: "gliss-wyrm!", stage: 1, evo: { to: "stormglass", method: "Reach Lv.32 in Stormspire Cliffs" }, base: [58, 32, 24, 34], skills: ["Crystal Shard", "Astral Bloom", "Comet Drill"], capture: 0.10, body: "dragon", colors: ["#a5f3fc", "#f5d0fe", "#111827"], lore: "A transparent wyrm whose bones flash like lightning inside stormglass." },
  stormglass: { name: "Stormglass", type: "Crystal", species: "Stormglass Drake", cry: "STORM-GLASS!", stage: 2, base: [118, 58, 44, 46], skills: ["Stormglass Break", "Astral Bloom", "Thunder Crown"], capture: 0.028, body: "dragon", colors: ["#22d3ee", "#fde68a", "#020617"], lore: "A rare drake that refracts storms into hard crystal thunder." },
  incensemoth: { name: "Incensemoth", type: "Spirit", species: "Incense Moth", cry: "saa-moth!", stage: 1, evo: { to: "censeraph", method: "Reach Lv.30 at night after Shrine Key" }, base: [46, 25, 18, 48], skills: ["Spirit Claw", "Petal Mirage", "Mind Fog"], capture: 0.16, body: "bird", colors: ["#c4b5fd", "#fde68a", "#111827"], lore: "It carries sweet shrine smoke on its wings and appears near forgotten prayers." },
  censeraph: { name: "Censeraph", type: "Spirit", species: "Censer Seraph", cry: "CEN-SE-RAPH!", stage: 2, base: [96, 48, 34, 62], skills: ["Spirit Claw", "Lullaby Bell", "Starlight Pulse"], capture: 0.04, body: "bird", colors: ["#a78bfa", "#fef3c7", "#020617"], lore: "A solemn shrine guardian whose wings ring like bronze censers." },

  runeling: { name: "Runeling", type: "Mystic", species: "Rune Sprite", cry: "roo-nim!", stage: 1, evo: { to: "glyphsage", method: "Reach Lv.24 in Prism Ruins" }, base: [44, 24, 18, 39], skills: ["Moon Tap", "Rune Torrent", "Prism Nova"], capture: 0.16, body: "sprite", colors: ["#c4b5fd", "#67e8f9", "#1e1b4b"], lore: "It writes tiny glowing letters in the air before it speaks." },
  glyphsage: { name: "Glyphsage", type: "Mystic", species: "Ancient Glyph Sage", cry: "GLYPH-SAAAGE!", stage: 2, base: [90, 46, 34, 52], skills: ["Rune Torrent", "Dream Pulse", "Prism Nova"], capture: 0.045, body: "sprite", colors: ["#8b5cf6", "#a5f3fc", "#020617"], lore: "A sage-like Mythling whose cloak is a page torn from the Sky Prism." },
  mossgolem: { name: "Mossgolem", type: "Verdant", species: "Moss Golem", cry: "moss-gom!", stage: 1, evo: { to: "ruingrove", method: "Reach Lv.29 in Verdant Canopy" }, base: [72, 29, 35, 14], skills: ["Root Ram", "Petro Bloom", "Thorn Wall"], capture: 0.12, body: "boar", colors: ["#84cc16", "#a3a3a3", "#14532d"], lore: "A gentle stone giant covered in soft moss and sleeping flowers." },
  ruingrove: { name: "Ruingrove", type: "Verdant", species: "Ruined Grove Titan", cry: "RUIN-GROVE!", stage: 2, base: [130, 52, 62, 22], skills: ["Petro Bloom", "Worldroot Ram", "Boulder Crash"], capture: 0.035, body: "boar", colors: ["#22c55e", "#d6d3d1", "#052e16"], lore: "An ancient garden ruin that stood up to protect the forest." },
  coinwyrm: { name: "Coinwyrm", type: "Light", species: "Coin Wyrm", cry: "coin-rii!", stage: 1, evo: { to: "treasuredrake", method: "Reach Lv.31 with Lucky Prism Tag" }, base: [56, 31, 22, 36], skills: ["Gilded Fang", "Bazaar Trick", "Radiant Lance"], capture: 0.08, body: "dragon", colors: ["#facc15", "#fef3c7", "#451a03"], lore: "A tiny dragon that sleeps on coins and wakes when promises are broken." },
  treasuredrake: { name: "Treasuredrake", type: "Light", species: "Treasure Drake", cry: "TREASURE-DRAKE!", stage: 2, base: [114, 57, 42, 48], skills: ["Gilded Fang", "Radiant Lance", "Stormglass Break"], capture: 0.022, body: "dragon", colors: ["#f59e0b", "#fef9c3", "#020617"], lore: "Its wings are shaped like golden vault doors." },

  shelltide: { name: "Shelltide", type: "Aqua", species: "Tide Turtle", cry: "shel-wum!", stage: 1, evo: { to: "reefguard", method: "Reach Lv.20 at Tideglass Flats" }, base: [58, 17, 28, 12], skills: ["Bubble Bite", "Shell Bastion", "Healing Rain"], capture: 0.22, body: "turtle", colors: ["#38bdf8", "#f0fdfa", "#164e63"], lore: "It sleeps under shallow waves and carries coral seedlings on its shell." },
  reefguard: { name: "Reefguard", type: "Aqua", species: "Coral Bastion", cry: "REEF-GUARD!", stage: 2, evo: { to: "tsunamora", method: "Reach Lv.36 with Tide Pearl" }, base: [96, 32, 52, 18], skills: ["Shell Bastion", "Tidal Crush", "Abyssal Spiral"], capture: 0.07, body: "turtle", colors: ["#0ea5e9", "#a7f3d0", "#082f49"], lore: "A living reef fortress that shelters smaller Mythlings during storms." },
  tsunamora: { name: "Tsunamora", type: "Aqua", species: "Tsunami Monarch", cry: "TSU-NA-MO-RA!", stage: 3, base: [145, 52, 76, 28], skills: ["Tsunami Crown", "Shell Bastion", "Abyssal Spiral"], capture: 0.018, body: "turtle", colors: ["#0284c7", "#ccfbf1", "#020617"], lore: "A royal sea fortress. Its shell bears the map of old ocean kingdoms." },
  kitspark: { name: "Kitspark", type: "Flame", species: "Foxfire Kit", cry: "kii-fwo!", stage: 1, evo: { to: "vulpyr", method: "Reach Lv.18 at evening" }, base: [42, 25, 12, 43], skills: ["Cinder Paw", "Foxfire Veil", "Static Rush"], capture: 0.24, body: "fox", colors: ["#fb923c", "#fef08a", "#3b0764"], lore: "A playful fox that leaves tiny blue flames in the shape of pawprints." },
  vulpyr: { name: "Vulpyr", type: "Flame", species: "Veil Fox", cry: "VUL-PYRR!", stage: 2, evo: { to: "kitsunova", method: "Reach Lv.34 after Prism Ruins" }, base: [80, 45, 24, 62], skills: ["Foxfire Veil", "Flare Burst", "Dream Pulse"], capture: 0.065, body: "fox", colors: ["#f97316", "#c084fc", "#111827"], lore: "Its nine illusion-flames show futures that may or may not happen." },
  kitsunova: { name: "Kitsunova", type: "Mystic", species: "Nova Kitsune", cry: "KIT-SU-NO-VA!", stage: 3, base: [118, 64, 38, 82], skills: ["Foxfire Veil", "Prism Nova", "Radiant Lance"], capture: 0.02, body: "fox", colors: ["#c084fc", "#fef3c7", "#020617"], lore: "A star-tailed fox whose flames shine like drifting constellations." },
  abyssnake: { name: "Abyssnake", type: "Aqua", species: "Abyss Serpent", cry: "abysss...", stage: 1, evo: { to: "leviacoil", method: "Reach Lv.28 at night in Sunken Archive" }, base: [54, 29, 18, 37], skills: ["Bubble Bite", "Abyssal Spiral", "Night Nip"], capture: 0.12, body: "serpent", colors: ["#0f172a", "#38bdf8", "#581c87"], lore: "Only its glowing fins are visible in deep flooded halls." },
  leviacoil: { name: "Leviacoil", type: "Aqua", species: "Abyssal Coil", cry: "LE-VIA-COIL!", stage: 2, base: [112, 58, 36, 55], skills: ["Abyssal Spiral", "Tsunami Crown", "Shadow Spiral"], capture: 0.035, body: "serpent", colors: ["#082f49", "#67e8f9", "#020617"], lore: "It coils around sunken towers and listens to lost bells beneath the sea." },
  glintcrab: { name: "Glintcrab", type: "Crystal", species: "Glint Crab", cry: "klik-glint!", stage: 1, evo: { to: "prismclaw", method: "Reach Lv.24 in Prism Ruins" }, base: [48, 30, 30, 20], skills: ["Crystal Pincer", "Pebble Toss", "Guard"], capture: 0.18, body: "crab", colors: ["#a5f3fc", "#f0abfc", "#312e81"], lore: "Its claws refract sunrise into tiny rainbows across the sand." },
  prismclaw: { name: "Prismclaw", type: "Crystal", species: "Prism Crab", cry: "PRISM-CLAW!", stage: 2, base: [92, 54, 56, 30], skills: ["Crystal Pincer", "Stormglass Break", "Shell Bastion"], capture: 0.045, body: "crab", colors: ["#67e8f9", "#e879f9", "#111827"], lore: "A rare clawed guardian of crystal tidepools." },
  ashchick: { name: "Ashchick", type: "Flame", species: "Ash Chick", cry: "cheep-fsh!", stage: 1, evo: { to: "cinderwing", method: "Reach Lv.19 at Ember Roost" }, base: [40, 22, 10, 46], skills: ["Cinder Paw", "Gust Peck", "Sky Rebirth"], capture: 0.26, body: "phoenix", colors: ["#f97316", "#fde68a", "#7f1d1d"], lore: "A tiny bird born from warm ash after festival fires fade." },
  cinderwing: { name: "Cinderwing", type: "Flame", species: "Cinder Wing", cry: "CIN-DER-WING!", stage: 2, evo: { to: "phoenixar", method: "Reach Lv.38 after Caldera Crown" }, base: [78, 43, 24, 70], skills: ["Flare Burst", "Sky Dive", "Sky Rebirth"], capture: 0.06, body: "phoenix", colors: ["#ef4444", "#fef08a", "#451a03"], lore: "Its wings heal minor burns with glowing feather dust." },
  phoenixar: { name: "Phoenixar", type: "Light", species: "Solar Phoenix", cry: "PHOE-NIX-AR!", stage: 3, base: [122, 62, 42, 88], skills: ["Sky Rebirth", "Radiant Lance", "Solar Crown"], capture: 0.016, body: "phoenix", colors: ["#fbbf24", "#fff7ed", "#7c2d12"], lore: "A rebirth Mythling that turns sunrise into living fire." },

  budbyte: { name: "Budbyte", type: "Verdant", species: "Pixel Bud", cry: "bud-bit!", stage: 1, evo: { to: "florabyte", method: "Reach Lv.21 in Prism Ruins" }, base: [42, 24, 18, 35], skills: ["Vine Kick", "Petal Lance", "Rune Torrent"], capture: 0.20, body: "flower", colors: ["#86efac", "#a5f3fc", "#14532d"], lore: "A tiny flower with crystal pixels shining on each petal." },
  florabyte: { name: "Florabyte", type: "Crystal", species: "Data Bloom", cry: "FLO-RA-BYTE!", stage: 2, evo: { to: "prismbloom", method: "Reach Lv.37 after Prism Ruins" }, base: [82, 45, 34, 54], skills: ["Petal Lance", "Rune Torrent", "Nova Shell"], capture: 0.055, body: "flower", colors: ["#22d3ee", "#f0abfc", "#052e16"], lore: "Its petals arrange into living runes when moonlight touches them." },
  prismbloom: { name: "Prismbloom", type: "Crystal", species: "Prism Garden", cry: "PRISM-BLOOM!", stage: 3, base: [126, 64, 52, 70], skills: ["Petal Lance", "Nova Shell", "Prism Nova"], capture: 0.018, body: "flower", colors: ["#67e8f9", "#fef3c7", "#020617"], lore: "A walking garden of light; every petal reflects a different possible future." },
  wolfrune: { name: "Wolfrune", type: "Sound", species: "Rune Pup", cry: "wo-rune!", stage: 1, evo: { to: "howlglyph", method: "Reach Lv.22 in Echo Caves" }, base: [50, 29, 18, 42], skills: ["Night Nip", "Rune Howl", "Gust Peck"], capture: 0.18, body: "wolf", colors: ["#7dd3fc", "#c4b5fd", "#111827"], lore: "It howls symbols into the air that only old cave walls remember." },
  howlglyph: { name: "Howlglyph", type: "Sound", species: "Glyph Wolf", cry: "HOWL-GLYPH!", stage: 2, evo: { to: "runewarden", method: "Reach Lv.39 after Storm Bell Trial" }, base: [92, 54, 35, 66], skills: ["Rune Howl", "Cyclone Fang", "Storm Sonata"], capture: 0.045, body: "wolf", colors: ["#38bdf8", "#f0abfc", "#020617"], lore: "Its mane becomes a ribbon of floating sound runes in battle." },
  runewarden: { name: "Runewarden", type: "Sound", species: "Rune Warden", cry: "RUNE-WAR-DEN!", stage: 3, base: [138, 74, 54, 84], skills: ["Rune Howl", "Storm Sonata", "Radiant Lance"], capture: 0.014, body: "wolf", colors: ["#0ea5e9", "#fde68a", "#020617"], lore: "A guardian wolf whose howl can seal cracked Prism gates." },

  vaultick: { name: "Vaultick", type: "Volt", species: "Key Tick", cry: "tik-zzt!", stage: 1, evo: { to: "lockroach", method: "Open 4 treasure chests" }, base: [38, 24, 20, 48], skills: ["Jolt Kick", "Vault Spark", "Guard"], capture: 0.19, body: "mole", colors: ["#facc15", "#fde68a", "#1f2937"], lore: "A tiny clockwork bug found inside treasure locks. It evolves only after hearing enough old locks open." },
  lockroach: { name: "Lockroach", type: "Metal", species: "Vault Roach", cry: "LOCK-ROACH!", stage: 2, evo: { to: "vaultitan", method: "Use Lucky Prism Tag after opening 8 chests" }, base: [78, 44, 48, 58], skills: ["Vault Spark", "Crystal Pincer", "Shell Bastion"], capture: 0.055, body: "crab", colors: ["#f59e0b", "#a1a1aa", "#111827"], lore: "It carries a lock-shaped shield and refuses to battle dishonest tamers." },
  vaultitan: { name: "Vaultitan", type: "Metal", species: "Living Vault", cry: "VAULT-TI-TAN!", stage: 3, base: [136, 68, 88, 42], skills: ["Vault Spark", "Relic Break", "Shell Bastion"], capture: 0.012, body: "boar", colors: ["#fbbf24", "#71717a", "#020617"], lore: "A walking treasure fortress. Its heart is a golden lock nobody has opened." },
  balletfin: { name: "Balletfin", type: "Aqua", species: "Dancer Fin", cry: "bala-fin!", stage: 1, evo: { to: "swanlume", method: "Win 3 battles without taking damage" }, base: [46, 20, 18, 52], skills: ["Bubble Bite", "Dawn Waltz", "Gust Peck"], capture: 0.20, body: "bird", colors: ["#bfdbfe", "#fef3c7", "#0e7490"], lore: "It dances on lake surfaces and refuses to splash." },
  swanlume: { name: "Swanlume", type: "Light", species: "Luminous Swan", cry: "SWAN-LUME!", stage: 2, evo: { to: "auroradiva", method: "Reach Lv.35 in morning with Shiny Feather" }, base: [86, 42, 34, 76], skills: ["Dawn Waltz", "Sky Dive", "Radiant Lance"], capture: 0.045, body: "phoenix", colors: ["#e0f2fe", "#fef08a", "#312e81"], lore: "Its feathers glow brighter when a battle is won with perfect grace." },
  auroradiva: { name: "Auroradiva", type: "Light", species: "Aurora Diva", cry: "AU-RO-RA-DI-VA!", stage: 3, base: [124, 62, 48, 102], skills: ["Dawn Waltz", "Radiant Lance", "Aurora Verdict"], capture: 0.014, body: "phoenix", colors: ["#fef3c7", "#93c5fd", "#020617"], lore: "A stage-star Mythling said to perform only when the morning sky applauds." },
  horncalf: { name: "Horncalf", type: "Stone", species: "Relic Calf", cry: "reli-moo!", stage: 1, evo: { to: "reliceros", method: "Revive from Ancient Horn Fossil" }, base: [60, 30, 30, 18], skills: ["Root Ram", "Pebble Toss", "Guard"], capture: 0.10, body: "deer", colors: ["#a8a29e", "#fef3c7", "#292524"], lore: "A fossil-revived calf with old temple patterns on its horns." },
  reliceros: { name: "Reliceros", type: "Stone", species: "Relic Rhino", cry: "RELIC-ROO!", stage: 2, evo: { to: "templehorn", method: "Reach Lv.42 after Titan Pass" }, base: [112, 62, 70, 28], skills: ["Relic Break", "Boulder Crash", "Shell Bastion"], capture: 0.025, body: "boar", colors: ["#78716c", "#fde68a", "#1c1917"], lore: "Its horn can open stone doors that were sealed before Luminara had roads." },
  templehorn: { name: "Templehorn", type: "Stone", species: "Ancient Temple Horn", cry: "TEM-PLE-HORN!", stage: 3, base: [160, 86, 102, 36], skills: ["Relic Break", "Worldroot Ram", "Shell Bastion"], capture: 0.008, body: "boar", colors: ["#57534e", "#facc15", "#020617"], lore: "A sacred beast that carries a ruined temple across its back." },

  pufflora: { name: "Pufflora", type: "Verdant", species: "Pollen Puff", cry: "puff-flo!", stage: 1, evo: { to: "drowsibloom", method: "Trigger Sleep on 6 wild Mythlings" }, base: [44, 18, 18, 34], skills: ["Vine Kick", "Spore Kiss", "Bloom Heal"], capture: 0.22, body: "flower", colors: ["#bbf7d0", "#fbcfe8", "#14532d"], lore: "Its cottony petals make tired travelers dream of safe roads." },
  drowsibloom: { name: "Drowsibloom", type: "Verdant", species: "Dream Bloom", cry: "DROW-SI-BLOOM!", stage: 2, evo: { to: "somniflora", method: "Reach Lv.36 while holding Dream Pollen" }, base: [88, 36, 34, 50], skills: ["Spore Kiss", "Petal Lance", "Dream Pulse"], capture: 0.055, body: "flower", colors: ["#86efac", "#f0abfc", "#052e16"], lore: "A sleep-bloom whose scent changes based on the dream it senses." },
  somniflora: { name: "Somniflora", type: "Mystic", species: "Dream Garden", cry: "SOM-NI-FLO-RA!", stage: 3, base: [130, 58, 56, 72], skills: ["Spore Kiss", "Dream Pulse", "Prism Nova"], capture: 0.014, body: "flower", colors: ["#c084fc", "#fef3c7", "#020617"], lore: "A royal dream flower that opens only during moonlit victories." },
  stardeer: { name: "Stardeer", type: "Cosmic", species: "Star Fawn", cry: "star-ree!", stage: 1, evo: { to: "cometstag", method: "Level up under a Meteor Shower event" }, base: [50, 30, 18, 52], skills: ["Gust Peck", "Meteor Antler", "Guard"], capture: 0.08, body: "deer", colors: ["#a5b4fc", "#fef3c7", "#020617"], lore: "A rare fawn that appears on tiles after a meteor glint animation." },
  cometstag: { name: "Cometstag", type: "Cosmic", species: "Comet Stag", cry: "COMET-STAG!", stage: 2, evo: { to: "stellarch", method: "Win a boss battle with Stardeer line active" }, base: [96, 62, 38, 78], skills: ["Meteor Antler", "Radiant Lance", "Prism Nova"], capture: 0.025, body: "deer", colors: ["#818cf8", "#fde68a", "#111827"], lore: "Its antlers burn with blue comet trails whenever a boss appears." },
  stellarch: { name: "Stellarch", type: "Cosmic", species: "Star Monarch", cry: "STEL-LARCH!", stage: 3, base: [140, 86, 60, 104], skills: ["Meteor Antler", "Aurora Verdict", "Prism Nova"], capture: 0.006, body: "deer", colors: ["#4f46e5", "#fef9c3", "#020617"], lore: "An almost legendary monarch of star roads, obtained only through boss-victory rites." },
  inklot: { name: "Inklot", type: "Shadow", species: "Ink Blob", cry: "blop-ink!", stage: 1, evo: { to: "eclipsquid", method: "Catch during night in Sunken Archive" }, base: [42, 25, 14, 39], skills: ["Night Nip", "Ink Eclipse", "Guard"], capture: 0.18, body: "slime", colors: ["#111827", "#a78bfa", "#020617"], lore: "It leaves ink constellations on flooded archive walls." },
  eclipsquid: { name: "Eclipsquid", type: "Shadow", species: "Eclipse Squid", cry: "E-CLIP-SQUID!", stage: 2, base: [92, 58, 34, 68], skills: ["Ink Eclipse", "Abyssal Spiral", "Shadow Spiral"], capture: 0.035, body: "squid", colors: ["#020617", "#c084fc", "#0f172a"], lore: "It swims through shadows and makes moonlight ripple like water." },
  candypup: { name: "Candypup", type: "Beast", species: "Candy Pup", cry: "yip-pop!", stage: 1, evo: { to: "caramutt", method: "Feed 5 Sweet Herbs" }, base: [48, 28, 18, 46], skills: ["Fang Rush", "Sugar Rush", "Guard"], capture: 0.24, body: "wolf", colors: ["#f9a8d4", "#fde68a", "#7c2d12"], lore: "A cheerful pup found near special shops and festival stalls." },
  caramutt: { name: "Caramutt", type: "Beast", species: "Caramel Hound", cry: "CARA-MUTT!", stage: 2, base: [94, 58, 38, 72], skills: ["Sugar Rush", "Fang Rush", "Rune Howl"], capture: 0.06, body: "wolf", colors: ["#fb7185", "#fbbf24", "#451a03"], lore: "Its caramel mane hardens into armor when it protects a smaller Mythling." },

  ticktad: { name: "Ticktad", type: "Crystal", species: "Clock Tadpole", cry: "tik-tad!", stage: 1, evo: { to: "chronofrog", method: "Level up exactly at 12:00 or 00:00" }, base: [46, 24, 20, 42], skills: ["Bubble Bite", "Clockbite", "Guard"], capture: 0.19, body: "frog", colors: ["#67e8f9", "#fde68a", "#0f172a"], lore: "A tiny timekeeping tadpole that jumps one second before rain starts." },
  chronofrog: { name: "Chronofrog", type: "Crystal", species: "Clock Frog", cry: "CHRO-NO-FROG!", stage: 2, evo: { to: "hourglassor", method: "Win a trainer battle after 100 total turns" }, base: [92, 54, 44, 62], skills: ["Clockbite", "Chrono Fracture", "Abyssal Spiral"], capture: 0.045, body: "frog", colors: ["#22d3ee", "#facc15", "#111827"], lore: "It croaks in clock ticks and can feel a battle ending before it begins." },
  hourglassor: { name: "Hourglassor", type: "Crystal", species: "Hourglass Oracle", cry: "HOUR-GLASS-OR!", stage: 3, base: [132, 76, 66, 86], skills: ["Clockbite", "Chrono Fracture", "Prism Nova"], capture: 0.012, body: "frog", colors: ["#06b6d4", "#fef3c7", "#020617"], lore: "An oracle frog whose back carries a floating hourglass." },
  lanternimp: { name: "Lanternimp", type: "Light", species: "Lantern Imp", cry: "lan-lan!", stage: 1, evo: { to: "glowgremlin", method: "Catch at night while carrying 3 Glow Herbs" }, base: [40, 22, 15, 48], skills: ["Light Fang", "Lantern Lure", "Gilded Fang"], capture: 0.2, body: "slime", colors: ["#fde68a", "#f0abfc", "#451a03"], lore: "It hides inside roadside lanterns and giggles when travelers take the wrong path." },
  glowgremlin: { name: "Glowgremlin", type: "Light", species: "Glow Gremlin", cry: "GLOW-GREM!", stage: 2, base: [82, 49, 32, 78], skills: ["Lantern Lure", "Radiant Lance", "Vault Spark"], capture: 0.05, body: "goblin", colors: ["#facc15", "#c084fc", "#1e1b4b"], lore: "A mischievous light thief that powers up when a dungeon torch is lit." },
  mudmunch: { name: "Mudmunch", type: "Stone", species: "Mud Muncher", cry: "mud-munch!", stage: 1, evo: { to: "bogjaw", method: "Take 80 steps in Spirit Marsh" }, base: [58, 28, 32, 15], skills: ["Pebble Toss", "Mudslide Roll", "Toxic Sting"], capture: 0.23, body: "boar", colors: ["#78716c", "#a3e635", "#292524"], lore: "It eats mud to polish the small stones on its back." },
  bogjaw: { name: "Bogjaw", type: "Toxic", species: "Bog Jaw", cry: "BOG-JAW!", stage: 2, base: [108, 56, 64, 26], skills: ["Mudslide Roll", "Toxic Sting", "Venom Mire"], capture: 0.045, body: "boar", colors: ["#3f6212", "#a3e635", "#1c1917"], lore: "A marsh brute whose tusks drip mineral-rich poison." },

  solguard: { name: "Solguard", type: "Light", species: "Legendary Sun Sentinel", cry: "SOOOOL-GUAAARD!", stage: 1, legendary: true, base: [150, 48, 40, 34], skills: ["Dawn Judgment", "Solar Crown", "Light Fang"], capture: 0.018, body: "dragon", colors: ["#facc15", "#fef3c7", "#7c2d12"], lore: "A legendary sentinel sealed beneath the Sunken Sun Catacombs. It answers only at morning after the Prism is restored." },
  umbraclaw: { name: "Umbraclaw", type: "Shadow", species: "Legendary Eclipse Beast", cry: "UM-BRAAA-CLAW!", stage: 1, legendary: true, base: [142, 53, 32, 41], skills: ["Eclipse Rend", "Shadow Spiral", "Night Nip"], capture: 0.014, body: "cat", colors: ["#111827", "#a855f7", "#000000"], lore: "A predatory legend chained in the Nocturne Catacombs. Its claws cut through moonlight." },
  thalassor: { name: "Thalassor", type: "Aqua", species: "Legendary Abyss Whale", cry: "THA-LAAAS-SOOOR!", stage: 1, legendary: true, base: [178, 42, 43, 18], skills: ["Abyssal Maelstrom", "Tidal Crush", "Healing Rain"], capture: 0.012, body: "whale", colors: ["#0e7490", "#67e8f9", "#020617"], lore: "A legendary abyssal whale sleeping below the Tideglass Grotto. It awakens only when the tide and night align." },
  gaialith: { name: "Gaialith", type: "Verdant", species: "Legendary Worldroot Colossus", cry: "GAIA-LIIIIITH!", stage: 1, legendary: true, base: [166, 45, 52, 12], skills: ["Worldroot Cataclysm", "Thorn Wall", "Bloom Heal"], capture: 0.013, body: "bear", colors: ["#14532d", "#86efac", "#1c1917"], lore: "A primeval legend at the heart of the Verdant Catacombs. Its roots remember the first day of Luminara." },
  chronova: { name: "Chronova", type: "Crystal", species: "Legendary Time Prism", cry: "CHRO-NO-VAAAA!", stage: 1, legendary: true, base: [138, 47, 44, 47], skills: ["Chrono Fracture", "Crystal Shard", "Prism Nova"], capture: 0.01, body: "sprite", colors: ["#a5f3fc", "#f0abfc", "#020617"], lore: "A legendary prism spirit hidden in the Timeglass Labyrinth. It appears only to tamers with a nearly complete Dex." },

  glimmernewt: { name: "Glimmernewt", type: "Light", species: "Glow Newt", cry: "gliim-new!", stage: 1, evo: { to: "radiantoad", method: "Reach Lv.18 near Prism Ruins" }, base: [45, 17, 13, 22], skills: ["Light Fang", "Moon Tap", "Prism Nova"], capture: 0.23, body: "lizard", colors: ["#fef3c7", "#fde68a", "#0f172a"], lore: "Its glowing tail draws safe paths through dark ruins." },
  radiantoad: { name: "Radiantoad", type: "Light", species: "Radiant Toad", cry: "RAA-di-toad!", stage: 2, base: [88, 31, 23, 26], skills: ["Light Fang", "Solar Crown", "Prism Nova"], capture: 0.075, body: "lizard", colors: ["#facc15", "#fef9c3", "#713f12"], lore: "A luminous guardian whose croak scatters shadow spirits." },
  bramblepup: { name: "Bramblepup", type: "Verdant", species: "Bramble Pup", cry: "bram-yip!", stage: 1, evo: { to: "thornwolf", method: "Reach Lv.17 in Beastwood" }, base: [50, 19, 14, 17], skills: ["Vine Kick", "Fang Rush", "Bloom Heal"], capture: 0.27, body: "dog", colors: ["#84cc16", "#fbbf24", "#14532d"], lore: "A loyal pup with thorny fur that protects berry groves." },
  thornwolf: { name: "Thornwolf", type: "Verdant", species: "Thorn Wolf", cry: "THORN-WOO!", stage: 2, base: [92, 34, 25, 28], skills: ["Vine Kick", "Fang Rush", "Worldroot Ram"], capture: 0.08, body: "dog", colors: ["#16a34a", "#fde68a", "#052e16"], lore: "It runs through forests without breaking a single branch." },
  sparkitten: { name: "Sparkitten", type: "Volt", species: "Static Kitten", cry: "mew-zap!", stage: 1, evo: { to: "voltiger", method: "Reach Lv.20 in Neon Basin" }, base: [39, 20, 9, 29], skills: ["Jolt Kick", "Static Rush", "Thunder Snare"], capture: 0.25, body: "cat", colors: ["#fde047", "#38bdf8", "#1e1b4b"], lore: "A playful kitten that makes blankets crackle with static." },
  voltiger: { name: "Voltiger", type: "Volt", species: "Storm Tiger", cry: "VOL-TI-GRAH!", stage: 2, base: [84, 37, 19, 42], skills: ["Static Rush", "Thunder Crown", "Prism Nova"], capture: 0.065, body: "cat", colors: ["#facc15", "#0ea5e9", "#111827"], lore: "A storm-striped hunter whose paws leave sparks on wet stone." },

  miragecalf: { name: "Miragecalf", type: "Mystic", species: "Mirage Calf", cry: "mii-raa!", stage: 1, evo: { to: "miragehart", method: "Reach Lv.19 at Mirage Garden" }, base: [48, 17, 14, 28], skills: ["Mind Fog", "Moon Tap", "Prism Nova"], capture: 0.2, body: "deer", colors: ["#f0abfc", "#a5f3fc", "#312e81"], lore: "It flickers like heat haze and leaves hoofprints that disappear seconds later." },
  miragehart: { name: "Miragehart", type: "Mystic", species: "Mirage Monarch", cry: "MI-RAA-HART!", stage: 2, base: [90, 31, 23, 40], skills: ["Mind Fog", "Dream Pulse", "Prism Nova"], capture: 0.065, body: "deer", colors: ["#c084fc", "#67e8f9", "#1e1b4b"], lore: "Its antlers bend light, making entire gardens look like dream palaces." },
  embercrow: { name: "Embercrow", type: "Flame", species: "Coal Crow", cry: "caw-FWOOM!", stage: 1, evo: { to: "pyreaven", method: "Reach Lv.18 at Ember Roost" }, base: [42, 21, 10, 30], skills: ["Cinder Paw", "Gust Peck", "Ember Hex"], capture: 0.22, body: "bird", colors: ["#ef4444", "#f97316", "#111827"], lore: "A clever firebird that steals shiny ash and hides it in chimney nests." },
  pyreaven: { name: "Pyreaven", type: "Flame", species: "Pyre Raven", cry: "PYRE-CAW!", stage: 2, base: [80, 36, 19, 43], skills: ["Ember Hex", "Sky Dive", "Magma Crown"], capture: 0.07, body: "bird", colors: ["#dc2626", "#facc15", "#020617"], lore: "Its wings scatter glowing feathers that become sparks before touching the ground." },
  tidebug: { name: "Tidebug", type: "Aqua", species: "Shell Bug", cry: "tidi-tik!", stage: 1, evo: { to: "shellsurge", method: "Reach Lv.16 at Tideglass Flats" }, base: [46, 16, 18, 18], skills: ["Bubble Bite", "Metal Bite", "Healing Rain"], capture: 0.26, body: "boar", colors: ["#38bdf8", "#e0f2fe", "#0f172a"], lore: "A tiny shell-backed bug that stores raindrops in its armor." },
  shellsurge: { name: "Shellsurge", type: "Aqua", species: "Surge Shellback", cry: "SHELL-SURGE!", stage: 2, base: [94, 28, 34, 21], skills: ["Bubble Bite", "Tidal Crush", "Metal Bite"], capture: 0.08, body: "boar", colors: ["#0284c7", "#bae6fd", "#082f49"], lore: "Its shell channels wave pressure into a crushing counterattack." },

  relicalf: { name: "Relicalf", type: "Crystal", species: "Relic Calf", cry: "re-lii!", stage: 1, evo: { to: "obelisdeer", method: "Reach Lv.21 in Relic Road" }, base: [54, 19, 20, 20], skills: ["Crystal Shard", "Guard", "Prism Nova"], capture: 0.18, body: "deer", colors: ["#a5f3fc", "#fef3c7", "#312e81"], lore: "A young relic guardian whose hooves reveal buried road stones." },
  obelisdeer: { name: "Obelisdeer", type: "Crystal", species: "Obelisk Stag", cry: "OBE-LIIIS!", stage: 2, base: [104, 36, 36, 28], skills: ["Crystal Shard", "Worldroot Ram", "Prism Nova"], capture: 0.055, body: "deer", colors: ["#67e8f9", "#fde68a", "#1e1b4b"], lore: "Its antlers are living monuments that remember every tamer who passed Relic Road." },
  gloomjaw: { name: "Gloomjaw", type: "Shadow", species: "Bog Croc", cry: "glooom-chomp!", stage: 1, evo: { to: "marshgrave", method: "Reach Lv.22 in Spirit Marsh" }, base: [58, 25, 17, 16], skills: ["Night Nip", "Toxic Sting", "Shadow Spiral"], capture: 0.16, body: "lizard", colors: ["#3b0764", "#84cc16", "#020617"], lore: "It hides in spirit mud and smiles with moonlit teeth." },
  marshgrave: { name: "Marshgrave", type: "Spirit", species: "Grave Marsh King", cry: "MAAARSH-GRAVE!", stage: 2, base: [112, 41, 31, 24], skills: ["Spirit Claw", "Toxic Sting", "Dream Pulse"], capture: 0.045, body: "dragon", colors: ["#111827", "#a3e635", "#6d28d9"], lore: "A haunted marsh monarch whose footsteps sound like distant funeral bells." },
  crystwing: { name: "Crystwing", type: "Crystal", species: "Glass Wing", cry: "krii-shaa!", stage: 1, evo: { to: "vitraquila", method: "Reach Lv.24 in Skybridge" }, base: [46, 22, 14, 38], skills: ["Crystal Shard", "Gust Peck", "Sky Dive"], capture: 0.15, body: "bird", colors: ["#cffafe", "#f0abfc", "#0f172a"], lore: "A fragile-looking bird whose wings cut wind into glittering ribbons." },
  vitraquila: { name: "Vitraquila", type: "Air", species: "Stained-Glass Eagle", cry: "VIT-RAAA!", stage: 2, base: [88, 39, 22, 52], skills: ["Crystal Shard", "Cyclone Fang", "Prism Nova"], capture: 0.045, body: "bird", colors: ["#38bdf8", "#f9a8d4", "#312e81"], lore: "It turns sunlight into blades and guards the bridges between high regions." },

  seedpuff: { name: "Seedpuff", type: "Verdant", species: "Windseed Puff", cry: "puff-lee!", stage: 1, evo: { to: "cottonstag", method: "Reach Lv.12 in Meadowrail" }, base: [40, 13, 10, 22], skills: ["Vine Kick", "Gust Peck", "Bloom Heal"], capture: 0.36, body: "deer", colors: ["#bbf7d0", "#ffffff", "#14532d"], lore: "A drifting seedling that rides the wind between old railflowers." },
  cottonstag: { name: "Cottonstag", type: "Air", species: "Cotton Antler", cry: "COT-ton!", stage: 2, evo: { to: "tempesthart", method: "Reach Lv.25 in Skyrail Meadow" }, base: [70, 22, 16, 34], skills: ["Gust Peck", "Sky Dive", "Bloom Heal"], capture: 0.12, body: "deer", colors: ["#e0f2fe", "#bbf7d0", "#1e3a8a"], lore: "Its antlers scatter cotton clouds that mark safe mountain winds." },
  tempesthart: { name: "Tempesthart", type: "Air", species: "Storm Antler King", cry: "TEM-PEST-HART!", stage: 3, base: [104, 34, 25, 48], skills: ["Sky Dive", "Cyclone Fang", "Worldroot Ram"], capture: 0.035, body: "deer", colors: ["#7dd3fc", "#f8fafc", "#172554"], lore: "A majestic sky-stag that turns storms away from villages." },
  lavaling: { name: "Lavaling", type: "Flame", species: "Lava Whelp", cry: "laa-va!", stage: 1, evo: { to: "basalisk", method: "Reach Lv.18 in Ember Roost" }, base: [52, 22, 14, 16], skills: ["Cinder Paw", "Ember Hex", "Boulder Crash"], capture: 0.24, body: "lizard", colors: ["#fb923c", "#7f1d1d", "#111827"], lore: "A small volcanic lizard that drinks warm stones." },
  basalisk: { name: "Basalisk", type: "Flame", species: "Basalt Basilisk", cry: "BASA-ROAR!", stage: 2, evo: { to: "calderagon", method: "Reach Lv.31 after Bridge Captain" }, base: [92, 36, 28, 24], skills: ["Flare Burst", "Magma Crown", "Boulder Crash"], capture: 0.08, body: "dragon", colors: ["#dc2626", "#fb923c", "#1c1917"], lore: "Its basalt scales glow from cracks when it prepares to charge." },
  calderagon: { name: "Calderagon", type: "Flame", species: "Caldera Dragon", cry: "CAL-DER-A-GON!", stage: 3, base: [130, 50, 38, 32], skills: ["Magma Crown", "Meteor Claw", "Solar Crown"], capture: 0.025, body: "dragon", colors: ["#991b1b", "#facc15", "#020617"], lore: "A caldera-winged dragon that sleeps inside extinct volcanoes." },
  duskshell: { name: "Duskshell", type: "Shadow", species: "Dusk Tortoise", cry: "dusk-tok", stage: 1, evo: { to: "crypturtle", method: "Reach Lv.20 at night" }, base: [66, 17, 30, 8], skills: ["Night Nip", "Guard", "Shadow Spiral"], capture: 0.21, body: "boar", colors: ["#312e81", "#a78bfa", "#020617"], lore: "It carries a tiny graveyard of glowing moss on its shell." },
  crypturtle: { name: "Crypturtle", type: "Spirit", species: "Crypt Guardian", cry: "CRYPT-OOOM!", stage: 2, base: [112, 31, 48, 13], skills: ["Spirit Claw", "Thorn Wall", "Dream Pulse"], capture: 0.06, body: "boar", colors: ["#818cf8", "#d8b4fe", "#111827"], lore: "A patient guardian that remembers every tamer who passed through the old crypts." },
  railkit: { name: "Railkit", type: "Metal", species: "Rail Kitten", cry: "nya-KLINK!", stage: 1, evo: { to: "locopanther", method: "Reach Lv.22 in Ironrail Yard" }, base: [44, 19, 17, 27], skills: ["Metal Bite", "Fang Rush", "Static Rush"], capture: 0.25, body: "cat", colors: ["#cbd5e1", "#38bdf8", "#111827"], lore: "A quick steel kitten that races along abandoned rail lines." },
  locopanther: { name: "Locopanther", type: "Metal", species: "Ironrail Panther", cry: "LOCO-RAH!", stage: 2, base: [86, 36, 29, 42], skills: ["Metal Bite", "Gear Eclipse", "Fang Rush"], capture: 0.065, body: "cat", colors: ["#94a3b8", "#facc15", "#020617"], lore: "Its engine-like purr grows louder when protecting its conductor-tamer." },
  voidpup: { name: "Voidpup", type: "Shadow", species: "Void Pup", cry: "vwoof...", stage: 1, evo: { to: "umbrahound", method: "Reach Lv.24 in Nocturne Road" }, base: [48, 24, 12, 30], skills: ["Night Nip", "Fang Rush", "Mind Fog"], capture: 0.18, body: "dog", colors: ["#111827", "#a855f7", "#000000"], lore: "A pup whose shadow sometimes moves before it does." },
  umbrahound: { name: "Umbrahound", type: "Shadow", species: "Black Star Hound", cry: "UMBRA-HOWL!", stage: 2, base: [90, 42, 22, 45], skills: ["Shadow Spiral", "Fang Rush", "Eclipse Rend"], capture: 0.05, body: "dog", colors: ["#020617", "#7e22ce", "#c4b5fd"], lore: "A loyal hound that hunts monsters born from broken starlight." },

  snowkit: { name: "Snowkit", type: "Ice", species: "Powder Kit", cry: "snii-mew!", stage: 1, evo: { to: "frostlynx", method: "Reach Lv.18 in Frostglass Peaks" }, base: [44, 18, 13, 26], skills: ["Frost Peck", "Fang Rush", "Mind Fog"], capture: 0.28, body: "cat", colors: ["#bfdbfe", "#f8fafc", "#1e3a8a"], lore: "A snow-soft kitten that leaves tiny crystal pawprints behind it." },
  frostlynx: { name: "Frostlynx", type: "Ice", species: "Crystal Lynx", cry: "FROST-LINX!", stage: 2, evo: { to: "glacira", method: "Reach Lv.34 with Full Heal in bag" }, base: [84, 34, 24, 42], skills: ["Frost Lock", "Fang Rush", "Crystal Shard"], capture: 0.09, body: "cat", colors: ["#60a5fa", "#e0f2fe", "#0f172a"], lore: "Its whiskers freeze incoming mist into floating glass needles." },
  glacira: { name: "Glacira", type: "Ice", species: "Aurora Sabre", cry: "GLA-CI-RA!", stage: 3, base: [116, 48, 34, 54], skills: ["Frost Lock", "Aurora Verdict", "Crystal Shard"], capture: 0.028, body: "cat", colors: ["#38bdf8", "#f0f9ff", "#312e81"], lore: "A rare final evolution whose fur shines like aurora over moonlit snow." },
  mossmunk: { name: "Mossmunk", type: "Verdant", species: "Moss Chipmunk", cry: "moss-chip!", stage: 1, evo: { to: "cedarmunk", method: "Reach Lv.14 in Verdant Canopy" }, base: [42, 16, 12, 24], skills: ["Vine Kick", "Bloom Heal", "Thorn Wall"], capture: 0.32, body: "roo", colors: ["#86efac", "#fef3c7", "#14532d"], lore: "It stores healing seeds in its cheeks and shares them with injured Mythlings." },
  cedarmunk: { name: "Cedarmunk", type: "Verdant", species: "Cedar Scout", cry: "CEE-dar!", stage: 2, evo: { to: "forestwarden", method: "Reach Lv.30 after walking 150 steps" }, base: [78, 28, 22, 35], skills: ["Vine Kick", "Thorn Wall", "Worldroot Ram"], capture: 0.1, body: "roo", colors: ["#22c55e", "#fde68a", "#052e16"], lore: "It maps forest paths by placing cedar cones in perfect spiral patterns." },
  forestwarden: { name: "Forestwarden", type: "Verdant", species: "Canopy Guardian", cry: "WARDEN-ROOT!", stage: 3, base: [122, 42, 38, 40], skills: ["Worldroot Ram", "Bloom Heal", "Thorn Wall"], capture: 0.03, body: "deer", colors: ["#15803d", "#fef9c3", "#022c22"], lore: "An ancient canopy guardian that can hear every leaf falling in its forest." },
  orchling: { name: "Orchling", type: "Mystic", species: "Orchid Sprite", cry: "orch-rii!", stage: 1, evo: { to: "orchidiva", method: "Reach Lv.21 in Orchid Court" }, base: [40, 20, 11, 31], skills: ["Moon Tap", "Mind Fog", "Bloom Heal"], capture: 0.24, body: "sprite", colors: ["#f0abfc", "#fce7f3", "#4c1d95"], lore: "A tiny orchid spirit whose dance calms aggressive wild Mythlings." },
  orchidiva: { name: "Orchidiva", type: "Mystic", species: "Orchid Diva", cry: "OR-CHI-DI-VA!", stage: 2, base: [82, 38, 20, 46], skills: ["Dream Pulse", "Lullaby Bell", "Prism Nova"], capture: 0.07, body: "sprite", colors: ["#d946ef", "#fdf2f8", "#581c87"], lore: "Its song bends flower petals into floating musical notes." },

  gemtoad: { name: "Gemtoad", type: "Crystal", species: "Gem Toad", cry: "gem-brooop!", stage: 1, evo: { to: "opaloracle", method: "Reach Lv.26 in Prism Ruins" }, base: [58, 21, 24, 14], skills: ["Crystal Shard", "Guard", "Prism Nova"], capture: 0.16, body: "lizard", colors: ["#67e8f9", "#f0abfc", "#312e81"], lore: "Its back gems glow brighter when it predicts a hidden path." },
  opaloracle: { name: "Opaloracle", type: "Crystal", species: "Opal Oracle", cry: "O-PAL-ORR!", stage: 2, base: [108, 38, 40, 22], skills: ["Crystal Shard", "Prism Nova", "Aurora Verdict"], capture: 0.045, body: "lizard", colors: ["#22d3ee", "#f9a8d4", "#0f172a"], lore: "A revered oracle whose opal crown refracts possible futures." },
  sunwyrm: { name: "Sunwyrm", type: "Light", species: "Solar Wyrm", cry: "suuun-wyr!", stage: 1, evo: { to: "heliodrake", method: "Reach Lv.22 in Caldera Crown" }, base: [50, 25, 14, 24], skills: ["Light Fang", "Royal Flame", "Solar Crown"], capture: 0.12, body: "dragon", colors: ["#fef08a", "#fb923c", "#7c2d12"], lore: "A young solar wyrm that curls around warm prism stones." },
  heliodrake: { name: "Heliodrake", type: "Light", species: "Helio Drake", cry: "HE-LIO-DRAKE!", stage: 2, evo: { to: "apollodrake", method: "Reach Lv.38 after Dracinder" }, base: [90, 42, 26, 34], skills: ["Light Fang", "Solar Crown", "Meteor Claw"], capture: 0.05, body: "dragon", colors: ["#fde047", "#ffedd5", "#9a3412"], lore: "Its wings unfold like stained glass whenever sunlight hits them." },
  apollodrake: { name: "Apollodrake", type: "Light", species: "Apollo Dragon", cry: "APOLLO-ROAR!", stage: 3, base: [126, 58, 39, 46], skills: ["Dawn Judgment", "Solar Crown", "Prism Nova"], capture: 0.018, body: "dragon", colors: ["#facc15", "#fefce8", "#451a03"], lore: "A radiant late-game dragon whose roar makes dawn break early." },
  noircolt: { name: "Noircolt", type: "Shadow", species: "Noir Colt", cry: "noi-HEE!", stage: 1, evo: { to: "umbrasteed", method: "Reach Lv.28 at night" }, base: [54, 27, 15, 35], skills: ["Night Nip", "Fang Rush", "Mind Fog"], capture: 0.14, body: "deer", colors: ["#020617", "#a78bfa", "#4c1d95"], lore: "A swift shadow-colt that only drinks from moonlit puddles." },
  umbrasteed: { name: "Umbrasteed", type: "Shadow", species: "Umbra Steed", cry: "UMBRA-NEIGH!", stage: 2, base: [98, 48, 28, 56], skills: ["Eclipse Rend", "Shadow Spiral", "Fang Rush"], capture: 0.04, body: "deer", colors: ["#000000", "#c4b5fd", "#581c87"], lore: "An elite mount for moon knights, leaving violet sparks with every hoofbeat." },

  rimefin: { name: "Rimefin", type: "Ice", species: "Frost Fin", cry: "riiime-fiiin!", stage: 1, evo: { to: "cryoray", method: "Reach Lv.20 in Frostglass Peaks" }, base: [50, 21, 16, 25], skills: ["Frost Peck", "Bubble Bite", "Crystal Shard"], capture: 0.22, body: "whale", colors: ["#dbeafe", "#67e8f9", "#1e3a8a"], lore: "A floating frost-fish that glides over snowfields as if swimming through air." },
  cryoray: { name: "Cryoray", type: "Ice", species: "Aurora Ray", cry: "CRYO-RAY!", stage: 2, base: [96, 38, 27, 39], skills: ["Frost Lock", "Aurora Verdict", "Prism Nova"], capture: 0.06, body: "whale", colors: ["#93c5fd", "#f0f9ff", "#312e81"], lore: "Its wings shine like an aurora curtain, freezing hostile spells midair." },
  cactimp: { name: "Cactimp", type: "Toxic", species: "Cactus Imp", cry: "cak-tik!", stage: 1, evo: { to: "needlestalk", method: "Reach Lv.18 in Verdant Canopy" }, base: [46, 23, 18, 17], skills: ["Toxic Sting", "Vine Kick", "Thorn Wall"], capture: 0.25, body: "sprite", colors: ["#84cc16", "#facc15", "#3f6212"], lore: "A prickly little prankster that hides among bright flowers and giggles when discovered." },
  needlestalk: { name: "Needlestalk", type: "Toxic", species: "Needle Sentinel", cry: "NEEDLE-STALK!", stage: 2, base: [88, 40, 31, 24], skills: ["Toxic Sting", "Worldroot Ram", "Venom Spray"], capture: 0.07, body: "sprite", colors: ["#65a30d", "#fde047", "#14532d"], lore: "A forest sentinel whose needles bloom only when protecting weaker Mythlings." },
  lanternkid: { name: "Lanternkid", type: "Light", species: "Lantern Child", cry: "lan-lan!", stage: 1, evo: { to: "beaconant", method: "Reach Lv.22 at night with Full Heal in bag" }, base: [42, 19, 15, 31], skills: ["Light Fang", "Lullaby Bell", "Prism Nova"], capture: 0.2, body: "sprite", colors: ["#fef3c7", "#facc15", "#7c2d12"], lore: "A shy lantern spirit that guides lost tamers through stormy midnight roads." },
  beaconant: { name: "Beaconant", type: "Light", species: "Beacon Phantom", cry: "BEE-CO-NANT!", stage: 2, base: [84, 36, 26, 45], skills: ["Light Fang", "Dawn Judgment", "Dream Pulse"], capture: 0.055, body: "sprite", colors: ["#fde68a", "#ffffff", "#581c87"], lore: "A radiant phantom that turns dark roads into golden paths for worthy tamers." },

  dracinder: { name: "Dracinder", type: "Flame", species: "Young Cinder Dragon", cry: "DRAA-cin!", stage: 1, evo: { to: "regaldrake", method: "Finish the main story" }, base: [74, 20, 14, 13], skills: ["Royal Flame", "Guard", "Meteor Claw"], capture: 0.08, body: "dragon", colors: ["#ff453a", "#ffd36a", "#25121a"], lore: "The lost royal Mythling. Its flame can reveal lies and sealed memories." },
  regaldrake: { name: "Regaldrake", type: "Flame", species: "Sky Prism Dragon", cry: "REGAL-DRAY!", stage: 2, base: [108, 32, 22, 20], skills: ["Royal Flame", "Meteor Claw", "Prism Nova"], capture: 0.03, body: "dragon", colors: ["#dc2626", "#fef08a", "#111827"], lore: "The restored royal dragon whose wings reflect every color of the Sky Prism." },
};
const DEX_ORDER = Object.keys(BESTIARY);
const SKILLS = { "Cinder Paw": { power: 18, type: "Flame", text: "A hot claw swipe.", kind: "attack", fx: "slash" }, "Flare Burst": { power: 30, type: "Flame", text: "A flame blast.", kind: "attack", unlock: 3, fx: "blast" }, "Meteor Claw": { power: 43, type: "Flame", text: "A burning claw.", kind: "attack", unlock: 5, fx: "meteor" }, "Solar Crown": { power: 54, type: "Flame", text: "A sun crown attack.", kind: "attack", unlock: 8, fx: "blast" }, "Royal Flame": { power: 30, type: "Flame", text: "A noble flame.", kind: "attack", fx: "blast" }, "Bubble Bite": { power: 17, type: "Aqua", text: "A bubble bite.", kind: "attack", fx: "bubble" }, "Healing Rain": { power: 25, type: "Aqua", text: "Restore HP.", kind: "heal", unlock: 3, fx: "heal" }, "Tidal Crush": { power: 40, type: "Aqua", text: "A crushing wave.", kind: "attack", unlock: 5, fx: "bubble" }, "Vine Kick": { power: 18, type: "Verdant", text: "A leafy kick.", kind: "attack", fx: "slash" }, "Bloom Heal": { power: 23, type: "Verdant", text: "Heal with petals.", kind: "heal", unlock: 3, fx: "heal" }, "Worldroot Ram": { power: 52, type: "Verdant", text: "A sacred root charge.", kind: "attack", unlock: 8, fx: "slam" }, "Jolt Kick": { power: 19, type: "Volt", text: "A shocking kick.", kind: "attack", fx: "zap" }, "Static Rush": { power: 31, type: "Volt", text: "A fast electric rush.", kind: "attack", unlock: 3, fx: "zap" }, "Thunder Crown": { power: 42, type: "Volt", text: "Lightning falls.", kind: "attack", unlock: 5, fx: "zap" }, "Moon Tap": { power: 17, type: "Mystic", text: "A lunar strike.", kind: "attack", fx: "moon" }, "Dream Pulse": { power: 33, type: "Mystic", text: "A dream pulse.", kind: "attack", unlock: 4, fx: "moon" }, "Prism Nova": { power: 48, type: "Mystic", text: "Prism burst.", kind: "attack", unlock: 7, fx: "nova" }, "Root Ram": { power: 21, type: "Stone", text: "A mossy ram.", kind: "attack", fx: "slam" }, "Thorn Wall": { power: 0, type: "Verdant", text: "Guard strongly.", kind: "guard", unlock: 3, fx: "guard" }, "Boulder Crash": { power: 38, type: "Stone", text: "Rock impact.", kind: "attack", unlock: 4, fx: "slam" }, "Pebble Toss": { power: 18, type: "Stone", text: "Stone throw.", kind: "attack", fx: "slam" }, "Gust Peck": { power: 17, type: "Air", text: "Wind peck.", kind: "attack", fx: "wind" }, "Sky Dive": { power: 34, type: "Air", text: "Aerial dive.", kind: "attack", unlock: 4, fx: "wind" }, "Cyclone Fang": { power: 45, type: "Air", text: "Cyclone strike.", kind: "attack", unlock: 6, fx: "wind" }, "Night Nip": { power: 18, type: "Shadow", text: "Dark bite.", kind: "attack", fx: "moon" }, "Light Fang": { power: 24, type: "Light", text: "A shining bite.", kind: "attack", fx: "nova" }, "Metal Bite": { power: 25, type: "Metal", text: "A steel-jawed bite.", kind: "attack", fx: "slam" }, "Frost Peck": { power: 22, type: "Ice", text: "A chilling peck.", kind: "attack", fx: "wind" }, "Shadow Spiral": { power: 36, type: "Shadow", text: "Black mist.", kind: "attack", unlock: 4, fx: "moon" }, "Crystal Shard": { power: 27, type: "Crystal", text: "A glittering shard strike.", kind: "attack", unlock: 2, fx: "nova" }, "Toxic Sting": { power: 26, type: "Toxic", text: "A venomous jab.", kind: "attack", unlock: 2, fx: "slash" }, "Spirit Claw": { power: 28, type: "Spirit", text: "A ghostly claw swipe.", kind: "attack", unlock: 2, fx: "moon", accuracy: 0.94, crit: 0.13 }, "Echo Pulse": { power: 25, type: "Sound", text: "A ringing pulse with high accuracy.", kind: "attack", unlock: 2, fx: "nova", accuracy: 0.98, crit: 0.08 }, "Sonic Roar": { power: 42, type: "Sound", text: "A loud shockwave with higher crit chance.", kind: "attack", unlock: 5, fx: "nova", accuracy: 0.88, crit: 0.18 }, "Fang Rush": { power: 34, type: "Beast", text: "A fierce rushing bite.", kind: "attack", unlock: 3, fx: "slash", accuracy: 0.92, crit: 0.16 }, "Terra Howl": { power: 50, type: "Beast", text: "A mountain-shaking howl.", kind: "attack", unlock: 7, fx: "slam", accuracy: 0.86, crit: 0.12 }, "Clockbite": { power: 48, type: "Crystal", text: "A timed bite that hits harder at night.", kind: "attack", unlock: 6, fx: "nova", accuracy: 0.94, crit: 0.14 }, "Lantern Lure": { power: 0, type: "Light", text: "A glowing lure that may confuse.", kind: "status", unlock: 4, fx: "heal", accuracy: 0.88, status: { name: "confuse", chance: 0.7 } }, "Mudslide Roll": { power: 50, type: "Stone", text: "A rolling mudslide attack.", kind: "attack", unlock: 5, fx: "slam", accuracy: 0.93, crit: 0.09 }, "Spore Kiss": { power: 0, type: "Verdant", text: "A soft pollen kiss that may put the foe to sleep.", kind: "status", unlock: 5, fx: "heal", accuracy: 0.82, status: { name: "sleep", chance: 0.75 } }, "Meteor Antler": { power: 74, type: "Cosmic", text: "A comet-antler charge with high crit.", kind: "attack", unlock: 10, fx: "meteor", accuracy: 0.86, crit: 0.2 }, "Ink Eclipse": { power: 62, type: "Shadow", text: "A dark ink blast that may blind and confuse.", kind: "attack", unlock: 8, fx: "moon", accuracy: 0.9, status: { name: "confuse", chance: 0.2 } }, "Sugar Rush": { power: 46, type: "Beast", text: "A frantic candy-powered strike.", kind: "attack", unlock: 5, fx: "slash", accuracy: 0.96, crit: 0.12 }, "Vault Spark": { power: 55, type: "Volt", text: "A charged strike from treasure vault static.", kind: "attack", unlock: 7, fx: "zap", accuracy: 0.92, status: { name: "paralyzed", chance: 0.16 } }, "Dawn Waltz": { power: 30, type: "Light", text: "A graceful healing dance.", kind: "heal", unlock: 5, fx: "heal" }, "Relic Break": { power: 72, type: "Stone", text: "A forbidden relic smash with lower accuracy.", kind: "attack", unlock: 10, fx: "slam", accuracy: 0.82, crit: 0.18 }, "Aurora Bite": { power: 51, type: "Ice", text: "A cold fang strike that may freeze.", kind: "attack", unlock: 6, fx: "slash", accuracy: 0.9, status: { name: "frozen", chance: 0.12 } }, "Mirage Pounce": { power: 44, type: "Mystic", text: "A deceptive pounce with high crit.", kind: "attack", unlock: 5, fx: "moon", accuracy: 0.96, crit: 0.22 }, "Ember Drill": { power: 48, type: "Flame", text: "A spinning heated horn attack.", kind: "attack", unlock: 6, fx: "meteor", accuracy: 0.93, crit: 0.12 }, "Petal Lance": { power: 58, type: "Verdant", text: "A piercing flower spear with high crit.", kind: "attack", unlock: 8, fx: "slash", accuracy: 0.92, crit: 0.18 }, "Rune Howl": { power: 54, type: "Sound", text: "A rune-charged howl that may confuse.", kind: "attack", unlock: 7, fx: "wind", accuracy: 0.9, status: { name: "confuse", chance: 0.2 } }, "Nova Shell": { power: 68, type: "Crystal", text: "A prismatic shell blast.", kind: "attack", unlock: 10, fx: "nova", accuracy: 0.88, crit: 0.16 }, "Abyssal Spiral": { power: 64, type: "Aqua", text: "A deep whirlpool strike that may confuse.", kind: "attack", unlock: 8, fx: "bubble", accuracy: 0.9, status: { name: "confuse", chance: 0.18 } }, "Shell Bastion": { power: 0, type: "Stone", text: "A fortress shell guard that greatly reduces damage.", kind: "guard", unlock: 4, fx: "guard" }, "Foxfire Veil": { power: 50, type: "Flame", text: "Mystic foxfire that may burn.", kind: "attack", unlock: 6, fx: "moon", accuracy: 0.92, status: { name: "burn", chance: 0.22 } }, "Sky Rebirth": { power: 34, type: "Light", text: "Heal with sunrise feathers.", kind: "heal", unlock: 7, fx: "heal" }, "Crystal Pincer": { power: 46, type: "Crystal", text: "A precise crystal claw snap.", kind: "attack", unlock: 5, fx: "slash", accuracy: 0.95, crit: 0.16 }, "Tsunami Crown": { power: 76, type: "Aqua", text: "A royal wave with huge power.", kind: "attack", unlock: 11, fx: "bubble", accuracy: 0.84, crit: 0.12 }, "Rune Torrent": { power: 57, type: "Mystic", text: "A runic wave that may confuse.", kind: "attack", unlock: 8, fx: "nova", accuracy: 0.91, status: { name: "confuse", chance: 0.2 } }, "Petro Bloom": { power: 53, type: "Verdant", text: "Stone flowers burst from the ground.", kind: "attack", unlock: 7, fx: "slam", accuracy: 0.93, crit: 0.1 }, "Gilded Fang": { power: 49, type: "Light", text: "A golden bite that strikes cleanly.", kind: "attack", unlock: 6, fx: "slash", accuracy: 0.96, crit: 0.14 }, "Radiant Lance": { power: 62, type: "Light", text: "A piercing lance of sunlight with strong accuracy.", kind: "attack", unlock: 8, fx: "nova", accuracy: 0.95, crit: 0.12 }, "Storm Sonata": { power: 60, type: "Sound", text: "A thunderous song that may paralyze.", kind: "attack", unlock: 8, fx: "zap", accuracy: 0.9, status: { name: "paralyzed", chance: 0.2 } }, "Astral Bloom": { power: 56, type: "Crystal", text: "A constellation blossom that may confuse.", kind: "attack", unlock: 8, fx: "nova", accuracy: 0.91, status: { name: "confuse", chance: 0.18 } }, "Bazaar Trick": { power: 42, type: "Mystic", text: "A sly market illusion that may confuse.", kind: "attack", unlock: 5, fx: "moon", accuracy: 0.96, status: { name: "confuse", chance: 0.28 } }, "Stormglass Break": { power: 72, type: "Crystal", text: "A heavy glass thunder strike with lower accuracy.", kind: "attack", unlock: 10, fx: "zap", accuracy: 0.82, crit: 0.2 }, "Aurora Verdict": { power: 62, type: "Ice", text: "A royal blizzard beam.", kind: "attack", unlock: 8, fx: "legend", accuracy: 0.9, crit: 0.16 }, "Magma Crown": { power: 64, type: "Flame", text: "A crown of molten rock erupts.", kind: "attack", unlock: 8, fx: "legend", accuracy: 0.88, crit: 0.14 }, "Cathedral Howl": { power: 60, type: "Sound", text: "A sacred resonant howl.", kind: "attack", unlock: 8, fx: "legend", accuracy: 0.93, crit: 0.18 }, "Continental Slam": { power: 68, type: "Beast", text: "A continent-shaking strike.", kind: "attack", unlock: 8, fx: "legend", accuracy: 0.84, crit: 0.16 }, "Gear Eclipse": { power: 63, type: "Metal", text: "A perfect clockwork eclipse.", kind: "attack", unlock: 8, fx: "legend", accuracy: 0.91, crit: 0.15 }, "Dawn Judgment": { power: 78, type: "Light", text: "Solguard judges the field with sunrise fire.", kind: "attack", fx: "legend", accuracy: 0.9, crit: 0.2 }, "Eclipse Rend": { power: 82, type: "Shadow", text: "Umbraclaw tears open an eclipse slash.", kind: "attack", fx: "legend", accuracy: 0.88, crit: 0.24 }, "Abyssal Maelstrom": { power: 76, type: "Aqua", text: "Thalassor summons a crushing abyss current.", kind: "attack", fx: "legend", accuracy: 0.9, crit: 0.14 }, "Worldroot Cataclysm": { power: 80, type: "Verdant", text: "Gaialith raises ancient roots through the battlefield.", kind: "attack", fx: "legend", accuracy: 0.86, crit: 0.16 }, "Chrono Fracture": { power: 74, type: "Crystal", text: "Chronova fractures time into prism shards.", kind: "attack", fx: "legend", accuracy: 0.92, crit: 0.22 }, "Happy Hop": { power: 24, type: "Sound", text: "A springy joyful bop that lands with perfect cheer.", kind: "attack", unlock: 2, fx: "wind", accuracy: 0.98, crit: 0.12 }, "Confetti Pop": { power: 43, type: "Light", text: "A bright burst of confetti that may confuse the foe.", kind: "attack", unlock: 5, fx: "confetti", accuracy: 0.94, crit: 0.14, status: { name: "confuse", chance: 0.16 } }, "Cheer Burst": { power: 56, type: "Sound", text: "A booming shout of joy that can shake an enemy off balance.", kind: "attack", unlock: 8, fx: "confetti", accuracy: 0.92, crit: 0.16 }, "Party Parade": { power: 74, type: "Light", text: "A grand festival charge of lanterns and music.", kind: "attack", unlock: 11, fx: "confetti", accuracy: 0.87, crit: 0.22 }, Guard: { power: 0, type: "Mystic", text: "Reduce damage.", kind: "guard", fx: "guard" } };



const MOVE_PP_ITEMS = { "Prism Ether": 10, "Max Resonance": 999 };
function maxPPForSkill(skillName) {
  const sk = SKILLS[skillName] || SKILLS.Guard;
  if (sk.kind === "guard") return 40;
  if (sk.kind === "heal") return 15;
  const p = Number(sk.power || 0);
  const acc = sk.accuracy ?? 0.94;
  if (p >= 90 || acc <= 0.55) return 5;
  if (p >= 65) return 10;
  if (p >= 45) return 15;
  if (p >= 30) return 20;
  return 35;
}
function maxPPMapForMon(mon) {
  const out = {};
  (BESTIARY[mon?.id]?.skills || ["Guard"]).forEach((s) => { out[s] = maxPPForSkill(s); });
  return out;
}
function ensureMovePP(mon) {
  if (!mon) return mon;
  const max = maxPPMapForMon(mon);
  const current = mon.movePP || {};
  const movePP = {};
  Object.keys(max).forEach((name) => { movePP[name] = Math.max(0, Math.min(max[name], Number(current[name] ?? max[name]))); });
  return { ...mon, movePP };
}
function restoreMonPP(mon, amount = 999) {
  const m = ensureMovePP(mon);
  const max = maxPPMapForMon(m);
  const movePP = { ...(m.movePP || {}) };
  Object.keys(max).forEach((name) => { movePP[name] = Math.min(max[name], Number(movePP[name] ?? 0) + amount); });
  return { ...m, movePP };
}
function restorePartyPP(arr, amount = 999) { return (arr || []).map((m) => restoreMonPP(m, amount)); }
function ppText(mon, skillName) {
  const m = ensureMovePP(mon);
  const cur = m.movePP?.[skillName] ?? maxPPForSkill(skillName);
  return `${cur}/${maxPPForSkill(skillName)} PP`;
}
function hasPP(mon, skillName) { return (ensureMovePP(mon).movePP?.[skillName] ?? maxPPForSkill(skillName)) > 0; }
function spendPP(mon, skillName) {
  const m = ensureMovePP(mon);
  const movePP = { ...(m.movePP || {}) };
  movePP[skillName] = Math.max(0, Number(movePP[skillName] ?? maxPPForSkill(skillName)) - 1);
  return { ...m, movePP };
}

const STATUS_CONDITIONS = {
  poison: { label: "Poisoned", short: "PSN", persistent: true, cureItem: "Antidote", color: "bg-lime-400 text-slate-950 border-lime-200", description: "Loses HP after acting. Remains after battle until healed or cured." },
  burn: { label: "Burned", short: "BRN", persistent: true, cureItem: "Burn Salve", color: "bg-orange-400 text-slate-950 border-orange-200", description: "Loses HP after acting and physical damage is reduced. Remains after battle until healed or cured." },
  frozen: { label: "Frozen", short: "FRZ", persistent: false, cureItem: "Ice Melt", color: "bg-cyan-200 text-slate-950 border-cyan-100", description: "May be unable to move. Clears after battle or by item/heal." },
  sleep: { label: "Asleep", short: "SLP", persistent: false, cureItem: "Awakening", color: "bg-indigo-300 text-slate-950 border-indigo-100", description: "Cannot move for a few turns. Clears after battle or by item/heal." },
  confuse: { label: "Confused", short: "CNF", persistent: false, cureItem: "Clarity Herb", color: "bg-fuchsia-300 text-slate-950 border-fuchsia-100", description: "May hurt itself instead of moving. Clears after battle or by item/heal." },
  paralyzed: { label: "Paralyzed", short: "PAR", persistent: true, cureItem: "Paralyze Heal", color: "bg-yellow-300 text-slate-950 border-yellow-100", description: "May be unable to move and acts slower. Remains after battle until healed or cured." },
};
const STATUS_ITEM_NAMES = ["Antidote", "Burn Salve", "Ice Melt", "Awakening", "Paralyze Heal", "Clarity Herb", "Full Heal"];
const STATUS_SKILL_EFFECTS = {
  "Toxic Sting": { status: "poison", chance: 0.45 },
  "Venom Spray": { status: "poison", chance: 0.72 },
  "Flare Burst": { status: "burn", chance: 0.18 },
  "Magma Crown": { status: "burn", chance: 0.38 },
  "Ember Hex": { status: "burn", chance: 0.42 },
  "Frost Peck": { status: "frozen", chance: 0.22 },
  "Aurora Verdict": { status: "frozen", chance: 0.36 },
  "Frost Lock": { status: "frozen", chance: 0.42 },
  "Moon Tap": { status: "sleep", chance: 0.14 },
  "Dream Pulse": { status: "sleep", chance: 0.22 },
  "Lullaby Bell": { status: "sleep", chance: 0.5 },
  "Shadow Spiral": { status: "confuse", chance: 0.32 },
  "Spirit Claw": { status: "confuse", chance: 0.28 },
  "Sonic Roar": { status: "confuse", chance: 0.32 },
  "Mind Fog": { status: "confuse", chance: 0.55 },
  "Jolt Kick": { status: "paralyzed", chance: 0.16 },
  "Static Rush": { status: "paralyzed", chance: 0.28 },
  "Thunder Crown": { status: "paralyzed", chance: 0.38 },
  "Thunder Snare": { status: "paralyzed", chance: 0.52 },
  "Chrono Fracture": { status: "paralyzed", chance: 0.22 },
};
Object.assign(SKILLS, {
  "Venom Spray": { power: 32, type: "Toxic", text: "A venom cloud with a high poison chance.", kind: "attack", unlock: 4, fx: "slash", accuracy: 0.9, crit: 0.1 },
  "Ember Hex": { power: 34, type: "Flame", text: "A cursed flame that may burn.", kind: "attack", unlock: 4, fx: "blast", accuracy: 0.92, crit: 0.1 },
  "Frost Lock": { power: 30, type: "Ice", text: "A freezing lock that may freeze.", kind: "attack", unlock: 4, fx: "wind", accuracy: 0.86, crit: 0.08 },
  "Lullaby Bell": { power: 12, type: "Sound", text: "A ringing lullaby that may cause sleep.", kind: "attack", unlock: 3, fx: "nova", accuracy: 0.88, crit: 0.03 },
  "Mind Fog": { power: 24, type: "Mystic", text: "A foggy pulse that may confuse.", kind: "attack", unlock: 3, fx: "moon", accuracy: 0.92, crit: 0.07 },
  "Thunder Snare": { power: 31, type: "Volt", text: "A snaring jolt that may paralyze.", kind: "attack", unlock: 4, fx: "zap", accuracy: 0.9, crit: 0.09 },
});
function addSkillToMon(id, skill) { if (BESTIARY[id] && !BESTIARY[id].skills.includes(skill)) BESTIARY[id].skills.push(skill); }
["toxifrog", "venomire", "nightmoth", "thistlefiend"].forEach((id) => addSkillToMon(id, "Venom Spray"));
["emberlynx", "pyrolynx", "solarynx", "cindermole", "magmole", "calderox"].forEach((id) => addSkillToMon(id, "Ember Hex"));
["snowl", "blizzowl", "frostcub", "glaciermaw", "polarune"].forEach((id) => addSkillToMon(id, "Frost Lock"));
["bellimp", "chimegeist", "echopup", "howlitzer", "resonark"].forEach((id) => addSkillToMon(id, "Lullaby Bell"));
["gloomander", "lunamander", "eclipsander", "prismite", "chronova", "spirikit", "phantelope"].forEach((id) => addSkillToMon(id, "Mind Fog"));
["voltoroo", "stormaroo", "thundaroo", "neonsquid", "ionwyrm"].forEach((id) => addSkillToMon(id, "Thunder Snare"));
function normalizeStatus(status) {
  if (!status) return null;
  if (typeof status === "string") status = { key: status };
  const def = STATUS_CONDITIONS[status.key];
  if (!def) return null;
  return { key: status.key, turns: Number.isFinite(Number(status.turns)) ? Number(status.turns) : defaultStatusTurns(status.key), persistent: !!def.persistent };
}
function defaultStatusTurns(key) {
  if (key === "sleep") return 2 + Math.floor(Math.random() * 3);
  if (key === "frozen") return 2 + Math.floor(Math.random() * 2);
  if (key === "confuse") return 2 + Math.floor(Math.random() * 3);
  return 0;
}
function makeStatus(key) { return normalizeStatus({ key, turns: defaultStatusTurns(key) }); }
function statusText(status) { const s = normalizeStatus(status); return s ? STATUS_CONDITIONS[s.key]?.label || s.key : "Healthy"; }
function statusShort(status) { const s = normalizeStatus(status); return s ? STATUS_CONDITIONS[s.key]?.short || s.key.toUpperCase().slice(0,3) : "OK"; }
function statusClass(status) { const s = normalizeStatus(status); return s ? STATUS_CONDITIONS[s.key]?.color || "bg-slate-300 text-slate-950" : "bg-lime-300 text-slate-950 border-lime-100"; }
function isBattleOnlyStatus(status) { const s = normalizeStatus(status); return !!s && !STATUS_CONDITIONS[s.key]?.persistent; }
function clearBattleOnlyStatus(mon) { return mon && isBattleOnlyStatus(mon.status) ? { ...mon, status: null } : mon; }
function clearAllStatus(mon) { return mon ? { ...mon, status: null } : mon; }
const STATUS_IMMUNITIES = {
  burn: ["Flame"],
  paralyzed: ["Volt"],
  frozen: ["Ice"],
  poison: ["Toxic", "Metal"],
  sleep: ["Spirit"],
  confuse: ["Spirit"],
};

function statusImmuneReason(mon, key) {
  const type = BESTIARY[mon?.id]?.type || mon?.type;
  if (!type || !key) return "";
  if ((STATUS_IMMUNITIES[key] || []).includes(type)) {
    return `${displayName(mon)} is a ${type}-type and cannot be ${STATUS_CONDITIONS[key]?.label.toLowerCase()}.`;
  }
  return "";
}
function canReceiveStatus(mon, key) { return !statusImmuneReason(mon, key); }
function applyStatusToMon(mon, key) {
  if (!mon || !STATUS_CONDITIONS[key] || mon.status || !canReceiveStatus(mon, key)) return mon;
  return { ...mon, status: makeStatus(key) };
}
function effectiveAttack(mon) { const base = Number(mon?.atk || 1); return normalizeStatus(mon?.status)?.key === "burn" ? Math.max(1, base * 0.75) : base; }
function effectiveSpeed(mon) { const base = Number(mon?.spd || 1); return normalizeStatus(mon?.status)?.key === "paralyzed" ? Math.max(1, base * 0.55) : base; }
function cureItemForStatus(status) { const s = normalizeStatus(status); return s ? STATUS_CONDITIONS[s.key]?.cureItem : null; }
function itemCount(player, item) { return Number((player?.items || {})[item] || 0); }
function hasAnyCureForStatus(player, status) { const item = cureItemForStatus(status); return !!status && (itemCount(player, item) > 0 || itemCount(player, "Full Heal") > 0); }
function bestCureItemForStatus(player, status) { const item = cureItemForStatus(status); if (item && itemCount(player, item) > 0) return item; if (itemCount(player, "Full Heal") > 0) return "Full Heal"; return null; }
function statusCureMatches(item, status) { const s = normalizeStatus(status); if (!s) return false; return item === "Full Heal" || item === STATUS_CONDITIONS[s.key]?.cureItem; }
function maybeApplyMoveStatus(target, skillName) {
  const effect = STATUS_SKILL_EFFECTS[skillName];
  if (!effect || !target || target.status || target.hp <= 0) return { mon: target, text: "" };
  if (Math.random() > effect.chance) return { mon: target, text: "" };
  const immune = statusImmuneReason(target, effect.status);
  if (immune) return { mon: target, text: ` ${immune}` };
  const mon = applyStatusToMon(target, effect.status);
  return { mon, text: ` ${displayName(target)} is now ${STATUS_CONDITIONS[effect.status].label.toLowerCase()}!` };
}
function beforeActionStatus(mon) {
  const status = normalizeStatus(mon?.status);
  if (!status || !mon) return { mon, canAct: true, text: "" };
  const def = STATUS_CONDITIONS[status.key];
  if (status.key === "sleep") {
    if ((status.turns || 0) <= 1) return { mon: { ...mon, status: null }, canAct: true, text: `${displayName(mon)} woke up! ` };
    return { mon: { ...mon, status: { ...status, turns: status.turns - 1 } }, canAct: false, text: `${displayName(mon)} is asleep and can't move! ` };
  }
  if (status.key === "frozen") {
    if (Math.random() < 0.35 || (status.turns || 0) <= 1) return { mon: { ...mon, status: null }, canAct: true, text: `${displayName(mon)} thawed out! ` };
    return { mon: { ...mon, status: { ...status, turns: status.turns - 1 } }, canAct: false, text: `${displayName(mon)} is frozen solid! ` };
  }
  if (status.key === "paralyzed" && Math.random() < 0.25) return { mon, canAct: false, text: `${displayName(mon)} is paralyzed and can't move! ` };
  if (status.key === "confuse") {
    const turns = Math.max(0, status.turns || 0);
    if (turns <= 1) return { mon: { ...mon, status: null }, canAct: true, text: `${displayName(mon)} snapped out of confusion! ` };
    const nextStatus = { ...status, turns: turns - 1 };
    if (Math.random() < 0.35) {
      const dmg = Math.max(2, Math.floor((mon.maxHp || 10) * 0.09));
      return { mon: { ...mon, hp: Math.max(0, mon.hp - dmg), status: nextStatus }, canAct: false, text: `${displayName(mon)} is confused and hurt itself for ${dmg} damage! ` };
    }
    return { mon: { ...mon, status: nextStatus }, canAct: true, text: `${displayName(mon)} fought through confusion! ` };
  }
  return { mon, canAct: true, text: "" };
}
function afterActionStatus(mon) {
  const status = normalizeStatus(mon?.status);
  if (!status || !mon || mon.hp <= 0) return { mon, text: "" };
  if (status.key === "poison") {
    const dmg = Math.max(2, Math.floor((mon.maxHp || 10) / 10));
    return { mon: { ...mon, hp: Math.max(0, mon.hp - dmg), status }, text: ` ${displayName(mon)} is hurt by poison for ${dmg} damage.` };
  }
  if (status.key === "burn") {
    const dmg = Math.max(1, Math.floor((mon.maxHp || 10) / 16));
    return { mon: { ...mon, hp: Math.max(0, mon.hp - dmg), status }, text: ` ${displayName(mon)} is hurt by its burn for ${dmg} damage.` };
  }
  return { mon: { ...mon, status }, text: "" };
}
function StatusBadge({ status, small = false }) {
  const s = normalizeStatus(status);
  if (!s) return null;
  const def = STATUS_CONDITIONS[s.key];
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 font-black ${small ? "text-[10px]" : "text-xs"} ${statusClass(s)}`} title={def?.description || "Status condition"}>{def?.short || s.key.toUpperCase()}</span>;
}

const STORY = [
  { speaker: "Professor Aster", text: "The Sky Prism is cracking above Luminara. Every hour changes which Mythlings appear, and the strongest tamers learn to read the map before moving." },
  { speaker: "Professor Aster", text: "Battles now depend on type advantage, level, same-type mastery, move accuracy, critical hits, guard timing, attack, and defense. A weaker Mythling can still win with the right move." },
  { speaker: "Professor Aster", text: "Beyond the first routes lie Echo Caves, Beastwood, and Titan Pass. Sound and Beast Mythlings guard those paths, and their cries can trigger cinematic encounters." },
  { speaker: "Professor Aster", text: "After the Sky Prism is restored, five sealed legends awaken in late-game dungeons: sun, eclipse, abyss, worldroot, and time itself. Each one demands a special condition before it will appear." },
  { speaker: "Professor Aster", text: "Record your encounters in the Prism Dex, earn relics from story battles, master the type chart, and restore the Prism before night swallows the region." }
];
const MAP_DATA = [
  "WWWWWWWWWWWWWWWW",
  "W..G..a..M..o.1W",
  "W.GGj.GG.QQQGY.W",
  "W..G..T..QG.SQ2W",
  "W..G..G..V..QQUW",
  "W..t.C..GQG.p3%W",
  "W.GGx...G..KG..W",
  "W...N..L..G.h4.W",
  "W..G..R..LLG.GYW",
  "W.FG..G....9GG5W",
  "W.G$.B.@Z..G.!WW",
  "WWWWWWWWWWWWWWWW"
];
const ENCOUNTERS = {
  G: ["emberlynx", "aquapup", "leafawn", "voltoroo", "cloudfinch", "spriggeist", "spirikit", "bellimp", "bramblepup", "happi"],
  L: ["aquapup", "leafawn", "cloudfinch", "prismite", "frostcub", "coralisk", "neonsquid"],
  M: ["pebbkit", "ironboar", "cloudfinch", "sandillo", "crysteel", "cuboulder"],
  V: ["gloomander", "shadebat", "pebbkit", "nightmoth", "starwhale", "orchidimp", "spirikit", "bellimp", "noircolt", "umbrasteed"],
  F: ["emberlynx", "voltoroo", "shadebat", "cindermole", "toxifrog", "ferroach", "sunwyrm", "heliodrake"],
  A: ["cloudfinch", "voltoroo", "dawnhare", "mistowl", "lumifox", "snowl", "ionwyrm", "echopup"],
  O: ["leafawn", "spriggeist", "orchidimp", "mistowl", "spirikit", "bellimp", "happi", "jolli"],
  Q: ["pebbkit", "sandillo", "ironboar", "cindermole", "gearmite", "steelfang", "crysteel", "ferroach"],
  P: ["prismite", "gloomander", "starwhale", "aurorabbit", "lumifox", "gearmite", "crysteel", "phantelope", "chimegeist", "glimmernewt", "radiantoad", "gemtoad", "opaloracle"],
  H: ["frostcub", "aurorabbit", "mistowl", "snowl", "blizzowl", "cuboulder"],
  J: ["leafawn", "orchidimp", "crysteel", "prismite", "spriggeist", "bellimp", "bramblepup", "glimmernewt"],
  X: ["toxifrog", "venomire", "spirikit", "shadebat", "nightmoth", "chimegeist"],
  Z: ["neonsquid", "ionwyrm", "voltoroo", "aquapup", "prismite", "sparkitten", "voltiger"],
  E: ["echopup", "bellimp", "mistowl", "shadebat", "neonsquid"],
  Y: ["cuboulder", "sandillo", "ferroach", "cloudfinch", "ironboar", "bramblepup", "thornwolf"],
  U: ["cuboulder", "titanursa", "mantitan", "pebbkit", "crysteel"],
  "6": ["embercrow", "pyreaven", "cindermole", "magmole", "cloudfinch"],
  "7": ["miragecalf", "miragehart", "prismite", "aurorabbit", "mistowl", "jolli", "happi"],
  "8": ["tidebug", "shellsurge", "coralisk", "aquapup", "neonsquid"],
  "$": ["goldkit", "aurumane", "candypup", "caramutt", "vaultick", "lockroach", "coinwyrm", "treasuredrake", "prismite", "lumifox", "bellimp"],
  "!": ["stormkid", "thunderchoir", "glasswyrm", "stormglass", "cloudfinch", "ionwyrm"],
  "%": ["shelltide", "reefguard", "abyssnake", "leviacoil", "glintcrab", "prismclaw"],
  "@": ["ashchick", "cinderwing", "kitspark", "vulpyr", "embercrow", "pyreaven"]
};
const TILE_NAMES = {
  G: "Tall Grass", L: "Lake Shore", M: "Rocky Pass", V: "Moon Cave", F: "Ash Field", A: "Wind Hill", O: "Orchid Orchard", Q: "Crystal Quarry", P: "Prism Ruins", H: "Frost Hollow", J: "Crystal Jungle", X: "Spirit Marsh", Z: "Storm Rail", E: "Echo Grove", Y: "Beast Den", U: "Titan Pass",
  "6": "Ember Roost", "7": "Mirage Garden", "8": "Tideglass Flats", "$": "Luminous Bazaar Gate", "!": "Stormspire Gate", "%": "Sunken Archive Gate", "@": "Phoenix Roost Gate", "9": "Caldera Crown Gate",
  a: "Skyrail Meadow Gate", e: "Echo Caves Gate", x: "Spirit Marsh Gate", p: "Prism Ruins Gate", u: "Titan Pass Gate", t: "Tideglass Flats Gate", m: "Ironrail Yard Gate", v: "Nocturne Road Gate", h: "Frostglass Peaks Gate", j: "Verdant Canopy Gate", o: "Orchid Court Gate",
  "0": "Return Gate", N: "Grovepath Village", R: "Rival Bridge", K: "Keeper Gate", B: "Bridge Captain", S: "Old Shrine", D: "Dragon Gate", C: "Crystal Spring", T: "Treasure Cache", W: "Wall"
};
const AREA_DATA = {
  luminara: {
    id: "luminara",
    name: "Luminara Crossroads",
    chapter: 1,
    subtitle: "Chapter 1 · The First Prism Crack",
    theme: "Overworld Dawn",
    bg: "from-slate-950 via-emerald-950 to-slate-950",
    levelMin: 3,
    levelMax: 9,
    map: MAP_DATA,
    description: "The safe central crossroads of Luminara. Early story objectives happen here before the road opens toward caves, marshes, quarries, gardens, and finally Dracinder."
  },
  echoCaves: {
    id: "echoCaves",
    name: "Echo Caves",
    chapter: 2,
    subtitle: "Chapter 2 · Songs Beneath Stone",
    theme: "Echoing Drums",
    bg: "from-indigo-950 via-fuchsia-950 to-slate-950",
    levelMin: 7,
    levelMax: 14,
    start: { x: 2, y: 9 },
    map: [
      "WWWWWWWWWWWWWWWW",
      "WEEEE..V..T...0W",
      "W.EEE..VV....EEW",
      "W..E..WWWW..EE.W",
      "W..E..C..V..K..W",
      "W..EEE..V..EE..W",
      "W..E..WWWW..E..W",
      "W..E....E...E..W",
      "W..E..R..EE....W",
      "W.0EEEEEE..E...W",
      "W....E...B..EE.W",
      "WWWWWWWWWWWWWWWW"
    ],
    encounters: { E: ["echopup","bellimp","wolfrune","howlglyph","howlitzer","chimegeist","mistowl"], V: ["gloomander","shadebat","spirikit","nightmoth"], G: ["cloudfinch","prismite"] },
    description: "Every step echoes into battle rhythm. Sound and Spirit Mythlings are stronger here."
  },
  spiritMarsh: {
    id: "spiritMarsh",
    name: "Spirit Marsh",
    chapter: 3,
    subtitle: "Chapter 3 · Lanterns in the Mire",
    theme: "Low Bells and Rain",
    bg: "from-purple-950 via-lime-950 to-slate-950",
    levelMin: 9,
    levelMax: 17,
    start: { x: 2, y: 9 },
    map: [
      "WWWWWWWWWWWWWWWW",
      "WXXXX..V..S...0W",
      "W.XLX..VV..XX..W",
      "W..X..WWWW..X..W",
      "W..X..C..V..K..W",
      "W..XXX..V..XX..W",
      "W..X..WWWW..X..W",
      "W..X....X...X..W",
      "W..X..R..XX....W",
      "W.0XXXXXX..X...W",
      "W....X...B..XX.W",
      "WWWWWWWWWWWWWWWW"
    ],
    encounters: { X: ["toxifrog","venomire","spirikit","phantelope","gloomjaw","marshgrave"], V: ["shadebat","nightmoth","chimegeist"], L: ["frostcub","coralisk"] },
    description: "A haunted swamp where statuses are common and Spirit evolution lines appear."
  },
  prismRuins: {
    id: "prismRuins",
    name: "Prism Ruins",
    chapter: 4,
    subtitle: "Chapter 4 · The Broken Light",
    theme: "Glass Choir",
    bg: "from-violet-950 via-cyan-950 to-slate-950",
    levelMin: 15,
    levelMax: 24,
    start: { x: 2, y: 9 },
    map: [
      "WWWWWWWWWWWWWWWW",
      "WPPPP..J..T...0W",
      "W.PJP..JJ..PP..W",
      "W..P..WWWW..P..W",
      "W..P..C..J..K..W",
      "W..PPP..J..PP..W",
      "W..P..WWWW..P..W",
      "W..P....P...P..W",
      "W..P..R..PP....W",
      "W.0PPPPPP..P...W",
      "W....P...B..PP.W",
      "WWWWWWWWWWWWWWWW"
    ],
    encounters: { P: ["prismite","crysteel","prismhorn","glimmernewt","radiantoad","relicalf","obelisdeer"], J: ["miragecalf","miragehart","aurorabbit","lumifox"], H: ["snowl","blizzowl"] },
    description: "A crystalline ruin with higher-level Mystic, Crystal, and Light Mythlings."
  },
  titanPass: {
    id: "titanPass",
    name: "Titan Pass",
    chapter: 5,
    subtitle: "Chapter 5 · Steps of Giants",
    theme: "Mountain War Drums",
    bg: "from-stone-950 via-orange-950 to-slate-950",
    levelMin: 21,
    levelMax: 33,
    start: { x: 2, y: 9 },
    map: [
      "WWWWWWWWWWWWWWWW",
      "WUUUU..M..T...0W",
      "W.UYU..MM..UU..W",
      "W..U..WWWW..U..W",
      "W..U..C..M..B..W",
      "W..UUU..M..UU..W",
      "W..U..WWWW..U..W",
      "W..U....U...U..W",
      "W..U..R..UU....W",
      "W.0UUUUUU..U...W",
      "W....U...D..UU.W",
      "WWWWWWWWWWWWWWWW"
    ],
    encounters: { U: ["cuboulder","titanursa","worldursa","mantitan","mechamane","crystwing","vitraquila"], M: ["pebbkit","granitus","sandillo","duneguard"], Y: ["bramblepup","thornwolf","ferroach"] },
    description: "A late-game mountain pass where evolved monsters and boss routes become common."
  },
  tideglassFlats: {
    id: "tideglassFlats",
    name: "Tideglass Flats",
    chapter: 3,
    subtitle: "Chapter 3 · Mirror of the Sea",
    theme: "Glass Tide",
    bg: "from-blue-950 via-cyan-950 to-slate-950",
    levelMin: 13,
    levelMax: 22,
    start: { x: 2, y: 9 },
    map: [
      "WWWWWWWWWWWWWWWW",
      "W8888..L..T...0W",
      "W.8L8..LL..88..W",
      "W..8..WWWW..8..W",
      "W..8..C..L..K..W",
      "W..888..L..88..W",
      "W..8..WWWW..8..W",
      "W..8....8...8..W",
      "W..8..R..88....W",
      "W.0888888..8...W",
      "W....8...B..88.W",
      "WWWWWWWWWWWWWWWW"
    ],
    encounters: { "8": ["tidebug","shellsurge","coralisk","reefserpent","neonsquid"], L: ["aquapup","tidemast","frostcub","thalassor"] },
    description: "A reflective coast where Aqua and Metal-adjacent Mythlings gain stronger levels."
  },
  skyrailMeadow: {
    id: "skyrailMeadow",
    name: "Skyrail Meadow",
    chapter: 2,
    subtitle: "Chapter 2 · Rails Above the Grass",
    theme: "Windbells Over Green",
    bg: "from-sky-950 via-emerald-950 to-slate-950",
    levelMin: 5,
    levelMax: 11,
    start: { x: 2, y: 9 },
    map: [
      "WWWWWWWWWWWWWWWW",
      "WAAAA..G..T...0W",
      "W.AGA..AA..GG..W",
      "W..A..WWWW..G..W",
      "W..A..C..A..K..W",
      "W..AAA..G..AA..W",
      "W..A..WWWW..A..W",
      "W..A....A...A..W",
      "W..A..R..GG....W",
      "W.0AAAAAA..A...W",
      "W....A...B..AA.W",
      "WWWWWWWWWWWWWWWW"
    ],
    encounters: { A: ["seedpuff","cottonstag","cloudfinch","galegryph","dawnhare"], G: ["leafawn","bramblepup","spriggeist"] },
    description: "A breezy meadow crossed by ancient floating rails. Air and Verdant lines grow quickly here."
  },
  ironrailYard: {
    id: "ironrailYard",
    name: "Ironrail Yard",
    chapter: 4,
    subtitle: "Chapter 4 · Engines Under the Prism",
    theme: "Steam and Steel",
    bg: "from-slate-950 via-zinc-900 to-cyan-950",
    levelMin: 19,
    levelMax: 30,
    start: { x: 2, y: 9 },
    map: [
      "WWWWWWWWWWWWWWWW",
      "WMMMM..Z..T...0W",
      "W.MZM..ZZ..MM..W",
      "W..M..WWWW..M..W",
      "W..M..C..Z..K..W",
      "W..MMM..Z..MM..W",
      "W..M..WWWW..M..W",
      "W..M....M...M..W",
      "W..M..R..ZZ....W",
      "W.0MMMMMM..M...W",
      "W....M...B..MM.W",
      "WWWWWWWWWWWWWWWW"
    ],
    encounters: { M: ["gearmite","steelfang","railkit","locopanther","drillbug","cometitan","ferroach","mantitan"], Z: ["sparkitten","voltiger","neonsquid","ionwyrm"] },
    description: "A mechanical yard where abandoned engines hum with Metal and Volt Mythlings."
  },
  nocturneRoad: {
    id: "nocturneRoad",
    name: "Nocturne Road",
    chapter: 5,
    subtitle: "Chapter 5 · The Long Shadow",
    theme: "Black Star Road",
    bg: "from-black via-purple-950 to-slate-950",
    levelMin: 23,
    levelMax: 35,
    start: { x: 2, y: 9 },
    map: [
      "WWWWWWWWWWWWWWWW",
      "WVVVV..X..T...0W",
      "W.VXV..XX..VV..W",
      "W..V..WWWW..X..W",
      "W..V..C..X..K..W",
      "W..VVV..X..VV..W",
      "W..V..WWWW..V..W",
      "W..V....V...V..W",
      "W..V..R..XX....W",
      "W.0VVVVVV..V...W",
      "W....V...D..VV.W",
      "WWWWWWWWWWWWWWWW"
    ],
    encounters: { V: ["voidpup","umbrahound","shadebat","noctyra","duskshell","crypturtle"], X: ["toxifrog","venomire","spirikit","phantelope","umbraclaw"] },
    description: "A late-game road of shadow where dangerous status moves and fast attackers dominate."
  },
  sunkenArchive: {
    id: "sunkenArchive",
    name: "Sunken Archive",
    chapter: 5,
    subtitle: "Chapter 5 · Bells Below the Tide",
    theme: "Drowned Library Chimes",
    bg: "from-blue-950 via-cyan-950 to-slate-950",
    levelMin: 20,
    levelMax: 34,
    start: { x: 2, y: 9 },
    sideQuest: "Find three drowned tablets and awaken the Abyssal Coil.",
    map: [
      "WWWWWWWWWWWWWWWW",
      "W%%%%..L..T...0W",
      "W.%L%..%%..LL..W",
      "W..%..WWWW..%..W",
      "W..%..C..L..K..W",
      "W..%%%..L..%%..W",
      "W..%..WWWW..%..W",
      "W..%....%...%..W",
      "W..%..R..LL....W",
      "W.0%%%%%%..%...W",
      "W....%...B..%%.W",
      "WWWWWWWWWWWWWWWW"
    ],
    encounters: { "%": ["shelltide","reefguard","abyssnake","leviacoil","glintcrab","prismclaw"], L: ["coralisk","reefserpent","neonsquid","sirenfin","melodray"], P: ["prismite","runeling"] },
    description: "A flooded library where tide bells ring under the floor. Aqua, Crystal, and Abyssal lines appear here."
  },
  phoenixRoost: {
    id: "phoenixRoost",
    name: "Phoenix Roost",
    chapter: 6,
    subtitle: "Chapter 6 · Feathers of Rebirth",
    theme: "Ashen Sunrise Hymn",
    bg: "from-orange-950 via-red-950 to-slate-950",
    levelMin: 24,
    levelMax: 38,
    start: { x: 2, y: 9 },
    sideQuest: "Light the three sunrise braziers to unlock Phoenixar evolution.",
    map: [
      "WWWWWWWWWWWWWWWW",
      "W@@@@..F..T...0W",
      "W.@A@..@@..FF..W",
      "W..@..WWWW..@..W",
      "W..@..C..F..K..W",
      "W..@@@..F..@@..W",
      "W..@..WWWW..@..W",
      "W..@....@...@..W",
      "W..@..R..FF....W",
      "W.0@@@@@@..@...W",
      "W....@...B..@@.W",
      "WWWWWWWWWWWWWWWW"
    ],
    encounters: { "@": ["ashchick","cinderwing","kitspark","vulpyr","embercrow","pyreaven"], F: ["cindermole","magmole","calderox"], A: ["cloudfinch","galegryph"] },
    description: "A high ash cliff where rebirth feathers fall like sparks. Flame, Light, and Air Mythlings dominate this route."
  },

  calderaCrown: {
    id: "calderaCrown",
    name: "Caldera Crown",
    chapter: 6,
    subtitle: "Chapter 6 · Fire at the World's Rim",
    theme: "Crown of Ash",
    bg: "from-red-950 via-orange-950 to-black",
    levelMin: 28,
    levelMax: 42,
    start: { x: 2, y: 9 },
    map: [
      "WWWWWWWWWWWWWWWW",
      "WFFFF..6..T...0W",
      "W.F6F..66..FF..W",
      "W..F..WWWW..6..W",
      "W..F..C..6..K..W",
      "W..FFF..6..FF..W",
      "W..F..WWWW..F..W",
      "W..F....F...F..W",
      "W..F..R..66....W",
      "W.0FFFFFF..F...W",
      "W....F...D..FF.W",
      "WWWWWWWWWWWWWWWW"
    ],
    encounters: { F: ["lavaling","basalisk","calderagon","embercrow","pyreaven","magmole","calderox"], "6": ["dracinder","regaldrake","cindermole"] },
    description: "A post-bridge volcanic crown where third-stage Flame monsters begin to appear."
  },
  frostglassPeaks: {
    id: "frostglassPeaks",
    name: "Frostglass Peaks",
    chapter: 4,
    subtitle: "Chapter 4 Side Route · The Mirror Snow",
    theme: "Aurora Bells",
    bg: "from-cyan-950 via-blue-950 to-slate-950",
    levelMin: 17,
    levelMax: 27,
    start: { x: 2, y: 9 },
    sideQuest: "Recover the Aurora Lens from the frozen watchtower.",
    map: [
      "WWWWWWWWWWWWWWWW",
      "WHHHH..C..T...0W",
      "W.HHH..HH..H...W",
      "W..H..WWWW..H..W",
      "W..H..C..H..K..W",
      "W..HHH..H..HH..W",
      "W..H..WWWW..H..W",
      "W..H....H...H..W",
      "W..H..R..HH....W",
      "W.0HHHHHH..H...W",
      "W....H...4..HH.W",
      "WWWWWWWWWWWWWWWW"
    ],
    encounters: { H: ["snowkit","frostlynx","glacira","rimefin","cryoray","snowl","blizzowl","frostcub","glaciermaw","aurorabbit"], C: ["prismite","glimmernewt"] },
    description: "A side-route of mirror ice. Ice Mythlings resist freezing and many carry precision status moves."
  },
  verdantCanopy: {
    id: "verdantCanopy",
    name: "Verdant Canopy",
    chapter: 3,
    subtitle: "Chapter 3 Side Route · Roots Above the World",
    theme: "Canopy Flutes",
    bg: "from-emerald-950 via-lime-950 to-slate-950",
    levelMin: 11,
    levelMax: 19,
    start: { x: 2, y: 9 },
    sideQuest: "Find the three Seed Bells and wake the sleeping root bridge.",
    map: [
      "WWWWWWWWWWWWWWWW",
      "WJJJJ..G..T...0W",
      "W.JGJ..JJ..GJ..W",
      "W..J..WWWW..J..W",
      "W..J..C..G..S..W",
      "W..JJJ..G..JJ..W",
      "W..J..WWWW..J..W",
      "W..J....J...J..W",
      "W..J..R..GG....W",
      "W.0JJJJJJ..J...W",
      "W....J...B..JJ.W",
      "WWWWWWWWWWWWWWWW"
    ],
    encounters: { J: ["mossmunk","cedarmunk","forestwarden","cactimp","needlestalk","seedpuff","cottonstag","leafawn","florantler","spriggeist"], G: ["bramblepup","thornwolf","orchling"] },
    description: "A vertical forest where side quests unlock safer paths and Verdant evolutions."
  },
  orchidCourt: {
    id: "orchidCourt",
    name: "Orchid Court",
    chapter: 5,
    subtitle: "Chapter 5 Side Route · The Singing Garden",
    theme: "Orchid Waltz",
    bg: "from-pink-950 via-fuchsia-950 to-indigo-950",
    levelMin: 24,
    levelMax: 36,
    start: { x: 2, y: 9 },
    sideQuest: "Defeat the three court performers to earn the Harmony Charm.",
    map: [
      "WWWWWWWWWWWWWWWW",
      "WOOOO..J..T...0W",
      "W.OJO..OO..OO..W",
      "W..O..WWWW..O..W",
      "W..O..C..J..K..W",
      "W..OOO..J..OO..W",
      "W..O..WWWW..O..W",
      "W..O....O...O..W",
      "W..O..R..OO....W",
      "W.0OOOOOO..O...W",
      "W....O...B..OO.W",
      "WWWWWWWWWWWWWWWW"
    ],
    encounters: { O: ["orchling","orchidiva","orchidimp","bellimp","chimegeist","lanternkid","beaconant","miragecalf","miragehart"], J: ["prismite","glimmernewt","radiantoad"] },
    description: "A melodic garden full of Mystic performers, sleep moves, and trade-evolution hints."
  },

  luminousBazaar: {
    id: "luminousBazaar",
    name: "Luminous Bazaar",
    chapter: 3,
    subtitle: "Side Route · The Market of Living Light",
    theme: "Golden Lantern Waltz",
    bg: "from-yellow-950 via-orange-950 to-slate-950",
    levelMin: 11,
    levelMax: 20,
    start: { x: 2, y: 9 },
    sideQuest: "Find the three Bell Merchants and earn the Lucky Prism tag.",
    map: [
      "WWWWWWWWWWWWWWWW",
      "W$$$$..O..T...0W",
      "W.$G$..$$..OO..W",
      "W..$..WWWW..$..W",
      "W..$..C..O..N..W",
      "W..$$$..O..$$..W",
      "W..$..WWWW..$..W",
      "W..$....$...$..W",
      "W..$..R..OO....W",
      "W.0$$$$$$..$...W",
      "W....$...B..$$.W",
      "WWWWWWWWWWWWWWWW"
    ],
    encounters: { "$": ["goldkit","aurumane","bellimp","lumifox","prismite"], O: ["orchling","lanternimp","glowgremlin","miragecub","dreamlynx","mirageon","miragebud","dreamorchid"], G: ["leafawn","spriggeist"] },
    description: "A glowing market route where Light and Mystic Mythlings gather around living lantern stalls. Coinwyrm and Treasuredrake appear near vault alleys after the Lucky Prism Tag trial."
  },
  stormspireCliffs: {
    id: "stormspireCliffs",
    name: "Stormspire Cliffs",
    chapter: 5,
    subtitle: "Side Route · The Singing Thunder Cliffs",
    theme: "Choir of Lightning",
    bg: "from-sky-950 via-indigo-950 to-slate-950",
    levelMin: 26,
    levelMax: 39,
    start: { x: 2, y: 9 },
    sideQuest: "Ring the three storm bells to awaken Stormglass.",
    map: [
      "WWWWWWWWWWWWWWWW",
      "W!!!!..A..T...0W",
      "W.!A!..!!..AA..W",
      "W..!..WWWW..!..W",
      "W..!..C..A..K..W",
      "W..!!!..A..!!..W",
      "W..!..WWWW..!..W",
      "W..!....!...!..W",
      "W..!..R..AA....W",
      "W.0!!!!!!..!...W",
      "W....!...D..!!.W",
      "WWWWWWWWWWWWWWWW"
    ],
    encounters: { "!": ["stormkid","thunderchoir","wolfrune","howlglyph","glasswyrm","stormglass","ionwyrm","cloudfinch"], A: ["galegryph","dawnhare","mistowl"], Z: ["sparkitten","voltiger"] },
    description: "A high-level optional cliff route. Wind, thunder, crystal, and song overlap here; enter after your team is around Lv.26+."
  },


};

const AREA_EXITS = {
  a: "skyrailMeadow",
  e: "echoCaves",
  x: "spiritMarsh",
  p: "prismRuins",
  u: "titanPass",
  t: "tideglassFlats",
  m: "ironrailYard",
  v: "nocturneRoad",
  h: "frostglassPeaks",
  j: "verdantCanopy",
  o: "orchidCourt",
  "$": "luminousBazaar",
  "!": "stormspireCliffs",
  "%": "sunkenArchive",
  "@": "phoenixRoost",
  "9": "calderaCrown",
  "0": "luminara"
};


const WORLD_ROUTE = [
  { id: "luminara", gate: "Start", story: "Choose a starter and speak to Elder Nima." },
  { id: "skyrailMeadow", gate: "Skyrail Gate / a", story: "Learn route travel and fight early tamers." },
  { id: "echoCaves", gate: "Echo Gate / e", story: "Defeat Rival Ren and hear the first Prism song." },
  { id: "spiritMarsh", gate: "Spirit Marsh Gate / x", story: "Find Moon Keeper Sola and unlock shrine shadows." },
  { id: "verdantCanopy", gate: "Verdant Gate / j", story: "Optional but recommended: complete the Seed Bell side quest and train Verdant lines." },
  { id: "luminousBazaar", gate: "Luminous Bazaar / $", story: "Side route: earn the Lucky Prism tag and discover Light Mythlings." },
  { id: "tideglassFlats", gate: "Tideglass Gate / t", story: "Gather coastal items and evolve Aqua lines." },
  { id: "prismRuins", gate: "Prism Gate / p", story: "Recover the Prism Key from broken glass." },
  { id: "frostglassPeaks", gate: "Frost Gate / h", story: "Side route: recover the Aurora Lens and catch Ice Mythlings." },
  { id: "ironrailYard", gate: "Ironrail Gate / m", story: "Upgrade your team with Metal and Volt Mythlings." },
  { id: "titanPass", gate: "Titan Gate / u", story: "Defeat Bridge Captain Brann." },
  { id: "nocturneRoad", gate: "Nocturne Gate / v", story: "Prepare for shadow routes and late-game threats." },
  { id: "orchidCourt", gate: "Orchid Gate / o", story: "Side route: earn Harmony Charm and learn about trade evolutions." },
  { id: "stormspireCliffs", gate: "Stormspire / !", story: "Side route: ring the storm bells and awaken Stormglass." },
  { id: "phoenixRoost", gate: "Phoenix Roost / @", story: "Side route: light sunrise braziers and unlock Phoenixar." },
  { id: "calderaCrown", gate: "Caldera Gate / 9", story: "Reach the fiery road to Dragon Gate." },
  { id: "postgame", gate: "Legend seals 1-5", story: "After Dracinder, hunt the five legendary dungeons." }
];
function areaOrderIndex(areaId) {
  const idx = WORLD_ROUTE.findIndex((r) => r.id === areaId);
  return idx < 0 ? 0 : idx;
}
function currentRouteStep(player, seen = {}, party = []) {
  const area = player?.area || "luminara";
  const currentIdx = areaOrderIndex(area);
  const recommendedId = recommendedStoryAreaId(player, seen, party);
  const recommendedIdx = areaOrderIndex(recommendedId);
  const current = WORLD_ROUTE[currentIdx] || WORLD_ROUTE[0];
  const next = WORLD_ROUTE[recommendedIdx] || WORLD_ROUTE[0];
  return { index: currentIdx, recommendedIndex: recommendedIdx, current, next };
}

function averagePartyLevel(party = []) {
  const alive = (party || []).filter(Boolean);
  if (!alive.length) return 1;
  return Math.round(alive.reduce((sum, m) => sum + Number(m.level || 1), 0) / alive.length);
}
function maxPartyLevel(party = []) {
  return Math.max(1, ...((party || []).filter(Boolean).map((m) => Number(m.level || 1))));
}
function recommendedStoryAreaId(player, seen, party = []) {
  const avg = averagePartyLevel(party);
  if (!seen?.elder || !seen?.rival) return "luminara";
  if (!seen?.keeper) return avg < 7 ? "skyrailMeadow" : "echoCaves";
  if (!seen?.shrine) return avg < 9 ? "echoCaves" : "spiritMarsh";
  if (!seen?.bridgeCaptain) {
    if (avg < 13) return "verdantCanopy";
    if (avg < 17) return "prismRuins";
    if (avg < 21) return "ironrailYard";
    return "titanPass";
  }
  if (!seen?.dragon) {
    if (avg < 18) return "prismRuins";
    if (avg < 22) return "ironrailYard";
    if (avg < 24) return "sunkenArchive";
    if (avg < 26) return "nocturneRoad";
    if (avg < 28) return "phoenixRoost";
    return "calderaCrown";
  }
  return "postgame";
}
function areaGateSafety(areaId, party = [], seen = {}, player = {}) {
  const area = AREA_DATA[areaId] || AREA_DATA.luminara;
  const avg = averagePartyLevel(party);
  const max = maxPartyLevel(party);
  const min = area.levelMin || 3;
  const maxRec = area.levelMax || min + 6;
  const routeIndex = areaOrderIndex(areaId);
  const recommendedId = recommendedStoryAreaId(player, seen, party);
  const recommendedIndex = areaOrderIndex(recommendedId);
  let severity = "safe";
  let title = "Recommended";
  const warnings = [];

  if (areaId === "calderaCrown" && !seen.bridgeCaptain) {
    severity = "locked";
    title = "Story locked";
    warnings.push("This is the road to Dracinder. Defeat Bridge Captain Brann before taking this route.");
  } else if (routeIndex > recommendedIndex + 2 && !seen.dragon) {
    severity = "danger";
    title = "Far ahead";
    warnings.push(`This route is much later than your current story step. Recommended next story area: ${AREA_DATA[recommendedId]?.name || "Luminara"}.`);
  }

  if (avg < min - 8) {
    severity = severity === "locked" ? "locked" : "danger";
    title = severity === "locked" ? title : "Way too strong";
    warnings.push(`Your team's average level is about ${avg}. This area starts around Lv.${min}, so wild battles can overwhelm you quickly.`);
  } else if (avg < min - 4) {
    severity = severity === "locked" ? "locked" : "danger";
    title = severity === "locked" ? title : "Overpowered area";
    warnings.push(`Your team's average level is about ${avg}. This area starts around Lv.${min}.`);
  } else if (avg < min - 1) {
    severity = severity === "safe" ? "caution" : severity;
    title = severity === "caution" ? "Slightly underleveled" : title;
    warnings.push(`Your team's average level is about ${avg}. This area is recommended around Lv.${min}-${maxRec}.`);
  }

  if (!warnings.length) warnings.push(`Recommended levels: Lv.${min}-${maxRec}. Your highest Mythling is Lv.${max}.`);
  return { area, avg, max, min, maxRec, severity, title, warnings, recommendedId };
}
function routeTargetForArea(areaId) {
  const route = WORLD_ROUTE.find((r) => r.id === areaId);
  const gate = route?.gate || "";
  const match = gate.match(/\/\s*(.)$/);
  const tile = match ? match[1] : (areaId === "luminara" ? "N" : "0");
  return {
    areaId,
    tile,
    label: `${AREA_DATA[areaId]?.name || areaId} route`,
    icon: tile,
    detail: route?.story || AREA_DATA[areaId]?.description || "Follow the highlighted route gate."
  };
}

function areaUnlockHint(id) {
  const i = areaOrderIndex(id);
  if (i <= 1) return "Available early from Luminara.";
  if (i <= 3) return "Recommended after Rival Ren.";
  if (i <= 6) return "Recommended after Moon Keeper Sola / Shrine Key.";
  if (i <= 9) return "Recommended after Bridge Captain Brann.";
  return "Post-game legendary route.";
}

function currentAreaData(player) {
  const id = player?.area || "luminara";
  return AREA_DATA[id] || AREA_DATA.luminara;
}
function currentAreaMap(player) { return currentAreaData(player).map || MAP_DATA; }
function areaChapter(player) { return currentAreaData(player).chapter || 1; }
function scaleEncounterLevel(player, party, tile) {
  const area = currentAreaData(player);
  const lead = party?.[0]?.level || 5;
  const min = Math.max(2, area.levelMin || 3);
  const max = Math.max(min + 1, area.levelMax || 12);
  const storyBoost = Math.floor(((player?.trainerWins || 0) + (player?.badges || 0)) / 2);
  const base = min + Math.floor(Math.random() * Math.max(2, max - min + 1));
  const leadScaled = Math.floor(lead * 0.55) + storyBoost;
  return Math.max(min, Math.min(max + storyBoost, Math.max(base, leadScaled)));
}
function areaEncounterPool(tile, player) {
  const area = currentAreaData(player);
  return [...(((area.encounters || {})[tile]) || ENCOUNTERS[tile] || ENCOUNTERS.G)];
}

const LEGENDARY_DUNGEONS = {
  "1": { id: "solguard", title: "Sunken Sun Catacombs", condition: "Post-game morning encounter after Dracinder is defeated.", check: (g) => !!g.seen?.dragon && timeName(g.clock) === "Morning", fail: "The sun door is sealed. Return in the morning after restoring the Sky Prism.", level: 44, reward: "solguard", intro: "Ancient sunlight pours through the catacombs. Solguard lowers its golden wings." },
  "2": { id: "umbraclaw", title: "Nocturne Catacombs", condition: "Post-game night encounter with at least 20 Dex entries seen.", check: (g) => !!g.seen?.dragon && timeName(g.clock) === "Night" && dexStats(g.dex).seen >= 20, fail: "Only a tamer who has seen 20 Mythlings may disturb the Nocturne chains at night.", level: 46, reward: "umbraclaw", intro: "The torches go black. Umbraclaw steps out of an eclipse-shaped shadow." },
  "3": { id: "thalassor", title: "Tideglass Grotto", condition: "Post-game night encounter while carrying a Tide Pearl.", check: (g) => !!g.seen?.dragon && timeName(g.clock) === "Night" && (g.player?.items?.["Tide Pearl"] || 0) > 0, fail: "The Tideglass Grotto asks for nightfall and a Tide Pearl.", level: 48, reward: "thalassor", intro: "The cave floods with stars reflected in black water. Thalassor rises from the abyss." },
  "4": { id: "gaialith", title: "Verdant Catacombs", condition: "Post-game encounter after walking 120 steps.", check: (g) => !!g.seen?.dragon && (g.player?.steps || 0) >= 120, fail: "The root-gate sleeps. Walk 120 steps after the Prism is restored to wake it.", level: 50, reward: "gaialith", intro: "Roots crack the stone floor open. Gaialith awakens beneath the ancient forest." },
  "5": { id: "chronova", title: "Timeglass Labyrinth", condition: "Post-game encounter after catching 25 Mythlings.", check: (g) => !!g.seen?.dragon && dexStats(g.dex).caught >= 25, fail: "The time lock rejects you. Catch 25 Mythlings before challenging Chronova.", level: 52, reward: "chronova", intro: "The world freezes between seconds. Chronova unfolds from a prism clock." },
};

const freshPlayer = () => ({ area: "luminara", x: 3, y: 5, money: 1200, balls: 8, potions: 4, captureItems: { ...DEFAULT_CAPTURE_ITEMS }, items: { "Tide Pearl": 1, "Moon Shard": 0, "Sun Fossil": 0, "Potion": 4, "Super Potion": 0, "Revive Herb": 0, "Power Herb": 0, "Guard Herb": 0, "Antidote": 1, "Burn Salve": 1, "Ice Melt": 0, "Awakening": 1, "Paralyze Heal": 1, "Clarity Herb": 1, "Full Heal": 0 }, keys: [], quest: "Choose your first mythling.", steps: 0, trainerWins: 0, badges: 0, chapter: 1 });
const freshSeen = () => ({ elder: false, elderReward: false, rival: false, keeper: false, bridgeCaptain: false, shrine: false, dragon: false, chest: false });
const freshDex = () => ({ seen: {}, caught: {}, shinySeen: {}, shinyCaught: {} });
const freshClock = () => ({ day: 1, minute: 8 * 60 });
function timeName(clock) { const h = Math.floor(clock.minute / 60); if (h >= 6 && h < 11) return "Morning"; if (h >= 11 && h < 18) return "Day"; if (h >= 18 && h < 22) return "Evening"; return "Night"; }
function timeIcon(clock) {
  const n = timeName(clock);
  return n === "Morning" ? Sun : n === "Night" ? Moon : CloudSun;
}
function timeString(clock) { const h = Math.floor(clock.minute / 60); const m = clock.minute % 60; return `Day ${clock.day} · ${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")} · ${timeName(clock)}`; }
function formatOnlineSyncStamp(value) {
  if (!value) return "Never";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
function advanceClock(clock, minutes = 10) { let total = clock.minute + minutes; let day = clock.day; while (total >= 1440) { total -= 1440; day += 1; } return { day, minute: total }; }
function uid() { return Math.random().toString(36).slice(2) + Date.now().toString(36); }
function rollShiny(wild = false) { return Boolean(wild && Math.random() < SHINY_RATE); }
function shinyPalette(colors = ["#fff", "#ddd", "#111"], type = "Mystic") {
  const typeTint = {
    Flame: ["#fef08a", "#fb7185", "#7c2d12"], Aqua: ["#a5f3fc", "#60a5fa", "#1e3a8a"], Verdant: ["#ecfccb", "#a3e635", "#14532d"], Volt: ["#fef9c3", "#e879f9", "#312e81"], Shadow: ["#f5d0fe", "#7c3aed", "#020617"], Mystic: ["#f0abfc", "#67e8f9", "#312e81"], Ice: ["#ffffff", "#67e8f9", "#1e3a8a"], Light: ["#fefce8", "#facc15", "#7c2d12"], Crystal: ["#cffafe", "#f0abfc", "#155e75"], Metal: ["#f8fafc", "#94a3b8", "#0f172a"], Toxic: ["#d9f99d", "#c084fc", "#3f6212"], Spirit: ["#ddd6fe", "#818cf8", "#111827"], Beast: ["#fed7aa", "#f59e0b", "#431407"], Sound: ["#fbcfe8", "#93c5fd", "#4c1d95"]
  };
  return typeTint[type] || [colors[1] || colors[0], colors[2] || "#fff", colors[0] || "#111"];
}
function shinyName(mon) { return mon?.shiny ? `✦ ${displayName(mon)}` : displayName(mon); }
function rollGender(id) {
  const b = BESTIARY[id] || {};
  if (b.legendary || ["sprite", "whale"].includes(b.body)) return "—";
  const bias = b.body === "cat" ? 0.5 : b.body === "deer" ? 0.55 : b.body === "bird" ? 0.48 : 0.5;
  return Math.random() < bias ? "♀" : "♂";
}
function makeMon(id, level = 1, wild = false) { const b = BESTIARY[id] || BESTIARY.emberlynx; const [bhp, batk, bdef, bspd] = b.base; const hp = Math.floor(bhp + level * 7); return ensureMovePP({ uid: `${id}_${uid()}`, id, nickname: "", name: b.name, type: b.type, gender: rollGender(id), shiny: rollShiny(wild), level, xp: 0, nextXp: 42 + level * 22, hp, maxHp: hp, atk: Math.floor(batk + level * 2.4), def: Math.floor(bdef + level * 1.8), spd: Math.floor(bspd + level * 1.5), status: null, wild }); }
function displayName(m) { return m?.nickname || m?.name || BESTIARY[m?.id]?.name || "Mythling"; }
function normalizeMon(m) {
  const safeId = BESTIARY[m?.id] ? m.id : "emberlynx";
  const b = BESTIARY[safeId] || BESTIARY.emberlynx;
  const safeLevel = Math.max(1, Number(m?.level || 1));
  const mon = makeMon(safeId, safeLevel, Boolean(m?.wild));
  const maxHp = Math.max(1, Number(m?.maxHp || mon.maxHp || 1));
  const rawHp = Number(m?.hp ?? maxHp);
  return ensureMovePP({
    ...mon,
    ...(m || {}),
    id: safeId,
    uid: m?.uid || `${safeId}_${uid()}`,
    gender: m?.gender || mon.gender || rollGender(safeId),
    status: normalizeStatus(m?.status),
    name: b.name,
    type: b.type,
    level: safeLevel,
    hp: Math.max(0, Math.min(maxHp, Number.isFinite(rawHp) ? rawHp : maxHp)),
    maxHp
  });
}
function scaleMonToSpecies(old, newId) { const next = makeMon(newId, old.level, false); const ratio = old.hp / Math.max(1, old.maxHp); return ensureMovePP({ ...next, nickname: old.nickname || "", gender: old.gender || next.gender, shiny: Boolean(old.shiny), status: normalizeStatus(old.status), xp: old.xp, hp: Math.max(1, Math.floor(next.maxHp * ratio)) }); }
function migrateSave(input) {
  const data = input && typeof input === "object" ? input : {};
  const player = { ...freshPlayer(), ...(data.player || data.tamer || {}) }; player.items = { ...freshPlayer().items, ...(player.items || {}) }; if (!AREA_DATA[player.area]) player.area = "luminara"; if (typeof player.chapter !== "number") player.chapter = currentAreaData(player).chapter || 1; player.captureItems = { ...DEFAULT_CAPTURE_ITEMS, ...(player.captureItems || {}) }; if (typeof player.balls === "number" && !data.player?.captureItems) player.captureItems["Prism Capsule"] = player.balls; player.balls = Object.values(player.captureItems || {}).reduce((a,b)=>a + Number(b || 0), 0); if (typeof player.money !== "number") player.money = 1200; let party = Array.isArray(data.party) ? data.party.map(normalizeMon).filter((m) => BESTIARY[m.id]).slice(0, 6) : [];
  let storage = Array.isArray(data.storage) ? data.storage.map(normalizeMon).filter((m) => BESTIARY[m.id]) : [];
  if (!storage.length && Array.isArray(data.pc)) storage = data.pc.map(normalizeMon).filter((m) => BESTIARY[m.id]);
  if (!storage.length && Array.isArray(data.box)) storage = data.box.map(normalizeMon).filter((m) => BESTIARY[m.id]);
  if (!party.length && storage.length) {
    party = storage.slice(0, 6);
    storage = storage.slice(6);
  } const dex = ensureDexShape(data.dex || freshDex()); party.concat(storage).forEach((m) => { dex.seen[m.id] = true; dex.caught[m.id] = true; if (m.shiny) { dex.shinySeen[m.id] = true; dex.shinyCaught[m.id] = true; } }); const safeScreen = VALID_SCREENS.has(data.screen) ? data.screen : ((party.length || storage.length) ? "world" : "title"); return { version: 9, savedAt: Date.now(), screen: party.length ? (safeScreen === "battle" || safeScreen === "gameover" || safeScreen === "starter" ? "world" : safeScreen || "world") : "title", storyIndex: data.storyIndex || 0, player, party, storage, active: Math.min(data.active || 0, Math.max(0, party.length - 1)), seen: { ...freshSeen(), ...(data.seen || {}) }, dex, clock: data.clock || freshClock(), muted: Boolean(data.muted) }; }
function typeMult(a, d) {
  const chart = TYPE_MATCHUPS[a] || {};
  let mult = 1;
  if ((chart.strong || []).includes(d)) mult *= 1.6;
  if ((chart.weak || []).includes(d)) mult *= 0.625;
  return mult;
}
function typeText(mult) {
  if (mult >= 1.55) return " — super effective!";
  if (mult <= 0.65) return " — resisted.";
  return ".";
}
function moveAccuracy(attacker, defender, skill) {
  const base = typeof skill.accuracy === "number" ? skill.accuracy : skill.kind === "attack" ? 0.94 : 1;
  const speedDelta = Math.max(-0.07, Math.min(0.07, (effectiveSpeed(attacker) - effectiveSpeed(defender)) / 500));
  return Math.max(0.72, Math.min(0.99, base + speedDelta));
}
function critChance(attacker, defender, skill) {
  const base = typeof skill.crit === "number" ? skill.crit : 0.08;
  const speedBonus = Math.max(0, Math.min(0.10, (effectiveSpeed(attacker) - effectiveSpeed(defender)) / 350));
  return Math.max(0.03, Math.min(0.32, base + speedBonus));
}
function resolveMove(attacker, defender, skillName, guarding = false) {
  const skill = SKILLS[skillName] || SKILLS.Guard;
  if (skill.kind !== "attack") return { hit: true, damage: 0, mult: 1, crit: false, stab: 1, accuracy: 1 };
  const accuracy = moveAccuracy(attacker, defender, skill);
  if (Math.random() > accuracy) return { hit: false, damage: 0, mult: 1, crit: false, stab: 1, accuracy };

  // Pokémon-inspired damage core:
  // floor((floor(((2*Level/5+2) * Power * Attack / Defense) / 50) + 2) * Modifier)
  // Modifier includes random 0.85-1.00, STAB, type, critical, guard, and a Mythbound wild penalty.
  const mult = typeMult(skill.type, defender.type);
  const stab = attacker.type === skill.type ? 1.25 : 1;
  const crit = Math.random() < critChance(attacker, defender, skill);
  const critMult = crit ? 1.5 : 1;
  const guardMult = guarding ? 0.5 : 1;
  const wildAttackerMult = attacker.wild ? 0.82 : 1;
  const level = Math.max(1, Math.floor(attacker.level || 1));
  const offense = Math.max(1, effectiveAttack(attacker));
  const defense = Math.max(1, defender.def || 1);
  const power = Math.max(1, skill.power || 1);
  const base = Math.floor(Math.floor((((2 * level / 5 + 2) * power * offense) / defense) / 50) + 2);
  const randomSpread = 0.85 + Math.random() * 0.15;
  const levelGap = Math.max(0.82, Math.min(1.18, 1 + ((level - (defender.level || 1)) * 0.012)));
  const raw = base * randomSpread * stab * mult * critMult * guardMult * wildAttackerMult * levelGap;
  const damage = Math.max(1, Math.floor(raw));
  return { hit: true, damage, mult, crit, stab, accuracy };
}
function hasDexBattleInfo(dex, enemy) {
  if (!enemy?.id) return false;
  return Boolean(dex?.seen?.[enemy.id] || dex?.caught?.[enemy.id]);
}
function effectivenessLabel(mult) {
  if (mult > 1.01) return "Super effective";
  if (mult < 0.99) return "Not very effective";
  return "Neutral";
}
function effectivenessClass(mult) {
  if (mult > 1.01) return "bg-lime-300 text-slate-950 border-lime-100";
  if (mult < 0.99) return "bg-rose-300 text-slate-950 border-rose-100";
  return "bg-slate-200 text-slate-900 border-slate-300";
}
function typeButtonClass(type, disabled = false) {
  const tone = {
    Flame: "from-orange-200 to-rose-300 border-orange-300",
    Aqua: "from-cyan-100 to-blue-300 border-cyan-300",
    Verdant: "from-lime-100 to-emerald-300 border-lime-300",
    Volt: "from-yellow-100 to-fuchsia-200 border-yellow-300",
    Stone: "from-stone-200 to-amber-400 border-amber-500",
    Air: "from-sky-100 to-indigo-200 border-sky-300",
    Shadow: "from-purple-300 to-slate-700 border-purple-300 text-white",
    Mystic: "from-violet-100 to-fuchsia-300 border-fuchsia-300",
    Ice: "from-cyan-50 to-blue-200 border-cyan-200",
    Light: "from-yellow-50 to-orange-200 border-yellow-200",
    Metal: "from-slate-100 to-zinc-400 border-slate-400",
    Crystal: "from-cyan-100 to-fuchsia-200 border-cyan-200",
    Toxic: "from-lime-200 to-purple-400 border-lime-300",
    Spirit: "from-indigo-100 to-slate-500 border-indigo-300",
    Beast: "from-orange-200 to-yellow-700 border-orange-300",
    Sound: "from-pink-100 to-indigo-300 border-pink-300",
  }[type] || "from-slate-100 to-slate-300 border-slate-300";
  return `justify-start rounded-md bg-gradient-to-br ${tone} ${disabled ? "opacity-45" : "hover:brightness-110"} text-slate-950 border h-auto py-0.5 px-1.5 min-h-[38px] shadow-sm`;
}
function moveSummary(skillName, mon, targetType, dex = null, enemy = null) {
  const sk = SKILLS[skillName] || SKILLS.Guard;
  if (sk.kind === "heal") return `Heal ~20-25% HP · ${ppText(mon, skillName)} · A100%`;
  if (sk.kind === "guard") return `Guard · ${ppText(mon, skillName)} · Reduces damage`;
  const acc = Math.round((sk.accuracy ?? 0.94) * 100);
  const crit = Math.round((sk.crit ?? 0.08) * 100);
  const stab = mon?.type === sk.type ? " · STAB" : "";
  const canShowEffectiveness = enemy ? hasDexBattleInfo(dex, enemy) : Boolean(targetType);
  const mult = targetType ? typeMult(sk.type, targetType) : 1;
  const adv = canShowEffectiveness && targetType ? ` · ${effectivenessLabel(mult)}` : enemy ? " · Effect unknown" : "";
  return `P${sk.power} · ${ppText(mon, skillName)} · A${acc}% · C${crit}%${stab}${adv}`;
}

function estimateCaptureChance(enemy, player, itemName, clock, battleMode = "wild") {
  const item = CAPTURE_ITEMS[itemName] ? itemName : "Prism Capsule";
  if (!enemy || !BESTIARY[enemy.id]) return 0;
  const hpFactor = 1 - Number(enemy.hp || 0) / Math.max(1, Number(enemy.maxHp || 1));
  const tileBonus = item === "Dusk Prism" && ["Night"].includes(timeName(clock)) ? CAPTURE_ITEMS[item].nightMultiplier || 1 : CAPTURE_ITEMS[item].multiplier;
  const earlyBonus = item === "Quick Prism" && enemy.hp === enemy.maxHp ? 1.35 : 1;
  const legendPenalty = BESTIARY[enemy.id]?.legendary ? 0.42 : 1;
  const max = BESTIARY[enemy.id]?.legendary ? 0.32 : 0.94;
  return Math.max(0.01, Math.min(max, (BESTIARY[enemy.id].capture + hpFactor * 0.57 + (battleMode === "legend" ? -0.18 : 0)) * tileBonus * earlyBonus * legendPenalty));
}
function bestMoveSuggestion(mon, enemy) {
  if (!mon || !enemy) return null;
  const usable = skills(mon).filter((s) => hasPP(mon, s));
  if (!usable.length) return null;
  let best = usable[0], bestScore = -Infinity;
  usable.forEach((s) => {
    const sk = SKILLS[s] || SKILLS.Guard;
    const score = (sk.kind === "attack" ? sk.power : sk.kind === "heal" ? 10 : 6) * (sk.kind === "attack" ? typeMult(sk.type, enemy.type) : 1) * (mon.type === sk.type ? 1.25 : 1) * (sk.accuracy ?? 1);
    if (score > bestScore) { best = s; bestScore = score; }
  });
  return best;
}
function lowPPWarnings(party) {
  return (party || []).flatMap((m) => {
    const mm = ensureMovePP(m);
    return skills(mm).filter((s) => {
      const max = maxPPForSkill(s);
      const cur = mm.movePP?.[s] ?? max;
      return cur <= Math.max(2, Math.floor(max * 0.18));
    }).map((s) => `${displayName(mm)}: ${s} ${ppText(mm, s)}`);
  });
}

function skills(mon) { return (BESTIARY[mon.id]?.skills || ["Guard"]).filter((s) => !SKILLS[s].unlock || mon.level >= SKILLS[s].unlock); }
function dexStats(dex) {
  const safeDex = dex || freshDex();
  const seen = safeDex.seen || {};
  const caught = safeDex.caught || {};
  const shinySeen = safeDex.shinySeen || {};
  const shinyCaught = safeDex.shinyCaught || {};
  return {
    seen: DEX_ORDER.filter((id) => Boolean(seen[id])).length,
    caught: DEX_ORDER.filter((id) => Boolean(caught[id])).length,
    shinySeen: DEX_ORDER.filter((id) => Boolean(shinySeen[id])).length,
    shinyCaught: DEX_ORDER.filter((id) => Boolean(shinyCaught[id])).length,
    total: DEX_ORDER.length
  };
}
function ensureDexShape(dex) {
  const base = freshDex();
  return {
    seen: { ...base.seen, ...((dex || {}).seen || {}) },
    caught: { ...base.caught, ...((dex || {}).caught || {}) },
    shinySeen: { ...base.shinySeen, ...((dex || {}).shinySeen || {}) },
    shinyCaught: { ...base.shinyCaught, ...((dex || {}).shinyCaught || {}) },
  };
}

function parseMaybeJson(value) {
  if (!value) return value;
  if (typeof value === "string") {
    try { return JSON.parse(value); } catch { return value; }
  }
  return value;
}
function firstCloudSaveCandidate(profile) {
  const p = profile || {};
  const candidates = [
    p.save_data,
    p.saveData,
    p.save,
    p.game_save,
    p.gameSave,
    p.state,
    p.data,
    p.backup,
  ].map(parseMaybeJson).filter(Boolean);
  for (const c of candidates) {
    if (typeof c === "object" && (Array.isArray(c.party) || Array.isArray(c.storage) || c.player || c.dex || c.screen)) return c;
    if (typeof c === "object" && c.save_data) {
      const nested = parseMaybeJson(c.save_data);
      if (nested && typeof nested === "object") return nested;
    }
  }
  return null;
}
function recoverCloudSaveFromProfile(profile) {
  if (!profile) return null;
  const direct = firstCloudSaveCandidate(profile);
  if (direct) return direct;

  const partySnapshot = parseMaybeJson(profile.party_snapshot || profile.partySnapshot || profile.party);
  const storageSnapshot = parseMaybeJson(profile.storage_snapshot || profile.storageSnapshot || profile.storage || profile.pc || profile.box);
  const inventorySnapshot = parseMaybeJson(profile.inventory_snapshot || profile.inventorySnapshot || profile.inventory || profile.player);
  const dexSnapshot = parseMaybeJson(profile.dex || profile.dex_snapshot || profile.dexSnapshot);

  const party = Array.isArray(partySnapshot) ? partySnapshot : [];
  const storage = Array.isArray(storageSnapshot) ? storageSnapshot : [];
  const player = (inventorySnapshot && typeof inventorySnapshot === "object")
    ? (inventorySnapshot.player && typeof inventorySnapshot.player === "object" ? inventorySnapshot.player : inventorySnapshot)
    : freshPlayer();

  if (!party.length && !storage.length && !profile.dex_caught) return null;

  return {
    version: Number(profile.save_version || profile.saveVersion || 1),
    savedAt: profile.last_save_at || profile.updated_at || Date.now(),
    screen: party.length || storage.length ? "world" : "title",
    storyIndex: 0,
    player,
    party,
    storage,
    active: 0,
    seen: freshSeen(),
    dex: dexSnapshot && typeof dexSnapshot === "object" ? dexSnapshot : freshDex(),
    clock: freshClock(),
    muted: false,
    _recoveredFromProfileSnapshot: true,
  };
}
function cloudSaveSummary(profile) {
  const save = recoverCloudSaveFromProfile(profile);
  if (!save) return "No recoverable cloud save found.";
  const party = Array.isArray(save.party) ? save.party.length : 0;
  const storage = Array.isArray(save.storage) ? save.storage.length : 0;
  const version = save.version || profile?.save_version || "?";
  const savedAt = profile?.last_save_at || profile?.updated_at || save.savedAt;
  return `Recoverable cloud save: party ${party}, PC/storage ${storage}, version ${version}, saved ${formatOnlineSyncStamp(savedAt)}.`;
}

function captureCount(player, item = "Prism Capsule") { return Number((player.captureItems || {})[item] || 0); }
function totalCaptureItems(player) { return Object.values(player.captureItems || {}).reduce((a,b)=>a + Number(b || 0), 0); }
function syncBallCount(player) { return { ...player, balls: totalCaptureItems(player) }; }
function buyItemIntoPlayer(player, stock) { const price = stock.kind === "capture" ? CAPTURE_ITEMS[stock.item].price : stock.price; if ((player.money || 0) < price) return null; if (stock.kind === "capture") { const captureItems = { ...(player.captureItems || {}) }; captureItems[stock.item] = (captureItems[stock.item] || 0) + 1; return syncBallCount({ ...player, money: player.money - price, captureItems }); } const items = { ...(player.items || {}) }; items[stock.item] = (items[stock.item] || 0) + 1; const potions = stock.item === "Potion" ? (player.potions || 0) + 1 : player.potions; return { ...player, money: player.money - price, items, potions }; }

function canEvolve(mon, player, seen, clock) { const evo = BESTIARY[mon.id]?.evo; if (!evo) return null; const method = evo.method; const tod = timeName(clock); if (method.includes("Lv.")) { const req = Number((method.match(/[0-9]+/) || [999])[0]); if (mon.level < req) return null; } if (method.includes("trainer") && (player.trainerWins || 0) < 2) return null; if (method.includes("Tide Pearl") && (player.items?.["Tide Pearl"] || 0) <= 0) return null; if (method.includes("Moon Shard") && (player.items?.["Moon Shard"] || 0) <= 0) return null; if (method.includes("Sun Fossil") && (player.items?.["Sun Fossil"] || 0) <= 0) return null; if (method.includes("Walk 35") && (player.steps || 0) < 35) return null; if (method.includes("Walk 90") && ((player.steps || 0) < 90 || !seen.shrine)) return null; if (method.includes("Win 3") && (player.trainerWins || 0) < 3) return null; if (method.includes("after shrine") && !seen.shrine) return null; if (method.includes("main story") && !seen.dragon) return null; if (method.includes("night") && tod !== "Night") return null; if (method.includes("morning") && tod !== "Morning") return null; return evo; }

function xpPercent(mon) {
  if (!mon || !mon.nextXp) return 0;
  return Math.max(0, Math.min(100, Math.round((Number(mon.xp || 0) / Math.max(1, Number(mon.nextXp || 1))) * 100)));
}
function genderClass(gender) {
  if (gender === "♂") return "text-sky-300 border-sky-300/40 bg-sky-400/10";
  if (gender === "♀") return "text-pink-300 border-pink-300/40 bg-pink-400/10";
  return "text-slate-300 border-slate-300/30 bg-slate-400/10";
}
function GenderMark({ mon }) {
  const gender = mon?.gender || "—";
  return <span className={`inline-flex items-center justify-center rounded-full border px-2 py-0.5 text-xs font-black ${genderClass(gender)}`}>{gender}</span>;
}
function XPBar({ mon, label = true, compact = false, beforePercent = null, afterPercent = null }) {
  const current = afterPercent ?? xpPercent(mon);
  const previous = beforePercent ?? current;
  return <div className={compact ? "mt-1" : "mt-2"}>
    {label && <div className="flex justify-between text-[11px] text-slate-300 mb-1"><span>XP</span><span>{mon?.xp || 0}/{mon?.nextXp || 0}</span></div>}
    <div className="relative h-2.5 rounded-full bg-black/35 border border-white/10 overflow-hidden">
      <motion.div className="absolute inset-y-0 left-0 bg-cyan-900/60" initial={{ width: `${previous}%` }} animate={{ width: `${previous}%` }} />
      <motion.div className="absolute inset-y-0 left-0 bg-gradient-to-r from-cyan-300 via-lime-200 to-yellow-200" initial={{ width: `${previous}%` }} animate={{ width: `${current}%` }} transition={{ duration: 0.85, ease: "easeOut" }} />
    </div>
  </div>;
}
function hpPercent(mon) {
  return Math.max(0, Math.min(100, Math.round((Number(mon?.hp || 0) / Math.max(1, Number(mon?.maxHp || 1))) * 100)));
}
function rewardItemText(items = []) {
  if (!items.length) return "No item drops";
  return items.map((it) => `${it.name} x${it.qty}`).join(", ");
}

function TypeBadge({ type }) { const Icon = TYPES[type]?.icon || Sparkles; return <Badge className={`bg-gradient-to-r ${TYPES[type]?.color || TYPES.Mystic.color} text-slate-950 border-0 font-black`}><Icon className="w-3.5 h-3.5 mr-1" />{type}</Badge>; }
function MonsterModel({ mon, size = "large", flipped = false, faint = false, anim = "idle", silhouette = false }) {
  const data = BESTIARY[mon.id] || BESTIARY.emberlynx;
  const [a,b,c] = silhouette ? ["#020617", "#020617", "#020617"] : (mon.shiny ? shinyPalette(data.colors, data.type) : data.colors);
  const scale = size === "tiny" ? 0.42 : size === "small" ? 0.55 : size === "medium" ? 0.78 : 1;
  const stage = data.stage || 1;
  const uid = mon.uid || mon.id;
  const motionAnim = anim === "captured" ? { scale: 0.05, opacity: 0, y: -30 } : anim === "captureIn" ? { scale: [1, 0.45, 0.08], opacity: [1, 0.7, 0], y: [0, -18, -34] } : anim === "escape" ? { scale: [0.08, 1.15, 1], opacity: [0, 1, 1], y: [-34, -10, 0] } : anim === "attack"
    ? { x: flipped ? -36 : 36, scale: 1.08 }
    : anim === "hit"
    ? { x: [0, -10, 10, -6, 6, 0], filter: ["brightness(1)", "brightness(2)", "brightness(1)"] }
    : anim === "heal"
    ? { y: [0, -14, 0], scale: [1, 1.08, 1] }
    : { y: faint ? 18 : [0, -7, 0], rotate: faint ? -10 : [0, 1.5, 0, -1.5, 0] };
  const eyeY = data.body === "bird" ? 92 : data.body === "buddy" ? 97 : 104;
  const bodyScale = stage === 3 ? 1.12 : stage === 2 ? 1.04 : 1;
  const status = normalizeStatus(mon.status);
  const isLegendModel = Boolean(BESTIARY[mon.id]?.legendary);
  const statusGlyphs = {
    sleep: ["Z", "z", "Z"],
    poison: ["●", "◌", "●"],
    burn: ["♨", "火", "♨"],
    frozen: ["❄", "✦", "❄"],
    paralyzed: ["ϟ", "⚡", "ϟ"],
    confuse: ["?", "↺", "?"],
  };
  return <motion.div animate={{ ...motionAnim, opacity: faint ? 0.45 : 1 }} transition={{ duration: anim === "idle" ? 3 : 0.38, repeat: anim === "idle" && !faint ? Infinity : 0 }} className={`relative ${flipped ? "scale-x-[-1]" : ""}`} style={{ width: 220 * scale, height: 200 * scale }}>
    <div className="absolute inset-0 rounded-full blur-2xl opacity-50" style={{ background: silhouette ? "#000" : a }} />
    {isLegendModel && !silhouette && <motion.div className="absolute inset-[-12px] rounded-full border-4 border-yellow-200/30 z-10 pointer-events-none" animate={{ rotate:360, scale:[0.95,1.05,0.95] }} transition={{ rotate:{duration:7,repeat:Infinity,ease:"linear"}, scale:{duration:1.8,repeat:Infinity} }}/>} 
    {stage >= 3 && !silhouette && <motion.div className="absolute inset-[-8px] rounded-full border-2 border-white/20 z-10 pointer-events-none" animate={{ opacity:[0.25,0.7,0.25], scale:[0.92,1.08,0.92] }} transition={{ duration:2.2, repeat:Infinity }}/>} 
    {mon.shiny && !silhouette && <div className="absolute inset-0 z-30 pointer-events-none">{[0,1,2,3,4].map((i)=><motion.div key={i} className="absolute text-yellow-100 drop-shadow-lg font-black" style={{left:`${18+i*16}%`, top:`${8+(i%2)*18}%`}} animate={{scale:[0.5,1.25,0.5], opacity:[0.25,1,0.25], rotate:[0,180,360]}} transition={{duration:1.25+i*0.15, repeat:Infinity, delay:i*0.12}}>✦</motion.div>)}</div>}
    {status && <div className="absolute inset-0 z-20 pointer-events-none">
      {(statusGlyphs[status.key] || ["✦","✧","✦"]).map((g, i) => <motion.div
        key={i}
        className={`absolute font-black drop-shadow-lg ${status.key === "burn" ? "text-orange-300" : status.key === "poison" ? "text-lime-300" : status.key === "frozen" ? "text-cyan-100" : status.key === "paralyzed" ? "text-yellow-200" : status.key === "sleep" ? "text-indigo-100" : "text-fuchsia-200"}`}
        style={{ left: `${26 + i * 22}%`, top: `${8 + (i % 2) * 12}%`, fontSize: `${18 * scale + i * 4}px` }}
        animate={{ y: status.key === "sleep" ? [-2, -18, -2] : [-3, 5, -3], x: status.key === "confuse" ? [-6, 6, -6] : [0, 2, 0], opacity: [0.25, 1, 0.25], rotate: status.key === "confuse" ? [0, 180, 360] : [0, 8, -8, 0] }}
        transition={{ duration: 1.35 + i * 0.2, repeat: Infinity, delay: i * 0.18 }}
      >{g}</motion.div>)}
      {status.key === "frozen" && <motion.div className="absolute inset-6 rounded-full border-4 border-cyan-100/45 bg-cyan-200/10" animate={{ opacity: [0.2, 0.65, 0.2] }} transition={{ duration: 1.2, repeat: Infinity }} />}
      {status.key === "burn" && <motion.div className="absolute inset-x-8 bottom-8 h-14 rounded-full bg-orange-500/25 blur-xl" animate={{ scale: [0.8, 1.15, 0.8], opacity: [0.25, 0.7, 0.25] }} transition={{ duration: 0.9, repeat: Infinity }} />}
      {status.key === "poison" && <motion.div className="absolute inset-x-10 bottom-10 h-12 rounded-full bg-lime-400/25 blur-xl" animate={{ scale: [0.8, 1.2, 0.8], opacity: [0.15, 0.6, 0.15] }} transition={{ duration: 1.1, repeat: Infinity }} />}
    </div>}
    <svg viewBox="0 0 240 215" className="relative drop-shadow-2xl w-full h-full">
      <defs>
        <linearGradient id={`g-${uid}`} x1="0" x2="1" y1="0" y2="1"><stop offset="0%" stopColor={a}/><stop offset="52%" stopColor={b}/><stop offset="100%" stopColor={c}/></linearGradient>
        <radialGradient id={`gem-${uid}`}><stop offset="0%" stopColor="#fff"/><stop offset="55%" stopColor={b}/><stop offset="100%" stopColor={a}/></radialGradient>
        <filter id={`soft-${uid}`}><feGaussianBlur stdDeviation="1.6"/></filter>
      </defs>
      <ellipse cx="120" cy="184" rx="78" ry="16" fill="rgba(0,0,0,.32)"/>{data.legendary && !silhouette && <><motion.circle cx="120" cy="106" r="91" fill="none" stroke={b} strokeWidth="3" strokeDasharray="10 9" animate={{ rotate: 360 }} style={{ transformOrigin: "120px 106px" }} transition={{ duration: 8, repeat: Infinity, ease: "linear" }}/><circle cx="120" cy="106" r="74" fill="none" stroke="white" strokeOpacity=".22" strokeWidth="4"/><path d="M120 8 L130 38 L162 36 L136 55 L148 84 L120 65 L92 84 L104 55 L78 36 L110 38Z" fill={b} opacity=".9"/></>}
      <g transform={`translate(${120 - 120*bodyScale} ${108 - 108*bodyScale}) scale(${bodyScale})`}>
        {data.body === "bird" && <><path d="M77 113 C28 76 38 48 95 82 C83 95 82 107 77 113Z" fill={c} opacity=".86" stroke="white" strokeOpacity=".25" strokeWidth="2"/><path d="M156 113 C205 76 195 48 138 82 C150 95 151 107 156 113Z" fill={c} opacity=".86" stroke="white" strokeOpacity=".25" strokeWidth="2"/></>}
        {data.body === "dragon" && <><path d="M72 111 C22 77 39 43 99 80 C82 95 81 106 72 111Z" fill={c} opacity=".82" stroke="white" strokeOpacity=".25" strokeWidth="2"/><path d="M158 111 C208 77 191 43 131 80 C148 95 149 106 158 111Z" fill={c} opacity=".82" stroke="white" strokeOpacity=".25" strokeWidth="2"/><path d="M105 60 L116 25 L130 61" fill={b} stroke="white" strokeOpacity=".45" strokeWidth="2"/></>}
        {data.body === "deer" && <><path d="M82 67 C62 37 68 20 80 18 C88 40 96 52 103 62" fill="none" stroke={c} strokeWidth="8" strokeLinecap="round"/><path d="M143 67 C163 37 157 20 145 18 C137 40 129 52 122 62" fill="none" stroke={c} strokeWidth="8" strokeLinecap="round"/><circle cx="88" cy="46" r="7" fill={b}/><circle cx="147" cy="46" r="7" fill={b}/></>}
        {data.body === "cat" && <><path d="M65 86 L76 43 L94 80" fill={a} stroke="white" strokeOpacity=".35" strokeWidth="2"/><path d="M141 80 L157 43 L161 88" fill={a} stroke="white" strokeOpacity=".35" strokeWidth="2"/><path d="M164 122 C207 107 212 158 171 150" fill="none" stroke={b} strokeWidth="14" strokeLinecap="round"/></>}
        {data.body === "roo" && <><path d="M83 71 L68 34 L98 59" fill={a}/><path d="M136 70 L154 35 L147 80" fill={a}/><path d="M154 140 C199 145 185 181 138 162" fill="none" stroke={c} strokeWidth="16" strokeLinecap="round"/></>}
        {data.body === "lizard" && <><path d="M164 130 C210 118 215 160 170 153" fill="none" stroke={a} strokeWidth="14" strokeLinecap="round"/><path d="M109 57 L117 32 L126 57" fill={b}/></>}
        {data.body === "boar" && <><path d="M72 77 L51 48 L85 63" fill={c} opacity=".8"/><path d="M156 77 L180 49 L168 90" fill={c} opacity=".8"/></>}
        {data.body === "bear" && <><circle cx="78" cy="75" r="18" fill={c} opacity=".9"/><circle cx="152" cy="75" r="18" fill={c} opacity=".9"/></>}
        {data.body === "mole" && <><path d="M77 149 L45 174" stroke={c} strokeWidth="13" strokeLinecap="round"/><path d="M151 149 L184 174" stroke={c} strokeWidth="13" strokeLinecap="round"/></>}
        {data.body === "sprite" && <><path d="M80 98 C46 70 58 45 101 78" fill={b} opacity=".55"/><path d="M150 98 C184 70 172 45 129 78" fill={b} opacity=".55"/></>}
        {data.body === "whale" && <><path d="M52 114 C23 86 33 62 68 84" fill={c} opacity=".9"/><path d="M164 101 C199 79 212 104 172 124" fill={c} opacity=".82"/></>}
        {data.body === "fox" && <><path d="M63 87 L72 42 L100 78" fill={a} stroke="white" strokeOpacity=".38" strokeWidth="2"/><path d="M137 79 L166 42 L158 91" fill={a} stroke="white" strokeOpacity=".38" strokeWidth="2"/><path d="M163 126 C204 94 220 139 184 155 C205 162 186 186 157 158" fill="none" stroke={b} strokeWidth="12" strokeLinecap="round"/><circle cx="116" cy="118" r="7" fill={b} opacity=".9"/></>}
        {data.body === "turtle" && <><ellipse cx="116" cy="130" rx="63" ry="42" fill={c} opacity=".7" stroke="white" strokeOpacity=".28" strokeWidth="2"/><path d="M72 130 C86 102 145 101 160 130 C144 150 89 151 72 130Z" fill={b} opacity=".45"/><path d="M57 154 L34 171" stroke={c} strokeWidth="11" strokeLinecap="round"/><path d="M171 154 L195 171" stroke={c} strokeWidth="11" strokeLinecap="round"/></>}
        {data.body === "serpent" && <><path d="M62 142 C80 92 126 170 157 112 C174 80 206 101 189 135" fill="none" stroke={c} strokeWidth="18" strokeLinecap="round" opacity=".86"/><path d="M83 65 L113 36 L142 65" fill={b} opacity=".9" stroke="white" strokeOpacity=".35" strokeWidth="2"/><circle cx="188" cy="130" r="10" fill={b} opacity=".8"/></>}
        {data.body === "crab" && <><path d="M66 120 C30 103 32 78 67 91" fill="none" stroke={c} strokeWidth="12" strokeLinecap="round"/><path d="M166 120 C202 103 200 78 165 91" fill="none" stroke={c} strokeWidth="12" strokeLinecap="round"/><circle cx="48" cy="86" r="14" fill={b} stroke="white" strokeOpacity=".35" strokeWidth="2"/><circle cx="185" cy="86" r="14" fill={b} stroke="white" strokeOpacity=".35" strokeWidth="2"/><path d="M75 154 L54 177" stroke={c} strokeWidth="8" strokeLinecap="round"/><path d="M154 154 L176 177" stroke={c} strokeWidth="8" strokeLinecap="round"/></>}
        {data.body === "phoenix" && <><path d="M78 115 C18 72 34 28 105 76 C86 92 83 104 78 115Z" fill={b} opacity=".88" stroke="white" strokeOpacity=".3" strokeWidth="2"/><path d="M154 115 C214 72 198 28 127 76 C146 92 149 104 154 115Z" fill={b} opacity=".88" stroke="white" strokeOpacity=".3" strokeWidth="2"/><path d="M113 56 L122 20 L136 58 L124 51" fill={c} stroke="white" strokeOpacity=".4" strokeWidth="2"/><path d="M96 164 C110 199 130 198 145 164" fill={c} opacity=".78"/></>}
        {data.body === "wolf" && <><path d="M64 90 L55 46 L90 76" fill={c} stroke="white" strokeOpacity=".28" strokeWidth="2"/><path d="M143 76 L176 46 L164 96" fill={c} stroke="white" strokeOpacity=".28" strokeWidth="2"/><path d="M158 137 C206 128 207 164 168 164" fill="none" stroke={c} strokeWidth="13" strokeLinecap="round"/><path d="M78 154 L55 184" stroke={c} strokeWidth="10" strokeLinecap="round"/><path d="M149 154 L170 184" stroke={c} strokeWidth="10" strokeLinecap="round"/></>}
        {data.body === "flower" && <><circle cx="116" cy="86" r="34" fill={b} opacity=".75"/><circle cx="88" cy="104" r="28" fill={b} opacity=".55"/><circle cx="146" cy="104" r="28" fill={b} opacity=".55"/><path d="M116 117 C101 146 100 167 116 184 C133 167 132 146 116 117Z" fill={c} opacity=".75"/><path d="M86 151 C58 139 49 159 68 177" stroke={c} strokeWidth="9" strokeLinecap="round"/><path d="M146 151 C174 139 183 159 164 177" stroke={c} strokeWidth="9" strokeLinecap="round"/></>}
        {data.body === "buddy" && <><path d="M114 36 L108 12 L119 24 L127 10 L128 34" fill={c} stroke="white" strokeOpacity=".35" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M158 138 C194 128 200 156 172 158" fill="none" stroke={c} strokeWidth="11" strokeLinecap="round"/><path d="M92 148 C71 162 68 180 91 181" fill="none" stroke={b} strokeWidth="10" strokeLinecap="round"/><path d="M60 118 C40 104 42 86 63 89" fill="none" stroke={b} strokeWidth="9" strokeLinecap="round"/><path d="M51 56 C40 47 42 32 55 29" fill="none" stroke={c} strokeWidth="4" strokeLinecap="round" opacity=".7"/><path d="M45 68 C31 62 30 47 41 40" fill="none" stroke={c} strokeWidth="4" strokeLinecap="round" opacity=".55"/></>}


        <path d="M55 124 C44 83 76 56 116 58 C158 60 184 91 171 130 C160 162 133 178 99 171 C70 165 60 150 55 124Z" fill={`url(#g-${uid})`} stroke="white" strokeOpacity=".72" strokeWidth="3.2"/>
        {data.body === "boar" && <><ellipse cx="116" cy="131" rx="27" ry="18" fill={b} opacity=".95"/><circle cx="107" cy="130" r="4" fill="#111827"/><circle cx="126" cy="130" r="4" fill="#111827"/><path d="M83 132 Q64 151 86 150" fill="none" stroke="#fff7d6" strokeWidth="7"/><path d="M149 132 Q168 151 146 150" fill="none" stroke="#fff7d6" strokeWidth="7"/></>}
        {stage >= 2 && <><path d="M82 70 Q116 47 151 70" fill="none" stroke={b} strokeWidth="5" strokeLinecap="round" opacity=".9"/><circle cx="116" cy="118" r="9" fill={`url(#gem-${uid})`} stroke="white" strokeOpacity=".75" strokeWidth="2"/></>}
        {stage >= 3 && <><path d="M74 51 L87 32 L99 53" fill={b} stroke="white" strokeOpacity=".5"/><path d="M134 53 L149 31 L159 55" fill={b} stroke="white" strokeOpacity=".5"/><path d="M75 153 C95 168 139 169 158 153" fill="none" stroke="white" strokeOpacity=".55" strokeWidth="4" strokeLinecap="round"/></>}
        <circle cx="92" cy={eyeY} r="8" fill="#111827"/><circle cx="95" cy={eyeY-3} r="2.7" fill="white"/><circle cx="134" cy={eyeY} r="8" fill="#111827"/><circle cx="137" cy={eyeY-3} r="2.7" fill="white"/>
        <path d="M108 122 Q116 130 126 122" stroke="#111827" strokeWidth="4" fill="none" strokeLinecap="round"/>
        {!silhouette && <><circle cx="72" cy="132" r="5" fill="white" opacity=".16"/><circle cx="155" cy="128" r="4" fill="white" opacity=".18"/><path d="M87 91 C102 82 128 82 145 92" stroke="white" strokeOpacity=".2" strokeWidth="3" fill="none" strokeLinecap="round"/></>}
      </g>
    </svg>
  </motion.div>;
}

function MythboundTamersJRPGInner() {
  const [screen, setScreen] = useState("title");
  const [storyIndex, setStoryIndex] = useState(0);
  const [player, setPlayer] = useState(freshPlayer());
  const [party, setParty] = useState([]);
  const [storage, setStorage] = useState([]);
  const [active, setActive] = useState(0);
  const [battle, setBattle] = useState(null);
  const [toast, setToast] = useState(null);
  const [npc, setNpc] = useState(null);
  const [cinematic, setCinematic] = useState(null);
  const [pendingAreaGate, setPendingAreaGate] = useState(null);
  const [objectiveModal, setObjectiveModal] = useState(null);
  const [objectiveMapFocus, setObjectiveMapFocus] = useState(null);
  const [evolutionScene, setEvolutionScene] = useState(null);
  const [seen, setSeen] = useState(freshSeen());
  const [dex, setDex] = useState(freshDex());
  const [clock, setClock] = useState(freshClock());
  const [muted, setMuted] = useState(false);
  const [hasSave, setHasSave] = useState(false);
  const [battleAnim, setBattleAnim] = useState({ player: "idle", enemy: "idle", fx: null, text: null });
  const [battleResult, setBattleResult] = useState(null);
  const [selectedCaptureItem, setSelectedCaptureItem] = useState("Prism Capsule");
  const [cloudSyncStatus, setCloudSyncStatus] = useState("Local only");
  const [lastCloudSyncAt, setLastCloudSyncAt] = useState(null);
  const [renameMon, setRenameMon] = useState(null);
  const [nickname, setNickname] = useState("");
  const [renameNotice, setRenameNotice] = useState("");
  const [authUser, setAuthUser] = useState(null);
  const [accountProfile, setAccountProfile] = useState(null);
  const [accountStatus, setAccountStatus] = useState(supabase ? "Sign in or create an account to enable cloud saves." : "Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
  const [availableUpdate, setAvailableUpdate] = useState(null);
  const [updateStatus, setUpdateStatus] = useState("Checking for updates...");
  const [updateModalVisible, setUpdateModalVisible] = useState(false);
  const [nativeUpdaterReady, setNativeUpdaterReady] = useState(false);
  const [viewport, setViewport] = useState(() => ({ w: typeof window !== "undefined" ? window.innerWidth : 390, h: typeof window !== "undefined" ? window.innerHeight : 780 }));

  const keyCooldown = useRef(false), audioRef = useRef(null), bgmTimerRef = useRef(null), bgmStepRef = useRef(0), gameRef = useRef({});
  const lastCinematicTileRef = useRef(null);
  useEffect(() => { gameRef.current = { screen, storyIndex, player, party, storage, active, battle, seen, dex, clock, muted }; }, [screen, storyIndex, player, party, storage, active, battle, seen, dex, clock, muted]);
  useEffect(() => {
    if (!VALID_SCREENS.has(screen)) {
      setToast(`Recovered from unknown screen: ${screen}`);
      setScreen(party.length ? "world" : "title");
      return;
    }
    if (screen === "battle" && (!battle || !party[active])) {
      setToast("Recovered from an unfinished battle screen.");
      setBattle(null);
      setScreen(party.length ? "world" : "title");
    }
  }, [screen, battle, party.length, active]);

  useEffect(() => { setHasSave(Boolean(findValidSave())); }, []);
  useEffect(() => {
    const updateViewport = () => setViewport({ w: window.innerWidth || 390, h: window.innerHeight || 780 });
    updateViewport();
    window.addEventListener("resize", updateViewport);
    window.addEventListener("orientationchange", updateViewport);
    return () => {
      window.removeEventListener("resize", updateViewport);
      window.removeEventListener("orientationchange", updateViewport);
    };
  }, []);
  
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 2400); return () => clearTimeout(t); }, [toast]);
  useEffect(() => {
    const musicScreens = ["title", "story", "world", "objectives", "atlas", "shop", "party", "dex", "pc"];
    if (!muted && musicScreens.includes(screen)) startBgm();
    else stopBgm();
    return () => {};
  }, [muted, screen]);
  useEffect(() => () => stopBgm(), []);
  
  async function checkAppUpdate({ silent = false } = {}) {
    if (!UPDATE_MANIFEST_URL) {
      if (!silent) setUpdateStatus("No update manifest configured.");
      return null;
    }
    try {
      if (!silent) setUpdateStatus("Checking for updates...");
      const res = await fetch(`${UPDATE_MANIFEST_URL}${UPDATE_MANIFEST_URL.includes("?") ? "&" : "?"}t=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`Manifest HTTP ${res.status}`);
      const raw = await res.json();
      const data = normalizeUpdateManifest(raw);
      if (manifestIsNewer(data)) {
        const nativeReady = hasNativeUpdaterBridge();
        setNativeUpdaterReady(nativeReady);
        setAvailableUpdate(data);
        setUpdateStatus(nativeReady
          ? `Update available: ${data.version || data.versionCode}. In-app Android updater is ready.`
          : `Update available: ${data.version || data.versionCode}. Latest APK selected only.`
        );
        setUpdateModalVisible(true);
        if (nativeReady && (data.autoStartNativeUpdate || data.mandatoryAutoStart)) {
          setTimeout(() => downloadAvailableUpdate(data), 700);
        }
        return data;
      }
      setAvailableUpdate(null);
      setUpdateModalVisible(false);
      setUpdateStatus(`App is up to date. Installed ${APP_VERSION} / code ${APP_VERSION_CODE}.`);
      return data;
    } catch (e) {
      setUpdateStatus(`Update check failed: ${e.message}`);
      if (!silent) setToast(`Update check failed: ${e.message}`);
      return null;
    }
  }
  function downloadAvailableUpdate(manifest = availableUpdate) {
    if (!manifestDownloadUrl(manifest)) {
      setUpdateStatus("Update manifest has no apkUrl/downloadUrl.");
      return;
    }
    setUpdateStatus(`Preparing latest update only: ${manifest?.version || "unknown"} / code ${manifest?.versionCode || "?"}.`);
    startApkDownload(manifest).then((result) => {
      setUpdateStatus(result.ok
        ? `${result.message} Latest: ${manifest?.version || "unknown"} / code ${manifest?.versionCode || "?"}.`
        : `Could not start update: ${result.message}`
      );
      if (result.ok) {
        setUpdateModalVisible(false);
        setToast(result.mode === "native" ? "Update downloaded. Android installer is opening." : "Opening latest APK download.");
      }
    }).catch((e) => setUpdateStatus(`Update download error: ${e.message}`));
  }
  useEffect(() => {
    setNativeUpdaterReady(hasNativeUpdaterBridge());
    cleanupDownloadedUpdateApks();
    const first = setTimeout(() => checkAppUpdate({ silent: true }), 350);
    const interval = setInterval(() => checkAppUpdate({ silent: true }), 6 * 60 * 60 * 1000);
    return () => { clearTimeout(first); clearInterval(interval); };
  }, []);

  useEffect(() => {
    if (!supabase) return;
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      const user = data?.session?.user || null;
      setAuthUser(user);
      if (user) loadAccountProfile(user);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      const user = session?.user || null;
      setAuthUser(user);
      if (user) loadAccountProfile(user);
      else setAccountProfile(null);
    });
    return () => { mounted = false; listener?.subscription?.unsubscribe?.(); };
  }, []);
  async function loadAccountProfile(user = authUser) {
    if (!supabase || !user) return null;
    const { data, error } = await supabase.from("mythbound_profiles").select("*").eq("id", user.id).maybeSingle();
    if (error && error.code !== "PGRST116") { setAccountStatus(`Profile error: ${error.message}`); return null; }
    if (data) { setAccountProfile(data); if (data.last_save_at) { setLastCloudSyncAt(data.last_save_at); setCloudSyncStatus(`Cloud synced online at ${formatOnlineSyncStamp(data.last_save_at)}`); } return data; }
    return null;
  }
  function buildSaveData(g = gameRef.current) {
    const safeScreen = ["battle", "gameover", "starter"].includes(g.screen) ? "world" : g.screen;
    return { version: 19, savedAt: Date.now(), screen: safeScreen, storyIndex: g.storyIndex, player: g.player, party: g.party, storage: g.storage || [], active: g.active, seen: g.seen, dex: g.dex, clock: g.clock, muted: g.muted };
  }
  function hydrateSaveData(data, sourceLabel = "save") {
    const migrated = migrateSave(data || {});
    setScreen(migrated.screen); setStoryIndex(migrated.storyIndex); setPlayer(migrated.player); setParty(migrated.party); setStorage(migrated.storage || []); setActive(migrated.active); setSeen(migrated.seen); setDex(migrated.dex); setClock(migrated.clock); setMuted(migrated.muted); setBattle(null); setNpc(null);
    localStorage.setItem(SAVE_KEY, JSON.stringify(migrated)); setHasSave(true); setToast(`Loaded ${sourceLabel}.`); sfx("success");
  }
  async function uploadSaveDataToCloud(saveData = buildSaveData(), show = true) {
    if (!supabase) throw new Error("Supabase env variables are missing.");
    if (!authUser) throw new Error("Sign in first.");
    const migrated = migrateSave(saveData || {});
    const cleanSave = JSON.parse(JSON.stringify({ ...migrated, version: 19, savedAt: Date.now() }));
    const display = accountProfile?.display_name || authUser.user_metadata?.display_name || authUser.email?.split("@")[0] || `Tamer-${authUser.id.slice(0, 6)}`;
    const syncedAt = new Date().toISOString();

    // IMPORTANT: only use real Supabase column names.
    // Older builds accidentally sent camelCase `saveData`, which can make upsert fail
    // because the table column is `save_data`.
    const payload = {
      id: authUser.id,
      player_code: authUser.id,
      display_name: display,
      party_snapshot: cleanSave.party || [],
      storage_snapshot: cleanSave.storage || [],
      inventory_snapshot: cleanSave.player || {},
      dex_caught: Object.keys(cleanSave.dex?.caught || {}).filter((k) => cleanSave.dex.caught[k]).length,
      save_data: cleanSave,
      save_version: cleanSave.version || 19,
      last_save_at: syncedAt,
      updated_at: syncedAt
    };

    const { data, error } = await supabase.from("mythbound_profiles").upsert(payload, { onConflict: "id" }).select().single();
    if (error) throw error;
    const savedProfile = data || payload;
    setAccountProfile((old) => ({ ...(old || {}), ...savedProfile }));
    setLastCloudSyncAt(syncedAt);
    setCloudSyncStatus(`Cloud synced online at ${formatOnlineSyncStamp(syncedAt)}`);
    if (show) setToast("Cloud save uploaded.");
    return savedProfile;
  }
  function finishBattleResult() {
    const cleanedParty = (gameRef.current.party || []).map(clearBattleOnlyStatus);
    const cleanedStorage = (gameRef.current.storage || []).map(clearBattleOnlyStatus);
    setParty(cleanedParty);
    setStorage(cleanedStorage);
    setBattleResult(null);
    setScreen("world");
    setBattle(null);
    setTimeout(() => saveGame(false), 60);
  }
  function findValidSave() {
    const keys = Array.from(new Set([SAVE_KEY, ...OLD_SAVE_KEYS]));
    for (const k of keys) {
      try {
        const raw = localStorage.getItem(k);
        if (!raw) continue;
        const parsed = JSON.parse(raw);
        const data = migrateSave(parsed);
        if (data.party.length || data.storage?.length || data.screen !== "title") {
          if (k !== SAVE_KEY) localStorage.setItem(SAVE_KEY, JSON.stringify(data));
          return data;
        }
      } catch (e) {
        console.warn("Ignored unreadable Mythbound save key", k, e);
      }
    }
    return null;
  }
  function audio() { if (muted) return null; if (!audioRef.current) audioRef.current = new (window.AudioContext || window.webkitAudioContext)(); if (audioRef.current.state === "suspended") audioRef.current.resume(); return audioRef.current; }
  function beep(freq = 440, dur = 0.1, type = "sine", vol = 0.06) { const ctx = audio(); if (!ctx) return; const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type; o.frequency.setValueAtTime(freq, ctx.currentTime); g.gain.setValueAtTime(vol, ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur); o.connect(g); g.connect(ctx.destination); o.start(); o.stop(ctx.currentTime + dur); }
  function sfx(name, type = "Mystic") { if (name === "success") [520,660,880,1040].forEach((n,i)=>setTimeout(()=>beep(n,0.09,"sine",0.05),i*95)); if (name === "evolve") [330,440,660,990,1320].forEach((n,i)=>setTimeout(()=>beep(n,0.12,"triangle",0.06),i*120)); if (name === "fail") beep(130,0.18,"square",0.04); if (name === "move") beep(280,0.025,"sine",0.018); if (name === "capture") { beep(420,0.1,"triangle",0.05); setTimeout(()=>beep(620,0.1,"triangle",0.05),120); } if (name === "heal") { beep(620,0.12,"sine",0.04); setTimeout(()=>beep(820,0.14,"sine",0.04),90); } if (name === "attack") beep(type === "Volt" ? 880 : type === "Flame" ? 520 : type === "Aqua" ? 390 : type === "Verdant" ? 450 : type === "Stone" ? 190 : type === "Air" ? 700 : type === "Shadow" ? 240 : 300, 0.12, type === "Volt" ? "square" : "sawtooth", 0.05); }
  
function startBgm() {
    if (muted || bgmTimerRef.current) return;
    const melody = [392, 440, 523, 587, 523, 440, 392, 330, 392, 494, 587, 659, 587, 494, 440, 392];
    const bass = [196, 196, 220, 220, 262, 262, 247, 247];
    const tick = () => {
      if (muted) return;
      const step = bgmStepRef.current++;
      const m = melody[step % melody.length];
      const b = bass[Math.floor(step / 2) % bass.length];
      beep(b, 0.18, "triangle", 0.012);
      setTimeout(() => beep(m, 0.12, "sine", 0.018), 25);
      if (step % 4 === 0) setTimeout(() => beep(m * 1.5, 0.09, "triangle", 0.01), 120);
    };
    tick();
    bgmTimerRef.current = setInterval(tick, 420);
  }
  function stopBgm() {
    if (bgmTimerRef.current) clearInterval(bgmTimerRef.current);
    bgmTimerRef.current = null;
  }

function playCry(id) { const isLegend = !!BESTIARY[id]?.legendary; const base = { emberlynx:520, pyrolynx:420, solarynx:360, aquapup:340, tidemast:260, leviamast:220, leafawn:620, florantler:540, gaianhart:470, voltoroo:760, stormaroo:920, thundaroo:980, gloomander:260, lunamander:310, eclipsander:230, ironboar:180, elderboar:145, cloudfinch:700, galegryph:500, pebbkit:210, granitus:120, shadebat:330, noctyra:240, prismite:850, dawnhare:790, nightmoth:250, dracinder:140, regaldrake:110, frostcub:410, glaciermaw:180, polarune:155, cindermole:250, magmole:160, calderox:120, spriggeist:760, starwhale:95, coralisk:420, reefserpent:160, sandillo:260, duneguard:130, mistowl:610, orchidimp:690, thistlefiend:300, aurorabbit:780, crysteel:620, prismhorn:260, toxifrog:360, venomire:210, spirikit:730, phantelope:510, neonsquid:680, ionwyrm:120, echopup:500, howlitzer:300, resonark:190, cuboulder:190, titanursa:105, worldursa:80, bellimp:640, chimegeist:360, ferroach:260, mantitan:180, mechamane:145, solguard:95, umbraclaw:70, thalassor:55, gaialith:65, chronova:880, auroracalf:720, aurorox:260, glacimarch:150, sirenfin:680, melodray:480, drillbug:230, cometitan:120, miragebud:760, dreamorchid:520, goldkit:760, aurumane:520, solarchon:330, stormkid:840, thunderchoir:460, glasswyrm:380, stormglass:165, incensemoth:560, censeraph:240, runeling:720, glyphsage:380, mossgolem:145, ruingrove:90, coinwyrm:620, treasuredrake:210, shelltide:300, reefguard:190, tsunamora:85, kitspark:760, vulpyr:520, kitsunova:900, abyssnake:130, leviacoil:70, glintcrab:640, prismclaw:360, ashchick:820, cinderwing:610, phoenixar:980, budbyte:720, florabyte:560, prismbloom:880, wolfrune:390, howlglyph:260, runewarden:180, snowkit:740, frostvulp:500, auroravulp:920, hornmite:250, drillhorn:160, railguard:95, miragecub:690, dreamlynx:450, mirageon:780, vaultick:680, lockroach:320, vaultitan:120, balletfin:760, swanlume:620, auroradiva:980, relicalf:260, reliceros:140, templehorn:70, pufflora:710, drowsibloom:520, somniflora:820, stardeer:760, cometstag:360, stellarch:160, inklot:230, eclipsquid:120, candypup:780, caramutt:540, ticktad:620, chronofrog:340, hourglassor:180, lanternimp:690, glowgremlin:500, mudmunch:210, bogjaw:115, happi: 760, jolli: 620, jubilume: 980, }[id] || 440; beep(base, isLegend ? 0.18 : 0.09, isLegend ? "square" : "sawtooth", isLegend ? 0.07 : 0.045); setTimeout(()=>beep(base*1.33, isLegend ? 0.16 : 0.08, "triangle", isLegend ? 0.065 : 0.04),90); if (isLegend) { setTimeout(()=>beep(base*0.66,0.22,"sawtooth",0.055),230); setTimeout(()=>beep(base*1.9,0.18,"sine",0.05),450); } }
  function playEvolutionSound(fromMon, toMon, style) {
    const fromType = BESTIARY[fromMon?.id]?.type || "Mystic";
    const toType = BESTIARY[toMon?.id]?.type || fromType;
    const baseByType = { Flame: 360, Aqua: 300, Verdant: 430, Volt: 760, Stone: 190, Air: 620, Shadow: 240, Mystic: 540, Ice: 680, Light: 820, Metal: 210, Crystal: 900, Toxic: 330, Spirit: 480, Beast: 260, Sound: 700 };
    const base = (baseByType[toType] || 520) + ((style?.seed || 0) % 90);
    const wave = toType === "Metal" ? "square" : toType === "Crystal" || toType === "Light" ? "sine" : toType === "Shadow" || toType === "Toxic" ? "sawtooth" : "triangle";
    [0, 110, 220, 360, 520, 760, 980, 1240].forEach((delay, i) => {
      const lift = i < 4 ? i * 0.18 : 0.95 + (i - 4) * 0.22;
      setTimeout(() => beep(base * (1 + lift), 0.12 + i * 0.012, wave, 0.045 + Math.min(i, 4) * 0.006), delay);
    });
    setTimeout(() => beep(base * 0.5, 0.34, "sawtooth", 0.055), 1480);
    setTimeout(() => beep(base * 2.05, 0.22, "sine", 0.065), 1780);
    setTimeout(() => playCry(toMon.id), 2060);
  }
  function markSeen(monOrId) {
    const id = typeof monOrId === "string" ? monOrId : monOrId?.id;
    if (!id) return;
    const isShiny = typeof monOrId === "object" && Boolean(monOrId?.shiny);
    setDex((d) => {
      const safe = ensureDexShape(d);
      return {
        ...safe,
        seen: { ...safe.seen, [id]: true },
        shinySeen: isShiny ? { ...safe.shinySeen, [id]: true } : safe.shinySeen,
      };
    });
  }
  function markCaught(monOrId) {
    const id = typeof monOrId === "string" ? monOrId : monOrId?.id;
    if (!id) return;
    const isShiny = typeof monOrId === "object" && Boolean(monOrId?.shiny);
    setDex((d) => {
      const safe = ensureDexShape(d);
      return {
        ...safe,
        seen: { ...safe.seen, [id]: true },
        caught: { ...safe.caught, [id]: true },
        shinySeen: isShiny ? { ...safe.shinySeen, [id]: true } : safe.shinySeen,
        shinyCaught: isShiny ? { ...safe.shinyCaught, [id]: true } : safe.shinyCaught,
      };
    });
  }
  function saveGame(show = true) {
    const data = buildSaveData();
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    setHasSave(true);

    if (show) {
      setToast(authUser ? "Game saved locally. Uploading cloud save..." : "Game saved locally. Sign in to enable cloud backup.");
      sfx("success");
    }

    if (authUser) {
      setCloudSyncStatus("Cloud sync in progress...");
      uploadSaveDataToCloud(data, false)
        .then(() => {
          setCloudSyncStatus(`Cloud synced online at ${formatOnlineSyncStamp(Date.now())}`);
          if (show) {
            setTimeout(() => {
              setToast("Cloud save upload successful.");
              sfx("success");
            }, 700);
          }
        })
        .catch((e) => {
          const message = e?.message || String(e);
          setCloudSyncStatus(`Cloud sync failed: ${message}`);
          setAccountStatus(`Cloud save failed: ${message}. Open Account and press Upload Current Local Save after saving.`);
          if (show) {
            setTimeout(() => {
              setToast(`Cloud upload failed: ${message}`);
              sfx("fail");
            }, 700);
          }
        });
    } else {
      setCloudSyncStatus("Local only — sign in for cloud sync");
      if (show) setTimeout(() => setToast("Cloud backup skipped: not signed in."), 700);
    }
  }
  function loadGame() { const data = findValidSave(); if (!data) { setHasSave(false); setToast("No usable save found yet."); sfx("fail"); return; } hydrateSaveData(data, "local save"); }
  function clearSave() { localStorage.removeItem(SAVE_KEY); OLD_SAVE_KEYS.forEach((k) => localStorage.removeItem(k)); setHasSave(false); setToast("Saved game cleared."); }
  function startStory() { sfx("success"); setScreen("story"); }
  function nextStory() { if (storyIndex < STORY.length - 1) setStoryIndex(storyIndex + 1); else setScreen("starter"); }
  function chooseStarter(id) {
    const starter = makeMon(id, 5);
    const nextPlayer = { ...player, quest: "Reach Elder Nima in Grovepath village." };
    const nextDex = { ...dex, seen: { ...(dex.seen || {}), [starter.id]: true }, caught: { ...(dex.caught || {}), [starter.id]: true } };
    const starterSave = { version: 10, savedAt: Date.now(), screen: "world", storyIndex, player: nextPlayer, party: [starter], storage, active: 0, seen, dex: nextDex, clock, muted };
    playCry(id);
    setParty([starter]);
    setActive(0);
    setDex(nextDex);
    setPlayer(nextPlayer);
    setScreen("world");
    setHasSave(true);
    localStorage.setItem(SAVE_KEY, JSON.stringify(starterSave));
    if (authUser) uploadSaveDataToCloud(starterSave, false).catch((e) => { setCloudSyncStatus("Cloud sync failed"); setAccountStatus(`Cloud save failed: ${e.message}. Open Account and press Upload Current Local Save after saving.`); });
    setToast(`${displayName(starter)} joined your party.`);
    setRenameMon(starter.uid);
    setNickname(starter.name);
  }
  function tileAt(x,y) { const map = currentAreaMap(gameRef.current?.player); return map[y]?.[x] || "W"; }
  function stepTime(minutes = 12) { setClock((c) => advanceClock(c, minutes)); }
  function travelToArea(areaId) {
    const target = AREA_DATA[areaId] || AREA_DATA.luminara;
    const start = target.start || { x: 3, y: 5 };
    setPlayer((p) => ({ ...p, area: target.id, x: start.x, y: start.y, chapter: Math.max(p.chapter || 1, target.chapter || 1), quest: target.id === "luminara" ? p.quest : `Explore ${target.name} and reach its story challenge.` }));
    setCinematic({ title: target.name, subtitle: target.subtitle || `Chapter ${target.chapter}`, text: `${target.description} Theme: ${target.theme}.${target.sideQuest ? " Side Quest: " + target.sideQuest : ""}`, tile: areaId === "luminara" ? "0" : null });
    sfx("success");
    setTimeout(() => setCinematic(null), 2900);
  }
  function confirmAreaGate() {
    const gate = pendingAreaGate;
    if (!gate) return;
    setPendingAreaGate(null);
    travelToArea(gate.areaId);
  }
  function cancelAreaGate() {
    const gate = pendingAreaGate;
    setPendingAreaGate(null);
    if (gate?.tileName) setToast(`Stayed at ${gate.tileName}.`);
  }
  function move(dx,dy) {
    const g = gameRef.current;
    if (g.screen !== "world" || keyCooldown.current) return;
    keyCooldown.current = true;
    setTimeout(() => { keyCooldown.current = false; }, 95);
    const nx = g.player.x + dx, ny = g.player.y + dy, t = tileAt(nx,ny);
    if (t === "W") { sfx("fail"); return; }
    sfx("move");
    stepTime();
    if (AREA_EXITS[t] && (AREA_EXITS[t] !== (g.player.area || "luminara"))) {
      const target = AREA_DATA[AREA_EXITS[t]] || AREA_DATA.luminara;
      setPlayer((p) => ({ ...p, x: nx, y: ny, steps: (p.steps || 0) + 1 }));
      const safety = areaGateSafety(target.id, g.party, g.seen, g.player);
      setPendingAreaGate({ areaId: target.id, tile: t, tileName: TILE_NAMES[t] || "Area Gate", fromArea: AREA_DATA[g.player.area || "luminara"]?.name || "Luminara", targetName: target.name, subtitle: target.subtitle, theme: target.theme, description: target.description, sideQuest: target.sideQuest, safety });
      sfx("success");
      return;
    }
    showCinematicForTile(t);
    setPlayer((p) => ({ ...p, x: nx, y: ny, steps: (p.steps || 0) + 1 }));
    if (areaEncounterPool(t, g.player).length && Math.random() < Math.min(0.31, 0.17 + (areaChapter(g.player) * 0.025))) startWildBattle(t);
    if (t === "N") talkElder();
    if (t === "R") startRival();
    if (t === "K") startKeeper();
    if (t === "B") startBridgeCaptain();
    if (t === "S") shrineEvent();
    if (t === "D") finalDragon();
    if (LEGENDARY_DUNGEONS[t]) enterLegendaryDungeon(t);
    if (t === "C") { healAll(); sfx("heal"); setToast("Crystal Spring restored your team."); }
    if (t === "T") openChest();
  }
  function openChest() { if (gameRef.current.seen.chest) { setToast("The chest is empty."); return; } setSeen((s) => ({ ...s, chest: true })); setPlayer((p) => ({ ...p, balls: p.balls + 3, potions: p.potions + 1, items: { ...(p.items || {}), "Prism Ether": ((p.items || {})["Prism Ether"] || 0) + 1 } })); setToast("Found 3 Prism Capsules, 1 Potion, and 1 Prism Ether."); sfx("success"); }
  function talkElder() { const g = gameRef.current; setSeen((s) => ({ ...s, elder: true })); setNpc({ title: "Elder Nima", body: g.seen.elderReward ? "The Prism fracture now follows the clock. Dawnhare appears in morning wind hills; Nightmoth appears in moon caves after dark." : "The old Prism broke into three relics: Moon Shard, Sun Fossil, and the Dragon Oath. Beat the tamers who guard them, and keep your Dex updated.", reward: g.seen.elderReward ? null : () => { setSeen((s) => ({ ...s, elderReward: true })); setPlayer((p) => ({ ...p, balls: p.balls + 4, quest: "Defeat Rival Ren near the river path." })); setToast("Received 4 Prism Capsules."); } }); }
  function startRival() {
    const g = gameRef.current;
    if (!g.seen.elder) { setToast("A rival blocks the bridge. Ask Elder Nima first."); return; }
    if (g.seen.rival) { setToast("Ren already moved toward the Prism Gate."); return; }
    const lead = g.party[g.active] || g.party[0];
    const id = lead?.type === "Flame" ? "aquapup" : lead?.type === "Aqua" ? "voltoroo" : "emberlynx";
    setNpc({ title: "Rival Ren", body: "Cutscene: Ren steps from the river mist, Prism Capsule spinning between his fingers. “If the Sky Prism is cracking, only one of us is ready to chase it.”", reward: () => beginBattle("trainer", makeMon(id, 7 + areaChapter(g.player), true), "Rival Ren challenges you with a counter-pick!", "rival") });
    sfx("success");
  }
  function startKeeper() {
    const g = gameRef.current;
    if (!g.seen.rival) { setToast("The Keeper ignores you until Ren is defeated."); return; }
    if (g.seen.keeper) { setToast("Sola has returned to Moon Cave."); return; }
    setNpc({ title: "Moon Keeper Sola", body: "Cutscene: Bells echo from the cavern ceiling. Sola raises a moonlit lantern and asks your Mythling to answer with courage.", reward: () => beginBattle("trainer", makeMon("gloomander", 8 + areaChapter(g.player), true), "Moon Keeper Sola tests your bond!", "keeper") });
    sfx("success");
  }
  function startBridgeCaptain() {
    const g = gameRef.current;
    if (!g.seen.keeper) { setToast("The Bridge Captain says only shrine-tested tamers pass."); return; }
    if (g.seen.bridgeCaptain) { setToast("The ash road is open."); return; }
    setNpc({ title: "Bridge Captain Brann", body: "Cutscene: The bridge chains slam down. Brann laughs, the mountains answer, and the ash road opens only to a victorious tamer.", reward: () => beginBattle("trainer", makeMon("pebbkit", 9 + areaChapter(g.player), true), "Bridge Captain Brann challenges you!", "bridgeCaptain") });
    sfx("success");
  }
  function shrineEvent() { const g = gameRef.current; if (!g.seen.keeper) { setToast("The shrine gate is sealed by moonlight. Defeat the Keeper first."); return; } if (g.seen.shrine) { setToast("The shrine hums. Dracinder waits beyond the dark gate."); return; } setSeen((s) => ({ ...s, shrine: true })); setPlayer((p) => ({ ...p, keys: [...p.keys, "Shrine Key"], items: { ...p.items, "Moon Shard": (p.items?.["Moon Shard"] || 0) + 1 }, quest: "Defeat the Bridge Captain, then face Dracinder." })); setNpc({ title: "Old Shrine", body: "The altar reforms a Prism Key and leaves a Moon Shard in your hand. Shadow Mythlings now stir in caves.", reward: null }); sfx("success"); }
  function enterLegendaryDungeon(tile) {
    const g = gameRef.current;
    const dungeon = LEGENDARY_DUNGEONS[tile];
    if (!dungeon) return;
    if (g.seen?.[dungeon.reward] || g.dex?.caught?.[dungeon.id]) {
      setToast(`${BESTIARY[dungeon.id].name} has already acknowledged you.`);
      showCinematicForTile(tile);
      return;
    }
    if (!dungeon.check(g)) {
      setNpc({ title: dungeon.title, body: `${dungeon.fail}\n\nCondition: ${dungeon.condition}`, reward: null });
      showCinematicForTile(tile);
      return;
    }
    setCinematic({ title: dungeon.title, subtitle: "LEGENDARY AWAKENING", text: dungeon.intro, tile });
    setTimeout(() => {
      setCinematic(null);
      beginBattle("legend", makeMon(dungeon.id, dungeon.level, true), `Legendary ${BESTIARY[dungeon.id].name} emerged!`, dungeon.reward);
    }, 1200);
  }
  function finalDragon() {
    const g = gameRef.current;
    if (!g.seen.bridgeCaptain || !g.seen.shrine) { setToast("The dragon seal needs both the Prism Key and the ash road oath."); return; }
    if (maxPartyLevel(g.party) < 26) { setToast("Dracinder is a late-game boss. Train closer to Lv.28+ before challenging the Dragon Gate."); return; }
    if (g.seen.dragon) { setToast("Dracinder watches over Luminara from above."); return; }
    setNpc({ title: "Dragon Gate", body: "Boss cutscene: The gate burns without flame. Dracinder descends through a ring of broken Prism light and stares directly at your lead Mythling.", reward: () => beginBattle("legend", makeMon("dracinder", 12 + areaChapter(g.player), true), "The lost royal Mythling descends!", "dragon") });
    sfx("success");
  }
  function healAll() { setParty((arr) => restorePartyPP(arr.map((m) => ({ ...clearAllStatus(m), hp: m.maxHp })))); setStorage((arr) => restorePartyPP(arr.map(clearAllStatus))); }
  function beginBattle(mode, enemy, message, reward = null) { markSeen(enemy); playCry(enemy.id); const isLegend = mode === "legend" || !!BESTIARY[enemy.id]?.legendary; const isShiny = Boolean(enemy.shiny); const finalMessage = isShiny ? `✨ SHINY! ${message}` : message; setBattle({ mode, enemy, enemyGuard: false, playerGuard: false, turn: "player", message: finalMessage, reward, isLegend }); setBattleAnim({ player: "idle", enemy: "idle", fx: isLegend ? "legend" : isShiny ? "shiny" : "encounter", text: isLegend ? `${BESTIARY[enemy.id].cry} — LEGEND AWAKENED` : isShiny ? `✦ SHINY ${BESTIARY[enemy.id].name}!` : BESTIARY[enemy.id].cry, ball: false, target: enemy.type }); setScreen("battle"); if (isShiny) sfx("evolve"); setTimeout(() => setBattleAnim({ player: "idle", enemy: "idle", fx: null, text: null, ball: false }), isLegend ? 1500 : isShiny ? 1250 : 700); }
  function showCinematicForTile(tile) {
    if (!tile || lastCinematicTileRef.current === tile) return;
    if (!["E", "Y", "U", "P", "D", "X", "Z", "6", "7", "8", "1", "2", "3", "4", "5"].includes(tile)) return;
    const details = tileDetails(tile, gameRef.current.clock || freshClock());
    lastCinematicTileRef.current = tile;
    setCinematic({ title: details.name, subtitle: details.kind, text: details.note, tile });
    setTimeout(() => setCinematic(null), 2300);
  }
  function startWildBattle(tile) {
    const g = gameRef.current;
    const tod = timeName(g.clock);
    let pool = areaEncounterPool(tile, g.player);
    if (tod === "Morning" && ["A","G","P","H","J"].includes(tile)) pool.push("dawnhare", "aurorabbit", "lumifox", "mistowl");
    if (tod === "Night" && ["V","F","P","X","L","E"].includes(tile)) pool.push("nightmoth", "starwhale", "toxifrog", "spirikit", "frostcub", "chimegeist", "gloomjaw");
    if (tod === "Evening" && ["O","V","Z","A","E","7"].includes(tile)) pool.push("orchidimp", "neonsquid", "bellimp", "miragecalf");
    if (!g.seen.shrine) pool = pool.filter((id) => id !== "shadebat" && id !== "nightmoth" && id !== "spirikit" && id !== "phantelope" && id !== "chimegeist" && id !== "gloomjaw" && id !== "marshgrave");
    const id = pool[Math.floor(Math.random() * pool.length)] || "emberlynx";
    const level = scaleEncounterLevel(g.player, g.party, tile);
    const wildMon = makeMon(id, level, true);
    beginBattle("wild", wildMon, `A wild ${wildMon.shiny ? "shiny " : ""}${BESTIARY[id].name} appeared at ${currentAreaData(g.player).name}!`);
  }
  function updateCurrent(newMon) { setParty((arr) => arr.map((m, i) => i === gameRef.current.active ? newMon : m)); }
  function animateAttack(side, skillName, targetType) { const skill = SKILLS[skillName]; sfx(skill.kind === "heal" ? "heal" : "attack", skill.type); setBattleAnim({ player: side === "player" ? (skill.kind === "heal" ? "heal" : "attack") : "idle", enemy: side === "enemy" ? (skill.kind === "heal" ? "heal" : "attack") : "idle", fx: skill.fx, text: skillName, target: targetType }); setTimeout(() => setBattleAnim((a) => ({ ...a, player: side === "enemy" ? "hit" : "idle", enemy: side === "player" ? "hit" : "idle" })), 280); setTimeout(() => setBattleAnim({ player: "idle", enemy: "idle", fx: null, text: null }), 780); }
  function handlePlayerFaintFromStatus(me, enemy, enemyGuard, message) {
    updateCurrent(me);
    const latest = gameRef.current;
    const alive = latest.party.findIndex((m, i) => i !== latest.active && m.hp > 0);
    if (alive >= 0) {
      setActive(alive);
      setBattle((old) => ({ ...old, enemy, enemyGuard, playerGuard: false, turn: "player", message: `${message} ${displayName(me)} fainted! ${displayName(latest.party[alive])} jumps in.` }));
    } else {
      setScreen("gameover");
      setBattle((old) => old ? ({ ...old, enemy, message: `${message} Your team fainted.` }) : old);
    }
  }
  function playerUse(skillName) {
    const g = gameRef.current, b = g.battle, current = g.party[g.active];
    if (!b || b.turn !== "player" || !current || current.hp <= 0) return;
    const skill = SKILLS[skillName] || SKILLS.Guard;
    let enemy = { ...b.enemy }, me = ensureMovePP({ ...current }), msg = "", playerGuard = false;
    if (!hasPP(me, skillName)) {
      setBattle((old) => ({ ...old, message: `${displayName(me)} has no PP left for ${skillName}. Use Prism Ether, Max Resonance, or heal at a Crystal Spring.` }));
      sfx("fail");
      return;
    }
    me = spendPP(me, skillName);
    const gate = beforeActionStatus(me);
    me = gate.mon;
    if (gate.text) msg += gate.text;
    if (!gate.canAct) {
      updateCurrent(me);
      if (me.hp <= 0) return handlePlayerFaintFromStatus(me, enemy, b.enemyGuard, msg);
      setBattle((old) => ({ ...old, enemy, playerGuard: false, enemyGuard: false, turn: "enemy", message: msg || `${displayName(me)} couldn't move!` }));
      setTimeout(() => enemyTurn(enemy, false), 900);
      return;
    }
    msg += `${displayName(me)} used ${skillName}!`;
    animateAttack("player", skillName, enemy.type);
    if (skill.kind === "heal") {
      const heal = Math.min(me.maxHp - me.hp, Math.max(6, Math.floor(me.maxHp * 0.22) + Math.floor((skill.power || 0) * 0.25) + Math.floor(me.level * 0.75)));
      me.hp += heal;
      msg += ` Restored ${heal} HP.`;
    } else if (skill.kind === "guard") {
      playerGuard = true;
      msg += " It braced for impact.";
    } else {
      const result = resolveMove(me, enemy, skillName, b.enemyGuard);
      if (!result.hit) {
        msg += ` It missed! (${Math.round(result.accuracy * 100)}% accuracy)`;
        setBattleAnim((a) => ({ ...a, text: "Miss!" }));
      } else {
        enemy.hp = Math.max(0, enemy.hp - result.damage);
        msg += ` Dealt ${result.damage} damage${typeText(result.mult)}`;
        if (result.stab > 1) msg += " Same-type bonus.";
        if (result.crit) msg += " Critical hit!";
        if (b.enemyGuard) msg += " Guard reduced it.";
        const statusRoll = maybeApplyMoveStatus(enemy, skillName);
        enemy = statusRoll.mon;
        msg += statusRoll.text;
      }
    }
    const endTick = afterActionStatus(me);
    me = endTick.mon;
    msg += endTick.text;
    updateCurrent(me);
    if (me.hp <= 0) return handlePlayerFaintFromStatus(me, enemy, false, msg);
    if (enemy.hp <= 0) setTimeout(() => winBattle(enemy, msg), 440);
    else { setBattle((old) => ({ ...old, enemy, playerGuard, enemyGuard: false, turn: "enemy", message: msg })); setTimeout(() => enemyTurn(enemy, playerGuard), 950); }
  }
  function enemyTurn(enemySnapshot, playerGuard) {
    const g = gameRef.current, b = g.battle;
    if (!b || b.turn !== "enemy") return;
    let enemy = ensureMovePP({ ...(enemySnapshot || b.enemy) }), me = { ...(g.party[g.active] || g.party[0]) };
    if (!me) return;
    let msg = "";
    const gate = beforeActionStatus(enemy);
    enemy = gate.mon;
    if (gate.text) msg += gate.text;
    if (!gate.canAct) {
      if (enemy.hp <= 0) return setTimeout(() => winBattle(enemy, msg), 350);
      setBattle((old) => old ? ({ ...old, enemy, enemyGuard: false, playerGuard: false, turn: "player", message: msg || `${enemy.name} couldn't move!` }) : old);
      return;
    }
    const usable = skills(enemy).filter((s) => hasPP(enemy, s) && (SKILLS[s].kind !== "heal" || enemy.hp < enemy.maxHp * 0.55));
    const scored = usable.map((name) => ({ name, score: (SKILLS[name].kind === "attack" ? typeMult(SKILLS[name].type, me.type) * (SKILLS[name].power || 1) : enemy.hp < enemy.maxHp * 0.35 ? 80 : 10) + (STATUS_SKILL_EFFECTS[name] && !me.status ? 18 : 0) + Math.random() * 8 }));
    scored.sort((a, b) => b.score - a.score);
    const skillName = scored[0]?.name || "Guard";
    const skill = SKILLS[skillName];
    enemy = spendPP(enemy, skillName);
    animateAttack("enemy", skillName, me.type);
    playCry(enemy.id);
    msg += `${enemy.name} used ${skillName}!`;
    let enemyGuard = false;
    if (skill.kind === "heal") {
      const heal = Math.min(enemy.maxHp - enemy.hp, Math.max(5, Math.floor(enemy.maxHp * 0.18) + Math.floor((skill.power || 0) * 0.2) + Math.floor(enemy.level * 0.55)));
      enemy.hp += heal;
      msg += ` It restored ${heal} HP.`;
    } else if (skill.kind === "guard") {
      enemyGuard = true;
      msg += " It guarded.";
    } else {
      const result = resolveMove(enemy, me, skillName, playerGuard);
      if (!result.hit) {
        msg += ` It missed! (${Math.round(result.accuracy * 100)}% accuracy)`;
        setBattleAnim((a) => ({ ...a, text: "Miss!" }));
      } else {
        me.hp = Math.max(0, me.hp - result.damage);
        msg += ` Dealt ${result.damage} damage${typeText(result.mult)}`;
        if (result.stab > 1) msg += " Same-type bonus.";
        if (result.crit) msg += " Critical hit!";
        if (playerGuard) msg += " Your guard reduced it.";
        const statusRoll = maybeApplyMoveStatus(me, skillName);
        me = statusRoll.mon;
        msg += statusRoll.text;
      }
    }
    const endTick = afterActionStatus(enemy);
    enemy = endTick.mon;
    msg += endTick.text;
    setParty((arr) => arr.map((m, i) => i === g.active ? me : m));
    if (enemy.hp <= 0) { setBattle((old) => old ? ({ ...old, enemy, message: msg }) : old); return setTimeout(() => winBattle(enemy, msg), 440); }
    setTimeout(() => { const latest = gameRef.current; const alive = latest.party.findIndex((m, i) => i !== latest.active && m.hp > 0); if (me.hp <= 0 && alive >= 0) { setActive(alive); setBattle((old) => ({ ...old, enemy, enemyGuard, playerGuard: false, turn: "player", message: `${msg} ${displayName(me)} fainted! ${displayName(latest.party[alive])} jumps in.` })); } else if (me.hp <= 0) { setScreen("gameover"); setBattle((old) => old ? ({ ...old, enemy, message: `${msg} Your team fainted.` }) : old); } else setBattle((old) => old ? ({ ...old, enemy, enemyGuard, playerGuard: false, turn: "player", message: msg }) : old); }, 440);
  }
  function winBattle(defeated, prefix = "") {
    const g = gameRef.current, b = g.battle;
    if (!b) return;
    sfx("success");
    stepTime(25);
    const xp = b.mode === "legend" ? 210 : b.mode === "trainer" ? 120 + defeated.level * 5 : 52 + defeated.level * 9;
    let levelUps = [];
    let xpTrack = null;
    const beforeMon = g.party[g.active];
    const newParty = g.party.map((m, i) => {
      if (i !== g.active) return m;
      const before = { level: m.level, xp: m.xp || 0, nextXp: m.nextXp || 1, atk: m.atk, def: m.def, spd: m.spd, maxHp: m.maxHp };
      let nm = { ...m, xp: (m.xp || 0) + xp };
      while (nm.xp >= nm.nextXp) {
        nm.xp -= nm.nextXp;
        nm.level += 1;
        nm.nextXp += 28 + Math.floor(nm.level * 2);
        nm.maxHp += 7;
        nm.hp = nm.maxHp;
        nm.atk += 3;
        nm.def += 2;
        nm.spd += 2;
      }
      if (nm.level > before.level) {
        levelUps.push({
          name: displayName(nm),
          from: before.level,
          to: nm.level,
          hp: nm.maxHp - before.maxHp,
          atk: nm.atk - before.atk,
          def: nm.def - before.def,
          spd: nm.spd - before.spd,
        });
      }
      xpTrack = { before, after: { level: nm.level, xp: nm.xp, nextXp: nm.nextXp }, mon: nm };
      return nm;
    });
    setParty(newParty);

    const reward = { xp, money: 0, items: [] };
    if (b.mode === "trainer") {
      reward.money = 180 + defeated.level * 42 + (b.reward ? 120 : 0);
      const drops = ["Potion", "Great Prism", "Power Herb", "Guard Herb", "Antidote", "Burn Salve", "Awakening", "Paralyze Heal", "Clarity Herb"];
      const drop = drops[Math.floor(Math.random() * drops.length)];
      reward.items.push({ name: drop, qty: 1, kind: CAPTURE_ITEMS[drop] ? "capture" : "item" });
      setPlayer((p) => {
        const captureItems = { ...(p.captureItems || {}) };
        const items = { ...(p.items || {}) };
        if (CAPTURE_ITEMS[drop]) captureItems[drop] = (captureItems[drop] || 0) + 1;
        else items[drop] = (items[drop] || 0) + 1;
        return syncBallCount({ ...p, money: (p.money || 0) + reward.money, items, captureItems, trainerWins: (p.trainerWins || 0) + 1 });
      });
    }

    if (b.reward === "rival") { setSeen((s) => ({ ...s, rival: true })); setPlayer((p) => ({ ...p, potions: p.potions + 2, quest: "Find Moon Keeper Sola near Moon Cave." })); setToast("Ren gave you 2 Potions and mentioned Moon Cave."); }
    if (b.reward === "keeper") { setSeen((s) => ({ ...s, keeper: true })); setPlayer((p) => ({ ...p, items: { ...p.items, "Moon Shard": (p.items?.["Moon Shard"] || 0) + 1 }, quest: "Visit the old shrine in the northeast." })); setToast("Sola gave you a Moon Shard."); }
    if (b.reward === "bridgeCaptain") { setSeen((s) => ({ ...s, bridgeCaptain: true })); setPlayer((p) => ({ ...p, items: { ...p.items, "Sun Fossil": (p.items?.["Sun Fossil"] || 0) + 1 }, quest: "Face Dracinder at the dark gate." })); setToast("Brann gave you a Sun Fossil and opened the ash road."); }
    if (b.reward === "dragon") { setSeen((s) => ({ ...s, dragon: true })); setPlayer((p) => ({ ...p, badges: p.badges + 1, money: (p.money || 0) + 900, quest: "The Sky Prism is safe. Complete the Prism Dex!" })); reward.money += 900; markSeen("regaldrake"); setNpc({ title: "Dracinder", body: "The dragon bows. The Sky Prism shines again, and third-stage evolutions begin to resonate across Luminara.", reward: null }); }
    if (LEGENDARY_DUNGEONS && Object.values(LEGENDARY_DUNGEONS).some((d) => d.reward === b.reward)) {
      reward.money += 1200;
      setPlayer((p) => ({ ...p, money: (p.money || 0) + 1200, quest: "The legend withdrew into its dungeon. Return with stronger capture items if you want it to join you." }));
      setNpc({ title: BESTIARY[b.enemy.id].name, body: `${BESTIARY[b.enemy.id].name} fades back into its seal and leaves 1200 coins. It has not been captured, so you may challenge it again by meeting its dungeon condition.`, reward: null });
    }

    setBattle((old) => ({ ...old, enemy: { ...defeated, hp: 0 }, turn: "done", message: `${prefix} ${defeated.name} fainted! ${displayName(beforeMon)} gained ${xp} XP.` }));
    setBattleResult({
      title: b.mode === "trainer" ? "Tamer Battle Won!" : b.mode === "legend" ? "Legendary Trial Cleared!" : "Wild Battle Won!",
      defeated: defeated.name,
      playerName: displayName(beforeMon),
      playerType: beforeMon?.type,
      xp,
      xpTrack,
      levelUps,
      reward,
      mode: b.mode,
      postText: b.mode === "trainer" ? "The defeated tamer steps aside. A new route feels closer now." : b.mode === "legend" ? "The dungeon seal quiets, but its power still echoes." : "The wilds settle back into motion.",
    });
  }
  function capture(itemName = selectedCaptureItem) {
    const g = gameRef.current, b = g.battle;
    if (!b || b.turn !== "player") return;
    if (b.mode === "trainer") {
      setBattle((old) => ({ ...old, message: "You cannot capture another tamer's Mythling." }));
      return;
    }

    const item = CAPTURE_ITEMS[itemName] ? itemName : "Prism Capsule";
    if (captureCount(g.player, item) <= 0) {
      const fallback = Object.keys(CAPTURE_ITEMS).find((k) => captureCount(g.player, k) > 0);
      if (fallback) {
        setSelectedCaptureItem(fallback);
        return capture(fallback);
      }
      setBattle((old) => ({ ...old, message: "No capture items left! Visit the store." }));
      sfx("fail");
      return;
    }

    setPlayer((p) => {
      const captureItems = { ...(p.captureItems || {}) };
      captureItems[item] = Math.max(0, (captureItems[item] || 0) - 1);
      return syncBallCount({ ...p, captureItems });
    });

    sfx("capture");
    setBattleAnim({
      player: "idle",
      enemy: "captureIn",
      fx: "capture",
      text: item,
      ball: true,
      target: b.enemy.type,
      captureItem: item
    });

    const hpFactor = 1 - b.enemy.hp / b.enemy.maxHp;
    const tileBonus = item === "Dusk Prism" && ["Night"].includes(timeName(g.clock)) ? CAPTURE_ITEMS[item].nightMultiplier || 1 : CAPTURE_ITEMS[item].multiplier;
    const earlyBonus = item === "Quick Prism" && b.enemy.hp === b.enemy.maxHp ? 1.35 : 1;
    const legendPenalty = BESTIARY[b.enemy.id]?.legendary ? 0.42 : 1;
    const chance = Math.min(
      BESTIARY[b.enemy.id]?.legendary ? 0.32 : 0.94,
      (BESTIARY[b.enemy.id].capture + hpFactor * 0.57 + (b.mode === "legend" ? -0.18 : 0)) * tileBonus * earlyBonus * legendPenalty
    );

    setTimeout(() => {
      if (Math.random() < chance) {
        const caught = {
          ...b.enemy,
          wild: false,
          status: null,
          hp: Math.max(1, Math.floor(b.enemy.maxHp * 0.55))
        };
        const sentToPC = (g.party || []).length >= 6;

        markCaught(caught);

        if (BESTIARY[caught.id]?.legendary) {
          setSeen((s) => ({ ...s, [caught.id]: true }));
          setPlayer((p) => ({
            ...p,
            badges: (p.badges || 0) + 1,
            money: (p.money || 0) + 2500,
            quest: "A legendary Mythling has joined you. Seek the remaining sealed dungeons."
          }));
        }

        if (sentToPC) {
          setStorage((arr) => [...arr, caught]);
        } else {
          setParty((arr) => [...arr, caught]);
        }

        setRenameMon(caught.uid);
        setNickname(caught.name);
        setRenameNotice(`${caught.name} was caught! ${sentToPC ? "Your active team is full, so it was sent to PC Storage." : "It joined your active team."}`);

        setBattle((old) => ({
          ...old,
          enemy: { ...b.enemy, hp: b.enemy.hp },
          turn: "done",
          message: `Gotcha! ${caught.name} was caught! ${sentToPC ? "Your active team is full, so it was sent to PC Storage." : "It joined your active team."} You can rename it now or keep its original name.`
        }));

        setBattleAnim({
          player: "idle",
          enemy: "captured",
          fx: "success",
          text: "Gotcha!",
          ball: true,
          target: b.enemy.type,
          captureItem: item
        });

        sfx("success");
        setToast(sentToPC ? `${caught.name} was sent to PC Storage.` : `${caught.name} joined your team.`);

        // Keep the battle scene visible long enough for the capture message and rename choice.
        setTimeout(() => {
          setScreen("world");
          setBattle(null);
          saveGame(false);
        }, 4200);
      } else {
        setBattleAnim({
          player: "idle",
          enemy: "escape",
          fx: "escape",
          text: "Broke free!",
          ball: true,
          target: b.enemy.type,
          captureItem: item
        });
        setBattle((old) => ({ ...old, turn: "enemy", message: `${b.enemy.name} broke free from the ${item}!` }));
        sfx("fail");
        setTimeout(() => enemyTurn(b.enemy, false), 1100);
      }
    }, 900);
  }
  function usePotion() { const g = gameRef.current, current = g.party[g.active]; if (!current || g.player.potions <= 0 || current.hp <= 0 || current.hp === current.maxHp || !g.battle) return; setPlayer((p) => ({ ...p, potions: Math.max(0, (p.potions || 0) - 1), items: { ...(p.items || {}), Potion: Math.max(0, ((p.items || {}).Potion || p.potions || 0) - 1) } })); updateCurrent({ ...current, hp: Math.min(current.maxHp, current.hp + 35) }); sfx("heal"); setBattleAnim({ player: "heal", enemy: "idle", fx: "heal", text: "+HP" }); setBattle((b) => ({ ...b, turn: "enemy", message: `${displayName(current)} recovered HP with a Potion.` })); setTimeout(() => enemyTurn(g.battle.enemy, false), 850); }
  function useStatusItem(index, preferredItem = null) {
    const mon = gameRef.current.party[index];
    if (!mon?.status) { setToast("That Mythling has no status condition."); return; }
    const item = preferredItem || bestCureItemForStatus(gameRef.current.player, mon.status);
    if (!item || !statusCureMatches(item, mon.status) || itemCount(gameRef.current.player, item) <= 0) { setToast(`You need ${cureItemForStatus(mon.status)} or Full Heal.`); sfx("fail"); return; }
    setPlayer((p) => ({ ...p, items: { ...(p.items || {}), [item]: Math.max(0, ((p.items || {})[item] || 0) - 1) } }));
    setParty((arr) => arr.map((m, i) => i === index ? clearAllStatus(m) : m));
    setToast(`${item} cured ${displayName(mon)}.`);
    sfx("heal");
    setTimeout(() => saveGame(false), 60);
  }
  function useStatusCureInBattle() {
    const g = gameRef.current, current = g.party[g.active];
    if (!current?.status || !g.battle || g.battle.turn !== "player") return;
    const item = bestCureItemForStatus(g.player, current.status);
    if (!item) { setBattle((b) => ({ ...b, message: `No cure item available. You need ${cureItemForStatus(current.status)} or Full Heal.` })); sfx("fail"); return; }
    setPlayer((p) => ({ ...p, items: { ...(p.items || {}), [item]: Math.max(0, ((p.items || {})[item] || 0) - 1) } }));
    const cured = clearAllStatus(current);
    updateCurrent(cured);
    sfx("heal");
    setBattleAnim({ player: "heal", enemy: "idle", fx: "heal", text: item });
    setBattle((b) => ({ ...b, turn: "enemy", message: `${displayName(current)} used ${item} and was cured.` }));
    setTimeout(() => enemyTurn(g.battle.enemy, false), 850);
  }

  function usePPItemInBattle() {
    const g = gameRef.current, current = g.party[g.active];
    if (!current || !g.battle || g.battle.turn !== "player") return;
    const item = (g.player.items?.["Prism Ether"] || 0) > 0 ? "Prism Ether" : ((g.player.items?.["Max Resonance"] || 0) > 0 ? "Max Resonance" : null);
    if (!item) { setBattle((b) => ({ ...b, message: "No PP item available. Buy Prism Ether or Max Resonance from the Shop." })); sfx("fail"); return; }
    const amount = item === "Max Resonance" ? 999 : MOVE_PP_ITEMS["Prism Ether"];
    setPlayer((p) => ({ ...p, items: { ...(p.items || {}), [item]: Math.max(0, ((p.items || {})[item] || 0) - 1) } }));
    if (item === "Max Resonance") setParty((arr) => restorePartyPP(arr, 999));
    else updateCurrent(restoreMonPP(current, amount));
    sfx("heal");
    setBattle((b) => ({ ...b, turn: "enemy", message: item === "Max Resonance" ? "Your whole active team recovered all move PP with Max Resonance." : `${displayName(current)} restored move PP with ${item}.` }));
    setTimeout(() => enemyTurn(g.battle.enemy, false), 850);
  }

  function run() {
    const g = gameRef.current, b = g.battle;
    if (!b) return;
    if (b.mode !== "wild") { setBattle((old) => ({ ...old, message: b.mode === "legend" ? "You cannot run from a legend." : "You cannot run from a trainer battle." })); sfx("fail"); return; }
    const lead = g.party[g.active] || g.party[0];
    const chance = Math.max(0.82, Math.min(0.98, 0.9 + ((lead?.spd || 10) - (b.enemy?.spd || 10)) / 220));
    if (Math.random() < chance) {
      setParty((arr) => arr.map(clearBattleOnlyStatus));
      setScreen("world");
      setBattle(null);
      setToast("You escaped safely.");
      sfx("success");
    } else {
      setBattle((old) => ({ ...old, turn: "enemy", message: "Couldn't escape! The wild Mythling blocks your path." }));
      sfx("fail");
      setTimeout(() => enemyTurn(b.enemy, false), 850);
    }
  }
  function evolve(index) {
    if (evolutionScene) return;
    const mon = gameRef.current.party[index];
    const rule = canEvolve(mon, gameRef.current.player, gameRef.current.seen, gameRef.current.clock);
    if (!rule) { setToast("Evolution requirements are not met yet."); return; }
    const evolved = scaleMonToSpecies(mon, rule.to);
    const style = getEvolutionStyle(mon, evolved);
    setEvolutionScene({ from: mon, to: evolved, style, phase: "charge" });
    setToast(`${displayName(mon)} is evolving!`);
    playEvolutionSound(mon, evolved, style);
    setTimeout(() => setEvolutionScene((scene) => scene ? { ...scene, phase: "flash" } : scene), 850);
    setTimeout(() => setEvolutionScene((scene) => scene ? { ...scene, phase: "reveal" } : scene), 1600);
    setTimeout(() => {
      setParty((arr) => arr.map((m, i) => i === index ? evolved : m));
      markCaught(evolved);
      setPlayer((p) => {
        const items = { ...(p.items || {}) };
        if (rule.method.includes("Tide Pearl")) items["Tide Pearl"] = Math.max(0, (items["Tide Pearl"] || 0) - 1);
        if (rule.method.includes("Moon Shard")) items["Moon Shard"] = Math.max(0, (items["Moon Shard"] || 0) - 1);
        if (rule.method.includes("Sun Fossil")) items["Sun Fossil"] = Math.max(0, (items["Sun Fossil"] || 0) - 1);
        return { ...p, items };
      });
      setToast(`${displayName(mon)} evolved into ${evolved.name}!`);
      setEvolutionScene((scene) => scene ? { ...scene, phase: "complete" } : scene);
      setTimeout(() => saveGame(false), 250);
    }, 2200);
    setTimeout(() => setEvolutionScene(null), 4100);
  }
  function applyNickname() {
    const cleanName = nickname.trim().slice(0, 16);
    setParty((arr) => arr.map((m) => m.uid === renameMon ? { ...m, nickname: cleanName } : m));
    setStorage((arr) => arr.map((m) => m.uid === renameMon ? { ...m, nickname: cleanName } : m));
    setRenameMon(null);
    setNickname("");
    setRenameNotice("");
    setTimeout(() => saveGame(false), 50);
  }

  function swapWithStorage(partyIndex, storageIndex) { const currentParty = gameRef.current.party || []; const currentStorage = gameRef.current.storage || []; if (!currentParty[partyIndex] || !currentStorage[storageIndex]) return; const nextParty = [...currentParty]; const nextStorage = [...currentStorage]; const temp = nextParty[partyIndex]; nextParty[partyIndex] = nextStorage[storageIndex]; nextStorage[storageIndex] = temp; setParty(nextParty); setStorage(nextStorage); setToast(`${displayName(nextParty[partyIndex])} joined your active team.`); setTimeout(() => saveGame(false), 50); }
  function withdrawFromStorage(storageIndex) { const currentParty = gameRef.current.party || []; const currentStorage = gameRef.current.storage || []; if (currentParty.length >= 6 || !currentStorage[storageIndex]) return; const mon = currentStorage[storageIndex]; setParty([...currentParty, mon]); setStorage(currentStorage.filter((_, i) => i !== storageIndex)); setToast(`${displayName(mon)} was withdrawn from PC Storage.`); setTimeout(() => saveGame(false), 50); }
  function buyStock(stock) { setPlayer((p) => { const next = buyItemIntoPlayer(p, stock); if (!next) { setToast("Not enough coins."); sfx("fail"); return p; } setToast(`Bought ${stock.item}.`); sfx("success"); return next; }); setTimeout(() => saveGame(false), 80); }
  useEffect(() => { const onKey = (e) => { const k = e.key.toLowerCase(); if (["arrowup","w"].includes(k)) move(0,-1); if (["arrowdown","s"].includes(k)) move(0,1); if (["arrowleft","a"].includes(k)) move(-1,0); if (["arrowright","d"].includes(k)) move(1,0); if (k === "i" && gameRef.current.screen === "world") setScreen("party"); if (k === "p" && gameRef.current.screen === "world") setScreen("dex"); if (k === "m" && ["party","dex"].includes(gameRef.current.screen)) setScreen("world"); if (k === "f5") { e.preventDefault(); saveGame(); } }; window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey); }, []);
  function reset() { setScreen("title"); setStoryIndex(0); setPlayer(freshPlayer()); setParty([]); setStorage([]); setActive(0); setBattle(null); setNpc(null); setSeen(freshSeen()); setDex(freshDex()); setClock(freshClock()); setBattleAnim({ player: "idle", enemy: "idle", fx: null, text: null }); }
  const current = party[active]; const stats = dexStats(dex); const TimeIcon = timeIcon(clock);
  const hasStartedGame = party.length > 0 || storage.length > 0 || Object.keys(dex?.seen || {}).length > 0 || Object.keys(dex?.caught || {}).length > 0;
  const gameScreens = new Set(["world", "party", "pc", "shop", "dex", "atlas", "multiplayer", "friends", "objectives"]);
  function requestScreen(next) {
    if (gameScreens.has(next) && !hasStartedGame) {
      setToast("Start a New Journey or load a save before opening the map.");
      setScreen("title");
      return;
    }
    setScreen(next);
  }
  return <div className="h-[100dvh] max-h-[100dvh] bg-slate-950 text-white p-1 sm:p-3 landscape:p-0 overflow-hidden relative"><div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(34,211,238,.16),transparent_28%),radial-gradient(circle_at_80%_15%,rgba(217,70,239,.13),transparent_25%),radial-gradient(circle_at_55%_85%,rgba(132,204,22,.11),transparent_28%)]"/><div className="relative max-w-7xl mx-auto grid lg:grid-cols-[1fr_350px] gap-4"><Card className="rounded-2xl sm:rounded-3xl landscape:rounded-none overflow-hidden bg-slate-900/80 border-white/10 shadow-2xl shadow-cyan-500/10 h-[calc(100dvh-0.5rem)] sm:h-[calc(100dvh-1.5rem)] landscape:h-[100dvh]"><CardContent className="p-0 h-full overflow-hidden"><div className="h-full overflow-y-scroll overscroll-contain touch-pan-y pb-56 sm:pb-10" style={{ WebkitOverflowScrolling: "touch" }}><AnimatePresence mode="wait">{screen === "title" && <TitleScreen startStory={startStory} loadGame={loadGame} hasSave={hasSave}/>} {screen === "story" && <StoryScreen item={STORY[storyIndex]} nextStory={nextStory} index={storyIndex} total={STORY.length}/>} {screen === "starter" && <StarterScreen chooseStarter={chooseStarter}/>} {screen === "world" && party.length > 0 && <WorldScreen map={currentAreaMap(player)} area={currentAreaData(player)} player={player} move={move} party={party} storage={storage} seen={seen} dex={dex} setScreen={setScreen} saveGame={saveGame} clock={clock} viewport={viewport} onObjectiveClick={setObjectiveModal} objectiveMapFocus={objectiveMapFocus} clearObjectiveFocus={() => setObjectiveMapFocus(null)}/>} {screen === "party" && <PartyScreen party={party} active={active} setActive={setActive} setScreen={setScreen} player={player} seen={seen} evolve={evolve} clock={clock} useStatusItem={useStatusItem}/>} {screen === "pc" && <PCStorageScreen party={party} storage={storage} setScreen={setScreen} swapWithStorage={swapWithStorage} withdrawFromStorage={withdrawFromStorage}/>} {screen === "shop" && <ShopScreen player={player} setScreen={setScreen} buyStock={buyStock}/>} {screen === "dex" && <DexScreen dex={dex} setScreen={setScreen}/>} {screen === "account" && <AccountScreen setScreen={setScreen} authUser={authUser} accountProfile={accountProfile} accountStatus={accountStatus} setAccountStatus={setAccountStatus} findValidSave={findValidSave} hydrateSaveData={hydrateSaveData} uploadSaveDataToCloud={uploadSaveDataToCloud} loadAccountProfile={loadAccountProfile} cloudSyncStatus={cloudSyncStatus} lastCloudSyncAt={lastCloudSyncAt}/>} {screen === "multiplayer" && <MultiplayerScreen party={party} setParty={setParty} dex={dex} player={player} setScreen={setScreen} authUser={authUser} accountProfile={accountProfile} saveGame={saveGame}/>} {screen === "friends" && <FriendsScreen party={party} dex={dex} player={player} setScreen={setScreen} authUser={authUser} accountProfile={accountProfile}/>} {screen === "objectives" && <ObjectivesScreen setScreen={setScreen} player={player} seen={seen} dex={dex} party={party} storage={storage} clock={clock} onObjectiveClick={setObjectiveModal}/>} {screen === "help" && <HelpScreen setScreen={setScreen}/>} {screen === "update" && <UpdateCenterScreen setScreen={setScreen} availableUpdate={availableUpdate} status={updateStatus} checkUpdates={() => checkAppUpdate({ silent: false })} downloadUpdate={() => downloadAvailableUpdate(availableUpdate)} />} {screen === "atlas" && <AtlasScreen player={player} seen={seen} dex={dex} party={party} setScreen={setScreen}/>} {screen === "battle" && battle && current && <BattleScreen battle={battle} playerMon={current} skills={skills(current)} playerUse={playerUse} capture={capture} selectedCaptureItem={selectedCaptureItem} setSelectedCaptureItem={setSelectedCaptureItem} usePotion={usePotion} useStatusCure={useStatusCureInBattle} usePPItem={usePPItemInBattle} run={run} player={player} party={party} active={active} setActive={setActive} anim={battleAnim} dex={dex} clock={clock} onBattleResultContinue={finishBattleResult}/>} {screen === "gameover" && <GameOver reset={reset}/>} {screen === "world" && party.length === 0 && <StartRequiredScreen setScreen={setScreen} loadGame={loadGame} hasSave={hasSave}/>} {!VALID_SCREENS.has(screen) && <RecoveryScreen reset={reset} setScreen={setScreen} party={party}/>} {screen === "battle" && (!battle || !current) && <RecoveryScreen reset={reset} setScreen={setScreen} party={party} message="Battle data was missing, so the app can safely return to the map."/>}</AnimatePresence></div></CardContent></Card><div className="hidden lg:block"><SidePanel player={player} party={party} active={active} setScreen={requestScreen} reset={reset} saveGame={saveGame} loadGame={loadGame} clearSave={clearSave} hasSave={hasSave} muted={muted} setMuted={setMuted} stats={stats} clock={clock} authUser={authUser} accountProfile={accountProfile} cloudSyncStatus={cloudSyncStatus} lastCloudSyncAt={lastCloudSyncAt} storage={storage} seen={seen} dex={dex} onObjectiveClick={setObjectiveModal}/></div></div><MobileNav setScreen={requestScreen} saveGame={saveGame} muted={muted} setMuted={setMuted} authUser={authUser}/><AnimatePresence>{cinematic && <CinematicOverlay cinematic={cinematic}/>}</AnimatePresence><AnimatePresence>{evolutionScene && <EvolutionOverlay scene={evolutionScene}/>}</AnimatePresence><AnimatePresence>{toast && <motion.div initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 30, opacity: 0 }} className="fixed bottom-5 left-1/2 -translate-x-1/2 px-5 py-3 rounded-2xl bg-slate-900 border border-cyan-300/30 shadow-xl text-cyan-100 font-bold z-50">{toast}</motion.div>}</AnimatePresence><AnimatePresence>{npc && <NpcModal npc={npc} close={() => { if (npc.reward) npc.reward(); setNpc(null); saveGame(false); }}/>}</AnimatePresence><AnimatePresence>{pendingAreaGate && <AreaGateModal gate={pendingAreaGate} enter={confirmAreaGate} stay={cancelAreaGate}/>}</AnimatePresence><AnimatePresence>{objectiveModal && <ObjectiveDetailModal info={objectiveModal} close={() => setObjectiveModal(null)} showOnMap={(target) => { if (!target) return; setObjectiveMapFocus(target); setObjectiveModal(null); setScreen("world"); setToast(`Map target highlighted: ${target.label || "Objective"}`); }}/>}</AnimatePresence><AnimatePresence>{battleResult && <BattleResultModal result={battleResult} onContinue={finishBattleResult} />}</AnimatePresence><AnimatePresence>{updateModalVisible && availableUpdate && <UpdateAvailableModal manifest={availableUpdate} status={updateStatus} nativeReady={nativeUpdaterReady} download={() => downloadAvailableUpdate(availableUpdate)} later={() => setUpdateModalVisible(false)} checkAgain={() => checkAppUpdate({ silent: false })}/>}</AnimatePresence><AnimatePresence>{renameMon && <RenameModal nickname={nickname} setNickname={setNickname} notice={renameNotice} applyNickname={applyNickname} skip={() => { setRenameMon(null); setNickname(""); setRenameNotice(""); setTimeout(() => saveGame(false), 50); }}/>}</AnimatePresence></div>;
}


function StartRequiredScreen({ setScreen, loadGame, hasSave }) {
  return <motion.div key="start-required" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="min-h-full p-6 flex items-center justify-center bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-950">
    <Card className="max-w-xl w-full rounded-[2rem] bg-slate-900/90 border-cyan-200/20 shadow-2xl">
      <CardContent className="p-7 text-center">
        <div className="mx-auto mb-4 w-20 h-20 rounded-3xl bg-cyan-300 text-slate-950 flex items-center justify-center shadow-xl shadow-cyan-400/30"><Map className="w-10 h-10"/></div>
        <h2 className="text-4xl font-black text-white mb-3">No journey started yet</h2>
        <p className="text-slate-300 text-lg mb-5">Choose a starter or load a save before opening the map. This prevents the empty-map softlock.</p>
        <div className="grid grid-cols-2 gap-3">
          <Button onClick={()=>setScreen("story")} className="rounded-2xl bg-cyan-300 hover:bg-cyan-200 text-slate-950 font-black py-5">New Journey</Button>
          <Button onClick={loadGame} disabled={!hasSave} variant="secondary" className="rounded-2xl py-5 font-black disabled:opacity-40">{hasSave ? "Load Save" : "No Save"}</Button>
        </div>
      </CardContent>
    </Card>
  </motion.div>;
}

function TitleScreen({ startStory, loadGame, hasSave }) { return <motion.div key="title" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="min-h-[740px] flex items-center justify-center relative p-8"><div className="absolute inset-0 bg-slate-950"/><div className="relative text-center max-w-3xl"><motion.div animate={{ y: [0,-10,0] }} transition={{ duration: 3, repeat: Infinity }} className="mx-auto mb-4 w-44 h-44"><MonsterModel mon={makeMon("solarynx", 18)} size="medium"/></motion.div><div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-cyan-400/10 border border-cyan-300/30 text-cyan-100 mb-4"><Gamepad2 className="w-5 h-5"/>v59 Board & Adventure Edition</div><h1 className="text-6xl md:text-7xl font-black tracking-tight bg-gradient-to-r from-cyan-200 via-fuchsia-200 to-lime-200 text-transparent bg-clip-text mb-4">Mythbound Tamers</h1><p className="text-xl text-slate-200 mb-8">A monster-taming RPG: explore tile-board regions, catch Mythlings, train evolutions, discover shiny forms, clear quests, trade, battle, and follow the story through new routes and dungeons.</p><div className="flex flex-wrap justify-center gap-3"><Button onClick={startStory} className="rounded-2xl px-9 py-6 text-lg bg-cyan-300 hover:bg-cyan-200 text-slate-950 font-black">New Journey</Button><Button onClick={loadGame} disabled={!hasSave} variant="secondary" className={`rounded-2xl px-9 py-6 text-lg font-black ${!hasSave ? "opacity-40 cursor-not-allowed" : ""}`}><Upload className="w-5 h-5 mr-2"/>{hasSave ? "Continue" : "No Save"}</Button></div><p className="text-sm text-slate-400 mt-5">Move: WASD/arrows · Party: I · Dex: P · Return: M · Save: F5</p></div></motion.div>; }
function StoryScreen({ item, nextStory, index, total }) { return <motion.div key={`story-${index}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="min-h-[740px] p-8 flex items-center justify-center bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-950"><Card className="max-w-3xl bg-slate-900/90 border-cyan-300/20 rounded-3xl shadow-2xl"><CardContent className="p-8"><div className="flex items-center gap-4 mb-5"><div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-300 to-fuchsia-400 flex items-center justify-center text-slate-950"><Sparkles className="w-8 h-8"/></div><div><div className="text-sm text-slate-400 uppercase tracking-wider">Story {index + 1}/{total}</div><h2 className="text-3xl font-black text-white">{item.speaker}</h2></div></div><p className="text-2xl leading-relaxed text-slate-100 mb-7">{item.text}</p><Button onClick={nextStory} className="rounded-2xl px-6 py-5 bg-fuchsia-400 hover:bg-fuchsia-300 text-slate-950 font-black">Continue</Button></CardContent></Card></motion.div>; }
function StarterScreen({ chooseStarter }) { return <motion.div key="starter" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="min-h-full p-6 bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950"><div className="text-center mb-6"><h2 className="text-4xl font-black">Choose Your First Mythling</h2><p className="text-slate-300">All three starters now have third-stage evolutions.</p></div><div className="grid md:grid-cols-3 gap-5">{["emberlynx","aquapup","leafawn"].map((id) => <StarterCard key={id} id={id} chooseStarter={chooseStarter}/>)}</div></motion.div>; }
function StarterCard({ id, chooseStarter }) { const m = makeMon(id, 5), d = BESTIARY[id]; return <motion.button whileHover={{ y: -8, scale: 1.02 }} onClick={() => chooseStarter(id)} className="text-left rounded-3xl p-4 bg-white/5 border border-white/10 hover:border-cyan-200 transition shadow-xl overflow-hidden"><div className={`rounded-3xl bg-gradient-to-br ${TYPES[d.type].color} p-3 min-h-[235px] flex items-center justify-center`}><MonsterModel mon={m} size="medium"/></div><div className="p-3"><div className="flex justify-between items-center mb-2"><h3 className="text-2xl font-black">{d.name}</h3><TypeBadge type={d.type}/></div><p className="text-sm text-slate-300 mb-3">{d.species} · Evolves: {d.evo.method}</p><p className="text-slate-200 text-sm min-h-[72px]">{d.lore}</p></div></motion.button>; }
const TILE_INFO = {
  W: { kind: "Barrier", note: "A mountain wall. You cannot walk through it.", danger: "None", special: "Blocks movement." },
  C: { kind: "Healing", note: "Crystal Spring restores your active team.", danger: "Safe", special: "Heals your party." },
  N: { kind: "Story", note: "Grovepath Village, home of Elder Nima.", danger: "Safe", special: "Story progression and rewards." },
  R: { kind: "Trainer", note: "Rival Ren waits here with a counter-pick.", danger: "Trainer battle", special: "Required for Moon Keeper path." },
  K: { kind: "Trainer", note: "Moon Keeper Sola tests shrine-worthy tamers.", danger: "Trainer battle", special: "Unlocks shrine progression." },
  B: { kind: "Trainer", note: "Bridge Captain Brann guards the ash road.", danger: "Trainer battle", special: "Opens the route to Dracinder." },
  S: { kind: "Shrine", note: "The Old Shrine reforms the Prism Key.", danger: "Low", special: "Unlocks Shadow and night Mythlings." },
  D: { kind: "Legend", note: "Dragon Gate, where Dracinder appears after the relic oath.", danger: "Legend battle", special: "Main story climax." },
  T: { kind: "Treasure", note: "A one-time chest with useful supplies.", danger: "Safe", special: "Capsules and potions." },
  E: { kind: "Cinematic Wild Zone", note: "Echo Caves amplify every cry into a rippling battle intro.", danger: "Sound encounters", special: "Best place to find Echopup and Bellimp." },
  Y: { kind: "Wild Zone", note: "Beastwood is dense and loud; heavy footsteps shake the trees.", danger: "Beast encounters", special: "Cuboulder and Titan-route monsters appear here." },
  U: { kind: "Boss Route", note: "Titan Pass towers above Luminara with cinematic mountain winds.", danger: "High", special: "Rare Beast and Metal evolutions can appear here." },
  "1": { kind: "Legendary Dungeon", note: "Sunken Sun Catacombs glow only for tamers who restored the Sky Prism.", danger: "Legendary Light battle", special: "Solguard appears here in the morning after the main story." },
  "2": { kind: "Legendary Dungeon", note: "Nocturne Catacombs are chained under eclipse-black stone.", danger: "Legendary Shadow battle", special: "Umbraclaw appears at night after you have seen 20 Mythlings." },
  "3": { kind: "Legendary Dungeon", note: "Tideglass Grotto reflects a starry ocean below the world.", danger: "Legendary Aqua battle", special: "Thalassor appears at night if you carry a Tide Pearl." },
  "4": { kind: "Legendary Dungeon", note: "Verdant Catacombs are wrapped in roots older than Luminara.", danger: "Legendary Verdant battle", special: "Gaialith appears after the post-game step pilgrimage." },
  "5": { kind: "Legendary Dungeon", note: "Timeglass Labyrinth ticks between moments.", danger: "Legendary Crystal battle", special: "Chronova appears when your Dex proves you are worthy." },
  "6": { kind: "Cinematic Wild Zone", note: "Ember Roost is a cliffside nest field where ash feathers glow in the wind.", danger: "Flame/Air encounters", special: "Best place to find Embercrow and Pyreaven." },
  "7": { kind: "Cinematic Wild Zone", note: "Mirage Garden bends light around crystal flowers and dreamlike paths.", danger: "Mystic encounters", special: "Best place to find Miragecalf and Miragehart." },
  "8": { kind: "Cinematic Wild Zone", note: "Tideglass Flats shimmer like shallow glass after every wave.", danger: "Aqua/Metal encounters", special: "Best place to find Tidebug and Shellsurge." },
  a: { kind: "Area Gate", note: "A beginner gate toward Skyrail Meadow.", danger: "Travel · Lv.5-11", special: "Leads to Skyrail Meadow." },
  e: { kind: "Area Gate", note: "A cave gate toward Echo Caves.", danger: "Travel · Lv.7-14", special: "Leads to Echo Caves." },
  x: { kind: "Area Gate", note: "A misty gate toward Spirit Marsh.", danger: "Travel · Lv.9-17", special: "Leads to Spirit Marsh." },
  j: { kind: "Area Gate", note: "A green-crystal gate toward Verdant Canopy.", danger: "Travel · Lv.11-19", special: "Leads to Verdant Canopy." },
  t: { kind: "Area Gate", note: "A tideglass gate toward the coast.", danger: "Travel · Lv.13-22", special: "Leads to Tideglass Flats." },
  p: { kind: "Area Gate", note: "A prism gate toward the old ruins.", danger: "Travel · Lv.15-24", special: "Leads to Prism Ruins." },
  h: { kind: "Area Gate", note: "An icy gate toward Frostglass Peaks.", danger: "Travel · Lv.17-27", special: "Leads to Frostglass Peaks." },
  m: { kind: "Area Gate", note: "A rail gate toward Ironrail Yard.", danger: "Travel · Lv.19-30", special: "Leads to Ironrail Yard." },
  u: { kind: "Area Gate", note: "A giant-stone gate toward Titan Pass.", danger: "Travel · Lv.21-33", special: "Leads to Titan Pass." },
  v: { kind: "Area Gate", note: "A moonlit gate toward Nocturne Road.", danger: "Travel · Lv.23-35", special: "Leads to Nocturne Road." },
  o: { kind: "Area Gate", note: "A flower gate toward Orchid Court.", danger: "Travel · Lv.24-36", special: "Leads to Orchid Court." },
  "9": { kind: "Story Gate", note: "The late-game fire gate toward Caldera Crown and Dracinder.", danger: "Travel · Lv.28-42", special: "Leads to Caldera Crown after the bridge oath." },
  F: { kind: "Wild Zone", note: "Ash Field is a normal Flame encounter field. It is not the Caldera gate anymore.", danger: "Wild encounters", special: "Use the separate Caldera Gate marked 🔥 / 9 for the late-game route." },
  "0": { kind: "Area Exit", note: "Return to Luminara Crossroads or step into a connected board.", danger: "Safe", special: "Moves between area boards." },
};

function foundLocationsForMonster(id) {
  const locations = [];
  Object.entries(ENCOUNTERS).forEach(([tile, pool]) => {
    if ((pool || []).includes(id)) locations.push(TILE_NAMES[tile] || tile);
  });
  Object.values(AREA_DATA || {}).forEach((area) => {
    Object.entries(area.encounters || {}).forEach(([tile, pool]) => {
      if ((pool || []).includes(id)) locations.push(`${area.name} · ${TILE_NAMES[tile] || tile}`);
    });
  });
  Object.entries(LEGENDARY_DUNGEONS || {}).forEach(([tile, dungeon]) => {
    if (dungeon.id === id) locations.push(`${dungeon.title} (${dungeon.condition})`);
  });
  const timedHints = [];
  if (id === "dawnhare") timedHints.push("Morning bonus in Tall Grass or Wind Hill.");
  if (id === "nightmoth") timedHints.push("Night bonus in Moon Cave / Ash Field after shrine progress.");
  if (id === "frostcub") timedHints.push("More common near Lake Shore at night.");
  if (id === "aurorabbit") timedHints.push("Rare dawn encounter in Frost Hollow.");
  if (id === "mistowl") timedHints.push("Morning fog near Prism Ruins and Wind Hill.");
  if (id === "chimegeist") timedHints.push("Evening / night Spirit and Echo locations.");
  if (BESTIARY[id]?.legendary) timedHints.push("Late-game legendary dungeon condition required.");
  return { locations: [...new Set(locations)], timedHints };
}

function learnsetForMonster(id) {
  const data = BESTIARY[id] || {};
  return (data.skills || ["Guard"]).map((skillName) => {
    const sk = SKILLS[skillName] || SKILLS.Guard;
    return {
      name: skillName,
      level: sk.unlock || 1,
      type: sk.type || data.type || "Mystic",
      power: sk.kind === "attack" ? sk.power : 0,
      accuracy: Math.round((sk.accuracy ?? 0.94) * 100),
      crit: Math.round((sk.crit ?? 0.08) * 100),
      kind: sk.kind,
      text: sk.text,
      status: sk.status ? `${sk.status.chance ? Math.round(sk.status.chance * 100) + "% " : ""}${sk.status.key}` : null,
    };
  }).sort((a,b)=>a.level-b.level || a.name.localeCompare(b.name));
}

function evolutionChainForMonster(id) {
  const previous = Object.entries(BESTIARY).find(([, m]) => m.evo?.to === id)?.[0] || null;
  const chain = [];
  let start = previous ? previous : id;
  while (Object.entries(BESTIARY).find(([, m]) => m.evo?.to === start)) {
    start = Object.entries(BESTIARY).find(([, m]) => m.evo?.to === start)[0];
  }
  let cur = start;
  let guard = 0;
  while (cur && BESTIARY[cur] && guard++ < 5) {
    chain.push(cur);
    cur = BESTIARY[cur].evo?.to || null;
  }
  return chain;
}


function storyMilestones(seen, dex) {
  const stats = dexStats(dex || freshDex());
  return [
    { id: "starter", label: "Choose starter", done: true },
    { id: "elder", label: "Meet Elder Nima", done: !!seen?.elder },
    { id: "rival", label: "Defeat Rival Ren", done: !!seen?.rival },
    { id: "keeper", label: "Defeat Moon Keeper", done: !!seen?.keeper },
    { id: "shrine", label: "Restore Old Shrine", done: !!seen?.shrine },
    { id: "brann", label: "Defeat Bridge Captain", done: !!seen?.bridgeCaptain },
    { id: "dragon", label: "Restore Sky Prism", done: !!seen?.dragon },
    { id: "legends", label: "Legendary seals", done: !!seen?.dragon && stats.caught >= 30 },
  ];
}
function storyProgressPercent(seen, dex) {
  const list = storyMilestones(seen, dex);
  return Math.round((list.filter((m) => m.done).length / list.length) * 100);
}
function sideQuestList(player, seen, dex, party) {
  const stats = dexStats(dex || freshDex());
  const area = currentAreaData(player);
  return [
    { title: "Seed Bell Trial", area: "Verdant Canopy", done: (player?.steps || 0) >= 150, goal: "Walk 150 total steps, then evolve Cedarmunk into Forestwarden." },
    { title: "Aurora Lens", area: "Frostglass Peaks", done: !!dex?.caught?.glacira || !!dex?.seen?.glacira, goal: "Find the Snowkit line and unlock Glacira's Dex entry." },
    { title: "Harmony Charm", area: "Orchid Court", done: !!dex?.caught?.orchidiva || !!dex?.seen?.orchidiva, goal: "Encounter Orchidiva and learn sleep/confuse counterplay." },
    { title: "Engineer’s Rail Badge", area: "Ironrail Yard", done: !!dex?.caught?.locopanther || !!dex?.seen?.locopanther, goal: "Catch or see Locopanther in the rail yard." },
    { title: "Lucky Prism Tag", area: "Luminous Bazaar", done: !!dex?.caught?.aurumane || !!dex?.seen?.aurumane, goal: "Encounter Aurumane and find the Bell Merchants in Luminous Bazaar." },
    { title: "Storm Bell Trial", area: "Stormspire Cliffs", done: !!dex?.caught?.stormglass || !!dex?.seen?.stormglass, goal: "Encounter Stormglass after ringing the storm bells on the cliffs." },
    { title: "Drowned Tablet Quest", area: "Sunken Archive", done: !!dex?.caught?.leviacoil || !!dex?.seen?.leviacoil, goal: "Recover the drowned tablets and encounter Leviacoil." },
    { title: "Sunrise Brazier Quest", area: "Phoenix Roost", done: !!dex?.caught?.phoenixar || !!dex?.seen?.phoenixar, goal: "Light the sunrise braziers and unlock the Phoenixar line." },
    { title: "Collector Rank", area: "All Areas", done: stats.caught >= 25, goal: `Catch 25 Mythlings. Current: ${stats.caught}/25.` },
  ];
}
function nextProgressionHint(player, seen, dex) {
  if (!seen?.elder) return "Next: go to Grovepath Village (E) and speak with Elder Nima.";
  if (!seen?.rival) return "Next: defeat Rival Ren. Recommended route: Skyrail Meadow → Echo Caves.";
  if (!seen?.keeper) return "Next: reach Spirit Marsh and defeat Moon Keeper Sola.";
  if (!seen?.shrine) return "Next: visit the Old Shrine and restore the Prism Key.";
  if (!seen?.bridgeCaptain) return "Next: train through Tideglass Flats / Prism Ruins, then beat Bridge Captain Brann.";
  if (!seen?.dragon) return "Next: cross Titan Pass, Nocturne Road, and Caldera Crown to challenge Dracinder.";
  return "Post-game: hunt the five legendary dungeons and complete the Prism Dex.";
}

function objectiveSections(player, seen, dex, party, storage, clock) {
  const stats = dexStats(dex || freshDex());
  const main = [];
  const side = [];

  if (!party || !party.length) main.push("Choose your first Mythling from Professor Aster.");
  else if (!seen?.elder) main.push("Go to Grovepath Village (E) and speak with Elder Nima.");
  else if (!seen?.rival) main.push("Defeat Rival Ren at the River Rival Bridge (R).");
  else if (!seen?.keeper) main.push("Find Moon Keeper Sola at the Keeper Gate (K).");
  else if (!seen?.shrine) main.push("Visit the Old Shrine (⌂) to unlock shadow routes.");
  else if (!seen?.bridgeCaptain) main.push("Beat Bridge Captain Brann at the Ash Road Captain tile (B).");
  else if (!seen?.dragon) main.push("Face Dracinder at Dragon Gate (龍) and restore the Sky Prism.");
  else main.push("Post-game: challenge the five legendary dungeons and complete the Prism Dex.");

  if (seen?.dragon) {
    const remainingLegends = Object.values(LEGENDARY_DUNGEONS || {}).filter((d) => !seen?.[d.id]);
    if (remainingLegends.length) side.push(`Legend hunt: ${remainingLegends.length} sealed legendary dungeons remain.`);
  }
  side.push(`Dex progress: ${stats.caught}/${stats.total} caught, ${stats.seen}/${stats.total} seen.`);
  if ((storage || []).length) side.push(`PC Storage: ${storage.length} Mythling${storage.length === 1 ? "" : "s"} stored. Visit PC to manage your team.`);
  if (party?.some((m) => BESTIARY[m.id]?.evo)) side.push("Check Team for possible evolutions and evolution requirements.");
  if (totalCaptureItems(player) <= 2) side.push("Low on capture items. Visit the Shop before hunting rare Mythlings.");
  side.push(`Current time: ${timeString(clock)}. Some Mythlings only appear in morning, evening, or night.`);

  return { main, side };
}


function progressionVisualState(player, seen, dex, party = []) {
  const route = currentRouteStep(player, seen, party);
  const currentArea = AREA_DATA[player?.area] || AREA_DATA.luminara;
  const nextArea = route.next?.id === "postgame" ? null : AREA_DATA[route.next?.id];
  let stepTitle = "Continue your journey";
  let action = nextProgressionHint(player, seen, dex);
  let priority = "Story";
  let color = "from-cyan-300 to-fuchsia-300";
  let icon = "✦";

  if (!seen?.elder) {
    stepTitle = "Meet Elder Nima";
    priority = "Main Story";
    color = "from-amber-200 to-orange-300";
    icon = "E";
  } else if (!seen?.rival) {
    stepTitle = "Defeat Rival Ren";
    priority = "Trainer Battle";
    color = "from-rose-200 to-fuchsia-300";
    icon = "R";
  } else if (!seen?.keeper) {
    stepTitle = "Reach Moon Keeper Sola";
    priority = "Boss Battle";
    color = "from-violet-200 to-purple-400";
    icon = "K";
  } else if (!seen?.shrine) {
    stepTitle = "Restore the Old Shrine";
    priority = "Dungeon Objective";
    color = "from-indigo-200 to-cyan-300";
    icon = "⌂";
  } else if (!seen?.bridgeCaptain) {
    stepTitle = "Beat Bridge Captain Brann";
    priority = "Route Boss";
    color = "from-orange-200 to-red-300";
    icon = "B";
  } else if (!seen?.dragon) {
    stepTitle = "Challenge Dracinder";
    priority = "Chapter Finale";
    color = "from-yellow-200 to-rose-400";
    icon = "龍";
  } else {
    stepTitle = "Post-game Legend Hunt";
    priority = "Post-game";
    color = "from-lime-200 to-cyan-300";
    icon = "★";
  }

  return {
    route,
    currentArea,
    nextArea,
    stepTitle,
    action,
    priority,
    color,
    icon,
  };
}

function areaIdByName(name) {
  const normalized = String(name || "").toLowerCase();
  if (!normalized || normalized === "all areas") return null;
  const found = Object.values(AREA_DATA || {}).find((area) => area.name.toLowerCase() === normalized || area.id.toLowerCase() === normalized.replace(/\s+/g, ""));
  return found?.id || null;
}
function mainObjectiveTarget(player, seen) {
  if (!player || !(player.area)) player = freshPlayer();
  if (!seen?.elder) return { areaId: "luminara", tile: "N", label: "Grovepath Village / Elder Nima", icon: "E", detail: "Find an Elder tile marked E. On Luminara this is Grovepath Village." };
  if (!seen?.rival) return { areaId: "luminara", tile: "R", label: "Rival Ren Bridge", icon: "R", detail: "Find the Rival tile marked R. Prepare before entering the trainer battle." };
  if (!seen?.keeper) return { areaId: "luminara", tile: "K", label: "Moon Keeper Gate", icon: "K", detail: "Find the Keeper tile marked K. If it is in another route, follow the highlighted area gate first." };
  if (!seen?.shrine) return { areaId: "luminara", tile: "S", label: "Old Shrine", icon: "⌂", detail: "Find the shrine tile marked ⌂ and interact with it to restore the Prism Key." };
  if (!seen?.bridgeCaptain) return { areaId: "luminara", tile: "B", label: "Bridge Captain Brann", icon: "B", detail: "Find the Captain tile marked B. Train first if your lead Mythling is underleveled." };
  if (!seen?.dragon) return { areaId: "calderaCrown", tile: "D", label: "Dragon Gate / Dracinder", icon: "龍", detail: "Travel toward Caldera Crown and find the Dragon Gate marked 龍." };
  return { areaId: "luminara", tile: "1", label: "Legendary Seals", icon: "★", detail: "Post-game legendary seals are marked by numbers 1-5. Use the Atlas to pick one." };
}
function sideObjectiveTarget(data) {
  const title = String(data?.title || "").toLowerCase();
  if (title.includes("seed")) return { areaId: "verdantCanopy", tile: "J", label: "Verdant Canopy / Seed Bell Trial", icon: "晶", detail: "Travel through the Verdant Gate marked ↗ near the Crystal Jungle route." };
  if (title.includes("aurora")) return { areaId: "frostglassPeaks", tile: "H", label: "Frostglass Peaks / Aurora Lens", icon: "❄", detail: "Use the Frostglass Peaks gate marked ↗ near Frost Hollow." };
  if (title.includes("harmony")) return { areaId: "orchidCourt", tile: "O", label: "Orchid Court / Harmony Charm", icon: "✿", detail: "Use the Orchid Court gate marked ↗ near Orchid Orchard." };
  if (title.includes("engineer") || title.includes("rail")) return { areaId: "ironrailYard", tile: "M", label: "Ironrail Yard / Rail Badge", icon: "▲", detail: "Use the Ironrail Yard gate marked ↗ near Rocky Pass." };
  if (title.includes("lucky") || title.includes("bazaar")) return { areaId: "luminousBazaar", tile: "$", label: "Luminous Bazaar / Lucky Prism Tag", icon: "¤", detail: "Use the Luminous Bazaar gate marked ¤ near the southern market road." };
  if (title.includes("storm")) return { areaId: "stormspireCliffs", tile: "!", label: "Stormspire Cliffs / Storm Bell Trial", icon: "ϟ", detail: "Use the Stormspire gate marked ϟ at the southern cliff road." };
  if (title.includes("collector")) return { areaId: "luminara", tile: "G", label: "Any Wild Zone", icon: "♣", detail: "Catch more Mythlings in wild tiles. Different areas contain different pools." };
  if (title.includes("legend")) return { areaId: "luminara", tile: "1", label: "Legendary Dungeon Seal", icon: "★", detail: "Legend dungeons are numbered 1-5 and unlock after the main story." };
  const areaId = areaIdByName(data?.area);
  return { areaId: areaId || "luminara", tile: areaId ? "0" : "G", label: data?.area || "Objective Area", icon: areaId ? "↗" : "♣", detail: data?.goal || "Follow the objective details." };
}
function gateTileToArea(areaId) {
  const entry = Object.entries(AREA_EXITS || {}).find(([, dest]) => dest === areaId);
  return entry?.[0] || null;
}
function objectiveTargetForCurrentMap(target, currentAreaId) {
  if (!target) return null;
  if (target.areaId === currentAreaId) return { ...target, displayTile: target.tile, mode: "target" };
  const gateTile = gateTileToArea(target.areaId);
  return { ...target, displayTile: gateTile, mode: "gate", label: gateTile ? `Gate toward ${AREA_DATA[target.areaId]?.name || target.label}` : target.label };
}


function milestoneObjectiveTarget(milestone) {
  const id = typeof milestone === "string" ? milestone : milestone?.id;
  const label = typeof milestone === "string" ? milestone : milestone?.label;
  const map = {
    starter: { areaId: "luminara", tile: "N", label: "Starter / Professor Aster", icon: "★", detail: "Start a new journey and choose one of the starter Mythlings." },
    elder: { areaId: "luminara", tile: "N", label: "Grovepath Village / Elder Nima", icon: "E", detail: "Go to the village tile and speak with Elder Nima." },
    rival: { areaId: "luminara", tile: "R", label: "Rival Ren Bridge", icon: "R", detail: "Battle Rival Ren at the bridge tile." },
    keeper: { areaId: "luminara", tile: "K", label: "Moon Keeper Gate", icon: "K", detail: "Find the Keeper Gate and defeat Moon Keeper Sola." },
    shrine: { areaId: "luminara", tile: "S", label: "Old Shrine", icon: "⌂", detail: "Visit the shrine tile to restore the Prism Key." },
    brann: { areaId: "luminara", tile: "B", label: "Bridge Captain Brann", icon: "B", detail: "Challenge the Bridge Captain at the B tile." },
    dragon: { areaId: "calderaCrown", tile: "D", label: "Dragon Gate / Dracinder", icon: "龍", detail: "Travel toward Caldera Crown and find Dragon Gate." },
    legends: { areaId: "luminara", tile: "1", label: "Legendary Dungeon Seals", icon: "★", detail: "After the main story, legend dungeons are marked by numbers 1-5." },
  };
  return map[id] || { areaId: "luminara", tile: "G", label: label || "Story Step", icon: "★", detail: "Follow the story checklist and use Show on Map." };
}


function objectiveInstructionSteps(type, data, target, player, seen, dex, visual) {
  if (type === "main") {
    const recommendedId = visual.route?.next?.id || recommendedStoryAreaId(player, seen);
    const routeTarget = recommendedId === "postgame" ? target : routeTargetForArea(recommendedId);
    return [
      { title: "Check current area", body: `You are currently in ${visual.currentArea?.name || "Luminara"}.`, target: routeTarget },
      { title: "Go to the recommended route", body: `Next recommended area: ${visual.nextArea?.name || (visual.route.next?.id === "postgame" ? "Legendary Seals" : "Complete the Prism Dex")}.`, target: routeTarget },
      { title: "Find the correct map icon", body: `Look for ${routeTarget.icon} / ${routeTarget.label}. Press Show on Map to highlight the correct route gate.`, target: routeTarget },
      { title: "Complete the current objective", body: target.detail, target },
      { title: "Prepare first", body: "Heal, save, and buy items before boss, trainer, or legendary battles.", target },
    ];
  }
  if (type === "side") {
    return [
      { title: "Travel to the side area", body: `Travel to ${data.area}.`, target },
      { title: "Show the target", body: `Press Show on Map to highlight ${target.label}.`, target },
      { title: "Complete the side goal", body: data.done ? "This side objective is already complete." : data.goal, target },
      { title: "Inspect nearby tiles", body: "Tap surrounding tiles to preview encounters, dangers, timed spawns, and special notes.", target },
      { title: "Restock before exploring", body: "Use shops and Crystal Springs before longer side routes.", target },
    ];
  }
  if (type === "step") {
    return [
      { title: data?.done ? "Review completed step" : "Find this story step", body: data?.done ? "This story step is complete, but you can still highlight where it happened." : "This story step is not complete yet.", target },
      { title: "Show exact map location", body: `Press Show on Map to highlight ${target.label}.`, target },
      { title: "Follow the route", body: target.detail, target },
    ];
  }
  return [{ title: "Explore", body: "Follow the objective tracker and map highlights.", target }];
}
function buildStepObjectivePayload(parentInfo, step) {
  const target = step?.target || parentInfo?.target;
  return {
    title: step?.title || "Objective Step",
    badge: parentInfo?.badge || "Step",
    body: step?.body || "Follow this step and use Show on Map for guidance.",
    target,
    steps: [
      step?.body || "Follow this step.",
      target?.detail || parentInfo?.target?.detail || "Use the highlighted map location.",
      "Press Show on Map to highlight this step's tile or the gate toward it."
    ],
    color: parentInfo?.color || "from-cyan-200 to-fuchsia-300",
    icon: parentInfo?.icon || target?.icon || "✦",
    parentTitle: parentInfo?.title || "Objective"
  };
}

function buildObjectivePayload(type, data, player, seen, dex, party = []) {
  const visual = progressionVisualState(player, seen, dex, party);
  if (type === "main") {
    const target = mainObjectiveTarget(player, seen);
    return {
      title: visual.stepTitle,
      badge: visual.priority,
      body: visual.action,
      target,
      steps: objectiveInstructionSteps("main", data, target, player, seen, dex, visual),
      color: visual.color,
      icon: visual.icon
    };
  }
  if (type === "side") {
    const target = sideObjectiveTarget(data);
    return {
      title: data.title,
      badge: data.area,
      body: data.goal,
      target,
      steps: objectiveInstructionSteps("side", data, target, player, seen, dex, visual),
      color: data.done ? "from-lime-200 to-cyan-300" : "from-fuchsia-200 to-cyan-300",
      icon: data.done ? "✓" : "○"
    };
  }
  if (type === "step") {
    const target = milestoneObjectiveTarget(data);
    return {
      title: data?.label || "Story Step",
      badge: data?.done ? "Completed" : "Story Step",
      body: data?.done ? "This story step is already complete. You can still highlight its location on the map." : "This story checkpoint is part of the main route. Use Show on Map to find the right tile or gate.",
      target,
      steps: objectiveInstructionSteps("step", data, target, player, seen, dex, visual),
      color: data?.done ? "from-lime-200 to-cyan-300" : "from-cyan-200 to-fuchsia-300",
      icon: data?.done ? "✓" : "○"
    };
  }
  return { title: "Objective", badge: "Info", body: "Explore Luminara and follow the tracker.", steps: [], color: "from-cyan-200 to-fuchsia-300", icon: "✦" };
}
function ObjectivePanel({ player, seen, dex, party, storage, clock, compact = false, onObjectiveClick = null }) {
  const obj = objectiveSections(player, seen, dex, party, storage, clock);
  const percent = storyProgressPercent(seen, dex);
  const visual = progressionVisualState(player, seen, dex, party);
  const milestones = storyMilestones(seen, dex);
  const sideQuests = sideQuestList(player, seen, dex, party);
  const ppWarnings = lowPPWarnings(party);
  const shownMilestones = compact ? milestones.slice(0, 6) : milestones;
  const nextAreaName = visual.nextArea?.name || (visual.route.next?.id === "postgame" ? "Legendary Seals" : "Complete the Prism Dex");
  const currentAreaName = visual.currentArea?.name || "Luminara";
  const openObjective = (type, data) => onObjectiveClick && onObjectiveClick(buildObjectivePayload(type, data, player, seen, dex, party));

  return <div className={`rounded-[2rem] bg-slate-950/70 border border-cyan-200/20 ${compact ? "p-3" : "p-5"} shadow-2xl shadow-cyan-500/10 overflow-hidden relative`}>
    <div className={`absolute inset-0 opacity-20 bg-gradient-to-br ${visual.color}`} />
    <div className="relative">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.32em] text-cyan-200 font-black">Progress Tracker</div>
          <h3 className={`${compact ? "text-xl" : "text-3xl"} font-black text-white leading-tight`}>What to do next</h3>
        </div>
        <div className={`shrink-0 rounded-2xl bg-gradient-to-br ${visual.color} text-slate-950 px-3 py-2 text-center shadow-xl`}>
          <div className="text-2xl font-black leading-none">{visual.icon}</div>
          <div className="text-[10px] font-black uppercase">{percent}%</div>
        </div>
      </div>

      <div className="h-4 rounded-full bg-black/40 border border-white/10 overflow-hidden mb-4">
        <motion.div className={`h-full bg-gradient-to-r ${visual.color} shadow-lg`} animate={{ width: `${percent}%` }} transition={{ duration: 0.55 }} />
      </div>

      <button type="button" onClick={() => openObjective("main")} className={`text-left w-full mb-4 rounded-[1.5rem] bg-gradient-to-br ${visual.color} p-[2px] shadow-xl hover:scale-[1.01] active:scale-[0.99] transition`}>
        <div className="rounded-[1.4rem] bg-slate-950/92 p-4">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <Badge className="bg-white text-slate-950 font-black">{visual.priority}</Badge>
            <Badge className="bg-slate-800 text-cyan-100 border border-cyan-200/20">Now: {currentAreaName}</Badge>
            <Badge className="bg-slate-800 text-fuchsia-100 border border-fuchsia-200/20">Next: {nextAreaName}</Badge>
          </div>
          <div className={`${compact ? "text-xl" : "text-2xl"} font-black text-white mb-1`}>{visual.stepTitle}</div>
          <div className={`${compact ? "text-sm" : "text-base"} text-cyan-50 font-semibold leading-relaxed`}>{visual.action}</div>
          <div className="mt-2 text-xs text-cyan-200 font-black">Tap for exact steps</div>
        </div>
      </button>

      <div className="mb-4 grid grid-cols-[auto_1fr_auto] items-center gap-2 text-xs sm:text-sm">
        <div className="rounded-xl bg-cyan-300/15 border border-cyan-200/20 px-3 py-2 text-cyan-100 font-black truncate">{currentAreaName}</div>
        <div className="h-1 rounded-full bg-gradient-to-r from-cyan-300 via-fuchsia-300 to-lime-300" />
        <div className="rounded-xl bg-fuchsia-300/15 border border-fuchsia-200/20 px-3 py-2 text-fuchsia-100 font-black truncate">{nextAreaName}</div>
      </div>

      <div className="mb-4 rounded-2xl bg-black/25 border border-white/10 p-3">
        <div className="text-[10px] uppercase tracking-[0.24em] text-amber-200 font-black mb-2">Main objective</div>
        {obj.main.map((m, i)=><div key={i} className={`${compact ? "text-base" : "text-lg"} font-black text-white leading-snug flex gap-2`}><span className="text-amber-200">➤</span><span>{m}</span></div>)}
      </div>

      <div className="mb-4">
        <div className="text-[10px] uppercase tracking-[0.24em] text-cyan-200 font-black mb-2">Story checklist</div>
        <div className="grid grid-cols-2 gap-2">
          {shownMilestones.map((m)=><div key={m.id} className={`text-xs rounded-2xl px-3 py-2 border font-bold ${m.done ? "bg-lime-300/15 border-lime-200/30 text-lime-100" : "bg-slate-900/70 border-white/10 text-slate-300"}`}>
            <span className={m.done ? "text-lime-200" : "text-slate-500"}>{m.done ? "✓" : "○"}</span> {m.label}
          </div>)}
        </div>
      </div>

      <div className="rounded-2xl bg-black/20 border border-white/10 p-3">
        <div className="text-[10px] uppercase tracking-[0.24em] text-fuchsia-200 font-black mb-2">Side goals and warnings</div>
        <div className="space-y-2">
          {sideQuests.slice(0, compact ? 2 : 5).map((q)=><button type="button" onClick={() => openObjective("side", q)} key={q.title} className={`text-left text-sm rounded-xl px-3 py-2 border hover:scale-[1.01] active:scale-[0.99] transition ${q.done ? "bg-lime-300/10 border-lime-200/20 text-lime-100" : "bg-white/5 border-white/10 text-slate-200"}`}>
            <span className="font-black">{q.done ? "✓" : "○"} {q.title}</span> <span className="text-cyan-200">({q.area})</span>: {q.goal}<span className="block text-xs text-fuchsia-200 mt-1">Tap for details</span>
          </button>)}
          {ppWarnings.slice(0, compact ? 1 : 3).map((m, i)=><div key={`pp-${i}`} className="text-sm rounded-xl px-3 py-2 bg-amber-300/10 border border-amber-200/20 text-amber-100">⚠ Low PP: {m}</div>)}
          {obj.side.slice(0, compact ? 2 : 4).map((m, i)=><div key={`tip-${i}`} className="text-sm rounded-xl px-3 py-2 bg-slate-900/60 border border-white/10 text-slate-300">Tip: {m}</div>)}
        </div>
      </div>
    </div>
  </div>;
}

function ObjectivesScreen({ setScreen, player, seen, dex, party, storage, clock, onObjectiveClick }) {
  const visual = progressionVisualState(player, seen, dex, party);
  return <motion.div
    key="objectives"
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    exit={{ opacity: 0 }}
    className={`min-h-full p-4 sm:p-6 bg-gradient-to-br ${visual.color || "from-slate-950 via-indigo-950 to-slate-950"}`}
  >
    <div className="flex justify-between items-start gap-3 mb-4">
      <div>
        <div className="text-xs uppercase tracking-[0.36em] text-cyan-100 font-black">Tamer Log</div>
        <h2 className="text-4xl sm:text-5xl font-black text-white leading-tight">Objectives</h2>
        <p className="text-slate-100/85 max-w-2xl">Your main route, story checklist, side quests, warnings, and exact map targets live here so the board stays clean.</p>
      </div>
      <Button onClick={()=>setScreen("world")} className="rounded-2xl bg-cyan-300 text-slate-950 hover:bg-cyan-200 font-black">Back to Board</Button>
    </div>
    <ObjectivePanel player={player} seen={seen} dex={dex} party={party} storage={storage} clock={clock} compact={false} onObjectiveClick={onObjectiveClick} />
  </motion.div>;
}



function tileDetails(tile, clock, area = null) {
  const name = TILE_NAMES[tile] || "Unknown Tile";
  const base = TILE_INFO[tile] || {
    kind: ENCOUNTERS[tile] ? "Wild Zone" : "Open Ground",
    note: ENCOUNTERS[tile] ? `Wild Mythlings can appear in ${name}.` : "A quiet path with no common encounters.",
    danger: ENCOUNTERS[tile] ? "Wild encounters" : "Safe",
    special: "Tap adjacent areas to inspect routes."
  };
  const pool = ((area?.encounters || {})[tile]) || ENCOUNTERS[tile] || [];
  const timed = [];
  const tod = timeName(clock);
  if (tod === "Morning" && ["A", "G", "H", "P"].includes(tile)) timed.push("Morning bonus: Dawnhare, Lumifox, Aurorabbit, or Mistowl may be easier to find.");
  if (tod === "Night" && ["V", "F", "X", "L", "E"].includes(tile)) timed.push("Night bonus: Nightmoth, Frostcub, Toxifrog, Chimegeist, or Shadow Mythlings may appear.");
  if (["E", "Y", "U", "6", "7", "8"].includes(tile)) timed.push("Cinematic route: entering battles here uses stronger encounter framing and rarer Mythling pools.");
  if (LEGENDARY_DUNGEONS[tile]) timed.push(`Legendary dungeon: ${LEGENDARY_DUNGEONS[tile].condition}`);
  if (AREA_EXITS[tile]) {
    const target = AREA_DATA[AREA_EXITS[tile]];
    timed.unshift(`Area gate: enter ${target?.name || "another area"} · recommended Lv.${target?.levelMin || "?"}-${target?.levelMax || "?"}. Step on this tile to choose whether to travel.`);
    return { name, ...base, kind: "Area Gate", danger: `Travel · Lv.${target?.levelMin || "?"}-${target?.levelMax || "?"}`, special: `Leads to ${target?.name || "another area"}`, pool, timed };
  }
  return { name, ...base, pool, timed };
}

function WorldScreen({ map, area, player, move, party, storage, seen, dex, setScreen, saveGame, clock, viewport: viewportProp, onObjectiveClick, objectiveMapFocus, clearObjectiveFocus }) {
  const viewport = viewportProp || { w: typeof window !== "undefined" ? window.innerWidth : 390, h: typeof window !== "undefined" ? window.innerHeight : 780 };
  const [selectedTile, setSelectedTile] = useState(null);
  const [mapZoom, setMapZoom] = useState(1);
  const pinchRef = useRef(null);
  const tileClass = (t) => ({
    W:"bg-slate-800 border-slate-700", G:"bg-emerald-700/80 border-emerald-500/40", C:"bg-cyan-500/80 border-cyan-200",
    N:"bg-amber-500/80 border-amber-200", R:"bg-rose-500/80 border-rose-200", K:"bg-purple-500/80 border-purple-200",
    B:"bg-orange-500/80 border-orange-200", S:"bg-violet-500/80 border-violet-200", D:"bg-fuchsia-700/90 border-fuchsia-200",
    T:"bg-yellow-500/80 border-yellow-200", L:"bg-blue-700/80 border-blue-300", M:"bg-stone-600 border-stone-300",
    V:"bg-indigo-900 border-indigo-300", F:"bg-red-800/80 border-red-300", A:"bg-sky-700/80 border-sky-200",
    O:"bg-pink-700/80 border-pink-300", Q:"bg-amber-700/80 border-yellow-300", P:"bg-violet-800/90 border-cyan-200",
    H:"bg-cyan-900/80 border-blue-100", J:"bg-teal-700/80 border-fuchsia-200", X:"bg-purple-950 border-lime-300", Z:"bg-cyan-950 border-fuchsia-300", E:"bg-pink-950 border-fuchsia-300", Y:"bg-orange-950 border-yellow-300", U:"bg-stone-900 border-orange-300", "1":"bg-yellow-950 border-yellow-200", "2":"bg-black border-purple-300", "3":"bg-blue-950 border-cyan-200", "4":"bg-emerald-950 border-lime-200", "5":"bg-slate-950 border-fuchsia-200", "6":"bg-red-950 border-orange-300", "7":"bg-fuchsia-950 border-cyan-200", "8":"bg-blue-950 border-sky-200", "$":"bg-yellow-950 border-amber-200", "!":"bg-sky-950 border-yellow-200", "9":"bg-red-950 border-yellow-200", a:"bg-sky-950 border-sky-200", e:"bg-indigo-950 border-fuchsia-200", x:"bg-purple-950 border-lime-300", p:"bg-violet-950 border-cyan-200", u:"bg-stone-950 border-orange-200", t:"bg-blue-950 border-cyan-200", m:"bg-zinc-900 border-stone-200", v:"bg-slate-950 border-purple-300", h:"bg-cyan-950 border-blue-100", j:"bg-teal-950 border-lime-200", o:"bg-pink-950 border-pink-200", "0":"bg-cyan-950 border-cyan-200"
  }[t] || "bg-lime-700/60 border-lime-500/30");
  const label = (t) => ({ C:"✦", N:"E", R:"R", K:"K", B:"B", S:"⌂", D:"龍", T:"?", G:"♣", L:"≈", M:"▲", V:"☾", F:"火", A:"~", O:"✿", Q:"◆", P:"✧", H:"❄", J:"晶", X:"☠", Z:"⚡", E:"♫", Y:"爪", U:"巨", "1":"☀", "2":"◐", "3":"♒", "4":"根", "5":"⌛", "6":"羽", "7":"幻", "8":"≋", "$":"¤", "!":"ϟ", "9":"🔥", "%":"☊", "@":"☉", a:"☁", e:"◈", x:"☾", p:"✧", u:"巨", t:"≋", m:"⚙", v:"♬", h:"❄", j:"♣", o:"✿", "0":"↩", W:"" }[t] || "");
  const tileOverlay = (t) => ({
    W:"from-slate-800/60 via-slate-900/25 to-slate-950/35",
    G:"from-lime-300/20 via-emerald-600/15 to-emerald-950/35",
    F:"from-orange-300/20 via-red-600/15 to-black/35",
    A:"from-sky-200/25 via-cyan-500/10 to-indigo-950/25",
    L:"from-cyan-200/25 via-blue-500/15 to-blue-950/35",
    M:"from-stone-200/20 via-stone-500/15 to-black/35",
    V:"from-violet-300/20 via-indigo-800/15 to-black/45",
    "$":"from-yellow-200/35 via-amber-500/20 to-orange-950/45",
    "!":"from-cyan-200/25 via-yellow-300/15 to-indigo-950/45",
    "9":"from-yellow-200/20 via-red-500/25 to-black/55", "%":"from-cyan-200/25 via-blue-600/20 to-black/45", "@":"from-yellow-200/25 via-orange-500/25 to-red-950/45", a:"from-sky-200/30 via-cyan-500/20 to-indigo-950/45", e:"from-violet-200/25 via-indigo-500/20 to-black/40", x:"from-fuchsia-200/25 via-purple-700/20 to-black/45", p:"from-cyan-200/25 via-fuchsia-400/20 to-indigo-950/45", u:"from-stone-200/25 via-orange-700/20 to-black/45", t:"from-blue-200/25 via-cyan-600/20 to-blue-950/45", m:"from-zinc-200/25 via-slate-600/20 to-black/45", v:"from-pink-200/25 via-purple-700/20 to-black/45", h:"from-blue-100/25 via-sky-400/20 to-slate-950/45", j:"from-lime-200/25 via-emerald-700/20 to-black/45", o:"from-rose-200/25 via-pink-500/20 to-black/45",
  }[t] || "from-white/10 via-transparent to-black/20");
  const tileGlow = (t) => ({
    "$":"shadow-amber-300/30",
    "!":"shadow-cyan-300/30",
    "9":"shadow-red-300/40", "%":"shadow-cyan-300/35", "@":"shadow-amber-300/35", a:"shadow-cyan-300/35", e:"shadow-violet-300/35", x:"shadow-purple-300/35", p:"shadow-fuchsia-300/35", u:"shadow-orange-300/35", t:"shadow-blue-300/35", m:"shadow-zinc-300/30", v:"shadow-pink-300/35", h:"shadow-sky-200/35", j:"shadow-lime-300/35", o:"shadow-rose-300/35",
    C:"shadow-cyan-300/30",
    T:"shadow-yellow-300/30",
    N:"shadow-amber-300/30",
    R:"shadow-rose-300/30",
    K:"shadow-purple-300/30",
    B:"shadow-orange-300/30",
    S:"shadow-violet-300/30"
  }[t] || "shadow-black/20");

  const TimeIcon = timeIcon(clock);
  const selected = selectedTile ? tileDetails(selectedTile.tile, clock, area) : null;
  const objectiveFocusOnMap = objectiveTargetForCurrentMap(objectiveMapFocus, area?.id || player.area || "luminara");
  const mapRows = map.length;
  const mapCols = Math.max(...map.map((row) => row.length));
  const isLandscapeView = viewport.w > viewport.h;
  const isTinyLandscape = isLandscapeView && viewport.h < 520;
  const boardGap = isLandscapeView ? 3 : 4;
  const bottomMenuAllowance = isLandscapeView ? 62 : (viewport.w < 640 ? 96 : 24);
  const headerAllowance = isLandscapeView ? 112 : 168;
  const boardFitWidth = Math.max(280, Math.min(viewport.w - (isLandscapeView ? 8 : 10), isLandscapeView ? viewport.w - 8 : 820));
  const boardFitHeight = Math.max(250, viewport.h - headerAllowance - bottomMenuAllowance);

  // Orientation-aware board shaping:
  // portrait keeps taller cells; landscape widens cells and lowers height so the board fills the screen
  // instead of leaving dead space or requiring unnecessary vertical scroll.
  const rawTileW = (boardFitWidth - Math.max(0, mapCols - 1) * boardGap) / Math.max(1, mapCols);
  const rawTileH = (boardFitHeight - Math.max(0, mapRows - 1) * boardGap) / Math.max(1, mapRows);
  const landscapeBoost = isLandscapeView ? 1.08 : 1;
  const portraitBoost = !isLandscapeView ? 1.04 : 1;
  const tileW = Math.max(30, Math.min(132, Math.floor(rawTileW * mapZoom * landscapeBoost)));
  const tileH = Math.max(30, Math.min(132, Math.floor(rawTileH * mapZoom * portraitBoost)));
  const tileVisual = Math.min(tileW, tileH);
  const mapPixelWidth = mapCols * tileW + Math.max(0, mapCols - 1) * boardGap;
  const mapPixelHeight = mapRows * tileH + Math.max(0, mapRows - 1) * boardGap;
  const boardViewportHeight = Math.max(220, Math.min(boardFitHeight, Math.max(mapPixelHeight + 8, boardFitHeight)));
  const boardViewportWidth = Math.max(280, Math.min(boardFitWidth, Math.max(mapPixelWidth + 8, boardFitWidth)));
  const clampZoom = (value) => Math.max(0.62, Math.min(1.85, value));
  const touchDistance = (touches) => {
    const [a, b] = touches;
    return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  };
  const handleTouchStart = (e) => {
    if (e.touches.length === 2) pinchRef.current = { distance: touchDistance(e.touches), zoom: mapZoom };
  };
  const handleTouchMove = (e) => {
    if (e.touches.length !== 2 || !pinchRef.current) return;
    e.preventDefault();
    const next = pinchRef.current.zoom * (touchDistance(e.touches) / Math.max(1, pinchRef.current.distance));
    setMapZoom(clampZoom(next));
  };
  return <motion.div key="world" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className={`min-h-[calc(100dvh-92px)] landscape:min-h-[100dvh] p-1 sm:p-2 landscape:p-1 bg-gradient-to-br ${area?.bg || "from-slate-950 via-emerald-950 to-slate-950"}`}>
    <div className="relative mb-1 rounded-[1.35rem] sm:rounded-[1.8rem] overflow-hidden border border-cyan-200/30 bg-slate-950/88 shadow-2xl shadow-cyan-500/20">
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_10%_18%,rgba(103,232,249,.34),transparent_28%),radial-gradient(circle_at_86%_22%,rgba(217,70,239,.24),transparent_34%),linear-gradient(90deg,rgba(2,6,23,.98),rgba(8,47,73,.78),rgba(30,27,75,.88))]" />
      <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-gradient-to-b from-cyan-200 via-fuchsia-300 to-lime-200"/>
      <div className="relative px-2 py-1 sm:px-4 sm:py-2.5 landscape:py-1">
        <div className="flex items-center justify-between gap-1.5">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-12 h-12 sm:w-14 sm:h-14 landscape:w-9 landscape:h-9 rounded-2xl bg-gradient-to-br from-cyan-200 via-cyan-300 to-fuchsia-200 text-slate-950 flex items-center justify-center shadow-xl shadow-cyan-300/40 shrink-0 ring-2 ring-white/30">
              <Map className="w-6 h-6 sm:w-7 sm:h-7 landscape:w-5 landscape:h-5"/>
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span className="text-[17px] sm:text-2xl landscape:text-[13px] font-black tracking-[0.15em] sm:tracking-[0.22em] text-white leading-[0.95] drop-shadow-[0_2px_10px_rgba(34,211,238,.55)]">MYTHBOUND</span>
                <span className="text-[17px] sm:text-2xl landscape:text-[13px] font-black tracking-[0.16em] sm:tracking-[0.24em] text-cyan-100 leading-[0.95] drop-shadow-[0_2px_10px_rgba(34,211,238,.55)]">TAMERS</span>
              </div>
              <div className="text-[8px] sm:text-[10px] landscape:text-[7px] uppercase tracking-[0.18em] text-lime-100 font-black mt-0.5">Monster-taming RPG</div>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button onClick={() => setScreen("objectives")} variant="secondary" className="rounded-xl font-black px-2 py-1.5 sm:px-3 sm:py-2 landscape:px-2 landscape:py-1 text-[10px] sm:text-xs bg-cyan-300 text-slate-950 hover:bg-cyan-200 border-cyan-100 shadow-lg shadow-cyan-300/20"><Sparkles className="w-3.5 h-3.5 mr-1"/>Goals</Button>
            <Button onClick={() => setMapZoom((z)=>clampZoom(z - 0.15))} variant="secondary" className="rounded-xl font-black px-2 py-1 text-[10px] sm:text-xs">−</Button>
            <Button onClick={() => setMapZoom(1)} variant="secondary" className="rounded-xl font-black px-2 py-1 text-[10px] sm:text-xs">{Math.round(mapZoom * 100)}%</Button>
            <Button onClick={() => setMapZoom((z)=>clampZoom(z + 0.15))} variant="secondary" className="rounded-xl font-black px-2 py-1 text-[10px] sm:text-xs">+</Button>
          </div>
        </div>
        <div className="mt-1 landscape:mt-0.5 flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1 rounded-2xl bg-white/8 border border-cyan-200/20 px-2.5 py-1 landscape:py-0.5 shadow-inner">
            <div className="flex items-center gap-2 min-w-0">
              <div className="min-w-0 flex-1">
                <div className="text-[8px] sm:text-[10px] landscape:text-[7px] uppercase tracking-[0.22em] text-cyan-100/90 font-black">Current Area</div>
                <div className="text-lg sm:text-3xl landscape:text-sm font-black text-white truncate leading-tight">{area?.name || "Luminara Wilds"}</div>
              </div>
              <Badge className="bg-slate-900/80 text-cyan-100 border border-cyan-300/25 px-2 py-1 text-[10px] landscape:text-[8px] shrink-0"><TimeIcon className="w-3 h-3 mr-1"/>{timeString(clock)}</Badge>
            </div>
            <div className="text-[9px] sm:text-xs landscape:text-[7px] text-cyan-100/90 font-bold truncate">Catch • Train • Evolve • Explore routes • Battle bosses</div>
          </div>
        </div>
      </div>
    </div>

{objectiveFocusOnMap && <div className="mb-1 rounded-2xl bg-cyan-300/12 border border-cyan-200/30 p-1.5 landscape:p-1 flex flex-wrap items-center justify-between gap-2 shadow-xl shadow-cyan-500/10">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-2xl bg-cyan-200 text-slate-950 flex items-center justify-center font-black text-xl">{objectiveFocusOnMap.icon || "✦"}</div>
        <div><div className="text-xs uppercase tracking-wider text-cyan-200 font-black">Objective Map Target</div><div className="font-black text-white">{objectiveFocusOnMap.label}</div><div className="text-xs text-slate-300">{objectiveFocusOnMap.mode === "gate" ? "This highlighted tile is the gate toward the objective area." : "This highlighted tile is the objective target."}</div></div>
      </div>
      <Button onClick={clearObjectiveFocus} variant="secondary" className="rounded-xl text-xs font-black">Clear Target</Button>
    </div>}

    <div className="relative">
      <div
        className="overflow-auto rounded-[1.35rem] sm:rounded-[2rem] bg-black/35 border border-white/10 shadow-2xl p-1 sm:p-1.5 overscroll-contain"
        style={{ touchAction: "pan-x pan-y", height: boardViewportHeight, maxHeight: boardViewportHeight, width: "100%", maxWidth: boardViewportWidth }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={() => { pinchRef.current = null; }}
        onWheel={(e) => {
          if (!e.ctrlKey) return;
          e.preventDefault();
          setMapZoom((z) => clampZoom(z + (e.deltaY < 0 ? 0.08 : -0.08)));
        }}
      >
        <div
          className="mx-auto flex items-center justify-center"
          style={{ width: mapPixelWidth, minWidth: mapPixelWidth, height: Math.max(mapPixelHeight, boardViewportHeight - 8), minHeight: mapPixelHeight }}
        >
          <div
            className="grid"
            style={{
              gap: boardGap,
              width: mapPixelWidth,
              height: mapPixelHeight,
              gridTemplateColumns: `repeat(${mapCols}, ${tileW}px)`,
              gridAutoRows: `${tileH}px`,
            }}
          >
            {map.map((row,y)=>row.padEnd(mapCols, "W").split("").map((t,x)=>{
              const here=player.x===x&&player.y===y;
              const isSelected=selectedTile?.x===x&&selectedTile?.y===y;
              const isAreaGate = AREA_EXITS[t] && AREA_EXITS[t] !== (player.area || "luminara");
              const isObjectiveTile = objectiveFocusOnMap?.displayTile && t === objectiveFocusOnMap.displayTile;
              return <button
                type="button"
                onClick={()=>setSelectedTile({ tile:t, x, y })}
                key={`${x}-${y}`}
                className={`relative rounded-xl border flex items-center justify-center font-black shrink-0 overflow-hidden transition shadow-lg ${tileGlow(t)} ${tileClass(t)} ${isAreaGate ? "ring-1 ring-cyan-200 shadow-md shadow-cyan-300/20" : ""} ${isObjectiveTile ? "ring-4 ring-yellow-200 shadow-2xl shadow-yellow-300/50 z-20" : ""} ${isSelected ? "ring-2 ring-white ring-offset-2 ring-offset-slate-950 z-10" : ""}`}
                style={{ width: tileW, height: tileH, borderRadius: Math.max(10, Math.min(22, Math.round(tileVisual * 0.24))), fontSize: Math.max(10, Math.min(18, Math.round(tileVisual * 0.34))) }}
                aria-label={`${TILE_NAMES[t] || "Unknown tile"} at ${x + 1}, ${y + 1}`}
              >
                <span className={`absolute inset-0 bg-gradient-to-br ${tileOverlay(t)} pointer-events-none`}/><span className="relative z-10 opacity-95 pointer-events-none leading-none drop-shadow-[0_2px_4px_rgba(0,0,0,.65)]">{label(t)}</span>{isAreaGate && <><span className="absolute right-1 top-1 px-1 py-[1px] rounded-full bg-cyan-100 text-[7px] leading-none text-slate-950 border border-slate-950 shadow-sm z-20">GO</span><motion.span animate={{ opacity:[0.18,0.65,0.18], scale:[0.85,1.22,0.85] }} transition={{ duration:1.5, repeat:Infinity }} className="absolute inset-[5px] rounded-lg border border-cyan-100/50 pointer-events-none z-10"/></>}
                {isObjectiveTile && <motion.div animate={{ y:[0,-4,0], scale:[1,1.08,1] }} transition={{ duration:1.1, repeat:Infinity }} className="absolute left-1/2 -translate-x-1/2 top-0.5 z-30 rounded-full bg-yellow-200 text-slate-950 text-[10px] px-1.5 py-0.5 border border-slate-950 shadow-lg pointer-events-none">{objectiveFocusOnMap.icon || "★"}</motion.div>}
                {here&&<motion.div layoutId="player" className="absolute inset-[3px] rounded-lg bg-gradient-to-br from-cyan-200 to-fuchsia-300 shadow-lg shadow-cyan-400/40 flex items-center justify-center text-slate-950"><PawPrint className="w-5 h-5"/></motion.div>}
              </button>
            }))}
          </div>
        </div>
      </div>

      <Card className="hidden rounded-3xl bg-white/5 border-white/10">
        <CardContent className="p-4">
          {selected ? <div>
            <div className="flex items-center justify-between gap-2 mb-2"><h3 className="text-2xl font-black">{selected.name}</h3><Badge className="bg-cyan-300 text-slate-950">{selected.kind}</Badge></div>
            <p className="text-slate-200 mb-3">{selected.note}</p>
            <div className="grid grid-cols-2 gap-2 mb-3 text-sm"><InfoBox label="Danger" value={selected.danger}/><InfoBox label="Special" value={selected.special}/></div>
            <div className="text-xs uppercase tracking-wider text-slate-400 mb-2">Possible Mythlings</div>
            {selected.pool.length ? <div className="flex flex-wrap gap-2">{selected.pool.slice(0, 10).map((id)=><Badge key={id} className="bg-slate-800 text-slate-100 border border-white/10">{BESTIARY[id]?.name || id}</Badge>)}</div> : <p className="text-slate-400 text-sm">No normal wild encounters here.</p>}
            {selected.timed.length > 0 && <div className="mt-3 p-3 rounded-2xl bg-fuchsia-400/10 border border-fuchsia-300/20 text-sm text-fuchsia-100">{selected.timed.join(" ")}</div>}
          </div> : <div><h3 className="text-2xl font-black mb-2">Tile Scanner</h3><p className="text-slate-300">Tap any map block to see the location type, danger, special function, and possible encounters.</p></div>}
        </CardContent>
      </Card>
    </div>

    <AnimatePresence>{selected && selectedTile && <TileInfoPopup selected={selected} tile={selectedTile.tile} x={selectedTile.x} y={selectedTile.y} close={() => setSelectedTile(null)} />}</AnimatePresence>
    <MobileMovePad move={move} />

    <div className="hidden max-w-4xl mx-auto mt-4 md:grid-cols-[1fr_260px] gap-3">
      <div className="p-4 rounded-2xl bg-white/5 border border-white/10">
        <div className="font-black text-cyan-100 mb-2">Touch controls</div>
        <div className="grid grid-cols-3 gap-2 max-w-[180px]"><div/><Button onClick={()=>move(0,-1)} variant="secondary" className="rounded-xl">↑</Button><div/><Button onClick={()=>move(-1,0)} variant="secondary" className="rounded-xl">←</Button><Button onClick={()=>move(0,1)} variant="secondary" className="rounded-xl">↓</Button><Button onClick={()=>move(1,0)} variant="secondary" className="rounded-xl">→</Button></div>
      </div>
      <div className="p-4 rounded-2xl bg-white/5 border border-white/10">
        <div className="font-black text-cyan-100 mb-2">Lead Partner</div>{party[0]?<div className="flex items-center gap-3"><MonsterModel mon={party[0]} size="small"/><div><div className="font-black">{displayName(party[0])}</div><div className="text-sm text-slate-300">Lv.{party[0].level} · HP {party[0].hp}/{party[0].maxHp}</div></div></div>:<span className="text-slate-300">No partner yet.</span>}
      </div>
    </div>
  </motion.div>;
}

function TileInfoPopup({ selected, tile, x, y, close }) {
  return <motion.div
    initial={{ opacity: 0, y: -18, scale: 0.96 }}
    animate={{ opacity: 1, y: 0, scale: 1 }}
    exit={{ opacity: 0, y: -18, scale: 0.96 }}
    className="fixed left-2 right-2 top-[104px] sm:top-[128px] landscape:top-[78px] z-50 mx-auto max-w-md landscape:max-w-sm rounded-2xl sm:rounded-3xl bg-slate-950/95 border border-cyan-200/30 shadow-2xl shadow-cyan-500/20 backdrop-blur-xl p-3 sm:p-4 landscape:p-2.5"
  >
    <div className="flex items-start justify-between gap-3">
      <div>
        <div className="text-xs text-slate-400 uppercase tracking-wider">Tile {x + 1}, {y + 1} · {tile}</div>
        <h3 className="text-xl font-black text-white">{selected.name}</h3>
      </div>
      <Button onClick={close} variant="secondary" className="rounded-xl px-3 py-2 text-xs">Close</Button>
    </div>
    <div className="mt-2 flex flex-wrap gap-2">
      <Badge className="bg-cyan-300 text-slate-950">{selected.kind}</Badge>
      <Badge className="bg-slate-800 text-slate-100 border border-white/10">Danger: {selected.danger}</Badge>
    </div>
    <p className="mt-3 text-sm text-slate-200 leading-relaxed">{selected.note}</p>
    <p className="mt-2 text-xs text-fuchsia-100"><b>Special:</b> {selected.special}</p>
    {selected.pool.length > 0 && <div className="mt-3">
      <div className="text-[11px] uppercase tracking-wider text-slate-400 mb-1">May include</div>
      <div className="flex flex-wrap gap-1.5">{selected.pool.slice(0, 6).map((id)=><Badge key={id} className="bg-white/10 text-white border border-white/10">{BESTIARY[id]?.name || id}</Badge>)}</div>
    </div>}
    {selected.timed.length > 0 && <div className="mt-3 rounded-2xl bg-fuchsia-400/10 border border-fuchsia-300/20 p-2 text-xs text-fuchsia-100">{selected.timed[0]}</div>}
  </motion.div>;
}

function MobileMovePad({ move }) {
  const readPadPos = () => {
    if (typeof window === "undefined") return { x: 16, y: 250 };
    try {
      const saved = JSON.parse(localStorage.getItem("mythbound_dpad_pos") || "null");
      if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) return saved;
    } catch {}
    return { x: Math.max(12, window.innerWidth - 205), y: Math.max(90, window.innerHeight - 390) };
  };
  const [pos, setPos] = useState(readPadPos);
  const dragRef = useRef(null);
  const tapMove = (dx, dy) => {
    move(dx, dy);
    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(18);
  };
  const clampPos = (x, y) => {
    const w = typeof window !== "undefined" ? window.innerWidth : 390;
    const h = typeof window !== "undefined" ? window.innerHeight : 800;
    return { x: Math.max(8, Math.min(w - 184, x)), y: Math.max(74, Math.min(h - 205, y)) };
  };
  const startDrag = (e) => {
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startY: e.clientY, x: pos.x, y: pos.y, moved: false };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const moveDrag = (e) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    if (Math.abs(dx) + Math.abs(dy) > 3) dragRef.current.moved = true;
    const next = clampPos(dragRef.current.x + dx, dragRef.current.y + dy);
    setPos(next);
  };
  const endDrag = () => {
    if (!dragRef.current) return;
    try { localStorage.setItem("mythbound_dpad_pos", JSON.stringify(pos)); } catch {}
    dragRef.current = null;
  };
  const buttonClass = "rounded-2xl w-14 h-14 text-2xl font-black bg-slate-900/95 border border-cyan-200/30 shadow-lg shadow-cyan-500/10 active:scale-95";
  return <div className="lg:hidden fixed z-50 rounded-3xl bg-slate-950/72 border border-white/10 backdrop-blur-xl p-2 shadow-2xl select-none touch-none" style={{ left: pos.x, top: pos.y }}>
    <div onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag} className="cursor-move text-[10px] uppercase tracking-wider text-cyan-100 text-center mb-1 font-black rounded-xl py-1 bg-cyan-300/10 border border-cyan-200/10">
      Drag Move Pad
    </div>
    <div className="grid grid-cols-3 gap-1">
      <div />
      <Button onClick={()=>tapMove(0,-1)} variant="secondary" className={buttonClass} aria-label="Move up">↑</Button>
      <div />
      <Button onClick={()=>tapMove(-1,0)} variant="secondary" className={buttonClass} aria-label="Move left">←</Button>
      <Button onClick={()=>tapMove(0,1)} variant="secondary" className={buttonClass} aria-label="Move down">↓</Button>
      <Button onClick={()=>tapMove(1,0)} variant="secondary" className={buttonClass} aria-label="Move right">→</Button>
    </div>
  </div>;
}

function PartyScreen({ party, active, setActive, setScreen, player, seen, evolve, clock, useStatusItem }) {
  return <motion.div key="party" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="min-h-full p-6 bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-950">
    <div className="flex justify-between items-center mb-5">
      <div>
        <h2 className="text-4xl font-black">Your Mythlings</h2>
        <p className="text-slate-300">Persistent statuses like poison, burn, and paralysis remain after battle until cured, while sleep, freeze, and confusion clear after battle.</p>
      </div>
      <Button onClick={()=>setScreen("world")} className="rounded-xl bg-cyan-300 text-slate-950 hover:bg-cyan-200 font-black">Back</Button>
    </div>
    <div className="grid md:grid-cols-2 gap-4">{party.map((m,i)=>{
      const evo=BESTIARY[m.id]?.evo;
      const ready=canEvolve(m,player,seen,clock);
      const cureItem = cureItemForStatus(m.status);
      const canCure = hasAnyCureForStatus(player, m.status);
      return <div key={m.uid} className={`rounded-3xl p-4 border transition ${i===active?"bg-cyan-400/15 border-cyan-200":"bg-white/5 border-white/10"}`}>
        <button onClick={()=>setActive(i)} className="text-left w-full">
          <div className="flex gap-4 items-center">
            <MonsterModel mon={m} size="small"/>
            <div className="flex-1">
              <div className="flex flex-wrap gap-2 items-center mb-1">
                <h3 className="text-2xl font-black">{displayName(m)}</h3><GenderMark mon={m}/><TypeBadge type={m.type}/><StatusBadge status={m.status}/>{i===active&&<Badge className="bg-cyan-300 text-slate-950">Lead</Badge>}
              </div>
              <p className="text-sm text-slate-300">Species: {m.name} · Stage {BESTIARY[m.id].stage || 1} · Lv.{m.level} · HP {m.hp}/{m.maxHp} · XP {m.xp}/{m.nextXp}</p>
              <StatRow m={m}/><XPBar mon={m}/>
              {m.status && <p className="text-xs text-amber-100 mt-2">{STATUS_CONDITIONS[normalizeStatus(m.status)?.key]?.description}</p>}
              <p className="text-sm text-slate-300 mt-2">{BESTIARY[m.id].lore}</p>
            </div>
          </div>
        </button>
        {m.status && <div className="mt-3 p-3 rounded-2xl bg-amber-300/10 border border-amber-200/20 flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm"><div className="font-black text-amber-100">Status: {statusText(m.status)}</div><div className="text-slate-300">Cure with {cureItem} or Full Heal.</div></div>
          <div className="flex gap-2">
            <Button onClick={()=>useStatusItem(i, cureItem)} disabled={!cureItem || itemCount(player, cureItem)<=0} className="rounded-xl text-xs disabled:opacity-40">{cureItem || "Cure"} x{itemCount(player, cureItem)}</Button>
            <Button onClick={()=>useStatusItem(i, "Full Heal")} disabled={itemCount(player,"Full Heal")<=0} variant="secondary" className="rounded-xl text-xs disabled:opacity-40">Full Heal x{itemCount(player,"Full Heal")}</Button>
          </div>
        </div>}
        {evo?<div className="mt-3 p-3 rounded-2xl bg-black/20 border border-white/10 flex items-center justify-between gap-2"><div className="text-sm"><div className="font-black">Evolves into {BESTIARY[evo.to].name}</div><div className="text-slate-300">Method: {evo.method}</div></div><Button onClick={()=>evolve(i)} disabled={!ready} className="rounded-xl bg-fuchsia-400 hover:bg-fuchsia-300 text-slate-950 font-black disabled:opacity-40">Evolve</Button></div>:<div className="mt-3 p-3 rounded-2xl bg-black/20 border border-white/10 text-sm text-slate-300">No further evolution.</div>}
      </div>
    })}</div>
  </motion.div>;
}
function StatRow({ m }) { return <div className="grid grid-cols-4 gap-2 mt-3 text-xs"><MiniStat label="ATK" v={m.atk}/><MiniStat label="DEF" v={m.def}/><MiniStat label="SPD" v={m.spd}/><MiniStat label="HP" v={m.maxHp}/></div>; }
function MiniStat({ label, v }) { return <div className="p-2 rounded-xl bg-black/20 border border-white/10"><div className="text-slate-400">{label}</div><div className="font-black text-white">{v}</div></div>; }
function DexScreen({ dex, setScreen }) {
  const safeDex = ensureDexShape(dex);
  const stats = dexStats(safeDex);
  const [selectedId, setSelectedId] = useState(null);
  const [mode, setMode] = useState("normal");
  const selectedData = selectedId ? BESTIARY[selectedId] : null;
  const selectedSeen = selectedId ? !!safeDex.seen[selectedId] : false;
  const selectedCaught = selectedId ? !!safeDex.caught[selectedId] : false;
  const selectedShinySeen = selectedId ? !!safeDex.shinySeen[selectedId] : false;
  const selectedShinyCaught = selectedId ? !!safeDex.shinyCaught[selectedId] : false;
  const shinyMode = mode === "shiny";

  return <motion.div key="dex" initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }} className="min-h-full p-4 sm:p-6 bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950">
    <div className="flex justify-between items-center mb-5 gap-3">
      <div>
        <h2 className="text-3xl sm:text-4xl font-black flex items-center gap-2"><BookOpen className="w-8 h-8 text-cyan-200"/>Prism Dex</h2>
        <p className="text-slate-300">Seen {stats.seen}/{stats.total} · Caught {stats.caught}/{stats.total} · Shiny caught {stats.shinyCaught}/{stats.total}.</p>
      </div>
      <Button onClick={()=>setScreen("world")} className="rounded-xl bg-cyan-300 text-slate-950 hover:bg-cyan-200 font-black">Back</Button>
    </div>

    <div className="mb-4 grid grid-cols-2 gap-2 max-w-xl">
      <Button onClick={()=>setMode("normal")} className={`rounded-2xl font-black ${!shinyMode ? "bg-cyan-300 hover:bg-cyan-200 text-slate-950" : "bg-slate-800 hover:bg-slate-700 text-slate-200"}`}>Normal Dex</Button>
      <Button onClick={()=>setMode("shiny")} className={`rounded-2xl font-black ${shinyMode ? "bg-gradient-to-r from-yellow-200 to-fuchsia-300 hover:brightness-110 text-slate-950" : "bg-slate-800 hover:bg-slate-700 text-slate-200"}`}><Sparkles className="w-4 h-4 mr-2"/>Shiny Dex</Button>
    </div>

    {shinyMode && <div className="mb-4 rounded-3xl bg-yellow-200/10 border border-yellow-200/30 p-4 text-yellow-50">
      <div className="font-black text-xl flex items-center gap-2"><Sparkles className="w-5 h-5"/>Shiny Dex</div>
      <p className="text-sm text-yellow-100/90 mt-1">Shiny silhouettes unlock only after encountering a shiny. A normal-owned Mythling does not count as shiny-owned, but it is marked so you know you already own the regular form.</p>
    </div>}

    <div className="grid xl:grid-cols-[1fr_420px] gap-4">
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {DEX_ORDER.map((id,idx)=>{
          const d=BESTIARY[id];
          const seen=!!safeDex.seen[id], caught=!!safeDex.caught[id];
          const shinySeen=!!safeDex.shinySeen[id], shinyCaught=!!safeDex.shinyCaught[id];
          const reveal = shinyMode ? shinySeen : seen;
          const owned = shinyMode ? shinyCaught : caught;
          const normalOwnedOnly = shinyMode && caught && !shinyCaught;
          const mon = { ...makeMon(id,1), shiny: shinyMode && reveal };
          return <button key={id} type="button" onClick={()=>setSelectedId(id)} className={`text-left rounded-3xl border transition hover:scale-[1.01] ${selectedId===id ? "ring-2 ring-cyan-200 border-cyan-200" : owned?"border-lime-300/50 bg-lime-400/10":reveal?"border-cyan-300/30 bg-cyan-400/10":normalOwnedOnly?"border-amber-300/40 bg-amber-400/10":"border-white/10 bg-black/30"}`}>
            <div className="p-4">
              <div className="flex items-center gap-3">
                <MonsterModel mon={mon} size="tiny" silhouette={!reveal}/>
                <div className="min-w-0">
                  <div className="text-xs text-slate-400">#{String(idx+1).padStart(3,"0")}</div>
                  <h3 className="text-xl font-black truncate text-white">{reveal ? (shinyMode ? `✦ ${d.name}` : d.name) : "?????"}</h3>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {reveal ? <TypeBadge type={d.type}/> : <Badge className="bg-slate-800 text-slate-400">Unknown</Badge>}
                    {owned && <Badge className="bg-lime-300 text-slate-950"><BadgeCheck className="w-3 h-3 mr-1"/>{shinyMode ? "Shiny owned" : "Caught"}</Badge>}
                    {shinyMode && shinySeen && !shinyCaught && <Badge className="bg-yellow-200 text-slate-950"><Sparkles className="w-3 h-3 mr-1"/>Seen shiny</Badge>}
                    {normalOwnedOnly && <Badge className="bg-amber-200 text-slate-950">Normal owned</Badge>}
                  </div>
                </div>
              </div>
              <p className="text-sm text-slate-300 mt-3 min-h-[62px]">{reveal ? d.lore : shinyMode ? "Shiny version not encountered yet. It remains a black silhouette until you find a shiny." : "This Mythling has not been encountered yet. Its silhouette is hidden in the Prism Dex."}</p>
              {reveal&&<div className="text-xs text-fuchsia-200 mt-2">{d.evo?`Evolves: ${d.evo.method}`:"No evolution"}</div>}
            </div>
          </button>
        })}
      </div>

      <div className="xl:sticky xl:top-4">
        <DexDetailPanel id={selectedId} data={selectedData} seen={selectedSeen} caught={selectedCaught} shinySeen={selectedShinySeen} shinyCaught={selectedShinyCaught} shinyMode={shinyMode} close={()=>setSelectedId(null)} />
      </div>
    </div>
  </motion.div>;
}

function DexDetailPanel({ id, data, seen, caught, shinySeen = false, shinyCaught = false, shinyMode = false, close }) {
  if (!id || !data) return <Card className="rounded-3xl bg-white/5 border-white/10"><CardContent className="p-5"><h3 className="text-2xl font-black mb-2">Research Page</h3><p className="text-slate-300">Select a Mythling from the Prism Dex to view its locations, learnset, evolution chain, type, capture difficulty, and lore.</p></CardContent></Card>;
  const mon = { ...makeMon(id, 8), shiny: shinyMode && shinySeen };
  const found = foundLocationsForMonster(id);
  const learnset = learnsetForMonster(id);
  const chain = evolutionChainForMonster(id);
  const reveal = shinyMode ? shinySeen : seen;
  const owned = shinyMode ? shinyCaught : caught;
  const normalOwnedOnly = shinyMode && caught && !shinyCaught;

  return <Card className="rounded-3xl bg-slate-900/95 border-cyan-300/20 shadow-2xl">
    <CardContent className="p-5">
      <div className="flex justify-between items-start gap-3 mb-3">
        <div>
          <div className="text-xs text-slate-400 uppercase tracking-wider">Dex Research</div>
          <h3 className="text-3xl font-black text-white">{reveal ? (shinyMode ? `✦ ${data.name}` : data.name) : "Unknown Mythling"}</h3>
          <p className="text-slate-400">{reveal ? data.species : shinyMode ? "Encounter the shiny version to reveal its shiny record." : "Encounter this Mythling to reveal its data."}</p>
        </div>
        <Button onClick={close} variant="secondary" className="rounded-xl xl:hidden">Close</Button>
      </div>

      <div className={`rounded-3xl p-4 mb-4 bg-gradient-to-br ${reveal ? TYPES[data.type]?.color || TYPES.Mystic.color : "from-slate-800 to-black"} flex items-center justify-center min-h-[210px]`}>
        <MonsterModel mon={mon} size="medium" silhouette={!reveal}/>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {reveal ? <TypeBadge type={data.type}/> : <Badge className="bg-slate-800 text-slate-300">Type unknown</Badge>}
        <Badge className={owned ? "bg-lime-300 text-slate-950" : reveal ? "bg-cyan-300 text-slate-950" : "bg-slate-800 text-slate-300"}>{owned ? (shinyMode ? "Shiny owned" : "Caught") : reveal ? (shinyMode ? "Shiny seen" : "Seen") : "Not seen"}</Badge>
        {shinyMode && normalOwnedOnly && <Badge className="bg-amber-200 text-slate-950"><Sparkles className="w-3 h-3 mr-1"/>Normal owned · shiny missing</Badge>}
        {data.legendary && <Badge className="bg-yellow-200 text-slate-950"><Star className="w-3 h-3 mr-1"/>Legendary</Badge>}
      </div>

      <p className="text-slate-200 mb-4">{reveal ? data.lore : shinyMode ? "Find a shiny version of this Mythling to unlock its shiny record." : "Defeat, catch, or encounter this Mythling in the world to unlock its research page."}</p>

      <div className="grid grid-cols-2 gap-2 mb-4 text-sm">
        <InfoBox label="Stage" value={reveal ? (data.stage || 1) : "?"}/>
        <InfoBox label="Capture" value={reveal ? `${Math.round((data.capture || 0) * 100)}% base` : "?"}/>
        <InfoBox label="Base HP" value={reveal ? data.base?.[0] : "?"}/>
        <InfoBox label="Base ATK" value={reveal ? data.base?.[1] : "?"}/>
      </div>

      <section className="mb-4">
        <h4 className="font-black text-cyan-100 mb-2">Where to find</h4>
        {seen ? <div className="flex flex-wrap gap-2">
          {found.locations.length ? found.locations.map((loc)=><Badge key={loc} className="bg-slate-800 text-slate-100 border border-white/10">{loc}</Badge>) : <span className="text-slate-400 text-sm">Special, evolved, shop, or story-only Mythling.</span>}
        </div> : <p className="text-slate-400 text-sm">Unknown until seen.</p>}
        {reveal && found.timedHints.length > 0 && <div className="mt-2 text-sm text-fuchsia-100 bg-fuchsia-400/10 border border-fuchsia-300/20 rounded-2xl p-3">{found.timedHints.join(" ")}</div>}
      </section>

      <section className="mb-4">
        <h4 className="font-black text-cyan-100 mb-2">Evolution chain</h4>
        {seen ? <div className="flex flex-wrap gap-2 items-center">
          {chain.map((cid, idx)=><React.Fragment key={cid}><Badge className={`${cid===id ? "bg-cyan-300 text-slate-950" : "bg-slate-800 text-slate-100"}`}>{BESTIARY[cid]?.name}</Badge>{idx<chain.length-1 && <span className="text-slate-400">→</span>}</React.Fragment>)}
        </div> : <p className="text-slate-400 text-sm">Unknown until seen.</p>}
        {seen && data.evo && <p className="text-sm text-slate-300 mt-2">Next evolution: {BESTIARY[data.evo.to]?.name} — {data.evo.method}</p>}
      </section>

      <section>
        <h4 className="font-black text-cyan-100 mb-2">Learned moves</h4>
        {seen ? <div className="space-y-2 max-h-72 overflow-auto pr-1">
          {learnset.map((mv)=><div key={mv.name} className={`rounded-2xl bg-gradient-to-br ${TYPES[mv.type]?.color || TYPES.Mystic.color} border border-white/20 p-3 text-slate-950 shadow-lg`}>
            <div className="flex justify-between gap-2"><div className="font-black">Lv.{mv.level} · {mv.name}</div><Badge className="bg-white/55 text-slate-950 border border-white/50">{mv.type}</Badge></div>
            <div className="text-xs font-bold mt-1">{mv.kind === "attack" ? `Power ${mv.power} · Acc ${mv.accuracy}% · Crit ${mv.crit}%` : mv.kind}</div>
            <div className="text-sm font-semibold mt-1">{mv.text}{mv.status ? ` Status: ${mv.status}.` : ""}</div>
          </div>)}
        </div> : <p className="text-slate-400 text-sm">Unknown until seen.</p>}
      </section>
    </CardContent>
  </Card>;
}

function BattleScreen({ battle, playerMon, skills, playerUse, capture, selectedCaptureItem, setSelectedCaptureItem, usePotion, useStatusCure, usePPItem, run, player, party, active, setActive, anim, dex, clock, onBattleResultContinue }) {
  const enemy = battle.enemy;
  const normalCaught = !!dex.caught?.[enemy.id];
  const shinyCaught = !!dex.shinyCaught?.[enemy.id];
  const caught = enemy.shiny ? shinyCaught : normalCaught;
  const normalOwnedButShinyMissing = Boolean(enemy.shiny && normalCaught && !shinyCaught);
  const captureBlocked = battle.mode === "trainer" || battle.turn !== "player";
  const selectedChance = Math.round(estimateCaptureChance(enemy, player, selectedCaptureItem, clock || freshClock(), battle.mode) * 100);
  const hasEnemyDexInfo = hasDexBattleInfo(dex, enemy);
  const suggestedMove = hasEnemyDexInfo ? bestMoveSuggestion(playerMon, enemy) : null;
  const battlefieldTone = BESTIARY[enemy.id]?.legendary
    ? "from-slate-950 via-fuchsia-950 to-yellow-950"
    : battle.mode === "trainer"
    ? "from-indigo-950 via-purple-950 to-slate-950"
    : "from-slate-950 via-purple-950 to-slate-950";

  return <motion.div
    key="battle"
    initial={{opacity:0}}
    animate={{opacity:1}}
    exit={{opacity:0}}
    className={`fixed inset-0 z-[999] bg-gradient-to-br ${battlefieldTone} text-white overflow-hidden flex flex-col p-1 sm:p-3`}
  >
    <BattleFx anim={anim}/>

    <div className="relative w-full max-w-6xl mx-auto h-[39vh] min-h-[260px] sm:h-[58vh] sm:min-h-[430px] rounded-[1.25rem] overflow-hidden border border-white/10 shadow-2xl bg-gradient-to-b from-violet-900 via-fuchsia-950 to-slate-950 shrink-0" style={{ perspective: "950px", transformStyle: "preserve-3d" }}>
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_78%_28%,rgba(255,255,255,.28),transparent_18%),radial-gradient(ellipse_at_24%_74%,rgba(255,255,255,.2),transparent_22%),linear-gradient(180deg,rgba(56,189,248,.12),transparent_42%,rgba(15,23,42,.72))]" />
      <div className="absolute left-[-15%] right-[-15%] top-[40%] h-24 sm:h-40 bg-fuchsia-400/20 blur-3xl" />
      <motion.div className="absolute inset-x-0 bottom-0 h-[32%] bg-gradient-to-t from-black/35 to-transparent pointer-events-none" animate={{ opacity:[0.35,0.6,0.35] }} transition={{ duration:3, repeat:Infinity }} />
      <motion.div className="absolute left-[18%] top-[18%] w-24 h-24 rounded-full bg-white/10 blur-2xl pointer-events-none" animate={{ x:[-10,20,-10], y:[0,-8,0] }} transition={{ duration:5, repeat:Infinity }} />


      <div className="absolute right-[4%] top-[36%] sm:right-[8%] sm:top-[42%] w-[43%] h-12 sm:h-24 rounded-full border-[6px] sm:border-8 border-white/35 bg-white/35 shadow-2xl shadow-white/20" style={{ transform: "rotateX(58deg) translateZ(-18px)", transformStyle: "preserve-3d" }} />
      <div className="absolute left-[1%] bottom-[8%] sm:left-[4%] sm:bottom-[10%] w-[48%] h-12 sm:h-24 rounded-full border-[6px] sm:border-8 border-white/25 bg-white/25 shadow-2xl shadow-cyan-300/10" style={{ transform: "rotateX(58deg) translateZ(-10px)", transformStyle: "preserve-3d" }} />

      <div className="absolute left-1.5 top-1.5 sm:left-4 sm:top-4 z-30 w-[54%] max-w-[250px] sm:w-[330px] sm:max-w-none">
        <PokemonStatusBox mon={enemy} title={enemy.wild ? `Wild ${enemy.name}` : enemy.name} caught={caught} normalOwnedButShinyMissing={normalOwnedButShinyMissing} align="left" enemy />
      </div>

      <div className="absolute right-1.5 bottom-1.5 sm:right-4 sm:bottom-4 z-30 w-[55%] max-w-[260px] sm:w-[340px] sm:max-w-none">
        <PokemonStatusBox mon={playerMon} title={displayName(playerMon)} align="right" showXp />
      </div>

      <div className="absolute right-[-2%] top-[16%] sm:right-[6%] sm:top-[14%] z-20 scale-[0.78] sm:scale-[1.12] origin-top-right pointer-events-none drop-shadow-2xl" style={{ transform: "translateZ(70px) rotateY(-8deg)", transformStyle: "preserve-3d" }}>
        <MonsterModel mon={enemy} faint={enemy.hp<=0} anim={anim.enemy || "idle"} size="medium" />
      </div>

      <div className="absolute left-[-7%] bottom-[7%] sm:left-[4%] sm:bottom-[13%] z-20 scale-[0.82] sm:scale-[1.15] origin-bottom-left pointer-events-none drop-shadow-2xl" style={{ transform: "translateZ(95px) rotateY(10deg)", transformStyle: "preserve-3d" }}>
        <MonsterModel mon={playerMon} flipped faint={playerMon.hp<=0} anim={anim.player || "idle"} size="medium" />
      </div>

      {anim?.ball && <BallThrow anim={anim}/>}

      {BESTIARY[enemy.id]?.legendary && <motion.div
        initial={{opacity:0, scale:.7}}
        animate={{opacity:[.2,.7,.2], scale:[.7,1.15,.7], rotate:360}}
        transition={{duration:4, repeat:Infinity, ease:"linear"}}
        className="absolute right-[7%] top-[8%] w-40 h-40 sm:w-60 sm:h-60 rounded-full border-4 border-yellow-200/50 border-dashed shadow-2xl shadow-yellow-300/20"
      />}
    </div>

    <div className="w-full max-w-6xl mx-auto mt-1 rounded-2xl bg-slate-950/96 border-2 border-slate-700 shadow-2xl overflow-hidden flex-1 min-h-0">
      <div className="grid grid-cols-1 md:grid-cols-[0.55fr_1.45fr] gap-1 p-1 h-full">
        <div className="rounded-xl bg-white text-slate-800 border-2 border-slate-400 shadow-inner p-1.5 flex items-center justify-between gap-2 min-h-[36px] md:min-h-full">
          <div className="font-black text-xs sm:text-base leading-snug flex-1">{battle.message}</div>
          
        </div>

        <div className="rounded-xl bg-white text-slate-800 border-2 border-slate-400 p-1 overflow-y-auto">
          {battle.turn === "player" ? <div className="grid grid-cols-2 gap-0.5 sm:gap-1">
            {suggestedMove ? <div className="col-span-2 rounded-md bg-cyan-100 border border-cyan-300 text-slate-900 px-1 py-0.5 text-[9px] font-black leading-tight">Suggested move: {suggestedMove} · {moveSummary(suggestedMove, playerMon, enemy.type, dex, enemy)}</div> : <div className="col-span-2 rounded-md bg-slate-100 border border-slate-300 text-slate-700 px-1 py-0.5 text-[9px] font-bold leading-tight">Effectiveness hidden: encounter or catch this Mythling to unlock type advantage hints in the Dex.</div>}
            {skills.map((s)=>{
              const sk=SKILLS[s];
              const Icon=TYPES[sk.type]?.icon||Sparkles;
              const mult = typeMult(sk.type, enemy.type);
              const canUse = hasPP(playerMon, s);
              return <Button key={s} onClick={()=>playerUse(s)} disabled={!canUse} className={typeButtonClass(sk.type, !canUse)}>
                <Icon className="w-3 h-3 mr-1 shrink-0 drop-shadow"/>
                <span className="text-left leading-tight flex-1 min-w-0">
                  <span className="flex items-center gap-2 flex-wrap">
                    <b className="text-[10px] sm:text-xs">{s}</b>
                    <span className="text-[8px] px-1 py-0 rounded-full bg-white/45 border border-white/50 font-black">{sk.type}</span>
                    {hasEnemyDexInfo && sk.kind === "attack" && <span className={`text-[8px] px-1 py-0 rounded-full border font-black ${effectivenessClass(mult)}`}>{effectivenessLabel(mult)}</span>}
                  </span>
                  <br/>
                  <span className={`${sk.type === "Shadow" ? "text-slate-100" : "text-slate-700"} text-[7px] sm:text-[9px] font-semibold leading-tight`}>{moveSummary(s, playerMon, enemy.type, dex, enemy)}</span>
                </span>
              </Button>
            })}
            <div className="col-span-2 grid grid-cols-6 gap-0.5 pt-0.5 border-t border-slate-200">
              <div className="col-span-6"><select value={selectedCaptureItem} onChange={(e)=>setSelectedCaptureItem(e.target.value)} disabled={captureBlocked} className="w-full rounded-md border border-slate-300 bg-slate-100 px-1 py-0.5 text-[10px] font-bold">
                {Object.keys(CAPTURE_ITEMS).map((name)=><option key={name} value={name}>{name} x{captureCount(player,name)}</option>)}
              </select><div className="text-[9px] text-slate-600 mt-0.5 font-bold">Est. catch: {battle.mode === "wild" || battle.mode === "legend" ? `${selectedChance}%` : "N/A"}</div></div>
              <Button onClick={()=>capture(selectedCaptureItem)} disabled={captureBlocked || totalCaptureItems(player)<=0} className="rounded-md bg-cyan-300 hover:bg-cyan-200 text-slate-950 font-black text-[10px] px-1 py-1 col-span-2"><Backpack className="w-3.5 h-3.5 mr-1"/>Catch</Button>
              <Button onClick={usePotion} disabled={player.potions<=0||playerMon.hp===playerMon.maxHp} className="rounded-md bg-lime-200 hover:bg-lime-100 text-slate-950 font-black text-[10px] px-1 py-1 col-span-2"><Heart className="w-3.5 h-3.5 mr-1"/>Potion</Button>
              <Button onClick={useStatusCure} disabled={!playerMon.status || !hasAnyCureForStatus(player, playerMon.status)} className="rounded-md bg-amber-200 hover:bg-amber-100 text-slate-950 font-black disabled:opacity-40 text-[10px] px-1 py-1 col-span-2">Cure</Button>
              <Button onClick={usePPItem} className="rounded-md bg-violet-200 hover:bg-violet-100 text-slate-950 font-black text-[10px] px-1 py-1 col-span-2">PP</Button><Button onClick={run} disabled={battle.mode==="trainer" || battle.mode==="legend"} className={`rounded-md font-black text-[10px] px-1 py-1.5 disabled:opacity-40 col-span-2 border ${battle.mode==="wild" ? "bg-emerald-400 hover:bg-emerald-300 text-slate-950 border-emerald-200 shadow-md" : "bg-slate-300 hover:bg-slate-300 text-slate-700 border-slate-400"}`}>{battle.mode==="wild" ? "Run" : "No Run"}</Button>
            </div>
          </div> : battle.turn === "done" ? <div className="h-full min-h-[120px] flex flex-col items-center justify-center gap-3 text-slate-700 font-black text-sm sm:text-base">
            <div>Battle finished.</div>
            <Button onClick={onBattleResultContinue} className="rounded-2xl bg-cyan-300 hover:bg-cyan-200 text-slate-950 font-black px-6 py-4">Continue Adventure</Button>
          </div> : <div className="h-full min-h-[120px] flex items-center justify-center text-slate-500 font-black text-sm sm:text-base">Waiting...</div>}
        </div>
      </div>
    </div>

    <div className="w-full max-w-6xl mx-auto mt-1 overflow-x-auto pb-1 shrink-0">
      <div className="flex gap-2 min-w-max">
        {party.map((m,i)=><Button key={m.uid} disabled={m.hp<=0||battle.turn!=="player"} onClick={()=>setActive(i)} variant={i===active?"default":"secondary"} className="rounded-lg text-[10px] sm:text-xs whitespace-nowrap px-2 py-1">
          {displayName(m)} <GenderMark mon={m}/> <StatusBadge status={m.status} small/> Lv.{m.level} {m.hp<=0?"FNT":`${m.hp}/${m.maxHp}`}
        </Button>)}
      </div>
    </div>
  </motion.div>;
}
function BallThrow({ target = "enemy" }) {
  const endX = target === "enemy" ? 155 : -120;
  const endY = target === "enemy" ? -112 : 70;
  return <motion.div
    initial={{ x: -185, y: 118, scale: 0.34, opacity: 0, rotate: 0 }}
    animate={{
      x: [-185, -65, 45, endX, endX + 4, endX],
      y: [118, 12, -95, endY, endY - 8, endY],
      scale: [0.34, 0.58, 0.74, 0.64, 0.72, 0.64],
      opacity: [0, 1, 1, 1, 1, 0.98],
      rotate: [0, 240, 520, 720, 760, 780]
    }}
    exit={{ opacity: 0, scale: 0.2 }}
    transition={{ duration: 0.88, ease: "easeInOut" }}
    className="absolute z-30 left-1/2 top-1/2 w-10 h-10 rounded-full bg-gradient-to-br from-rose-400 via-white to-cyan-300 border-[3px] border-slate-900 shadow-2xl shadow-cyan-300/60"
  >
    <span className="absolute left-0 right-0 top-1/2 h-[3px] bg-slate-900/70"/>
    <span className="absolute left-1/2 top-1/2 w-3 h-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white border-2 border-slate-900"/>
  </motion.div>;
}

function BattleFx({ anim }) {
  if (!anim?.fx || ["capture","success","escape"].includes(anim.fx)) return null;
  const color = TYPES[anim.target||"Mystic"]?.hex || "#c084fc";
  return <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center"><motion.div initial={{scale:0.2,opacity:0}} animate={{scale:[0.4,1.25,1.8],opacity:[0,0.9,0]}} transition={{duration:0.72}} className="relative"><div className="absolute inset-[-80px] rounded-full blur-2xl" style={{background:color,opacity:0.35}}/>
    {anim.fx==="slash"&&<Swords className="w-28 h-28 text-white drop-shadow-2xl"/>}
    {anim.fx==="guard"&&<Shield className="w-28 h-28 text-cyan-100 drop-shadow-2xl"/>}
    {anim.fx==="heal"&&<Heart className="w-28 h-28 text-lime-200 drop-shadow-2xl"/>}
    {anim.fx==="zap"&&<Zap className="w-32 h-32 text-yellow-200 drop-shadow-2xl"/>}
    {anim.fx==="wind"&&<Wind className="w-32 h-32 text-sky-200 drop-shadow-2xl"/>}
    {anim.fx==="confetti"&&<div className="relative w-36 h-36 flex items-center justify-center"><Sparkles className="w-20 h-20 text-yellow-100 drop-shadow-2xl"/><motion.div className="absolute text-pink-200 text-2xl font-black" animate={{ x:[-24,-8,-30], y:[18,-28,-46], rotate:[0,90,180], opacity:[0,1,0] }} transition={{ duration:0.7, repeat:Infinity }}>✦</motion.div><motion.div className="absolute text-cyan-100 text-2xl font-black" animate={{ x:[26,6,28], y:[16,-26,-44], rotate:[0,-120,-220], opacity:[0,1,0] }} transition={{ duration:0.8, repeat:Infinity, delay:0.08 }}>✦</motion.div><motion.div className="absolute text-lime-100 text-xl font-black" animate={{ x:[0,0,0], y:[26,-6,-34], rotate:[0,180,360], opacity:[0,1,0] }} transition={{ duration:0.75, repeat:Infinity, delay:0.14 }}>✦</motion.div></div>}
    {anim.fx==="shiny"&&<motion.div animate={{ rotate: 360, scale:[0.85,1.15,0.85] }} transition={{ duration:1.4, repeat:Infinity, ease:"linear" }} className="w-36 h-36 rounded-full border-4 border-yellow-100/80 border-dotted shadow-2xl shadow-yellow-200/50 flex items-center justify-center"><Sparkles className="w-20 h-20 text-yellow-100 drop-shadow-2xl"/></motion.div>}
    {anim.fx==="legend"&&<motion.div animate={{ rotate: 360 }} transition={{ duration: 1.1, repeat: Infinity, ease: "linear" }} className="w-36 h-36 rounded-full border-4 border-yellow-200/80 border-dashed shadow-2xl shadow-fuchsia-300/40 flex items-center justify-center"><Star className="w-20 h-20 text-yellow-100 drop-shadow-2xl"/></motion.div>}
    {!['slash','guard','heal','zap','wind','confetti','legend','shiny'].includes(anim.fx)&&<Star className="w-32 h-32 text-white drop-shadow-2xl"/>}
    <div className="text-center mt-2 font-black text-white text-xl drop-shadow-lg">{anim.text}</div></motion.div></div>;
}
function PokemonStatusBox({ mon, title, caught, normalOwnedButShinyMissing = false, enemy = false, showXp = false, align = "left" }) {
  const hp = hpPercent(mon);
  return <motion.div initial={{ opacity: 0, x: enemy ? -18 : 18 }} animate={{ opacity: 1, x: 0 }} className={`rounded-2xl bg-white/95 text-slate-900 border-4 border-slate-700 shadow-2xl p-3 ${align === "right" ? "ml-auto" : ""}`}>
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2 min-w-0">
        <div className="font-black text-lg sm:text-2xl truncate">{title}</div>
        <GenderMark mon={mon}/>
        <StatusBadge status={mon.status}/>
        {mon.shiny && <Badge className="bg-gradient-to-r from-yellow-200 to-fuchsia-200 text-slate-950 border-0"><Sparkles className="w-3 h-3 mr-1"/>Shiny</Badge>}
        {BESTIARY[mon.id]?.legendary && <Badge className="bg-yellow-200 text-slate-950"><Star className="w-3 h-3 mr-1"/>Legendary</Badge>}
        {caught && <Badge className="bg-lime-300 text-slate-950"><BadgeCheck className="w-3 h-3 mr-1"/>Owned</Badge>}
        {normalOwnedButShinyMissing && <Badge className="bg-amber-200 text-slate-950 border border-amber-400"><Sparkles className="w-3 h-3 mr-1"/>Normal owned · Shiny new</Badge>}
      </div>
      <div className="font-black text-lg sm:text-2xl">Lv.{mon.level}</div>
    </div>
    <div className="mt-2 flex items-center gap-2">
      <div className="text-[10px] font-black text-amber-700">HP</div>
      <div className="flex-1 h-4 rounded-sm bg-slate-900 border-2 border-slate-800 p-0.5">
        <motion.div animate={{ width: `${hp}%` }} className={`h-full rounded-sm ${hp < 25 ? "bg-rose-500" : hp < 55 ? "bg-yellow-400" : "bg-lime-500"}`} />
      </div>
    </div>
    <div className="text-right text-sm font-bold text-slate-600">{mon.hp}/{mon.maxHp}</div>
    {showXp && <XPBar mon={mon} compact />}
  </motion.div>;
}
function BattleSlot({ title, mon, flipped, enemy, anim, caught }) {
  return <div className={`rounded-3xl border p-5 flex flex-col ${BESTIARY[mon.id]?.legendary ? "bg-gradient-to-br from-yellow-400/15 via-fuchsia-500/10 to-cyan-400/10 border-yellow-200/50 shadow-2xl shadow-yellow-300/10" : "bg-white/5 border-white/10"} ${enemy?"items-start":"items-end"}`}>
    <PokemonStatusBox mon={mon} title={title} caught={caught} enemy={enemy} showXp={!enemy} align={enemy ? "left" : "right"} />
    <div className="flex-1 w-full flex items-center justify-center"><MonsterModel mon={mon} flipped={flipped} faint={mon.hp<=0} anim={anim||"idle"}/></div>
  </div>;
}
function BattleResultModal({ result, onContinue }) {
  const track = result?.xpTrack;
  const beforePct = track ? Math.round((track.before.xp / Math.max(1, track.before.nextXp)) * 100) : 0;
  const afterPct = track ? Math.round((track.after.xp / Math.max(1, track.after.nextXp)) * 100) : 0;
  const fakeMon = track?.mon ? { ...track.mon, xp: track.after.xp, nextXp: track.after.nextXp } : null;
  return <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[1600] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
    <motion.div initial={{ y: 24, scale: .96 }} animate={{ y: 0, scale: 1 }} exit={{ y: 24, scale: .96 }} className="w-full max-w-xl rounded-3xl bg-slate-950 border border-cyan-200/30 shadow-2xl shadow-cyan-500/20 p-5">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-cyan-300 to-fuchsia-300 text-slate-950 flex items-center justify-center"><Star className="w-8 h-8"/></div>
        <div>
          <div className="text-sm text-cyan-200 uppercase tracking-wider font-black">Battle Complete</div>
          <h2 className="text-3xl font-black text-white">{result.title}</h2>
        </div>
      </div>
      <div className="rounded-2xl bg-white/5 border border-white/10 p-4 mb-3">
        <div className="text-cyan-100 font-black">{result.playerName} gained {result.xp} XP.</div>
        {fakeMon && <XPBar mon={fakeMon} beforePercent={beforePct} afterPercent={afterPct}/>}
      </div>
      {result.levelUps?.length > 0 && <div className="rounded-2xl bg-lime-300/10 border border-lime-200/20 p-4 mb-3">
        <div className="font-black text-lime-100 mb-2">Level Up!</div>
        {result.levelUps.map((lu, idx)=><div key={idx} className="text-sm text-lime-50">
          {lu.name} Lv.{lu.from} → Lv.{lu.to} · HP +{lu.hp} · ATK +{lu.atk} · DEF +{lu.def} · SPD +{lu.spd}
        </div>)}
      </div>}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <InfoBox label="Coins earned" value={result.reward?.money || 0}/>
        <InfoBox label="Items" value={rewardItemText(result.reward?.items || [])}/>
      </div>
      {result.postText && <div className="rounded-2xl bg-cyan-300/10 border border-cyan-200/20 p-3 mb-4 text-cyan-50 font-bold">{result.postText}</div>}<Button onClick={onContinue} className="w-full rounded-2xl py-5 bg-cyan-300 hover:bg-cyan-200 text-slate-950 font-black">Continue Adventure</Button>
    </motion.div>
  </motion.div>;
}
function SidePanel({ player, party, active, setScreen, reset, saveGame, loadGame, clearSave, hasSave, muted, setMuted, stats, clock, authUser, accountProfile, cloudSyncStatus, lastCloudSyncAt, storage, seen, dex, onObjectiveClick }) { const TimeIcon = timeIcon(clock); return <div className="space-y-4"><Card className="bg-slate-900/80 border-white/10 rounded-3xl shadow-xl"><CardContent className="p-5"><h2 className="text-2xl font-black bg-gradient-to-r from-cyan-200 to-fuchsia-200 text-transparent bg-clip-text mb-4">Tamer Console</h2><div className="p-3 rounded-2xl bg-white/5 border border-white/10 mb-3 flex items-center gap-2"><TimeIcon className="w-5 h-5 text-cyan-200"/><div className="font-black">{timeString(clock)}</div></div><div className="grid grid-cols-2 gap-2 text-sm"><InfoBox label="Coins" value={player.money || 0}/><InfoBox label="Capsules" value={totalCaptureItems(player)}/><InfoBox label="PC" value={(storage || []).length}/><InfoBox label="Dex" value={`${stats.caught}/${stats.total}`}/></div><div className="mt-3 grid grid-cols-3 gap-2 text-xs"><InfoBox label="Pearl" value={player.items?.["Tide Pearl"]||0}/><InfoBox label="Moon" value={player.items?.["Moon Shard"]||0}/><InfoBox label="Fossil" value={player.items?.["Sun Fossil"]||0}/></div><div className="mt-4 p-3 rounded-2xl bg-white/5 border border-white/10"><div className="text-slate-400 text-xs uppercase tracking-wider">Login / Cloud</div><div className="font-bold text-cyan-100">{authUser ? `Signed in as ${accountProfile?.display_name || authUser.email?.split("@")[0] || "Tamer"}` : "Not signed in"}</div><div className="text-xs text-slate-400 mt-1">{cloudSyncStatus}</div><div className="text-xs text-slate-500 mt-1">Last online save: {formatOnlineSyncStamp(lastCloudSyncAt || accountProfile?.last_save_at)}</div></div><div className="mt-4"><Button onClick={()=>setScreen("objectives")} className="w-full rounded-2xl bg-cyan-300 hover:bg-cyan-200 text-slate-950 font-black"><Sparkles className="w-4 h-4 mr-2"/>Open Objectives</Button></div><div className="mt-4 grid grid-cols-2 gap-2"><Button onClick={()=>setScreen("party")} variant="secondary" className="rounded-xl"><PawPrint className="w-4 h-4 mr-2"/>Party</Button><Button onClick={()=>setScreen("pc")} variant="secondary" className="rounded-xl"><Backpack className="w-4 h-4 mr-2"/>PC</Button><Button onClick={()=>setScreen("shop")} variant="secondary" className="rounded-xl"><Star className="w-4 h-4 mr-2"/>Shop</Button><Button onClick={()=>setScreen("objectives")} variant="secondary" className="rounded-xl"><Sparkles className="w-4 h-4 mr-2"/>Goals</Button><Button onClick={()=>setScreen("friends")} variant="secondary" className="rounded-xl"><Users className="w-4 h-4 mr-2"/>Friends</Button><Button onClick={()=>setScreen("dex")} variant="secondary" className="rounded-xl"><BookOpen className="w-4 h-4 mr-2"/>Dex</Button><Button onClick={()=>saveGame()} variant="secondary" className="rounded-xl"><Save className="w-4 h-4 mr-2"/>Save</Button><Button onClick={loadGame} disabled={!hasSave} variant="secondary" className="rounded-xl disabled:opacity-40"><Upload className="w-4 h-4 mr-2"/>Load</Button><Button onClick={()=>setMuted(!muted)} variant="secondary" className="rounded-xl">{muted?<VolumeX className="w-4 h-4 mr-2"/>:<Volume2 className="w-4 h-4 mr-2"/>}{muted?"Muted":"Sound"}</Button><Button onClick={reset} variant="secondary" className="rounded-xl"><RotateCcw className="w-4 h-4 mr-2"/>New</Button><Button onClick={()=>setScreen("account")} variant="secondary" className="rounded-xl col-span-2"><Upload className="w-4 h-4 mr-2"/>{authUser ? `Account: ${accountProfile?.display_name || authUser.email?.split("@")[0] || "Signed in"}` : "Account / Cloud Save"}</Button><Button onClick={()=>setScreen("multiplayer")} variant="secondary" className="rounded-xl col-span-2"><Gamepad2 className="w-4 h-4 mr-2"/>Multiplayer Hub</Button><Button onClick={clearSave} disabled={!hasSave} variant="secondary" className="rounded-xl col-span-2 disabled:opacity-40">Clear Save</Button></div></CardContent></Card><Card className="bg-slate-900/80 border-white/10 rounded-3xl"><CardContent className="p-5"><h3 className="text-xl font-black mb-3">Lead Mythling</h3>{party[active]?<div className="flex gap-3 items-center"><MonsterModel mon={party[active]} size="small"/><div><div className="font-black">{displayName(party[active])}</div><div className="text-sm text-slate-300">{party[active].name} · Lv.{party[active].level}</div><TypeBadge type={party[active].type}/></div></div>:<p className="text-slate-300">No mythling yet.</p>}</CardContent></Card></div>; }
function InfoBox({ label, value }) { return <div className="p-3 rounded-2xl bg-white/5 border border-white/10"><div className="text-slate-400 text-xs uppercase tracking-wider">{label}</div><div className="text-2xl font-black">{value}</div></div>; }

function ObjectiveDetailModal({ info, close, showOnMap }) {
  if (!info) return null;
  const target = info.target;
  const steps = Array.isArray(info.steps) ? info.steps : [];
  const [stepInfo, setStepInfo] = useState(null);
  const openStep = (step) => setStepInfo(buildStepObjectivePayload(info, typeof step === "string" ? { title: "Objective Step", body: step, target } : step));

  return <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-start sm:items-center justify-center p-3 sm:p-4 z-[1650] overflow-y-auto overscroll-contain">
    <motion.div initial={{y:24,scale:0.96}} animate={{y:0,scale:1}} exit={{y:24,scale:0.96}} className={`max-w-lg w-full max-h-[92vh] overflow-y-auto overscroll-contain rounded-[2rem] bg-gradient-to-br ${info.color || "from-cyan-200 to-fuchsia-300"} p-[2px] shadow-2xl`}>
      <div className="rounded-[1.9rem] bg-slate-950/95 p-4 sm:p-5 text-white">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div><div className="text-xs uppercase tracking-[0.28em] text-cyan-200 font-black">Objective Details</div><h2 className="text-sm sm:text-base font-black leading-tight">{info.icon} {info.title}</h2></div>
          <Badge className="bg-white text-slate-950 font-black">{info.badge}</Badge>
        </div>
        <p className="text-base sm:text-lg text-slate-100 leading-relaxed mb-4">{info.body}</p>

        {target && <button type="button" onClick={() => showOnMap(target)} className="w-full text-left mb-4 rounded-3xl bg-cyan-300/10 border border-cyan-200/30 p-3 hover:bg-cyan-300/20 active:scale-[0.99] transition">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-cyan-300 text-slate-950 flex items-center justify-center text-2xl font-black">{target.icon || "★"}</div>
            <div className="min-w-0">
              <div className="text-xs uppercase tracking-wider text-cyan-200 font-black">Map Target</div>
              <div className="font-black text-white truncate">{target.label}</div>
              <div className="text-sm text-slate-300">{AREA_DATA[target.areaId]?.name || target.areaId || "Unknown Area"}</div>
            </div>
          </div>
          <div className="mt-2 text-sm text-cyan-100 font-bold">Tap here or press Show on Map to highlight this location.</div>
        </button>}

        <div className="mb-4">
          <div className="text-xs uppercase tracking-[0.24em] text-fuchsia-200 font-black mb-2">Tap any step for exact info</div>
          <div className="space-y-2">
            {steps.map((s, i) => {
              const title = typeof s === "string" ? `Step ${i + 1}` : s.title || `Step ${i + 1}`;
              const body = typeof s === "string" ? s : s.body;
              return <button type="button" key={`${title}-${i}`} onClick={() => openStep(s)} className="w-full text-left rounded-2xl bg-white/5 border border-white/10 p-3 hover:bg-white/10 active:scale-[0.99] transition">
                <div className="flex items-start gap-2">
                  <span className="shrink-0 w-7 h-7 rounded-full bg-fuchsia-200 text-slate-950 font-black flex items-center justify-center text-sm">{i + 1}</span>
                  <span className="min-w-0">
                    <span className="block font-black text-white">{title}</span>
                    <span className="block text-sm text-slate-300 leading-snug">{body}</span>
                    <span className="block text-xs text-cyan-200 mt-1 font-black">Tap for details / Show on Map</span>
                  </span>
                </div>
              </button>;
            })}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Button onClick={close} variant="secondary" className="rounded-2xl font-black">Close</Button>
          <Button onClick={() => showOnMap(target)} disabled={!target} className="rounded-2xl bg-cyan-300 text-slate-950 hover:bg-cyan-200 font-black disabled:opacity-40">Show on Map</Button>
        </div>
      </div>
    </motion.div>
    <AnimatePresence>{stepInfo && <ObjectiveStepModal info={stepInfo} close={() => setStepInfo(null)} showOnMap={showOnMap}/>}</AnimatePresence>
  </motion.div>;
}

function ObjectiveStepModal({ info, close, showOnMap }) {
  if (!info) return null;
  const target = info.target;
  return <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="fixed inset-0 z-[1700] bg-black/65 backdrop-blur-sm flex items-start sm:items-center justify-center p-3 sm:p-4 overflow-y-auto overscroll-contain">
    <motion.div initial={{y:22,scale:0.96}} animate={{y:0,scale:1}} exit={{y:22,scale:0.96}} className={`max-w-md w-full my-4 max-h-[92vh] overflow-y-auto overscroll-contain rounded-[2rem] p-[2px] bg-gradient-to-br ${info.color || "from-cyan-200 to-fuchsia-300"} shadow-2xl`}>
      <div className="rounded-[1.9rem] bg-slate-950 p-5 text-white">
        <div className="text-xs uppercase tracking-[0.28em] text-cyan-200 font-black mb-2">{info.parentTitle || "Objective"} / Step</div>
        <h3 className="text-2xl font-black mb-2">{info.icon || "✦"} {info.title}</h3>
        <p className="text-slate-100 leading-relaxed mb-4">{info.body}</p>
        {target && <div className="rounded-2xl bg-cyan-300/10 border border-cyan-200/30 p-3 mb-4">
          <div className="text-xs uppercase tracking-wider text-cyan-200 font-black">Location</div>
          <div className="font-black text-white">{target.label}</div>
          <div className="text-sm text-slate-300">{target.detail}</div>
        </div>}
        <div className="grid grid-cols-2 gap-2">
          <Button onClick={close} variant="secondary" className="rounded-2xl font-black">Back</Button>
          <Button onClick={() => showOnMap(target)} disabled={!target} className="rounded-2xl bg-cyan-300 text-slate-950 hover:bg-cyan-200 font-black disabled:opacity-40">Show on Map</Button>
        </div>
      </div>
    </motion.div>
  </motion.div>;
}

function UpdateAvailableModal({ manifest, status, nativeReady, download, later, checkAgain }) {
  const version = manifest?.version || `code ${manifest?.versionCode || "?"}`;
  const notes = manifest?.notes || "A new Mythbound Tamers update is ready.";
  return <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="fixed inset-0 z-[1900] bg-black/80 backdrop-blur-md flex items-start sm:items-center justify-center p-3 sm:p-4 overflow-y-auto overscroll-contain">
    <motion.div initial={{y:30,scale:0.96}} animate={{y:0,scale:1}} exit={{y:30,scale:0.96}} className="max-w-lg w-full my-4 max-h-[92vh] overflow-y-auto overscroll-contain rounded-[2rem] p-[2px] bg-gradient-to-br from-cyan-200 via-fuchsia-300 to-lime-200 shadow-2xl">
      <div className="rounded-[1.9rem] bg-slate-950 p-5 text-white">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div><div className="text-xs uppercase tracking-[0.3em] text-cyan-200 font-black">Update Available</div><h2 className="text-3xl font-black">Version {version}</h2></div>
          <div className="rounded-2xl bg-cyan-300 text-slate-950 px-3 py-2 font-black">NEW</div>
        </div>
        <p className="text-slate-100 leading-relaxed mb-4">{notes}</p>
        <div className="rounded-2xl bg-black/30 border border-white/10 p-3 text-sm text-slate-300 mb-4">
          <div><b>Installed:</b> {APP_VERSION} / code {APP_VERSION_CODE}</div>
          <div><b>Latest:</b> {manifest?.version || "?"} / code {manifest?.versionCode || "?"}</div>
          <div className="break-all"><b>APK:</b> {manifestDownloadUrl(manifest) || "Missing apkUrl"}</div>
          <div className="mt-2 text-cyan-100">{status}</div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button onClick={download} className="rounded-2xl bg-lime-300 hover:bg-lime-200 text-slate-950 font-black py-5">{nativeReady ? "Download & Install" : "Download now"}</Button>
          <Button onClick={later} variant="secondary" className="rounded-2xl font-black py-5">Later</Button>
          <Button onClick={checkAgain} variant="secondary" className="rounded-2xl font-black col-span-2">Check again</Button>
        </div>
        <p className="text-xs text-slate-400 mt-3">{nativeReady ? "Native updater detected: pressing Download & Install downloads inside the app and opens Android installer automatically. Android still asks for install approval." : "Native updater not detected: the app will open the APK download URL. Android still asks you to approve installation."}</p>
      </div>
    </motion.div>
  </motion.div>;
}

function UpdateCenterScreen({ setScreen, availableUpdate, status, checkUpdates, downloadUpdate }) {
  const [localManifest, setLocalManifest] = useState(null);
  const manifest = availableUpdate || localManifest;
  async function manualCheck() {
    const data = await checkUpdates?.();
    if (data) setLocalManifest(data);
  }
  function openUpdate() {
    const m = manifest;
    if (!m) return;
    if (manifestIsNewer(m)) downloadUpdate?.();
    else startApkDownload(m);
  }
  return <motion.div
    key="update"
    initial={{opacity:0}}
    animate={{opacity:1}}
    exit={{opacity:0}}
    className="min-h-full overflow-visible p-4 sm:p-6 pb-8 bg-gradient-to-br from-slate-950 via-cyan-950 to-indigo-950"
    style={{ WebkitOverflowScrolling: "touch" }}
  >
    <div className="flex justify-between items-start gap-3 mb-5"><div><h2 className="text-3xl sm:text-4xl font-black flex items-center gap-2"><Upload className="w-8 h-8 text-cyan-200"/>Update Center</h2><p className="text-slate-300 max-w-2xl">The app auto-checks this manifest when it opens. If a newer APK exists, the popup uses the native Android updater when the plugin is installed, otherwise it opens the latest APK URL.</p></div><Button onClick={()=>setScreen("world")} className="rounded-xl bg-cyan-300 text-slate-950 hover:bg-cyan-200 font-black">Back</Button></div>
    <div className="grid lg:grid-cols-[1fr_390px] gap-3"><Card className="rounded-3xl bg-white/5 border-white/10"><CardContent className="p-4 sm:p-5"><h3 className="text-base sm:text-lg font-black mb-3">Installed Version</h3><InfoBox label="App" value={APP_VERSION}/><InfoBox label="Code" value={APP_VERSION_CODE}/><div className="mt-3 rounded-2xl bg-black/25 border border-white/10 p-3 text-slate-200 text-sm">Manifest URL: <span className="break-all text-cyan-100">{UPDATE_MANIFEST_URL || "Not configured"}</span></div><div className="grid sm:grid-cols-2 gap-2 mt-4"><Button onClick={manualCheck} className="rounded-2xl bg-cyan-300 hover:bg-cyan-200 text-slate-950 font-black">Check now</Button><Button onClick={openUpdate} disabled={!manifest || !manifestDownloadUrl(manifest)} variant="secondary" className="rounded-2xl font-black disabled:opacity-40">{manifestIsNewer(manifest) ? "Download & Install" : "Open APK"}</Button></div></CardContent></Card><Card className="rounded-3xl bg-white/5 border-white/10"><CardContent className="p-4 sm:p-5"><h3 className="text-xl font-black mb-2">Update Status</h3><div className="rounded-2xl bg-black/25 border border-white/10 p-3 min-h-[96px] text-slate-100">{status || "Ready."}</div>{manifest && <div className="mt-3 text-sm text-slate-300 space-y-1"><div><b>Latest:</b> {manifest.version || "?"} / code {manifest.versionCode || "?"}</div><div><b>Mandatory:</b> {manifest.mandatory ? "Yes" : "No"}</div><div><b>Notes:</b> {manifest.notes || "No notes"}</div><div className="break-all"><b>APK:</b> {manifestDownloadUrl(manifest) || "Missing"}</div></div>}</CardContent></Card></div>
    <Card className="rounded-3xl bg-amber-300/10 border-amber-200/20 mt-4"><CardContent className="p-4 sm:p-5 text-amber-50 text-sm"><b>Android note:</b> the app can auto-check and open the APK download, but Android still asks the user to approve installation. A normal app cannot silently replace itself without Android permission.</CardContent></Card>
  </motion.div>;
}

function AreaGateModal({ gate, enter, stay }) {
  const target = AREA_DATA[gate.areaId] || {};
  const bg = target.bg || "from-cyan-950 via-indigo-950 to-slate-950";
  return <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-start sm:items-center justify-center p-3 sm:p-4 z-[1600] overflow-y-auto overscroll-contain">
    <motion.div initial={{y:28,scale:0.94}} animate={{y:0,scale:1}} exit={{y:28,scale:0.94}} className={`max-w-xl w-full my-4 max-h-[92vh] overflow-y-auto overscroll-contain rounded-[2rem] border border-cyan-200/30 bg-gradient-to-br ${bg} shadow-2xl`}>
      <div className="relative p-6">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_15%,rgba(34,211,238,.28),transparent_30%),radial-gradient(circle_at_80%_80%,rgba(217,70,239,.18),transparent_32%)]" />
        <div className="relative">
          <div className="text-xs uppercase tracking-[0.32em] text-cyan-200 font-black mb-2">Area Gate</div>
          <h2 className="text-3xl sm:text-5xl font-black text-white leading-tight mb-2">Enter {gate.targetName}?</h2>
          <div className="flex flex-wrap gap-2 mb-4">
            <Badge className="bg-cyan-200 text-slate-950 font-black">{gate.subtitle || "New Area"}</Badge>
            <Badge className="bg-fuchsia-200 text-slate-950 font-black">{gate.theme || "Area Theme"}</Badge>
          </div>
          <p className="text-slate-100 text-lg leading-relaxed mb-4">{gate.description || "A new path opens ahead."}</p>
          {gate.sideQuest && <div className="rounded-2xl bg-amber-200/15 border border-amber-200/30 p-3 text-amber-100 font-bold mb-4">Side quest: {gate.sideQuest}</div>}
          <div className="rounded-2xl bg-black/25 border border-white/10 p-3 text-sm text-slate-200 mb-3">
            Current area: <b>{gate.fromArea}</b><br/>
            Standing on: <b>{gate.tileName}</b><br/>
            Choosing <b>Stay here</b> keeps you on this same tile.
          </div>
          {gate.safety && <div className={`rounded-2xl border p-3 mb-5 text-sm font-bold ${gate.safety.severity === "locked" ? "bg-rose-400/15 border-rose-200/40 text-rose-100" : gate.safety.severity === "danger" ? "bg-amber-400/15 border-amber-200/40 text-amber-100" : gate.safety.severity === "caution" ? "bg-yellow-300/15 border-yellow-200/40 text-yellow-100" : "bg-lime-300/10 border-lime-200/30 text-lime-100"}`}>
            <div className="text-xs uppercase tracking-[0.22em] mb-1">{gate.safety.title || "Route Check"}</div>
            <div>Area level: Lv.{gate.safety.min}-{gate.safety.maxRec} · Your average: Lv.{gate.safety.avg} · Highest: Lv.{gate.safety.max}</div>
            <ul className="mt-2 list-disc list-inside space-y-1">
              {gate.safety.warnings.map((w, i)=><li key={i}>{w}</li>)}
            </ul>
          </div>}
          <div className="grid grid-cols-2 gap-3">
            <Button onClick={stay} variant="secondary" className="rounded-2xl py-5 font-black bg-slate-100 text-slate-950 hover:bg-white">Stay here</Button>
            <Button onClick={enter} disabled={gate.safety?.severity === "locked"} className="rounded-2xl py-5 font-black bg-cyan-300 text-slate-950 hover:bg-cyan-200 disabled:opacity-40">{gate.safety?.severity === "locked" ? "Locked" : gate.safety?.severity === "danger" ? "Enter Anyway" : "Enter Area"}</Button>
          </div>
        </div>
      </div>
    </motion.div>
  </motion.div>;
}

function NpcModal({ npc, close }) {
  const isDragon = /dragon|dracinder|gate|legend/i.test(npc.title || "") || /Dracinder|dragon|legendary|Prism light/i.test(npc.body || "");
  const isBoss = isDragon || /Rival|Keeper|Captain|Boss|cutscene/i.test(npc.title || "") || /Cutscene|Boss cutscene/i.test(npc.body || "");
  const tone = isDragon ? "from-red-950 via-fuchsia-950 to-yellow-950" : isBoss ? "from-indigo-950 via-purple-950 to-slate-950" : "from-slate-950 via-cyan-950 to-slate-950";
  return <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-start sm:items-center justify-center p-3 sm:p-4 z-50 overflow-y-auto overscroll-contain">
    <motion.div className={`absolute inset-0 bg-gradient-to-br ${tone}`} animate={{ scale:[1,1.04,1], opacity:[0.7,0.95,0.7] }} transition={{ duration:3, repeat:Infinity }}/>
    {isDragon && <>
      <motion.div initial={{opacity:0, y:80, scale:.8}} animate={{opacity:[0.15,0.38,0.22], y:[80,20,40], scale:[.8,1.05,.95]}} transition={{duration:2.4, repeat:Infinity}} className="absolute bottom-[-8%] left-1/2 -translate-x-1/2 w-[84vw] max-w-4xl h-[52vh] rounded-[50%] bg-black/70 blur-sm" />
      <motion.div animate={{ rotate:360 }} transition={{ duration:9, repeat:Infinity, ease:"linear" }} className="absolute top-[8%] right-[8%] w-40 h-40 sm:w-72 sm:h-72 rounded-full border-4 border-yellow-200/40 border-dashed shadow-2xl shadow-fuchsia-300/30"/>
      <motion.div initial={{opacity:0}} animate={{opacity:[0.4,1,0.4]}} transition={{duration:1.2, repeat:Infinity}} className="absolute top-[32%] left-1/2 -translate-x-1/2 text-[9rem] sm:text-[15rem] leading-none text-black/80 drop-shadow-[0_0_35px_rgba(250,204,21,.45)]">龍</motion.div>
    </>}
    <motion.div initial={{y:35,scale:0.94,opacity:0}} animate={{y:0,scale:1,opacity:1}} exit={{y:24,scale:0.96,opacity:0}} className="relative max-w-3xl w-full rounded-[2rem] bg-slate-950/88 border border-cyan-300/30 shadow-2xl overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(34,211,238,.2),transparent_30%),radial-gradient(circle_at_82%_80%,rgba(217,70,239,.18),transparent_28%)]" />
      <div className="relative p-6 sm:p-8">
        <div className="text-xs uppercase tracking-[0.35em] text-cyan-200 font-black mb-2">{isDragon ? "Dragon Cutscene" : isBoss ? "Story Cutscene" : "Story"}</div>
        <h2 className="text-3xl sm:text-5xl font-black bg-gradient-to-r from-white via-cyan-100 to-fuchsia-200 text-transparent bg-clip-text mb-4">{npc.title}</h2>
        {isDragon && <div className="mb-5 rounded-3xl border border-yellow-200/30 bg-yellow-200/10 p-4 overflow-hidden">
          <motion.div animate={{x:[-20,20,-20], opacity:[.5,1,.5]}} transition={{duration:2, repeat:Infinity}} className="text-yellow-100 font-black text-lg sm:text-2xl">The air bends. A royal flame opens its eye.</motion.div>
          <div className="mt-2 h-2 rounded-full bg-gradient-to-r from-red-500 via-yellow-200 to-fuchsia-400 shadow-lg" />
        </div>}
        <p className="text-lg sm:text-2xl text-slate-100 leading-relaxed mb-6 whitespace-pre-wrap">{String(npc.body || "").replace(/^Boss cutscene:\s*/i, "").replace(/^Cutscene:\s*/i, "")}</p>
        <Button onClick={close} className="rounded-2xl bg-cyan-300 text-slate-950 hover:bg-cyan-200 font-black px-7 py-5 shadow-xl">Continue</Button>
      </div>
    </motion.div>
  </motion.div>;
}
function EvolutionOverlay({ scene }) {
  const { from, to, style, phase } = scene;
  const reveal = phase === "reveal" || phase === "complete";
  const particles = Array.from({ length: 28 }, (_, i) => i);
  const particleGlyph = style.particles === "notes" ? "♪" : style.particles === "gears" ? "⚙" : style.particles === "snow" ? "❄" : style.particles === "sparks" ? "ϟ" : style.particles === "bubbles" ? "○" : style.particles === "petals" || style.particles === "leaves" ? "✦" : style.particles === "claws" ? "⌁" : style.particles === "shadows" ? "●" : style.particles === "moons" ? "☾" : style.particles === "spores" ? "✺" : "✧";
  return <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[70] flex items-center justify-center overflow-hidden bg-black/85 backdrop-blur-md p-4">
    <motion.div className={`absolute inset-0 bg-gradient-to-br ${style.aura} opacity-25`} animate={{ opacity: [0.12, 0.38, 0.2], scale: [1, 1.08, 1] }} transition={{ duration: 1.2, repeat: Infinity }}/>
    {particles.map((i) => {
      const angle = (i / particles.length) * Math.PI * 2;
      const radius = 110 + (i % 5) * 28;
      return <motion.div key={i} className="absolute font-black text-white/80 drop-shadow-lg" style={{ left: "50%", top: "50%", color: i % 3 === 0 ? style.ring : undefined }} initial={{ x: 0, y: 0, scale: 0, opacity: 0 }} animate={{ x: Math.cos(angle) * radius, y: Math.sin(angle) * radius, scale: [0, 1.15, 0.75], opacity: [0, 1, 0] }} transition={{ duration: 1.8, delay: (i % 8) * 0.08, repeat: Infinity, repeatDelay: 0.55 }}>{particleGlyph}</motion.div>;
    })}
    <div className="relative w-full max-w-3xl rounded-[2rem] border border-white/20 bg-slate-950/80 shadow-2xl overflow-hidden p-5 sm:p-8 text-center">
      <motion.div className="absolute inset-x-0 top-0 h-1 bg-white" animate={{ opacity: [0.2, 1, 0.2] }} transition={{ duration: 0.8, repeat: Infinity }}/>
      <div className="text-xs sm:text-sm uppercase tracking-[0.35em] text-cyan-100/80 mb-2">Special Evolution</div>
      <motion.h2 className="text-3xl sm:text-5xl font-black bg-gradient-to-r from-white via-cyan-100 to-fuchsia-200 text-transparent bg-clip-text" animate={{ letterSpacing: phase === "flash" ? "0.08em" : "0.02em", scale: phase === "flash" ? 1.04 : 1 }}>{style.title}</motion.h2>
      <p className="text-slate-200 mt-2 min-h-[28px]">{phase === "complete" ? `${style.toName} has awakened!` : style.call || `${style.fromName} ${style.verb}.`}</p>
      <div className="relative mt-6 flex items-center justify-center min-h-[260px]">
        <motion.div className="absolute w-64 h-64 rounded-full border-4" style={{ borderColor: style.ring }} animate={{ rotate: 360, scale: [0.9, 1.18, 0.9], opacity: [0.35, 1, 0.35] }} transition={{ duration: 1.6, repeat: Infinity, ease: "linear" }}/>
        <motion.div className="absolute w-40 h-40 rounded-full blur-2xl" style={{ background: style.ring }} animate={{ scale: [0.8, 1.6, 0.9], opacity: [0.15, 0.55, 0.2] }} transition={{ duration: 1.1, repeat: Infinity }}/>
        <AnimatePresence mode="wait">
          {!reveal ? <motion.div key="from" initial={{ opacity: 0, scale: 0.6, rotate: -8 }} animate={{ opacity: [1, 0.75, 1], scale: [0.9, 1.08, 0.82], rotate: [0, 8, -8, 0], filter: ["brightness(1)", "brightness(2.2)", "brightness(1.3)"] }} exit={{ opacity: 0, scale: 0.2, rotate: 35 }} transition={{ duration: 0.75, repeat: 2 }}><MonsterModel mon={from} size="medium"/></motion.div> : <motion.div key="to" initial={{ opacity: 0, scale: 0.15, rotate: 60, filter: "brightness(4) blur(8px)" }} animate={{ opacity: 1, scale: [0.5, 1.22, 1], rotate: [35, -8, 0], filter: "brightness(1) blur(0px)" }} transition={{ duration: 0.8, ease: "easeOut" }}><MonsterModel mon={to} size="large"/></motion.div>}
        </AnimatePresence>
      </div>
      <div className="flex justify-center items-center gap-3 text-lg sm:text-2xl font-black">
        <span className="text-slate-300">{style.fromName}</span><span className="text-cyan-200">→</span><span className="text-white">{style.toName}</span>
      </div>
      <div className="mt-3"><TypeBadge type={style.toType}/></div>
    </div>
  </motion.div>;
}

function RenameModal({ nickname, setNickname, notice, applyNickname, skip }) {
  return <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-[1800]">
    <motion.div initial={{y:24,scale:0.96}} animate={{y:0,scale:1}} exit={{y:24,scale:0.96}} className="max-w-md w-full my-4 max-h-[92vh] overflow-y-auto overscroll-contain rounded-3xl bg-slate-900 border border-fuchsia-300/30 shadow-2xl p-5 sm:p-6">
      <h2 className="text-2xl font-black mb-2 flex items-center gap-2"><Pencil className="w-5 h-5"/>Gotcha! Rename your Mythling?</h2>
      {notice && <div className="mb-4 p-3 rounded-2xl bg-cyan-300/10 border border-cyan-200/20 text-cyan-50 font-bold">{notice}</div>}
      <input value={nickname} onChange={(e)=>setNickname(e.target.value)} maxLength={16} className="w-full rounded-2xl bg-black/30 border border-white/20 px-4 py-3 text-white outline-none focus:border-cyan-300" autoFocus/>
      <div className="flex gap-2 mt-4">
        <Button onClick={applyNickname} className="rounded-2xl bg-cyan-300 text-slate-950 hover:bg-cyan-200 font-black flex-1">Save Name</Button>
        <Button onClick={skip} variant="secondary" className="rounded-2xl flex-1">Keep Original</Button>
      </div>
    </motion.div>
  </motion.div>;
}

const TRADE_EVOLUTION_MAP = {
  bellimp: "chimegeist",
  ferroach: "mantitan",
  spirikit: "phantelope",
  pebbkit: "granitus",
  gearmite: "steelfang",
};
function tradeEvolutionTarget(mon) {
  const target = TRADE_EVOLUTION_MAP[mon?.id];
  return target && BESTIARY[target] ? target : null;
}
function tradeEvolutionLabel(mon) {
  const target = tradeEvolutionTarget(mon);
  return target ? `Trade Evo → ${BESTIARY[target].name}` : "No trade evolution";
}
function normalizeOnlineMon(mon) {
  if (!mon) return null;
  try { return normalizeMon(mon); } catch { return makeMon(mon.id || "emberlynx", mon.level || 1); }
}
function StyledSelect({ value, onChange, children, disabled = false, className = "", ariaLabel = "Select" }) {
  return <div className={`relative ${className}`}>
    <select
      aria-label={ariaLabel}
      value={value}
      onChange={onChange}
      disabled={disabled}
      className="w-full appearance-none rounded-2xl bg-slate-950/70 border border-cyan-200/25 px-4 py-3 pr-10 text-white font-bold outline-none focus:border-cyan-200 focus:ring-2 focus:ring-cyan-300/25 disabled:opacity-45 shadow-inner"
    >
      {children}
    </select>
    <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-cyan-200">⌄</div>
  </div>;
}

function onlineFresh(row) {
  const t = Date.parse(row?.last_seen || row?.updated_at || 0);
  return Number.isFinite(t) && Date.now() - t < 2.5 * 60 * 1000;
}
function friendDisplayName(row, fallback = "Tamer") {
  return row?.display_name || row?.player_code || row?.email || fallback;
}
function pairFriendId(friendship, me) {
  if (!friendship) return null;
  return friendship.requester_id === me ? friendship.addressee_id : friendship.requester_id;
}
function friendshipStatusLabel(row, me) {
  if (!row) return "";
  if (row.status === "accepted") return "Friends";
  return row.requester_id === me ? "Request sent" : "Wants to be friends";
}

function FriendsScreen({ party, dex, player, setScreen, authUser, accountProfile }) {
  const [statusMode, setStatusMode] = useState("online");
  const [discoverable, setDiscoverable] = useState(true);
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState("");
  const [results, setResults] = useState([]);
  const [friends, setFriends] = useState([]);
  const [profiles, setProfiles] = useState({});
  const [invites, setInvites] = useState([]);
  const [mode, setMode] = useState("trade");
  const [loading, setLoading] = useState(false);

  const me = authUser?.id;
  const display = accountProfile?.display_name || authUser?.email?.split("@")[0] || "Tamer";
  const profile = {
    playerId: display,
    party: party.map(m => ({
      uid: m.uid, id: m.id, nickname: m.nickname || "", name: displayName(m), level: m.level, type: m.type,
      gender: m.gender || "—", hp: m.hp, maxHp: m.maxHp, atk: m.atk, def: m.def, spd: m.spd,
      xp: m.xp || 0, nextXp: m.nextXp || 1, status: m.status || null
    })),
    dexCaught: Object.keys(dex?.caught || {}).filter(k => dex.caught[k]).length
  };

  async function ensureReady() {
    if (!supabase) throw new Error("Supabase is not configured.");
    if (!me) throw new Error("Sign in from Account before using Friends.");
  }

  async function upsertPresence(nextStatus = statusMode, nextDiscoverable = discoverable) {
    await ensureReady();
    const now = new Date().toISOString();
    const payload = {
      user_id: me,
      display_name: display,
      player_code: accountProfile?.player_code || me,
      status: nextStatus,
      discoverable: Boolean(nextDiscoverable),
      last_seen: now,
      updated_at: now
    };
    const { error } = await supabase.from("mythbound_presence").upsert(payload, { onConflict: "user_id" });
    if (error) throw error;
  }

  async function fetchProfiles(ids) {
    const clean = [...new Set((ids || []).filter(Boolean))];
    if (!clean.length) return {};
    const { data, error } = await supabase.from("mythbound_presence").select("*").in("user_id", clean);
    if (error) throw error;
    const map = {};
    (data || []).forEach(p => { map[p.user_id] = p; });
    setProfiles(old => ({ ...old, ...map }));
    return map;
  }

  async function refreshAll(show = false) {
    if (!supabase || !me) return;
    setLoading(true);
    try {
      await upsertPresence();
      const { data: fr, error: frErr } = await supabase
        .from("mythbound_friends")
        .select("*")
        .or(`requester_id.eq.${me},addressee_id.eq.${me}`)
        .order("updated_at", { ascending: false });
      if (frErr) throw frErr;
      setFriends(fr || []);
      const ids = (fr || []).flatMap(f => [f.requester_id, f.addressee_id]).filter(id => id !== me);
      await fetchProfiles(ids);

      const { data: inv, error: invErr } = await supabase
        .from("mythbound_invites")
        .select("*")
        .or(`from_id.eq.${me},to_id.eq.${me}`)
        .neq("status", "expired")
        .order("created_at", { ascending: false })
        .limit(30);
      if (invErr) throw invErr;
      setInvites(inv || []);
      await fetchProfiles((inv || []).flatMap(i => [i.from_id, i.to_id]).filter(id => id !== me));
      if (show) setNotice("Friends, status, and invites refreshed.");
    } catch (e) {
      setNotice(`Friends error: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!supabase || !me) return;
    refreshAll(false);
    const timer = setInterval(() => upsertPresence().catch(() => {}), 45000);
    const channel = supabase.channel(`mythbound-friends-${me}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "mythbound_invites" }, () => refreshAll(false))
      .on("postgres_changes", { event: "*", schema: "public", table: "mythbound_friends" }, () => refreshAll(false))
      .subscribe();
    return () => {
      clearInterval(timer);
      try { supabase.removeChannel(channel); } catch {}
    };
  }, [me]);

  async function changeStatus(nextStatus, nextDiscoverable = discoverable) {
    setStatusMode(nextStatus);
    setDiscoverable(nextDiscoverable);
    try {
      await upsertPresence(nextStatus, nextDiscoverable);
      setNotice(nextStatus === "offline" || !nextDiscoverable ? "You are hidden from discovery." : `Status set to ${nextStatus}.`);
    } catch (e) { setNotice(`Status error: ${e.message}`); }
  }

  async function searchTamers() {
    setLoading(true);
    try {
      await ensureReady();
      await upsertPresence();
      const q = query.trim();
      let req = supabase.from("mythbound_presence").select("*").eq("discoverable", true).neq("user_id", me).limit(20);
      if (q) req = req.or(`display_name.ilike.%${q}%,player_code.ilike.%${q}%`);
      const { data, error } = await req.order("last_seen", { ascending: false });
      if (error) throw error;
      setResults(data || []);
      setNotice((data || []).length ? `Found ${(data || []).length} discoverable tamers.` : "No discoverable tamers found.");
    } catch (e) {
      setNotice(`Search error: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }

  function friendshipWith(id) {
    return friends.find(f => (f.requester_id === me && f.addressee_id === id) || (f.requester_id === id && f.addressee_id === me));
  }

  async function sendFriendRequest(id) {
    try {
      await ensureReady();
      if (!id || id === me) throw new Error("Choose another tamer.");
      const existing = friendshipWith(id);
      if (existing?.status === "accepted") throw new Error("You are already friends.");
      const payload = { requester_id: me, addressee_id: id, status: "pending", updated_at: new Date().toISOString() };
      const { error } = await supabase.from("mythbound_friends").upsert(payload, { onConflict: "requester_id,addressee_id" });
      if (error) throw error;
      setNotice("Friend request sent.");
      refreshAll(false);
    } catch (e) { setNotice(`Friend request error: ${e.message}`); }
  }

  async function acceptFriend(row) {
    try {
      await ensureReady();
      const { error } = await supabase.from("mythbound_friends").update({ status: "accepted", updated_at: new Date().toISOString() }).eq("id", row.id);
      if (error) throw error;
      setNotice("Friend added.");
      refreshAll(false);
    } catch (e) { setNotice(`Accept error: ${e.message}`); }
  }

  async function removeFriend(row) {
    try {
      await ensureReady();
      const { error } = await supabase.from("mythbound_friends").delete().eq("id", row.id);
      if (error) throw error;
      setNotice("Friend removed/request cleared.");
      refreshAll(false);
    } catch (e) { setNotice(`Remove error: ${e.message}`); }
  }

  async function ensureOnlineSession() {
    if (!supabase) throw new Error("Supabase is not configured.");
    const { data } = await supabase.auth.getSession();
    if (data?.session?.access_token) return data.session;
    throw new Error("Sign in before sending an invite.");
  }

  async function workerCall(path, body = {}) {
    if (!MYTHBOUND_WORKER_URL) throw new Error("Missing VITE_MYTHBOUND_WORKER_URL in .env.local.");
    const session = await ensureOnlineSession();
    const res = await fetch(`${MYTHBOUND_WORKER_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${session.access_token}` },
      body: JSON.stringify({ ...body, playerName: display, snapshot: profile })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) throw new Error(data.error || `Worker request failed: ${res.status}`);
    return data;
  }

  async function inviteFriend(friendId, inviteMode = mode) {
    try {
      await ensureReady();
      if (!friendId) throw new Error("Choose a friend.");
      if (!MYTHBOUND_WORKER_URL) throw new Error("Worker URL missing. Add VITE_MYTHBOUND_WORKER_URL.");
      const data = await workerCall("/room/create", { mode: inviteMode });
      const roomCode = data.room?.room_code || data.room?.code;
      if (!roomCode) throw new Error("Room created but no room code was returned.");
      const payload = {
        from_id: me,
        to_id: friendId,
        mode: inviteMode,
        room_code: roomCode,
        status: "pending",
        message: `${display} invited you to ${inviteMode}.`,
        created_at: new Date().toISOString()
      };
      const { error } = await supabase.from("mythbound_invites").insert(payload);
      if (error) throw error;
      setNotice(`${inviteMode === "trade" ? "Trade" : "Battle"} invite sent with room ${roomCode}.`);
      refreshAll(false);
    } catch (e) { setNotice(`Invite error: ${e.message}`); }
  }

  async function acceptInvite(invite) {
    try {
      await ensureReady();
      const { error } = await supabase.from("mythbound_invites").update({ status: "accepted", responded_at: new Date().toISOString() }).eq("id", invite.id);
      if (error) throw error;
      localStorage.setItem("mythbound_pending_invite_room", JSON.stringify({ roomCode: invite.room_code, mode: invite.mode }));
      setNotice(`Invite accepted. Opening Online hub for room ${invite.room_code}.`);
      setScreen("multiplayer");
    } catch (e) { setNotice(`Accept invite error: ${e.message}`); }
  }

  async function declineInvite(invite) {
    try {
      await ensureReady();
      const { error } = await supabase.from("mythbound_invites").update({ status: "declined", responded_at: new Date().toISOString() }).eq("id", invite.id);
      if (error) throw error;
      setNotice("Invite declined.");
      refreshAll(false);
    } catch (e) { setNotice(`Decline error: ${e.message}`); }
  }

  const acceptedFriends = friends.filter(f => f.status === "accepted");
  const pendingRequests = friends.filter(f => f.status === "pending");
  const incomingRequests = pendingRequests.filter(f => f.addressee_id === me);
  const outgoingRequests = pendingRequests.filter(f => f.requester_id === me);
  const incomingInvites = invites.filter(i => i.to_id === me && i.status === "pending");
  const sentInvites = invites.filter(i => i.from_id === me && i.status === "pending");

  if (!authUser) {
    return <motion.div key="friends" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="min-h-full p-4 sm:p-6 bg-gradient-to-br from-slate-950 via-cyan-950 to-slate-950">
      <Card className="rounded-[2rem] bg-slate-900/90 border-cyan-200/20 max-w-3xl mx-auto"><CardContent className="p-6 text-center">
        <Users className="w-16 h-16 mx-auto mb-3 text-cyan-200"/>
        <h2 className="text-4xl font-black text-white mb-2">Friends require sign-in</h2>
        <p className="text-slate-300 mb-4">Sign in from Account to search tamers, set your status, and send trade or battle invitations.</p>
        <Button onClick={()=>setScreen("account")} className="rounded-2xl bg-cyan-300 text-slate-950 font-black">Open Account</Button>
      </CardContent></Card>
    </motion.div>;
  }

  const friendCard = (row) => {
    const fid = pairFriendId(row, me);
    const p = profiles[fid] || {};
    const fresh = onlineFresh(p);
    const hidden = p.status === "offline" || p.discoverable === false;
    return <div key={row.id} className="rounded-2xl bg-white/7 border border-white/10 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="font-black text-white truncate">{friendDisplayName(p, fid?.slice(0, 8))}</div>
          <div className="text-xs text-slate-300">{hidden ? "Hidden/offline" : fresh ? `Online · ${p.status || "online"}` : "Last seen earlier"}</div>
        </div>
        <span className={`w-3 h-3 rounded-full shrink-0 ${!hidden && fresh ? "bg-lime-300 shadow-lg shadow-lime-300/40" : "bg-slate-500"}`}/>
      </div>
      <div className="grid grid-cols-3 gap-2 mt-3">
        <Button onClick={()=>inviteFriend(fid, "trade")} className="rounded-xl bg-fuchsia-300 text-slate-950 font-black text-xs">Trade</Button>
        <Button onClick={()=>inviteFriend(fid, "battle")} className="rounded-xl bg-cyan-300 text-slate-950 font-black text-xs">Battle</Button>
        <Button onClick={()=>removeFriend(row)} variant="secondary" className="rounded-xl text-xs">Remove</Button>
      </div>
    </div>;
  };

  return <motion.div key="friends" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="min-h-full p-3 sm:p-6 bg-gradient-to-br from-slate-950 via-cyan-950 to-fuchsia-950">
    <div className="flex justify-between items-start gap-3 mb-4">
      <div>
        <div className="text-xs uppercase tracking-[0.36em] text-cyan-100 font-black">Online Tamers</div>
        <h2 className="text-4xl sm:text-5xl font-black text-white leading-tight">Friends & Invites</h2>
        <p className="text-slate-200/85 max-w-3xl">Find logged-in tamers, control whether you appear online, and send direct trade or battle invitations.</p>
      </div>
      <Button onClick={()=>setScreen("world")} className="rounded-2xl bg-cyan-300 text-slate-950 font-black">Back</Button>
    </div>

    <div className="grid xl:grid-cols-[360px_1fr] gap-4">
      <div className="space-y-4">
        <Card className="rounded-3xl bg-slate-900/88 border-cyan-200/20"><CardContent className="p-4">
          <h3 className="text-2xl font-black text-white mb-3">Your visibility</h3>
          <div className="grid grid-cols-3 gap-2">
            <Button onClick={()=>changeStatus("online", true)} className={`rounded-2xl font-black ${statusMode==="online"&&discoverable?"bg-lime-300 text-slate-950":"bg-slate-800"}`}>Online</Button>
            <Button onClick={()=>changeStatus("busy", true)} className={`rounded-2xl font-black ${statusMode==="busy"&&discoverable?"bg-yellow-300 text-slate-950":"bg-slate-800"}`}>Busy</Button>
            <Button onClick={()=>changeStatus("offline", false)} className={`rounded-2xl font-black ${statusMode==="offline"||!discoverable?"bg-slate-300 text-slate-950":"bg-slate-800"}`}>Hidden</Button>
          </div>
          <label className="mt-3 flex items-center gap-2 rounded-2xl bg-white/5 border border-white/10 p-3 text-sm font-bold">
            <input type="checkbox" checked={discoverable} onChange={(e)=>changeStatus(statusMode === "offline" && e.target.checked ? "online" : statusMode, e.target.checked)} />
            Discoverable in search
          </label>
          <Button onClick={()=>refreshAll(true)} disabled={loading} variant="secondary" className="w-full mt-3 rounded-2xl font-black">{loading ? "Refreshing..." : "Refresh"}</Button>
        </CardContent></Card>

        <Card className="rounded-3xl bg-slate-900/88 border-cyan-200/20"><CardContent className="p-4">
          <h3 className="text-2xl font-black text-white mb-3">Find tamers</h3>
          <div className="flex gap-2">
            <input value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="Name or player code" className="min-w-0 flex-1 rounded-2xl bg-slate-950 border border-white/10 px-4 py-3 text-white placeholder:text-slate-500 outline-none focus:ring-2 focus:ring-cyan-300/60"/>
            <Button onClick={searchTamers} className="rounded-2xl bg-cyan-300 text-slate-950 font-black">Search</Button>
          </div>
          <div className="mt-3 space-y-2 max-h-80 overflow-y-auto pr-1">
            {results.map(r => {
              const fr = friendshipWith(r.user_id);
              return <div key={r.user_id} className="rounded-2xl bg-white/7 border border-white/10 p-3 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-black text-white truncate">{friendDisplayName(r)}</div>
                  <div className="text-xs text-slate-300">{onlineFresh(r) ? `Online · ${r.status}` : "Last seen earlier"}</div>
                  {fr && <div className="text-[11px] text-cyan-200 font-bold">{friendshipStatusLabel(fr, me)}</div>}
                </div>
                <Button onClick={()=>sendFriendRequest(r.user_id)} disabled={fr?.status === "accepted" || fr?.requester_id === me} className="rounded-xl bg-cyan-300 text-slate-950 font-black text-xs disabled:opacity-50">Add</Button>
              </div>;
            })}
          </div>
        </CardContent></Card>
      </div>

      <div className="space-y-4">
        {notice && <div className="rounded-3xl bg-cyan-300/12 border border-cyan-200/30 p-4 text-cyan-50 font-bold">{notice}</div>}

        <Card className="rounded-3xl bg-slate-900/88 border-cyan-200/20"><CardContent className="p-4">
          <div className="flex items-center justify-between gap-2 mb-3">
            <h3 className="text-2xl font-black text-white">Incoming invitations</h3>
            <div className="flex gap-2"><Button onClick={()=>setMode("trade")} className={`rounded-xl ${mode==="trade"?"bg-fuchsia-300 text-slate-950":"bg-slate-800"}`}>Trade</Button><Button onClick={()=>setMode("battle")} className={`rounded-xl ${mode==="battle"?"bg-cyan-300 text-slate-950":"bg-slate-800"}`}>Battle</Button></div>
          </div>
          <div className="grid md:grid-cols-2 gap-3">
            {incomingInvites.length ? incomingInvites.map(inv => {
              const from = profiles[inv.from_id] || {};
              return <div key={inv.id} className="rounded-2xl bg-white/7 border border-white/10 p-3">
                <div className="font-black text-white">{friendDisplayName(from, "Friend")}</div>
                <div className="text-sm text-slate-300">Invited you to {inv.mode}. Room: <b>{inv.room_code}</b></div>
                <div className="grid grid-cols-2 gap-2 mt-3"><Button onClick={()=>acceptInvite(inv)} className="rounded-xl bg-lime-300 text-slate-950 font-black">Accept</Button><Button onClick={()=>declineInvite(inv)} variant="secondary" className="rounded-xl">Decline</Button></div>
              </div>;
            }) : <div className="text-slate-400">No pending invites.</div>}
          </div>
        </CardContent></Card>

        <Card className="rounded-3xl bg-slate-900/88 border-cyan-200/20"><CardContent className="p-4">
          <h3 className="text-2xl font-black text-white mb-3">Friends</h3>
          <div className="grid md:grid-cols-2 gap-3">
            {acceptedFriends.length ? acceptedFriends.map(friendCard) : <div className="text-slate-400">No friends yet. Search for discoverable tamers.</div>}
          </div>
        </CardContent></Card>

        {(incomingRequests.length || outgoingRequests.length || sentInvites.length) ? <Card className="rounded-3xl bg-slate-900/88 border-cyan-200/20"><CardContent className="p-4">
          <h3 className="text-2xl font-black text-white mb-3">Requests</h3>
          <div className="space-y-2">
            {incomingRequests.map(row => {
              const p = profiles[row.requester_id] || {};
              return <div key={row.id} className="rounded-2xl bg-white/7 border border-white/10 p-3 flex items-center justify-between gap-2">
                <div><b>{friendDisplayName(p)}</b><div className="text-xs text-slate-300">Friend request</div></div>
                <div className="flex gap-2"><Button onClick={()=>acceptFriend(row)} className="rounded-xl bg-lime-300 text-slate-950 font-black text-xs">Accept</Button><Button onClick={()=>removeFriend(row)} variant="secondary" className="rounded-xl text-xs">Ignore</Button></div>
              </div>;
            })}
            {outgoingRequests.map(row => {
              const p = profiles[row.addressee_id] || {};
              return <div key={row.id} className="rounded-2xl bg-white/7 border border-white/10 p-3 flex items-center justify-between"><div><b>{friendDisplayName(p)}</b><div className="text-xs text-slate-300">Request sent</div></div><Button onClick={()=>removeFriend(row)} variant="secondary" className="rounded-xl text-xs">Cancel</Button></div>;
            })}
            {sentInvites.map(inv => {
              const p = profiles[inv.to_id] || {};
              return <div key={inv.id} className="rounded-2xl bg-white/7 border border-white/10 p-3"><b>{friendDisplayName(p)}</b><div className="text-xs text-slate-300">Pending {inv.mode} invite · room {inv.room_code}</div></div>;
            })}
          </div>
        </CardContent></Card> : null}
      </div>
    </div>
  </motion.div>;
}


function MultiplayerScreen({ party, setParty, dex, player, setScreen, authUser, accountProfile, saveGame }) {
  const [roomCode, setRoomCode] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [mode, setMode] = useState("trade");
  const [onlineStatus, setOnlineStatus] = useState(MYTHBOUND_WORKER_URL ? "Cloudflare Worker ready. Create or join a secure room." : "Add VITE_MYTHBOUND_WORKER_URL to enable secure trades and online battles.");
  const [onlineRoom, setOnlineRoom] = useState(null);
  const [offerUid, setOfferUid] = useState("");
  const [requestUid, setRequestUid] = useState("");
  const [battleMove, setBattleMove] = useState("");
  const [battleLog, setBattleLog] = useState([]);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [lastResolvedTurn, setLastResolvedTurn] = useState(0);
  const [onlineAnim, setOnlineAnim] = useState({ host: "idle", guest: "idle", text: null });
  const [tradeAnim, setTradeAnim] = useState(null);

  const playerName = accountProfile?.display_name || authUser?.email?.split("@")[0] || localStorage.getItem("mythbound_player_id") || `tamer_${Math.random().toString(36).slice(2,8)}`;
  const profile = {
    playerId: playerName,
    party: party.map(m => ({
      uid: m.uid, id: m.id, nickname: m.nickname || "", name: displayName(m), level: m.level, type: m.type,
      gender: m.gender || "—", hp: m.hp, maxHp: m.maxHp, atk: m.atk, def: m.def, spd: m.spd,
      xp: m.xp || 0, nextXp: m.nextXp || 1, status: m.status || null
    })),
    dexCaught: Object.keys(dex.caught || {}).filter(k => dex.caught[k]).length
  };

  useEffect(()=>{ if (!localStorage.getItem("mythbound_player_id")) localStorage.setItem("mythbound_player_id", playerName); }, [playerName]);
  useEffect(() => {
    try {
      const pending = JSON.parse(localStorage.getItem("mythbound_pending_invite_room") || "null");
      if (pending?.roomCode) {
        setJoinCode(String(pending.roomCode).toUpperCase());
        setMode(pending.mode === "battle" ? "battle" : "trade");
        setOnlineStatus(`Invite ready. Press Join Secure Room to enter ${String(pending.roomCode).toUpperCase()}.`);
        localStorage.removeItem("mythbound_pending_invite_room");
      }
    } catch {}
  }, []);
  

  function activeCode() {
    return (onlineRoom?.room_code || roomCode || joinCode || "").trim().toUpperCase();
  }
  async function copyRoomCode(code = activeCode()) {
    const value = (code || "").trim().toUpperCase();
    if (!value) return;
    try {
      if (navigator?.clipboard?.writeText) await navigator.clipboard.writeText(value);
      else {
        const el = document.createElement("textarea");
        el.value = value; document.body.appendChild(el); el.select(); document.execCommand("copy"); document.body.removeChild(el);
      }
      setOnlineStatus(`Copied room code ${value}. Send it to the other player.`);
      if (navigator?.vibrate) navigator.vibrate(30);
    } catch (e) {
      setOnlineStatus(`Room code: ${value}. Copy failed, long-press and copy manually.`);
    }
  }
  function mySide(room = onlineRoom) {
    if (!room || !currentUserId) return null;
    if (room.host_id === currentUserId || room.host_user === currentUserId) return "host";
    if (room.guest_id === currentUserId || room.guest_user === currentUserId) return "guest";
    return null;
  }
  function opponentSide(room = onlineRoom) { return mySide(room) === "host" ? "guest" : "host"; }
  function sideSnapshot(side, room = onlineRoom) { return side === "host" ? room?.host_snapshot : room?.guest_snapshot; }
  function sideParty(side, room = onlineRoom) { return sideSnapshot(side, room)?.party || []; }
  function leadForSide(side, room = onlineRoom) { return normalizeOnlineMon((sideParty(side, room) || []).find(m => Number(m.hp) > 0) || (sideParty(side, room) || [])[0]); }

  async function ensureOnlineAuth() {
    if (!supabase) throw new Error("Supabase is not configured.");
    const { data: existing } = await supabase.auth.getSession();
    if (existing?.session?.user && existing?.session?.access_token) { setCurrentUserId(existing.session.user.id); return existing.session; }
    const { data, error } = await supabase.auth.signInAnonymously();
    if (error) throw error;
    setCurrentUserId(data.session.user.id);
    return data.session;
  }

  async function workerCall(path, body = {}) {
    if (!MYTHBOUND_WORKER_URL) throw new Error("Missing VITE_MYTHBOUND_WORKER_URL in .env.local.");
    const session = await ensureOnlineAuth();
    const res = await fetch(`${MYTHBOUND_WORKER_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${session.access_token}` },
      body: JSON.stringify({ ...body, playerName, snapshot: profile })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) throw new Error(data.error || `Worker request failed: ${res.status}`);
    if (data.userId) setCurrentUserId(data.userId);
    return data;
  }

  function applySnapshotIfMine(data) {
    const sessionUserId = data?.userId || currentUserId;
    const room = data?.room;
    if (!room || !sessionUserId) return;
    if ((room.host_id === sessionUserId || room.host_user === sessionUserId) && Array.isArray(room.host_snapshot?.party)) {
      setParty(room.host_snapshot.party.map(normalizeMon));
      setTimeout(() => saveGame(false), 80);
    }
    if ((room.guest_id === sessionUserId || room.guest_user === sessionUserId) && Array.isArray(room.guest_snapshot?.party)) {
      setParty(room.guest_snapshot.party.map(normalizeMon));
      setTimeout(() => saveGame(false), 80);
    }
  }

  function adoptRoom(data, statusText = null) {
    if (!data?.room) return;
    setOnlineRoom(data.room);
    setRoomCode(data.room.room_code || data.room.code || "");
    setBattleLog(data.room.state?.battle?.log || []);
    if (data.userId) setCurrentUserId(data.userId);
    const battle = data.room.state?.battle;
    if (statusText) setOnlineStatus(statusText);
    else if (data.room.mode === "battle" && battle?.pending) {
      const s = mySide(data.room);
      const opp = s === "host" ? "guest" : "host";
      if (s && battle.pending[s] && !battle.pending[opp]) setOnlineStatus("Your move is locked. Waiting for the other tamer.");
      if (s && !battle.pending[s] && battle.pending[opp]) setOnlineStatus("Opponent has selected a move. Choose yours.");
    }
  }

  async function createRoom() {
    try {
      setOnlineStatus("Creating secure room through Cloudflare...");
      const data = await workerCall("/room/create", { mode });
      adoptRoom(data, `${mode === "trade" ? "Trade" : "Battle"} room ${data.room.room_code || data.room.code} created. Share this code.`);
    } catch (e) { setOnlineStatus(`Online error: ${e.message}`); }
  }

  async function joinRoom() {
    try {
      const code = joinCode.trim().toUpperCase();
      if (!code) throw new Error("Enter a room code first.");
      setOnlineStatus("Joining secure room through Cloudflare...");
      const data = await workerCall("/room/join", { roomCode: code });
      adoptRoom(data, `Joined ${data.room.room_code || data.room.code}. ${data.room.mode === "trade" ? "Trade" : "Battle"} room is ready.`);
    } catch (e) { setOnlineStatus(`Online error: ${e.message}`); }
  }

  async function refreshRoom(show = true) {
    try {
      const code = activeCode();
      if (!code) throw new Error("Create or join a room first.");
      const data = await workerCall("/room/get", { roomCode: code });
      adoptRoom(data, show ? `Room ${code} refreshed.` : null);
    } catch (e) { if (show) setOnlineStatus(`Online error: ${e.message}`); }
  }

  useEffect(() => {
    const code = activeCode();
    if (!code) return;
    let cancelled = false;

    // Always poll the Cloudflare Worker so online battles still update even if
    // Supabase Realtime is unavailable, delayed, or not enabled for mythbound_rooms.
    const timer = setInterval(() => { if (!cancelled) refreshRoom(false); }, 1500);

    let channel = null;
    if (supabase) {
      channel = supabase.channel(`mythbound-live-${code}`)
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "mythbound_rooms" }, (payload) => {
          const next = payload.new;
          if ((next?.room_code || next?.code) === code) {
            adoptRoom({ room: next }, null);
          }
        })
        .subscribe();
    }

    return () => {
      cancelled = true;
      clearInterval(timer);
      if (channel && supabase) supabase.removeChannel(channel);
    };
  }, [roomCode, joinCode, currentUserId, onlineRoom?.room_code]);

  useEffect(() => {
    const battle = onlineRoom?.state?.battle;
    if (!battle?.turn) return;
    const resolvedTurn = Number(battle.turn || 1) - 1;
    if (resolvedTurn > lastResolvedTurn) {
      const actions = Array.isArray(battle.lastActions) ? battle.lastActions : [];
      const first = actions[0];
      const second = actions[1];
      const firstLine = first?.text || (battle.log || []).slice(-3).find(line => line.includes(" used ")) || "Moves resolved.";
      if (first?.side) {
        const defender = first.side === "host" ? "guest" : "host";
        setOnlineAnim({ host: first.side === "host" ? "attack" : defender === "host" ? "hit" : "idle", guest: first.side === "guest" ? "attack" : defender === "guest" ? "hit" : "idle", text: firstLine });
        if (second?.side) setTimeout(() => {
          const secondDefender = second.side === "host" ? "guest" : "host";
          setOnlineAnim({ host: second.side === "host" ? "attack" : secondDefender === "host" ? "hit" : "idle", guest: second.side === "guest" ? "attack" : secondDefender === "guest" ? "hit" : "idle", text: second.text || "Second move!" });
        }, 950);
      } else {
        setOnlineAnim({ host: "attack", guest: "hit", text: firstLine });
      }
      setTimeout(() => setOnlineAnim({ host: "idle", guest: "idle", text: null }), second ? 2300 : 1500);
      setLastResolvedTurn(resolvedTurn);
    }
  }, [onlineRoom?.state?.battle?.turn]);

  async function proposeTrade() {
    try {
      const code = activeCode();
      if (!code) throw new Error("Create or join a trade room first.");
      if (!offerUid || !requestUid) throw new Error("Choose what you offer and what you request.");
      const data = await workerCall("/trade/propose", { roomCode: code, offerUid, requestUid });
      adoptRoom(data, "Trade proposal sent. The other player can accept it.");
    } catch (e) { setOnlineStatus(`Trade error: ${e.message}`); }
  }

  async function acceptTrade() {
    try {
      const code = activeCode();
      if (!code) throw new Error("Create or join a trade room first.");
      const oldRoom = onlineRoom;
      const data = await workerCall("/trade/accept", { roomCode: code });
      const trade = data.room?.state?.trade;
      const offered = [...(oldRoom?.host_snapshot?.party || []), ...(oldRoom?.guest_snapshot?.party || [])].find(m => m.uid === trade?.offerUid);
      const requested = [...(oldRoom?.host_snapshot?.party || []), ...(oldRoom?.guest_snapshot?.party || [])].find(m => m.uid === trade?.requestUid);
      setTradeAnim({ offered, requested, text: "Trade complete! Checking for trade evolutions..." });
      setTimeout(() => setTradeAnim(null), 3200);
      adoptRoom(data, "Trade completed. Your local team was updated.");
      applySnapshotIfMine(data);
    } catch (e) { setOnlineStatus(`Trade error: ${e.message}`); }
  }

  async function submitBattleTurn() {
    try {
      const code = activeCode();
      if (!code) throw new Error("Create or join a battle room first.");
      const move = battleMove || skills(myLead || party[0] || { id: "emberlynx", level: 1 })[0] || "Guard";
      setOnlineStatus(`Selected ${move}. Waiting for the other tamer.`);
      const data = await workerCall("/battle/turn", { roomCode: code, moveName: move });
      adoptRoom(data, data.resolved ? "Both moves resolved in speed order." : "Move locked in. Waiting for the other player.");
    } catch (e) { setOnlineStatus(`Battle error: ${e.message}`); }
  }

  const hostParty = onlineRoom?.host_snapshot?.party || [];
  const guestParty = onlineRoom?.guest_snapshot?.party || [];
  const trade = onlineRoom?.state?.trade || null;
  const battleState = onlineRoom?.state?.battle || null;
  const side = mySide();
  const mine = side || "host";
  const foe = mine === "host" ? "guest" : "host";
  const myLead = leadForSide(mine);
  const enemyLead = leadForSide(foe);
  const otherParty = sideParty(foe);
  const pending = battleState?.pending || {};
  const myPending = side ? !!pending[side] : false;
  const otherPending = side ? !!pending[foe] : false;

  return <motion.div key="multiplayer" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="min-h-[calc(100vh-110px)] sm:min-h-[740px] p-4 sm:p-6 bg-gradient-to-br from-slate-950 via-cyan-950 to-indigo-950">
    <div className="flex justify-between items-start gap-3 mb-5">
      <div>
        <h2 className="text-3xl sm:text-4xl font-black flex items-center gap-2"><Gamepad2 className="w-8 h-8 text-cyan-200"/>Real-Time Online Hub</h2>
        <p className="text-slate-300 max-w-2xl">Battles now appear like the in-game battle screen from each player's perspective. Both tamers lock a move, then Cloudflare resolves speed order and updates both screens.</p>
      </div>
      <Button onClick={()=>setScreen("world")} className="rounded-xl bg-cyan-300 text-slate-950 hover:bg-cyan-200 font-black">Back</Button>
    </div>

    <div className="p-4 rounded-3xl bg-black/25 border border-cyan-300/20 mb-4">
      <div className="text-xs uppercase tracking-wider text-cyan-200">Online status</div>
      <div className="font-bold text-white">{onlineStatus}</div>
      {roomCode && <button type="button" onClick={()=>copyRoomCode(roomCode)} className="mt-2 text-sm text-cyan-100 underline decoration-cyan-300/40">Active room: <span className="font-mono font-black">{roomCode}</span> · tap to copy · You are <b>{side || "not joined"}</b></button>}
    </div>

    <div className="grid lg:grid-cols-2 gap-4">
      <Card className="rounded-3xl bg-white/5 border-white/10"><CardContent className="p-5">
        <h3 className="text-2xl font-black mb-3">Create Secure Room</h3>
        <div className="grid grid-cols-2 gap-2 mb-4"><Button onClick={()=>setMode("trade")} variant={mode==="trade"?"default":"secondary"} className="rounded-2xl">Trade</Button><Button onClick={()=>setMode("battle")} variant={mode==="battle"?"default":"secondary"} className="rounded-2xl">Battle</Button></div>
        <Button onClick={createRoom} className="rounded-2xl w-full py-6 bg-fuchsia-300 hover:bg-fuchsia-200 text-slate-950 font-black">Create via Cloudflare</Button>
        {roomCode&&<button type="button" onClick={()=>copyRoomCode(roomCode)} className="mt-4 p-4 rounded-2xl bg-black/30 border border-cyan-300/20 w-full text-left active:scale-[0.99] transition"><div className="text-slate-400 text-xs uppercase">Room code · tap to copy</div><div className="text-3xl font-black tracking-widest text-cyan-100">{roomCode}</div><p className="text-sm text-slate-300 mt-2">Tap this box to copy, then send it to the other player.</p></button>}
      </CardContent></Card>
      <Card className="rounded-3xl bg-white/5 border-white/10"><CardContent className="p-5">
        <h3 className="text-2xl font-black mb-3">Join Secure Room</h3>
        <input value={joinCode} onChange={(e)=>setJoinCode(e.target.value.toUpperCase())} placeholder="TRADE-ABCD or BATTLE-ABCD" className="w-full rounded-2xl bg-black/30 border border-white/20 px-4 py-3 text-white outline-none focus:border-cyan-300 mb-3"/>
        <Button onClick={joinRoom} variant="secondary" className="rounded-2xl w-full py-5 font-black">Join via Cloudflare</Button>
        <Button onClick={()=>refreshRoom(true)} variant="secondary" className="rounded-2xl w-full py-4 font-black mt-2">Refresh Room</Button>
        <div className="mt-4 text-sm text-slate-300">Player: <span className="font-mono text-cyan-100">{playerName}</span></div>
      </CardContent></Card>
    </div>

    <OnlineBattleArena myLead={myLead} enemyLead={enemyLead} battleState={battleState} myPending={myPending} otherPending={otherPending} battleMove={battleMove} setBattleMove={setBattleMove} submitBattleTurn={submitBattleTurn} anim={onlineAnim} mine={mine} foe={foe} />

    <div className="grid lg:grid-cols-2 gap-4 mt-4">
      <Card className="rounded-3xl bg-white/5 border-white/10"><CardContent className="p-5">
        <h3 className="text-2xl font-black mb-3">Animated Secure Trade</h3>
        <p className="text-sm text-slate-300 mb-3">Trade evolution candidates are marked. When a trade finishes, both monsters fly across the trade gate and the Worker updates the room snapshots.</p>
        <div className="grid sm:grid-cols-2 gap-3">
          <div><div className="text-xs uppercase text-cyan-200 mb-1">Offer from your party</div><StyledSelect ariaLabel="Offer monster" value={offerUid} onChange={(e)=>setOfferUid(e.target.value)}><option value="">Choose offer</option>{party.map((m)=><option key={m.uid} value={m.uid}>{displayName(m)} Lv.{m.level} · {tradeEvolutionLabel(m)}</option>)}</StyledSelect></div>
          <div><div className="text-xs uppercase text-fuchsia-200 mb-1">Request from other player</div><StyledSelect ariaLabel="Request monster" value={requestUid} onChange={(e)=>setRequestUid(e.target.value)}><option value="">Choose request</option>{otherParty.map((m)=><option key={m.uid} value={m.uid}>{m.name || BESTIARY[m.id]?.name || m.id} Lv.{m.level} · {tradeEvolutionLabel(m)}</option>)}</StyledSelect></div>
        </div>
        <TradePreview offer={party.find(m=>m.uid===offerUid)} request={otherParty.find(m=>m.uid===requestUid)} trade={trade}/>
        <div className="grid grid-cols-2 gap-2 mt-3"><Button onClick={proposeTrade} variant="secondary" className="rounded-xl">Propose Trade</Button><Button onClick={acceptTrade} className="rounded-xl bg-lime-300 text-slate-950 hover:bg-lime-200">Accept Trade</Button></div>
      </CardContent></Card>
      <Card className="rounded-3xl bg-white/5 border-white/10"><CardContent className="p-5"><h3 className="text-xl font-black mb-3">Room Snapshots</h3><div className="grid gap-3"><PartySnapshot title="Host Party" party={hostParty}/><PartySnapshot title="Guest Party" party={guestParty}/></div></CardContent></Card>
    </div>
    <AnimatePresence>{tradeAnim && <TradeAnimationOverlay tradeAnim={tradeAnim}/>}</AnimatePresence>
  </motion.div>;
}
function OnlineBattleArena({ myLead, enemyLead, battleState, myPending, otherPending, battleMove, setBattleMove, submitBattleTurn, anim, mine = "host", foe = "guest" }) {
  const usable = myLead ? skills(myLead) : ["Guard"];
  return <Card className="rounded-3xl bg-slate-950/70 border-cyan-300/20 mt-4 overflow-hidden"><CardContent className="p-0">
    <div className="relative min-h-[420px] sm:min-h-[520px] bg-gradient-to-b from-violet-900 via-fuchsia-950 to-slate-950 overflow-hidden">
      <BattleFx anim={{ fx: anim.text ? "slash" : null, text: anim.text, target: myLead?.type || "Mystic" }}/>
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_78%_28%,rgba(255,255,255,.28),transparent_18%),radial-gradient(ellipse_at_24%_74%,rgba(255,255,255,.2),transparent_22%)]" />
      <div className="absolute right-[5%] top-[8%] z-20 w-[70%] max-w-[420px]"><PokemonStatusBox mon={enemyLead || makeMon("emberlynx",1)} title={enemyLead ? displayName(enemyLead) : "Waiting for opponent"} enemy /></div>
      <div className="absolute right-[4%] top-[26%] z-10 scale-[0.72] sm:scale-100 origin-top-right"><MonsterModel mon={enemyLead || makeMon("prismite",1)} anim={anim[foe] || "idle"} faint={enemyLead?.hp<=0}/></div>
      <div className="absolute left-[3%] bottom-[20%] z-10 scale-[0.76] sm:scale-100 origin-bottom-left"><MonsterModel mon={myLead || makeMon("emberlynx",1)} flipped anim={anim[mine] || "idle"} faint={myLead?.hp<=0}/></div>
      <div className="absolute right-[4%] bottom-[7%] z-20 w-[72%] max-w-[440px]"><PokemonStatusBox mon={myLead || makeMon("emberlynx",1)} title={myLead ? displayName(myLead) : "Your lead"} showXp align="right" /></div>
      <div className="absolute left-4 top-4 z-30 flex gap-2 flex-wrap"><Badge className="bg-cyan-300 text-slate-950">Your move: {myPending ? "Locked" : "Not selected"}</Badge><Badge className="bg-fuchsia-300 text-slate-950">Opponent: {otherPending ? "Locked" : "Waiting"}</Badge><Badge className="bg-slate-900 text-cyan-100 border border-cyan-300/20">Turn {battleState?.turn || 1}</Badge></div>
    </div>
    <div className="grid lg:grid-cols-[1fr_360px] gap-3 p-3 bg-slate-950 border-t border-white/10">
      <div className="rounded-2xl bg-white text-slate-900 border-4 border-slate-400 p-4"><div className="font-black text-xl mb-2">Choose your move</div><div className="grid sm:grid-cols-2 gap-2">{usable.map((move)=><Button key={move} onClick={()=>setBattleMove(move)} className={`rounded-xl justify-start ${battleMove===move ? "bg-cyan-300 text-slate-950" : "bg-slate-100 text-slate-900 hover:bg-cyan-100"}`}>{move}</Button>)}</div></div>
      <div className="rounded-2xl bg-white text-slate-900 border-4 border-slate-400 p-4"><StyledSelect ariaLabel="Battle move" value={battleMove} onChange={(e)=>setBattleMove(e.target.value)}><option value="">Choose lead move</option>{usable.map((s)=><option key={s} value={s}>{s}</option>)}</StyledSelect><Button onClick={submitBattleTurn} disabled={!myLead || myPending} className="rounded-2xl w-full py-5 bg-cyan-300 hover:bg-cyan-200 text-slate-950 font-black mt-3 disabled:opacity-45">{myPending ? "Move Locked" : "Lock Move"}</Button></div>
    </div>
    <div className="p-3 bg-black/25 max-h-44 overflow-auto"><div className="font-black text-cyan-100 mb-2">Live battle log</div>{((battleState?.log || []).length ? battleState.log : ["No turns resolved yet."]).map((line,i)=><div key={i} className="text-sm text-slate-200">• {line}</div>)}</div>
  </CardContent></Card>;
}
function TradePreview({ offer, request, trade }) {
  return <div className="mt-4 rounded-3xl bg-black/25 border border-white/10 p-4">
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
      <TradeMonCard mon={offer} label="You send" />
      <motion.div animate={{ x:[-4,4,-4] }} transition={{ duration:1.2, repeat:Infinity }} className="text-3xl font-black text-cyan-200">⇄</motion.div>
      <TradeMonCard mon={request} label="You receive" />
    </div>
    {trade && <div className="mt-3 text-sm text-slate-200">Trade status: <b>{trade.status || "pending"}</b>{trade.offerUid && <span> · Offer locked</span>}{trade.requestUid && <span> · Request locked</span>}</div>}
  </div>;
}
function TradeMonCard({ mon, label }) {
  const target = tradeEvolutionTarget(mon);
  return <div className="rounded-2xl bg-white/5 border border-white/10 p-3 min-h-[150px] flex flex-col items-center justify-center text-center">
    <div className="text-xs uppercase text-slate-400 font-black mb-1">{label}</div>
    {mon ? <><MonsterModel mon={normalizeOnlineMon(mon)} size="tiny"/><div className="font-black text-white">{displayName(mon)}</div><div className="text-xs text-slate-300">Lv.{mon.level} · {mon.type}</div>{target ? <Badge className="mt-2 bg-lime-300 text-slate-950">Evolves into {BESTIARY[target].name}</Badge> : <Badge className="mt-2 bg-slate-800 text-slate-300">No trade evo</Badge>}</> : <div className="text-slate-500">None selected</div>}
  </div>;
}
function TradeAnimationOverlay({ tradeAnim }) {
  const offered = normalizeOnlineMon(tradeAnim.offered || { id:"emberlynx", level:1 });
  const requested = normalizeOnlineMon(tradeAnim.requested || { id:"prismite", level:1 });
  return <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }} className="fixed inset-0 z-[1700] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
    <div className="relative w-full max-w-3xl rounded-[2rem] bg-gradient-to-br from-cyan-950 via-fuchsia-950 to-slate-950 border border-cyan-200/30 p-6 overflow-hidden">
      <motion.div animate={{ rotate:360 }} transition={{ duration:5, repeat:Infinity, ease:"linear" }} className="absolute left-1/2 top-1/2 w-64 h-64 -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-dashed border-cyan-200/40" />
      <div className="relative text-center mb-5"><div className="text-sm uppercase tracking-[.3em] text-cyan-200 font-black">Trade Link</div><h2 className="text-4xl font-black text-white">Mythlings are crossing worlds!</h2><p className="text-slate-200">{tradeAnim.text}</p></div>
      <div className="relative h-56"><motion.div initial={{ x:0, y:20 }} animate={{ x:[0,220,420], y:[20,-30,20], scale:[1,.75,1] }} transition={{ duration:2.2 }} className="absolute left-4 bottom-2"><MonsterModel mon={offered} size="medium"/></motion.div><motion.div initial={{ x:0, y:20 }} animate={{ x:[0,-220,-420], y:[20,-30,20], scale:[1,.75,1] }} transition={{ duration:2.2 }} className="absolute right-4 bottom-2"><MonsterModel mon={requested} size="medium" flipped/></motion.div></div>
      <div className="relative grid sm:grid-cols-2 gap-3">{[offered, requested].map((m)=><div key={m.uid} className="rounded-2xl bg-white/10 border border-white/10 p-3 text-center"><div className="font-black text-white">{displayName(m)}</div><div className="text-sm text-slate-300">{tradeEvolutionLabel(m)}</div></div>)}</div>
    </div>
  </motion.div>;
}
function PartySnapshot({ title, party }) {
  return <div className="rounded-2xl bg-black/25 border border-white/10 p-3">
    <div className="font-black text-cyan-100 mb-2">{title}</div>
    {party?.length ? <div className="space-y-2">{party.map((m)=><div key={m.uid || m.id} className="flex justify-between gap-2 text-sm"><span>{m.name || BESTIARY[m.id]?.name || m.id}</span><span className="text-slate-300">Lv.{m.level} · {m.type}</span></div>)}</div> : <div className="text-slate-400 text-sm">Waiting for player...</div>}
  </div>;
}



function PCStorageScreen({ party, storage, setScreen, swapWithStorage, withdrawFromStorage }) {
  const [selectedStorageIndex, setSelectedStorageIndex] = useState(null);
  const [selectedPartyIndex, setSelectedPartyIndex] = useState(0);
  const selected = selectedStorageIndex !== null ? storage[selectedStorageIndex] : null;

  return <motion.div key="pc" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="min-h-full p-4 sm:p-6 bg-gradient-to-br from-slate-950 via-cyan-950 to-slate-950">
    <div className="flex justify-between items-start gap-3 mb-5">
      <div>
        <h2 className="text-3xl sm:text-4xl font-black flex items-center gap-2"><Backpack className="w-8 h-8 text-cyan-200"/>PC Storage</h2>
        <p className="text-slate-300">Caught Mythlings go here when your active team is full. Select one to withdraw or swap.</p>
      </div>
      <Button onClick={()=>setScreen("world")} className="rounded-xl bg-cyan-300 text-slate-950 hover:bg-cyan-200 font-black">Back</Button>
    </div>

    <div className="grid xl:grid-cols-[1fr_360px] gap-4">
      <div>
        <h3 className="text-xl font-black mb-3 text-cyan-100">Stored Mythlings · {storage.length}</h3>
        {storage.length ? <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {storage.map((m, i)=><button key={m.uid} onClick={()=>setSelectedStorageIndex(i)} className={`text-left rounded-3xl border p-3 transition ${selectedStorageIndex===i ? "bg-cyan-300/15 border-cyan-200 ring-2 ring-cyan-200/40" : "bg-white/5 border-white/10"}`}>
            <div className="flex items-center gap-3">
              <MonsterModel mon={m} size="tiny"/>
              <div className="min-w-0">
                <div className="font-black text-white truncate">{displayName(m)}</div>
                <div className="text-xs text-slate-300">Lv.{m.level} <GenderMark mon={m}/> · HP {m.hp}/{m.maxHp}</div>
                <div className="mt-1 flex gap-1 flex-wrap"><TypeBadge type={m.type}/><StatusBadge status={m.status} small/></div>
              </div>
            </div>
          </button>)}
        </div> : <Card className="rounded-3xl bg-white/5 border-white/10"><CardContent className="p-6 text-center text-slate-300">Storage is empty. Catch more Mythlings with a full party to send them here.</CardContent></Card>}
      </div>

      <Card className="rounded-3xl bg-white/5 border-white/10">
        <CardContent className="p-5">
          <h3 className="text-2xl font-black mb-3">Storage Actions</h3>
          {selected ? <div className="space-y-4">
            <div className="rounded-3xl bg-black/25 border border-white/10 p-4 flex items-center gap-3">
              <MonsterModel mon={selected} size="small"/>
              <div>
                <div className="text-xl font-black">{displayName(selected)}</div>
                <div className="text-sm text-slate-300">{selected.name} · Lv.{selected.level}</div>
                <TypeBadge type={selected.type}/>
              </div>
            </div>
            <Button onClick={()=>withdrawFromStorage(selectedStorageIndex)} disabled={party.length >= 6} className="rounded-2xl w-full bg-lime-300 hover:bg-lime-200 text-slate-950 font-black disabled:opacity-40">Withdraw to Team</Button>
            <div>
              <div className="text-sm text-slate-300 mb-2 font-bold">Swap with team slot</div>
              <select value={selectedPartyIndex} onChange={(e)=>setSelectedPartyIndex(Number(e.target.value))} className="w-full rounded-2xl bg-black/30 border border-white/20 px-4 py-3 text-white">
                {party.map((m,i)=><option key={m.uid} value={i}>{i+1}. {displayName(m)} Lv.{m.level}</option>)}
              </select>
              <Button onClick={()=>swapWithStorage(selectedPartyIndex, selectedStorageIndex)} disabled={!party.length} variant="secondary" className="rounded-2xl w-full mt-2 font-black">Swap Selected</Button>
            </div>
          </div> : <p className="text-slate-300">Select a stored Mythling to manage it.</p>}
        </CardContent>
      </Card>
    </div>
  </motion.div>;
}

function ShopScreen({ player, setScreen, buyStock }) {
  return <motion.div key="shop" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="min-h-full p-4 sm:p-6 bg-gradient-to-br from-slate-950 via-amber-950 to-slate-950">
    <div className="flex justify-between items-start gap-3 mb-5">
      <div>
        <h2 className="text-3xl sm:text-4xl font-black flex items-center gap-2"><Star className="w-8 h-8 text-amber-200"/>Luminara Store</h2>
        <p className="text-slate-300">Buy capture items, healing items, and status cures before exploring dangerous routes.</p>
      </div>
      <Button onClick={()=>setScreen("world")} className="rounded-xl bg-cyan-300 text-slate-950 hover:bg-cyan-200 font-black">Back</Button>
    </div>

    <div className="mb-4 grid sm:grid-cols-4 gap-2">
      <InfoBox label="Money" value={`₵${player.money || 0}`}/>
      <InfoBox label="Capsules" value={totalCaptureItems(player)}/>
      <InfoBox label="Potions" value={player.potions || 0}/>
      <InfoBox label="Full Heal" value={player.items?.["Full Heal"] || 0}/>
    </div>

    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {SHOP_STOCK.map((stock, idx)=>{
        const price = stock.kind === "capture" ? CAPTURE_ITEMS[stock.item].price : stock.price;
        const owned = stock.kind === "capture" ? captureCount(player, stock.item) : (player.items?.[stock.item] || (stock.item === "Potion" ? player.potions || 0 : 0));
        const desc = stock.kind === "capture" ? CAPTURE_ITEMS[stock.item].description : stock.description;
        return <Card key={`${stock.kind}-${stock.item}-${idx}`} className="rounded-3xl bg-white/5 border-white/10">
          <CardContent className="p-5">
            <div className="flex justify-between gap-2 items-start mb-2">
              <div>
                <h3 className="text-xl font-black text-white">{stock.item}</h3>
                <p className="text-sm text-slate-300 min-h-[42px]">{desc}</p>
              </div>
              <Badge className="bg-amber-200 text-slate-950">₵{price}</Badge>
            </div>
            <div className="text-sm text-cyan-100 mb-3">Owned: {owned}</div>
            <Button onClick={()=>buyStock(stock)} disabled={(player.money || 0) < price} className="rounded-2xl w-full bg-amber-300 hover:bg-amber-200 text-slate-950 font-black disabled:opacity-40">Buy</Button>
          </CardContent>
        </Card>
      })}
    </div>
  </motion.div>;
}


function AtlasScreen({ player, seen = freshSeen(), dex = freshDex(), party = [], setScreen }) {
  const route = currentRouteStep(player, seen, party);
  return <motion.div key="atlas" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="min-h-full p-4 sm:p-6 bg-gradient-to-br from-slate-950 via-blue-950 to-indigo-950">
    <div className="flex justify-between items-start gap-3 mb-5">
      <div>
        <h2 className="text-3xl sm:text-5xl font-black flex items-center gap-2"><Map className="w-8 h-8 text-cyan-200"/>World Atlas</h2>
        <p className="text-slate-300 max-w-2xl">Linear route guide for Luminara. Follow the highlighted chapter path to understand where to go next.</p>
      </div>
      <Button onClick={()=>setScreen("world")} className="rounded-xl bg-cyan-300 text-slate-950 hover:bg-cyan-200 font-black">Back</Button>
    </div>
    <div className="mb-4 p-4 rounded-3xl bg-cyan-300/10 border border-cyan-200/20">
      <div className="text-xs uppercase tracking-wider text-cyan-200">Current route</div>
      <div className="text-2xl font-black text-white">{route.current?.id === "postgame" ? "Post-game" : AREA_DATA[route.current?.id]?.name || "Luminara"}</div>
      <div className="text-slate-300">Next: {route.next?.id === "postgame" ? "Legendary dungeon seals" : AREA_DATA[route.next?.id]?.name || "Complete the Prism Dex"} · {route.next?.gate}</div>
    </div>
    <div className="grid lg:grid-cols-2 gap-3 mb-4">
      {sideQuestList(player, seen, dex, party).map((q)=><div key={q.title} className={`rounded-2xl p-3 border ${q.done ? "bg-lime-300/10 border-lime-200/30" : "bg-white/5 border-white/10"}`}>
        <div className="font-black text-white">{q.done ? "✓" : "○"} {q.title}</div>
        <div className="text-xs text-cyan-200 uppercase tracking-wider">{q.area}</div>
        <p className="text-sm text-slate-300 mt-1">{q.goal}</p>
      </div>)}
    </div>

    <div className="space-y-3">
      {WORLD_ROUTE.map((step, i) => {
        const area = AREA_DATA[step.id];
        const active = step.id === (player.area || "luminara");
        const complete = i < route.index;
        return <div key={step.id} className={`rounded-3xl border p-4 ${active ? "bg-cyan-300/15 border-cyan-200 ring-2 ring-cyan-200/40" : complete ? "bg-lime-300/10 border-lime-200/30" : "bg-white/5 border-white/10"}`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-wider text-slate-400">Step {i + 1} · {step.gate}</div>
              <h3 className="text-2xl font-black text-white">{area?.name || "Legendary Seals"}</h3>
              <p className="text-slate-300">{area?.subtitle || "Post-game · The Five Seals"}</p>
            </div>
            <Badge className={active ? "bg-cyan-300 text-slate-950" : complete ? "bg-lime-300 text-slate-950" : "bg-slate-800 text-slate-200"}>{active ? "Here" : complete ? "Visited" : areaUnlockHint(step.id)}</Badge>
          </div>
          <p className="text-slate-200 mt-3">{step.story}</p>
          {area && <div className="mt-3 grid sm:grid-cols-3 gap-2 text-sm"><InfoBox label="Theme" value={area.theme}/><InfoBox label="Levels" value={`${area.levelMin}-${area.levelMax}`}/><InfoBox label="Chapter" value={area.chapter}/></div>}
        </div>
      })}
    </div>
  </motion.div>;
}

function HelpScreen({ setScreen }) {
  const blocks = [
    { title: "Main goal", text: "Follow the Objectives panel. Speak to Elder Nima, defeat story tamers, unlock the shrine, face Dracinder, then hunt legendary dungeons." },
    { title: "Avoid softlocks", text: "Save often. If a battle or screen ever recovers, use the Safe Recovery screen to return to the map. Cloud saves upload automatically when signed in." },
    { title: "Catching", text: "Lower HP for better odds. Different Prism items have different bonuses. If your team is full, captures go to PC Storage." },
    { title: "Status rules", text: "Some types resist status: Flame avoids burn, Volt avoids paralysis, Ice avoids freezing, Toxic/Metal avoid poison, and Spirit avoids sleep/confusion." },
    { title: "Map controls", text: "Use the draggable D-pad on mobile. Hide the bottom menu with Hide menu ↓ to see more of the board, then reopen it with ☰." },
    { title: "Online", text: "Online trades and battle turns go through your Cloudflare Worker and Supabase room snapshots." },
  ];
  return <motion.div key="help" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="min-h-full p-4 sm:p-6 bg-gradient-to-br from-slate-950 via-fuchsia-950 to-indigo-950">
    <div className="flex justify-between items-start gap-3 mb-5">
      <div>
        <h2 className="text-3xl sm:text-4xl font-black flex items-center gap-2"><Sparkles className="w-8 h-8 text-cyan-200"/>Tamer Guide</h2>
        <p className="text-slate-300 max-w-2xl">Quick reference for progression, catching, statuses, controls, PC storage, and online play.</p>
      </div>
      <Button onClick={()=>setScreen("world")} className="rounded-xl bg-cyan-300 text-slate-950 hover:bg-cyan-200 font-black">Back</Button>
    </div>
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {blocks.map((b)=><Card key={b.title} className="rounded-3xl bg-white/5 border-white/10"><CardContent className="p-5"><h3 className="text-xl font-black text-cyan-100 mb-2">{b.title}</h3><p className="text-slate-200">{b.text}</p></CardContent></Card>)}
    </div>
  </motion.div>;
}


function AccountScreen({
  setScreen,
  authUser,
  accountProfile,
  accountStatus,
  setAccountStatus,
  findValidSave,
  hydrateSaveData,
  uploadSaveDataToCloud,
  loadAccountProfile,
  cloudSyncStatus,
  lastCloudSyncAt
}) {
  const [mode, setMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState(accountProfile?.display_name || "");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setDisplayName(accountProfile?.display_name || "");
  }, [accountProfile?.display_name]);

  async function createAccount() {
    if (!supabase) {
      setAccountStatus("Supabase is not configured. Check VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
      return;
    }
    if (!email.trim() || !password.trim()) {
      setAccountStatus("Enter an email and password first.");
      return;
    }
    try {
      setBusy(true);
      setAccountStatus("Creating account...");
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { data: { display_name: displayName.trim() || email.split("@")[0] || "Tamer" } }
      });
      if (error) throw error;
      const user = data?.user;
      if (user) {
        const name = displayName.trim() || user.email?.split("@")[0] || `Tamer-${user.id.slice(0, 6)}`;
        const payload = {
          id: user.id,
          player_code: user.id,
          display_name: name,
          party_snapshot: [],
          storage_snapshot: [],
          inventory_snapshot: {},
          dex_caught: 0,
          save_version: 19,
          updated_at: new Date().toISOString()
        };
        await supabase.from("mythbound_profiles").upsert(payload, { onConflict: "id" });
        await loadAccountProfile(user);
      }
      setAccountStatus("Account created. If email confirmation is enabled in Supabase, confirm the email before signing in.");
    } catch (e) {
      setAccountStatus(`Create account error: ${e.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function signIn() {
    if (!supabase) {
      setAccountStatus("Supabase is not configured. Check VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
      return;
    }
    if (!email.trim() || !password.trim()) {
      setAccountStatus("Enter your email and password first.");
      return;
    }
    try {
      setBusy(true);
      setAccountStatus("Signing in...");
      const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw error;
      if (data?.user) await loadAccountProfile(data.user);
      setAccountStatus("Signed in successfully.");
    } catch (e) {
      setAccountStatus(`Sign in error: ${e.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    if (!supabase) return;
    try {
      setBusy(true);
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      setAccountStatus("Signed out.");
    } catch (e) {
      setAccountStatus(`Sign out error: ${e.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function uploadLocalSave() {
    try {
      setBusy(true);
      const save = findValidSave();
      if (!save) throw new Error("No local save was found to upload.");
      await uploadSaveDataToCloud(save, true);
      setAccountStatus(`Local save uploaded to your online account. ${cloudSaveSummary({ ...(accountProfile || {}), save_data: save, party_snapshot: save.party, storage_snapshot: save.storage, save_version: save.version })}`);
    } catch (e) {
      setAccountStatus(`Upload error: ${e.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function loadCloudSave() {
    try {
      setBusy(true);
      const profile = (await loadAccountProfile(authUser)) || accountProfile;
      const recovered = recoverCloudSaveFromProfile(profile);
      if (!recovered) {
        throw new Error("This account has no recoverable cloud save yet. If this is your old device, press Upload Local Save first.");
      }
      const migrated = migrateSave(recovered);
      if (!migrated.party.length && migrated.storage?.length) {
        migrated.party = migrated.storage.slice(0, 6);
        migrated.storage = migrated.storage.slice(6);
        migrated.screen = "world";
      }
      if (!migrated.party.length && !migrated.storage?.length) {
        throw new Error("Cloud row exists, but it does not contain party/storage save data. Upload a local save from the old device to repair it.");
      }
      hydrateSaveData(migrated, recovered._recoveredFromProfileSnapshot ? "recovered cloud snapshot" : "cloud save");
      await uploadSaveDataToCloud({ ...migrated, version: 19, savedAt: Date.now() }, false);
      setAccountStatus(`Cloud save loaded and upgraded for this version. ${cloudSaveSummary(profile)}`);
    } catch (e) {
      setAccountStatus(`Load cloud save error: ${e.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function updateTamerName() {
    if (!supabase || !authUser) return;
    const name = displayName.trim();
    if (!name) {
      setAccountStatus("Enter a tamer name first.");
      return;
    }
    try {
      setBusy(true);
      const { error } = await supabase
        .from("mythbound_profiles")
        .upsert({
          id: authUser.id,
          player_code: authUser.id,
          display_name: name,
          updated_at: new Date().toISOString()
        }, { onConflict: "id" });
      if (error) throw error;
      await loadAccountProfile(authUser);
      setAccountStatus("Tamer name updated.");
    } catch (e) {
      setAccountStatus(`Name update error: ${e.message}`);
    } finally {
      setBusy(false);
    }
  }

  const onlineName = accountProfile?.display_name || authUser?.user_metadata?.display_name || authUser?.email?.split("@")[0] || "Not signed in";

  return <motion.div key="account" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="min-h-full p-4 sm:p-6 bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-950">
    <div className="flex justify-between items-start gap-3 mb-5">
      <div>
        <h2 className="text-3xl sm:text-4xl font-black flex items-center gap-2"><Upload className="w-8 h-8 text-cyan-200"/>Account & Cloud Save</h2>
        <p className="text-slate-300 max-w-2xl">Create or sign in to an account, upload your current local save, and load the same save on another device.</p>
      </div>
      <Button onClick={()=>setScreen("world")} className="rounded-xl bg-cyan-300 text-slate-950 hover:bg-cyan-200 font-black">Back</Button>
    </div>

    <div className="grid lg:grid-cols-[1fr_420px] gap-4">
      <Card className="rounded-3xl bg-white/5 border-white/10">
        <CardContent className="p-5">
          <h3 className="text-2xl font-black mb-3">{authUser ? "Signed in" : "Sign in or create account"}</h3>

          {authUser ? <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-cyan-300/10 border border-cyan-200/20">
              <div className="text-xs uppercase tracking-wider text-cyan-200">Current online tamer</div>
              <div className="text-2xl font-black text-white">{onlineName}</div>
              <div className="text-sm text-slate-300 break-all">{authUser.email || authUser.id}</div>
            </div>

            <div>
              <label className="text-sm text-slate-300 font-bold">Tamer name shown online</label>
              <input value={displayName} onChange={(e)=>setDisplayName(e.target.value)} placeholder="Your tamer name" className="mt-1 w-full rounded-2xl bg-black/30 border border-white/20 px-4 py-3 text-white outline-none focus:border-cyan-300"/>
              <Button onClick={updateTamerName} disabled={busy} variant="secondary" className="mt-2 rounded-2xl w-full font-black">Update Tamer Name</Button>
            </div>

            <div className="grid sm:grid-cols-2 gap-2">
              <Button onClick={uploadLocalSave} disabled={busy} className="rounded-2xl bg-cyan-300 hover:bg-cyan-200 text-slate-950 font-black py-5">Upload Local Save</Button>
              <Button onClick={loadCloudSave} disabled={busy} className="rounded-2xl bg-lime-300 hover:bg-lime-200 text-slate-950 font-black py-5">Load / Repair Cloud Save</Button>
            </div>

            <Button onClick={signOut} disabled={busy} variant="secondary" className="rounded-2xl w-full font-black">Sign Out</Button>
          </div> : <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <Button onClick={()=>setMode("signin")} variant={mode==="signin" ? "default" : "secondary"} className="rounded-2xl">Sign In</Button>
              <Button onClick={()=>setMode("create")} variant={mode==="create" ? "default" : "secondary"} className="rounded-2xl">Create</Button>
            </div>

            <input value={email} onChange={(e)=>setEmail(e.target.value)} placeholder="Email" type="email" className="w-full rounded-2xl bg-black/30 border border-white/20 px-4 py-3 text-white outline-none focus:border-cyan-300"/>
            <input value={password} onChange={(e)=>setPassword(e.target.value)} placeholder="Password" type="password" className="w-full rounded-2xl bg-black/30 border border-white/20 px-4 py-3 text-white outline-none focus:border-cyan-300"/>
            {mode === "create" && <input value={displayName} onChange={(e)=>setDisplayName(e.target.value)} placeholder="Tamer name" className="w-full rounded-2xl bg-black/30 border border-white/20 px-4 py-3 text-white outline-none focus:border-cyan-300"/>}

            <Button onClick={mode === "create" ? createAccount : signIn} disabled={busy} className="rounded-2xl w-full py-5 bg-cyan-300 hover:bg-cyan-200 text-slate-950 font-black">
              {busy ? "Please wait..." : mode === "create" ? "Create Account" : "Sign In"}
            </Button>
          </div>}
        </CardContent>
      </Card>

      <div className="space-y-4">
        <Card className="rounded-3xl bg-white/5 border-white/10">
          <CardContent className="p-5">
            <h3 className="text-xl font-black mb-3">Cloud Sync Status</h3>
            <div className="space-y-3 text-sm">
              <InfoBox label="Status" value={cloudSyncStatus || "Local only"}/>
              <InfoBox label="Last online save" value={formatOnlineSyncStamp(lastCloudSyncAt)}/>
              <InfoBox label="Account" value={authUser ? "Signed in" : "Not signed in"}/>
              {authUser && <InfoBox label="Cloud Save" value={cloudSaveSummary(accountProfile)}/>} 
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-3xl bg-white/5 border-white/10">
          <CardContent className="p-5">
            <h3 className="text-xl font-black mb-2">Messages</h3>
            <div className="min-h-[84px] rounded-2xl bg-black/25 border border-white/10 p-3 text-slate-200 text-sm whitespace-pre-wrap">{accountStatus || "No account messages yet."}</div>
            {!supabase && <div className="mt-3 text-sm text-rose-200 bg-rose-500/10 border border-rose-300/20 rounded-2xl p-3">Supabase is not configured. Check your .env.local variables and restart Vite.</div>}
          </CardContent>
        </Card>
      </div>
    </div>
  </motion.div>;
}

function MobileNav({ setScreen, saveGame, muted, setMuted, authUser }) {
  const [open, setOpen] = useState(() => {
    try { return localStorage.getItem("mythbound_mobile_nav_hidden") !== "1"; }
    catch { return true; }
  });

  function toggleOpen() {
    setOpen((value) => {
      const next = !value;
      try { localStorage.setItem("mythbound_mobile_nav_hidden", next ? "0" : "1"); } catch {}
      return next;
    });
  }

  const navButton = "rounded-xl py-2 text-[10px] flex-col h-auto min-h-[56px] bg-slate-900/95 border border-white/10 shadow-lg active:scale-95";

  if (!open) {
    return <div className="lg:hidden fixed right-3 bottom-3 z-[80]">
      <Button onClick={toggleOpen} className="rounded-full w-16 h-16 bg-cyan-300 hover:bg-cyan-200 text-slate-950 font-black shadow-2xl shadow-cyan-400/40 border-2 border-white/50" aria-label="Show bottom menu">☰</Button>
    </div>;
  }

  return <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 px-2 pb-2 pt-1.5 bg-slate-950/92 backdrop-blur-xl border-t border-white/10">
    <div className="max-w-md mx-auto mb-2 flex justify-center">
      <Button onClick={toggleOpen} variant="secondary" className="rounded-full px-5 py-2 text-xs font-black bg-slate-900/95 border border-cyan-200/30" aria-label="Hide bottom menu">Hide menu ↓</Button>
    </div>
    <div className="grid grid-cols-5 gap-2 max-w-md mx-auto">
      <Button onClick={()=>setScreen("world")} variant="secondary" className={navButton}><Map className="w-5 h-5 mb-1"/>Map</Button>
      <Button onClick={()=>setScreen("party")} variant="secondary" className={navButton}><PawPrint className="w-5 h-5 mb-1"/>Team</Button>
      <Button onClick={()=>setScreen("dex")} variant="secondary" className={navButton}><BookOpen className="w-5 h-5 mb-1"/>Dex</Button>
      <Button onClick={()=>setScreen("pc")} variant="secondary" className={navButton}><Backpack className="w-5 h-5 mb-1"/>PC</Button>
      <Button onClick={()=>setScreen("shop")} variant="secondary" className={navButton}><Star className="w-5 h-5 mb-1"/>Shop</Button>
      <Button onClick={()=>setScreen("multiplayer")} variant="secondary" className={navButton}><Gamepad2 className="w-5 h-5 mb-1"/>Online</Button>
      <Button onClick={()=>setScreen("friends")} variant="secondary" className={navButton}><Users className="w-5 h-5 mb-1"/>Friends</Button>
      <Button onClick={()=>setScreen("account")} variant="secondary" className={navButton}><Upload className="w-5 h-5 mb-1"/>{authUser ? "Acct ✓" : "Acct"}</Button>
      <Button onClick={()=>setScreen("objectives")} variant="secondary" className={navButton}><Sparkles className="w-5 h-5 mb-1"/>Goals</Button><Button onClick={()=>setScreen("atlas")} variant="secondary" className={navButton}><Map className="w-5 h-5 mb-1"/>World</Button><Button onClick={()=>setScreen("update")} variant="secondary" className={navButton}><Upload className="w-5 h-5 mb-1"/>Update</Button>
      <Button onClick={()=>saveGame()} variant="secondary" className={navButton}><Save className="w-5 h-5 mb-1"/>Save</Button>
      <Button onClick={()=>setMuted(!muted)} variant="secondary" className={navButton}>{muted ? <VolumeX className="w-5 h-5 mb-1"/> : <Volume2 className="w-5 h-5 mb-1"/>}{muted ? "Muted" : "Sound"}</Button>
    </div>
  </div>;
}

function CinematicOverlay({ cinematic }) {
  if (!cinematic) return null;
  const tile = cinematic.tile || "";
  const tone =
    tile === "X" ? "from-purple-950 via-lime-950 to-slate-950" :
    tile === "Z" ? "from-cyan-950 via-fuchsia-950 to-slate-950" :
    tile === "E" ? "from-pink-950 via-indigo-950 to-slate-950" :
    tile === "Y" ? "from-orange-950 via-yellow-950 to-slate-950" :
    tile === "U" ? "from-stone-950 via-orange-950 to-slate-950" :
    tile === "6" ? "from-red-950 via-orange-950 to-black" :
    tile === "7" ? "from-fuchsia-950 via-cyan-950 to-slate-950" :
    tile === "8" ? "from-blue-950 via-cyan-950 to-slate-950" :
    ["1","2","3","4","5"].includes(tile) ? "from-slate-950 via-yellow-950 to-fuchsia-950" :
    "from-slate-950 via-indigo-950 to-slate-950";

  const glyph =
    tile === "X" ? "☠" :
    tile === "Z" ? "⚡" :
    tile === "E" ? "♫" :
    tile === "Y" ? "爪" :
    tile === "U" ? "巨" :
    tile === "6" ? "羽" :
    tile === "7" ? "幻" :
    tile === "8" ? "≋" :
    tile === "P" ? "✧" :
    tile === "D" ? "龍" :
    tile === "1" ? "☀" :
    tile === "2" ? "◐" :
    tile === "3" ? "♒" :
    tile === "4" ? "根" :
    tile === "5" ? "⌛" :
    "✦";

  return <motion.div
    key={`cinematic-${tile}-${cinematic.title}`}
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    exit={{ opacity: 0 }}
    className={`fixed inset-0 z-[1500] bg-gradient-to-br ${tone} flex items-center justify-center p-5 pointer-events-none`}
  >
    <motion.div
      initial={{ y: 40, scale: 0.94, opacity: 0 }}
      animate={{ y: 0, scale: 1, opacity: 1 }}
      exit={{ y: -20, scale: 0.98, opacity: 0 }}
      transition={{ duration: 0.35 }}
      className="relative max-w-xl w-full rounded-[2rem] border border-cyan-200/30 bg-slate-950/75 backdrop-blur-xl shadow-2xl p-6 overflow-hidden"
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_25%_20%,rgba(34,211,238,.22),transparent_28%),radial-gradient(circle_at_80%_80%,rgba(217,70,239,.2),transparent_30%)]" />
      <motion.div
        animate={{ rotate: 360, scale: [1, 1.1, 1] }}
        transition={{ rotate: { duration: 8, repeat: Infinity, ease: "linear" }, scale: { duration: 1.6, repeat: Infinity } }}
        className="relative mx-auto mb-4 w-24 h-24 rounded-full border-4 border-cyan-200/40 bg-white/10 flex items-center justify-center text-5xl shadow-2xl"
      >
        {glyph}
      </motion.div>
      <div className="relative text-center">
        <div className="text-xs uppercase tracking-[0.3em] text-cyan-200 font-black mb-2">New Area</div>
        <h2 className="text-3xl sm:text-5xl font-black text-white mb-2">{cinematic.title || "Unknown Area"}</h2>
        <div className="inline-flex rounded-full bg-cyan-300/15 border border-cyan-200/20 px-4 py-1 text-cyan-100 font-bold mb-4">{cinematic.subtitle || "Route"}</div>
        <p className="text-slate-100 text-lg leading-relaxed">{cinematic.text || "The air changes as you step into a new part of Luminara."}</p>
      </div>
    </motion.div>
  </motion.div>;
}


class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    try {
      localStorage.setItem("mythbound_last_error", JSON.stringify({ message: String(error?.message || error), stack: String(error?.stack || ""), at: new Date().toISOString() }));
    } catch {}
    console.error("Mythbound recovered from render error:", error, info);
  }
  render() {
    if (this.state.error) {
      return <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-4">
        <div className="max-w-xl rounded-3xl bg-slate-900 border border-rose-300/30 shadow-2xl p-6 text-center">
          <h1 className="text-3xl font-black text-rose-200 mb-3">Mythbound recovered from an error</h1>
          <p className="text-slate-200 mb-4">The game UI crashed, but your save should still be safe. Tap reload to restart the UI.</p>
          <pre className="text-left text-xs bg-black/40 border border-white/10 rounded-2xl p-3 overflow-auto max-h-36 mb-4">{String(this.state.error?.message || this.state.error)}</pre>
          <button className="rounded-2xl bg-cyan-300 text-slate-950 font-black px-6 py-3" onClick={() => window.location.reload()}>Reload Game</button>
        </div>
      </div>;
    }
    return this.props.children;
  }
}
export default function MythboundTamersJRPG() {
  return <AppErrorBoundary><MythboundTamersJRPGInner /></AppErrorBoundary>;
}

function RecoveryScreen({ reset, setScreen, party, message = "The app recovered from an invalid screen state." }) {
  return <motion.div key="recovery" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="min-h-[740px] flex items-center justify-center bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-950 p-6">
    <Card className="max-w-xl rounded-3xl bg-slate-900/95 border-cyan-300/20 shadow-2xl">
      <CardContent className="p-6 text-center">
        <h2 className="text-3xl font-black text-cyan-100 mb-3">Safe Recovery</h2>
        <p className="text-slate-200 mb-5">{message}</p>
        <div className="grid grid-cols-2 gap-2">
          <Button onClick={()=>setScreen(party?.length ? "world" : "title")} className="rounded-2xl bg-cyan-300 hover:bg-cyan-200 text-slate-950 font-black">Return</Button>
          <Button onClick={reset} variant="secondary" className="rounded-2xl font-black">New Game</Button>
        </div>
      </CardContent>
    </Card>
  </motion.div>;
}

function GameOver({ reset }) { return <motion.div key="gameover" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="min-h-[740px] flex items-center justify-center bg-gradient-to-br from-slate-950 via-rose-950 to-slate-950 p-8"><div className="text-center"><h2 className="text-6xl font-black text-rose-200 mb-3">Your team fainted</h2><p className="text-slate-200 mb-7 text-xl">Train, capture, evolve, and return stronger.</p><Button onClick={reset} className="rounded-2xl px-8 py-6 bg-cyan-300 text-slate-950 hover:bg-cyan-200 font-black">Restart Story</Button></div></motion.div>; }
