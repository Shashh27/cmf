import React, { useState, useEffect } from 'react';
import { X, CheckCircle } from 'lucide-react';
import { cn } from '../../lib/utils';

const Toast = ({ message, type = 'success', onClose, duration = 3000 }) => {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(false);
      setTimeout(onClose, 300); // Wait for fade out animation
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, onClose]);

  return (
    <div
      className={cn(
        "fixed top-4 right-4 z-50 flex items-center p-4 rounded-lg shadow-lg transition-all duration-300 transform",
        type === 'success' 
          ? "bg-green-500 text-white" 
          : type === 'error' 
          ? "bg-red-500 text-white" 
          : "bg-blue-500 text-white",
        isVisible ? "translate-x-0 opacity-100" : "translate-x-full opacity-0"
      )}
    >
      <CheckCircle className="h-5 w-5 mr-3 flex-shrink-0" />
      <span className="mr-3">{message}</span>
      <button
        onClick={() => {
          setIsVisible(false);
          setTimeout(onClose, 300);
        }}
        className="p-1 hover:bg-white/20 rounded transition-colors"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
};

export const useToast = () => {
  const [toasts, setToasts] = useState([]);

  const addToast = (message, type = 'success') => {
    const id = Date.now();
    const newToast = { id, message, type };
    
    setToasts(prev => [...prev, newToast]);
    
    // Auto remove after duration
    setTimeout(() => {
      removeToast(id);
    }, 3000);
  };

  const removeToast = (id) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  };

  const ToastContainer = () => {
    if (toasts.length === 0) return null;

    return (
      <div className="fixed top-4 right-4 z-50 space-y-2">
        {toasts.map(toast => (
          <Toast
            key={toast.id}
            message={toast.message}
            type={toast.type}
            onClose={() => removeToast(toast.id)}
          />
        ))}
      </div>
    );
  };

  return { addToast, ToastContainer };
};

export default Toast;
