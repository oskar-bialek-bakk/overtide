import { animate, motion, useMotionValue, useTransform } from "framer-motion";
import { useEffect } from "react";

export function AnimatedNumber({
  value,
  fractionDigits = 1,
}: {
  value: number;
  fractionDigits?: number;
}) {
  const mv = useMotionValue(value);
  const display = useTransform(mv, (v) => v.toFixed(fractionDigits));
  useEffect(() => {
    const controls = animate(mv, value, { duration: 0.6, ease: "easeOut" });
    return () => controls.stop();
  }, [value, mv]);
  return <motion.span className="tabular-nums">{display}</motion.span>;
}
