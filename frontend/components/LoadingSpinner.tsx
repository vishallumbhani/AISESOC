import React from "react";
import clsx from "clsx";

interface LoadingSpinnerProps {
  size?: "sm" | "md" | "lg";
  text?: string;
}

const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ size = "md", text }) => {
  const sizes = {
    sm: "w-6 h-6",
    md: "w-10 h-10",
    lg: "w-16 h-16",
  };

  return (
    <div className="flex flex-col items-center justify-center space-y-4">
      <div className={clsx("animate-spin", sizes[size])}>
        <div className="border-4 border-gray-200 border-t-blue-600 rounded-full w-full h-full"></div>
      </div>
      {text && <p className="text-gray-600">{text}</p>}
    </div>
  );
};

export default LoadingSpinner;
