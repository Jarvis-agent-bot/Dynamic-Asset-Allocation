export function scrollToIdAndFocusV0(id: string) {
  const el = document.getElementById(id);
  if (!el) return;

  el.scrollIntoView({ behavior: "smooth", block: "start" });

  const focusTarget =
    el.querySelector<HTMLElement>("[data-focus-target='true'], [data-dashboard-section-heading='true'], h1, h2, h3") ?? el;

  if (focusTarget.tabIndex < 0) {
    focusTarget.setAttribute("tabindex", "-1");
  }

  if (typeof focusTarget.focus === "function") {
    focusTarget.focus({ preventScroll: true });
  }
}
