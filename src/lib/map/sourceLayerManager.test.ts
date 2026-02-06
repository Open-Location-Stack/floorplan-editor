import { describe, expect, it, vi } from "vitest";
import { SourceLayerManager } from "./sourceLayerManager";

describe("SourceLayerManager", () => {
  it("creates source/layer and updates data", () => {
    const setData = vi.fn();
    const source = { setData };
    const map = {
      addSource: vi.fn(),
      getSource: vi.fn().mockReturnValue(source),
      getLayer: vi.fn().mockReturnValue(undefined),
      addLayer: vi.fn(),
    };

    const manager = new SourceLayerManager(map);

    manager.ensureFeatureLayer("layer", "source");
    manager.setSourceData("source", {
      type: "FeatureCollection",
      features: [],
    });

    expect(map.addLayer).toHaveBeenCalledTimes(1);
    expect(setData).toHaveBeenCalledTimes(1);
  });
});
