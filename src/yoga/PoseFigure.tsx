/**
 * Original, minimal line figures for yoga poses, drawn with react-native-svg.
 *
 * Each figure is a set of hand-placed joints on a 100×100 grid (y grows downward, the
 * floor is at y≈90): head, neck, optional mid-spine, hip, elbows, hands, knees and feet.
 * Limbs are rounded strokes in the ink colour on a soft circle. Poses without a drawing
 * fall back to a neutral icon plus the pose name.
 */
import { Flower2 } from 'lucide-react-native';
import React from 'react';
import { View } from 'react-native';
import Svg, { Circle, Line, Polyline } from 'react-native-svg';
import { POSES, type YogaPose } from '../content/yoga';
import { Text } from '../components/ui';
import { useTheme } from '../theme/useTheme';

type P = [number, number];

export interface Figure {
  head: P;
  neck: P;
  /** Optional mid-spine point for rounded / arched backs. */
  mid?: P;
  hip: P;
  le: P;
  lh: P;
  re: P;
  rh: P;
  lk: P;
  lf: P;
  rk: P;
  rf: P;
}

/** Same arm/leg for both sides (side-view poses). */
const side = (f: Omit<Figure, 're' | 'rh' | 'rk' | 'rf'> & Partial<Figure>): Figure => ({
  re: f.le,
  rh: f.lh,
  rk: f.lk,
  rf: f.lf,
  ...f,
});

export const FIGURES: Record<string, Figure> = {
  // Standing, front view
  mountain: {
    head: [50, 15], neck: [50, 26], hip: [50, 54],
    le: [43, 40], lh: [41, 54], re: [57, 40], rh: [59, 54],
    lk: [47, 72], lf: [46, 90], rk: [53, 72], rf: [54, 90],
  },
  prayer: {
    head: [50, 15], neck: [50, 26], hip: [50, 54],
    le: [40, 40], lh: [50, 34], re: [60, 40], rh: [50, 34],
    lk: [47, 72], lf: [46, 90], rk: [53, 72], rf: [54, 90],
  },
  raisedArms: {
    head: [50, 17], neck: [50, 28], mid: [51, 41], hip: [50, 55],
    le: [43, 16], lh: [45, 4], re: [57, 16], rh: [55, 4],
    lk: [47, 72], lf: [46, 90], rk: [53, 72], rf: [54, 90],
  },
  sideBend: {
    head: [40, 18], neck: [44, 28], mid: [48, 41], hip: [50, 55],
    le: [38, 14], lh: [30, 6], re: [52, 16], rh: [36, 4],
    lk: [47, 72], lf: [46, 90], rk: [53, 72], rf: [54, 90],
  },
  tree: {
    head: [50, 15], neck: [50, 26], hip: [50, 54],
    le: [42, 14], lh: [50, 3], re: [58, 14], rh: [50, 3],
    lk: [48, 72], lf: [48, 90], rk: [66, 64], rf: [51, 68],
  },
  warrior2: {
    head: [50, 17], neck: [50, 28], hip: [50, 56],
    le: [34, 29], lh: [16, 29], re: [66, 29], rh: [84, 29],
    lk: [36, 72], lf: [24, 90], rk: [68, 68], rf: [76, 90],
  },
  goddess: {
    head: [50, 22], neck: [50, 33], hip: [50, 60],
    le: [36, 34], lh: [34, 20], re: [64, 34], rh: [66, 20],
    lk: [32, 70], lf: [30, 90], rk: [68, 70], rf: [70, 90],
  },
  triangle: {
    head: [80, 44], neck: [70, 48], hip: [50, 58],
    le: [69, 34], lh: [68, 18], re: [71, 60], rh: [72, 73],
    lk: [36, 74], lf: [24, 90], rk: [64, 74], rf: [76, 90],
  },
  // Standing, side view
  chair: side({
    head: [57, 25], neck: [54, 35], hip: [42, 62],
    le: [62, 24], lh: [68, 12], lk: [64, 72], lf: [56, 90],
  }),
  forwardFold: side({
    head: [58, 84], neck: [57, 75], mid: [57, 62], hip: [48, 52],
    le: [60, 82], lh: [60, 90], lk: [49, 71], lf: [50, 90],
  }),
  halfLift: side({
    head: [79, 51], neck: [70, 54], hip: [46, 52],
    le: [66, 64], lh: [56, 72], lk: [48, 71], lf: [50, 90],
  }),
  warrior1: {
    head: [52, 16], neck: [52, 27], hip: [50, 56],
    le: [50, 15], lh: [52, 3], re: [54, 15], rh: [52, 3],
    lk: [36, 73], lf: [20, 90], rk: [70, 66], rf: [72, 90],
  },
  lowLunge: {
    head: [57, 36], neck: [55, 46], hip: [46, 70],
    le: [62, 64], lh: [70, 88], re: [62, 64], rh: [70, 88],
    lk: [28, 88], lf: [10, 90], rk: [68, 70], rf: [72, 90],
  },
  crescentLunge: {
    head: [52, 30], neck: [51, 41], hip: [46, 66],
    le: [50, 28], lh: [52, 16], re: [53, 28], rh: [52, 16],
    lk: [28, 87], lf: [10, 90], rk: [68, 66], rf: [72, 90],
  },
  // Floor, hands & knees / prone
  plank: side({
    head: [22, 60], neck: [30, 64], hip: [58, 71],
    le: [30, 77], lh: [30, 90], lk: [72, 79], lf: [88, 87],
  }),
  kneesChestChin: side({
    head: [24, 85], neck: [33, 83], hip: [58, 70],
    le: [42, 78], lh: [36, 89], lk: [68, 88], lf: [86, 89],
  }),
  cobra: side({
    head: [27, 52], neck: [33, 61], mid: [42, 76], hip: [56, 86],
    le: [38, 76], lh: [34, 89], lk: [72, 88], lf: [88, 89],
  }),
  downDog: side({
    head: [34, 74], neck: [36, 64], hip: [56, 36],
    le: [30, 77], lh: [24, 90], lk: [66, 63], lf: [76, 90],
  }),
  tabletop: side({
    head: [22, 58], neck: [30, 62], hip: [64, 62],
    le: [30, 76], lh: [30, 90], lk: [64, 88], lf: [84, 89],
  }),
  cat: side({
    head: [25, 72], neck: [30, 64], mid: [47, 52], hip: [64, 62],
    le: [30, 76], lh: [30, 90], lk: [64, 88], lf: [84, 89],
  }),
  cow: side({
    head: [22, 52], neck: [30, 62], mid: [47, 68], hip: [64, 62],
    le: [30, 76], lh: [30, 90], lk: [64, 88], lf: [84, 89],
  }),
  child: side({
    head: [28, 85], neck: [37, 81], mid: [52, 72], hip: [68, 76],
    le: [24, 87], lh: [10, 89], lk: [54, 88], lf: [78, 89],
  }),
  sphinx: side({
    head: [26, 58], neck: [32, 66], mid: [42, 78], hip: [56, 86],
    le: [34, 88], lh: [20, 89], lk: [72, 88], lf: [88, 89],
  }),
  // Seated
  easySeat: {
    head: [50, 26], neck: [50, 37], hip: [50, 70],
    le: [38, 56], lh: [32, 76], re: [62, 56], rh: [68, 76],
    lk: [28, 82], lf: [58, 86], rk: [72, 82], rf: [42, 86],
  },
  butterfly: {
    head: [50, 30], neck: [50, 41], hip: [50, 72],
    le: [42, 60], lh: [50, 82], re: [58, 60], rh: [50, 82],
    lk: [24, 78], lf: [48, 86], rk: [76, 78], rf: [52, 86],
  },
  seatedFold: side({
    head: [69, 74], neck: [60, 72], mid: [44, 76], hip: [30, 86],
    le: [70, 78], lh: [82, 84], lk: [56, 87], lf: [82, 86],
  }),
  seatedTwist: {
    head: [52, 26], neck: [50, 37], hip: [50, 70],
    le: [40, 52], lh: [62, 66], re: [64, 46], rh: [74, 64],
    lk: [36, 74], lf: [70, 86], rk: [64, 56], rf: [42, 86],
  },
  boat: side({
    head: [30, 44], neck: [34, 53], hip: [46, 82],
    le: [46, 60], lh: [58, 62], lk: [62, 64], lf: [78, 49],
  }),
  // Lying
  bridge: side({
    head: [14, 85], neck: [23, 84], mid: [38, 72], hip: [55, 61],
    le: [35, 88], lh: [48, 89], lk: [70, 62], lf: [76, 89],
  }),
  kneesToChest: side({
    head: [16, 82], neck: [25, 83], hip: [56, 85],
    le: [44, 74], lh: [56, 66], lk: [52, 62], lf: [68, 68],
  }),
  supineTwist: {
    head: [14, 82], neck: [24, 83], hip: [56, 85],
    le: [22, 72], lh: [18, 62], re: [34, 86], rh: [44, 88],
    lk: [66, 72], lf: [80, 82], rk: [68, 76], rf: [82, 86],
  },
  legsUp: side({
    head: [16, 84], neck: [26, 85], hip: [56, 86],
    le: [36, 88], lh: [48, 89], lk: [58, 62], lf: [60, 38],
  }),
  rest: side({
    head: [12, 83], neck: [22, 85], hip: [52, 86],
    le: [36, 88], lh: [48, 89], lk: [70, 86], lf: [88, 85],
  }),
  puppy: side({
    head: [26, 84], neck: [34, 80], mid: [48, 70], hip: [62, 60],
    le: [20, 86], lh: [10, 89], lk: [62, 88], lf: [82, 89],
  }),
  prone: side({
    head: [16, 81], neck: [25, 85], hip: [56, 86],
    le: [20, 88], lh: [12, 87], lk: [72, 88], lf: [88, 88],
  }),
  locust: side({
    head: [22, 73], neck: [30, 78], mid: [42, 84], hip: [56, 86],
    le: [44, 81], lh: [56, 78], lk: [72, 82], lf: [88, 76],
  }),
  kneelSit: side({
    head: [55, 37], neck: [55, 48], hip: [56, 80],
    le: [53, 64], lh: [42, 79], lk: [34, 86], lf: [62, 89],
  }),
  happyBaby: side({
    head: [14, 84], neck: [24, 84], hip: [56, 84],
    le: [44, 68], lh: [60, 52], lk: [50, 62], lf: [62, 48],
  }),
  reclinedBound: {
    head: [14, 83], neck: [24, 84], hip: [56, 85],
    le: [36, 88], lh: [48, 89], re: [36, 88], rh: [48, 89],
    lk: [64, 70], lf: [60, 87], rk: [70, 76], rf: [62, 88],
  },
  garland: {
    head: [50, 34], neck: [50, 45], hip: [50, 74],
    le: [40, 62], lh: [50, 56], re: [60, 62], rh: [50, 56],
    lk: [30, 66], lf: [38, 90], rk: [70, 66], rf: [62, 90],
  },
  sideAngle: {
    head: [78, 40], neck: [70, 46], hip: [50, 64],
    le: [56, 34], lh: [42, 24], re: [70, 58], rh: [70, 67],
    lk: [36, 76], lf: [20, 90], rk: [72, 68], rf: [80, 90],
  },
  lowPlank: side({
    head: [22, 73], neck: [30, 77], hip: [58, 79],
    le: [40, 80], lh: [32, 90], lk: [72, 83], lf: [88, 87],
  }),
  warrior3: {
    head: [24, 50], neck: [32, 52], hip: [56, 54],
    le: [20, 52], lh: [8, 52], re: [20, 52], rh: [8, 52],
    lk: [56, 72], lf: [56, 90], rk: [72, 54], rf: [88, 53],
  },
  pigeon: {
    head: [46, 30], neck: [46, 41], hip: [48, 72],
    le: [40, 58], lh: [36, 88], re: [56, 58], rh: [62, 88],
    lk: [66, 84], lf: [44, 89], rk: [70, 88], rf: [92, 89],
  },
};

/**
 * Keyword → figure. Checked in order against "id name sanskrit" (lower-case), so more
 * specific names come first.
 */
const MATCHERS: [RegExp, keyof typeof FIGURES][] = [
  [/half.?(forward|standing).?(fold|lift|bend)|ardha.?uttanasana|flat.?back/, 'halfLift'],
  [/seated.?(forward|fold)|paschimottan|head.?to.?knee|janu.?sirsasana/, 'seatedFold'],
  [/seated.?twist|matsyendr|marichy/, 'seatedTwist'],
  [/supine.?twist|lying.?twist|reclin\w*.?twist|supta.?matsyendr|jathara/, 'supineTwist'],
  [/upward.?salute|raised.?arm|hasta.?uttan|urdhva.?hastasana|reach.?up/, 'raisedArms'],
  [/forward.?(fold|bend)|uttanasana|padahastasana|rag.?doll/, 'forwardFold'],
  [/down\w*.?dog|adho.?mukha|parvatasana|mountain.?(pose.?)?(in|of).?surya/, 'downDog'],
  [/eight.?(limb|point)|ashtanga.?namaskar|knees.?chest|chin.?chest/, 'kneesChestChin'],
  [/sphinx/, 'sphinx'],
  [/cobra|bhujang/, 'cobra'],
  [/plank|kumbhak|phalakasana|dandasana.?plank/, 'plank'],
  [/crescent|high.?lunge|anjaneyasana.?arms/, 'crescentLunge'],
  [/lunge|ashwa|anjaneya/, 'lowLunge'],
  [/warrior.?(2|ii|two)|virabhadrasana.?(2|ii)/, 'warrior2'],
  [/warrior|virabhadra/, 'warrior1'],
  [/triangle|trikon/, 'triangle'],
  [/goddess|utkata.?konasana|horse/, 'goddess'],
  [/chair|utkatasana/, 'chair'],
  [/tree|vrksasana|vriksh/, 'tree'],
  [/side.?(bend|stretch)|crescent.?moon|ardha.?chandrasana.?stand|tiryaka/, 'sideBend'],
  [/\bcat\b|marjary|cat.?cow/, 'cat'],
  [/\bcow\b|bitilas/, 'cow'],
  [/table.?top|bharmanasana|all.?fours/, 'tabletop'],
  [/child|balasana|shashank/, 'child'],
  [/butterfly|bound.?angle|baddha.?konasana|titli/, 'butterfly'],
  [/boat|navasana|naukasana/, 'boat'],
  [/bridge|setu/, 'bridge'],
  [/knees?.?to.?chest|apanasana|pawanmukt|wind.?reliev/, 'kneesToChest'],
  [/legs.?up|viparita.?karani/, 'legsUp'],
  [/pigeon|kapotasana/, 'pigeon'],
  [/corpse|savasana|shavasana|final.?rest|relaxation/, 'rest'],
  [/prayer|pranam|namaskar(?!.*surya)|anjali/, 'prayer'],
  [/easy.?(seat|pose)|sukhasana|seated.?breath|cross.?legged|lotus|padmasana|meditation|breath/, 'easySeat'],
  [/mountain|tadasana|samasthiti|standing/, 'mountain'],
];

/** Explicit figures for Bloom's pose ids (checked before the keyword matchers). */
const BY_ID: Record<string, keyof typeof FIGURES> = {
  mountain: 'mountain',
  prayer: 'prayer',
  'upward-salute': 'raisedArms',
  'standing-side-bend': 'sideBend',
  'standing-forward-fold': 'forwardFold',
  'half-forward-lift': 'halfLift',
  chair: 'chair',
  tree: 'tree',
  'warrior-1': 'warrior1',
  'warrior-2': 'warrior2',
  triangle: 'triangle',
  'low-lunge': 'lowLunge',
  'cat-cow': 'cat',
  child: 'child',
  puppy: 'puppy',
  'downward-dog': 'downDog',
  plank: 'plank',
  'knees-chest-chin': 'kneesChestChin',
  cobra: 'cobra',
  sphinx: 'sphinx',
  crocodile: 'prone',
  'easy-pose': 'easySeat',
  thunderbolt: 'kneelSit',
  'seated-easy-twist': 'seatedTwist',
  butterfly: 'butterfly',
  'seated-forward-fold': 'seatedFold',
  'head-to-knee': 'seatedFold',
  'knees-to-chest': 'kneesToChest',
  'wind-relieving': 'kneesToChest',
  'supine-twist': 'supineTwist',
  bridge: 'bridge',
  'happy-baby': 'happyBaby',
  'reclined-bound-angle': 'reclinedBound',
  'legs-up-the-wall': 'legsUp',
  shavasana: 'rest',
  'belly-breathing': 'easySeat',
  'anulom-vilom': 'easySeat',
  bhramari: 'easySeat',
  kapalbhati: 'easySeat',
  'crescent-lunge': 'crescentLunge',
  'extended-side-angle': 'sideAngle',
  goddess: 'goddess',
  garland: 'garland',
  boat: 'boat',
  locust: 'locust',
  pigeon: 'pigeon',
  'half-lord-of-fishes': 'seatedTwist',
  'low-plank': 'lowPlank',
  'warrior-3': 'warrior3',
};

export function figureKeyFor(pose: Pick<YogaPose, 'id' | 'name' | 'sanskrit'>): keyof typeof FIGURES | null {
  if (BY_ID[pose.id]) return BY_ID[pose.id];
  const hay = `${pose.id} ${pose.name} ${pose.sanskrit}`.toLowerCase().replace(/[-_]/g, ' ');
  for (const [re, key] of MATCHERS) if (re.test(hay)) return key;
  return null;
}

export function PoseFigure({
  poseId,
  size = 160,
  flip,
  pose: poseProp,
}: {
  poseId: string;
  size?: number;
  /** Mirror horizontally (e.g. for the right side). */
  flip?: boolean;
  /** Pass when already loaded; otherwise looked up in POSES. */
  pose?: YogaPose | null;
}) {
  const { c } = useTheme();
  const pose = poseProp ?? POSES.find((p) => p.id === poseId) ?? null;
  const name = pose?.name ?? 'Yoga pose';
  const key = pose ? figureKeyFor(pose) : null;
  const fig = key ? FIGURES[key] : null;

  if (!fig) {
    return (
      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={name}
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: c.cycleSoft,
          alignItems: 'center',
          justifyContent: 'center',
          padding: size * 0.12,
        }}
      >
        <Flower2 size={size * 0.32} color={c.ink} strokeWidth={1.6} />
        {size >= 96 ? (
          <Text variant="caption" numberOfLines={2} style={{ textAlign: 'center', marginTop: 4 }}>
            {name}
          </Text>
        ) : null}
      </View>
    );
  }

  const sw = 5.2;
  const ink = c.ink;
  const pts = (...ps: P[]) => ps.map((p) => p.join(',')).join(' ');
  const spine = fig.mid ? pts(fig.neck, fig.mid, fig.hip) : pts(fig.neck, fig.hip);

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={name}
      style={{ width: size, height: size }}
    >
      <Svg width={size} height={size} viewBox="0 0 100 100">
        <Circle cx={50} cy={50} r={50} fill={c.cycleSoft} />
        <Line x1={8} y1={92.5} x2={92} y2={92.5} stroke={c.line} strokeWidth={2} strokeLinecap="round" />
        {/* flip mirrors x around the centre */}
          <Polyline
            points={spine}
            fill="none"
            stroke={ink}
            strokeWidth={sw + 0.8}
            strokeLinecap="round"
            strokeLinejoin="round"
            transform={flip ? 'translate(100,0) scale(-1,1)' : undefined}
          />
          {[
            [fig.neck, fig.le, fig.lh],
            [fig.neck, fig.re, fig.rh],
            [fig.hip, fig.lk, fig.lf],
            [fig.hip, fig.rk, fig.rf],
          ].map((limb, i) => (
            <Polyline
              key={i}
              points={pts(...(limb as P[]))}
              fill="none"
              stroke={ink}
              strokeWidth={sw}
              strokeLinecap="round"
              strokeLinejoin="round"
              transform={flip ? 'translate(100,0) scale(-1,1)' : undefined}
            />
          ))}
          <Circle
            cx={flip ? 100 - fig.head[0] : fig.head[0]}
            cy={fig.head[1]}
            r={6.2}
            fill={c.surface}
            stroke={ink}
            strokeWidth={sw - 1}
          />
      </Svg>
    </View>
  );
}
