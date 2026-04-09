import React, { useCallback, useEffect, useRef } from 'react';
import {
  DockviewReact,
  DockviewReadyEvent,
  IDockviewPanelProps,
  DockviewApi,
  AddPanelOptions,
} from 'dockview';
import 'dockview/dist/styles/dockview.css';
import './dockview-theme.css';
import { WIDGET_COMPONENTS } from '../widgets';
import { LAYOUT_PRESETS } from './layoutPresets';
import { PanelConfig } from './types';

interface DockviewLayoutProps {
  layoutId: string;
  language?: string;
  onLayoutChange?: (api: DockviewApi) => void;
}

// Wrapper component for each panel
const PanelWrapper: React.FC<IDockviewPanelProps> = (props) => {
  const componentType = props.params?.component as string;
  const Component = WIDGET_COMPONENTS[componentType];

  if (!Component) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-900 text-gray-500">
        <span>Unknown widget: {componentType}</span>
      </div>
    );
  }

  return <Component {...props} />;
};

// Component mapping for Dockview
const components = {
  panel: PanelWrapper,
};

export const DockviewLayout: React.FC<DockviewLayoutProps> = ({
  layoutId,
  language = 'en',
  onLayoutChange,
}) => {
  const apiRef = useRef<DockviewApi | null>(null);
  const currentLayoutRef = useRef<string>(layoutId);

  // Load a layout preset into Dockview
  const loadLayoutPreset = useCallback((api: DockviewApi, presetId: string) => {
    const preset = LAYOUT_PRESETS[presetId];
    if (!preset) {
      console.warn(`Layout preset "${presetId}" not found`);
      return;
    }

    // Clear existing panels
    api.panels.forEach((panel) => {
      panel.api.close();
    });

    // Add panels from preset
    preset.panels.forEach((panelConfig: PanelConfig, index: number) => {
      const options: AddPanelOptions = {
        id: panelConfig.id,
        component: 'panel',
        title: panelConfig.title,
        params: {
          component: panelConfig.component,
          ...panelConfig.params,
        },
      };

      // Set position relative to reference panel
      if (panelConfig.position?.referencePanel && index > 0) {
        const referencePanel = api.getPanel(panelConfig.position.referencePanel);
        if (referencePanel) {
          options.position = {
            referencePanel: referencePanel,
            direction: panelConfig.position.direction || 'right',
          };
        }
      }

      // Set relative size
      if (panelConfig.size) {
        options.initialWidth = panelConfig.size;
      }

      api.addPanel(options);
    });
  }, []);

  // Handle Dockview ready event
  const onReady = useCallback(
    (event: DockviewReadyEvent) => {
      apiRef.current = event.api;
      currentLayoutRef.current = layoutId;

      // Load initial layout
      loadLayoutPreset(event.api, layoutId);

      // Notify parent of layout changes
      if (onLayoutChange) {
        onLayoutChange(event.api);
      }

      // Subscribe to layout changes for potential save functionality
      event.api.onDidLayoutChange(() => {
        // Could trigger auto-save here
      });
    },
    [layoutId, loadLayoutPreset, onLayoutChange]
  );

  // Handle layout changes from props
  useEffect(() => {
    if (apiRef.current && layoutId !== currentLayoutRef.current) {
      currentLayoutRef.current = layoutId;
      loadLayoutPreset(apiRef.current, layoutId);
    }
  }, [layoutId, loadLayoutPreset]);

  return (
    <div className="h-full w-full dockview-theme-dark">
      <DockviewReact
        components={components}
        onReady={onReady}
        className="dockview-theme-abyss"
        watermarkComponent={() => null}
      />
    </div>
  );
};

export default DockviewLayout;
