import { describe, expect, it } from "vitest";
import { mapPointIconIdForOpeningEndpoint } from "./iconRegistry";

describe("mapPointIconIdForOpeningEndpoint", () => {
  it("returns category-specific icon for node endpoint", () => {
    expect(mapPointIconIdForOpeningEndpoint("stairs", "node")).toBe("point-icon-nav-stairs");
  });

  it("returns connector icon for connector endpoint", () => {
    expect(mapPointIconIdForOpeningEndpoint("stairs", "connector")).toBe("point-icon-connector");
  });
});
