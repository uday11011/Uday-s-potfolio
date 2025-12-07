import React, { useRef, useState, useEffect, useMemo, useCallback } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Text, Environment, ContactShadows, Float, Stars, Cloud } from '@react-three/drei';
import * as THREE from 'three';
import { AppSection } from '../types';

// --- AUDIO SYSTEM (Web Audio API) ---

class SoundManager {
  ctx: AudioContext | null = null;
  engineOsc: OscillatorNode | null = null;
  engineGain: GainNode | null = null;
  isInit = false;

  init() {
    if (this.isInit) return;
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    this.ctx = new AudioContextClass();
    
    // Engine Sound Setup (Sawtooth with LowPass)
    this.engineOsc = this.ctx.createOscillator();
    this.engineGain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();
    
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 60;
    
    filter.type = 'lowpass';
    filter.frequency.value = 400;

    this.engineGain.gain.value = 0;

    this.engineOsc.connect(filter);
    filter.connect(this.engineGain);
    this.engineGain.connect(this.ctx.destination);
    
    this.engineOsc.start();
    this.isInit = true;
  }

  updateEngine(speed: number) {
    if (!this.ctx || !this.engineOsc || !this.engineGain) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();

    // Base pitch 60Hz, increases with speed
    // Speed ranges roughly 0 to 40
    const pitch = 60 + (speed * 5); 
    const volume = Math.min(0.1 + (speed * 0.01), 0.3);

    this.engineOsc.frequency.setTargetAtTime(pitch, this.ctx.currentTime, 0.1);
    this.engineGain.gain.setTargetAtTime(speed > 0.1 ? volume : 0, this.ctx.currentTime, 0.1);
  }

  playImpact(strength: number) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    // White noise approximation using random frequency modulation
    osc.type = 'triangle'; 
    // Randomize frequency for "crash" noise texture
    osc.frequency.setValueAtTime(100 + Math.random() * 200, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(40, this.ctx.currentTime + 0.3);

    gain.gain.setValueAtTime(Math.min(strength * 0.5, 0.8), this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.3);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.3);
  }
}

const soundManager = new SoundManager();

// --- INTERFACES ---

interface WorldProps {
  onSectionEnter: (section: AppSection) => void;
  isOverlayOpen: boolean;
}

// --- CONTROLLER ---

// Exposing refs for collision system
type CarApi = {
  position: React.MutableRefObject<THREE.Vector3>;
  velocity: React.MutableRefObject<THREE.Vector3>;
  radius: number;
  isBraking: React.MutableRefObject<boolean>;
};

const useCarController = (): { api: CarApi; rotation: number } => {
  const position = useRef(new THREE.Vector3(0, 0.5, 0));
  const velocity = useRef(new THREE.Vector3(0, 0, 0));
  const isBraking = useRef(false);
  const [rotation, setRotation] = useState(0);
  const keys = useRef<{ [key: string]: boolean }>({});

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      keys.current[e.code] = true;
      // Init audio on first interaction
      soundManager.init();
    };
    const onKeyUp = (e: KeyboardEvent) => (keys.current[e.code] = false);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  useFrame((_, delta) => {
    // Reset Logic
    if (keys.current['KeyR']) {
      velocity.current.set(0, 0, 0);
      position.current.set(0, 0.5, 0);
      setRotation(0);
      return;
    }

    // Physics Constants
    const isShiftPressed = keys.current['ShiftLeft'] || keys.current['ShiftRight'];
    const fwdSpeed = isShiftPressed ? 80 : 40; // Forward acceleration
    const revSpeed = 30; // Reverse acceleration
    const friction = 0.97; // 0.97 means 3% speed loss per frame (at 60fps)

    const rotSpeed = 3.0 * delta;

    let throttle = 0; // -1 to 1

    // Input handling
    if (keys.current['ArrowUp'] || keys.current['KeyW']) {
      throttle += 1;
    }
    if (keys.current['ArrowDown'] || keys.current['KeyS']) {
      throttle -= 1;
    }

    // Steering
    if (keys.current['ArrowLeft'] || keys.current['KeyA']) {
      setRotation((r) => r + rotSpeed);
    }
    if (keys.current['ArrowRight'] || keys.current['KeyD']) {
      setRotation((r) => r - rotSpeed);
    }

    // Apply Throttle
    // We calculate acceleration vector based on car rotation
    // cos(rot) is Z (Forward/Back), sin(rot) is X (Right/Left)
    // Note: In 3JS, "Forward" usually -Z if rot=0.
    
    // Check direction
    const accAmount = throttle > 0 ? fwdSpeed : revSpeed;
    
    if (throttle !== 0) {
      // If throttle is positive (Forward), we subtract from Z (move "North")
      // If throttle is negative (Backward), we add to Z (move "South")
      // Formula: -1 * throttle * acc
      
      const dirX = Math.sin(rotation);
      const dirZ = Math.cos(rotation);
      
      // If throttle 1 (Up): X -= sin * acc, Z -= cos * acc (Move Fwd)
      // If throttle -1 (Down): X += sin * acc, Z += cos * acc (Move Back)
      
      velocity.current.x -= dirX * throttle * accAmount * delta;
      velocity.current.z -= dirZ * throttle * accAmount * delta;
    }

    // Brake light logic
    isBraking.current = throttle < 0;

    // Apply Velocity to Position
    const newPos = position.current.clone().add(velocity.current.clone().multiplyScalar(delta));
    
    // Bounds Check
    const bound = 95;
    if (Math.abs(newPos.x) > bound) {
      newPos.x = Math.sign(newPos.x) * bound;
      velocity.current.x *= -0.5; // Bounce
    } 
    if (Math.abs(newPos.z) > bound) {
      newPos.z = Math.sign(newPos.z) * bound;
      velocity.current.z *= -0.5;
    }
    
    position.current.copy(newPos);

    // Friction
    velocity.current.multiplyScalar(friction);

    // Audio Update
    const currentSpeed = velocity.current.length();
    soundManager.updateEngine(currentSpeed);
  });

  // Increased radius for wider car
  const api = useMemo(() => ({ position, velocity, isBraking, radius: 2.0 }), []);

  return { api, rotation };
};

// --- COMPONENTS ---

const Car: React.FC<{ api: CarApi; rotation: number }> = ({ api, rotation }) => {
  const groupRef = useRef<THREE.Group>(null);
  
  // Wheel Refs for animation
  const flWheel = useRef<THREE.Mesh>(null);
  const frWheel = useRef<THREE.Mesh>(null);
  const rlWheel = useRef<THREE.Mesh>(null);
  const rrWheel = useRef<THREE.Mesh>(null);
  
  // Taillights Ref
  const tailLightRef = useRef<THREE.MeshStandardMaterial>(null);

  useFrame((_, delta) => {
    if (groupRef.current) {
      // Smooth position update
      groupRef.current.position.copy(api.position.current);
      groupRef.current.rotation.y = rotation;
    }

    // Wheel Spin Calculation
    // Project velocity onto forward vector to get "forward speed" vs "slide speed"
    // But for visual simple spin: length * sign(dot(vel, forward))
    const vel = api.velocity.current;
    // Car forward vector
    const fwd = new THREE.Vector3(-Math.sin(rotation), 0, -Math.cos(rotation));
    const speed = vel.dot(fwd); // Positive = moving fwd, Negative = moving back
    
    const wheelRot = speed * delta * 2.5; // Multiplier for visual effect

    if (flWheel.current) flWheel.current.rotation.x -= wheelRot;
    if (frWheel.current) frWheel.current.rotation.x -= wheelRot;
    if (rlWheel.current) rlWheel.current.rotation.x -= wheelRot;
    if (rrWheel.current) rrWheel.current.rotation.x -= wheelRot;

    // Brake Lights
    if (tailLightRef.current) {
      // If braking (pressing Down) OR reversing?
      // Actually usually brake lights are on when pressing brake pedal.
      // In our arcade logic, pressing Down is "Reverse/Brake".
      if (api.isBraking.current) {
        tailLightRef.current.emissiveIntensity = 4;
        tailLightRef.current.color.setHex(0xff0000);
      } else {
        tailLightRef.current.emissiveIntensity = 1;
        tailLightRef.current.color.setHex(0x550000);
      }
    }
  });

  const carColor = "#ef4444"; // Racing Red
  const glassColor = "#111827";

  return (
    <group ref={groupRef}>
      {/* --- GT3 BODYWORK --- */}
      
      {/* Main Chassis */}
      <mesh castShadow position={[0, 0.4, 0]}>
        <boxGeometry args={[1.9, 0.5, 4.2]} />
        <meshStandardMaterial color={carColor} roughness={0.3} metalness={0.6} />
      </mesh>

      {/* Front Hood Slope */}
      <mesh castShadow position={[0, 0.5, -1.2]} rotation={[0.1, 0, 0]}>
         <boxGeometry args={[1.7, 0.4, 1.5]} />
         <meshStandardMaterial color={carColor} roughness={0.3} metalness={0.6} />
      </mesh>

      {/* Cabin */}
      <mesh castShadow position={[0, 0.95, 0.2]}>
        <boxGeometry args={[1.4, 0.7, 2.0]} />
        <meshStandardMaterial color={glassColor} roughness={0.1} metalness={0.9} />
      </mesh>

      {/* Rear Engine Cover */}
      <mesh castShadow position={[0, 0.7, 1.5]}>
         <boxGeometry args={[1.8, 0.3, 1.2]} />
         <meshStandardMaterial color={carColor} roughness={0.3} metalness={0.6} />
      </mesh>

      {/* --- AERODYNAMICS --- */}

      {/* Large Rear Wing */}
      <group position={[0, 1.4, 1.9]}>
        <mesh castShadow>
          <boxGeometry args={[2.2, 0.1, 0.6]} />
          <meshStandardMaterial color={carColor} roughness={0.5} />
        </mesh>
        <mesh position={[-0.6, -0.4, 0.1]}>
           <boxGeometry args={[0.1, 0.8, 0.05]} />
           <meshStandardMaterial color="#333" />
        </mesh>
        <mesh position={[0.6, -0.4, 0.1]}>
           <boxGeometry args={[0.1, 0.8, 0.05]} />
           <meshStandardMaterial color="#333" />
        </mesh>
         <mesh position={[1.1, 0, 0]}>
           <boxGeometry args={[0.05, 0.4, 0.6]} />
           <meshStandardMaterial color={carColor} />
        </mesh>
        <mesh position={[-1.1, 0, 0]}>
           <boxGeometry args={[0.05, 0.4, 0.6]} />
           <meshStandardMaterial color={carColor} />
        </mesh>
      </group>

      {/* Front Splitter */}
      <mesh position={[0, 0.2, -2.0]}>
        <boxGeometry args={[1.9, 0.1, 0.3]} />
        <meshStandardMaterial color="#111" />
      </mesh>

      {/* --- WHEELS (Wider Racing Slicks with Animation) --- */}
      {/* Note: Rotation order YXZ ensures Y handles steering (not implemented yet visually) and X handles spin */}
      
      <mesh ref={flWheel} position={[-0.95, 0.35, -1.3]} rotation={[0, 0, 0]}>
        <cylinderGeometry args={[0.35, 0.35, 0.4, 24]} />
        <meshStandardMaterial color="#111" roughness={0.8} />
        {/* Rim Detail */}
        <mesh position={[0, -0.21, 0]} rotation={[Math.PI/2, 0, 0]}>
           <cylinderGeometry args={[0.2, 0.2, 0.05, 6]} />
           <meshStandardMaterial color="#888" metalness={0.8} />
        </mesh>
        {/* We need to correct orientation because cylinder default is Y-up */}
        {/* To make it roll on X axis, we wrap it in group or adjust rotation logic carefully. */}
        {/* Current setup: Cylinder is vertical. We need it horizontal (Z axis of wheel). */}
        {/* Let's adjust geometry orientation: Rotate PI/2 on Z */}
      </mesh>
      {/* Re-doing wheels with correct axis for rotation */}
      <group position={[-0.95, 0.35, -1.3]}>
         <group ref={flWheel}>
             <mesh rotation={[0, 0, Math.PI/2]}>
                <cylinderGeometry args={[0.35, 0.35, 0.4, 24]} />
                <meshStandardMaterial color="#111" roughness={0.8} />
                <mesh position={[0, 0.21, 0]}>
                  <cylinderGeometry args={[0.2, 0.2, 0.02, 6]} />
                  <meshStandardMaterial color="#666" />
                </mesh>
             </mesh>
         </group>
      </group>

      <group position={[0.95, 0.35, -1.3]}>
         <group ref={frWheel}>
             <mesh rotation={[0, 0, Math.PI/2]}>
                <cylinderGeometry args={[0.35, 0.35, 0.4, 24]} />
                <meshStandardMaterial color="#111" roughness={0.8} />
                <mesh position={[0, 0.21, 0]}>
                  <cylinderGeometry args={[0.2, 0.2, 0.02, 6]} />
                  <meshStandardMaterial color="#666" />
                </mesh>
             </mesh>
         </group>
      </group>

      <group position={[-0.95, 0.38, 1.3]}>
         <group ref={rlWheel}>
             <mesh rotation={[0, 0, Math.PI/2]}>
                <cylinderGeometry args={[0.38, 0.38, 0.45, 24]} />
                <meshStandardMaterial color="#111" roughness={0.8} />
                 <mesh position={[0, 0.23, 0]}>
                  <cylinderGeometry args={[0.22, 0.22, 0.02, 6]} />
                  <meshStandardMaterial color="#666" />
                </mesh>
             </mesh>
         </group>
      </group>

      <group position={[0.95, 0.38, 1.3]}>
         <group ref={rrWheel}>
             <mesh rotation={[0, 0, Math.PI/2]}>
                <cylinderGeometry args={[0.38, 0.38, 0.45, 24]} />
                <meshStandardMaterial color="#111" roughness={0.8} />
                <mesh position={[0, 0.23, 0]}>
                  <cylinderGeometry args={[0.22, 0.22, 0.02, 6]} />
                  <meshStandardMaterial color="#666" />
                </mesh>
             </mesh>
         </group>
      </group>


      {/* Lights */}
      {/* Headlights */}
      <mesh position={[-0.6, 0.6, -2.05]} rotation={[0.2, 0, 0]}>
        <circleGeometry args={[0.15]} />
        <meshBasicMaterial color="#fff" />
      </mesh>
      <mesh position={[0.6, 0.6, -2.05]} rotation={[0.2, 0, 0]}>
        <circleGeometry args={[0.15]} />
        <meshBasicMaterial color="#fff" />
      </mesh>
      
      <spotLight position={[0, 1, -1]} angle={0.5} penumbra={0.5} intensity={5} castShadow distance={25} color="#fff" target-position={[0, 0, -10]} />
      
      {/* Taillights */}
      <mesh position={[0, 0.7, 2.15]}>
         <boxGeometry args={[1.6, 0.1, 0.1]} />
         <meshStandardMaterial ref={tailLightRef} color="#550000" emissive="#550000" emissiveIntensity={1} />
      </mesh>
    </group>
  );
};

const Floor = () => (
  <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
    <planeGeometry args={[200, 200]} />
    {/* Grass Green Color */}
    <meshStandardMaterial color="#5da642" roughness={1} />
  </mesh>
);

const Tree: React.FC<{ position: [number, number, number], scale?: number }> = ({ position, scale = 1 }) => (
  <group position={position} scale={scale}>
    <mesh position={[0, 0.5, 0]} castShadow>
      <cylinderGeometry args={[0.2, 0.4, 1, 8]} />
      <meshStandardMaterial color="#5d4037" />
    </mesh>
    <mesh position={[0, 1.75, 0]} castShadow>
      <coneGeometry args={[1.2, 2.5, 8]} />
      <meshStandardMaterial color="#15803d" />
    </mesh>
    <mesh position={[0, 2.75, 0]} castShadow>
      <coneGeometry args={[0.9, 2, 8]} />
      <meshStandardMaterial color="#22c55e" />
    </mesh>
  </group>
);

// --- DESTRUCTIBLE CRATE SYSTEM ---

interface CrateData {
  id: number;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  rotation: THREE.Euler;
  color: string;
}

const CrateSystem: React.FC<{ carApi: CarApi }> = ({ carApi }) => {
  const meshRefs = useRef<THREE.Mesh[]>([]);
  
  // Initialize crates logic state
  const crates = useRef<CrateData[]>([]);
  const initiated = useRef(false);

  if (!initiated.current) {
    initiated.current = true;
    // Create a wall of crates and some scattered ones
    const colors = ['#facc15', '#fbbf24', '#f59e0b', '#d97706'];
    
    // Wall
    for (let x = -5; x <= 5; x++) {
      for (let y = 0; y < 3; y++) {
        crates.current.push({
          id: Math.random(),
          position: new THREE.Vector3(x * 1.5 - 20, 0.5 + y * 1.1, 15), // Near project area
          velocity: new THREE.Vector3(0, 0, 0),
          rotation: new THREE.Euler(0, 0, 0),
          color: colors[Math.floor(Math.random() * colors.length)]
        });
      }
    }
    
    // Random piles
    for(let i=0; i<15; i++) {
        crates.current.push({
          id: Math.random(),
          position: new THREE.Vector3((Math.random() - 0.5) * 60, 0.5, (Math.random() - 0.5) * 60 + 20),
          velocity: new THREE.Vector3(0, 0, 0),
          rotation: new THREE.Euler(0, Math.random() * Math.PI, 0),
          color: colors[Math.floor(Math.random() * colors.length)]
        });
    }
  }

  useFrame((_, delta) => {
    // Physics Sub-step
    const carPos = carApi.position.current;
    const carVel = carApi.velocity.current;

    crates.current.forEach((crate, i) => {
      const mesh = meshRefs.current[i];
      if (!mesh) return;

      // 1. Apply Physics to Crate
      // Gravity
      if (crate.position.y > 0.5) {
        crate.velocity.y -= 20 * delta;
      } else {
        crate.velocity.y = 0;
        crate.position.y = 0.5;
        // Ground friction
        crate.velocity.multiplyScalar(0.90);
      }

      crate.position.add(crate.velocity.clone().multiplyScalar(delta));
      
      // Simple rotation based on velocity
      crate.rotation.x += crate.velocity.z * delta * 0.5;
      crate.rotation.z -= crate.velocity.x * delta * 0.5;

      // 2. Collision with Car
      const dist = crate.position.distanceTo(carPos);
      const minDist = carApi.radius + 0.8; // Dynamic based on car size

      if (dist < minDist) {
        // Impact vector
        const direction = new THREE.Vector3().subVectors(crate.position, carPos).normalize();
        
        // Transfer momentum
        const impactForce = carVel.length() * 1.5; // Multiplier for fun
        const forceVec = direction.multiplyScalar(impactForce);
        
        // Add vertical pop
        forceVec.y = Math.min(impactForce * 0.5, 10);

        crate.velocity.add(forceVec);
        
        // Push crate out of car to prevent sticking
        const pushOut = direction.clone().multiplyScalar(minDist - dist);
        crate.position.add(pushOut);

        // Play Sound
        if (impactForce > 5) {
          soundManager.playImpact(impactForce / 20);
        }
      }

      // Update Mesh
      mesh.position.copy(crate.position);
      mesh.rotation.copy(crate.rotation);
    });
  });

  return (
    <group>
      {crates.current.map((crate, i) => (
        <mesh 
          key={crate.id} 
          ref={el => (meshRefs.current[i] = el!)} 
          castShadow 
          receiveShadow
          position={crate.position}
        >
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial color={crate.color} />
          <lineSegments>
            <edgesGeometry args={[new THREE.BoxGeometry(1, 1, 1)]} />
            <lineBasicMaterial color="black" linewidth={2} opacity={0.2} transparent />
          </lineSegments>
        </mesh>
      ))}
    </group>
  );
};

// --- TRIGGERS ---

interface SectionTriggerProps {
  position: [number, number, number];
  text: string;
  subtext?: string;
  color: string;
  carPos: React.MutableRefObject<THREE.Vector3>;
}

const SectionTrigger: React.FC<SectionTriggerProps> = ({ 
  position, 
  text, 
  color, 
  subtext,
  carPos 
}) => {
  const [active, setActive] = useState(false);
  
  useFrame(() => {
    const dist = carPos.current.distanceTo(new THREE.Vector3(...position));
    setActive(dist < 6);
  });
  
  return (
    <group position={position}>
      <Float speed={2} rotationIntensity={0.2} floatIntensity={0.5}>
        {/* RAISED TEXT HEIGHT TO 5.5/4.0 to avoid sinking */}
        <Text
          font="https://fonts.gstatic.com/s/raleway/v14/1Ptrg8zYS_SKggPNwK4vaqI.woff"
          fontSize={2.5}
          color={color}
          position={[0, 5.5, 0]}
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.1}
          outlineColor="white"
        >
          {text}
        </Text>
        {subtext && (
          <Text
            fontSize={1}
            color="#4b5563"
            position={[0, 4.0, 0]}
            anchorX="center"
            anchorY="middle"
            outlineWidth={0.05}
            outlineColor="white"
          >
            {subtext}
          </Text>
        )}
        <mesh castShadow receiveShadow>
          <cylinderGeometry args={[3.5, 3.5, 0.2, 32]} />
          <meshStandardMaterial color={active ? 'white' : color} transparent opacity={0.8} />
        </mesh>
        {/* Glow column */}
        <mesh position={[0, 2, 0]}>
          <cylinderGeometry args={[3, 3, 4, 32]} />
          <meshStandardMaterial color={color} transparent opacity={0.15} />
        </mesh>
      </Float>
      
      {active && (
         <Text
          position={[0, 7.5, 0]}
          fontSize={0.8}
          color="#1f2937"
          backgroundColor="#f3f4f6"
          padding={0.3}
          billboard
         >
           Press ENTER to Open
         </Text>
      )}
    </group>
  );
};

const SceneContent: React.FC<WorldProps> = ({ onSectionEnter, isOverlayOpen }) => {
  const { api: carApi, rotation } = useCarController();
  
  const triggers = useMemo(() => [
    { pos: new THREE.Vector3(0, 0, -25), section: AppSection.ABOUT, text: "About Me", color: "#6366f1", subtext: "The Developer" },
    { pos: new THREE.Vector3(25, 0, 0), section: AppSection.SKILLS, text: "Skills", color: "#10b981", subtext: "Tech Stack" },
    { pos: new THREE.Vector3(0, 0, 25), section: AppSection.CONTACT, text: "Contact", color: "#f59e0b", subtext: "Get in Touch" },
    { pos: new THREE.Vector3(-25, 0, -8), section: AppSection.VEO_STUDIO, text: "Veo Studio", color: "#9333ea", subtext: "Generative Video" },
    { pos: new THREE.Vector3(-25, 0, 8), section: AppSection.IMAGE_EDITOR, text: "Magic Editor", color: "#3b82f6", subtext: "Image Editing" },
  ], []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        const closest = triggers.find(t => t.pos.distanceTo(carApi.position.current) < 6);
        if (closest) {
          onSectionEnter(closest.section);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [carApi, onSectionEnter, triggers]);

  const trees = useMemo(() => {
    const temp = [];
    for (let i = 0; i < 60; i++) {
      const x = (Math.random() - 0.5) * 160;
      const z = (Math.random() - 0.5) * 160;
      if (Math.abs(x) < 15 && Math.abs(z) < 45) continue;
      if (Math.abs(z) < 15 && Math.abs(x) < 45) continue;
      temp.push({ position: [x, 0, z] as [number, number, number], scale: 0.6 + Math.random() * 0.8 });
    }
    return temp;
  }, []);

  return (
    <>
      <ambientLight intensity={0.7} />
      <directionalLight 
        position={[40, 60, 20]} 
        intensity={1.8} 
        castShadow 
        shadow-mapSize={[2048, 2048]} 
        shadow-bias={-0.0001}
      />
      <Environment preset="park" />
      <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />
      
      <Car api={carApi} rotation={rotation} />
      
      {/* Physics Objects */}
      <CrateSystem carApi={carApi} />

      <Floor />

      {trees.map((tree, i) => (
        <Tree key={i} position={tree.position} scale={tree.scale} />
      ))}

      <CameraHandler target={carApi.position} isOverlayOpen={isOverlayOpen} />

      <group position={[0, 0.05, 5]} rotation={[-Math.PI/2, 0, 0]}>
         <Text fontSize={1.5} color="#94a3b8" anchorX="center" position={[0, 0, 0]}>
           Use Arrow Keys to Drive
         </Text>
         <Text fontSize={1} color="#cbd5e1" anchorX="center" position={[0, -2, 0]}>
           Hold SHIFT for Turbo • Press 'R' to Reset
         </Text>
         <Text fontSize={0.8} color="#ef4444" anchorX="center" position={[0, -4, 0]}>
           Smash the crates!
         </Text>
      </group>

      {triggers.map((t, i) => (
        <SectionTrigger 
          key={i}
          position={t.pos.toArray() as [number, number, number]} 
          text={t.text}
          subtext={t.subtext}
          color={t.color} 
          carPos={carApi.position}
        />
      ))}
    </>
  );
};

const CameraHandler = ({ target, isOverlayOpen }: { target: React.MutableRefObject<THREE.Vector3>; isOverlayOpen: boolean }) => {
  const distance = useRef(20);

  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      if (isOverlayOpen) return;
      // Zoom out (increase distance) if deltaY > 0
      distance.current = THREE.MathUtils.clamp(distance.current + e.deltaY * 0.02, 5, 40);
    };
    window.addEventListener('wheel', onWheel);
    return () => window.removeEventListener('wheel', onWheel);
  }, [isOverlayOpen]);

  useFrame((state) => {
    const offsetDistance = distance.current;
    // 45 degree angle: y = z = dist * sin(45)
    // sin(45) approx 0.707
    const y = offsetDistance * 0.707;
    const z = offsetDistance * 0.707;
    
    const offset = new THREE.Vector3(0, y, z);
    const t = target.current;
    const desiredPosition = new THREE.Vector3(t.x, t.y, t.z).add(offset);
    
    state.camera.position.lerp(desiredPosition, 0.1);
    state.camera.lookAt(t.x, t.y, t.z);
  });
  return null;
};

const World: React.FC<WorldProps> = (props) => {
  return (
    <div className="w-full h-screen bg-sky-200">
      <Canvas shadows camera={{ position: [0, 15, 15], fov: 45 }}>
        <fog attach="fog" args={['#e0f2fe', 20, 100]} />
        <SceneContent {...props} />
        <ContactShadows resolution={1024} scale={120} blur={2} opacity={0.4} far={10} color="#0f172a" />
      </Canvas>
      <div className="absolute top-8 left-8 pointer-events-none select-none">
        <h1 className="text-5xl font-black text-slate-800 tracking-tighter drop-shadow-sm">UDAY</h1>
        <p className="text-slate-500 font-medium text-lg">Creative Developer Portfolio</p>
      </div>
      <div className="absolute bottom-8 right-8 pointer-events-none text-right select-none z-10">
        <div className="bg-white/80 backdrop-blur-md p-4 rounded-xl border border-white/50 shadow-lg">
          <p className="text-xs font-bold text-slate-400 mb-2 uppercase tracking-wider">Controls</p>
          <div className="text-sm text-slate-600 space-y-1 font-mono">
            <p>WASD / Arrows to Drive</p>
            <p>SHIFT to Boost</p>
            <p>Scroll to Zoom</p>
            <p>ENTER to Interact</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default World;