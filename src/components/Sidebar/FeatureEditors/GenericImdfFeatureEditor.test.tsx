import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { FloorFeature } from "../../../lib/types";
import { GenericImdfFeatureEditor } from "./GenericImdfFeatureEditor";

const createFeature = (): FloorFeature => ({
  type: "Feature",
  id: "opening-1",
  feature_type: "opening",
  geometry: {
    type: "LineString",
    coordinates: [
      [4.9, 52.37],
      [4.9001, 52.3701],
    ],
  },
  properties: {
    level_id: "level-1",
    category: "elevator",
    name: { en: "Elevator A" },
  },
});

describe("GenericImdfFeatureEditor", () => {
  it("allows typing in label fields without reading a cleared event target", () => {
    const feature = createFeature();

    render(
      <GenericImdfFeatureEditor
        feature={feature}
        type="opening"
        allFeatures={[feature]}
        locked={false}
        onCreateFeature={vi.fn()}
        onUpdateProperty={vi.fn()}
        onUpdateMetadata={vi.fn()}
        onDelete={vi.fn()}
        onClone={vi.fn()}
        onToggleLock={vi.fn()}
      />,
    );

    const nameInput = screen.getByDisplayValue("Elevator A") as HTMLInputElement;

    expect(() =>
      fireEvent.change(nameInput, {
        target: { value: "Elevator" },
      }),
    ).not.toThrow();

    expect(nameInput).toHaveValue("Elevator");
  });

  it("allows free-text category values while exposing suggested options", () => {
    const feature = createFeature();
    const onUpdateProperty = vi.fn();

    const { container } = render(
      <GenericImdfFeatureEditor
        feature={feature}
        type="opening"
        allFeatures={[feature]}
        locked={false}
        onCreateFeature={vi.fn()}
        onUpdateProperty={onUpdateProperty}
        onUpdateMetadata={vi.fn()}
        onDelete={vi.fn()}
        onClone={vi.fn()}
        onToggleLock={vi.fn()}
      />,
    );

    const categoryInput = screen.getByDisplayValue("elevator");
    fireEvent.change(categoryInput, { target: { value: "pedestrian.principal" } });
    expect(onUpdateProperty).toHaveBeenCalledWith("category", "pedestrian.principal");

    const suggestions = container.querySelectorAll("datalist option");
    expect(suggestions.length).toBeGreaterThan(0);
    expect(
      [...suggestions].some(
        (option) => option.getAttribute("value") === "pedestrian" && option.textContent,
      ),
    ).toBe(true);
  });
});
