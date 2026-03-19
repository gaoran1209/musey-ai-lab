---
name: virtual-tryon
description: 虚拟试穿 (TryOn) 功能 — 将搭配组内的多件服装单品（基于品类标签如上衣、裤子等）精准"穿"到指定的底图人物身上，实现高保真的多图融合换装。当用户提到试穿、换装、穿搭预览、虚拟试衣、服装上身效果、把衣服穿到人身上、搭配效果图等需求时，请使用此 skill。即使用户没有明确说"试穿"，只要涉及把服装单品合成到人物图上的场景，也应触发。
---

# 虚拟试穿 (TryOn) 功能

将搭配组内的多件服装单品精准"穿"到指定的底图人物身上，实现高保真的多图融合换装效果。

核心能力是接收一张人物底图和多张带品类标签的服装图，通过一次 API 调用完成所有服装的同时上身，保持人物五官、发型、背景完全不变。

---

## 前端传入的全局变量

- `TRYON_IMAGE_A`：底图人物 URL（作为画布上的原图，固定为"图1"）
- `VAR_IMAGE_ARRAY_B`：服装图及标签数组（前端传入的结构化数据，格式如 `[{url: "...", tag: "上衣"}, {url: "...", tag: "裤子"}]`）
- `TRYON_BATCH_SIZE`：生成张数

## Step 1：多图融合精准换装

- **调用 API**：`gemini-3.1-flash-image-preview`
- **图片 URL**：`[TRYON_IMAGE_A, ...提取自 VAR_IMAGE_ARRAY_B 的所有服装 URL]`
  （发给底层的图片数组顺序必须与下面 Prompt 中描述的图号严格对应）
- **生成张数**：`{{TRYON_BATCH_SIZE}}`
- **开发必读 — 参数动态注入逻辑**：在发送请求前，后端必须遍历 `VAR_IMAGE_ARRAY_B`，根据服装图在最终发送数组中的索引位置（图2、图3...）提取对应的 `tag`。动态拼接成自然语言，例如前端传了 2 件衣服，后端需拼接出："图2的上衣，图3的裤子"。将这段拼接好的字符串，注入到下方 Prompt 的 `source_inputs` 字段中。
- **提示词 (Prompt 骨架)**：

```json
{
  "instruction": "High-Fidelity Garment Transfer with Environment Preservation",
  "base_config": {
    "anchor": "图1",
    "target_elements": ["face", "hair", "background", "lighting_direction"],
    "operation_mode": "pixel_level_consistency"
  },
  "garment_transfer_logic": {
    "source_inputs": "【此处由后端代码动态遍历拼接，最终格式如：图2的上衣，图3的裤子，穿到图1的人物身上】",
    "color_policy": {
      "mode": "STRICT_ALBEDO_LOCK",
      "rule": "禁止根据环境光改变服装明度或色彩，强制保留来源图固有色"
    },
    "geometric_policy": {
      "mode": "1:1_silhouette_mapping",
      "constraints": ["保持袖口/裤脚原始长度", "严禁改变廓形", "禁止自动缩短"]
    },
    "detail_fidelity": {
      "level": "macro_recovery",
      "required_elements": ["stitching_lines", "button_textures", "fabric_grain", "wash_details"]
    }
  },
  "rendering_specs": {
    "resolution": "2K",
    "environmental_blend": "light_overlayer_only",
    "zero_tolerance": ["hallucination", "color_drift", "facial_reshaping"]
  }
}
```

- **节点输出**：将返回的图片（数组）直接吐给前端展示。
