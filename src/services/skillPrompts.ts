// Skill types and prompt builders for change-background, change-model, and tryon

export type SkillType = 'change-background' | 'change-model' | 'tryon';

export interface SkillImageItem {
  imageSrc: string;
  label: string;
  tag?: string; // clothing category for TryOn
  fromNodeId?: string; // existing node ID (undefined = newly uploaded)
}

export interface SkillExecuteOptions {
  mode?: string;
  batchSize?: number;
  skillImages?: SkillImageItem[];
}

// ─── Change Background ───

export const SCENE_EXTRACT_PROMPT = `##角色与任务
你是一个专业的AI图像场景提取器。请分析上传的图像，完全无视并剔除图像中的任何前景主体（人物、动物、核心物件），仅根据画面背景推导并生成一句用于AI生图的纯场景中文提示词。

##核心规则
1. **绝对禁令（屏蔽主体）**：严禁在输出中包含任何关于原图主体的描述。假装主体完全不存在，只描述它背后的纯粹场景。
2. **三要素融合**：这句话必须高度浓缩并包含以下细节：
   - **环境描述**（具体地点、建筑或自然景观，如"复古咖啡馆的角落"、"空旷的赛博朋克街道"）。
   - **空间关系**（景深、开阔度或物体间的排列，如"强烈的延伸透视感"、"纵深感极强的狭窄走廊"）。
   - **光影氛围**（光线质感、时间段、色彩基调，如"温暖的午后斜阳穿透窗户"、"清冷忧郁的阴天漫反射光"）。
3. **格式限制**：仅输出一句连贯的中文长句，不需要任何前导词（如"这是....."或"背景是..."），严禁输出任何解释性文字或markdown代码块。直接输出那句中文即可。`;

export function buildAtmosphereBlendPrompt(scenePrompt: string): string {
  return JSON.stringify({
    task: '移除原图背景，并根据文字描述生成新环境。',
    target_background: scenePrompt,
    directives: {
      action: '保留原图人物主体，将其置入新生成的背景场景中。',
      strict_keep: [
        '人物的五官、发型和体型必须 100% 保持不变。',
        '人物的服装、鞋子和配饰必须 100% 保持不变。',
      ],
      adaptive_pose:
        '优先保持原姿势。若与新背景的物理空间产生冲突，允许微调肢体动作和朝向，确保人物自然站立或接触，消除悬浮感。',
      blending: '根据新背景的光源对人物重新打光，并生成真实的接触阴影。',
    },
  });
}

export const PRECISE_BG_REPLACE_PROMPT = JSON.stringify({
  task_description: "使用'图2'中的背景环境，全面替换'图1'中的背景。",
  generation_parameters: {
    core_action:
      "识别并移除'图1'中的所有背景元素，仅保留其主体人物。然后，将'图2'中的完整场景景观作为新的背景植入到保留的人物身后。",
    hard_constraints: [
      "绝对保持人物特征：严格保持原'图1'人物的面部五官、发型、发色、身材体型以及原始神态完全不变。",
      "绝对保持穿搭一致：保持原'图1'人物穿着的服装、鞋子、服饰材质以及所有配饰细节完全不变。",
    ],
    dynamic_constraints: {
      primary_goal: "在替换背景的过程中，默认尽可能保持'图1'中人物的原始姿势。",
      adaptation_condition:
        "如果'图1'人物的原始姿势与'图2'新背景的空间透视、物理结构产生冲突，必须优先保证画面的空间合理性和逻辑性。",
      allowed_adjustments:
        "允许对人物的肢体动作、朝向角度进行轻微、适度的调整，以确保人物能自然、真实地固定在新背景的空间关系中，避免出现'抠图贴纸'感。",
    },
    technical_blending: [
      "光影重构：根据'图2'环境的光源方向、强弱和色温，对'图1'的人物主体进行全面的重新打光，实现环境光融合。",
      "物理接触：在人物与'图2'中地面或物体的接触处，精准生成符合新背景光影的接触阴影，确保主体扎根在场景中。",
    ],
  },
});

// ─── Change Model ───

export const FACE_SWAP_PROMPT = JSON.stringify({
  task: "将'图1'中人物的人脸替换为'图2'中人脸。",
  directives: {
    step_1_clear:
      "彻底移除'图1'人物原本的面部五官、皮肤纹理和表情细节，仅保留其原始的面部轮廓边界和头型结构。",
    step_2_transfer:
      "以'图2'人物的面部特征（眼、鼻、嘴、神态和身份ID）为基准，在保留的轮廓内重新生成完整的脸部。",
    strict_keep_context: [
      "必须 100% 保持'图1'人物的发型、发色和头发边缘。",
      "必须 100% 保持'图1'人物的身体姿势、身材、服装和所有配饰。",
      "必须 100% 保持'图1'的原始背景环境。",
    ],
    blending:
      "重新生成时，新的脸部必须完美匹配'图1'的环境光照（方向、色温、阴影），并确保皮肤纹理和肤色在接口处实现自然的无缝融合。",
  },
});

export const FEATURES_EXTRACT_PROMPT = `##角色
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
}`;

export function buildReplicaPrompt(extractedFeatures: string): string {
  let parsedFeatures: any;
  try {
    parsedFeatures = JSON.parse(extractedFeatures);
  } catch {
    parsedFeatures = extractedFeatures;
  }

  return JSON.stringify({
    IDENTITY_LOCK: {
      status: 'MANDATORY',
      directive: 'LITERAL 1:1 PIXEL-LEVEL IDENTITY TRANSFER',
      instruction:
        'Lock identity to the reference image. NO facial modification. NO expressions modification',
      anchors: {
        expression:
          '面部特征必须与参考图像保持一致，但凝视和微妙的表情可以适应姿势。',
        hair: '发型发色保持不变',
        bone_structure_policy:
          '保留原始面部阴影和定义。忽略基于文本的解剖结构.',
      },
    },
    SCENE_AND_FASHION: parsedFeatures,
  });
}

// ─── Virtual Try-On ───

export interface TryonImageRef {
  nodeId: string;
  imageSrc: string;
  label: string;
  tag: string;
}

export function buildTryonPrompt(
  refs: Array<{ label: string; tag: string }>,
): string {
  // Build the dynamic source_inputs string like "图2的上衣，图3的裤子，穿到图1的人物身上"
  const parts = refs.map((ref, i) => `图${i + 2}的${ref.tag}`);
  const sourceInputs = parts.join('，') + '，穿到图1的人物身上';

  return JSON.stringify({
    instruction: 'High-Fidelity Garment Transfer with Environment Preservation',
    base_config: {
      anchor: '图1',
      target_elements: ['face', 'hair', 'background', 'lighting_direction'],
      operation_mode: 'pixel_level_consistency',
    },
    garment_transfer_logic: {
      source_inputs: sourceInputs,
      color_policy: {
        mode: 'STRICT_ALBEDO_LOCK',
        rule: '禁止根据环境光改变服装明度或色彩，强制保留来源图固有色',
      },
      geometric_policy: {
        mode: '1:1_silhouette_mapping',
        constraints: [
          '保持袖口/裤脚原始长度',
          '严禁改变廓形',
          '禁止自动缩短',
        ],
      },
      detail_fidelity: {
        level: 'macro_recovery',
        required_elements: [
          'stitching_lines',
          'button_textures',
          'fabric_grain',
          'wash_details',
        ],
      },
    },
    rendering_specs: {
      resolution: '2K',
      environmental_blend: 'light_overlayer_only',
      zero_tolerance: ['hallucination', 'color_drift', 'facial_reshaping'],
    },
  });
}

// ─── Helpers ───

export function getSkillTitle(skillType: SkillType, index: number): string {
  switch (skillType) {
    case 'change-background':
      return `换背景结果 ${index}`;
    case 'change-model':
      return `换模特结果 ${index}`;
    case 'tryon':
      return `试穿结果 ${index}`;
  }
}

export const TRYON_TAG_OPTIONS = [
  '上衣',
  '裤子',
  '裙子',
  '外套',
  '鞋子',
  '包包',
  '配饰',
  '帽子',
  '围巾',
] as const;

export const SKILL_MODES = {
  'change-background': [
    { id: 'precise', label: '精准替换', desc: '直接双图融合，高还原度' },
    { id: 'atmosphere', label: '氛围融合', desc: 'AI 理解背景氛围后融合' },
  ],
  'change-model': [
    { id: 'face-swap', label: '原图换脸', desc: '保持原图，精准替换面部' },
    { id: 'replica', label: '真人复刻', desc: '反推特征后全局重绘' },
  ],
} as const;
