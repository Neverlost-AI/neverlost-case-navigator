import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import HomePage from "@/app/page";

describe("minimal Tranche 1 route", () => {
  it("identifies the synthetic case without presenting a full interface", () => {
    render(<HomePage />);

    expect(
      screen.getByRole("heading", { name: "Neverlost Case Navigator" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/NL-BFG-001/)).toBeInTheDocument();
    expect(screen.getByText(/No real client records/)).toBeInTheDocument();
  });
});
