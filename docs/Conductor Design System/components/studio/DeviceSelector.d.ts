import type { CSSProperties } from 'react';

/** Device picker above the mirror. Serial is mono; connection state is a dot, never a word. */
export interface DeviceSelectorProps {
  /** adb serial or emulator name, e.g. "R9QYC01EMXL". */
  device: string;
  platform?: 'Android' | 'iOS';
  state?: 'connected' | 'offline' | 'running';
  onClick?: () => void;
  style?: CSSProperties;
}

export declare function DeviceSelector(props: DeviceSelectorProps): JSX.Element;
