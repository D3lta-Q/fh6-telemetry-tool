/**
 * IPC channel names used between the main and renderer processes.
 * Keeping these in one place prevents typo-driven bugs.
 */
export const IPC = {
  /** Main -> Renderer. Pushed every time a packet is parsed. Payload: TelemetryData. */
  TELEMETRY_PACKET: 'telemetry:packet',
  /** Main -> Renderer. Pushed when listener status changes. Payload: ListenerStatus. */
  LISTENER_STATUS: 'listener:status',
  /** Renderer -> Main (invoke). Returns current ListenerStatus. */
  GET_LISTENER_STATUS: 'listener:get-status',
  /** Renderer -> Main (invoke). Returns current AppSettings. */
  GET_SETTINGS: 'settings:get',
  /** Renderer -> Main (invoke). Persists partial AppSettings, returns merged result. */
  SET_SETTINGS: 'settings:set',
  /** Renderer -> Main (invoke). Restarts the listener on a new port. Returns ListenerStatus. */
  RESTART_LISTENER: 'listener:restart',
  /** Renderer -> Main (invoke). Starts a recording session. Returns RecordingStatus. */
  START_RECORDING: 'recording:start',
  /** Renderer -> Main (invoke). Stops recording and opens save dialog. Returns RecordingStatus. */
  STOP_RECORDING: 'recording:stop',
  /** Main -> Renderer. Pushed when recording state changes (start/stop/hotkey). Payload: RecordingStatus. */
  RECORDING_STATUS: 'recording:status',
  /** Renderer -> Main (invoke). Opens save dialog and writes a .fzt file. Payload: FztSession. Returns 'saved' | 'cancelled'. */
  SAVE_TRACK_SESSION: 'track:save',
  /** Renderer -> Main (invoke). Opens a .fzt file via dialog. Returns FztSession or null if cancelled. */
  OPEN_TRACK_SESSION: 'track:open',
  /** Renderer -> Main (invoke). Open a child window for a specific tab. Payload: 'dashboard' | 'track'. */
  POP_OUT_TAB: 'window:pop-out',
  /** Main -> Renderer. Tells a popped-out window which tab it should show. Payload: string. */
  WINDOW_TAB: 'window:tab',
} as const;

export type IpcChannel = (typeof IPC)[keyof typeof IPC];
