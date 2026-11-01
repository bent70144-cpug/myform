import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Button } from "../src/button";

afterEach(cleanup);

describe("Button", () => {
  it("renders children with the variant class", () => {
    render(createElement(Button, { variant: "danger" }, "Delete"));
    const button = screen.getByRole("button", { name: "Delete" });
    expect(button.className).toContain("myform-btn--danger");
  });

  it("defaults to type=button so forms never submit implicitly", () => {
    render(createElement(Button, null, "Save"));
    expect(screen.getByRole("button").getAttribute("type")).toBe("button");
  });

  it("forwards clicks to the handler", () => {
    const onClick = vi.fn();
    render(createElement(Button, { onClick }, "Click me"));
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledOnce();
  });
});
