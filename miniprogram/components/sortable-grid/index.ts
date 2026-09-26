// components/sortable-grid/index.ts — 可拖拽排序的照片网格
//
// 交互：长按 300ms 激活拖拽 → 手指移动实时重排 → 松手抛 change 事件（携带新顺序的 id 数组）。
// 布局：格子绝对定位 + transform，重排时非拖拽项靠 CSS transition 平滑让位。
//
// 注意：拖拽期的高频状态（手指坐标、网格原点等）全部存在闭包外的私有对象里，
// 不进 data，避免 touchmove 时触发无关渲染。

import { Photo } from '../../types/index';

const COLS = 4; // 每行列数
const GAP = 8; // 格子间距（px）
const PADDING = 16; // 网格左右内边距（px）
const LONG_PRESS_MS = 300; // 长按激活阈值
const MOVE_TOLERANCE = 8; // 长按判定期间的移动容差（px）

/** 云函数会在 photo 上附加临时 URL，这里放宽类型 */
type SortablePhoto = Photo & {
  _thumb_url?: string;
  _temp_url?: string;
};

interface GridItem {
  _id: string;
  thumb: string;
  x: number;
  y: number;
}

/** 拖拽运行期私有状态 */
interface DragState {
  pressTimer: ReturnType<typeof setTimeout> | null;
  active: boolean;
  /** 手指是否仍按在屏幕上。用于消除「长按没到时就松手」导致的卡死 */
  pressing: boolean;
  startIndex: number;
  pressClientX: number;
  pressClientY: number;
  pressContentX: number;
  pressContentY: number;
  gridLeft: number;
  gridTop: number;
  scrollTop: number;
}

// 每个组件实例一份私有状态，挂在实例上避免多实例互相干扰
const states = new WeakMap<object, DragState>();

function getState(ctx: object): DragState {
  let s = states.get(ctx);
  if (!s) {
    s = {
      pressTimer: null,
      active: false,
      pressing: false,
      startIndex: -1,
      pressClientX: 0,
      pressClientY: 0,
      pressContentX: 0,
      pressContentY: 0,
      gridLeft: 0,
      gridTop: 0,
      scrollTop: 0,
    };
    states.set(ctx, s);
  }
  return s;
}

Component({
  properties: {
    photos: {
      type: Array,
      value: [],
      observer(this: unknown, photos: SortablePhoto[]) {
        // observer 回调里拿不到带类型的实例，断言后转调 methods 中的实现
        const self = this as unknown as { build: (p: SortablePhoto[]) => void };
        if (typeof self.build === 'function') self.build(photos || []);
      },
    },
    disabled: { type: Boolean, value: false },
    /** 网格最大高度（px），超出可内部滚动 */
    maxHeight: { type: Number, value: 260 },
  },

  data: {
    items: [] as GridItem[],
    cellW: 0,
    gridHeight: 0,
    viewHeight: 0,
    dragging: false,
    dragIndex: -1,
    cols: COLS,
    gap: GAP,
    padding: PADDING,
  },

  lifetimes: {
    detached(this: unknown) {
      const s = getState(this as object);
      if (s.pressTimer) {
        clearTimeout(s.pressTimer);
        s.pressTimer = null;
      }
    },
  },

  methods: {
    /** 格子边长，依赖窗口宽度，首次使用时计算并缓存 */
    ensureCellSize(): number {
      const cellW = this.data.cellW as number;
      if (cellW > 0) return cellW;
      const info = wx.getSystemInfoSync();
      const w = Math.floor((info.windowWidth - PADDING * 2 - GAP * (COLS - 1)) / COLS);
      this.setData({ cellW: w });
      return w;
    },

    /** 依据当前顺序重算所有格子的坐标 */
    layout(list: GridItem[], cellW: number, dragIndex: number, dx: number, dy: number): GridItem[] {
      const step = cellW + GAP;
      return list.map((it, i) => ({
        ...it,
        x: (i % COLS) * step + (i === dragIndex ? dx : 0),
        y: Math.floor(i / COLS) * step + (i === dragIndex ? dy : 0),
      }));
    },

    build(photos: SortablePhoto[]) {
      // 拖拽期间忽略外部数据刷新：否则会把正在拖的项重置回原位，画面跳变
      if (this.data.dragging) return;
      const cellW = this.ensureCellSize();
      const step = cellW + GAP;
      const items: GridItem[] = (photos || []).map((p, i) => ({
        _id: p._id,
        thumb: p._thumb_url || p._temp_url || '',
        x: (i % COLS) * step,
        y: Math.floor(i / COLS) * step,
      }));
      const rows = Math.ceil(items.length / COLS);
      const gridHeight = rows > 0 ? rows * step - GAP : 0;

      // scroll-view 纵向滚动必须有固定高度（max-height 不生效，内容会撑开而不是内部滚动），
      // 所以这里取「内容高度」与「上限」的较小值：照片少时不留空白，照片多时才滚动。
      const maxHeight = this.data.maxHeight as number;
      const viewHeight = maxHeight > 0 ? Math.min(gridHeight, maxHeight) : gridHeight;

      const s = getState(this as object);
      s.scrollTop = 0;
      // 记录初始顺序，用于松手时判断「是否真的变过」——没变就不打扰服务端
      (this as unknown as { _initialIds: string[] })._initialIds = items.map((it) => it._id);
      this.setData({
        items,
        gridHeight,
        viewHeight,
        dragging: false,
        dragIndex: -1,
      });
    },

    /** 取网格内容区在视口中的原点，用于把手指坐标换算成内容坐标 */
    getGridOrigin(): Promise<{ left: number; top: number }> {
      return new Promise((resolve) => {
        wx.createSelectorQuery()
          .in(this as unknown as WechatMiniprogram.Component.TrivialInstance)
          .select('.grid-inner')
          .boundingClientRect((res) => {
            const r = res as unknown as { left: number; top: number } | null;
            resolve(r ? { left: r.left, top: r.top } : { left: 0, top: 0 });
          })
          .exec();
      });
    },

    async activate(index: number, clientX: number, clientY: number) {
      const s = getState(this as object);
      s.pressTimer = null;
      if (this.data.disabled) return;

      const origin = await this.getGridOrigin();
      // getGridOrigin 是异步的，期间用户可能已经松手。
      // 此时若继续激活，会进入「无人接管的拖拽态」——后续不会再有 touchmove/touchend
      // 来结束它，页面就永久卡在拖拽中。必须在这里放弃。
      if (!s.pressing) return;

      s.gridLeft = origin.left;
      s.gridTop = origin.top;
      s.pressContentX = clientX - origin.left;
      s.pressContentY = clientY - origin.top + s.scrollTop;
      s.active = true;
      this.setData({ dragging: true, dragIndex: index });

      // 轻震动反馈，让「已拿起」有明确手感
      wx.vibrateShort({ type: 'light', fail: () => undefined });
    },

    onTouchStart(e: WechatMiniprogram.TouchEvent) {
      if (this.data.disabled || this.data.dragging) return;
      const s = getState(this as object);
      const index = Number(e.currentTarget.dataset.index);
      const t = e.touches[0];
      if (!t) return;

      s.startIndex = index;
      s.pressClientX = t.clientX;
      s.pressClientY = t.clientY;
      s.active = false;
      s.pressing = true;
      if (s.pressTimer) clearTimeout(s.pressTimer);
      // 长按判定期间手指移动超过容差即视为想滚动页面，取消激活
      s.pressTimer = setTimeout(() => {
        this.activate(index, s.pressClientX, s.pressClientY);
      }, LONG_PRESS_MS);
    },

    onTouchMove(e: WechatMiniprogram.TouchEvent) {
      const s = getState(this as object);
      const t = e.touches[0];
      if (!t) return;

      if (!s.active) {
        // 还没激活：只是在滚动页面，超过容差就取消长按计时
        if (
          s.pressTimer &&
          (Math.abs(t.clientX - s.pressClientX) > MOVE_TOLERANCE ||
            Math.abs(t.clientY - s.pressClientY) > MOVE_TOLERANCE)
        ) {
          clearTimeout(s.pressTimer);
          s.pressTimer = null;
        }
        return;
      }

      const cellW = this.data.cellW as number;
      if (cellW <= 0) return;
      const step = cellW + GAP;

      const contentX = t.clientX - s.gridLeft;
      const contentY = t.clientY - s.gridTop + s.scrollTop;
      const dx = contentX - s.pressContentX;
      const dy = contentY - s.pressContentY;

      // 手指落在哪个格子：内容坐标除以步长
      const col = Math.min(COLS - 1, Math.max(0, Math.floor(contentX / step)));
      const row = Math.max(0, Math.floor(contentY / step));
      const total = (this.data.items as GridItem[]).length;
      const target = Math.min(total - 1, row * COLS + col);
      const current = this.data.dragIndex as number;

      if (target !== current && target >= 0) {
        // 发生换位：先改数组顺序，再整体重排（非拖拽项靠 transition 平滑让位）
        const items = (this.data.items as GridItem[]).slice();
        const moved = items.splice(current, 1)[0];
        items.splice(target, 0, moved);
        this.setData({
          items: this.layout(items, cellW, target, dx, dy),
          dragIndex: target,
        });
        wx.vibrateShort({ type: 'light', fail: () => undefined });
      } else {
        // 未换位：只更新被拖项的位置，减少 setData 体积
        this.setData({
          [`items[${current}].x`]: (current % COLS) * step + dx,
          [`items[${current}].y`]: Math.floor(current / COLS) * step + dy,
        });
      }
    },

    onTouchEnd() {
      const s = getState(this as object);
      // 必须先标记手指已离开，否则 activate 的异步回调可能在松手后才激活拖拽
      s.pressing = false;
      if (s.pressTimer) {
        clearTimeout(s.pressTimer);
        s.pressTimer = null;
      }
      if (!s.active) return;
      s.active = false;

      const cellW = this.data.cellW as number;
      const step = cellW + GAP;
      const index = this.data.dragIndex as number;

      // 松手：被拖项归位到它在新顺序里的格子
      this.setData({
        dragging: false,
        dragIndex: -1,
        [`items[${index}].x`]: (index % COLS) * step,
        [`items[${index}].y`]: Math.floor(index / COLS) * step,
      });

      const ids = (this.data.items as GridItem[]).map((it) => it._id);
      const initial = (this as unknown as { _initialIds?: string[] })._initialIds || [];
      const changed =
        ids.length !== initial.length || ids.some((id, i) => id !== initial[i]);

      if (changed) {
        // 基准顺序随之更新，避免下一次拖拽重复上报未变更
        (this as unknown as { _initialIds: string[] })._initialIds = ids;
        this.triggerEvent('change', { photo_ids: ids });
      }
    },

    onScroll(e: WechatMiniprogram.CustomEvent) {
      const s = getState(this as object);
      s.scrollTop = (e.detail as { scrollTop: number }).scrollTop || 0;
    },
  },
});
