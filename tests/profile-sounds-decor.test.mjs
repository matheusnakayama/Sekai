import test from "node:test";
import assert from "node:assert/strict";
import { MEMBER_LIST_BANNER_FADE, memberListBannerMask } from "../lib/memberListBanner.ts";
import {
  PROFILE_DECORATIONS,
  isMissingProfileDecorationColumn,
  normalizeProfileDecoration,
  withProfileDecorationColumn,
  withoutProfileDecorationColumn,
} from "../lib/profileDecorations.ts";
import { shouldPlayUiSound } from "../lib/uiSounds.ts";

test("member list banner fades from clear after the name to solid on the right", () => {
  const mask = memberListBannerMask(90);
  assert.match(mask, /90deg/);
  assert.match(mask, /transparent 0px, transparent 90px/);
  assert.match(mask, new RegExp(`#000 ${90 + MEMBER_LIST_BANNER_FADE}px, #000 100%`));
  assert.match(memberListBannerMask(-8), /transparent 0px, transparent 0px/);
});

test("profile decorations are a fixed catalog of ten original frames", () => {
  assert.equal(PROFILE_DECORATIONS.length, 10);
  assert.equal(new Set(PROFILE_DECORATIONS.map((item) => item.id)).size, 10);
  assert.equal(normalizeProfileDecoration("solara"), "solara");
  assert.equal(normalizeProfileDecoration("vigilia"), "vigilia");
  assert.equal(normalizeProfileDecoration("discord-eyes"), null);
  assert.equal(normalizeProfileDecoration(""), null);
  const select = "id,profile_card_color,status";
  assert.equal(withProfileDecorationColumn(select), "id,profile_card_color,profile_decoration,status");
  assert.equal(withoutProfileDecorationColumn(withProfileDecorationColumn(select)), select);
  assert.equal(isMissingProfileDecorationColumn({ message: "column profiles.profile_decoration does not exist" }), true);
  assert.equal(isMissingProfileDecorationColumn({ message: "permission denied" }), false);
});

test("do not disturb silences received message sounds and leaves call cues on", () => {
  assert.equal(shouldPlayUiSound("message", "dnd", 1), false);
  assert.equal(shouldPlayUiSound("mention", "dnd", 1), false);
  assert.equal(shouldPlayUiSound("message", "online", 1), true);
  assert.equal(shouldPlayUiSound("mention", "idle", 1), true);
  assert.equal(shouldPlayUiSound("call-join", "dnd", 1), true);
  assert.equal(shouldPlayUiSound("call-leave", "dnd", 1), true);
  assert.equal(shouldPlayUiSound("call-ring", "dnd", 0.4), true);
  assert.equal(shouldPlayUiSound("message", "online", 0), false);
});
