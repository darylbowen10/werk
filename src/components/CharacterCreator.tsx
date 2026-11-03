"use client";
import { useState } from "react";
import AvatarPreview from "./AvatarPreview";
import { ACCENT_COLORS, ACCESSORIES, FACIAL, HAIR_COLORS, HAIR_STYLES, OUTFIT_COLORS, OUTFITS, SKIN, sanitizeAvatar, type Avatar, DIRS, type Dir } from "@/shared/avatar";

const Swatches = ({ colors, value, onChange }: { colors: string[]; value: number; onChange: (i: number) => void }) => (
  <div className="flex flex-wrap gap-1.5">{colors.map((c, i) => <button type="button" key={c} onClick={() => onChange(i)} aria-label={`color ${i + 1}`} className="w-7 h-7 border-[3px]" style={{ background: c, borderColor: i === value ? "#f2c14e" : "#120e18" }} />)}</div>
);
const Stepper = ({ options, value, onChange }: { options: string[]; value: number; onChange: (i: number) => void }) => (
  <div className="flex items-center gap-2">
    <button type="button" className="px-btn !px-2 !py-1" onClick={() => onChange((value - 1 + options.length) % options.length)}>◀</button>
    <span className="flex-1 text-center">{options[value]}</span>
    <button type="button" className="px-btn !px-2 !py-1" onClick={() => onChange((value + 1) % options.length)}>▶</button>
  </div>
);

export default function CharacterCreator({ value, onChange }: { value: Avatar; onChange: (a: Avatar) => void }) {
  const [dir, setDir] = useState<Dir | "walk">("walk");
  const set = (k: keyof Avatar) => (v: number) => onChange(sanitizeAvatar({ ...value, [k]: v }));
  const random = () => onChange(sanitizeAvatar({ skin: r(SKIN.length), hair: r(HAIR_STYLES.length), hairColor: r(HAIR_COLORS.length), facial: r(FACIAL.length), outfit: r(OUTFITS.length), outfitColor: r(OUTFIT_COLORS.length), accent: r(ACCENT_COLORS.length), accessory: r(ACCESSORIES.length) }));
  return (
    <div className="grid md:grid-cols-[220px_1fr] gap-5">
      <div className="flex flex-col items-center gap-3">
        <div className="px-panel-light p-4 flex items-center justify-center" style={{ width: 200, height: 220, background: "repeating-conic-gradient(#e9dcc2 0 25%, #f7ecd5 0 50%) 0 0/24px 24px" }}>
          <AvatarPreview avatar={value} scale={7} walk={dir === "walk"} dir={dir === "walk" ? "down" : dir} />
        </div>
        <div className="flex gap-1 flex-wrap justify-center">
          {(["walk", ...DIRS] as const).map((d) => <button type="button" key={d} className={`px-btn !px-2 !py-1 !text-[8px] ${dir === d ? "px-btn-gold" : ""}`} onClick={() => setDir(d)}>{d.toUpperCase()}</button>)}
        </div>
        <button type="button" className="px-btn px-btn-teal" onClick={random}>🎲 RANDOMIZE</button>
      </div>
      <div className="space-y-3">
        <Row label="Skin tone"><Swatches colors={SKIN} value={value.skin} onChange={set("skin")} /></Row>
        <Row label="Hair style"><Stepper options={HAIR_STYLES} value={value.hair} onChange={set("hair")} /></Row>
        <Row label="Hair color"><Swatches colors={HAIR_COLORS} value={value.hairColor} onChange={set("hairColor")} /></Row>
        <Row label="Facial hair"><Stepper options={FACIAL} value={value.facial} onChange={set("facial")} /></Row>
        <Row label="Business attire"><Stepper options={OUTFITS} value={value.outfit} onChange={set("outfit")} /></Row>
        <Row label="Attire color"><Swatches colors={OUTFIT_COLORS} value={value.outfitColor} onChange={set("outfitColor")} /></Row>
        <Row label="Accent (tie / top)"><Swatches colors={ACCENT_COLORS} value={value.accent} onChange={set("accent")} /></Row>
        <Row label="Accessory"><Stepper options={ACCESSORIES} value={value.accessory} onChange={set("accessory")} /></Row>
      </div>
    </div>
  );
}
const r = (n: number) => Math.floor(Math.random() * n);
const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (<div className="grid grid-cols-[130px_1fr] items-center gap-3"><span className="text-hq-mute">{label}</span>{children}</div>);
