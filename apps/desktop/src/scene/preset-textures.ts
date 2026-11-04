import { useEffect, useRef, useState } from "react";
import { useThree } from "@react-three/fiber";
import { NoColorSpace, RepeatWrapping, SRGBColorSpace, Texture, TextureLoader } from "three";

export interface PresetSurfaceTextures {
  readonly color: Texture;
  readonly normal: Texture;
  readonly roughness: Texture;
}

const loader = new TextureLoader();
const cache = new Map<string, PresetSurfaceTextures>();
const pending = new Map<string, Promise<PresetSurfaceTextures>>();
const failed = new Set<string>();

const loadTexture = (url: string, srgb: boolean): Promise<Texture> =>
  new Promise((resolve, reject) => {
    loader.load(
      url,
      (texture) => {
        texture.colorSpace = srgb ? SRGBColorSpace : NoColorSpace;
        texture.anisotropy = 8;
        resolve(texture);
      },
      undefined,
      reject
    );
  });

/** 平铺必须在贴图交给材质前设好，否则会先显示一帧未平铺的巨图。 */
const tile = (set: PresetSurfaceTextures, repeat: readonly [number, number]): PresetSurfaceTextures => {
  // 颜色、法线、粗糙度必须用相同的平铺参数，纹路才对得上。
  for (const texture of [set.color, set.normal, set.roughness]) {
    texture.wrapS = RepeatWrapping;
    texture.wrapT = RepeatWrapping;
    texture.repeat.set(repeat[0], repeat[1]);
  }

  return set;
};

/** 一套表面贴图（颜色 + 法线 + 粗糙度）是同一批素材，一次并行加载。 */
const loadSet = (
  baseUrl: string,
  repeat: readonly [number, number]
): Promise<PresetSurfaceTextures> => {
  const done = cache.get(baseUrl);

  if (done) {
    return Promise.resolve(done);
  }

  const loading = pending.get(baseUrl);

  if (loading) {
    return loading;
  }

  const promise = Promise.all([
    loadTexture(`${baseUrl}-color.jpg`, true),
    loadTexture(`${baseUrl}-normal.jpg`, false),
    loadTexture(`${baseUrl}-roughness.jpg`, false)
  ])
    .then(([color, normal, roughness]) => {
      const set = tile({ color, normal, roughness }, repeat);

      cache.set(baseUrl, set);
      pending.delete(baseUrl);

      return set;
    })
    .catch((error: unknown) => {
      pending.delete(baseUrl);
      failed.add(baseUrl);

      throw error;
    });

  pending.set(baseUrl, promise);

  return promise;
};

/**
 * 预设表面贴图。刻意不用 useLoader：它在切换材质时会把整棵 Canvas
 * 挂起回退到加载态，背后的画面会黑一帧。这里只在"手上还没有任何贴图"
 * 的首次进入时交给 Suspense（此时场景本来就有加载态），之后换材质
 * 一直保留上一套贴图，新图解码完再替换，全程不挂起。
 */
export const usePresetSurfaceTextures = (
  baseUrl: string,
  repeat: readonly [number, number]
): PresetSurfaceTextures | null => {
  const invalidate = useThree((state) => state.invalidate);
  const previous = useRef<PresetSurfaceTextures | null>(cache.get(baseUrl) ?? null);
  const [, forceRender] = useState(0);
  const cached = cache.get(baseUrl) ?? null;

  if (!cached && previous.current === null && !failed.has(baseUrl)) {
    // 失败时 resolve(null)，重试后走纯色兜底，避免无限挂起。
    throw loadSet(baseUrl, repeat).catch(() => null);
  }

  useEffect(() => {
    if (cached) {
      previous.current = cached;
      return;
    }

    if (failed.has(baseUrl)) {
      return;
    }

    let cancelled = false;

    void loadSet(baseUrl, repeat)
      .then((set) => {
        if (!cancelled) {
          previous.current = set;
          forceRender((tick) => tick + 1);
          invalidate();
        }
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [baseUrl, cached, invalidate, repeat]);

  return cached ?? previous.current;
};
