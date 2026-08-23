# Travel UI Foundation

## Product direction

Travel 是協作型行程管理工具，不是旅遊行銷頁。介面採 calm productivity 方向：資訊清楚、操作直接、適度緊湊，使用細緻邊框與低強度陰影建立層級，避免高動態、裝飾性漸層與過度玻璃效果。

UI UX Pro Max 的全站搜尋曾建議 scroll storytelling / Aurora UI；前者不符合應用程式工作流，後者的高動態與對比風險也不適合行程規劃主介面，因此只保留其天空藍、青綠與暖色提示的配色線索。元件結構依 Design System Starter 的 token、primitive 與 accessibility 流程建立。

## Core principles

1. 先可讀、再漂亮：正文至少 14px，導覽標籤至少 12px，重要資訊保持 4.5:1 對比。
2. 觸控優先：主要控制至少 44x44px，相鄰 icon button 至少 8px 間距。
3. 一個 icon 語言：結構性 icon 使用 24px SVG stroke icon；emoji 只留在內容資料或情緒表達。
4. 狀態不只靠顏色：active 同時使用背景、文字、圖示與 `aria-current`。
5. 動態服務理解：互動轉場 150–200ms；reduced motion 下停用位移與動畫。
6. Safe-area 是版面的一部分：固定導覽與 modal footer 必須納入裝置安全區。

## Semantic tokens

| Token | Light value | Purpose |
| --- | --- | --- |
| `--travel-brand-600` | `#2563eb` | primary action / active navigation |
| `--travel-brand-700` | `#1d4ed8` | hover / pressed |
| `--travel-accent-600` | `#0d9488` | success and travel accent |
| `--travel-warning-600` | `#ea580c` | attention and warning action |
| `--travel-ink` | `#0f172a` | primary text |
| `--travel-muted-ink` | `#475569` | secondary text |
| `--travel-surface` | `#ffffff` | cards and controls |
| `--travel-canvas` | `#f8fafc` | neutral app background |
| `--travel-border` | `#dbe3ee` | default separation |
| `--travel-focus` | `#2563eb` | global keyboard focus ring |

Spacing follows a 4px base. Controls use 12px or 16px radii; cards use 20–24px. Shadows are low contrast and never replace a boundary.

## Component rules

### Button

- `primary`: one dominant action per region.
- `secondary`: bordered surface for alternatives.
- `ghost`: low-emphasis tool actions.
- Default and icon sizes are at least 44px high/wide.
- Loading and disabled states retain readable labels.

### Icon

- `currentColor`, rounded line caps, 1.8 stroke.
- Decorative icons use `aria-hidden`; icon-only buttons own the accessible label.
- Do not mix emoji with SVG inside the same navigation group.

### Trip card

- The content area is a real button, not a click handler on a generic container.
- Edit/delete controls are separate targets and do not trigger open.
- Date, destination and members use icon + text; long values truncate predictably.

### Trip navigation

- Mobile: four equal destinations, fixed visual height plus bottom safe-area.
- Desktop: compact segmented control with the same labels and icon family.
- Active state is consistent blue across feature destinations; feature-specific colors remain inside the feature content.

## Responsive checks

- 375px: no horizontal viewport overflow; bottom navigation labels remain visible.
- 768px: switch to desktop trip layout without duplicated controls.
- 1024px: trip controls wrap without covering title or sync status.
- 1440px: lobby content remains within a readable 72rem container.

## Accessibility checks

- Logical heading order and landmark labels.
- Keyboard open/edit/delete on trip cards.
- Visible global focus ring and no focus suppression.
- Text scaling to 200% without clipped controls.
- `prefers-reduced-motion` disables non-essential transitions and transforms.
