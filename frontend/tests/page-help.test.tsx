import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PageHelp } from "@/components/page-help";

const route = vi.hoisted(() => ({ pathname: "/org/acme/incidents/IR-2041/operations" }));
vi.mock("next/navigation", () => ({ usePathname: () => route.pathname }));
beforeEach(() => {
  route.pathname = "/org/acme/incidents/IR-2041/operations";
  vi.stubGlobal("ResizeObserver", class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("walks through a page, supports back, finishes and restarts", async () => {
  const user = userEvent.setup();
  render(<PageHelp />);
  const trigger = screen.getByRole("button", { name: "Quick page help" });
  await user.click(trigger);
  const help = screen.getByRole("dialog", { name: "Operations walkthrough" });
  expect(within(help).getByText("Choose a request")).toBeVisible();
  expect(within(help).getByRole("button", { name: "Back" })).toBeDisabled();
  await user.click(within(help).getByRole("button", { name: "Next" }));
  expect(within(help).getByText("Review before deciding")).toBeVisible();
  await user.click(within(help).getByRole("button", { name: "Back" }));
  expect(within(help).getByText("Step 1 of 3")).toBeVisible();
  await user.click(within(help).getByRole("button", { name: "Next" }));
  await user.click(within(help).getByRole("button", { name: "Next" }));
  await user.click(within(help).getByRole("button", { name: "Done" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  await user.click(trigger);
  expect(screen.getByText("Step 1 of 3")).toBeVisible();
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
});

it("closes old help on navigation and selects the destination guide", async () => {
  const user = userEvent.setup();
  const view = render(<PageHelp />);
  await user.click(screen.getByRole("button", { name: "Quick page help" }));
  route.pathname = "/org/acme/incidents/IR-2041/investigation";
  view.rerender(<PageHelp />);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Quick page help" }));
  expect(screen.getByRole("dialog", { name: "Investigation walkthrough" })).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Close help" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});
