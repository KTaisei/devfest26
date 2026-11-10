import type { ReactNode } from "react";

/** Keep the next action visible; retain sources and limitations one tap away. */
export function InfoDisclosure({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <details className="info-disclosure">
      <summary>{title}</summary>
      <div>{children}</div>
    </details>
  );
}
