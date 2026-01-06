
import { Component, ElementRef, input, effect, OnDestroy, OnInit, viewChild, ChangeDetectionStrategy, NgZone, output } from '@angular/core';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer';
import * as d3 from 'd3';
import { gsap } from 'gsap';

@Component({
  selector: 'app-family-tree',
  template: `
    <div #container class="w-full h-full relative">
      <div #labels class="absolute inset-0 pointer-events-none label-container"></div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'block w-full h-full'
  }
})
export class FamilyTreeComponent implements OnInit, OnDestroy {
  data = input.required<any>();
  search = input<string>('');
  maxGen = input<number>(8);
  autoRotate = input<boolean>(false);
  
  nodeSelected = output<any>();

  container = viewChild<ElementRef>('container');

  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private renderer!: THREE.WebGLRenderer;
  private labelRenderer!: CSS2DRenderer;
  private controls!: OrbitControls;
  private frameId: number | null = null;
  private nodes: THREE.Mesh[] = [];
  private edges: THREE.Line[] = [];
  private labels: CSS2DObject[] = [];
  private resizeObserver?: ResizeObserver;
  private selectedMesh: THREE.Mesh | null = null;
  
  // Particle systems for atmosphere
  private starfield!: THREE.Points;
  private dustMotes!: THREE.Points;

  constructor(private zone: NgZone) {
    effect(() => {
      this.updateHighlight(this.search());
    });

    effect(() => {
      this.updateVisibility(this.maxGen());
    });

    effect(() => {
      const rotate = this.autoRotate();
      if (this.controls) {
        this.controls.autoRotate = rotate;
        this.controls.autoRotateSpeed = 0.5;
      }
    });
  }

  ngOnInit() {
    this.zone.runOutsideAngular(() => {
      const el = this.container()!.nativeElement;
      
      this.resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const { width, height } = entry.contentRect;
          if (width > 0 && height > 0 && !this.scene) {
            this.initThree();
            this.buildTree();
            this.animate();
          } else if (this.scene) {
            this.onResize();
          }
        }
      });
      this.resizeObserver.observe(el);
    });
  }

  ngOnDestroy() {
    if (this.frameId) cancelAnimationFrame(this.frameId);
    this.resizeObserver?.disconnect();
    this.renderer?.dispose();
    this.labelRenderer?.domElement.remove();
  }

  private initThree() {
    const el = this.container()!.nativeElement;
    const width = el.clientWidth;
    const height = el.clientHeight;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x050508);
    this.scene.fog = new THREE.FogExp2(0x050508, 0.0004);

    this.camera = new THREE.PerspectiveCamera(60, width / height, 1, 15000);
    this.camera.position.set(3500, 2000, 3500);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    el.appendChild(this.renderer.domElement);

    this.labelRenderer = new CSS2DRenderer();
    this.labelRenderer.setSize(width, height);
    this.labelRenderer.domElement.style.position = 'absolute';
    this.labelRenderer.domElement.style.top = '0';
    this.labelRenderer.domElement.style.pointerEvents = 'none';
    el.appendChild(this.labelRenderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.04;
    this.controls.maxDistance = 9000;
    this.controls.minDistance = 100;
    this.controls.target.set(0, 400, 0);
    
    this.controls.autoRotate = this.autoRotate();
    this.controls.autoRotateSpeed = 0.4;

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.2);
    this.scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffcc88, 0.8);
    directionalLight.position.set(1, 1, 1).normalize();
    this.scene.add(directionalLight);

    const mainLight = new THREE.PointLight(0x4f46e5, 3, 6000);
    mainLight.position.set(0, 1500, 0);
    this.scene.add(mainLight);

    const accentLight = new THREE.PointLight(0xf43f5e, 1.5, 4500);
    accentLight.position.set(-2500, 1000, -2000);
    this.scene.add(accentLight);

    const originGlow = new THREE.PointLight(0xfbbf24, 2, 2000);
    originGlow.position.set(0, 1800, 0);
    this.scene.add(originGlow);

    this.addAtmosphere();
  }

  private addAtmosphere() {
    const starGeo = new THREE.BufferGeometry();
    const starVerts = [];
    const starColors = [];
    const color = new THREE.Color();

    for (let i = 0; i < 15000; i++) {
      starVerts.push(THREE.MathUtils.randFloatSpread(15000));
      starVerts.push(THREE.MathUtils.randFloatSpread(15000));
      starVerts.push(THREE.MathUtils.randFloatSpread(15000));

      const shade = Math.random() * 0.3 + 0.1;
      color.setRGB(shade, shade, shade + 0.2);
      starColors.push(color.r, color.g, color.b);
    }
    
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starVerts, 3));
    starGeo.setAttribute('color', new THREE.Float32BufferAttribute(starColors, 3));
    
    const starMat = new THREE.PointsMaterial({ 
      size: 1.2, 
      vertexColors: true, 
      transparent: true, 
      opacity: 0.4 
    });
    this.starfield = new THREE.Points(starGeo, starMat);
    this.scene.add(this.starfield);

    const moteGeo = new THREE.BufferGeometry();
    const moteVerts = [];
    for (let i = 0; i < 800; i++) {
      moteVerts.push(THREE.MathUtils.randFloatSpread(4000));
      moteVerts.push(THREE.MathUtils.randFloatSpread(4000) + 500);
      moteVerts.push(THREE.MathUtils.randFloatSpread(4000));
    }
    moteGeo.setAttribute('position', new THREE.Float32BufferAttribute(moteVerts, 3));
    
    const moteMat = new THREE.PointsMaterial({
      size: 8,
      color: 0x818cf8,
      transparent: true,
      opacity: 0.15,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    this.dustMotes = new THREE.Points(moteGeo, moteMat);
    this.scene.add(this.dustMotes);
  }

  private buildTree() {
    const d3Any = d3 as any;
    const root = d3Any.hierarchy(this.data());
    const treeLayout = d3Any.tree().size([2 * Math.PI, 1800]);
    treeLayout(root);

    this.nodes.forEach(n => this.scene.remove(n));
    this.edges.forEach(e => this.scene.remove(e));
    this.nodes = [];
    this.edges = [];
    this.labels = [];

    const generationGap = 450;
    const baseRadius = 250;
    
    root.descendants().forEach((d: any) => {
      const angle = d.x;
      const radius = d.depth * generationGap + baseRadius;
      const yPos = 1800 - (d.depth * generationGap);
      const xPos = Math.cos(angle) * radius;
      const zPos = Math.sin(angle) * radius;

      const pos = new THREE.Vector3(xPos, yPos, zPos);
      d.pos = pos;

      const nodeColor = this.getThreeColor(d);
      const isLarge = !!d.data.children;
      const nodeGeo = new THREE.SphereGeometry(isLarge ? 18 : 10, 32, 32);
      const nodeMat = new THREE.MeshPhongMaterial({ 
        color: nodeColor, 
        emissive: nodeColor, 
        emissiveIntensity: 0.5,
        shininess: 100,
        specular: 0x444444
      });
      const nodeMesh = new THREE.Mesh(nodeGeo, nodeMat);
      nodeMesh.position.copy(pos);
      nodeMesh.userData = { data: d.data, pos: pos, depth: d.depth };
      
      this.scene.add(nodeMesh);
      this.nodes.push(nodeMesh);

      const labelDiv = document.createElement('div');
      labelDiv.className = 'node-label';
      labelDiv.innerHTML = `
        <div class="flex flex-col text-center">
          <span class="text-xs font-bold">${d.data.name}</span>
          ${d.data.type ? `<span class="text-[6px] opacity-50 uppercase tracking-tighter">${d.data.type.replace('_', ' ')}</span>` : ''}
        </div>
      `;

      labelDiv.onclick = (e) => {
        e.stopPropagation();
        this.focusNode(nodeMesh);
        this.nodeSelected.emit(d.data);
      };

      // Hover feedback integration
      labelDiv.onmouseenter = () => this.onNodeHover(nodeMesh);
      labelDiv.onmouseleave = () => this.onNodeHoverExit(nodeMesh);
      
      const label = new CSS2DObject(labelDiv);
      label.position.set(0, 40, 0);
      nodeMesh.add(label);
      (label as any).nodeData = d.data;
      (label as any).depth = d.depth;
      this.labels.push(label);

      if (d.children) {
        d.children.forEach((child: any) => {
          const cAngle = child.x;
          const cRadius = child.depth * generationGap + baseRadius;
          const cy = 1800 - (child.depth * generationGap);
          const cx = Math.cos(cAngle) * cRadius;
          const cz = Math.sin(cAngle) * cRadius;
          const cPos = new THREE.Vector3(cx, cy, cz);
          this.drawEdge(pos, cPos, nodeColor, d.depth, child.depth);
        });
      }
    });

    this.resetZoom();
  }

  private onNodeHover(mesh: THREE.Mesh) {
    if (mesh === this.selectedMesh) return;
    gsap.to(mesh.scale, { x: 1.3, y: 1.3, z: 1.3, duration: 0.4, ease: "back.out(1.7)" });
    gsap.to((mesh.material as THREE.MeshPhongMaterial), { 
      emissiveIntensity: 1.5,
      duration: 0.4 
    });
  }

  private onNodeHoverExit(mesh: THREE.Mesh) {
    if (mesh === this.selectedMesh) return;
    gsap.to(mesh.scale, { x: 1, y: 1, z: 1, duration: 0.4, ease: "power2.inOut" });
    gsap.to((mesh.material as THREE.MeshPhongMaterial), { 
      emissiveIntensity: 0.5,
      duration: 0.4 
    });
  }

  private drawEdge(start: THREE.Vector3, end: THREE.Vector3, color: string, startDepth: number, endDepth: number) {
    const mid = new THREE.Vector3().lerpVectors(start, end, 0.5);
    mid.y += 180; 

    const curve = new THREE.CatmullRomCurve3([start, mid, end]);
    const points = curve.getPoints(50);
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({ 
      color: color, 
      opacity: 0.25, 
      transparent: true,
      linewidth: 1
    });
    const line = new THREE.Line(geometry, material);
    line.userData = { startDepth, endDepth };
    this.scene.add(line);
    this.edges.push(line);
  }

  private getThreeColor(d: any): string {
    const type = d.data.type || '';
    if (type === 'root') return '#fbbf24'; 
    let current = d;
    while (current.parent) {
      if (['sekano_root', 'maternal_root', 'maternal_group'].includes(current.data.type) || current.data.id === 'sekano_root') return '#f43f5e'; 
      if (['monamodi_root', 'paternal_root', 'root_ancestor'].includes(current.data.type) || current.data.id === 'monamodi_root') return '#10b981'; 
      current = current.parent;
    }
    return '#6366f1'; 
  }

  private updateVisibility(maxGen: number) {
    if (!this.nodes.length) return;
    this.nodes.forEach(node => node.visible = node.userData['depth'] <= maxGen);
    this.edges.forEach(edge => edge.visible = edge.userData['endDepth'] <= maxGen);
  }

  public focusNode(mesh: THREE.Mesh) {
    const target = mesh.position.clone();
    const data = mesh.userData['data'];

    if (this.selectedMesh) {
      gsap.to((this.selectedMesh.material as THREE.MeshPhongMaterial), {
        emissiveIntensity: 0.5,
        duration: 0.6
      });
      gsap.to(this.selectedMesh.scale, { x: 1, y: 1, z: 1, duration: 0.6 });
    }

    this.selectedMesh = mesh;

    const direction = target.clone().normalize();
    const isMajorAncestor = !!data.children;
    const viewDistance = isMajorAncestor ? 750 : 500; 
    
    const camTargetPos = target.clone().add(
      new THREE.Vector3(
        direction.x * viewDistance + (Math.random() - 0.5) * 50,
        250, 
        direction.z * viewDistance + (Math.random() - 0.5) * 50
      )
    );

    const tl = gsap.timeline({
      defaults: { duration: 2.6, ease: "expo.inOut", overwrite: 'auto' }
    });

    tl.to(this.camera.position, {
      x: camTargetPos.x,
      y: camTargetPos.y,
      z: camTargetPos.z,
    }, 0);

    tl.to(this.controls.target, {
      x: target.x,
      y: target.y,
      z: target.z,
      onUpdate: () => this.controls.update()
    }, 0);

    tl.to((mesh.material as THREE.MeshPhongMaterial), {
      emissiveIntensity: 3.5,
      duration: 1.0,
      yoyo: true,
      repeat: 1,
      ease: "power2.inOut"
    }, 0.6);

    tl.to(mesh.scale, {
      x: 1.6,
      y: 1.6,
      z: 1.6,
      duration: 1.0,
      yoyo: true,
      repeat: 1,
      ease: "elastic.out(1, 0.3)"
    }, 0.6);

    this.updateHighlight(data.name);
  }

  public resetZoom() {
    if (!this.camera || !this.controls) return;
    
    const timeline = gsap.timeline({
      defaults: { duration: 3.2, ease: "power4.inOut", overwrite: 'auto' }
    });

    timeline.to(this.camera.position, {
      x: 3500,
      y: 2000,
      z: 3500
    });

    timeline.to(this.controls.target, {
      x: 0,
      y: 400,
      z: 0,
      onUpdate: () => this.controls.update()
    }, 0);

    if (this.selectedMesh) {
      gsap.to((this.selectedMesh.material as THREE.MeshPhongMaterial), {
        emissiveIntensity: 0.5,
        duration: 1.5
      });
      gsap.to(this.selectedMesh.scale, { x: 1, y: 1, z: 1, duration: 1.5 });
      this.selectedMesh = null;
    }
  }

  public expandAll() {}
  public collapseAll() {}

  private updateHighlight(term: string) {
    if (!this.labels) return;
    const lowerTerm = term.toLowerCase();
    
    this.labels.forEach((label: any) => {
      const data = label.nodeData;
      const match = term && (
        data.name?.toLowerCase().includes(lowerTerm) || 
        data.spouse?.toLowerCase().includes(lowerTerm) ||
        data.notes?.toLowerCase().includes(lowerTerm)
      );
      
      label.element.classList.toggle('highlighted', !!match);
      if (match && term === data.name) {
         label.element.classList.add('focused-label');
      } else {
         label.element.classList.remove('focused-label');
      }
    });
  }

  private onResize() {
    const el = this.container()!.nativeElement;
    const width = el.clientWidth;
    const height = el.clientHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    this.labelRenderer.setSize(width, height);
  }

  private animate() {
    this.frameId = requestAnimationFrame(() => this.animate());
    
    if (this.starfield) this.starfield.rotation.y += 0.0001;
    if (this.dustMotes) {
      this.dustMotes.rotation.y -= 0.0002;
      this.dustMotes.rotation.x += 0.0001;
    }

    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.labelRenderer.render(this.scene, this.camera);
  }
}
