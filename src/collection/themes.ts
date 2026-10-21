import { RICE_COPY, FISH_COPY, type CollectionCopy } from "./copy";

const assets = import.meta.glob<string>([
  "../assets/themes/*/collection/stage-*.webp", "../assets/themes/*/collection/rice-spoon.webp",
  "../assets/themes/*/collection/rice-fill.webp", "../assets/themes/*/collection/dried-fish.webp",
  "../assets/themes/*/collection/whale.webp", "../assets/themes/*/collection/paw.webp", "../assets/themes/*/collection/star.webp",
], { eager: true, query: "?url", import: "default" });
function asset(theme: string, name: string): string {
  return assets[`../assets/themes/${theme}/collection/${name}.webp`];
}
function config(id: string, kind: "rice" | "fish", title: string, copy: CollectionCopy) {
  return { kind, title, copy, stages: Array.from({ length: 11 }, (_, i) => asset(id, `stage-${i}`)),
    drop: asset(id, kind === "rice" ? "rice-spoon" : "dried-fish"),
    item: asset(id, kind === "rice" ? "rice-fill" : "dried-fish"),
    accent: asset(id, kind === "rice" ? "whale" : "paw"), star: asset(id, "star") };
}
const blue = config("blue-whale-girl", "rice", "饭饭补给站", RICE_COPY);
const mibao = config("mibao", "fish", "小鱼干储蓄罐", FISH_COPY);
export function collectionTheme(id: string) { return id === "mibao" ? mibao : blue; }
