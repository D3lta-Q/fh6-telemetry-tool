import { useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useTrackStore } from '../../store/trackStore';

/**
 * A simple procedural top-down car silhouette built from Three.js box meshes.
 * The car is oriented in the XZ plane (Y = up) to match Forza's coordinate system.
 *
 * The component reads its position and orientation from the track store every
 * animation frame without triggering a React re-render.
 */
export function CarModel({ playbackFrame }: { playbackFrame?: { x: number; y: number; z: number; yaw: number; pitch: number; roll: number } | null }) {
  const groupRef = useRef<THREE.Group>(null!);

  useFrame(() => {
    const group = groupRef.current;
    if (!group) return;

    const frame = playbackFrame !== undefined
      ? playbackFrame
      : useTrackStore.getState().liveFrame; // safe: getState() is non-reactive

    if (!frame) return;

    group.position.set(frame.x, frame.y + 0.5, frame.z);
    // Forza's yaw=0 faces along the X axis; Three.js model forward is +Z.
    // Subtract π/2 to rotate the model so its +Z aligns with Forza's heading.
    group.rotation.order = 'YXZ';
    group.rotation.y = -frame.yaw + Math.PI;
    group.rotation.x = frame.pitch;
    group.rotation.z = -frame.roll;
  });

  return (
    <group ref={groupRef}>
      {/* Body */}
      <mesh position={[0, 0.35, 0]}>
        <boxGeometry args={[2.0, 0.7, 4.5]} />
        <meshStandardMaterial color="#00d4ff" roughness={0.4} metalness={0.6} />
      </mesh>
      {/* Cabin */}
      <mesh position={[0, 0.95, 0.1]}>
        <boxGeometry args={[1.7, 0.65, 2.2]} />
        <meshStandardMaterial color="#0a9bb5" roughness={0.3} metalness={0.5} />
      </mesh>
      {/* Windshield tint */}
      <mesh position={[0, 0.9, 1.15]} rotation={[0.25, 0, 0]}>
        <boxGeometry args={[1.6, 0.55, 0.08]} />
        <meshStandardMaterial color="#1a2030" roughness={0.1} metalness={0.1} opacity={0.7} transparent />
      </mesh>
      {/* Headlights (front = +Z) — bright white */}
      {([-0.7, 0.7] as number[]).map((x, i) => (
        <mesh key={`hl-${i}`} position={[x, 0.35, 2.26]}>
          <boxGeometry args={[0.4, 0.18, 0.05]} />
          <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={1.5} />
        </mesh>
      ))}
      {/* Taillights (rear = -Z) — red */}
      {([-0.7, 0.7] as number[]).map((x, i) => (
        <mesh key={`tl-${i}`} position={[x, 0.35, -2.26]}>
          <boxGeometry args={[0.4, 0.18, 0.05]} />
          <meshStandardMaterial color="#ff2020" emissive="#ff2020" emissiveIntensity={1.2} />
        </mesh>
      ))}
      {/* Wheels — FL, FR, RL, RR */}
      {([[-1.05, 0, 1.5], [1.05, 0, 1.5], [-1.05, 0, -1.5], [1.05, 0, -1.5]] as [number, number, number][]).map(([wx, wy, wz], i) => (
        <mesh key={i} position={[wx, wy, wz]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.35, 0.35, 0.25, 16]} />
          <meshStandardMaterial color="#1a1a1a" roughness={0.9} />
        </mesh>
      ))}
    </group>
  );
}
