import test from "node:test";
import assert from "node:assert/strict";
import { ACTIVITY_PANEL_HEIGHT, ACTIVITY_PANEL_MASK, isMissingActivityBannerCropColumn, withActivityBannerCrop, withoutActivityBannerCrop } from "../lib/activityBanner.ts";
import { MEMBER_LIST_BANNER_OPACITY, memberListBannerMask } from "../lib/memberListBanner.ts";
import {
  PROFILE_DECORATIONS,
  isMissingProfileDecorationColumn,
  normalizeProfileDecoration,
  withProfileDecorationColumn,
  withoutProfileDecorationColumn,
} from "../lib/profileDecorations.ts";
import { shouldPlayUiSound } from "../lib/uiSounds.ts";

test("member list banner stays clear over the name and fades diagonally after it", () => {
  const mask = decodeURIComponent(memberListBannerMask(90, 240, 46));
  assert.equal(MEMBER_LIST_BANNER_OPACITY < 1 && MEMBER_LIST_BANNER_OPACITY >= 0.7, true);
  assert.match(mask, /<rect x="90"/);
  assert.match(mask, /x1="240" y1="0" x2="152" y2="46"/);
  assert.match(decodeURIComponent(memberListBannerMask(180, 240, 46)), /<polygon /);
  assert.match(decodeURIComponent(memberListBannerMask(20, 240, 46)), /<rect x="20"/);
  assert.match(decodeURIComponent(memberListBannerMask(-8, 0, 0)), /<rect x="0"/);
});

test("a compressed name gets a diagonal wedge instead of a square fade", () => {
  const mask = decodeURIComponent(memberListBannerMask(210, 240, 46));
  const left = Number(mask.match(/points="(\d+),0 240,0 240,46"/)?.[1]);
  assert.ok(left > 0 && left <= 210);
  assert.doesNotMatch(mask, /<rect /);
  const ends = mask.match(/x1="(\d+)" y1="0" x2="(\d+)"/);
  assert.ok(ends);
  assert.notEqual(ends[1], ends[2]);
});

test("activity gif uses a shorter diagonal fade and optional crop columns", () => {
  assert.equal(ACTIVITY_PANEL_HEIGHT, "31%");
  assert.match(ACTIVITY_PANEL_MASK, /to bottom left/);
  const select = "id,activity_banner_url,status";
  const withCrop = withActivityBannerCrop(select);
  assert.match(withCrop, /activity_banner_position_x,activity_banner_position_y,activity_banner_zoom/);
  assert.equal(withoutActivityBannerCrop(withCrop), select);
  assert.equal(withActivityBannerCrop(withCrop), withCrop);
  assert.equal(isMissingActivityBannerCropColumn({ message: "column activity_banner_position_x does not exist" }), true);
  assert.equal(isMissingActivityBannerCropColumn({ message: "permission denied" }), false);
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
