/**
 * Bloom Kitchen — canonical list of common Indian kitchen ingredients (pure data, no runtime deps).
 *
 * Used for: quick-add search, the "Tap what you usually keep" staples picker, free-text parsing
 * ("I have paneer, palak, onion…"), recipe ingredient keys and recipe nutrition.
 *
 * NUTRITION (per 100 g raw / as bought, ml ≈ g for liquids) — approximate values from IFCT 2017
 * (ICMR-NIN) and USDA FoodData Central, rounded. `carbs` = available (net) carbohydrate, IFCT
 * style. kcal is derived with Atwater factors (4·protein + 4·carbs + 9·fat + 2·fibre) so recipe
 * numbers stay internally consistent. Estimates only — not dietetic advice.
 *
 * `basic` ingredients (salt, water, spices, oils) are treated as always available by the matcher.
 * `jainAvoid` = onion, garlic and root/underground vegetables.
 */
import type { DietTag } from '../content/foods';

export type PantryCategory = 'vegetables' | 'fruits' | 'grains' | 'dals' | 'dairy' | 'eggs-meat' | 'spices-oil' | 'packaged' | 'other';

export const PANTRY_CATEGORIES: PantryCategory[] = ['vegetables', 'fruits', 'grains', 'dals', 'dairy', 'eggs-meat', 'spices-oil', 'packaged', 'other'];

export const CATEGORY_LABEL: Record<PantryCategory, string> = {
  vegetables: 'Vegetables',
  fruits: 'Fruits',
  grains: 'Grains & atta',
  dals: 'Dals & pulses',
  dairy: 'Dairy',
  'eggs-meat': 'Eggs & meat',
  'spices-oil': 'Spices & oil',
  packaged: 'Packaged',
  other: 'Nuts, seeds & more',
};

export interface Per100 {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
}

export interface Ingredient {
  key: string;
  name: string;
  /** Hindi / Hinglish names and common spellings (lower-case Latin + Devanagari). */
  aliases: string[];
  category: PantryCategory;
  diet: DietTag;
  /** A wholesome everyday choice. */
  healthy: boolean;
  note?: string;
  per100: Per100;
  /** Grams in one piece ("1 onion", "1 egg", "1 clove"). */
  pieceG?: number;
  pieceLabel?: string;
  /** Always assumed available (salt, water, spices, oils). */
  basic?: boolean;
  jainAvoid?: boolean;
  /** Shown in the "Tap what you usually keep" picker. */
  staple?: boolean;
  /** Typical fridge/shelf life in days once bought — used for an estimated "use soon" date. */
  shelfDays?: number;
  /** Other ingredient keys that can stand in for this one. */
  subs?: string[];
}

type Opts = {
  piece?: [number, string?];
  basic?: 1;
  jain?: 1;
  staple?: 1;
  shelf?: number;
  note?: string;
  subs?: string[];
};
type Row = [string, string, string, DietTag, 0 | 1, number, number, number, number, Opts?];

const r1 = (n: number) => Math.round(n * 10) / 10;
export const kcalFrom = (p: number, c: number, f: number, fib: number) => Math.round(4 * p + 4 * c + 9 * f + 2 * fib);

const DATA: [PantryCategory, Row[]][] = [
  [
    'vegetables',
    [
      ['onion', 'Onion', 'pyaz|pyaaz|kanda|pyaj|प्याज़|प्याज', 'vegan', 1, 1.1, 7.6, 0.1, 1.7, { piece: [100], jain: 1, staple: 1, shelf: 21 }],
      ['tomato', 'Tomato', 'tamatar|tamato|टमाटर', 'vegan', 1, 0.9, 2.7, 0.2, 1.2, { piece: [100], staple: 1, shelf: 7 }],
      ['potato', 'Potato', 'aloo|alu|batata|आलू', 'vegan', 1, 2.0, 15.4, 0.1, 2.2, { piece: [150], jain: 1, staple: 1, shelf: 21, note: 'Fine in moderation — keep the skin on for fibre.' }],
      ['sweet-potato', 'Sweet potato', 'shakarkandi|shakarkand|शकरकंद', 'vegan', 1, 1.6, 17.1, 0.1, 3.0, { piece: [150], jain: 1, shelf: 14 }],
      ['carrot', 'Carrot', 'gajar|गाजर', 'vegan', 1, 0.9, 6.8, 0.2, 2.8, { piece: [70], jain: 1, staple: 1, shelf: 10 }],
      ['beetroot', 'Beetroot', 'chukandar|beet|चुकंदर', 'vegan', 1, 1.6, 6.8, 0.2, 2.8, { piece: [120], jain: 1, shelf: 10 }],
      ['radish', 'Radish', 'mooli|मूली', 'vegan', 1, 0.7, 1.8, 0.1, 1.6, { piece: [150], jain: 1, shelf: 7 }],
      ['garlic', 'Garlic', 'lahsun|lehsun|lasun|लहसुन', 'vegan', 1, 6.4, 31.0, 0.5, 2.1, { piece: [4, 'clove'], jain: 1, staple: 1, shelf: 30 }],
      ['ginger', 'Ginger', 'adrak|adrak root|अदरक', 'vegan', 1, 1.8, 15.8, 0.8, 2.0, { piece: [10, 'inch piece'], jain: 1, staple: 1, shelf: 21 }],
      ['green-chilli', 'Green chilli', 'hari mirch|mirchi|हरी मिर्च', 'vegan', 1, 2.0, 7.5, 0.2, 1.5, { piece: [4], staple: 1, shelf: 10 }],
      ['spinach', 'Spinach', 'palak|पालक', 'vegan', 1, 2.9, 1.4, 0.4, 2.2, { staple: 1, shelf: 3, note: 'Iron and folate — pair with lemon for better iron absorption.' }],
      ['methi-leaves', 'Fenugreek leaves', 'methi|methi patta|मेथी', 'vegan', 1, 4.4, 4.3, 0.9, 1.1, { shelf: 3 }],
      ['coriander-leaves', 'Coriander leaves', 'dhaniya|dhania|hara dhaniya|cilantro|धनिया', 'vegan', 1, 2.1, 0.9, 0.5, 2.8, { staple: 1, shelf: 5 }],
      ['mint', 'Mint', 'pudina|पुदीना', 'vegan', 1, 3.3, 5.0, 0.7, 6.8, { shelf: 5 }],
      ['curry-leaves', 'Curry leaves', 'kadi patta|kadhi patta|karipatta|करी पत्ता', 'vegan', 1, 6.1, 11.8, 1.0, 6.4, { shelf: 10 }],
      ['cauliflower', 'Cauliflower', 'gobhi|phool gobhi|gobi|फूलगोभी', 'vegan', 1, 1.9, 3.0, 0.3, 2.0, { piece: [600, 'head'], shelf: 7 }],
      ['cabbage', 'Cabbage', 'patta gobhi|band gobhi|bandh gobi|पत्ता गोभी', 'vegan', 1, 1.3, 3.3, 0.1, 2.5, { piece: [800, 'head'], shelf: 14 }],
      ['capsicum', 'Capsicum', 'shimla mirch|bell pepper|शिमला मिर्च', 'vegan', 1, 1.0, 3.0, 0.3, 1.7, { piece: [120], staple: 1, shelf: 7 }],
      ['bhindi', 'Okra', 'bhindi|lady finger|ladyfinger|भिंडी', 'vegan', 1, 1.9, 3.8, 0.2, 3.2, { shelf: 4 }],
      ['lauki', 'Bottle gourd', 'lauki|ghiya|dudhi|doodhi|लौकी', 'vegan', 1, 0.6, 2.9, 0.0, 0.5, { piece: [800], shelf: 7 }],
      ['tori', 'Ridge gourd', 'tori|turai|tauri|तोरी', 'vegan', 1, 0.5, 3.4, 0.1, 0.5, { shelf: 5 }],
      ['karela', 'Bitter gourd', 'karela|करेला', 'vegan', 1, 1.0, 3.7, 0.2, 2.6, { piece: [100], shelf: 5 }],
      ['baingan', 'Brinjal', 'baingan|eggplant|aubergine|बैंगन', 'vegan', 1, 1.0, 3.0, 0.2, 3.0, { piece: [250, 'large brinjal'], shelf: 5 }],
      ['tinda', 'Tinda', 'round gourd|टिंडा', 'vegan', 1, 1.4, 3.4, 0.2, 1.6, { shelf: 5 }],
      ['peas', 'Green peas', 'matar|mattar|frozen peas|मटर', 'vegan', 1, 5.4, 9.1, 0.4, 5.1, { staple: 1, shelf: 4, note: 'Frozen peas work just as well.' }],
      ['french-beans', 'French beans', 'beans|fansi|फ्रेंच बीन्स', 'vegan', 1, 1.8, 4.3, 0.2, 2.7, { shelf: 5 }],
      ['cucumber', 'Cucumber', 'kheera|khira|खीरा', 'vegan', 1, 0.7, 2.9, 0.1, 0.5, { piece: [200], staple: 1, shelf: 7 }],
      ['mushroom', 'Mushroom', 'khumb|मशरूम', 'vegan', 1, 3.1, 2.3, 0.3, 1.0, { shelf: 3 }],
      ['broccoli', 'Broccoli', 'ब्रोकली', 'vegan', 1, 2.8, 4.0, 0.4, 2.6, { piece: [300, 'head'], shelf: 5 }],
      ['spring-onion', 'Spring onion', 'hara pyaz|scallion|हरा प्याज़', 'vegan', 1, 1.8, 4.7, 0.2, 2.6, { jain: 1, shelf: 5 }],
      ['sweet-corn', 'Sweet corn', 'makka|corn|bhutta|मक्का', 'vegan', 1, 3.3, 16.7, 1.4, 2.4, { shelf: 4 }],
      ['pumpkin', 'Pumpkin', 'kaddu|sitaphal|kashiphal|कद्दू', 'vegan', 1, 1.0, 6.0, 0.1, 0.5, { shelf: 10 }],
      ['drumstick', 'Drumstick', 'sahjan|moringa|saijan|सहजन', 'vegan', 1, 2.1, 5.3, 0.2, 3.2, { piece: [40], shelf: 5 }],
      ['parwal', 'Pointed gourd', 'parwal|parval|परवल', 'vegan', 1, 2.0, 2.2, 0.3, 3.0, { shelf: 5 }],
      ['arbi', 'Colocasia', 'arbi|arvi|taro|अरबी', 'vegan', 1, 3.0, 21.0, 0.1, 4.0, { jain: 1, shelf: 10 }],
      ['sarson-saag', 'Mustard greens', 'sarson|sarson ka saag|सरसों', 'vegan', 1, 3.0, 1.5, 0.5, 3.2, { shelf: 3 }],
      ['bathua', 'Bathua', 'chenopodium|बथुआ', 'vegan', 1, 3.7, 2.9, 0.4, 2.1, { shelf: 3 }],
      ['raw-banana', 'Raw banana', 'kachha kela|plantain|कच्चा केला', 'vegan', 1, 1.4, 14.0, 0.3, 5.7, { piece: [150], shelf: 5 }],
      ['lettuce', 'Lettuce', 'salad patta|lettuce leaves', 'vegan', 1, 1.4, 1.6, 0.2, 1.3, { shelf: 4 }],
      ['zucchini', 'Zucchini', 'ज़ुकीनी', 'vegan', 1, 1.2, 2.1, 0.3, 1.0, { piece: [200], shelf: 5 }],
    ],
  ],
  [
    'fruits',
    [
      ['banana', 'Banana', 'kela|केला', 'vegan', 1, 1.1, 20.2, 0.3, 2.6, { piece: [120], staple: 1, shelf: 4 }],
      ['apple', 'Apple', 'seb|saib|सेब', 'vegan', 1, 0.3, 11.4, 0.2, 2.4, { piece: [150], staple: 1, shelf: 21 }],
      ['papaya', 'Papaya', 'papita|पपीता', 'vegan', 1, 0.5, 9.1, 0.3, 1.7, { shelf: 4 }],
      ['orange', 'Orange', 'santra|narangi|संतरा', 'vegan', 1, 0.9, 9.4, 0.1, 2.4, { piece: [130], shelf: 14 }],
      ['pomegranate', 'Pomegranate', 'anar|अनार', 'vegan', 1, 1.7, 14.7, 1.2, 4.0, { piece: [250], shelf: 14 }],
      ['guava', 'Guava', 'amrood|amrud|अमरूद', 'vegan', 1, 2.6, 8.9, 1.0, 5.4, { piece: [100], shelf: 5 }],
      ['mango', 'Mango', 'aam|आम', 'vegan', 1, 0.8, 13.4, 0.4, 1.6, { piece: [200], shelf: 5 }],
      ['lemon', 'Lemon', 'nimbu|neebu|lime|नींबू', 'vegan', 1, 1.1, 6.5, 0.3, 2.8, { piece: [50], staple: 1, shelf: 21 }],
      ['dates', 'Dates', 'khajoor|khajur|खजूर', 'vegan', 1, 2.5, 67.0, 0.4, 7.0, { piece: [8], shelf: 180, note: 'Naturally sweet and iron-giving — a few go a long way.' }],
      ['raisins', 'Raisins', 'kishmish|munakka|किशमिश', 'vegan', 1, 3.1, 75.5, 0.5, 3.7, { shelf: 180 }],
      ['watermelon', 'Watermelon', 'tarbooz|तरबूज़', 'vegan', 1, 0.6, 7.2, 0.2, 0.4, { shelf: 5 }],
      ['grapes', 'Grapes', 'angoor|अंगूर', 'vegan', 1, 0.7, 17.0, 0.2, 0.9, { shelf: 5 }],
      ['amla', 'Amla', 'indian gooseberry|आंवला', 'vegan', 1, 0.9, 6.6, 0.1, 3.4, { piece: [30], shelf: 10 }],
      ['pear', 'Pear', 'nashpati|नाशपाती', 'vegan', 1, 0.4, 12.2, 0.1, 3.1, { piece: [170], shelf: 7 }],
      ['chikoo', 'Sapota', 'chikoo|chiku|sapota|चीकू', 'vegan', 1, 0.4, 14.6, 1.1, 5.3, { piece: [100], shelf: 4 }],
    ],
  ],
  [
    'grains',
    [
      ['rice', 'Rice', 'chawal|basmati|sona masoori|चावल', 'vegan', 1, 6.8, 78.0, 0.5, 1.0, { staple: 1, subs: ['brown-rice'] }],
      ['brown-rice', 'Brown rice', 'brown chawal|ब्राउन राइस', 'vegan', 1, 7.5, 73.0, 2.7, 3.5, { subs: ['rice'] }],
      ['poha', 'Poha', 'flattened rice|chivda|aval|pohe|पोहा', 'vegan', 1, 6.6, 75.0, 1.2, 2.5, { staple: 1 }],
      ['atta', 'Whole wheat atta', 'atta|gehun ka atta|wheat flour|chapati flour|आटा', 'vegan', 1, 12.1, 63.0, 1.7, 11.2, { staple: 1, subs: ['multigrain-atta'] }],
      ['multigrain-atta', 'Multigrain atta', 'multigrain flour|मल्टीग्रेन आटा', 'vegan', 1, 12.0, 60.0, 2.5, 11.0, { subs: ['atta'] }],
      ['suji', 'Suji', 'rava|rawa|sooji|semolina|सूजी', 'vegan', 1, 10.4, 70.0, 0.8, 3.9, { staple: 1 }],
      ['daliya', 'Daliya', 'broken wheat|dalia|lapsi|bulgur|दलिया', 'vegan', 1, 11.8, 63.0, 1.5, 12.5],
      ['oats', 'Oats', 'rolled oats|jai|ओट्स', 'vegan', 1, 13.2, 58.0, 6.5, 10.1, { staple: 1 }],
      ['ragi-flour', 'Ragi flour', 'ragi|nachni|finger millet|mandua|रागी', 'vegan', 1, 7.2, 66.0, 1.9, 11.2, { note: 'Rich in calcium.' }],
      ['jowar-flour', 'Jowar flour', 'jowar|jwari|sorghum|ज्वार', 'vegan', 1, 10.0, 62.0, 1.7, 9.7, { subs: ['bajra-flour'] }],
      ['bajra-flour', 'Bajra flour', 'bajra|pearl millet|बाजरा', 'vegan', 1, 11.0, 56.0, 5.4, 11.5, { subs: ['jowar-flour'] }],
      ['besan', 'Besan', 'gram flour|chickpea flour|बेसन', 'vegan', 1, 21.0, 47.0, 6.0, 11.0, { staple: 1, note: 'Plant protein for chillas and cheelas.' }],
      ['quinoa', 'Quinoa', 'किनोआ', 'vegan', 1, 14.1, 57.0, 6.1, 7.0],
      ['millets', 'Millets (foxtail / kodo / little)', 'kangni|kodo|kutki|samai|siridhanya|millet', 'vegan', 1, 12.3, 60.0, 4.3, 8.0, { subs: ['quinoa'] }],
      ['rice-flour', 'Rice flour', 'chawal ka atta|chawal ka aata|चावल का आटा', 'vegan', 1, 6.0, 79.0, 1.4, 2.4],
      ['idli-batter', 'Idli / dosa batter', 'idli batter|dosa batter|maavu|इडली बैटर', 'vegan', 1, 4.0, 25.0, 0.4, 1.2, { shelf: 4 }],
      ['murmura', 'Puffed rice', 'murmura|kurmura|mamra|muri|मुरमुरा', 'vegan', 1, 7.5, 77.0, 0.1, 1.7],
      ['vermicelli', 'Vermicelli', 'seviyan|sevai|semiya|सेवइयां', 'vegan', 0, 11.0, 74.0, 1.0, 3.0],
      ['sabudana', 'Sabudana', 'sago|tapioca pearls|साबूदाना', 'vegan', 0, 0.2, 87.0, 0.2, 0.9, { note: 'Mostly starch — pair with peanuts and curd.' }],
    ],
  ],
  [
    'dals',
    [
      ['moong-dal', 'Moong dal (yellow)', 'moong|mung dal|dhuli moong|पीली मूंग दाल|मूंग दाल', 'vegan', 1, 24.5, 52.0, 1.2, 8.2, { staple: 1 }],
      ['whole-moong', 'Whole green moong', 'sabut moong|green gram|hari moong|साबुत मूंग', 'vegan', 1, 23.9, 46.0, 1.2, 16.3, { subs: ['moong-dal'] }],
      ['sprouts', 'Moong sprouts', 'sprouts|ankurit moong|sprouted moong|अंकुरित', 'vegan', 1, 3.0, 4.1, 0.2, 1.8, { shelf: 3 }],
      ['masoor-dal', 'Masoor dal', 'red lentils|lal masoor|मसूर दाल', 'vegan', 1, 24.6, 50.0, 1.1, 10.8, { staple: 1 }],
      ['toor-dal', 'Toor dal', 'arhar|tuvar|tur dal|pigeon pea|अरहर दाल|तुअर', 'vegan', 1, 22.3, 55.0, 1.7, 9.1, { staple: 1 }],
      ['chana-dal', 'Chana dal', 'split bengal gram|चना दाल', 'vegan', 1, 20.8, 48.0, 5.6, 17.0, { staple: 1 }],
      ['urad-dal', 'Urad dal', 'black gram|dhuli urad|udad|उड़द दाल', 'vegan', 1, 24.0, 45.0, 1.6, 11.9],
      ['rajma', 'Rajma', 'kidney beans|राजमा', 'vegan', 1, 22.5, 44.0, 1.1, 15.2, { staple: 1 }],
      ['kabuli-chana', 'Kabuli chana', 'chickpeas|chole|chhole|garbanzo|काबुली चना|छोले', 'vegan', 1, 20.5, 50.7, 6.0, 12.2, { staple: 1 }],
      ['kala-chana', 'Kala chana', 'black chickpeas|desi chana|काला चना', 'vegan', 1, 19.0, 43.0, 5.0, 17.0, { subs: ['kabuli-chana'] }],
      ['lobia', 'Lobia', 'black eyed peas|chawli|rongi|लोबिया', 'vegan', 1, 23.5, 48.0, 1.3, 10.6],
      ['soya-chunks', 'Soya chunks', 'soya badi|nutrela|meal maker|soy chunks|सोया चंक्स', 'vegan', 1, 52.0, 21.0, 0.5, 13.0, { note: 'One of the richest plant proteins.' }],
      ['sattu', 'Sattu', 'roasted gram flour|सत्तू', 'vegan', 1, 22.0, 50.0, 5.2, 12.0],
      ['roasted-chana', 'Roasted chana', 'bhuna chana|bhune chane|daria|भुना चना', 'vegan', 1, 22.5, 50.0, 5.2, 12.0],
      ['matki', 'Moth beans', 'matki|moth|मोठ', 'vegan', 1, 23.0, 50.0, 1.6, 10.0],
    ],
  ],
  [
    'dairy',
    [
      ['milk', 'Milk (toned)', 'doodh|dudh|दूध', 'veg', 1, 3.1, 4.8, 3.0, 0, { staple: 1, shelf: 2 }],
      ['curd', 'Curd', 'dahi|yogurt|yoghurt|दही', 'veg', 1, 3.5, 4.5, 3.0, 0, { staple: 1, shelf: 4, note: 'Gut-friendly and cooling.', subs: ['greek-yogurt'] }],
      ['greek-yogurt', 'Hung curd / Greek yogurt', 'hung curd|greek yoghurt|chakka', 'veg', 1, 9.0, 4.0, 3.0, 0, { shelf: 5, subs: ['curd'] }],
      ['paneer', 'Paneer', 'cottage cheese|पनीर', 'veg', 1, 18.3, 2.0, 20.0, 0, { staple: 1, shelf: 4, note: 'Good protein; portions of 50–100 g keep the fat in check.', subs: ['tofu'] }],
      ['chaas', 'Buttermilk', 'chaas|chhachh|mattha|छाछ', 'veg', 1, 1.2, 1.9, 0.6, 0, { shelf: 2 }],
      ['cheese', 'Cheese', 'cheese slice|processed cheese|चीज़', 'veg', 0, 20.0, 3.0, 25.0, 0, { shelf: 30 }],
      ['butter', 'Butter', 'makhan|मक्खन', 'veg', 0, 0.9, 0.1, 81.0, 0, { shelf: 60 }],
      ['cream', 'Fresh cream', 'malai|cream|मलाई', 'veg', 0, 2.1, 3.0, 25.0, 0, { shelf: 5 }],
    ],
  ],
  [
    'eggs-meat',
    [
      ['egg', 'Eggs', 'anda|ande|egg|अंडा', 'egg', 1, 12.6, 0.7, 9.5, 0, { piece: [50], staple: 1, shelf: 21 }],
      ['egg-white', 'Egg whites', 'egg white|safedi', 'egg', 1, 10.9, 0.7, 0.2, 0, { piece: [33], subs: ['egg'] }],
      ['chicken-breast', 'Chicken breast (boneless)', 'boneless chicken|chicken breast|chicken fillet', 'nonveg', 1, 22.5, 0, 2.6, 0, { shelf: 2, subs: ['chicken'] }],
      ['chicken', 'Chicken (curry cut)', 'chicken|murgh|chicken curry cut|मुर्गा|चिकन', 'nonveg', 1, 19.0, 0, 7.0, 0, { shelf: 2, subs: ['chicken-breast'] }],
      ['fish', 'Fish', 'machli|machhi|rohu|basa|surmai|मछली', 'nonveg', 1, 17.5, 0, 2.0, 0, { shelf: 1 }],
      ['prawns', 'Prawns', 'jhinga|shrimp|झींगा', 'nonveg', 1, 20.0, 0.9, 1.0, 0, { shelf: 1 }],
      ['mutton', 'Mutton', 'gosht|goat meat|lamb|मटन', 'nonveg', 0, 18.5, 0, 13.0, 0, { shelf: 2, note: 'Choose lean cuts and smaller portions.' }],
      ['chicken-keema', 'Chicken keema', 'minced chicken|keema', 'nonveg', 1, 17.4, 0, 8.1, 0, { shelf: 1 }],
    ],
  ],
  [
    'spices-oil',
    [
      ['salt', 'Salt', 'namak|नमक', 'vegan', 1, 0, 0, 0, 0, { basic: 1 }],
      ['water', 'Water', 'paani|pani|पानी', 'vegan', 1, 0, 0, 0, 0, { basic: 1 }],
      ['turmeric', 'Turmeric', 'haldi|हल्दी', 'vegan', 1, 7.8, 58.0, 3.3, 21.0, { basic: 1 }],
      ['cumin', 'Cumin seeds', 'jeera|zeera|जीरा', 'vegan', 1, 17.8, 34.0, 22.3, 10.5, { basic: 1 }],
      ['mustard-seeds', 'Mustard seeds', 'rai|sarson dana|राई', 'vegan', 1, 26.0, 16.0, 36.0, 12.0, { basic: 1 }],
      ['hing', 'Hing', 'asafoetida|हींग', 'vegan', 1, 4.0, 67.0, 1.1, 4.1, { basic: 1 }],
      ['red-chilli-powder', 'Red chilli powder', 'lal mirch|mirchi powder|लाल मिर्च', 'vegan', 1, 12.0, 23.0, 14.0, 35.0, { basic: 1 }],
      ['garam-masala', 'Garam masala', 'गरम मसाला', 'vegan', 1, 12.0, 40.0, 15.0, 25.0, { basic: 1 }],
      ['coriander-powder', 'Coriander powder', 'dhaniya powder|धनिया पाउडर', 'vegan', 1, 12.4, 13.0, 17.8, 41.9, { basic: 1 }],
      ['kasuri-methi', 'Kasuri methi', 'dried fenugreek|कसूरी मेथी', 'vegan', 1, 11.0, 20.0, 1.5, 25.0, { basic: 1 }],
      ['ajwain', 'Ajwain', 'carom seeds|अजवाइन', 'vegan', 1, 16.0, 25.0, 21.0, 20.0, { basic: 1 }],
      ['black-pepper', 'Black pepper', 'kali mirch|काली मिर्च', 'vegan', 1, 10.4, 38.7, 3.3, 25.3, { basic: 1 }],
      ['chaat-masala', 'Chaat masala', 'चाट मसाला', 'vegan', 1, 8.0, 45.0, 3.0, 10.0, { basic: 1 }],
      ['sambar-masala', 'Sambar powder', 'sambar masala|सांभर मसाला', 'vegan', 1, 13.0, 35.0, 10.0, 20.0, { basic: 1 }],
      ['tandoori-masala', 'Tandoori masala', 'tikka masala|तंदूरी मसाला', 'vegan', 1, 11.0, 35.0, 10.0, 20.0, { basic: 1 }],
      ['whole-spices', 'Whole spices', 'khada masala|tej patta|bay leaf|dalchini|cinnamon|laung|cloves|elaichi|cardamom|खड़ा मसाला', 'vegan', 1, 6.0, 50.0, 6.0, 30.0, { basic: 1 }],
      ['fennel', 'Fennel seeds', 'saunf|sonf|सौंफ', 'vegan', 1, 15.8, 12.5, 14.9, 39.8, { basic: 1 }],
      ['amchur', 'Amchur', 'dry mango powder|आमचूर', 'vegan', 1, 2.0, 60.0, 2.0, 10.0, { basic: 1 }],
      ['dry-ginger', 'Dry ginger powder', 'saunth|sonth|सोंठ', 'vegan', 1, 9.0, 57.0, 4.2, 14.1, { basic: 1, note: 'Many Jain kitchens use saunth instead of fresh ginger.' }],
      ['kalonji', 'Nigella seeds', 'kalonji|कलौंजी', 'vegan', 1, 18.0, 30.0, 22.0, 10.0, { basic: 1 }],
      ['oil', 'Cooking oil', 'tel|refined oil|sunflower oil|groundnut oil|तेल', 'vegan', 1, 0, 0, 100.0, 0, { basic: 1 }],
      ['mustard-oil', 'Mustard oil', 'sarson ka tel|सरसों का तेल', 'vegan', 1, 0, 0, 100.0, 0, { basic: 1 }],
      ['olive-oil', 'Olive oil', 'जैतून का तेल', 'vegan', 1, 0, 0, 100.0, 0, { basic: 1 }],
      ['coconut-oil', 'Coconut oil', 'nariyal tel|नारियल तेल', 'vegan', 1, 0, 0, 100.0, 0, { basic: 1 }],
      ['ghee', 'Ghee', 'desi ghee|घी', 'veg', 1, 0, 0, 99.5, 0, { basic: 1, note: 'A teaspoon adds flavour — no need for more.' }],
    ],
  ],
  [
    'packaged',
    [
      ['bread', 'Whole wheat bread', 'brown bread|atta bread|bread|ब्रेड', 'veg', 1, 12.5, 38.0, 3.5, 6.8, { piece: [30, 'slice'], shelf: 5 }],
      ['peanut-butter', 'Peanut butter', 'unsweetened peanut butter', 'vegan', 1, 25.0, 13.0, 50.0, 6.0],
      ['muesli', 'Muesli (no added sugar)', 'muesli', 'vegan', 1, 10.0, 60.0, 6.0, 8.0],
      ['whole-wheat-pasta', 'Whole wheat pasta', 'pasta|macaroni', 'vegan', 1, 13.0, 63.0, 2.5, 9.0],
      ['tomato-puree', 'Tomato puree', 'tomato paste|टमाटर प्यूरी', 'vegan', 1, 1.7, 7.0, 0.2, 1.9, { subs: ['tomato'] }],
      ['soy-sauce', 'Soy sauce', 'सोया सॉस', 'vegan', 1, 8.0, 5.0, 0, 0.8],
      ['vinegar', 'Vinegar', 'sirka|सिरका', 'vegan', 1, 0, 0.9, 0, 0],
      ['ketchup', 'Tomato ketchup', 'sauce|ketchup|केचप', 'vegan', 0, 1.2, 25.0, 0.1, 0.3],
      ['instant-noodles', 'Instant noodles', 'maggi|noodles|नूडल्स', 'veg', 0, 9.0, 58.0, 15.0, 3.0],
      ['biscuits', 'Biscuits', 'cookies|biscuit|बिस्कुट', 'veg', 0, 7.0, 70.0, 18.0, 2.0],
      ['namkeen', 'Namkeen', 'bhujia|mixture|नमकीन', 'vegan', 0, 13.0, 40.0, 35.0, 6.0],
      ['cornflakes', 'Cornflakes', 'corn flakes|कॉर्नफ्लेक्स', 'vegan', 0, 7.0, 83.0, 0.4, 3.0],
      ['dark-chocolate', 'Dark chocolate', 'chocolate|डार्क चॉकलेट', 'veg', 0, 7.8, 46.0, 43.0, 11.0],
      ['papad', 'Papad', 'papadum|पापड़', 'vegan', 0, 25.0, 46.0, 3.0, 9.0],
    ],
  ],
  [
    'other',
    [
      ['peanuts', 'Peanuts', 'moongphali|mungfali|groundnut|मूंगफली', 'vegan', 1, 25.8, 7.6, 49.2, 8.5, { staple: 1 }],
      ['almonds', 'Almonds', 'badam|बादाम', 'vegan', 1, 21.2, 9.8, 49.9, 12.5, { piece: [1.2], staple: 1 }],
      ['walnuts', 'Walnuts', 'akhrot|अखरोट', 'vegan', 1, 15.2, 7.0, 65.0, 6.7],
      ['cashews', 'Cashews', 'kaju|काजू', 'vegan', 1, 18.0, 27.0, 44.0, 3.3],
      ['flaxseed', 'Flaxseeds', 'alsi|alsi seeds|अलसी', 'vegan', 1, 18.3, 1.6, 42.0, 27.3],
      ['chia-seeds', 'Chia seeds', 'chia|चिया', 'vegan', 1, 16.5, 7.7, 30.7, 34.4],
      ['sesame', 'Sesame seeds', 'til|तिल', 'vegan', 1, 17.7, 11.6, 49.7, 11.8],
      ['pumpkin-seeds', 'Pumpkin seeds', 'kaddu ke beej|कद्दू के बीज', 'vegan', 1, 30.0, 5.0, 49.0, 6.0],
      ['makhana', 'Makhana', 'fox nuts|lotus seeds|phool makhana|मखाना', 'vegan', 1, 9.7, 76.9, 0.1, 0, { note: 'Light, crunchy snack when roasted.' }],
      ['tofu', 'Tofu', 'soya paneer|bean curd|टोफू', 'vegan', 1, 8.1, 1.5, 4.8, 0.3, { shelf: 5, subs: ['paneer'] }],
      ['coconut', 'Coconut (fresh)', 'nariyal|grated coconut|नारियल', 'vegan', 1, 3.3, 6.2, 33.5, 9.0, { shelf: 5 }],
      ['jaggery', 'Jaggery', 'gud|gur|गुड़', 'vegan', 0, 0.4, 95.0, 0.1, 0],
      ['sugar', 'Sugar', 'cheeni|shakkar|चीनी', 'vegan', 0, 0, 100.0, 0, 0],
      ['honey', 'Honey', 'shahad|शहद', 'veg', 0, 0.3, 82.0, 0, 0.2],
      ['tamarind', 'Tamarind', 'imli|इमली', 'vegan', 1, 2.8, 57.0, 0.6, 5.1],
      ['coconut-milk', 'Coconut milk', 'nariyal doodh', 'vegan', 0, 2.0, 3.0, 21.0, 0, { shelf: 3 }],
    ],
  ],
];

function toIngredient(category: PantryCategory, r: Row): Ingredient {
  const [key, name, aliases, diet, healthy, p, c, f, fib, o = {}] = r;
  const ing: Ingredient = {
    key,
    name,
    aliases: aliases.split('|').map((a) => a.trim().toLowerCase()).filter(Boolean),
    category,
    diet,
    healthy: healthy === 1,
    per100: { kcal: kcalFrom(p, c, f, fib), protein: r1(p), carbs: r1(c), fat: r1(f), fiber: r1(fib) },
  };
  if (o.piece) {
    ing.pieceG = o.piece[0];
    if (o.piece[1]) ing.pieceLabel = o.piece[1];
  }
  if (o.basic) ing.basic = true;
  if (o.jain) ing.jainAvoid = true;
  if (o.staple) ing.staple = true;
  if (o.shelf) ing.shelfDays = o.shelf;
  if (o.note) ing.note = o.note;
  if (o.subs) ing.subs = o.subs;
  return ing;
}

export const INGREDIENTS: Ingredient[] = DATA.flatMap(([cat, rows]) => rows.map((r) => toIngredient(cat, r)));

export const INGREDIENT_BY_KEY: ReadonlyMap<string, Ingredient> = new Map(INGREDIENTS.map((i) => [i.key, i]));

export function getIngredient(key: string): Ingredient | undefined {
  return INGREDIENT_BY_KEY.get(key);
}

/** Staples for the "Tap what you usually keep" picker. */
export const STAPLES: Ingredient[] = INGREDIENTS.filter((i) => i.staple);

/** Units used in recipes. */
export type Unit = 'g' | 'ml' | 'pc' | 'tsp' | 'tbsp' | 'cup' | 'pinch';

/** Grams for a quantity of an ingredient in a unit (ml ≈ g). */
export function gramsOf(key: string, qty: number, unit: Unit): number {
  const ing = INGREDIENT_BY_KEY.get(key);
  switch (unit) {
    case 'g':
    case 'ml':
      return qty;
    case 'pc':
      return qty * (ing?.pieceG ?? 50);
    case 'tsp':
      return qty * 5;
    case 'tbsp':
      return qty * 15;
    case 'cup':
      return qty * 200;
    case 'pinch':
      return qty * 0.5;
    default:
      return qty;
  }
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFC')
    .replace(/[^a-z0-9ऀ-ॿ ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Quick search for the add sheet: name/alias prefix and word matches rank first. */
export function searchIngredients(query: string, limit = 20): Ingredient[] {
  const q = norm(query);
  if (!q) return [];
  const scored: { i: Ingredient; s: number }[] = [];
  for (const i of INGREDIENTS) {
    const names = [norm(i.name), ...i.aliases.map(norm)];
    let best = 0;
    for (const n of names) {
      if (n === q) best = Math.max(best, 100);
      else if (n.startsWith(q)) best = Math.max(best, 80);
      else if (n.split(' ').some((w) => w.startsWith(q))) best = Math.max(best, 60);
      else if (q.length >= 3 && n.includes(q)) best = Math.max(best, 40);
    }
    if (best) scored.push({ i, s: best + (i.staple ? 2 : 0) + (i.basic ? -1 : 0) });
  }
  return scored
    .sort((a, b) => b.s - a.s || a.i.name.localeCompare(b.i.name))
    .slice(0, limit)
    .map((x) => x.i);
}
