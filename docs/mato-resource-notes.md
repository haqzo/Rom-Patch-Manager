# Matoriuko resource-reference notes — English translation

**Date compiled:** 2026-11-13 | **Revision:** 2 — A049 added  
**Scope:** Offline Nintendo DS Black/White resource documentation only.  
**Provenance:** User-supplied `a011` battle-background screenshot, Chinese `ao75模型以外文件注解.docx`, `a115` message, `人物精灵模型ao49.docx`, and the accompanying A049 technical note. Translated and organized for private research; source descriptions are *not* independently gameplay-verified.  
**Safety:** These notes do not require starting, scanning, modifying, or accessing the PokeMMO client. Do not distribute ROMs or upstream-controlled assets.

## Important corrections and cautions

- `a/0/1/1` is referenced as battle **background** mapping in the shared `a011` image; do not conflate that with our intended original battle **platform** work until models are visually inspected.
- Spring/summer/autumn/winter background references are `1_46`–`1_49`; entries `1_36`–`1_39` were marked **unknown**. Do not reuse older guesses that labeled 36–39 as seasons.
- The author reports that some battle-background slots have known unresolved issues in PokeMMO. A failure in such a slot is not enough to blame the patch, resource data, or tool.
- `a/0/7/5` member `49` is identified as the Surf model in the supplied Chinese reference.
- `a/1/1/5` Fly assets contain distinct male trainer, female trainer, and Champion Alder-related takeoff/return entries. The collection may have been called “Rayquaza Fly”, but that does not establish the exact function of every component.
- The raw note says `25, 59 = Fly HM background / fly bg`, but does not identify the precise archive/path for those two numbers. **Do not guess.**

## A011 — Battle background mapping (`a/0/1/1`)

The `1_xx` labels come from the source screenshot. They are **source claims**, not confirmed working PokeMMO locations. Some slots are reportedly problematic.

### Battle-background entries

| Group | Slot | English label |
| --- | --- | --- |
| All regions | 1_36–1_39 | Unknown; source marks “??” |
| All regions | 1_46 | Spring grassland (all regions except Unova) |
| All regions | 1_47 | Summer grassland (all regions except Unova) |
| All regions | 1_48 | Autumn grassland (all regions except Unova) |
| All regions | 1_49 | Winter grassland (all regions except Unova) |
| All regions | 1_60 | Caves (all regions except Unova) |
| All regions | 1_62 | Surf/fishing (all regions) |
| All regions | 1_64 | Miscellaneous; used in places such as Kanto Pokémon Tower |
| All regions | 1_66 | Desert (all regions) |
| All regions | 1_68 | Unknown; source marks “??” |
| Unova | 1_34 | Unova grassland |
| Unova | 1_44 | Undella Town Surf/fishing |
| Unova | 1_54 | Unova caves |
| Unova | 1_56 | Unova dark caves |
| Unova | 1_58 | Unova forest / Sinnoh Safari Zone (source wording ambiguous) |
| Unova | 1_70 | Elite Four: Shauntal |
| Unova | 1_72 | Elite Four: Marshal |
| Unova | 1_74 | Elite Four: Grimsley |
| Unova | 1_76 | Elite Four: Caitlin |
| Unova | 1_78 | Zekrom / N / Ghetsis finale (first slot) |
| Unova | 1_80 | Zekrom / N / Ghetsis finale (second slot) |
| Unova | 1_82 | Champion Alder |
## A049 — Overworld character, Pokémon and object graphics (`a/0/4/9`, path to verify)

**Source:** Matoriuko's `人物精灵模型ao49.docx` (literally “Character/Pokémon sprite models A049”), supplied 2026-11-13. The source has **196 unique numbered entries** from 0 through 197; 33 and 34 are missing, and 129–131 appear again at the end. We preserve their original numbers and do not invent labels for the missing entries.

**Creator's accompanying explanation:** “The A049 file stores the overworld/follower sprites for NPCs and Gen 1–4 Pokémon. Regular mods can't replace these—they have to be edited directly inside the ROM, though they're restricted by a 16-color palette limit.” This statement is kept as a **source claim**, not an independently validated restriction for every entry. The attached document also explicitly lists later-generation Pokémon (including Munna, Reshiram and Zekrom) and numerous objects/effects. Thus, **do not relabel A049 as exclusively Gen 1–4** without clarifying the discrepancy with Matoriuko.

**Safety:** The reference is informational only. No in-place ROM editing, game-client access, or experimentation is authorized by this note. Existing clean ROMs stay untouched. If later asset inspection is approved, read-only extraction and disposable copies should be used.

**Translations below are descriptions, not verified species/trainer classifications.** Names that are unclear, apparently misspelled, or potentially inconsistent with the game are explicitly marked. The original Chinese entry is included alongside each English translation for checking with Matoriuko.

### Full A049 index — 196 entries

| ID | English translation / descriptive identification | Original Chinese text |
| ---: | --- | --- |
| 0 | Strength-pushable boulder model | 怪力推动岩石模型 |
| 1 | Strength-pushable boulder model | 怪力推动岩石模型 |
| 2 | Dragonite skull model in Nacrene Museum | 七宝博物馆快龙头骨模型 |
| 3 | Green grassy mound | 绿色草堆 |
| 4 | Earth mound (Twist Mountain) | 土堆（螺丝山） |
| 5 | Strange purple cube (undersea temple) | 紫色奇怪方块（海底神庙） |
| 6 | Starting male trainer — walking | 初始训练家行走 |
| 7 | Starting male trainer — cycling | 初始训练家骑单车 |
| 8 | Male trainer — climbing (original wording: “attached trainer”) | 附属训练家爬 |
| 9 | Starting female trainer — walking | 初始训练家女行走 |
| 10 | Starting female trainer — cycling | 初始训练家女骑单车 |
| 11 | Starting female trainer — climbing | 初始训练家女爬 |
| 12 | “Heilian” — walking (name unclear in source; verify character identity) | 黑莲行走 |
| 13 | Day-care boy with M-shaped hairline | 蛋屋男性小孩，m字发 |
| 14 | Day-care girl, bow and little pigtails, green clothes | 蛋屋女孩小孩蝴蝶结小辫子绿衣服 |
| 15 | Male NPC, blue hair and blue clothes | 蓝头发，蓝衣服，男性NPC |
| 16 | Male NPC in orange baseball cap | 橙色戴帽子，棒球帽NPC男性 |
| 17 | Male NPC, brown hair, blue outerwear and white T-shirt | 棕色头发蓝色衣服，白色T恤，男NPC |
| 18 | Male NPC, blond bangs, white formal clothing (source has typo “ipc”) | 刘海金发白色礼服男ipc |
| 19 | Woman with mushroom/bob haircut, pink short skirt and white long top | 蘑菇头粉短裙白长衫女 |
| 20 | Woman with wavy hair and a long grey-white dress | 大波浪灰白长裙女 |
| 21 | Woman with twin ponytails, glasses and blue dress | 双马尾戴眼镜蓝裙女 |
| 22 | Woman with side-parted long hair, flower on head and white dress | 一九分长发，头上有花白裙女 |
| 23 | Man with swept-up hair, green shirt and dark-blue trousers | 飞机头绿上衣，深蓝长裤男 |
| 24 | Man in purple shirt and white trousers | 紫上衣白裤子男 |
| 25 | Heavyset person with narrow eyes and pink clothing | 眯眯眼粉衣服胖子 |
| 26 | Woman with short green hair, pink top and blue trousers | 绿短发粉上衣蓝裤子女 |
| 27 | Woman with blonde airy fringe, pink top and blue skirt | 金发空气刘海粉上衣蓝裙子女 |
| 28 | Woman with brown ponytail and yellow-green apron | 棕色马尾辫黄绿围裙女 |
| 29 | Heavyset person with narrow eyes and blue clothing | 眯眯眼蓝衣服胖子 |
| 30 | Heavyset bald man in green clothing (source description garbled) | 胸脸光头绿，衣服肥佬 |
| 31 | Woman with short pink hair, pink top and orange trousers | 粉短发粉上衣橙裤子女 |
| 32 | Older woman with fluffy hair, green clothes and white apron | 蓬松头绿衣服白围裙大妈 |
| 35 | Blue-haired trainer in orange battle outfit | 蓝头发橙色战斗服训练家 |
| 36 | Blue-haired female trainer with twin ponytails and battle outfit | 蓝头发双马尾战斗服女训练家 |
| 37 | Trainer in black beret and black clothing | 黑贝雷帽黑衣训练家 |
| 38 | Female trainer with centre-parted black hair | 黑一中分女训练家 |
| 39 | Male NPC in red hood and green clothes | 红色兜帽绿衣服NPC男 |
| 40 | Woman in small green sunhat and red skirt | 小绿色遮阳帽红色裙子女 |
| 41 | Blond woman with red cowboy hat and red outfit | 红色牛仔帽，黄头发，红衣服女 |
| 42 | Black-haired woman with red cowboy hat and red outfit | 红色牛仔帽，黑头发，红衣服女 |
| 43 | Male cyclist wearing a blue visor | 蓝色遮阳帽骑单车男 |
| 44 | Female cyclist wearing a pink visor | 粉红色遮阳帽骑单车女 |
| 45 | Male swimmer wearing a white swim cap | 白色游泳帽游泳男 |
| 46 | Female swimmer with green headband and hair bun | 绿色发带丸子头游泳女 |
| 47 | Male waiter/server with centre-parted hair and formal wear | 中分礼服服务员男 |
| 48 | Female maid in headband and long yellow dress | 女仆头箍黄色长裙女 |
| 49 | Elderly white-haired man wearing cowboy outfit | 牛仔套装白头发老头 |
| 50 | Route 13 upper-class lady in small pink hat and pink clothing | 十三路贵妇粉小礼帽粉衣服 |
| 51 | Male martial artist, red headwear and white outfit | 格斗家男红色头戴白衣服 |
| 52 | Female martial artist, centre-parted hair and red fighting outfit | 格斗家女中分红色战斗服 |
| 53 | Male hiker with blue backpack (one Chinese character garbled) | 蓝色背包登山，课男 |
| 54 | Blond female hiker with red backpack | 红色背包女登山客黄头发 |
| 55 | Blue-haired doctor with face mask | 蓝头发戴口罩医生 |
| 56 | Doctor in pink clothes and pink cap | 粉衣服粉头帽医生 |
| 57 | Male office worker in suit, centre-parted hair and briefcase | 工作装手提包中分男西服 |
| 58 | Female office worker, long bangs, pink clothes and white blouse | 工作装长刘海粉，衣服，白衬衫女 |
| 59 | Circus clown in yellow costume | 马戏团小丑黄衣服 |
| 60 | Male dancer with dreadlocks and green clothing | 脏发辫，绿衣服跳舞男 |
| 61 | Glasses-wearing guitarist in green clothing | 戴眼镜弹吉他绿衣服 |
| 62 | Male baseball player, black cap with red trim | 棒球服，黑帽子，红边缘，男 |
| 63 | Blond, blue-eyed person in purple clothing (described as foreigner) | 黄头发，蓝眼睛，紫衣服，外国人 |
| 64 | Person in heavy orange American-football armour | 全身重型橙色橄榄球铠甲人 |
| 65 | Athletic woman with white visor, short blond ponytail and blue outfit | 白遮阳帽，黄短马尾蓝衣服运动女 |
| 66 | Bald delinquent in black leather jacket and red trousers | 光头黑皮衣红裤子混混 |
| 67 | Motorcycle gang delinquent in riding outfit | 骑摩托暴走服混混 |
| 68 | Explorer in exploration hat and green clothing | 探险帽绿衣服探险家 |
| 69 | Explorer with backpack and red straw hat | 带背包，红色草帽探险家 |
| 70 | Woman in baby-style cap and green skirt | 婴儿帽绿裙子女 |
| 71 | Narrow-eyed woman in chef hat | 厨师帽眯眯眼女 |
| 72 | Worker in yellow hat, blue outfit and cold-weather trousers | 黄帽蓝衣服防寒裤员工 |
| 73 | Male railway police officer in green uniform | 绿色铁路警察套装男 |
| 74 | Elderly woman with white centre-parted hair and green clothing | 白色中分绿衣服老太太 |
| 75 | Man with blue cap, blue outfit and document envelope in hand | 蓝帽子，蓝衣服手上拿这个文件袋男 |
| 76 | Officer in blue police uniform | 蓝色警察服 |
| 77 | Officer in black police uniform | 黑色警察服 |
| 78 | Male researcher with glasses, centre-parted black hair and white lab coat | 戴眼镜，黑中分白袍研究员 |
| 79 | Female researcher with glasses and white lab coat | 戴眼镜白袍女研究员 |
| 80 | NPC with blue hat, holding something in both hands (face colour unclear) | 双手捧着东西蓝帽，红颜NPC |
| 81 | Female NPC with blue straw hat, holding something in both hands | 双手捧着东西蓝色草帽女NPC |
| 82 | Shop clerk wearing blue apron | 蓝色围裙店员 |
| 83 | Hospital nurse | 医院护士小姐 |
| 84 | Maid with white hair ornament and red dress | 白发簪红裙女仆 |
| 85 | Same as entry 84, per source | 同上 |
| 86 | Male character with headphones and turquoise clothes | 戴耳机青色衣服男 |
| 87 | Female character with headphones, light-coloured top and grey skirt | 戴耳机轻上衣灰裙子女 |
| 88 | Large bodyguard in dark clothes and sunglasses | 墨镜，黑衣保镖大汉 |
| 89 | Woman holding a pink parasol | 粉色遮阳伞女 |
| 90 | Grass-type Gym Leader (identity not specified) | 草系道馆馆主 |
| 91 | Normal-type Gym Leader (identity not specified) | 普通系道管管主 |
| 92 | Bug-type Gym Leader (identity not specified) | 虫系道馆馆主， |
| 93 | Electric-type Gym Leader (identity not specified) | 电系道管管主 |
| 94 | Ground-type Gym Leader (identity not specified) | 地面系道管管主 |
| 95 | Flying-type Gym Leader (identity not specified) | 飞行系道馆馆主 |
| 96 | Ice-type Gym Leader (identity not specified) | 冰系道馆馆主 |
| 97 | Dragon-type Gym Leader (identity not specified) | 龙系道馆馆主 |
| 98 | Small purple-haired character wearing a black scarf | 紫头发，黑围巾小人 |
| 99 | Male character with hair flicked out to either side, red T-shirt and formal clothing | 头发两边翘起来，红T恤礼服男 |
| 100 | Dark-skinned worker, orange hat and eyebrows, cyan clothes | 黑皮肤，橙帽子，橙眉毛，青衣工人 |
| 101 | Psychic-type Elite Four member (identity not specified) | 超能系天王 |
| 102 | Unova Champion with red/flame-like hair (Alder implied; verify model) | 合众冠军红毛火焰 |
| 103 | Long-haired woman in white hood, labelled Team Galactic in source (verify faction) | 银河队白兜帽长发女 |
| 104 | Female white-hooded team member, labelled Team Galactic in source (verify faction) | 银河队白兜帽队员女 |
| 105 | Green-haired boss, labelled Team Galactic in source (verify faction) | 银河队老大绿头发 |
| 106 | Brown-haired older man, labelled Team Galactic in source (verify faction) | 银河队棕色老头 |
| 107 | Princess-style pink dress with long pink hair | 粉色长发公主裙 |
| 108 | N (character name as written) | N |
| 109 | Female rival’s father (identity unspecified) | 女劲敌老爹 |
| 110 | Professor at the starting location | 出生点博士 |
| 111 | International Police officer | 国际警察 |
| 112 | Ship captain in white hat and coat | 船长服白帽白袍 |
| 113 | Cut (HM) — chopping tree | 聚合斩砍树 |
| 114 | Poké Ball item lying on the ground | 地上精灵球，道具 |
| 115 | Animated Pikachu | 皮卡丘动态 |
| 116 | Green thundercloud-like figure (exact species unspecified) | 绿色雷电云 |
| 117 | Blue thundercloud-like figure (exact species unspecified) | 蓝色雷电云 |
| 118 | Steel-type / bean-like sheep? (source shorthand unclear) | 刚系豆系羊 |
| 119 | Rock/fighting bull-like Pokémon? (source shorthand unclear) | 岩斗牛 |
| 120 | Grass/fighting sheep-like Pokémon? (source shorthand unclear) | 草斗羊 |
| 121 | Orange thundercloud-like figure (exact species unspecified) | 橙色雷电云 |
| 122 | Ice-dragon / orb / “Thunder Mother”? (source phrase unclear) | 冰龙球雷母 |
| 123 | Water horse-like Pokémon (exact species unspecified) | 水马 |
| 124 | Singer/diva Pokémon (exact species unspecified) | 歌姬 |
| 125 | Volcarona | 火神蛾 |
| 126 | Victini (“Victory Pokémon”) | 胜利之神 |
| 127 | Munna | 梦悠悠 |
| 128 | Musharna | 梦悠悠进化体 |
| 129 | Patrat | 探探鼠 |
| 130 | Day-care grass-type Pokémon (species not reliably named in source) | 蛋屋草精灵 |
| 131 | Day-care chestnut-coloured rodent (species not reliably named in source) | 蛋屋板栗老鼠 |
| 132 | Delinquent/crocodile-like Pokémon (species unclear) | 混混鳄鱼 |
| 133 | Heavyset musician with glasses playing a large string instrument | 大手琴戴眼镜胖子 |
| 134 | Dark-skinned person with close-cropped hair and green clothes | 黑人寸头绿衣服 |
| 135 | Female rival “Bailian” (name transliteration uncertain) | 女劲敌白莲 |
| 136 | Male trainer — throwing animation (source has typo) | 难训练家投掷 |
| 137 | Female trainer — throwing animation (source has typo) | 女训练家投资 |
| 138 | Male trainer — crouching animation | 难训练家蹲下 |
| 139 | Female trainer — crouching animation | 女训练家蹲下 |
| 140 | Male trainer — crouching animation (second entry) | 难训练家蹲下 |
| 141 | Female trainer — crouching animation (second entry) | 女训练家蹲下 |
| 142 | Black dragon summoning stone | 黑龙召唤石 |
| 143 | White dragon summoning stone | 白龙召唤石 |
| 144 | Player's mother at home | 家里老妈 |
| 145 | Chargestone Cave shattering / animated spiderweb-like effect | 电石洞穴破碎，动画蜘蛛网 |
| 146 | Flute-playing woman with green bow and green dress | 吹长笛，绿蝴蝶结，绿裙女 |
| 147 | Harmonica player with glasses and blue cap (male) | 吹口风琴，戴眼镜，蓝帽子男 |
| 148 | Harmonica player in green dress, hair partly covers face (female) | 吹口风琴，遮半边脸绿裙女 |
| 149 | Boy with yellow safety helmet and blue clothes | 黄色安全帽，蓝衣服，小孩 |
| 150 | Girl with yellow safety helmet and blue clothes | 黄色安全帽，蓝衣服小女孩 |
| 151 | Miner with headlamp helmet and brown clothes | 头灯安全帽矿工棕色衣服 |
| 152 | Male trainer — throwing a Poké Ball | 训练家投掷精灵球男 |
| 153 | Female trainer — throwing a Poké Ball | 训练家投掷精灵球女 |
| 154 | Male trainer — balancing/wobbling on a narrow log | 训练家独木上摇摇晃晃男 |
| 155 | Female trainer — balancing/wobbling on a narrow log | 训练家独木上摇摇晃晃女 |
| 156 | Male trainer — fishing animation (source has typo) | 难训练家钓鱼动画 |
| 157 | Female trainer — fishing animation | 女训练家钓鱼动画 |
| 158 | Water-type Gym Leader (identity not specified) | 水系道管管主 |
| 159 | Fire-type Gym Leader (identity not specified) | 火系道馆馆主 |
| 160 | Old man with white hair and beard (one source character garbled) | 白发白胡子撞老头 |
| 161 | Ice-cream-cone object/Pokémon (identity not specified) | 雪糕筒 |
| 162 | White-haired ninja | 白色头发忍者 |
| 163 | Short-haired person with medium skin tone and purple clothing | 中皮肤短发紫衣人 |
| 164 | Woman in purple clothing | 紫衣女 |
| 165 | Darmanitan in Zen-like statue form | 达摩狒狒达摩雕像 |
| 166 | Older man with short white hair/balding crown, dark sunglasses, white formal wear, brown trousers | 白短发地中海黑墨镜白礼服棕裤子 |
| 167 | Older man with white balding hair and dark-green hat, labelled Team Galactic in source | 银河队老头白地中海深绿帽 |
| 168 | Older man with grey balding hair and dark-green hat, labelled Team Galactic in source | 银河队老头灰地中海深绿帽 |
| 169 | Balding old man with white beard and dark-green hat | 地中海老头白胡子光头深绿帽 |
| 170 | Older man with white balding hair, white beard, narrow eyes and brown hat, labelled Team Galactic in source | 银河队老头白地中海白胡子眯眯眼棕色帽 |
| 171 | Older man with brown balding hair and brown hat, labelled Team Galactic in source | 银河队老头棕头发棕色地中海帽子 |
| 172 | Woman with crossed golden hair accessories and white dress | 金色叉叉头发白裙女 |
| 173 | Animated Zorua | 索罗亚动态 |
| 174 | Red trophy | 红色奖杯 |
| 175 | Blue trophy | 蓝色奖杯 |
| 176 | Green trophy | 绿色奖杯 |
| 177 | Wall-mounted notice board | 墙上挂记事板 |
| 178 | Wall-mounted notice board (second entry) | 墙上挂记事板 |
| 179 | Blue battle flag | 蓝色战旗 |
| 180 | Black-haired man, face partly hidden, playing a hand-held string instrument | 手上弹琴，遮半边脸黑发男 |
| 181 | Pushable boulder | 可以推的石头 |
| 182 | Ship captain with blue cap | 蓝帽子船长 |
| 183 | Gift box for selecting a starter Pokémon | 开局选精灵礼物盒 |
| 184 | Whimsicott | 风妖精 |
| 185 | Pick-up Poké Ball item on the ground | 地上可以捡的精灵球 |
| 186 | Animated Reshiram | 白龙动态 |
| 187 | Animated Reshiram with mouth open | 白龙动态，张嘴 |
| 188 | Animated Zekrom | 黑龙动态 |
| 189 | Animated Zekrom with mouth open | 黑龙动态张嘴 |
| 190 | Cynthia (source calls her “older sister Cynthia”) | 竹兰姐 |
| 191 | Pick-up Poké Ball item (source has a typo) | 可以减的精灵球 |
| 192 | Pink seasonal Deerling (likely; source transliteration imperfect) | 粉色四季露 |
| 193 | Green seasonal Deerling (likely; source transliteration imperfect) | 绿色四纪录 |
| 194 | Orange seasonal Deerling (likely; source transliteration imperfect) | 橙色四纪录 |
| 195 | Brown seasonal Deerling (likely; source transliteration imperfect) | 棕色四季路 |
| 196 | Flying Reshiram | 白龙飞行 |
| 197 | Flying Zekrom | 黑龙飞行 |

### A049 translation and research cautions

- **IDs 33–34** are not covered in the supplied document; do not assign names.
- **IDs 129–131** are repeated at the end of the document and retained once in this sorted index.
- **Source terminology may be informal or contain typos:** entries 103–106 and 167–171 refer to “Team Galactic” in Chinese; that may be an author shorthand or misidentification and should be checked, not silently substituted.
- **Direct-ROM editing and 16-colour palette restriction** were stated by Matoriuko but have **not been verified across these entries**. No ROM modifications will be performed during translation or organization.
- Some entries are descriptive of **objects and visual effects**, not only people or Pokémon. Explicit Gen 5 examples in the source mean the “Gen 1–4” scope needs clarification.
- Use the reference for offline classification and subsequent visual confirmation; no gameplay or PokeMMO client tests are implied.


## A075 — Other files and asset notes (`a/0/7/5`)

The original document uses `5_N` where `N` is the member index within `a/0/7/5`. File-type indicators (`BTX0`, `BMD0`, etc.) are retained exactly. The source sometimes uses tentative descriptions (“looks like”, “not yet found”).

### Members 0–46: BTX0 textures

| Member | Translated note |
| --- | --- |
| 0 | Green grass: scattered blades when walking through grass |
| 1 | Teal-green short grass: scattered blades when walking through short grass |
| 2 | Gray-green short grass: scattered blades when walking through short grass |
| 3 | Yellow-green short grass: scattered blades when walking through short grass |
| 4 | Light-green short grass: scattered blades when walking through short grass |
| 5 | Snow-covered short grass: scattered blades when walking through short grass |
| 6 | Green medium-length grass: scattered blades when walking through medium grass |
| 7 | Teal-green medium-length grass: scattered blades when walking through medium grass |
| 8 | Light-green medium-length grass: scattered blades when walking through medium grass |
| 9 | Teal-green medium-length grass: scattered blades when walking through medium grass |
| 10 | Snow-covered medium-length grass: scattered blades when walking through medium grass |
| 11 | Green tall grass: scattered blades when walking through tall grass |
| 12 | Teal-green tall grass: scattered blades when walking through tall grass |
| 13 | Gray-green tall grass: scattered blades when walking through tall grass |
| 14 | Yellow-green tall grass: scattered blades when walking through tall grass |
| 15 | Partially cropped green tall grass: scattered blades |
| 16 | Partially cropped green tall grass: scattered blades |
| 17 | Partially cropped green tall grass: scattered blades |
| 18 | Partially cropped yellow-green tall grass: scattered blades |
| 19 | Footprint on sand, facing/moving up |
| 20 | Footprint on sand, facing/moving down |
| 21 | Footprint on sand, facing/moving left |
| 22 | Footprint on sand, facing/moving right |
| 23 | Bicycle straight tire tracks on sand, vertical direction |
| 24 | Bicycle straight tire tracks on sand, horizontal direction |
| 25 | Bicycle turn tracks on sand, south to east |
| 26 | Bicycle turn tracks on sand, south to west |
| 27 | Bicycle turn tracks on sand, north to east |
| 28 | Bicycle turn tracks on sand, west to north |
| 29 | Footprint in shallow puddle, up |
| 30 | Footprint in shallow puddle, down |
| 31 | Footprint in shallow puddle, left |
| 32 | Footprint in shallow puddle, right |
| 33–38 | Possibly Relic Castle sand-flow / sand-trap textures (source says “seems to be”) |
| 39 | Bicycle straight tire tracks in shallow puddle, vertical direction |
| 40 | Bicycle straight tire tracks in shallow puddle, horizontal direction |
| 41 | Bicycle turn tracks in shallow puddle, south to east |
| 42 | Bicycle turn tracks in shallow puddle, south to west |
| 43 | Bicycle turn tracks in shallow puddle, north to east |
| 44 | Bicycle turn tracks in shallow puddle, west to north |
| 45 | Expanding white circular texture; function unknown |
| 46 | Expanding white circular texture; function unknown |
### Members 47–95: BMD0 models and effects

| Member | Translated note |
| --- | --- |
| 47 | Black shadow beneath the player character |
| 48 | Dust kicked up alongside bicycle wheels |
| 49 | Surf model |
| 50 | Exclamation-mark speech bubble above an NPC when initiating battle |
| 51 | Question-mark speech bubble above an NPC during dialogue |
| 52 | Music-note speech bubble above a music-related NPC |
| 53 | Three-dot speech bubble above a battle-ready NPC |
| 54–59 | Wave/splash effects; possibly for Waterfall or Surf (tentative) |
| 60 | Green shaking-grass encounter effect |
| 61 | Teal-green shaking-grass encounter effect |
| 62 | Yellow-green shaking-grass encounter effect |
| 63 | Green shaking-grass encounter effect with some white edging |
| 64 | Green shaking-grass encounter effect |
| 65 | Teal-green shaking-grass encounter effect |
| 66 | Yellow-green shaking-grass encounter effect |
| 67 | Snowy shaking-grass encounter effect |
| 68 | Two green medium-height grass clumps |
| 69 | Two green medium-height grass clumps |
| 70 | Two light-green medium-height grass clumps |
| 71 | Two yellow-green medium-height grass clumps |
| 72 | Light-coloured water-surface encounter effect |
| 73 | Light-coloured water-surface encounter effect |
| 74 | Dark-coloured water-surface encounter effect |
| 75 | Shadow encounter effect |
| 76 | Dust-cloud encounter effect |
| 77 | Brown cloud/fog-like mass |
| 78 | Large movable blue crystal in Chargestone Cave |
| 79 | Small floating blue crystal in Chargestone Cave, shakes when approached |
| 80 | Something that looks like a wire texture (tentative) |
| 81 | Expanding circular ripple on water, possibly during fishing (tentative) |
| 82 | Fishing-bobber-like item with surrounding yellow burst effect (tentative) |
| 83 | Small water droplets splashing as fishing bobber bobs (tentative) |
| 84 | Stationary fishing bobber in water |
| 85–92 | Train carriages in various colours at Nimbasa City subway station |
| 93 | Brown mound emitting brown smoke upwards |
| 94 | Green mound emitting leaf-like particles upwards |
| 95 | Splash effect, as though something has fallen into water (tentative) |
### Members 96–106: BTP0 material/texture-pattern animations

| Member | Translated note |
| --- | --- |
| 96 | BTP0 “Hero kenu”; same-named bone/binding noted |
| 97 | BTP0 “Taki loops”; lambert4/5 bindings |
| 98 | BTP0 “Takiroopf”; lambert4/5 bindings |
| 99 | BTP0 “Takistartf”; lambert4/5 bindings |
| 100 | BTP0 “Takistarts”; lambert4/5 bindings |
| 101 | BTP0 “ivakuda ki”; lambert3 binding |
| 102 | BTP0 “d6_yu_kabiri01”; biri01-1 binding |
| 103 | BTP0 “Fishing lure”; Fishing lure1 binding |
| 104 | BTP0 “mvhidetsuchi”; mvkusa/tsuchi_1 binding |
| 105 | BTP0 “mvhidekusa”; mvkusa/tsuchi_1 binding |
| 106 | BTP0 “Shibu ki”; same-named bone/binding noted |
### Members 107–127: BCA0 skeletal animations

| Member | Translated note |
| --- | --- |
| 107 | “Shibuki01”, bound to pCube1; top/bottom sides rapidly contract inward |
| 108 | “Taki_land”, bound to pCube1; jumps upward then drops forward |
| 109 | “taki_loop_s”, pCube1; visible animation effect not yet found |
| 110 | “taki_roop_f”, pCube1; visible animation effect not yet found |
| 111 | “taki_start_f”, pCube1; visible animation effect not yet found |
| 112 | “taki_start_s”, pCube1; visible animation effect not yet found |
| 113 | “ivakudaki”, pCube1; visible animation effect not yet found |
| 114 | “iaigiri”, pCube1; visible animation effect not yet found |
| 115 | “freshwater_in” (water-surface encounter), pCube1; subtle inward scaling |
| 116 | “freshwater_out” (water-surface encounter), pCube1; subtle inward scaling |
| 117 | “sea_out”, pCube1; subtle inward scaling |
| 118 | “Bird_shadow” (shadow encounter), pCube1; subtle inward scaling |
| 119 | “soil_smoke” (dust-cloud encounter), pCube1; rapidly scales inward |
| 120 | “d6_ishi_big01”, pCube1; slow up/down motion |
| 121 | “d6_ishi_big02”, pCube1; slow rotation/orbit around 3D cursor, moving left/back/right |
| 122 | “d6_ishi_mini01”, pCube1; visible animation effect not found |
| 123 | “d6_ishi_mini02”, pCube1; visible animation effect not found |
| 124 | “b_train_a1”, pCube1; moves left and snaps/teleports between positions |
| 125 | “b_train_a2”, pCube1; moves left and snaps/teleports between positions |
| 126 | “b_train_a3”, pCube1; moves left and snaps/teleports between positions |
| 127 | “b_train_a4”, pCube1; moves left and snaps/teleports between positions |
### Members 128–132: BMA0 material animations

| Member | Translated note |
| --- | --- |
| 128 | “taki_land”, lambert2; visible animation effect not yet found |
| 129 | “ivakudaki”, hahen1/2/3 and lambert3; visible effect not yet found |
| 130 | “iaigiri”, ha1/2/3 and lambert2/t3; visible effect not yet found |
| 131 | “ava”, ava_a; visible effect not yet found |
| 132 | “bird_shadow”, tori_kage01_lm1 original shadow texture; fades to zero opacity / fades in and out |
### Members 133–150: BTA0 texture/material animations

| Member | Translated note |
| --- | --- |
| 133 | “shibuki01”, shibuki01.lm1; visible effect not yet found |
| 134 | “short_grass_sp”, ee_kusa_sp_lm1; jerks left, then downward |
| 135 | “short_grass_su”, ee_kusa_su_lm1; jerks left, then downward |
| 136 | “short_grass_au”, ee_kusa_au_lm1; jerks left, then downward |
| 137 | “short_grass_wi”, ee_kusa_wi_lm1; jerks left, then downward |
| 138 | “short_grass_sp2”, ee_kusa_sp_lm1; jerks left, then downward |
| 139 | “short_grass_su2”, ee_kusa_su_lm1; jerks left, then downward |
| 140 | “short_grass_au2”, ee_kusa_au_lm1; jerks left, then downward |
| 141 | “short_grass_wi2”, ee_kusa_wi_lm1; jerks left, then downward |
| 142 | “long_grass_sp”, nage_kusa_sp; gentle swaying left/right |
| 143 | “long_grass_su”, nage_kusa_su; gentle swaying left/right |
| 144 | “long_grass_au”, nage_kusa_au; gentle swaying left/right |
| 145 | “long_grass_wi”, nage_kusa_wi; gentle swaying left/right |
| 146 | “bird_shdow” [spelling in source], tori_kage01_lm1; slowly rotates 360° around centre |
| 147 | “soil_smoke”, mogu_kemu01/02_lm1 original dust-cloud texture; rotates |
| 148 | “ivakudaki”, hahen1/2/3; visible effect not yet found |
| 149 | “iaigiri”, ha1/2/3; visible effect not yet found |
| 150 | “ava”, ava_a; visible effect not yet found |
## A115 — Fly models and animations (`a/1/1/5`)

This section was provided as a short Chinese message. “回收” is translated conservatively as **return/arrival** rather than asserting an exact animation behavior.

### Fly model and animation references

| Type | Member(s) | English meaning |
| --- | --- | --- |
| Models (BMD0) | 58 | fly_out123 — male trainer Fly takeoff model |
| Models (BMD0) | 103 | fly_out123 — Champion Alder Fly takeoff model (source spells name 阿克戴; confirm) |
| Models (BMD0) | 107 | fly_out123 — female trainer Fly takeoff model |
| Models (BMD0) | 66 | fly_in123 — male trainer Fly return/arrival model |
| Models (BMD0) | 111 | fly_in123 — female trainer Fly return/arrival model |
| Skeletal animation (BCA0) | 60 | fly_out — male trainer takeoff animation |
| Skeletal animation (BCA0) | 104 | fly_out — Champion Alder takeoff animation (name needs confirmation) |
| Skeletal animation (BCA0) | 108 | fly_out — female trainer takeoff animation |
| Skeletal animation (BCA0) | 67 | fly_in — return/arrival animation; trainer assignment not explicitly stated |
| Skeletal animation (BCA0) | 112 | fly_in — return/arrival animation; trainer assignment not explicitly stated |
| Uncertain reference | 25, 59 | “Fly HM background / fly bg”; archive/path and relationship to above entries not specified |
### Original A115 message (preserved for cross-check)

> a115  
> 起飞模型（BMD0），fly_out123:58(男训练家），103（冠军阿克戴），107（女训练家），  
> 回收、fly_in123:66（男训练家）.111（女训练家）  
> 起飞动画（BCA0）out.60（男训练家），104（冠军阿克戴），108（女训练家）  
> 回收动画in.67，112  
> 25，59飞翔HM背景fly bg

## What remains unknown

- A049 note: Whether the reported A049 direct-ROM/16-colour limits apply to every resource entry; and how the “Gen 1–4” summary relates to the later-generation entries in the document.

1. Whether each battle-background label corresponds to a functioning slot in current PokeMMO.
2. Exact rendered visual effect of many individual atomic patch components.
3. Precise function and archive location of the `25, 59` Fly-HM background note.
4. Which individual Fly component maps to each visible motion or Rayquaza-related effect.
5. Compatibility or permission to redistribute assets beyond the author's reported permission; independently owned assets require separate review.

**Verification policy:** distinguish (a) author reference, (b) file signature/resource mapping, (c) rendered visual preview, and (d) observed in-game behavior. Never treat (a) alone as (d).
