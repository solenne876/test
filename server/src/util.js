import { nanoid, customAlphabet } from "nanoid";

const shortId = customAlphabet("abcdefghijklmnopqrstuvwxyz0123456789", 6);

export function slugify(text) {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export function makeSlug(nom) {
  const base = slugify(nom) || "lieu";
  return `${base}-${shortId()}`;
}

export function makeId() {
  return nanoid();
}
