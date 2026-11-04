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

- 管理弹窗就是一张 **CD 目录树**：每张 CD 一行标题（可点改名）+ 可折叠的歌曲列表；
- 歌曲行左侧有拖拽把手（⋮），拖到别的 CD 里即并入；拖到组内两行之间即插入到那个位置，整组音轨号自动重排 1..N；
- 拖到列表最下方的「拖到这里 → 变成单曲 CD」区，就拆成一张只含这首歌的单曲 CD；
- 歌曲名、CD 名都可点一下直接改；封面取该 CD 第一首歌曲的封面；
- CD 标题左侧的上下箭头调整 CD 顺序，写入 `settings.json` 的 `cdOrder` 并切到「手动」排序，货架按同一顺序展示；
- 覆盖写入 manifest（`library.json`），**不移动文件、不写音频标签**；一次拖拽的所有改动走一条批量 IPC 整体落盘，不会写一半。

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
- [x] 管理层按 CD 目录树展示，歌曲可拖拽跨 CD 合并、组内调序、拖出为单曲 CD
- [x] CD 名/歌曲名行内改名，CD 可折叠，CD 顺序可上下调整（写入 `cdOrder`）
- [x] 旧 manifest 重扫补字段（设置 →「重扫标签」；只补空缺，不覆盖已有值）

管理层已经能修标签缺失导致的错误分组；旧库重扫在设置里手动触发。导入侧只做标签识别，不做文件夹归组。
