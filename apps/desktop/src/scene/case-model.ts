import { Box3, Group, Material, Mesh, MeshStandardMaterial, Object3D, PlaneGeometry, Texture, Vector3 } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { assetUrl } from "../lib/asset-url";

export const CASE_MODEL_URL = assetUrl("/models/cd-case.glb");

/** 封面（内页）。 */
const COVER_NODE = "Object_11";
/** 托盘上印着 CD 图形的纸层，会挡住封面。 */
/** 盘片本体。 */
const DISC_NODES = new Set(["Object_13", "Object_14"]);
/** 可翻转的盒盖组。 */
const LID_NODE = "Case Front_0";
/** 盘片组。 */
const CD_NODE = "CD_1";
/** 封面面片相对内页包围盒的缩放；陈列区和交互区共用。 */
const COVER_SIZE_RATIO = 0.92;

export interface BuiltCase {
  readonly cd: Object3D | null;
  readonly lid: Object3D | null;
  /** 盒盖铰链（绕它翻转）。 */
  readonly lidPivot: Group | null;
  readonly root: Group;
  /** 光盘的根空间枢轴；只有 withRig=true 时存在。 */
  readonly discPivot: Group | null;
  /** 盒盖铰链在根空间的位置。 */
  readonly hinge: Vector3 | null;
  /** 盒盖中心在根空间的位置，用于判断是否点在右半边。 */
  readonly lidCenter: Vector3 | null;
  /** 光盘初始中心在根空间的位置。 */
  readonly discHome: Vector3 | null;
  /** 光盘缩放后的半径（根空间单位）。 */
  readonly discRadius: number;
}

/**
 * 把 GLB 归一化成一个"可陈列、可就位"的盒子：
 * - 按包围盒缩放到目标高度并居中；
 * - 隐藏托盘印刷层与盘片（陈列态只显示封面）；
 * - 用内页包围盒生成封面面片，位置与尺寸跟随模型。
 */
export const buildCaseModel = (
  scene: Group,
  coverTexture: Texture | null,
  tint: string,
  targetHeight = 0.52,
  showDisc = false,
  withCoverPlane = true,
  mergeShell = false,
  withRig = false
): BuiltCase => {
  const clone = scene.clone(true);
  let bakedCoverTexture: Texture | null = null;

  clone.traverse((child) => {
    const mesh = child as Mesh;

    if (!mesh.isMesh) {
      return;
    }

    // 盒子只有 126 个 mesh，投影开销可控；台面/墙面接收阴影后才能看出盒子离台面的高度。
    mesh.castShadow = true;
    mesh.receiveShadow = true;


    if (DISC_NODES.has(mesh.name)) {
      mesh.visible = showDisc;
      return;
    }


    if (mesh.name === COVER_NODE) {
      const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
      const bakedMap = material && "map" in material ? (material as MeshStandardMaterial).map : null;
      const map = coverTexture ?? bakedMap;

      bakedCoverTexture = bakedMap;
      mesh.material = new MeshStandardMaterial({
        color: map ? "#ffffff" : tint,
        map,
        metalness: 0.02,
        roughness: 0.7
      });
    }
  });

  clone.updateMatrixWorld(true);
  const lidPrint = clone.getObjectByName(COVER_NODE) ?? null;
  const lid = clone.getObjectByName(LID_NODE) ?? lidPrint?.parent ?? null;

  // 合并静态壳体的网格：参考实现只创建 1 个 BoxGeometry，而我们每个盒子 9 个 mesh。
  if (mergeShell) {
    clone.updateMatrixWorld(true);

    const shellGeometries: import("three").BufferGeometry[] = [];
    const shellMaterials: Material[] = [];
    const shellMeshes: Mesh[] = [];

    clone.traverse((child) => {
      const mesh = child as Mesh;

      if (!mesh.isMesh || !mesh.visible) {
        return;
      }

      const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;

      if (!material || (material.name !== "Rough_Plastic" && material.name !== "Translucent" && material.name !== "White" && material.name !== "Material.008" && material.name !== "FileBase")) {
        return;
      }

      shellGeometries.push(mesh.geometry.clone().applyMatrix4(mesh.matrixWorld));
      shellMaterials.push(material);
      shellMeshes.push(mesh);
    });

    const merged = shellGeometries.length > 1 ? mergeGeometries(shellGeometries, true) : null;

    if (merged) {
      for (const mesh of shellMeshes) {
        mesh.parent?.remove(mesh);
      }

      clone.add(new Mesh(merged, shellMaterials));
    }
  }

  const box = new Box3().setFromObject(clone);
  const size = new Vector3();
  const center = new Vector3();
  box.getSize(size);
  box.getCenter(center);
  const fit = targetHeight / Math.max(size.y, 0.0001);

  const wrapper = new Group();
  clone.position.set(-center.x, -center.y, -center.z);
  wrapper.rotation.y = -Math.PI / 2;
  wrapper.scale.setScalar(fit);
  wrapper.add(clone);
  wrapper.updateMatrixWorld(true);

  const root = new Group();
  root.add(wrapper);
  root.updateMatrixWorld(true);

  const cdGroup = clone.getObjectByName(CD_NODE) ?? null;

  let lidPivot: Group | null = null;
  let discPivot: Group | null = null;
  let hinge: Vector3 | null = null;
  let lidCenter: Vector3 | null = null;
  let discHome: Vector3 | null = null;
  let discRadius = 0;

  if (withRig && lid && cdGroup) {
    // 直接用 GLB 里 Case Front_0 的世界原点作为铰链（它在盒盖边缘），
    // 再换到 root 空间，避免手写坐标和模型版本脱节。
    const lidWorld = lid.getWorldPosition(new Vector3());
    const lidCenterWorld = new Box3().setFromObject(lid).getCenter(new Vector3());
    hinge = root.worldToLocal(lidWorld.clone());
    lidCenter = root.worldToLocal(lidCenterWorld.clone());

    lidPivot = new Group();
    lidPivot.name = "lid-pivot";
    lidPivot.position.copy(hinge);
    root.add(lidPivot);
    lidPivot.attach(lid);
    lidPivot.updateMatrixWorld(true);

    const discWorld = cdGroup.getWorldPosition(new Vector3());
    discHome = root.worldToLocal(discWorld.clone());

    discPivot = new Group();
    discPivot.name = "disc-pivot";
    discPivot.position.copy(discHome);
    root.add(discPivot);
    discPivot.attach(cdGroup);
    root.updateMatrixWorld(true);

    const discSize = new Box3().setFromObject(cdGroup).getSize(new Vector3());
    discRadius = Math.max(discSize.x, discSize.y, discSize.z) / 2;
  }

  // 封面放在 root 上、用内页包围盒定位（在根空间里算出来的位置是稳定的）。
  const coverNode = root.getObjectByName(COVER_NODE);
  const coverMesh = coverNode && "geometry" in coverNode ? (coverNode as Mesh) : null;

  if (coverMesh && withCoverPlane) {
    const coverBox = new Box3().setFromObject(coverMesh);
    const coverCenter = coverBox.getCenter(new Vector3());
    const coverSize = coverBox.getSize(new Vector3());
    const wholeBox = new Box3().setFromObject(root);
    const coverMap = coverTexture ?? bakedCoverTexture;

    const coverPlane = new Mesh(
      new PlaneGeometry(coverSize.x * COVER_SIZE_RATIO, coverSize.y * COVER_SIZE_RATIO),
      new MeshStandardMaterial({
        color: coverMap ? "#ffffff" : tint,
        map: coverMap,
        metalness: 0.02,
        roughness: 0.7
      })
    );
    coverPlane.position.set(coverCenter.x, coverCenter.y, wholeBox.max.z + 0.006);
    root.add(coverPlane);
  }

  if (withRig && coverMesh && lidPivot && lid) {
    // GLB 里的封面印在内侧，合盖时看不到。沿盒盖外侧再贴一张封面，
    // 并挂到 lidPivot 上，让它在开合时跟着盖子走。
    lidPivot.updateMatrixWorld(true);
    const lidBox = new Box3().setFromObject(lid);
    const frontLocal = lidPivot.worldToLocal(lidBox.max.clone());
    const artBox = new Box3().setFromObject(coverMesh);
    const artCenter = lidPivot.worldToLocal(artBox.getCenter(new Vector3()));
    const artSize = artBox.getSize(new Vector3());
    const lidCoverMap = coverTexture ?? bakedCoverTexture;

    const lidCover = new Mesh(
      new PlaneGeometry(artSize.x * COVER_SIZE_RATIO, artSize.y * COVER_SIZE_RATIO),
      new MeshStandardMaterial({
        color: lidCoverMap ? "#ffffff" : tint,
        map: lidCoverMap,
        metalness: 0.02,
        roughness: 0.7
      })
    );
    lidCover.name = "lid-cover";
    lidCover.position.set(artCenter.x, artCenter.y, frontLocal.z + 0.006);
    lidPivot.add(lidCover);
    lidPivot.updateMatrixWorld(true);
    // 挂到 Case Front_0 下面，这样点封面也能被识别成"点在盒盖上"。
    lid.attach(lidCover);
  }

  return {
    root,
    lid,
    lidPivot,
    discPivot,
    hinge,
    lidCenter,
    discHome,
    discRadius,
    cd: cdGroup
  };
};
