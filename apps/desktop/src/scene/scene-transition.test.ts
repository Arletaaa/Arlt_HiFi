import { describe, expect, it } from "vitest";
import {
  CASE_HOVER_YAW,
  DETAIL_CAMERA,
  DETAIL_LOOK,
  DISPLAY_CASE_SCALE,
  GALLERY_CAMERA,
  GALLERY_LOOK,
  INTERACTION_CASE_POSITION,
  buildClosePlan,
  cameraPose,
  caseHoverPosition,
  caseStartPosition,
  closeFrame,
  enterCasePose,
  isGalleryChromeVisible,
  returnCasePose
} from "./scene-transition";

describe("isGalleryChromeVisible", () => {
  it("keeps the search bar out of the interaction area", () => {
    expect(isGalleryChromeVisible("gallery")).toBe(true);
    expect(isGalleryChromeVisible("entering")).toBe(false);
    expect(isGalleryChromeVisible("detail")).toBe(false);
    expect(isGalleryChromeVisible("closing")).toBe(false);
    expect(isGalleryChromeVisible("returning")).toBe(false);
  });
});

describe("cameraPose", () => {
  it("starts at the gallery camera and ends at the interaction camera", () => {
    expect(cameraPose("gallery", 0)).toEqual({ position: [...GALLERY_CAMERA], target: [...GALLERY_LOOK] });
    expect(cameraPose("detail", 0)).toEqual({ position: [...DETAIL_CAMERA], target: [...DETAIL_LOOK] });

    const entered = cameraPose("entering", 1);
    expect(entered.position[0]).toBeCloseTo(DETAIL_CAMERA[0]);
    expect(entered.position[1]).toBeCloseTo(DETAIL_CAMERA[1]);
    expect(entered.position[2]).toBeCloseTo(DETAIL_CAMERA[2]);
    expect(entered.target[0]).toBeCloseTo(DETAIL_LOOK[0]);
    expect(entered.target[1]).toBeCloseTo(DETAIL_LOOK[1]);
    expect(entered.target[2]).toBeCloseTo(DETAIL_LOOK[2]);

    const returned = cameraPose("returning", 1);
    expect(returned.position[0]).toBeCloseTo(GALLERY_CAMERA[0]);
    expect(returned.position[1]).toBeCloseTo(GALLERY_CAMERA[1]);
    expect(returned.position[2]).toBeCloseTo(GALLERY_CAMERA[2]);
    expect(returned.target[0]).toBeCloseTo(GALLERY_LOOK[0]);
    expect(returned.target[1]).toBeCloseTo(GALLERY_LOOK[1]);
    expect(returned.target[2]).toBeCloseTo(GALLERY_LOOK[2]);
  });

  it("keeps the camera still while the case is closing", () => {
    expect(cameraPose("closing", 0)).toEqual(cameraPose("detail", 0));
    expect(cameraPose("closing", 0.7)).toEqual(cameraPose("detail", 0));
  });
});

describe("case poses", () => {
  it("starts at the hovered slot with the display size and no instant tilt", () => {
    const start = enterCasePose(0, 1.6);

    expect(start.position).toEqual(caseHoverPosition(1.6));
    expect(start.scale).toBeCloseTo(DISPLAY_CASE_SCALE);
    expect(start.rotationX).toBeCloseTo(0);
    expect(start.rotationY).toBeCloseTo(CASE_HOVER_YAW);
  });

  it("tilts back mid-flight and lands on the wall without a tilt", () => {
    const mid = enterCasePose(0.3, 1.6);
    const end = enterCasePose(1, -0.8);

    expect(mid.rotationX).toBeLessThan(0);
    expect(end.position[0]).toBeCloseTo(INTERACTION_CASE_POSITION[0]);
    expect(end.position[1]).toBeCloseTo(INTERACTION_CASE_POSITION[1]);
    expect(end.position[2]).toBeCloseTo(INTERACTION_CASE_POSITION[2]);
    expect(end.scale).toBeCloseTo(1);
    expect(end.rotationX).toBeCloseTo(0);
    expect(end.rotationY).toBeCloseTo(0);
  });

  it("returns to the original slot without a tilt", () => {
    const end = returnCasePose(1, 0.8);
    const slot = caseStartPosition(0.8);

    expect(end.position[0]).toBeCloseTo(slot[0]);
    expect(end.position[1]).toBeCloseTo(slot[1]);
    expect(end.position[2]).toBeCloseTo(slot[2]);
    expect(end.scale).toBeCloseTo(DISPLAY_CASE_SCALE);
    expect(end.rotationX).toBe(0);
    expect(end.rotationY).toBe(0);
  });
});

describe("buildClosePlan", () => {
  it("does nothing when the case is already closed", () => {
    expect(buildClosePlan(0, false).total).toBe(0);
    expect(closeFrame(buildClosePlan(0, false), 0).done).toBe(true);
  });

  it("closes the lid when the disc is already home", () => {
    const plan = buildClosePlan(Math.PI, false);

    expect(plan.total).toBeCloseTo(0.3);
    expect(closeFrame(plan, 0.15).lidAngle).toBeCloseTo(Math.PI / 2);
    expect(closeFrame(plan, 0.3).done).toBe(true);
  });

  it("opens the lid, returns the disc, then closes when the disc is out", () => {
    const plan = buildClosePlan(0, true);

    expect(plan.total).toBeCloseTo(0.82);
    expect(plan.openEnd).toBeCloseTo(0.22);
    expect(plan.lidEnd).toBeCloseTo(0.82);
    expect(closeFrame(plan, 0.11).lidAngle).toBeCloseTo(Math.PI / 4);
    expect(closeFrame(plan, 0.37).discIn).toBeCloseTo(0.5);
    expect(closeFrame(plan, 0.82).done).toBe(true);
  });

  it("does not re-open an already open lid before returning the disc", () => {
    const plan = buildClosePlan(Math.PI, true);

    expect(plan.openEnd).toBe(0);
    expect(plan.total).toBeCloseTo(0.6);
    expect(closeFrame(plan, 0.3).discIn).toBeCloseTo(1);
    expect(closeFrame(plan, 0.6).done).toBe(true);
  });
});
