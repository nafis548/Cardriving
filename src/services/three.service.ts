import { Injectable, NgZone } from '@angular/core';
import * as THREE from 'three';
import { createNoise2D } from 'simplex-noise';

@Injectable()
export class ThreeService {
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private renderer!: THREE.WebGLRenderer;
  private car!: THREE.Group;
  private clock = new THREE.Clock();
  private noise2D = createNoise2D();

  private keysPressed: { [key: string]: boolean } = {};
  
  private animationFrameId: number = -1;

  // Car physics properties
  private carSpeed = 0;
  private maxSpeed = 50.0; // Increased max speed
  private maxBoostSpeed = 100.0;
  private acceleration = 15.0;
  private boostAcceleration = 40.0;
  private deceleration = 20.0;
  private turnSpeed = 3.0;
  private braking = 40.0;

  // State for UI
  public speedKph = 0;
  public distanceKm = 0;
  private totalDistance = 0;
  
  // Pre-bind event handlers to fix memory leaks
  private boundHandleKeyDown = this.handleKeyDown.bind(this);
  private boundHandleKeyUp = this.handleKeyUp.bind(this);
  private boundOnWindowResize = this.onWindowResize.bind(this);

  constructor(private ngZone: NgZone) {}

  public init(canvas: HTMLCanvasElement): void {
    const sceneColor = 0xddeeff; // Soft sky blue
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(sceneColor);
    this.scene.fog = new THREE.Fog(sceneColor, 50, 250);

    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.camera.position.set(0, 5, -10);
    this.camera.lookAt(0, 0, 0);

    this.renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;


    this.addLights();
    this.createEnvironment();
    this.createCar();

    this.setupKeyboardListeners();
    this.setupResizeListener();
    
    this.animate();
  }

  private addLights(): void {
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.5);
    this.scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 2.5);
    directionalLight.position.set(-30, 50, 30);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    directionalLight.shadow.camera.top = 50;
    directionalLight.shadow.camera.bottom = -50;
    directionalLight.shadow.camera.left = -50;
    directionalLight.shadow.camera.right = 50;
    this.scene.add(directionalLight);
  }

  private createEnvironment(): void {
    // Grassy plane
    const terrainSize = 500;
    const terrainSegments = 100;
   
    const terrainGeometry = new THREE.PlaneGeometry(terrainSize, terrainSize, terrainSegments, terrainSegments);
    const vertices = terrainGeometry.attributes.position;

    for (let i = 0; i < vertices.count; i++) {
        const x = vertices.getX(i);
        const y = vertices.getY(i);
        const height = this.getHeightAt(x, y, false) * 0.2; // Muted hills on the side
        vertices.setZ(i, height);
    }

    terrainGeometry.computeVertexNormals();
    
    const terrainMaterial = new THREE.MeshStandardMaterial({ color: 0x6B8E23, side: THREE.DoubleSide }); // Olive green
    const terrain = new THREE.Mesh(terrainGeometry, terrainMaterial);
    terrain.rotation.x = -Math.PI / 2;
    terrain.receiveShadow = true;
    this.scene.add(terrain);

    // Road
    const roadWidth = 12;
    const roadLength = terrainSize;
    const roadGeometry = new THREE.PlaneGeometry(roadWidth, roadLength, 1, 1);
    const roadMaterial = new THREE.MeshStandardMaterial({ color: 0x444444 });
    const road = new THREE.Mesh(roadGeometry, roadMaterial);
    road.rotation.x = -Math.PI / 2;
    road.position.y = 0.05; // Slightly above ground to prevent z-fighting
    road.receiveShadow = true;
    this.scene.add(road);

    // Road markings
    const dashLength = 5;
    const dashGap = 5;
    const numDashes = roadLength / (dashLength + dashGap);
    const dashGeometry = new THREE.PlaneGeometry(0.2, dashLength);
    const dashMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
    
    for(let i = 0; i < numDashes; i++) {
        const dash = new THREE.Mesh(dashGeometry, dashMaterial);
        dash.rotation.x = -Math.PI / 2;
        dash.position.y = 0.06;
        dash.position.z = i * (dashLength + dashGap) - roadLength / 2 + dashLength / 2;
        this.scene.add(dash);
    }
  }

  private createCar(): void {
    this.car = new THREE.Group();
    this.car.position.y = 0.5;

    // Car Body
    const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.2, roughness: 0.5 });
    const bodyGeometry = new THREE.BoxGeometry(2, 0.8, 4.5);
    const carBody = new THREE.Mesh(bodyGeometry, bodyMaterial);
    carBody.castShadow = true;
    this.car.add(carBody);

    // Car Cabin
    const cabinMaterial = new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.5, roughness: 0.2 });
    const cabinGeometry = new THREE.BoxGeometry(1.6, 0.7, 2.5);
    const carCabin = new THREE.Mesh(cabinGeometry, cabinMaterial);
    carCabin.position.y = 0.75;
    carCabin.position.z = -0.3;
    carCabin.castShadow = true;
    this.car.add(carCabin);
    
    // Taillights
    const taillightMaterial = new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0x550000 });
    const taillightGeometry = new THREE.BoxGeometry(0.7, 0.3, 0.1);
    const leftLight = new THREE.Mesh(taillightGeometry, taillightMaterial);
    leftLight.position.set(-0.6, 0.2, -2.26);
    this.car.add(leftLight);
    const rightLight = leftLight.clone();
    rightLight.position.x = 0.6;
    this.car.add(rightLight);

    this.scene.add(this.car);
  }

  private setupKeyboardListeners(): void {
    window.addEventListener('keydown', this.boundHandleKeyDown);
    window.addEventListener('keyup', this.boundHandleKeyUp);
  }

  public setKeyPressed(key: string, isPressed: boolean): void {
      this.keysPressed[key] = isPressed;
  }

  private handleKeyDown(event: KeyboardEvent): void {
    this.keysPressed[event.key] = true;
  }

  private handleKeyUp(event: KeyboardEvent): void {
    this.keysPressed[event.key] = false;
  }
  
  private setupResizeListener(): void {
     window.addEventListener('resize', this.boundOnWindowResize);
  }

  private onWindowResize(): void {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  private getHeightAt(x: number, z: number, onRoad: boolean): number {
    if (onRoad) return 0;
    const terrainMaxHeight = 8;
    const terrainNoiseScale = 80;
    return this.noise2D(x / terrainNoiseScale, z / terrainNoiseScale) * terrainMaxHeight;
  }

  private updateCar(delta: number): void {
    const forward = this.keysPressed['ArrowUp'];
    const backward = this.keysPressed['ArrowDown'];
    const left = this.keysPressed['ArrowLeft'];
    const right = this.keysPressed['ArrowRight'];
    const boost = this.keysPressed['Shift'];

    const currentMaxSpeed = boost ? this.maxBoostSpeed : this.maxSpeed;
    const currentAcceleration = boost ? this.boostAcceleration : this.acceleration;

    if (forward) {
      this.carSpeed = Math.min(currentMaxSpeed, this.carSpeed + currentAcceleration * delta);
    } else if (backward) {
      this.carSpeed = Math.max(-this.maxSpeed / 2, this.carSpeed - this.braking * delta);
    } else {
      // Natural deceleration
      if (this.carSpeed > 0) {
        this.carSpeed = Math.max(0, this.carSpeed - this.deceleration * delta);
      } else if (this.carSpeed < 0) {
        this.carSpeed = Math.min(0, this.carSpeed + this.deceleration * delta);
      }
    }

    if (Math.abs(this.carSpeed) > 0.1) {
      const turnFactor = Math.min(1, Math.abs(this.carSpeed) / (this.maxSpeed / 2));
      if (left) {
        this.car.rotation.y += this.turnSpeed * turnFactor * delta;
      }
      if (right) {
        this.car.rotation.y -= this.turnSpeed * turnFactor * delta;
      }
    }

    this.car.translateZ(this.carSpeed * delta);

    // Update UI state
    this.speedKph = Math.abs(this.carSpeed * 3.6);
    this.totalDistance += Math.abs(this.carSpeed * delta) / 1000; // in km
    this.distanceKm = this.totalDistance;

    // Adjust car's height to follow the terrain/road
    const carPosition = this.car.position;
    const roadWidth = 12;
    const onRoad = Math.abs(carPosition.x) < roadWidth / 2;

    const terrainHeight = this.getHeightAt(carPosition.x, carPosition.z, onRoad);
    
    const carBodyHeight = 0.4;
    const targetY = terrainHeight + carBodyHeight;
    
    // Smoothly interpolate to the target Y position to avoid jitter
    this.car.position.y = THREE.MathUtils.lerp(this.car.position.y, targetY, 0.2);
  }

  private updateCamera(): void {
    const cameraOffset = new THREE.Vector3(0, 4, -9);
    cameraOffset.applyQuaternion(this.car.quaternion);
    cameraOffset.add(this.car.position);

    this.camera.position.lerp(cameraOffset, 0.08);
    this.camera.lookAt(this.car.position);
  }

  private animate(): void {
    this.ngZone.runOutsideAngular(() => {
        const loop = () => {
          this.animationFrameId = requestAnimationFrame(loop);
          const delta = this.clock.getDelta();
          this.updateCar(delta);
          this.updateCamera();
          this.renderer.render(this.scene, this.camera);
        };
        loop();
    });
  }

  public cleanup(): void {
    if (this.animationFrameId !== -1) {
        cancelAnimationFrame(this.animationFrameId);
    }
    window.removeEventListener('keydown', this.boundHandleKeyDown);
    window.removeEventListener('keyup', this.boundHandleKeyUp);
    window.removeEventListener('resize', this.boundOnWindowResize);
    
    this.scene.traverse(object => {
        if (object instanceof THREE.Mesh) {
            if (object.geometry) {
                object.geometry.dispose();
            }
            if (object.material) {
                if (Array.isArray(object.material)) {
                    object.material.forEach(material => material.dispose());
                } else {
                    object.material.dispose();
                }
            }
        }
    });
    this.renderer.dispose();
  }
}