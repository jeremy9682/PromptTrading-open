import React from 'react';
import { IDockviewPanelProps } from 'dockview';
import { Construction } from 'lucide-react';

interface PlaceholderWidgetProps extends IDockviewPanelProps {
  params: {
    widgetType?: string;
    title?: string;
    icon?: string;
  };
}

export const PlaceholderWidget: React.FC<PlaceholderWidgetProps> = ({ params }) => {
  return (
    <div className="h-full flex flex-col items-center justify-center bg-gray-900 text-gray-500 p-4">
      <div className="text-4xl mb-3">{params?.icon || '🔧'}</div>
      <Construction size={32} className="mb-3 opacity-50" />
      <h3 className="text-sm font-medium text-white mb-1">
        {params?.title || params?.widgetType || 'Widget'}
      </h3>
      <p className="text-xs text-center">
        This widget is under development
      </p>
    </div>
  );
};

export default PlaceholderWidget;
