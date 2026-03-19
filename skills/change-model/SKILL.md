---
name: change-model
description: 换模特功能 — 将原图中的模特替换为目标人脸/人物。支持两种模式：「原图换脸」通过局部重绘精准替换面部特征，100% 保持原图背景与穿搭；「真人复刻」通过反推原图构图与穿搭，结合目标人脸进行全局高保真重绘，实现完美融合的换模效果。当用户提到换模特、换脸、替换人物、模特替换、人脸替换、换人、人物重绘等需求时，请使用此 skill。即使用户没有明确说"换模特"，只要涉及把一张图的人脸/身份特征替换为另一个人的，也应触发。
---

# 换模特功能

将原图中模特的面部或整体特征替换为目标人物，同时保持服装穿搭和背景不变。

本功能提供两种模式：「原图换脸」适合只需替换面部的简单场景，速度快、还原度高；「真人复刻」适合需要更自然融合效果的场景，通过反推原图再重绘来实现。

---

## 模式一：原图换脸

纯图生图逻辑，直接调用局部重绘进行面部特征的精准替换。适合原图质量高、只需换脸不需要调整整体风格的场景。

### 前端传入的全局变量

- `MODEL_IMAGE_A`：原 Look 图 URL（作为 Base 垫图）
- `MODEL_IMAGE_B`：目标人脸图 URL（作为 Source 特征图）
- `MODEL_BATCH_SIZE`：生成张数（用户在前端面板选择的输出数量）

### Step 1：局部面部重绘替换

- **调用 API**：`gemini-3.1-flash-image-preview`
- **图片 URL**：`[MODEL_IMAGE_A, MODEL_IMAGE_B]`
- **生成张数**：`{{MODEL_BATCH_SIZE}}`
- **提示词 (Prompt)**：

```json
{
  "task": "将'图1'中人物的人脸替换为'图2'中人脸。",
  "directives": {
    "step_1_clear": "彻底移除'图1'人物原本的面部五官、皮肤纹理和表情细节，仅保留其原始的面部轮廓边界和头型结构。",
    "step_2_transfer": "以'图2'人物的面部特征（眼、鼻、嘴、神态和身份ID）为基准，在保留的轮廓内重新生成完整的脸部。",
    "strict_keep_context": [
      "必须 100% 保持'图1'人物的发型、发色和头发边缘。",
      "必须 100% 保持'图1'人物的身体姿势、身材、服装和所有配饰。",
      "必须 100% 保持'图1'的原始背景环境。"
    ],
    "blending": "重新生成时，新的脸部必须完美匹配'图1'的环境光照（方向、色温、阴影），并确保皮肤纹理和肤色在接口处实现自然的无缝融合。"
  }
}
```

- **节点输出**：将返回的图片（数组）直接吐给前端展示。

---

## 模式二：真人复刻

通过反推原图的构图、穿搭和风格特征，结合目标人脸进行全局高保真重绘。适合追求更自然、更整体的换模效果，尤其是原图风格特殊或需要整体协调的场景。

### 前端传入的全局变量

- `MODEL_IMAGE_A`：原图 URL（需要被替换模特的参考图）
- `MODEL_IMAGE_B`：目标人脸图 URL（面板中选择的人脸素材）
- `MODEL_IBATCH_SIZE`：生成张数（用户在前端面板选择的输出数量）

### Step 1：反推原图构图与穿搭

- **调用 API**：`gemini-3.1-pro-preview`
- **图片 URL**：`[MODEL_IMAGE_A]`
- **生成张数**：`1`
- **提示词 (Prompt)**：

```
##角色
你是一位顶级的AI图像提示词架构师与时尚造型师。擅长通过反向工程将图像转化为结构化提示词，适配FaceID/IP-Adapter流程。

##任务
分析用户上传的参考图，严格遵循JSON结构内的维度，提取特征并填充。将结果仅输出为纯文本JSON，禁止Markdown格式，并严禁输出任何解释性文字。JSON的键（Key）必须为英文，值（Value）必须为中文描述。

## JSON输出结构（键为英文，值为中文），直接输出结果，禁止输出markdown格式
{
  "SCENE_CONFIG": {
    "composition": "[基于输入的参考图进行反推，如全身照/上身的半身照/上半身特写/鞋部特写等]、[镜头距离]、[相机角度]",
    "visual_style": "[图像风格、色调、滤镜、整体氛围]",
    "pose": "[身体姿势描述及整体氛围]",
    "environment": "[环境描述、空间关系、光影氛围]"
  },
  "FASHION_MANIFEST": {
    "outfit": "图中人物的穿搭，根据[颜色][核心设计][服装款型][材质][品类]的结构进行描述，如白色蕾丝宽松纯棉吊带",
    "style_isolation": "仅将[具体艺术风格与美学氛围]应用于背景和服装。严禁改变面部或皮肤。",
    "camera_device": "该值固定为"iPhone手机拍摄"，以保证图像的真实感。可根据图片补充视觉叙事（比如抓拍动态模糊、比如随手拍摄等）"
  }
}
```

- **节点输出**：将大模型返回的 JSON 文本结果存为变量 `VAR_EXTRACTED_FEATURES`。

### Step 2：结合人脸特征生成新图

- **调用 API**：`gemini-3.1-flash-image-preview`
- **图片 URL**：`[MODEL_IMAGE_A, MODEL_IMAGE_B]`
- **生成张数**：`{{MODEL_IBATCH_SIZE}}`
- **开发必读 — 参数动态注入逻辑**：在发送此步请求前，后端代码必须解析 Step 1 返回的 `VAR_EXTRACTED_FEATURES` 字符串为 JSON 对象，并将其作为值强绑定到下方 Prompt 的 `SCENE_AND_FASHION` 键中，组合成最终的合法 JSON 后再发送给底层 API。
- **提示词 (Prompt 骨架)**：

```json
{
  "IDENTITY_LOCK": {
    "status": "MANDATORY",
    "directive": "LITERAL 1:1 PIXEL-LEVEL IDENTITY TRANSFER",
    "instruction": "Lock identity to the reference image. NO facial modification. NO expressions modification",
    "anchors": {
      "expression": "面部特征必须与参考图像保持一致，但凝视和微妙的表情可以适应姿势。",
      "hair": "发型发色保持不变",
      "bone_structure_policy": "保留原始面部阴影和定义。忽略基于文本的解剖结构."
    }
  },
  "SCENE_AND_FASHION": "【此处由后端代码动态注入 VAR_EXTRACTED_FEATURES 的 JSON 对象】"
}
```

- **节点输出**：将返回的图片（数组）直接吐给前端展示。
