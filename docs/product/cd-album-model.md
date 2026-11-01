# CD 模型与多曲归组

> 2026-10-30 · 与 ADR 007 / 008 配套。回答“一张 CD 是什么、能否放多首、导入/管理要不要改”。

## 1. 现在的一张 CD 是什么

代码里没有“单曲 CD”这个实体。一张 CD 对应 `GalleryGroup`：

```ts
{
  id, title, artist, coverPath,
  durationSeconds, order,
  trackIds: Track[]  // 这张 CD 的全部曲目，按 CD 内顺序
}
```

归组规则（`apps/desktop/src/lib/album-groups.ts`）：

1. 有专辑 + 艺术家：`albumArtist || artist` + `album` + `discNumber`
2. 只有专辑：`album` + `discNumber`
3. 只有艺术家：按艺术家归组
4. 都没有：每首单独一张 CD

CD 内顺序：

1. `discNumber` 升序
2. `trackNumber` 升序
3. 两者都缺失时保持导入顺序

所以**一张 CD 本来就是多首的容器**，只是此前的播放逻辑只播第一首、没有上一首/下一首。现在详情播放条把 `group.trackIds` 当作队列，上一首/下一首只在这张 CD 内移动。

## 2. 多首音乐能不能放进一张 CD

能，但前提是它们能被识别为同一张 CD。当前识别依据是标签：

- `album`：专辑名
- `artist` / `albumArtist`：艺术家；合辑用 `albumArtist`
- `discNumber`：多碟专辑的碟号
- `trackNumber`：CD 内音轨号

同一张 CD 的文件应满足：

- 相同的 `album`
- 相同的 `albumArtist`（没有则 `artist`）
- 相同的 `discNumber`
- 不同的 `trackNumber`

满足后导入即自动归为一张 CD，顺序按音轨号。当前导入已经读取这四个字段；旧 manifest 里的曲目没有新字段，需要重新导入或做一次重扫才能补上。

## 3. 为什么现在会看到多张“单曲 CD”

如果文件没有标签，导入后的 `artist` / `album` 会是 `Unknown Artist` / `Unknown Album`：

- 有艺术家、无专辑：按艺术家归组；
- 两者都没有：每首单独一张 CD。

所以“5 首 Unknown Artist”会显示成 5 张 CD，而不是一张合辑。这不是分组失败，是标签缺失导致的兜底。

## 4. 是否该在导入/管理里动手脚

应该，但要分两层，不能只靠“某个属性相同”：

### 导入层

- 继续以标签为准（已做）。
- **不做**“按文件夹导入为一张 CD”，也不根据文件夹自动猜测专辑；避免把不同来源的文件错误合并。
- 标签缺失时保持当前兜底（Unknown Artist/Album），由用户在管理层修正。

### 管理层

- 管理弹窗里逐首编辑：专辑名 / 专辑艺术家 / 碟号 / 音轨号；
- 改成相同的「专辑 + 专辑艺术家 + 碟号」后，软件自动合并为一张 CD；
- 音轨号决定 CD 内顺序；
- 覆盖写入 manifest（`library.json`），**不移动文件、不写音频标签**；
- 批量选择多首一起合并还没做；当前是逐首编辑。

### 为什么不能只看一个属性

- 只看 `album`：不同艺术家的同名专辑会错误合并；
- 只看文件夹：不同来源的合辑/多碟会混乱；
- 推荐键：`albumArtist + album + discNumber`，顺序用 `trackNumber`；
- 合辑用 `albumArtist = Various Artists`；
- 多碟专辑按 `discNumber` 拆成多张 CD，符合“一张 CD 是一张碟”。

## 5. 当前状态

- [x] 读取 `albumArtist` / `discNumber` / `trackNumber`
- [x] 按 `albumArtist + album + disc` 归组
- [x] CD 内按碟号/音轨号排序
- [x] 详情播放条以当前 CD 为队列，上一首/下一首不跨 CD
- [x] 管理层逐首编辑 CD 信息；相同值自动合并
- [ ] 批量选择/合并
- [ ] 旧 manifest 重扫补字段

管理层已经能修标签缺失导致的错误分组；批量合并与旧库重扫单独排。导入侧只做标签识别，不做文件夹归组。
