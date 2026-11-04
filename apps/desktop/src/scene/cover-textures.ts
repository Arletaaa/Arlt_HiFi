import { useEffect, useState } from "react";
import { useThree } from "@react-three/fiber";
import { SRGBColorSpace, Texture, TextureLoader } from "three";
import { createCoverMediaUrl } from "@arlt-hifi/shared";

const MAX_COVER_TEXTURES = 48;
const cache = new Map<string, Texture>();

const load = (coverPath: string): Promise<Texture> =>
  new Promise((resolve, reject) => {
    new TextureLoader().load(
      createCoverMediaUrl(coverPath),
      (texture) => {
        texture.colorSpace = SRGBColorSpace;
        texture.anisotropy = 4;
        cache.set(coverPath, texture);

        if (cache.size > MAX_COVER_TEXTURES) {
          const oldest = cache.keys().next().value;

          if (oldest) {
            cache.get(oldest)?.dispose();
            cache.delete(oldest);
          }
        }

        resolve(texture);
      },
      undefined,
      reject
    );
  });

/** 封面纹理：带 LRU 缓存，加载完成后主动请求一帧（场景是惰性渲染）。 */
export const useCoverTexture = (coverPath: string | null): Texture | null => {
  const invalidate = useThree((state) => state.invalidate);
  const [texture, setTexture] = useState<Texture | null>(() => (coverPath ? cache.get(coverPath) ?? null : null));

  useEffect(() => {
    if (!coverPath) {
      setTexture(null);
      return;
    }

    const cached = cache.get(coverPath);

    if (cached) {
      setTexture(cached);
      return;
    }

    let cancelled = false;

    void load(coverPath)
      .then((loaded) => {
        if (!cancelled) {
          setTexture(loaded);
          invalidate();
        }
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [coverPath, invalidate]);

  return texture;
};
