import Link from "next/link";

export const Logo = () => {
  return (
    <Link href="/" className="group shrink-0">
      <span className="font-semibold text-base tracking-tight whitespace-nowrap text-foreground group-hover:text-foreground/70 transition">
        AI App Store Screenshots
      </span>
    </Link>
  );
};
