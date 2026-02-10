import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import App from "./App";

describe("App", () => {
  it("keeps delete controls enabled even when entities have children", () => {
    render(<App />);

    const deleteBuildingButton = screen.getByRole("button", { name: /delete building hq/i });
    const deleteFloorButton = screen.getByRole("button", { name: /delete floor ground floor/i });

    expect(deleteBuildingButton).toBeEnabled();
    expect(deleteBuildingButton).not.toHaveAttribute("disabled");
    expect(deleteFloorButton).toBeEnabled();
    expect(deleteFloorButton).not.toHaveAttribute("disabled");
  });

  it("deletes a floor and removes child content", () => {
    render(<App />);

    expect(screen.getByText("Ground Floor")).toBeInTheDocument();
    expect(screen.getByText("Reception Desk")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /delete floor ground floor/i }));

    expect(screen.queryByText("Ground Floor")).not.toBeInTheDocument();
    expect(screen.queryByText("Reception Desk")).not.toBeInTheDocument();
  });

  it("deletes a building and removes all nested floors and child content", () => {
    render(<App />);

    const deleteBuildingButton = screen.getByRole("button", { name: /delete building hq/i });
    fireEvent.click(deleteBuildingButton);

    expect(screen.queryByText("HQ")).not.toBeInTheDocument();
    expect(screen.queryByText("First Floor")).not.toBeInTheDocument();
    expect(screen.queryByText("Conference Room A")).not.toBeInTheDocument();
    expect(screen.getByText("No buildings yet")).toBeInTheDocument();
  });

  it("allows deleting a building that still has child floors", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /delete building hq/i }));

    expect(screen.queryByRole("button", { name: /delete building hq/i })).not.toBeInTheDocument();
    expect(screen.getByText("No buildings yet")).toBeInTheDocument();
  });

  it("allows deleting a floor that still has child items", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /delete floor ground floor/i }));

    expect(
      screen.queryByRole("button", { name: /delete floor ground floor/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Reception Desk")).not.toBeInTheDocument();
  });
});
