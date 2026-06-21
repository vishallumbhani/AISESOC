import React from "react";
import { FiAlertTriangle } from "react-icons/fi";

interface AlertProps {
  type: "error" | "success" | "warning" | "info";
  message: string;
  onClose?: () => void;
}

const Alert: React.FC<AlertProps> = ({ type, message, onClose }) => {
  const bgColor = {
    error: "bg-red-100 border-red-400 text-red-700",
    success: "bg-green-100 border-green-400 text-green-700",
    warning: "bg-yellow-100 border-yellow-400 text-yellow-700",
    info: "bg-blue-100 border-blue-400 text-blue-700",
  };

  return (
    <div
      className={`border-l-4 p-4 mb-4 rounded ${bgColor[type]}`}
      role="alert"
    >
      <div className="flex items-center">
        <FiAlertTriangle className="mr-2" />
        <span>{message}</span>
        {onClose && (
          <button
            onClick={onClose}
            className="ml-auto font-bold text-xl"
          >
            ×
          </button>
        )}
      </div>
    </div>
  );
};

export default Alert;
