import { useEffect, useRef } from "react";

// Calls onOutside when a pointer/touch lands outside the returned ref element.
// Only active while `active` is true (i.e. dropdown open).
export function useClickOutside<T extends HTMLElement>(active: boolean, onOutside: () => void) {
  const ref = useRef<T>(null);
  useEffect(() => {
    if (!active) return;
    function handler(e: Event) {
      if (ref.current && !ref.current.contains(e.target as Node)) onOutside();
    }
    document.addEventListener("mousedown", handler);
    document.addEventListener("touchstart", handler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("touchstart", handler);
    };
  }, [active, onOutside]);
  return ref;
}
