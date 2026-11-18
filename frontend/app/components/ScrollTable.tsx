"use client";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

/**
 * A table wrapper that can scroll sideways. It shows a visible hint only while the table is wider than
 * its box, so people on a phone know there is more to the right. The box is focusable so keyboard users
 * can scroll it with the arrow keys.
 */
export default function ScrollTable({ label, children }: { label: string; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const [overflowing, setOverflowing] = useState(false);
  const hintId = useId();

  useEffect(() => {
    const element = box.current;
    if (!element) return;
    const measure = () => setOverflowing(element.scrollWidth > element.clientWidth + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    if (element.firstElementChild) observer.observe(element.firstElementChild);
    return () => observer.disconnect();
  }, []);

  return <>
    {overflowing && <p id={hintId} className="scroll-hint" data-testid="scroll-hint">
      This table is wider than the screen. Scroll sideways to see every column.
    </p>}
    <div ref={box} role="region" aria-label={label} aria-describedby={overflowing ? hintId : undefined} tabIndex={0} className="scroll-table">
      {children}
    </div>
  </>;
}
