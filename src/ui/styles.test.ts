import { afterEach, describe, expect, it } from "vitest";
import { panelStyles } from "./styles";

let style: HTMLStyleElement | undefined;
afterEach(() => {
  style?.remove();
  document.body.replaceChildren();
  document.documentElement.removeAttribute("dark");
});

describe("settings control contrast", () => {
  it.each([false, true])("uses dark native controls and readable options when YouTube dark mode is %s", (dark) => {
    if (dark) document.documentElement.setAttribute("dark", "");
    style = document.createElement("style");
    style.textContent = panelStyles;
    document.head.appendChild(style);
    document.body.innerHTML = '<div class="panel"><div class="control"><select><option>Sans limpa</option><option>Serifada</option></select></div></div>';
    const panel = document.querySelector<HTMLElement>(".panel")!;
    expect(getComputedStyle(panel).getPropertyValue("color-scheme")).toBe("dark");
    document.querySelectorAll("option").forEach((option) => {
      const colors = getComputedStyle(option);
      expect(colors.color).toBe("rgb(255, 255, 255)");
      expect(colors.backgroundColor).toBe("rgb(34, 34, 43)");
    });
  });
});
