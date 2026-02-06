import { describe, expect, it } from "vitest";
import { __resetProjectRepositoryForTests, projectRepository } from "./projectRepository";

describe("projectRepository", () => {
  it("saves and loads a project", async () => {
    __resetProjectRepositoryForTests();

    await projectRepository.saveProject({
      id: "p1",
      name: "Project 1",
      version: 1,
      updatedAt: "2026-01-01T00:00:00.000Z",
      features: [],
      overlays: [],
    });

    const loaded = await projectRepository.loadProject("p1");

    expect(loaded?.id).toBe("p1");
  });

  it("lists projects by newest first", async () => {
    __resetProjectRepositoryForTests();

    await projectRepository.saveProject({
      id: "older",
      name: "Older",
      version: 1,
      updatedAt: "2026-01-01T00:00:00.000Z",
      features: [],
      overlays: [],
    });

    await projectRepository.saveProject({
      id: "newer",
      name: "Newer",
      version: 1,
      updatedAt: "2026-02-01T00:00:00.000Z",
      features: [],
      overlays: [],
    });

    const projects = await projectRepository.listProjects();

    expect(projects[0]?.id).toBe("newer");
    expect(projects.some((project) => project.id === "older")).toBe(true);
  });
});
