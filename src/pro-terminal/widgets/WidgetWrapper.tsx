import React from 'react';
import { IDockviewPanelProps } from 'dockview';
import { Plus, Maximize2, X } from 'lucide-react';

interface WidgetWrapperProps extends IDockviewPanelProps {
  children: React.ReactNode;
  onAddToContext?: () => void;
  showContextButton?: boolean;
}

export const WidgetWrapper: React.FC<WidgetWrapperProps> = ({
  children,
  onAddToContext,
  showContextButton = true,
  api,
  containerApi,
}) => {
  return (
    <div className="h-full flex flex-col bg-gray-900 text-white overflow-hidden">
      {/* Content */}
      <div className="flex-1 overflow-auto">
        {children}
      </div>
    </div>
  );
};

export default WidgetWrapper;
