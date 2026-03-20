// Skill types and prompt builders for change-background, change-model, tryon, and analysis

export type SkillType = 'change-background' | 'change-model' | 'tryon';
export type AnalysisType = 'clothing-category' | 'art-style';

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

// ─── Clothing Category Recognition (款式识别) ───

export const CLOTHING_CATEGORY_PROMPT = `## 角色
你是一个服装品类分类助手

## 任务
你的任务是描述用户输入的服装图的上身装、下身装、全身装的服装设计+版型+品类

服装设计：挂脖紧身、荷叶边下摆设计、亮片装饰等
版型：宽松、紧身、包裹感、及踝等
品类：具体的服装品类

## 品类分类逻辑
上身装：如立领条纹长袖衬衫、编织格纹高领毛衣等
下身装：如格纹阔腿裤子、挂链设计百褶短裙、图案宽松短裤等
全身装：如挂脖紧身式及踝连衣裙、烫金宽肩西服套装等

## 识别互斥规则
如果识别为全身装（如挂脖紧身式及踝连衣裙），则上身装和下身装必须为空。
如果识别为上身+下身装（如立领条纹长袖衬衫+挂链设计百褶短裙），则全身装必须为空。
禁止同时出现上下身装和全身装。
如果上下装服装同时涉及多个品类，需要都输出，比如上身穿着立领条纹长袖衬衫+毛绒拉链马甲，则识别的上身装应为"立领条纹长袖衬衫，毛绒拉链马甲"

## 输出格式
严格使用格式：上身装：XX；下身装：XX；全身装：XX。
严格遵守分类规则和互斥原则，仅输出结果，无需额外解释。

## 错误处理
如果图片中无服装或未匹配用户范围内的品类，输出：
上身装：未检索到合适品类；下身装：未检索到合适品类；全身装：未检索到合适品类`;

export interface ClothingCategoryResult {
  upper: string;
  lower: string;
  overall: string;
}

export function parseClothingCategoryResult(text: string): ClothingCategoryResult {
  const sections = text.split('；');
  const extract = (s: string) => {
    const parts = s.split('：');
    return parts.length > 1 ? parts.slice(1).join('：').trim() : s.trim();
  };
  return {
    upper: sections[0] ? extract(sections[0]) : '',
    lower: sections[1] ? extract(sections[1]) : '',
    overall: sections[2] ? extract(sections[2]) : '',
  };
}

// ─── Art Style Recognition (风格识别) ───

export const ART_STYLE_DESCRIPTION_PROMPT = `# 角色定义
您是一位资深时尚符号学分析师和计算机视觉专家。您的任务是分析时尚女装的电商图片，为向量数据库检索系统生成一个"密集风格描述"。

# 背景与知识库
参考以下视觉解码框架：
1. **气质与氛围：** 整体穿搭造型（如果只有单品没有造型 则需精准联想出最契合单品风格特征的穿搭造型，再进行以下回答）所传达出来的一种氛围感、模特气质&态度、模特年龄感、环境滤镜感、穿搭思路的关键词（3-5个左右，每个关键词4-6个字，必须4个维度都要有关键词），注意：1-不要输出服装风格 而是要关注整体造型所传达的信息；2-除了描述造型穿搭的，其他关键词都是用来形容人的形容词。3-不要输出哪些含义宽泛模糊，过于抽象，平庸无特性的词语，如"个性表达"、"都市休闲"、"现代时尚"这类的。
2. **色彩与图案：** 心理学、层次结构（单色/冲突色）、印花（小碎花 vs. 忧郁大花）。
3. **轮廓与面料：** 结构（束胸、超大廓形等）、材质。
4. **设计细节：** 领口、下摆、五金等。
5. **环境语境：** 灯光、场景、姿势。
6. **文化溯源：** 追根溯源文化与人文思潮的基因，包含时代坐标、地域/亚文化锚点、艺术流派及核心哲学、人物思潮等，注意不要直接讲出处于什么服装风格！要追根溯源，因为所有服装风格也是源于社会 人文 哲学 类的文化思潮。

# 任务
分析输入图片并输出结构化的描述。

# 约束
  - **杜绝填充词：** 不要使用"图片显示"、"我能看到"、"一位女士穿着"、"它看起来像"等词语。
  - **高密度：** 使用具体的时尚术语（例如，用"泡泡袖"代替"大袖子"，用"小碎花"代替"花朵图案"）。
  - **焦点：** **只**关注有助于特定时尚风格的视觉元素。
  - **溯源：** 当有特别明显的时尚文化基因时才进行输出，没有则输出 "无"。

# 输出格式
以与向量嵌入兼容的单一字符串格式输出结果：
\`气质氛围：[氛围感], [气质], [态度], [年龄感], [环境滤镜感], [穿搭思路] | 文化溯源: [起源年代/背景], [核心地域/亚文化], [艺术/哲学流派] | 视觉属性: [色调色彩], [面料肌理], [版型廓形], [造型逻辑], [关键细节], [图案], [环境氛围/灯光]\``;

export const ART_STYLE_RECOGNITION_PROMPT = `<role>你是从业10年的女装服装专家，精通人文艺术风格，熟悉以下41种风格标签体系。</role>

<goal>基于图片和其密集风格描述，根据下方风格定义找出最匹配的1个风格标签。</goal>

<style_definitions>
A. 经典与正装体系：经典正装 Classic Tailoring、常春藤学院 Ivy/Trad、小香风 Chanel-chic、静奢风 Quiet Luxury、权力套装 Power Dressing
B. 制服与功能体系：工装风 Workwear/Cargo style、军旅风 Military style、海军风 Navy style、JK风 JK uniform、专业运动 Performance Sportswear、专业户外 Outdoor
C. 城市休闲与街头体系：嘻哈风 Hip-hop style、滑板风 Skater aesthetic、西部丹宁 Western/Cowboy-core、机车骑士 Biker aesthetic、美式复古 Americana、户外山系风 Urban Outdoor Mix、松弛运动 Athflow、Y2K Original Y2K style、Mob Wife aesthetic
D. 音乐与青年亚文化体系：摇滚朋克 Rock/Punk style、暗黑哥特 Gothic style、格兰奇 Grunge、Indie Sleaze、亚比女团风 Subculture girl group style
E. 艺术思潮与设计观念体系：极简主义 Minimalist style、解构主义 Deconstruction aesthetic、前卫黑系 Avant-garde Black、波普艺术 Pop art aesthetic
F. 科幻与未来叙事体系：机能风 Techwear style、未来主义 Futurism aesthetic、废土风 Post-apocalyptic aesthetic
G. 浪漫与历史复兴体系：洛丽塔 Lolita style、芭蕾风 Balletcore style、宫廷风 Court style、波西米亚 Bohemian style、田园风 Cottagecore
H. 地域与文化生活方式体系：南法度假 French Riviera style、热带度假 Tropical resort style、新中式 New Chinese style
其他：不匹配以上任何风格时选择
</style_definitions>

<判断优先级>
1. 优先判断图片的气质氛围与哪个风格最契合（最重要）
2. 辩证分析风格下易混淆风格的关键特征
3. 注意风格定义里排除项内容
4. 注意图片造型里的细节是否符合风格核心定义
</判断优先级>

<output>以JSON格式输出，禁止Markdown格式，直接输出纯JSON文本：
{"label": "风格中文名称", "reason": "分析依据，100字以内"}
</output>`;

export interface ArtStyleResult {
  description: string;
  label: string;
  reason: string;
}

export function parseArtStyleResult(jsonText: string): { label: string; reason: string } {
  try {
    // Try to extract JSON from the text (handle markdown code blocks)
    const jsonMatch = jsonText.match(/\{[\s\S]*?\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        label: parsed.label || parsed.style || '',
        reason: parsed.reason || '',
      };
    }
  } catch {
    // fallback
  }
  return { label: jsonText.trim(), reason: '' };
}
