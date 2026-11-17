// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "../src/App.js";
import {
  FINANCIAL_FORM_FIELDS,
  FINANCIAL_FORM_SECTIONS,
} from "../src/contracts.js";

afterEach(cleanup);

describe("synthetic personal loan form", () => {
  it("renders all ten catalogue fields with their approved control types", () => {
    render(<App />);

    for (const definition of FINANCIAL_FORM_FIELDS) {
      expect(
        screen.getByLabelText(new RegExp(definition.label, "i")),
      ).toBeInTheDocument();
    }

    expect(screen.getByLabelText(/Employment type/i).tagName).toBe("SELECT");
    expect(screen.getByLabelText(/Purpose of the loan/i).tagName).toBe("SELECT");
    expect(screen.getByLabelText(/Years in current work/i)).toHaveAttribute(
      "type",
      "number",
    );
    expect(screen.getByLabelText(/Number of active loans/i)).toHaveAttribute(
      "type",
      "number",
    );
    expect(screen.getByLabelText(/Requested loan amount, INR/i)).toHaveAttribute(
      "type",
      "number",
    );
    expect(screen.getByText("Research Demo:")).toBeInTheDocument();
  });

  it("shows correction messages for values outside the shared validation rules", async () => {
    const user = userEvent.setup();
    render(<App />);

    const amount = screen.getByLabelText(/Requested loan amount/i);
    await user.type(amount, "9999");
    await user.tab();
    expect(
      await screen.findByText("Enter at least 10,000."),
    ).toBeInTheDocument();

    const years = screen.getByLabelText(/Years in current work/i);
    await user.type(years, "2.5");
    await user.tab();
    expect(await screen.findByText("Enter a whole number.")).toBeInTheDocument();

    await user.clear(amount);
    await user.type(amount, "100000");
    await user.tab();
    expect(screen.queryByText("Enter at least 10,000.")).not.toBeInTheDocument();
  });

  it("keeps values when switching to and back from the wizard presentation", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.type(screen.getByLabelText(/Years in current work/i), "7");
    await user.type(
      screen.getByLabelText(/Requested loan amount/i),
      "250000",
    );

    await user.click(screen.getByRole("button", { name: "Wizard preview" }));
    expect(screen.getByRole("progressbar")).toHaveAttribute("value", "1");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByLabelText(/Requested loan amount/i)).toHaveValue(250000);

    await user.click(screen.getByRole("button", { name: "Original form" }));
    expect(screen.getByLabelText(/Years in current work/i)).toHaveValue(7);
    expect(screen.getByLabelText(/Requested loan amount/i)).toHaveValue(250000);
    expect(
      screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent),
    ).toEqual(["Personal loan details", ...FINANCIAL_FORM_SECTIONS]);
  });

  it("supports manual simplification and restoring with automatic adaptation paused", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Simplify now" }));
    expect(screen.getByRole("progressbar")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Restore original" }));
    expect(screen.getByRole("heading", { name: "Personal loan details" })).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: "Automatic simplification" }),
    ).toBeChecked();
  });

  it("validates the current wizard section before advancing", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Wizard preview" }));

    const workSection = screen.getByRole("region", {
      name: FINANCIAL_FORM_SECTIONS[0],
    });
    await user.type(
      within(workSection).getByLabelText(/Years in current work/i),
      "51",
    );
    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(screen.getByRole("progressbar")).toHaveAttribute("value", "1");
    expect(
      await screen.findByText("Enter no more than 50."),
    ).toBeInTheDocument();
  });
});
