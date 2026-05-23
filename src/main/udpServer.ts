import dgram from 'node:dgram';
import { EventEmitter } from 'node:events';
import type { ListenerStatus, TelemetryData } from '@shared/telemetry';
import { FH6_PACKET_SIZE, parseForzaPacket } from './packetParser';

export interface UdpServerEvents {
  packet: (data: TelemetryData) => void;
  status: (status: ListenerStatus) => void;
}

/**
 * Listens for FH6 UDP "Data Out" packets on a configurable port.
 *
 * The game can send anywhere from 30 to 240 packets/second depending on its
 * frame rate, so this class is deliberately minimal: receive bytes, parse,
 * emit. Heavier work (graph buffers, downsampling) happens in the renderer.
 *
 * Packets that are not 324 bytes are silently dropped, since unsolicited UDP
 * noise from other apps on the same port should not crash anything.
 */
export class ForzaUdpServer extends EventEmitter {
  private socket: dgram.Socket | null = null;
  private status: ListenerStatus;
  /** Last time we emitted a status update due to a packet arrival. */
  private lastStatusEmitMs = 0;
  /** Minimum ms between status emits on the packet path. */
  private static readonly STATUS_EMIT_INTERVAL_MS = 200;

  constructor(port: number) {
    super();
    this.status = {
      listening: false,
      port,
      packetsReceived: 0,
      lastPacketAt: null,
      error: null,
    };
  }

  start(): Promise<ListenerStatus> {
    return new Promise((resolve, reject) => {
      this.stop();

      const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });

      sock.on('message', (msg) => {
        // Forza always sends 324-byte packets in FH6's fixed format.
        if (msg.length !== FH6_PACKET_SIZE) {
          return;
        }
        const data = parseForzaPacket(msg as Buffer, Date.now());
        if (!data) return;

        this.status.packetsReceived += 1;
        this.status.lastPacketAt = data.receivedAt;
        this.emit('packet', data);

        // Throttle status emits: at 60-240 Hz, emitting every packet would
        // spam IPC. ~5 Hz is fast enough that the LIVE indicator and packet
        // counter feel responsive, but cheap.
        const nowMs = Date.now();
        if (nowMs - this.lastStatusEmitMs >= ForzaUdpServer.STATUS_EMIT_INTERVAL_MS) {
          this.lastStatusEmitMs = nowMs;
          this.emit('status', { ...this.status });
        }
      });

      sock.on('error', (err) => {
        this.status.error = err.message;
        this.status.listening = false;
        this.emit('status', { ...this.status });
        try {
          sock.close();
        } catch {
          // ignore - the socket might already be closed
        }
        if (this.socket === sock) {
          this.socket = null;
          reject(err);
        }
      });

      sock.on('listening', () => {
        const addr = sock.address();
        this.status = {
          listening: true,
          port: addr.port,
          packetsReceived: 0,
          lastPacketAt: null,
          error: null,
        };
        this.emit('status', { ...this.status });
        resolve({ ...this.status });
      });

      // Bind to 0.0.0.0 so packets sent from Xbox/another PC over the LAN
      // and from the local game (127.0.0.1) both arrive on the same socket.
      try {
        sock.bind(this.status.port, '0.0.0.0');
        this.socket = sock;
      } catch (err) {
        reject(err);
      }
    });
  }

  stop(): void {
    if (this.socket) {
      try {
        this.socket.close();
      } catch {
        // ignore - close errors on an already-closed socket are harmless
      }
      this.socket = null;
    }
    if (this.status.listening) {
      this.status = { ...this.status, listening: false };
      this.emit('status', { ...this.status });
    }
  }

  /**
   * Restart on a new port. Useful when settings change while running.
   * Returns the resulting status (which includes any error message on failure).
   */
  async restart(port: number): Promise<ListenerStatus> {
    this.status = { ...this.status, port, error: null };
    try {
      return await this.start();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.status = {
        ...this.status,
        listening: false,
        error: message,
      };
      this.emit('status', { ...this.status });
      return { ...this.status };
    }
  }

  getStatus(): ListenerStatus {
    return { ...this.status };
  }
}
