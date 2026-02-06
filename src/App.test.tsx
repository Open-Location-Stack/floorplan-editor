import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

const originalMatchMedia = "matchMedia" in window ? window.matchMedia : undefined;

describe("App", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      configurable: true,
      value: vi.fn().mockImplementation(mockMatchMedia as unknown as typeof window.matchMedia),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalMatchMedia) {
      window.matchMedia = originalMatchMedia;
    } else {
      Reflect.deleteProperty(window, "matchMedia");
    }
  });

  it("renders hello world content", () => {
    render(<App />);

    expect(screen.getByRole("heading", { level: 2, name: /hello, world/i })).toBeInTheDocument();
    expect(screen.getByText(/tailwind css 4 with daisyui/i)).toBeInTheDocument();
  });

  it("toggles the theme preference", async () => {
    render(<App />);

    const toggle = screen.getByRole("checkbox", { name: /toggle theme/i });

    fireEvent.click(toggle);

    await waitFor(() =>
      expect(document.documentElement.getAttribute("data-theme")).toBe("qr-dark"),
    );
    expect(window.localStorage.getItem("vite-ts-template-theme")).toBe("qr-dark");
  });
});
