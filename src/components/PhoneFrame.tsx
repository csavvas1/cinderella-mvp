import type { ReactNode } from "react";

export default function PhoneFrame({ children }: { children: ReactNode }) {
  return (
    <div className="stage">
      <div className="phone">
        <div className="phone__notch" />
        {children}
      </div>
    </div>
  );
}
