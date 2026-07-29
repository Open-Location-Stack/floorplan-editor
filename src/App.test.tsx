import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";

const mockMatchMedia = () => ({
  matches: false,
  media: "(prefers-color-scheme: dark)",
  onchange: null,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  addListener: vi.fn(),
  removeListener: vi.fn(),
  dispatchEvent: vi.fn(),
});

describe("App", () => {
  beforeEach(() => {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      configurable: true,
      value: vi.fn().mockImplementation(mockMatchMedia as unknown as typeof window.matchMedia),
    });
  });

  it("shows a clear error when maptiler key is missing", () => {
    vi.stubEnv("VITE_MAPTILER_API_KEY", "");

    render(<App />);

    expect(screen.getByRole("heading", { name: /configuration error/i })).toBeInTheDocument();
    expect(screen.getByText(/missing vite_maptiler_api_key/i)).toBeInTheDocument();
  });
});
