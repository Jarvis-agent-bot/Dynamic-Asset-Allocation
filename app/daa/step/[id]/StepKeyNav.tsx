"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

type StepKeyNavProps = {
  prevHref: string | null;
  nextHref: string | null;
};

function isTypingTarget(target: EventTarget | null): boolean {
  if (!target) return false;

  // We only care about element-ish targets.
  const el = target as Partial<HTMLElement>;
  const tag = String(el.tagName || "").toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return true;
  if (el.isContentEditable) return true;
  return false;
}

export default function StepKeyNav({ prevHref, nextHref }: StepKeyNavProps) {
  const router = useRouter();

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.defaultPrevented) return;
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      if (isTypingTarget(e.target)) return;

      if (e.key === "ArrowLeft" && prevHref) {
        e.preventDefault();
        router.push(prevHref);
      }
      if (e.key === "ArrowRight" && nextHref) {
        e.preventDefault();
        router.push(nextHref);
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [router, prevHref, nextHref]);

  return null;
}
