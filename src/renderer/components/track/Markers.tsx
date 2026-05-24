import * as THREE from 'three';
import { Html } from '@react-three/drei';
import type { PositionChange } from '@shared/track';

interface MarkersProps {
  positionChanges: PositionChange[];
}

/**
 * Renders a sphere + label at each race-position change point.
 * Green sphere = position gained (moved forward), red sphere = position lost.
 */
export function Markers({ positionChanges }: MarkersProps) {
  return (
    <>
      {positionChanges.map((pc, i) => {
        const gained = pc.to < pc.from; // lower position number = better
        const color = gained ? '#a3ff12' : '#ff3c1c';
        return (
          <group key={i} position={[pc.x, pc.y + 1.5, pc.z]}>
            <mesh>
              <sphereGeometry args={[0.8, 12, 12]} />
              <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.4} />
            </mesh>
            <Html
              center
              distanceFactor={80}
              style={{
                pointerEvents: 'none',
                color,
                fontFamily: 'monospace',
                fontSize: '11px',
                fontWeight: 'bold',
                whiteSpace: 'nowrap',
                textShadow: '0 0 4px #000',
                transform: 'translateY(-24px)',
              }}
            >
              {gained ? '▲' : '▼'} P{pc.to}
            </Html>
          </group>
        );
      })}
    </>
  );
}

/** Lap start/end boundary markers along the path. */
export function LapMarker({ x, y, z, lapNumber }: { x: number; y: number; z: number; lapNumber: number }) {
  return (
    <group position={[x, y + 1, z]}>
      <mesh>
        <cylinderGeometry args={[0.15, 0.15, 3, 8]} />
        <meshStandardMaterial color="#ffd60a" emissive="#ffd60a" emissiveIntensity={0.3} />
      </mesh>
      <Html
        center
        distanceFactor={80}
        style={{
          pointerEvents: 'none',
          color: '#ffd60a',
          fontFamily: 'monospace',
          fontSize: '10px',
          whiteSpace: 'nowrap',
          textShadow: '0 0 4px #000',
          transform: 'translateY(-28px)',
        }}
      >
        LAP {lapNumber}
      </Html>
    </group>
  );
}
