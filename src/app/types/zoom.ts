export interface ZoomKeyframe {
  id: string;
  startTime: number; // segundo donde inicia el zoom
  endTime: number; // segundo donde termina
  x: number; // centro X del zoom (0-1, relativo al video)
  y: number; // centro Y del zoom (0-1, relativo al video)
  scale: number; // nivel de zoom (1.5x, 2x, 3x)
  reason?: string; // descripción de por qué se sugirió el zoom
}

export interface AnalyzeZoomRequest {
  frames: {
    timestamp: number; // segundo del frame
    data: string; // base64 del frame (JPEG)
  }[];
  videoDuration: number;
  videoWidth: number;
  videoHeight: number;
}

export interface AnalyzeZoomResponse {
  keyframes: ZoomKeyframe[];
}
