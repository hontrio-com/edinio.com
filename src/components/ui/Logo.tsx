import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils/cn";

type LogoSize = "sm" | "md" | "lg";

const SIZES: Record<LogoSize, { icon: number; text: string }> = {
  sm: { icon: 24, text: "text-base" },
  md: { icon: 28, text: "text-lg" },
  lg: { icon: 32, text: "text-xl" },
};

interface LogoProps {
  size?: LogoSize;
  href?: string;
  className?: string;
  showText?: boolean;
  textClassName?: string;
}

export function Logo({
  size = "md",
  href = "/",
  className,
  showText = true,
  textClassName,
}: LogoProps) {
  const { icon, text } = SIZES[size];

  const content = (
    <>
      <Image
        src="/logo.png"
        alt="Edinio"
        width={icon}
        height={icon}
        className="flex-shrink-0"
      />
      {showText && (
        <span
          className={cn(
            "font-bold tracking-tight",
            text,
            textClassName,
          )}
        >
          Edinio<span className="text-primary">.com</span>
        </span>
      )}
    </>
  );

  if (href) {
    return (
      <Link href={href} className={cn("flex items-center gap-2", className)}>
        {content}
      </Link>
    );
  }

  return (
    <div className={cn("flex items-center gap-2", className)}>
      {content}
    </div>
  );
}
