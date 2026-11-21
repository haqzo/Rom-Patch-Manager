#!/usr/bin/env node
/*
 * Builds library/ (raw BMD0/BCA0/… files + library.json) from:
 *   - MaToRiuKo's raw files (1.zip, Universal custom, transparent BG)
 *   - raw members extracted from the converted per-slot BPS library (extract-raw.mjs → store/)
 * Every file is stored once, named by content hash. No ROM data beyond the mods themselves.
 *
 *   node scripts/build-library.mjs <x-dir with a1/ store/ ubg/ english/>
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import * as rom from '../app/core/rom.js';

const X = process.argv[2] || '/home/claude/x';
const OUT = path.resolve('app/library');
const CLEAN = process.argv[3];
fs.mkdirSync(path.join(OUT, 'files'), { recursive: true });
const store = JSON.parse(fs.readFileSync(path.join(X, 'store/index.json'), 'utf8'));

const EXT = { BMD0: 'nsbmd', BCA0: 'nsbca', BTX0: 'nsbtx', BTA0: 'nsbta', BTP0: 'nsbtp', BMA0: 'nsbma', BVA0: 'nsbva' };
const files = new Map(); // hash.ext -> fingerprint
const origin = new Map(); // hash.ext -> original creator file name (kept for credits/debugging)
function put(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const h = crypto.createHash('sha256').update(b).digest('hex').slice(0, 16);
  const name = `${h}.${EXT[rom.magic(b)] || 'bin'}`;
  const p = path.join(OUT, 'files', name);
  if (!fs.existsSync(p)) fs.writeFileSync(p, b);
  files.set(name, rom.fingerprint(b));
  return name;
}
const raw = (rel) => { const n = put(fs.readFileSync(path.join(X, rel))); if (!origin.has(n)) origin.set(n, rel.replace(/^(a1|english)\//, '').replace('#U00e9', 'é')); return n; };
const fromStore = (label, member, archive) => {
  const it = store[label]?.find((i) => i.member === member && (!archive || i.path === archive));
  if (!it) throw new Error(`missing ${label} ${member}`);
  return put(fs.readFileSync(path.join(X, 'store', it.file)));
};
const storeWrites = (label) => store[label].map((i) => { const file = put(fs.readFileSync(path.join(X, 'store', i.file))); if (!origin.has(file)) origin.set(file, `${label} (${i.path} #${i.member})`); return { path: i.path, member: i.member, file }; });
const narcMember = (rel, i) => put(rom.parseNarc(new Uint8Array(fs.readFileSync(path.join(X, rel)))).members[i]);

const T = (en, zh, es) => ({ en, zh, es: es ?? en });
const items = [];
const add = (o) => items.push(o);

// ------------------------------------------------------------ Surf (a/0/7/5 #49)
const SURF = 'a/0/7/5';
const surf = [
  ['surf-lapras', T('Lapras', '拉普拉斯'), 'a1/Surf Models/Lapras.nsbmd'],
  ['surf-kyogre', T('Kyogre', '盖欧卡'), 'a1/Surf Models/Kyogre.nsbmd'],
  ['surf-kyogre-big', T('Kyogre (big)', '盖欧卡（大号）', 'Kyogre (grande)'), 'a1/Surf Models/KyogreBIG.nsbmd'],
  ['surf-groudon', T('Groudon', '固拉多'), 'a1/Surf Models/Groudon.nsbmd'],
  ['surf-mega-charizard-x', T('Mega Charizard X', '超级喷火龙X', 'Mega Charizard X'), 'a1/Surf Models/Mega Charizard X.nsbmd'],
  ['surf-miraidon', T('Miraidon', '密勒顿'), 'a1/Surf Models/Miraidon.nsbmd'],
  ['surf-dudunsparce', T('Dudunsparce', '土龙节节'), 'a1/Surf Models/Dudunsparce.nsbmd'],
  ['surf-mini-merry', T('Mini Merry II', '迷你梅利号 II'), 'a1/Surf Models/Mini Merry2.nsbmd'],
  ['surf-nyan-cat', T('Nyan Cat', '彩虹猫'), 'a1/Surf Models/Nyan Cat.nsbmd'],
  ['surf-big-truck', T('Cynthia (“Big Truck”)', '竹兰（“大卡车”）', 'Cintia (“Big Truck”)'), 'a1/Surf Models/Big Truck.nsbmd'],
  ['surf-xianxia-sword', T('Xianxia Flying Sword', '仙侠飞剑', 'Espada voladora Xianxia'), 'a1/Surf Models/Xianxia Flying Sword.nsbmd'],
  ['surf-player-only', T('Just the trainer (no ride)', '只有训练家（无坐骑）', 'Solo el entrenador (sin montura)'), 'a1/Surf Models/Player Riding Base Model Template.nsbmd'],
];
for (const [id, name, rel] of surf) {
  const f = raw(rel);
  add({ id, cat: 'surf', name, by: 'MaToRiuKo', writes: [{ path: SURF, member: 49, file: f }], view: { model: f, kind: 'object' } });
}
// Ace ships: surf model + the matching wave effect (#54) travel together
const aceWave = fromStore('surf-ace-ship-companion-model-resource-54', 54);
for (const [id, name, label] of [
  ['surf-ace-striker', T("Ace's Striker (sails up)", '艾斯的小艇（扬帆）', 'Striker de Ace (velas desplegadas)'), 'surf-ace-sailing-ship-surf'],
  ['surf-ace-furled', T("Ace's Striker (sails furled)", '艾斯的小艇（收帆）', 'Striker de Ace (velas plegadas)'), 'surf-ace-furled-ship-surf'],
]) {
  const f = fromStore(label, 49);
  add({ id, cat: 'surf', name, by: 'MaToRiuKo', linked: T('Includes its own water splash effect', '包含配套的水花特效', 'Incluye su propio efecto de agua'), writes: [{ path: SURF, member: 49, file: f }, { path: SURF, member: 54, file: aceWave }], view: { model: f, kind: 'object' } });
}

// ------------------------------------------------------------ Fly (a/1/1/5)
const FLY = 'a/1/1/5';
const flyFromStore = (label) => storeWrites(label).filter((w) => w.path === FLY);
{
  const w = flyFromStore('Mega-Charizard-Y-Fly');
  add({ id: 'fly-mega-charizard-y', cat: 'fly', name: T('Mega Charizard Y', '超级喷火龙Y'), by: 'MaToRiuKo', linked: T('Take-off + landing models and animations for male, female and Champion trainers', '男/女/冠军训练家的起飞与降落模型和动画', 'Modelos y animaciones de despegue y aterrizaje (chico, chica y Campeón)'), writes: w, view: { model: w.find((x) => x.member === 58).file, anim: w.find((x) => x.member === 60).file, kind: 'object' } });
}
{
  const w = flyFromStore('Xianxia-Flying-Sword');
  add({ id: 'fly-xianxia-sword', cat: 'fly', name: T('Xianxia Flying Sword', '仙侠飞剑（御剑飞行）', 'Espada voladora Xianxia'), by: 'MaToRiuKo', linked: T('Take-off + landing models for all trainers', '所有训练家的起飞与降落模型', 'Modelos de despegue y aterrizaje para todos'), writes: w, view: { model: w.find((x) => x.member === 58).file, kind: 'object' } });
}
{
  const w = flyFromStore('legendary-fly-complete');
  add({ id: 'fly-legendary', cat: 'fly', name: T('Legendary Fly — Rayquaza (complete)', '传说飞翔 — 烈空坐（完整）', 'Vuelo legendario — Rayquaza (completo)'), by: 'MaToRiuKo', linked: T('All 11 files: take-off and landing models + animations for male, female and Champion trainers, and #118 (originally the cave cut-in model “cave_ci”), exactly as in the original Legendary patch', '全部 11 个文件：男/女/冠军训练家的起飞与降落模型和动画，以及 #118（原为洞穴过场模型 cave_ci），与原版传说补丁完全一致', 'Los 11 archivos: modelos y animaciones de despegue y aterrizaje (chico, chica, Campeón) y el #118 (originalmente el modelo “cave_ci” de la cueva), igual que el parche Legendario original'), writes: w, view: { model: w.find((x) => x.member === 58).file, anim: w.find((x) => x.member === 60).file, kind: 'object' } });
}

// ------------------------------------------------------------ TM/HM + Fly backgrounds (a/1/1/5 #25, #59)
add({ id: 'hm-clean', cat: 'hmbg', name: T('Clean TM/HM background', '干净的招式学习器/秘传背景', 'Fondo MT/MO limpio'), by: 'Community', writes: storeWrites('Clean-TM-HM-Background'), view: null });
add({ id: 'hm-clean-alt', cat: 'hmbg', name: T('Clean TM/HM background (alt.)', '干净的招式学习器/秘传背景（另一版）', 'Fondo MT/MO limpio (alt.)'), by: 'Community', writes: storeWrites('Clean-TM-Mixed-Extra-Member25'), view: null });
{
  const rel = 'a1/Fly Models/Mega Charizard Y (Fly)/a115';
  add({ id: 'hm-mato', cat: 'hmbg', name: T('Clean HM + Fly cut-in backgrounds', '干净的秘传 + 飞翔背景', 'Fondos limpios de MO y Vuelo'), by: 'MaToRiuKo', linked: T('Also cleans the Fly cut-in background (#59)', '同时替换飞翔过场背景 (#59)', 'También limpia el fondo de Vuelo (#59)'), writes: [{ path: FLY, member: 25, file: narcMember(rel, 25) }, { path: FLY, member: 59, file: narcMember(rel, 59) }], view: null });
}

// ------------------------------------------------------------ Battle platforms (a/0/1/1 #0–33)
const BG = 'a/0/1/1';
add({ id: 'disc-none', cat: 'platforms', name: T('No battle ground', '无战斗圆盘', 'Sin plataforma de combate'), by: 'Community', desc: T('Removes the round platforms under the Pokémon in every battle.', '去掉所有战斗中宝可梦脚下的圆盘。', 'Quita las plataformas redondas bajo los Pokémon en todos los combates.'), writes: storeWrites('No-Battle-Ground'), view: null });
add({ id: 'disc-none-classic', cat: 'platforms', name: T('No battle ground (classic xdelta)', '无战斗圆盘（经典 xdelta 版）', 'Sin plataforma (xdelta clásico)'), by: 'Community', writes: storeWrites('No-Battle-Ground-Xdelta-Original'), view: null });
{
  const f = raw('a1/Transparent Battle Platforms (Discs)/bw1/1mx.nsbmd');
  add({ id: 'disc-transparent', cat: 'platforms', name: T('Transparent discs', '透明战斗圆盘', 'Plataformas transparentes'), by: 'MaToRiuKo', writes: Array.from({ length: 34 }, (_, i) => ({ path: BG, member: i, file: f })), view: { model: f, kind: 'object' } });
}

// ------------------------------------------------------------ Battle background slots (a/0/1/1 pairs)
const SLOTS = [
  [34, 35, T('Unova grass', '合众草地', 'Hierba de Teselia')],
  [36, 40, T('Slot 36 (unconfirmed)', '槽位 36（未确认）', 'Ranura 36 (sin confirmar)')],
  [37, 41, T('Slot 37 (unconfirmed)', '槽位 37（未确认）', 'Ranura 37 (sin confirmar)')],
  [38, 42, T('Slot 38 (unconfirmed)', '槽位 38（未确认）', 'Ranura 38 (sin confirmar)')],
  [39, 43, T('Slot 39 (unconfirmed)', '槽位 39（未确认）', 'Ranura 39 (sin confirmar)')],
  [44, 45, T('Undella Town surf / fishing', '双龙市 冲浪/钓鱼', 'Surf / pesca en Pueblo Arenisca')],
  [46, 50, T('Spring grass (other regions)', '春季草地（其他地区）', 'Hierba de primavera (otras regiones)')],
  [47, 51, T('Summer grass (other regions)', '夏季草地（其他地区）', 'Hierba de verano (otras regiones)')],
  [48, 52, T('Autumn grass (other regions)', '秋季草地（其他地区）', 'Hierba de otoño (otras regiones)')],
  [49, 53, T('Winter grass (other regions)', '冬季草地（其他地区）', 'Hierba de invierno (otras regiones)')],
  [54, 55, T('Unova cave', '合众洞穴', 'Cueva de Teselia')],
  [56, 57, T('Unova dark cave', '合众黑暗洞穴', 'Cueva oscura de Teselia')],
  [58, 59, T('Unova forest', '合众森林', 'Bosque de Teselia'), 'noAnim'],
  [60, 61, T('Caves (other regions)', '洞穴（其他地区）', 'Cuevas (otras regiones)'), 'noAnim'],
  [62, 63, T('Surf / fishing (all regions)', '冲浪/钓鱼（所有地区）', 'Surf / pesca (todas las regiones)')],
  [64, 65, T('Misc. (Pokémon Tower …)', '杂项（宝可梦塔等）', 'Varios (Torre Pokémon …)')],
  [66, 67, T('Desert', '沙漠', 'Desierto')],
  [68, 69, T('Slot 68 (unconfirmed)', '槽位 68（未确认）', 'Ranura 68 (sin confirmar)')],
  [70, 71, T('Elite Four · Shauntal', '四天王·婉龙', 'Alto Mando · Anís')],
  [72, 73, T('Elite Four · Marshal', '四天王·连武', 'Alto Mando · Lotto')],
  [74, 75, T('Elite Four · Grimsley', '四天王·越橘', 'Alto Mando · Aza')],
  [76, 77, T('Elite Four · Caitlin', '四天王·嘉德丽雅', 'Alto Mando · Catleya')],
  [78, 79, T('N / Ghetsis finale (1)', 'N / 魁奇思 决战（1）', 'Final N / Ghechis (1)')],
  [80, 81, T('N / Ghetsis finale (2)', 'N / 魁奇思 决战（2）', 'Final N / Ghechis (2)')],
  [82, 83, T('Champion Alder', '冠军·阿戴克', 'Campeón Mirto')],
].map(([model, anim, name, warn]) => ({ model, anim, name, ...(warn ? { warn } : {}) }));
const slotOf = (m) => SLOTS.find((s) => s.model === m);

const scenes = [];
const sceneByKey = new Map();
function scene(id, name, by, model, anim, extra = {}) {
  const key = model + '|' + (anim || '');
  if (sceneByKey.has(key)) return sceneByKey.get(key);
  const s = { id, name, by, model, anim: anim || null, ...extra };
  scenes.push(s); sceneByKey.set(key, s);
  return s;
}
scene('bg-lugia-temple', T('Underwater Temple & Lugia', '海底神殿与洛奇亚', 'Templo submarino y Lugia'), 'MaToRiuKo', raw('a1/Battle Backgrounds/Underwater Temple & Lugia/1.nsbmd'), raw('a1/Battle Backgrounds/Underwater Temple & Lugia/1.nsbca'), { shot: 'lugia' });
scene('bg-n-castle', T("N's Castle & Reshiram", 'N之城与莱希拉姆', 'Castillo de N y Reshiram'), 'MaToRiuKo', raw("a1/Battle Backgrounds/N's Castle & Reshiram/2.nsbmd"), raw("a1/Battle Backgrounds/N's Castle & Reshiram/2.nsbca"), { native: [70, 72, 74, 76] });
scene('bg-champion', T('Pokémon Champion arena', '宝可梦冠军舞台', 'Estadio del Campeón Pokémon'), 'MaToRiuKo', raw('a1/Battle Backgrounds/Pok#U00e9mon Champion/wujx1.nsbmd'), raw('a1/Battle Backgrounds/Pok#U00e9mon Champion/wujx1.nsbca'), { native: [64] });
scene('bg-unova-champion-floorless', T('Universal template · floorless 1024×512 (sample image)', '通用模板 · 无地面 1024×512（示例图）', 'Plantilla universal · sin suelo 1024×512 (imagen de ejemplo)'), 'MaToRiuKo', fromStore('Unova-Champion-Universal-Floorless-Paired82-83', 82), fromStore('Unova-Champion-Universal-Floorless-Paired82-83', 83), { native: [82] });
scene('bg-transparent', T('Transparent (no background)', '透明（无背景）', 'Transparente (sin fondo)'), 'MaToRiuKo', raw('english/transparent battle background.nsbmd'), null, { modelOnly: true });

// Mato's per-slot collection (from "Mini Merry II … with Battle Background") and the Gen 6 set
const SETS = [];
function collection(prefix, setId, setName, by, nameFor, modelOnly, auxPrefix) {
  const assign = {};
  let n = 0;
  for (const label of Object.keys(store).filter((k) => k.startsWith(prefix)).sort()) {
    const its = store[label].filter((i) => i.path === BG);
    const mi = its.find((i) => i.magic === 'BMD0');
    if (!mi) continue;
    const ai = its.find((i) => i.magic === 'BCA0');
    const model = put(fs.readFileSync(path.join(X, 'store', mi.file)));
    const anim = ai ? put(fs.readFileSync(path.join(X, 'store', ai.file))) : null;
    const key = model + '|' + (anim || '');
    let s = sceneByKey.get(key);
    if (!s) { n++; s = scene(`${setId}-${String(n).padStart(2, '0')}`, nameFor(n), by, model, anim, { modelOnly, set: setId }); }
    (s.native ||= []).includes(mi.member) || s.native.push(mi.member);
    assign[mi.member] = s.id;
  }
  const extras = auxPrefix ? Object.keys(store).filter((k) => k.startsWith(auxPrefix)).flatMap((k) => storeWrites(k)) : [];
  SETS.push({ id: setId, name: setName, by, assign, extras });
}
const MATO_NAMES = [
  T('Forest meadow', '森林草原', 'Pradera del bosque'), T('Ancient ruins', '远古遗迹', 'Ruinas antiguas'), T('Bridge lookout', '大桥观景台', 'Mirador del puente'),
  T('Cloud playroom', '云朵游戏室', 'Sala de juegos de nubes'), T('Subway car', '地铁车厢', 'Vagón de metro'), T('Underwater temple', '海底神殿', 'Templo submarino'),
  T("N's Castle hall", 'N之城大厅', 'Salón del castillo de N'), T('Volcano cave', '熔岩洞窟', 'Cueva volcánica'), T('Distortion World', '毁坏的世界', 'Mundo Distorsión'),
  T('Champion stage', '冠军舞台', 'Escenario del Campeón'), T('Pokémon League hall', '宝可梦联盟大厅', 'Salón de la Liga Pokémon'), T('Bedroom', '卧室', 'Dormitorio'),
];
const GEN6_NAMES = [
  T('Spring forest grass', '春季森林草地', 'Hierba de bosque (primavera)'), T('Summer forest grass', '夏季森林草地', 'Hierba de bosque (verano)'), T('Autumn forest grass', '秋季森林草地', 'Hierba de bosque (otoño)'),
  T('Winter snowfield', '冬季雪原', 'Campo nevado'), T('Beach', '海滩', 'Playa'), T('Blue cave', '蓝色洞穴', 'Cueva azul'), T('Dark cave', '昏暗洞穴', 'Cueva oscura'),
  T('Deep forest', '深林', 'Bosque profundo'), T('Stadium', '竞技场', 'Estadio'), T('Desert', '沙漠', 'Desierto'), T('City at night', '城市夜景', 'Ciudad de noche'), T('Elite Four hall', '四天王大厅', 'Salón del Alto Mando'),
];
collection('mini-merry-ii-battle-scene', 'mato-set', T("MaToRiuKo's battle collection", 'MaToRiuKo 战斗背景合集', 'Colección de combates de MaToRiuKo'), 'MaToRiuKo', (n) => MATO_NAMES[n - 1] || T(`Scene ${n}`, `场景 ${n}`, `Escena ${n}`), false, 'mini-merry-ii-auxiliary');
collection('gen-6-battle-scene', 'gen6-set', T('Gen 6 battle backgrounds', '第六世代战斗背景', 'Fondos de combate Gen 6'), 'MaToRiuKo', (n) => { const x = GEN6_NAMES[n - 1] || T(`Scene ${n}`, `场景 ${n}`, `Escena ${n}`); return T('Gen 6 · ' + x.en, '第六世代 · ' + x.zh, 'Gen 6 · ' + x.es); }, true, 'gen-6-auxiliary');
// N's Castle everywhere (Expanded41)
SETS.push({ id: 'n-castle-e4', name: T("N's Castle — Elite Four only", 'N之城 — 仅四天王', 'Castillo de N — solo Alto Mando'), by: 'MaToRiuKo', assign: { 70: 'bg-n-castle', 72: 'bg-n-castle', 74: 'bg-n-castle', 76: 'bg-n-castle' }, extras: [] });

// ------------------------------------------------------------ Title screen (a/1/6/0)
add({ id: 'title-cynthia', cat: 'title', name: T('Cynthia & Garchomp', '竹兰与烈咬陆鲨', 'Cintia y Garchomp'), by: 'MaToRiuKo', desc: T('Replaces the Reshiram & Zekrom showcase on the title screen.', '替换标题画面中的莱希拉姆与捷克罗姆。', 'Sustituye a Reshiram y Zekrom en la pantalla de título.'), writes: storeWrites('Original-a160-Six-Members'), view: { model: fromStore('Original-a160-Six-Members', 232), kind: 'object' } });
add({ id: 'title-legendary', cat: 'title', name: T('Groudon, Kyogre & Rayquaza', '固拉多、盖欧卡与烈空坐', 'Groudon, Kyogre y Rayquaza'), by: 'MaToRiuKo', writes: storeWrites('German-Legendary-Showcase-Alternative'), view: { model: fromStore('German-Legendary-Showcase-Alternative', 232), kind: 'object' } });

// ------------------------------------------------------------ Overworld (a/1/5/7)
add({ id: 'world-ace-monument', cat: 'world', name: T('Ace monument', '艾斯纪念碑', 'Monumento a Ace'), by: 'MaToRiuKo', writes: storeWrites('ace-monument'), view: { model: fromStore('ace-monument', 0), kind: 'object' } });
add({ id: 'world-whitebeard-monument', cat: 'world', name: T('Whitebeard monument', '白胡子纪念碑', 'Monumento a Barbablanca'), by: 'MaToRiuKo', writes: storeWrites('whitebeard-monument'), view: { model: fromStore('whitebeard-monument', 0), kind: 'object' } });

// ------------------------------------------------------------ categories
const CATS = [
  { id: 'surf', icon: 'wave', name: T('Surf', '冲浪', 'Surf'), hint: T('The ride you sit on while surfing.', '冲浪时乘坐的模型。', 'Lo que montas al hacer Surf.'), target: 'a/0/7/5 #49', pick: 'one' },
  { id: 'fly', icon: 'wing', name: T('Fly', '飞翔', 'Vuelo'), hint: T('Take-off and landing when you use Fly. Models and their animations are always installed together.', '使用飞翔时的起飞与降落。模型和骨骼动画会一起安装。', 'Despegue y aterrizaje al usar Vuelo. Modelos y animaciones se instalan juntos.'), target: 'a/1/1/5', pick: 'one' },
  { id: 'battle', icon: 'mountain', name: T('Battle backgrounds', '战斗背景', 'Fondos de combate'), hint: T('Pick a background for each battle type, or apply a whole set.', '为每种战斗场景选择背景，或一键套用整套。', 'Elige un fondo para cada tipo de combate o aplica un set completo.'), target: 'a/0/1/1 #34–83', pick: 'slots' },
  { id: 'platforms', icon: 'disc', name: T('Battle platforms', '战斗圆盘', 'Plataformas'), hint: T('The round discs the Pokémon stand on.', '宝可梦脚下的圆形平台。', 'Los discos redondos bajo los Pokémon.'), target: 'a/0/1/1 #0–33', pick: 'one' },
  { id: 'hmbg', icon: 'spark', name: T('TM / HM / Fly backgrounds', '招式/秘传/飞翔背景', 'Fondos MT / MO / Vuelo'), hint: T('The background shown when a field move or Fly is used.', '使用场地招式或飞翔时出现的背景。', 'El fondo que aparece al usar un movimiento de campo o Vuelo.'), target: 'a/1/1/5 #25, #59', pick: 'one' },
  { id: 'title', icon: 'star', name: T('Title screen', '标题画面', 'Pantalla de título'), hint: T('The 3D models on the start screen.', '开始画面上的 3D 模型。', 'Los modelos 3D de la pantalla de inicio.'), target: 'a/1/6/0', pick: 'one' },
  { id: 'world', icon: 'flag', name: T('Overworld', '大地图', 'Mundo'), hint: T('Map objects.', '地图上的物体。', 'Objetos del mapa.'), target: 'a/1/5/7 #0', pick: 'one' },
];

// fingerprints (size + CRC32 only, no data) of the untouched game files, so the app can say "Original"
let originals = null;
if (CLEAN) {
  const cb = new Uint8Array(fs.readFileSync(CLEAN));
  const CR = rom.parseRom(cb);
  const fpOf = (p, m) => rom.fingerprint(rom.readMember(cb, CR, p, m));
  const list = (p, ms) => ms.map((m) => ({ path: p, member: m, fp: fpOf(p, m) }));
  originals = {
    surf: list(SURF, [49]),
    fly: list(FLY, [58, 60, 66, 67, 103, 104, 107, 108, 111, 112, 118]),
    hmbg: list(FLY, [25, 59]),
    platforms: list(BG, Array.from({ length: 34 }, (_, i) => i)),
    title: list('a/1/6/0', [227, 230, 232, 235, 238, 240]),
    world: list('a/1/5/7', [0]),
    battle: Object.fromEntries(SLOTS.map((s) => [s.model, fpOf(BG, s.model)])),
  };
}
for (const it of items) it.sources = [...new Set(it.writes.map((w) => origin.get(w.file)).filter(Boolean))];
for (const sc of scenes) sc.sources = [origin.get(sc.model), sc.anim && origin.get(sc.anim)].filter(Boolean);
const lib = { version: 1, originals, generated: new Date().toISOString().slice(0, 10), categories: CATS, items, battle: { path: BG, slots: SLOTS, scenes, sets: SETS }, files: Object.fromEntries([...files].sort()) };
const { addCommunity } = await import('./add-community.mjs');
for (const f of Object.keys(lib.files)) files.set(f, lib.files[f]);
addCommunity(lib, OUT); for (const [f, fp] of Object.entries(lib.files)) files.set(f, fp);
fs.writeFileSync(path.join(OUT, 'library.json'), JSON.stringify(lib, null, 1));
const total = [...files.values()].reduce((a, b) => a + +b.split(':')[0], 0);
console.log(`items ${items.length}, scenes ${scenes.length}, sets ${SETS.length}, files ${files.size}, ${(total / 1048576).toFixed(1)} MB`);
// remove unreferenced
for (const f of fs.readdirSync(path.join(OUT, 'files'))) if (!files.has(f)) fs.rmSync(path.join(OUT, 'files', f));
