# UNiNUS Greenhouse Rollup Card

專為 Home Assistant 溫室側簾設計的獨立 Lovelace 卡片。可直接使用新版裝置提供的標準 MQTT `cover.*`，也可搭配 [UNiNUS Greenhouse Rollup Integration](https://github.com/ivanlee1007/uninus-greenhouse-rollup) 將舊版雙 Switch 包裝成具有位置估算與互鎖能力的 Cover。

[![HACS Custom](https://img.shields.io/badge/HACS-Custom-41BDF5.svg)](https://hacs.xyz/) [![CI](https://github.com/ivanlee1007/uninus-greenhouse-rollup-card/actions/workflows/ci.yml/badge.svg)](https://github.com/ivanlee1007/uninus-greenhouse-rollup-card/actions/workflows/ci.yml)

## 特色

- 同一卡片可使用原生 MQTT Cover 或 Integration 產生的 Cover。
- 原生 Cover 沒有 `current_position` 時明確顯示「位置未提供」，不會把 `open` 誤判為 `100%`。
- 依 `supported_features` 顯示開啟、停止與關閉按鈕。
- 顯示 Integration Cover 的估算位置、校正狀態、命令狀態與底層計時狀態。
- 四面捲揚、動畫、主題與完整視覺化設定。
- 可在設定 UI 選擇**每列捲揚數量** 1～4（最多 4 個）；`items_per_row` 固定產生 1～4 欄，不會因卡片寬度擅自降欄。
- 保留位置 Entity／Motion Entity 顯示模式，方便既有 Dashboard 逐步移轉。

## HACS 安裝

1. HACS → Frontend → 右上角選單 → Custom repositories。
2. Repository：`https://github.com/ivanlee1007/uninus-greenhouse-rollup-card`
3. Type：**Dashboard**。
4. 安裝 `UNiNUS Greenhouse Rollup Card`。
5. 重新整理瀏覽器。

HACS 會安裝 `uninus-greenhouse-rollup-card.js` 並自動加入 Lovelace 資源，不需要手動到「設定 → 儀表板 → 資源」新增 JavaScript Module。

> 從原本整合內建的卡片升級時，請先刪除舊的手動資源 `/uninus-greenhouse-rollup/uninus-greenhouse-rollup-card.js?...`，避免同一個 custom element 被載入兩次。

## 卡片設定

新增卡片時搜尋 **UNiNUS Greenhouse Rollup Card**，並使用視覺化設定；也可使用 YAML：

```yaml
type: custom:uninus-greenhouse-rollup-card
title: 溫室側簾捲揚
items_per_row: 4
faces:
  - key: east
    name: 東側
    entity_mode: cover_entity
    cover_entity: cover.east_greenhouse_rollup
  - key: south
    name: 南側
    entity_mode: cover_entity
    cover_entity: cover.south_greenhouse_rollup
  - key: west
    name: 西側
    entity_mode: cover_entity
    cover_entity: cover.west_greenhouse_rollup
  - key: north
    name: 北側
    entity_mode: cover_entity
    cover_entity: cover.north_greenhouse_rollup
```

每一面設定 `cover_entity` 後，原生 Cover 與 Integration Cover 都使用標準 `cover.open_cover`、`cover.stop_cover`、`cover.close_cover` services。

### 新版：原生 MQTT Cover

新版智慧開關已由韌體／MQTT 處理方向並註冊標準 `cover.*` 時，卡片直接選擇該 Entity；不需要安裝後端 Integration。位置、運轉方向、availability 與控制能力皆以裝置實際回報為準。

### 舊版：雙 Switch Adapter

舊版裝置只有互斥的開啟與關閉 Switch 時，先安裝 [UNiNUS Greenhouse Rollup Integration](https://github.com/ivanlee1007/uninus-greenhouse-rollup)，為每一組捲揚建立標準 Cover，再於卡片選擇 Integration 產生的 `cover.*`。

Integration Cover 會額外提供：

- 估算位置與端點校正狀態；
- 實際位置積分中的開啟／關閉動畫；
- 「開啟命令中」或「關閉命令中」；
- 到端點後「已全開／已全關」，以及底層 switch 尚在計時的提示。

### 舊版 Entity 顯示模式

將 `entity_mode` 設為 `position_entity` 時，可延續舊版設定：

```yaml
type: custom:uninus-greenhouse-rollup-card
faces:
  - key: east
    name: 東側
    entity_mode: position_entity
    entity: input_number.up_lift_position_e
    motion_entity: binary_sensor.rollup_e_moving
    max_entity: input_number.rollup_e_maximum
    max_value: 120
```

此模式只顯示狀態，不提供 Integration 的位置保存、互鎖與開停關控制。

## 開發

```bash
npm install
npm test
npm run build
npm run check
```

建置輸出為 `uninus-greenhouse-rollup-card.js`。CI 會執行 JavaScript 測試、bundle 建置、語法檢查、HACS validation 與版本一致性檢查。

## License

MIT
