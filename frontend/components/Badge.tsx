import React from "react";
import clsx from "clsx";

interface BadgeProps {
  text: string;
  type?: "success" | "danger" | "warning" | "info" | "default";
}

const Badge: React.FC<BadgeProps> = ({ text, type = "default" }) => {
  const colors = {
    success: "bg-green-100 text-green-800",
    danger: "bg-red-100 text-red-800",
    warning: "bg-yellow-100 text-yellow-800",
    info: "bg-blue-100 text-blue-800",
    default: "bg-gray-100 text-gray-800",
  };

  return (
    <span className={clsx("inline-block px-3 py-1 text-xs font-semibold rounded-full", colors[type])}>
      {text}
    </span>
  );
};

export default Badge;
