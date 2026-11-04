/** Native layer rectangles and joints measured against the upright resident drawings. */
import type { ResidentLayerRegistration, ResidentRigRegistration } from './resident-rig.ts'
import type { ResidentBoneId } from './resident-skeleton.ts'

type NativePoint = readonly [number, number]

/** Only the lower hair is drawn; its cut edge sits behind the separately painted head. */
export const RESIDENT_HAIR_RIG: Record<'front' | 'side' | 'back', ResidentRigRegistration> = {
  side: { width: 2172, height: 724, layers: [
    layer('backHair', [42, 231, 666, 493], [435, 133], [371, 689], 0.69),
  ] },
  front: { width: 2172, height: 724, layers: [
    layer('backHair', [732, 230, 695, 494], [1078, 138], [1078, 689], 0.7),
  ] },
  back: { width: 2172, height: 724, layers: [
    layer('backHair', [1437, 230, 690, 494], [1784, 138], [1784, 689], 0.7),
  ] },
}

function layer(
  bone: ResidentBoneId, rectangle: readonly [number, number, number, number],
  start: NativePoint, end: NativePoint, widthScale: number, mirrorX = false, id: ResidentLayerRegistration['id'] = bone,
): ResidentLayerRegistration {
  const [left, top, width, height] = rectangle
  return { id, bone, left, top, width, height, start: { x: start[0], y: start[1] }, end: { x: end[0], y: end[1] }, widthScale, mirrorX }
}

/** Side-view identity and casual clothing share one neutral skeleton. */
export const RESIDENT_CASUAL_SIDE_RIG: ResidentRigRegistration = {
  width: 1254, height: 1254,
  layers: [
    layer('backHair', [16, 60, 329, 285], [203, 90], [174, 330], 0.65),
    layer('tail', [361, 28, 291, 301], [620, 274], [474, 102], 0.8),
    layer('farForearm', [1008, 15, 237, 317], [1094, 90], [1164, 246], 0.8),
    layer('farUpperArm', [709, 0, 181, 331], [795, 62], [798, 278], 0.75),
    layer('farThigh', [105, 340, 168, 301], [187, 370], [190, 604], 0.9),
    layer('farShin', [410, 340, 143, 301], [474, 372], [483, 604], 1),
    layer('farShoe', [642, 473, 280, 155], [766, 617], [966, 617], 1),
    layer('nearThigh', [103, 644, 166, 303], [185, 677], [184, 914], 0.9),
    layer('nearShin', [414, 644, 137, 300], [480, 678], [485, 909], 1),
    layer('nearShoe', [644, 786, 280, 148], [766, 929], [966, 929], 1),
    layer('skirt', [913, 645, 341, 297], [1090, 655], [1090, 923], 0.89),
    layer('torso', [963, 345, 276, 294], [1088, 789], [1100, 400], 0.65),
    layer('nearForearm', [367, 945, 184, 309], [486, 1002], [431, 1168], 0.8),
    layer('nearUpperArm', [77, 950, 184, 294], [154, 994], [174, 1200], 0.75),
    layer('frontHair', [1026, 947, 143, 293], [1095, 980], [1114, 1218], 1),
    layer('head', [643, 945, 313, 309], [832, 1225], [827, 1096], 1),
  ],
}

/** Front-facing pieces retain the same body proportions and clothing attachment points. */
export const RESIDENT_CASUAL_FRONT_RIG: ResidentRigRegistration = {
  width: 1254, height: 1254,
  layers: [
    layer('backHair', [0, 160, 388, 232], [193, 103], [193, 366], 0.75),
    layer('tail', [370, 54, 326, 318], [672, 310], [529, 137], 0.8),
    layer('farForearm', [1036, 53, 161, 297], [1109, 109], [1152, 289], 0.85),
    layer('farUpperArm', [711, 40, 189, 315], [835, 101], [785, 300], 0.8),
    layer('farThigh', [105, 380, 153, 268], [176, 410], [184, 616], 0.8),
    layer('farShin', [403, 388, 112, 260], [461, 417], [465, 617], 0.8),
    layer('farShoe', [666, 489, 147, 162], [735, 641], [935, 641], 1),
    layer('nearThigh', [118, 663, 142, 273], [189, 692], [177, 905], 0.85),
    layer('nearShin', [400, 657, 105, 278], [454, 686], [454, 903], 0.85),
    layer('nearShoe', [614, 770, 142, 154], [688, 913], [888, 913], 1),
    layer('skirt', [811, 668, 443, 288], [1038, 676], [1038, 927], 0.78),
    layer('torso', [921, 365, 250, 293], [1043, 818], [1043, 426], 1),
    layer('nearForearm', [331, 970, 155, 270], [429, 1010], [390, 1168], 0.85),
    layer('nearUpperArm', [100, 943, 211, 300], [158, 991], [236, 1197], 0.8),
    layer('frontHair', [982, 1007, 228, 226], [1093, 1040], [1093, 1217], 0.8),
    layer('head', [546, 923, 407, 331], [745, 1228], [745, 1088], 1),
  ],
}

/** Rear-view hair covers the jacket while the face remains absent. */
export const RESIDENT_CASUAL_BACK_RIG: ResidentRigRegistration = {
  width: 1254, height: 1254,
  layers: [
    layer('tail', [388, 82, 297, 301], [661, 329], [537, 157], 0.8),
    layer('farForearm', [1026, 65, 193, 320], [1098, 123], [1162, 308], 0.85),
    layer('farUpperArm', [735, 40, 163, 302], [826, 96], [815, 301], 0.8),
    layer('farThigh', [101, 395, 154, 266], [177, 428], [177, 629], 0.8),
    layer('farShin', [383, 398, 112, 266], [440, 430], [447, 631], 0.85),
    layer('farShoe', [652, 534, 108, 131], [705, 651], [905, 651], 1),
    layer('nearThigh', [108, 668, 144, 256], [183, 699], [170, 894], 0.85),
    layer('nearShin', [390, 671, 115, 254], [444, 701], [450, 894], 0.85),
    layer('nearShoe', [624, 795, 120, 131], [680, 925], [880, 925], 1),
    layer('skirt', [797, 676, 452, 270], [1015, 702], [1015, 920], 0.68),
    layer('torso', [937, 386, 224, 276], [1044, 813], [1044, 421], 1),
    layer('nearForearm', [302, 955, 162, 291], [407, 1001], [363, 1169], 0.85),
    layer('nearUpperArm', [69, 941, 181, 281], [139, 990], [179, 1188], 0.8),
    layer('backHair', [0, 158, 389, 236], [192, 105], [193, 369], 0.75),
    layer('frontHair', [944, 986, 261, 251], [1070, 1038], [1070, 1218], 0.8),
    layer('head', [541, 918, 342, 336], [714, 1230], [714, 1090], 1),
  ],
}

/** Classic clothing replaces garments and adds a maid headband without regenerating the face. */
export const RESIDENT_CLASSIC_WARDROBE: Record<'front' | 'side' | 'back', ResidentRigRegistration> = {
  front: { width: 1774, height: 887, layers: [
    layer('torso', [15, 23, 237, 271], [143, 422], [143, 72], 1),
    layer('skirt', [253, 0, 414, 295], [463, 31], [460, 273], 0.8),
    layer('farUpperArm', [668, 17, 164, 250], [759, 64], [730, 225], 0.8),
    layer('farForearm', [874, 28, 132, 275], [934, 74], [953, 236], 0.85),
    layer('nearUpperArm', [1060, 22, 150, 243], [1135, 66], [1160, 226], 0.8),
    layer('nearForearm', [1291, 29, 121, 274], [1364, 74], [1349, 236], 0.85),
    layer('head', [1455, 45, 318, 220], [1619, 327], [1619, 180], 1, false, 'headband'),
  ] },
  side: { width: 1774, height: 887, layers: [
    layer('torso', [25, 300, 228, 267], [149, 701], [149, 353], 0.65),
    layer('skirt', [256, 295, 402, 279], [449, 321], [462, 547], 0.66),
    layer('farUpperArm', [659, 304, 162, 245], [756, 353], [724, 511], 0.8),
    layer('farForearm', [887, 321, 145, 266], [941, 363], [979, 523], 0.85),
    layer('nearUpperArm', [1076, 308, 175, 243], [1154, 354], [1190, 514], 0.8),
    layer('nearForearm', [1304, 325, 160, 257], [1360, 371], [1418, 521], 0.85),
    layer('head', [1504, 330, 234, 240], [1643, 652], [1641, 500], 1, false, 'headband'),
  ] },
  back: { width: 1774, height: 887, layers: [
    layer('torso', [23, 570, 235, 301], [140, 971], [140, 621], 1),
    layer('skirt', [250, 574, 414, 299], [455, 612], [455, 846], 0.78),
    layer('farUpperArm', [656, 580, 168, 246], [744, 629], [731, 787], 0.8),
    layer('farForearm', [877, 579, 126, 288], [937, 629], [939, 797], 0.85),
    layer('nearUpperArm', [1075, 584, 161, 241], [1156, 630], [1185, 790], 0.8),
    layer('nearForearm', [1296, 578, 123, 284], [1366, 630], [1363, 796], 0.85),
    layer('head', [1459, 611, 314, 206], [1611, 890], [1611, 743], 1, false, 'headband'),
  ] },
}

/** Night clothing shares identity and uses bare limbs with direction-matched slippers. */
export const RESIDENT_NIGHT_WARDROBE: Record<'front' | 'side' | 'back', ResidentRigRegistration> = {
  front: { width: 1774, height: 887, layers: [
    layer('torso', [20, 10, 232, 281], [139, 405], [139, 56], 1),
    layer('skirt', [257, 0, 350, 302], [433, 36], [437, 282], 0.93),
    layer('farUpperArm', [609, 16, 154, 275], [659, 67], [704, 245], 0.8),
    layer('farForearm', [778, 54, 118, 251], [845, 99], [838, 248], 0.85),
    layer('nearUpperArm', [910, 13, 159, 279], [978, 70], [1021, 249], 0.8),
    layer('nearForearm', [1096, 58, 126, 244], [1186, 106], [1153, 248], 0.85),
    layer('farThigh', [1267, 28, 139, 268], [1334, 67], [1340, 268], 0.75, true),
    layer('nearThigh', [1267, 28, 139, 268], [1334, 67], [1340, 268], 0.75),
    layer('farShin', [1435, 39, 112, 257], [1492, 75], [1491, 268], 0.85, true),
    layer('nearShin', [1435, 39, 112, 257], [1492, 75], [1491, 268], 0.85),
    layer('farShoe', [1590, 155, 151, 145], [1670, 291], [1870, 291], 1),
    layer('nearShoe', [1590, 155, 151, 145], [1670, 291], [1870, 291], 1),
  ] },
  side: { width: 1774, height: 887, layers: [
    layer('torso', [31, 298, 218, 277], [151, 704], [151, 354], 0.65),
    layer('skirt', [254, 302, 321, 281], [431, 334], [435, 559], 0.8),
    layer('farUpperArm', [585, 305, 151, 280], [670, 358], [630, 536], 0.8),
    layer('farForearm', [772, 339, 132, 254], [850, 388], [816, 542], 0.85),
    layer('nearUpperArm', [907, 300, 176, 287], [1014, 357], [974, 541], 0.8),
    layer('nearForearm', [1106, 332, 135, 262], [1154, 381], [1185, 541], 0.85),
    layer('farThigh', [1271, 329, 135, 260], [1334, 369], [1334, 554], 0.75),
    layer('nearThigh', [1271, 329, 135, 260], [1334, 369], [1334, 554], 0.75),
    layer('farShin', [1434, 334, 112, 255], [1491, 371], [1492, 556], 0.85),
    layer('nearShin', [1434, 334, 112, 255], [1491, 371], [1492, 556], 0.85),
    layer('farShoe', [1572, 480, 198, 112], [1669, 576], [1814, 576], 1),
    layer('nearShoe', [1572, 480, 198, 112], [1669, 576], [1814, 576], 1),
  ] },
  back: { width: 1774, height: 887, layers: [
    layer('torso', [19, 581, 229, 275], [139, 983], [139, 633], 1),
    layer('skirt', [254, 581, 352, 291], [432, 612], [434, 850], 0.93),
    layer('farUpperArm', [615, 591, 149, 277], [666, 641], [701, 819], 0.8),
    layer('farForearm', [777, 617, 122, 258], [844, 661], [836, 811], 0.85),
    layer('nearUpperArm', [912, 592, 143, 275], [975, 641], [1015, 819], 0.8),
    layer('nearForearm', [1094, 615, 118, 259], [1155, 661], [1158, 812], 0.85),
    layer('farThigh', [1255, 601, 149, 257], [1331, 638], [1331, 823], 0.75, true),
    layer('nearThigh', [1255, 601, 149, 257], [1331, 638], [1331, 823], 0.75),
    layer('farShin', [1435, 602, 106, 257], [1490, 639], [1490, 824], 0.85, true),
    layer('nearShin', [1435, 602, 106, 257], [1490, 639], [1490, 824], 0.85),
    layer('farShoe', [1604, 723, 133, 138], [1673, 850], [1873, 850], 1),
    layer('nearShoe', [1604, 723, 133, 138], [1673, 850], [1873, 850], 1),
  ] },
}

/** Closed shoulder caps overlap the torso openings while the forearms hide the elbow cuts. */
export const RESIDENT_NIGHT_SLEEVES: Record<'front' | 'side' | 'back', ResidentRigRegistration> = {
  front: { width: 1024, height: 1536, layers: [
    layer('farUpperArm', [242, 18, 247, 480], [335, 85], [395, 423], 0.8),
    layer('nearUpperArm', [536, 18, 248, 480], [688, 90], [636, 430], 0.8),
  ] },
  side: { width: 1024, height: 1536, layers: [
    layer('farUpperArm', [251, 509, 240, 490], [341, 565], [367, 942], 0.8),
    layer('nearUpperArm', [578, 507, 224, 493], [668, 570], [699, 945], 0.8),
  ] },
  back: { width: 1024, height: 1536, layers: [
    layer('farUpperArm', [242, 1010, 218, 490], [338, 1075], [350, 1448], 0.8),
    layer('nearUpperArm', [568, 1007, 214, 491], [676, 1070], [650, 1452], 0.8),
  ] },
}
