/**
 * Bloom — India-first food database (pure data + search, no runtime deps).
 *
 * SOURCES
 *  - Indian Food Composition Tables 2017 (IFCT 2017), National Institute of
 *    Nutrition (ICMR-NIN), Hyderabad — raw ingredients, Indian staples.
 *  - USDA FoodData Central (SR Legacy / Foundation Foods) — international
 *    staples, packaged items and ingredients not covered by IFCT.
 *  - Cooked / composite dishes are computed from typical home recipes
 *    (ingredient weights x the tables above) and are flagged `approx: true`.
 *
 * ALL VALUES ARE ESTIMATES. Real values vary with recipe, oil/ghee used,
 * portion size and brand. Not medical or dietetic advice.
 *
 * CONVENTIONS
 *  - `per` is PER SERVING (not per 100 g); kcal in kcal, everything else grams,
 *    rounded to 1 decimal.
 *  - `carbs` = available carbohydrate (excluding dietary fibre), IFCT style, so
 *    energy ≈ 4·protein + 4·carbs + 9·fat + 2·fibre.
 *  - Household measures: 1 katori cooked dal/sabzi ≈ 150 g; 1 cup cooked
 *    rice ≈ 150 g; 1 medium roti ≈ 40 g; 1 cup chai ≈ 150 ml; 1 glass ≈ 200–250 ml.
 *  - Alcoholic drinks are intentionally omitted (alcohol energy, 7 kcal/g, is
 *    not represented in the macro model).
 */

export type DietTag = 'veg' | 'egg' | 'nonveg' | 'vegan';
export type FoodCategory =
  | 'grains'
  | 'breads'
  | 'dals'
  | 'curries'
  | 'south_indian'
  | 'snacks'
  | 'street'
  | 'dairy'
  | 'eggs'
  | 'meat_fish'
  | 'fruits'
  | 'vegetables'
  | 'drinks'
  | 'sweets'
  | 'nuts_seeds'
  | 'breakfast'
  | 'fast_food'
  | 'other';

export interface Food {
  id: string; // kebab-case, unique
  name: string; // English display, e.g. "Chapati / roti"
  aliases: string[]; // Hindi/Hinglish + spellings: ["roti","phulka","chapati","रोटी"]
  category: FoodCategory;
  diet: DietTag; // vegan ⊂ veg; egg; nonveg
  serving: { label: string; grams: number }; // "1 medium roti", "1 katori (150 g)"
  per: { kcal: number; protein: number; carbs: number; fat: number; fiber: number }; // PER SERVING
  approx?: true; // home-cooked dishes whose values vary
}

/**
 * Compact row: [id, name, aliases ('|'-separated), diet, servingLabel, grams,
 *               kcal, protein, carbs, fat, fiber, approx (1 = approx)]
 */
type Row = [string, string, string, DietTag, string, number, number, number, number, number, number, (0 | 1)?];

const A = 1 as const;

const DATA: [FoodCategory, Row[]][] = [
  [
    'grains',
    [
      ['plain-rice', 'Plain rice (cooked)', 'chawal|steamed rice|white rice|boiled rice|bhaat|bhat|चावल|भात', 'vegan', '1 cup (150 g)', 150, 195, 4.0, 42.3, 0.4, 0.6],
      ['brown-rice', 'Brown rice (cooked)', 'brown chawal|ब्राउन राइस', 'vegan', '1 cup (150 g)', 150, 168, 3.9, 32.0, 1.4, 2.7],
      ['jeera-rice', 'Jeera rice', 'cumin rice|zeera rice|जीरा राइस|जीरा चावल', 'veg', '1 cup (150 g)', 150, 230, 4.0, 40.0, 6.0, 0.8, A],
      ['veg-pulao', 'Veg pulao', 'pulav|pulaw|vegetable pulao|पुलाव', 'veg', '1 cup (180 g)', 180, 265, 5.5, 42.0, 8.0, 2.5, A],
      ['veg-biryani', 'Veg biryani', 'vegetable biryani|biriyani|बिरयानी', 'veg', '1 plate (250 g)', 250, 385, 8.0, 58.0, 13.0, 4.0, A],
      ['chicken-biryani', 'Chicken biryani', 'murgh biryani|chicken biriyani|चिकन बिरयानी', 'nonveg', '1 plate (300 g)', 300, 490, 24.0, 58.0, 18.0, 2.5, A],
      ['mutton-biryani', 'Mutton biryani', 'gosht biryani|lamb biryani|mutton biriyani|मटन बिरयानी', 'nonveg', '1 plate (300 g)', 300, 540, 24.0, 56.0, 24.0, 2.5, A],
      ['egg-biryani', 'Egg biryani', 'anda biryani|अंडा बिरयानी', 'egg', '1 plate (300 g)', 300, 455, 15.0, 60.0, 17.0, 2.5, A],
      ['khichdi', 'Moong dal khichdi', 'khichri|khichadi|kichdi|खिचड़ी|खिचड़ी', 'veg', '1 katori (200 g)', 200, 245, 8.5, 38.0, 6.0, 4.0, A],
      ['curd-rice', 'Curd rice', 'dahi chawal|thayir sadam|mosaranna|दही चावल', 'veg', '1 bowl (200 g)', 200, 258, 7.0, 40.0, 7.5, 1.0, A],
      ['lemon-rice', 'Lemon rice', 'chitranna|nimbu chawal|elumichai sadam', 'vegan', '1 cup (180 g)', 180, 295, 5.0, 48.0, 9.0, 1.5, A],
      ['veg-fried-rice', 'Veg fried rice', 'fried rice|chinese rice|फ्राइड राइस', 'vegan', '1 plate (200 g)', 200, 335, 6.5, 52.0, 11.0, 2.0, A],
      ['chicken-fried-rice', 'Chicken fried rice', 'chicken chinese rice', 'nonveg', '1 plate (250 g)', 250, 420, 18.0, 55.0, 14.0, 2.0, A],
      ['rajma-chawal', 'Rajma chawal', 'rajma rice|राजमा चावल', 'vegan', '1 plate (300 g)', 300, 392, 13.0, 67.0, 6.5, 8.0, A],
      ['dal-chawal', 'Dal chawal', 'dal rice|dal bhaat|दाल चावल', 'veg', '1 plate (300 g)', 300, 362, 12.0, 63.0, 6.0, 5.0, A],
      ['rolled-oats', 'Oats (dry, rolled)', 'oats|jai|oatmeal raw|ओट्स', 'vegan', '1/2 cup dry (40 g)', 40, 152, 5.3, 24.0, 2.8, 4.0],
      ['quinoa', 'Quinoa (cooked)', 'kinwa|किनोआ', 'vegan', '1 cup (185 g)', 185, 222, 8.1, 34.2, 3.6, 5.2],
      ['dalia', 'Dalia (broken wheat porridge)', 'daliya|lapsi|broken wheat|godhuma rava|दलिया', 'vegan', '1 katori (150 g)', 150, 152, 5.0, 26.0, 2.5, 4.0, A],
      ['ragi-mudde', 'Ragi mudde / ragi ball', 'ragi ball|finger millet|nachni|रागी', 'vegan', '1 ball (150 g)', 150, 222, 4.5, 44.0, 1.5, 6.0, A],
      ['muesli', 'Muesli (dry)', 'musli|म्यूसली', 'vegan', '1/2 cup (50 g)', 50, 190, 5.0, 33.0, 3.5, 4.0],
      ['pasta-plain', 'Pasta (cooked, plain)', 'penne|spaghetti|macaroni|पास्ता', 'vegan', '1 cup (140 g)', 140, 220, 8.0, 43.0, 1.3, 2.5],
      ['white-sauce-pasta', 'White sauce pasta', 'alfredo pasta|white pasta', 'veg', '1 plate (250 g)', 250, 422, 12.0, 52.0, 18.0, 3.0, A],
      ['red-sauce-pasta', 'Red sauce pasta', 'arrabbiata|tomato pasta|red pasta', 'veg', '1 plate (250 g)', 250, 345, 10.0, 55.0, 9.0, 4.0, A],
      ['bisi-bele-bath', 'Bisi bele bath', 'bisibelebath|sambar rice|sambar sadam', 'veg', '1 plate (200 g)', 200, 285, 8.0, 40.0, 9.5, 5.0, A],
    ],
  ],
  [
    'breads',
    [
      ['chapati', 'Chapati / roti', 'roti|phulka|chapati|chapatti|fulka|rotli|रोटी|चपाती|फुलका', 'vegan', '1 medium roti (40 g)', 40, 118, 3.5, 19.5, 2.5, 3.0],
      ['roti-with-ghee', 'Roti with ghee', 'ghee roti|chupadi roti|घी रोटी', 'veg', '1 medium roti (45 g)', 45, 160, 3.5, 19.5, 7.0, 3.0],
      ['tandoori-roti', 'Tandoori roti', 'tandoori rotti|तंदूरी रोटी', 'vegan', '1 roti (55 g)', 55, 152, 5.0, 30.0, 1.0, 3.0],
      ['naan', 'Naan (plain)', 'nan|plain naan|नान', 'veg', '1 naan (90 g)', 90, 260, 8.0, 45.0, 5.0, 2.0],
      ['butter-naan', 'Butter naan', 'butter nan|बटर नान', 'veg', '1 naan (100 g)', 100, 320, 8.5, 46.0, 11.0, 2.0],
      ['kulcha', 'Kulcha', 'amritsari kulcha|कुलचा', 'veg', '1 kulcha (80 g)', 80, 240, 7.0, 40.0, 5.5, 2.0],
      ['aloo-paratha', 'Aloo paratha', 'alu paratha|aloo parantha|potato paratha|आलू पराठा', 'veg', '1 medium (120 g)', 120, 292, 6.0, 40.0, 11.5, 4.0, A],
      ['gobi-paratha', 'Gobi paratha', 'gobhi paratha|cauliflower paratha|गोभी पराठा', 'veg', '1 medium (120 g)', 120, 262, 6.5, 35.0, 10.0, 4.5, A],
      ['paneer-paratha', 'Paneer paratha', 'paneer parantha|पनीर पराठा', 'veg', '1 medium (120 g)', 120, 320, 11.0, 34.0, 15.0, 3.5, A],
      ['methi-paratha', 'Methi paratha', 'methi parantha|fenugreek paratha|मेथी पराठा', 'veg', '1 medium (70 g)', 70, 205, 5.0, 26.0, 8.5, 4.0, A],
      ['plain-paratha', 'Plain / lachha paratha', 'paratha|parantha|lachha paratha|laccha paratha|पराठा|परांठा', 'veg', '1 paratha (80 g)', 80, 262, 5.5, 34.0, 11.5, 3.0, A],
      ['puri', 'Puri', 'poori|pooris|पूरी', 'vegan', '1 puri (25 g)', 25, 100, 1.8, 11.5, 5.2, 1.0],
      ['bhatura', 'Bhatura', 'bhature|bhatoora|भटूरा|भटूरे', 'veg', '1 bhatura (80 g)', 80, 300, 6.5, 38.0, 13.5, 1.5],
      ['missi-roti', 'Missi roti', 'besan roti|मिस्सी रोटी', 'vegan', '1 roti (50 g)', 50, 152, 6.0, 22.0, 4.0, 4.0],
      ['bajra-roti', 'Bajra roti', 'bajre ki roti|pearl millet roti|bajri bhakri|बाजरा रोटी', 'vegan', '1 roti (50 g)', 50, 152, 4.5, 25.0, 3.5, 4.0],
      ['jowar-roti', 'Jowar roti / bhakri', 'jowar bhakri|jolada rotti|sorghum roti|ज्वार रोटी', 'vegan', '1 roti (50 g)', 50, 148, 4.5, 28.0, 1.5, 4.5],
      ['ragi-roti', 'Ragi roti', 'nachni roti|finger millet roti|रागी रोटी', 'vegan', '1 roti (50 g)', 50, 142, 3.5, 26.0, 2.5, 4.5],
      ['makki-roti', 'Makki di roti', 'makki ki roti|maize roti|corn roti|मक्की की रोटी', 'veg', '1 roti (60 g)', 60, 192, 4.0, 30.0, 6.0, 4.0, A],
      ['thepla', 'Methi thepla', 'thepla|theplu|थेपला', 'vegan', '1 thepla (40 g)', 40, 132, 3.5, 17.0, 5.5, 2.5, A],
      ['white-bread', 'White bread', 'bread|bread slice|double roti|ब्रेड', 'veg', '1 slice (25 g)', 25, 67, 2.2, 12.5, 0.8, 0.6],
      ['brown-bread', 'Brown bread', 'whole wheat bread|atta bread|ब्राउन ब्रेड', 'veg', '1 slice (28 g)', 28, 71, 3.0, 12.0, 1.0, 2.0],
      ['pav', 'Pav (bread roll)', 'pao|ladi pav|bun|पाव', 'veg', '1 pav (40 g)', 40, 110, 3.5, 20.0, 1.6, 0.8],
    ],
  ],
  [
    'dals',
    [
      ['dal-tadka', 'Dal tadka (toor/arhar)', 'dal|daal|toor dal|arhar dal|tuvar dal|yellow dal|dal tarka|दाल|तड़का दाल|अरहर दाल', 'veg', '1 katori (150 g)', 150, 168, 8.0, 21.0, 5.5, 4.0, A],
      ['moong-dal', 'Moong dal (yellow)', 'mung dal|moong ki dal|dhuli moong|मूंग दाल', 'vegan', '1 katori (150 g)', 150, 145, 8.5, 19.0, 3.5, 3.5, A],
      ['masoor-dal', 'Masoor dal', 'red lentil dal|lal dal|masur dal|मसूर दाल', 'vegan', '1 katori (150 g)', 150, 152, 9.0, 20.0, 4.0, 4.0, A],
      ['chana-dal', 'Chana dal', 'bengal gram dal|channa dal|चना दाल', 'vegan', '1 katori (150 g)', 150, 185, 9.5, 24.0, 5.0, 6.0, A],
      ['dal-makhani', 'Dal makhani', 'maa ki dal|makhani dal|kali dal|दाल मखनी', 'veg', '1 katori (150 g)', 150, 255, 9.0, 22.0, 14.0, 6.0, A],
      ['dal-fry', 'Dal fry', 'daal fry|दाल फ्राई', 'veg', '1 katori (150 g)', 150, 182, 8.0, 21.0, 7.0, 4.0, A],
      ['sambar', 'Sambar', 'sambhar|saambar|सांबर', 'vegan', '1 katori (150 g)', 150, 115, 5.0, 15.0, 3.5, 4.0, A],
      ['rasam', 'Rasam', 'saaru|charu|रसम', 'vegan', '1 katori (150 g)', 150, 52, 1.5, 7.0, 2.0, 1.0, A],
      ['rajma', 'Rajma masala', 'rajma|kidney bean curry|राजमा', 'vegan', '1 katori (150 g)', 150, 198, 9.0, 25.0, 6.0, 7.5, A],
      ['chole', 'Chole / chana masala', 'chhole|chana masala|chickpea curry|kabuli chana|छोले|चना मसाला', 'vegan', '1 katori (150 g)', 150, 215, 9.0, 26.0, 7.5, 7.5, A],
      ['kala-chana-curry', 'Kala chana curry', 'black chana|kala chana|kadala curry|काला चना', 'vegan', '1 katori (150 g)', 150, 205, 9.5, 26.0, 6.0, 8.0, A],
      ['lobia-curry', 'Lobia curry', 'lobia|black eyed peas|chawli|रौंगी|लोबिया', 'vegan', '1 katori (150 g)', 150, 178, 9.0, 23.0, 5.0, 6.0, A],
      ['kadhi-pakora', 'Kadhi pakora', 'kadhi|kadi|punjabi kadhi|कढ़ी', 'veg', '1 katori (150 g)', 150, 172, 6.0, 13.0, 10.5, 1.5, A],
      ['boiled-chickpeas', 'Chickpeas (boiled)', 'boiled chana|kabuli chana boiled|ubla chana|उबले चने', 'vegan', '1/2 cup (100 g)', 100, 164, 8.9, 21.0, 2.6, 7.6],
      ['boiled-rajma', 'Kidney beans (boiled)', 'boiled rajma|ubla rajma', 'vegan', '1/2 cup (100 g)', 100, 127, 8.7, 18.0, 0.5, 6.4],
    ],
  ],
  [
    'curries',
    [
      ['palak-paneer', 'Palak paneer', 'saag paneer|spinach paneer|पालक पनीर', 'veg', '1 katori (150 g)', 150, 232, 10.0, 8.0, 17.5, 3.0, A],
      ['paneer-butter-masala', 'Paneer butter masala', 'paneer makhani|butter paneer|पनीर बटर मसाला', 'veg', '1 katori (150 g)', 150, 330, 11.0, 12.0, 26.0, 2.0, A],
      ['shahi-paneer', 'Shahi paneer', 'शाही पनीर', 'veg', '1 katori (150 g)', 150, 318, 10.5, 11.0, 25.5, 1.5, A],
      ['kadai-paneer', 'Kadai paneer', 'karahi paneer|kadhai paneer|कढ़ाई पनीर', 'veg', '1 katori (150 g)', 150, 280, 11.0, 10.0, 21.5, 2.5, A],
      ['matar-paneer', 'Matar paneer', 'mutter paneer|peas paneer|मटर पनीर', 'veg', '1 katori (150 g)', 150, 252, 10.0, 13.0, 17.5, 3.5, A],
      ['paneer-bhurji', 'Paneer bhurji', 'scrambled paneer|पनीर भुर्जी', 'veg', '1 serving (100 g)', 100, 260, 14.0, 6.0, 20.0, 1.0, A],
      ['malai-kofta', 'Malai kofta', 'मलाई कोफ्ता', 'veg', '1 katori (150 g)', 150, 340, 7.0, 18.0, 26.5, 2.5, A],
      ['aloo-gobi', 'Aloo gobi', 'alu gobhi|aloo gobhi|आलू गोभी', 'vegan', '1 katori (150 g)', 150, 152, 3.5, 15.0, 8.5, 3.5, A],
      ['aloo-matar', 'Aloo matar', 'alu mutter|aloo mutter|आलू मटर', 'vegan', '1 katori (150 g)', 150, 162, 4.5, 18.0, 7.5, 4.0, A],
      ['jeera-aloo', 'Jeera aloo', 'aloo jeera|cumin potatoes|जीरा आलू', 'vegan', '1 katori (150 g)', 150, 192, 3.0, 25.0, 9.0, 3.0, A],
      ['dum-aloo', 'Dum aloo', 'dum alu|दम आलू', 'veg', '1 katori (150 g)', 150, 212, 3.5, 22.0, 12.0, 3.0, A],
      ['aloo-sabzi', 'Aloo sabzi (puri wale aloo)', 'aloo ki sabzi|potato curry|alu tamatar|आलू की सब्जी', 'vegan', '1 katori (150 g)', 150, 165, 3.0, 22.0, 7.0, 3.0, A],
      ['bhindi-masala', 'Bhindi masala', 'bhindi fry|okra|lady finger sabzi|bhendi|भिंडी', 'vegan', '1 katori (150 g)', 150, 155, 3.0, 10.0, 11.0, 4.5, A],
      ['baingan-bharta', 'Baingan bharta', 'baigan bharta|brinjal bharta|eggplant|बैंगन भरता', 'vegan', '1 katori (150 g)', 150, 138, 3.0, 10.0, 9.0, 5.0, A],
      ['mix-veg', 'Mixed vegetable sabzi', 'mix veg|mixed veg|मिक्स वेज', 'vegan', '1 katori (150 g)', 150, 145, 4.0, 13.0, 8.0, 4.0, A],
      ['cabbage-sabzi', 'Cabbage sabzi', 'patta gobhi|band gobhi|cabbage poriyal|पत्ता गोभी', 'vegan', '1 katori (150 g)', 150, 112, 2.5, 8.0, 7.5, 3.5, A],
      ['lauki-sabzi', 'Lauki sabzi', 'ghiya|dudhi|bottle gourd|lauki|लौकी', 'vegan', '1 katori (150 g)', 150, 82, 1.5, 6.0, 5.5, 2.5, A],
      ['karela-sabzi', 'Karela sabzi', 'bitter gourd|karela fry|करेला', 'vegan', '1 serving (100 g)', 100, 112, 2.5, 7.0, 8.0, 3.0, A],
      ['beans-poriyal', 'Beans poriyal / sabzi', 'french beans|beans sabzi|बीन्स', 'vegan', '1 katori (150 g)', 150, 122, 3.0, 8.0, 8.0, 4.5, A],
      ['sarson-saag', 'Sarson ka saag', 'saag|mustard greens|सरसों का साग', 'veg', '1 katori (150 g)', 150, 155, 4.5, 7.0, 11.5, 4.5, A],
      ['mushroom-masala', 'Mushroom masala', 'mushroom curry|khumb|मशरूम', 'veg', '1 katori (150 g)', 150, 142, 4.5, 8.0, 10.0, 2.5, A],
      ['soya-chunk-curry', 'Soya chunk curry', 'soyabean curry|nutrela curry|soya badi|सोया चाप करी|सोयाबीन', 'vegan', '1 katori (150 g)', 150, 182, 14.0, 12.0, 8.0, 4.5, A],
      ['tofu-stir-fry', 'Tofu stir fry', 'tofu sabzi|tofu bhurji|टोफू', 'vegan', '1 serving (150 g)', 150, 192, 14.0, 6.0, 12.5, 2.0, A],
      ['gatte-ki-sabzi', 'Gatte ki sabzi', 'besan gatte|gatta curry|गट्टे की सब्जी', 'veg', '1 katori (150 g)', 150, 232, 8.0, 18.0, 14.0, 3.5, A],
    ],
  ],
  [
    'south_indian',
    [
      ['idli', 'Idli', 'idly|iddli|इडली', 'vegan', '1 idli (40 g)', 40, 58, 1.9, 12.0, 0.2, 0.6],
      ['plain-dosa', 'Plain dosa', 'dosa|dosai|dose|sada dosa|डोसा', 'vegan', '1 medium (80 g)', 80, 170, 3.8, 27.0, 5.0, 1.2, A],
      ['masala-dosa', 'Masala dosa', 'masala dosai|मसाला डोसा', 'vegan', '1 dosa (180 g)', 180, 332, 6.5, 45.0, 13.5, 3.5, A],
      ['rava-dosa', 'Rava dosa', 'rawa dosa|sooji dosa|रवा डोसा', 'vegan', '1 dosa (100 g)', 100, 219, 4.0, 30.0, 9.0, 1.0, A],
      ['pesarattu', 'Pesarattu', 'moong dosa|green gram dosa', 'vegan', '1 dosa (100 g)', 100, 172, 8.0, 22.0, 5.0, 4.0, A],
      ['uttapam', 'Uttapam', 'uthappam|oothappam|उत्तपम', 'vegan', '1 uttapam (150 g)', 150, 232, 6.0, 36.0, 6.5, 3.0, A],
      ['medu-vada', 'Medu vada', 'vada|uddina vade|ulundu vadai|मेदु वड़ा', 'vegan', '1 vada (50 g)', 50, 148, 4.5, 13.0, 8.5, 2.0, A],
      ['appam', 'Appam', 'palappam|hoppers|अप्पम', 'vegan', '1 appam (60 g)', 60, 110, 2.0, 21.0, 1.8, 0.6, A],
      ['ven-pongal', 'Ven pongal', 'pongal|khara pongal|पोंगल', 'veg', '1 bowl (200 g)', 200, 290, 8.0, 40.0, 10.5, 2.5, A],
      ['kerala-parotta', 'Kerala parotta', 'malabar parotta|porotta|barotta', 'veg', '1 parotta (100 g)', 100, 322, 7.0, 44.0, 13.0, 2.0, A],
      ['coconut-chutney', 'Coconut chutney', 'nariyal chutney|thengai chutney|नारियल चटनी', 'vegan', '2 tbsp (30 g)', 30, 62, 0.8, 2.0, 5.5, 1.5, A],
      ['avial', 'Avial', 'aviyal|अवियल', 'veg', '1 katori (150 g)', 150, 165, 3.0, 10.0, 12.0, 4.0, A],
      ['veg-kurma', 'Veg kurma', 'vegetable korma|veg korma|saagu|कुरमा', 'vegan', '1 katori (150 g)', 150, 195, 4.0, 12.0, 14.0, 3.5, A],
    ],
  ],
  [
    'breakfast',
    [
      ['poha', 'Poha', 'pohe|aval|avalakki|chivda poha|kanda poha|पोहा', 'vegan', '1 plate (180 g)', 180, 272, 5.0, 42.0, 9.0, 2.5, A],
      ['upma', 'Upma', 'rava upma|sooji upma|uppittu|उपमा', 'vegan', '1 plate (200 g)', 200, 280, 6.0, 40.0, 10.0, 3.0, A],
      ['besan-chilla', 'Besan chilla', 'cheela|chila|besan cheela|gram flour pancake|बेसन चीला', 'vegan', '1 chilla (80 g)', 80, 182, 8.0, 16.0, 9.0, 3.0, A],
      ['moong-chilla', 'Moong dal chilla', 'moong cheela|moong dal cheela|मूंग दाल चीला', 'vegan', '1 chilla (90 g)', 90, 162, 9.0, 18.0, 5.5, 3.0, A],
      ['oats-milk', 'Oats porridge with milk', 'oatmeal|oats with milk|oats kheer|porridge|दूध ओट्स', 'veg', '1 bowl (250 g)', 250, 262, 11.0, 36.0, 7.5, 4.0, A],
      ['masala-oats', 'Masala oats', 'savoury oats|oats upma|मसाला ओट्स', 'vegan', '1 bowl (250 g)', 250, 202, 6.0, 29.0, 6.0, 4.5, A],
      ['cornflakes-milk', 'Cornflakes with milk', 'cereal with milk|corn flakes milk', 'veg', '30 g + 200 ml milk', 230, 236, 8.6, 35.0, 6.6, 0.9, A],
      ['veg-sandwich', 'Vegetable sandwich', 'veg sandwich|bombay sandwich|सैंडविच', 'veg', '1 sandwich (150 g)', 150, 242, 7.0, 34.0, 8.0, 4.0, A],
      ['bread-butter', 'Bread butter', 'butter toast|bread with butter|ब्रेड बटर', 'veg', '2 slices + 10 g butter', 60, 202, 4.5, 25.0, 9.0, 1.2],
      ['peanut-butter-toast', 'Peanut butter toast', 'pb toast', 'veg', '1 slice + 1 tbsp PB', 44, 168, 6.5, 15.0, 9.0, 2.5],
      ['sabudana-khichdi', 'Sabudana khichdi', 'sago khichdi|sabudana|साबूदाना खिचड़ी', 'veg', '1 plate (200 g)', 200, 400, 4.0, 62.0, 15.0, 1.5, A],
      ['sabudana-vada', 'Sabudana vada', 'sago vada|साबूदाना वड़ा', 'vegan', '1 vada (50 g)', 50, 160, 1.5, 18.0, 9.0, 1.0, A],
      ['aloo-puri', 'Aloo puri (plate)', 'puri sabzi|poori bhaji|puri aloo|आलू पूरी', 'vegan', '3 puri + 1 katori aloo (220 g)', 220, 530, 9.0, 58.0, 28.0, 6.0, A],
      ['misal-pav', 'Misal pav', 'misal|मिसळ पाव|मिसल पाव', 'vegan', '1 plate (300 g)', 300, 455, 15.0, 55.0, 18.0, 9.0, A],
      ['egg-sandwich', 'Egg sandwich', 'anda sandwich', 'egg', '1 sandwich (130 g)', 130, 292, 13.0, 30.0, 13.0, 2.0, A],
    ],
  ],
  [
    'eggs',
    [
      ['boiled-egg', 'Boiled egg', 'egg|anda|ubla anda|hard boiled egg|poached egg|अंडा|उबला अंडा', 'egg', '1 large egg (50 g)', 50, 72, 6.3, 0.4, 4.8, 0.0],
      ['egg-white', 'Egg white', 'anda safedi|egg whites', 'egg', '1 large white (33 g)', 33, 17, 3.6, 0.2, 0.1, 0.0],
      ['fried-egg', 'Fried egg / half fry', 'half fry|sunny side up|bullseye|फ्राइड अंडा', 'egg', '1 egg (46 g)', 46, 90, 6.3, 0.4, 7.0, 0.0],
      ['omelette', 'Masala omelette', 'omelet|omlette|amlet|anda omelette|ऑमलेट', 'egg', '2 eggs (130 g)', 130, 210, 13.0, 4.0, 15.5, 0.8, A],
      ['egg-bhurji', 'Egg bhurji', 'anda bhurji|scrambled egg indian|अंडा भुर्जी', 'egg', '2 eggs (120 g)', 120, 222, 13.0, 5.0, 16.5, 1.0, A],
      ['egg-curry', 'Egg curry', 'anda curry|egg masala|अंडा करी', 'egg', '2 eggs + gravy (200 g)', 200, 265, 14.0, 9.0, 19.0, 2.0, A],
      ['anda-paratha', 'Egg paratha', 'anda paratha|अंडा पराठा', 'egg', '1 paratha (130 g)', 130, 332, 11.0, 34.0, 16.5, 3.0, A],
      ['french-toast', 'French toast', 'bread omelette|eggy bread', 'egg', '1 slice (90 g)', 90, 192, 7.0, 18.0, 10.0, 1.0, A],
      ['egg-roll', 'Egg roll', 'anda roll|kolkata egg roll|एग रोल', 'egg', '1 roll (180 g)', 180, 432, 13.0, 45.0, 22.0, 2.5, A],
    ],
  ],
  [
    'meat_fish',
    [
      ['butter-chicken', 'Butter chicken', 'murgh makhani|chicken makhani|बटर चिकन', 'nonveg', '1 katori (150 g)', 150, 292, 20.0, 7.0, 20.5, 1.5, A],
      ['chicken-curry', 'Chicken curry (home style)', 'chicken|murgh curry|chicken masala|चिकन करी', 'nonveg', '1 katori (150 g)', 150, 222, 20.0, 5.0, 13.5, 1.5, A],
      ['kadai-chicken', 'Kadai chicken', 'karahi chicken|kadhai chicken|कढ़ाई चिकन', 'nonveg', '1 katori (150 g)', 150, 244, 21.0, 6.0, 15.0, 1.5, A],
      ['chicken-tikka', 'Chicken tikka', 'tikka|चिकन टिक्का', 'nonveg', '6 pieces (150 g)', 150, 232, 33.0, 4.0, 9.5, 0.5, A],
      ['tandoori-chicken', 'Tandoori chicken', 'tangri|chicken leg tandoori|तंदूरी चिकन', 'nonveg', '1 leg quarter (150 g edible)', 150, 240, 32.0, 3.0, 11.0, 0.5, A],
      ['grilled-chicken-breast', 'Grilled chicken breast', 'chicken breast|grilled chicken|चिकन ब्रेस्ट', 'nonveg', '100 g', 100, 160, 31.0, 0.0, 3.6, 0.0],
      ['boiled-chicken', 'Boiled chicken breast', 'boiled chicken|ubla chicken', 'nonveg', '100 g', 100, 150, 30.0, 0.0, 3.0, 0.0],
      ['chicken-65', 'Chicken 65', 'chicken sixty five|fried chicken bites', 'nonveg', '1 serving (100 g)', 100, 280, 20.0, 10.0, 18.0, 0.5, A],
      ['chilli-chicken', 'Chilli chicken', 'chili chicken|चिली चिकन', 'nonveg', '1 serving (150 g)', 150, 302, 21.0, 14.0, 18.0, 1.0, A],
      ['chicken-korma', 'Chicken korma', 'murgh korma|चिकन कोरमा', 'nonveg', '1 katori (150 g)', 150, 302, 19.0, 7.0, 22.0, 1.0, A],
      ['chicken-seekh-kebab', 'Chicken seekh kebab', 'seekh kabab|kebab|सीख कबाब', 'nonveg', '2 pieces (100 g)', 100, 222, 18.0, 4.0, 15.0, 0.5, A],
      ['chicken-salad', 'Grilled chicken salad', 'chicken salad', 'nonveg', '1 bowl (200 g)', 200, 232, 28.0, 8.0, 9.5, 2.5, A],
      ['mutton-curry', 'Mutton curry', 'gosht|mutton|lamb curry|goat curry|मटन करी', 'nonveg', '1 katori (150 g)', 150, 302, 22.0, 5.0, 21.5, 1.0, A],
      ['keema-matar', 'Keema matar', 'keema|kheema|minced meat|कीमा', 'nonveg', '1 katori (150 g)', 150, 295, 20.0, 8.0, 20.0, 2.5, A],
      ['haleem', 'Haleem', 'hareesa|हलीम', 'nonveg', '1 bowl (200 g)', 200, 342, 22.0, 22.0, 18.0, 4.0, A],
      ['fish-curry', 'Fish curry', 'machli curry|macher jhol|meen curry|मछली करी', 'nonveg', '1 katori (150 g)', 150, 202, 19.0, 5.0, 11.5, 1.0, A],
      ['fish-fry', 'Fish fry (rava/masala)', 'machli fry|rava fish fry|fried fish|मछली फ्राई', 'nonveg', '1 piece (100 g)', 100, 230, 20.0, 8.0, 13.0, 0.5, A],
      ['grilled-fish', 'Grilled / steamed fish', 'grilled fish|basa|rohu|fish', 'nonveg', '100 g', 100, 130, 21.0, 0.0, 5.0, 0.0],
      ['prawn-curry', 'Prawn curry', 'jhinga curry|shrimp curry|chingri|झींगा', 'nonveg', '1 katori (150 g)', 150, 212, 20.0, 6.0, 12.0, 1.0, A],
      ['prawns-cooked', 'Prawns (cooked, plain)', 'shrimp|prawns|jhinga', 'nonveg', '100 g', 100, 99, 24.0, 0.2, 0.3, 0.0],
      ['salmon', 'Salmon (cooked)', 'salmon fillet', 'nonveg', '100 g', 100, 206, 22.0, 0.0, 12.4, 0.0],
      ['tuna-canned', 'Tuna (canned in water)', 'tuna|canned tuna', 'nonveg', '100 g', 100, 116, 25.5, 0.0, 0.8, 0.0],
    ],
  ],
  [
    'snacks',
    [
      ['samosa', 'Samosa', 'samose|singara|samsa|समोसा', 'vegan', '1 samosa (100 g)', 100, 262, 4.5, 28.0, 14.5, 2.5, A],
      ['onion-pakora', 'Onion pakora / bhajiya', 'pakoda|pakode|bhajiya|bhaji|kanda bhaji|pyaz pakora|पकोड़ा|पकौड़ा', 'vegan', '5 pieces (100 g)', 100, 305, 6.5, 26.0, 19.0, 3.5, A],
      ['bread-pakora', 'Bread pakora', 'bread pakoda|ब्रेड पकोड़ा', 'veg', '1 piece (100 g)', 100, 282, 6.5, 28.0, 15.5, 2.0, A],
      ['aloo-tikki', 'Aloo tikki', 'alu tikki|potato patty|आलू टिक्की', 'vegan', '1 tikki (70 g)', 70, 152, 2.5, 18.0, 7.5, 2.0, A],
      ['kachori', 'Kachori', 'khasta kachori|dal kachori|कचौरी', 'vegan', '1 kachori (60 g)', 60, 252, 5.0, 25.0, 14.5, 2.5, A],
      ['dhokla', 'Dhokla', 'khaman|khaman dhokla|ढोकला', 'veg', '3 pieces (100 g)', 100, 162, 6.5, 22.0, 5.0, 2.0, A],
      ['veg-puff', 'Veg puff', 'puff|patties|vegetable puff', 'veg', '1 puff (80 g)', 80, 282, 5.0, 27.0, 17.0, 1.5],
      ['namkeen-bhujia', 'Namkeen / bhujia', 'bhujia|aloo bhujia|sev|mixture|namkeen|नमकीन|भुजिया', 'vegan', '1 small bowl (30 g)', 30, 168, 4.5, 13.0, 11.0, 2.0],
      ['banana-chips', 'Banana chips', 'kela chips|nendran chips', 'vegan', '1 small bowl (30 g)', 30, 162, 0.7, 17.0, 10.0, 2.0],
      ['roasted-chana', 'Roasted chana', 'bhuna chana|bhune chane|chana|भुने चने', 'vegan', '1 handful (30 g)', 30, 110, 6.5, 15.0, 1.6, 5.0],
      ['makhana', 'Roasted makhana', 'fox nuts|lotus seeds|phool makhana|मखाना', 'vegan', '1 bowl (25 g)', 25, 92, 2.4, 19.0, 0.5, 1.8],
      ['murmura', 'Murmura (puffed rice)', 'puffed rice|kurmura|mamra|muri|मुरमुरा', 'vegan', '1 cup (25 g)', 25, 98, 1.8, 22.0, 0.2, 0.5],
      ['sprouts-chaat', 'Sprouts chaat', 'moong sprouts salad|sprout salad|अंकुरित', 'vegan', '1 bowl (150 g)', 150, 152, 9.0, 22.0, 2.5, 5.0, A],
      ['fruit-chaat', 'Fruit chaat', 'fruit salad|फ्रूट चाट', 'vegan', '1 bowl (150 g)', 150, 96, 1.2, 21.0, 0.4, 3.0, A],
      ['popcorn', 'Popcorn (plain, air-popped)', 'popcorn|makai ke phool|पॉपकॉर्न', 'vegan', '1 bowl (25 g)', 25, 100, 3.0, 17.0, 2.5, 3.5],
      ['potato-chips', 'Potato chips', 'chips|wafers|crisps|lays|चिप्स', 'vegan', '1 small pack (30 g)', 30, 160, 2.0, 15.0, 10.0, 1.3],
      ['glucose-biscuits', 'Glucose biscuits', 'parle g|biscuit|glucose biscuit|बिस्कुट', 'veg', '4 biscuits (25 g)', 25, 113, 1.7, 19.5, 3.2, 0.3],
      ['digestive-biscuits', 'Digestive biscuits', 'digestive|wheat biscuits', 'veg', '2 biscuits (30 g)', 30, 145, 2.0, 19.0, 6.5, 1.2],
      ['rusk', 'Rusk / toast', 'rusk|toast biscuit|रस्क', 'veg', '2 rusks (30 g)', 30, 126, 3.0, 22.0, 2.8, 0.8],
      ['cookies', 'Chocolate chip cookies', 'cookie|cookies', 'egg', '2 cookies (30 g)', 30, 146, 1.7, 19.0, 7.0, 0.7],
      ['papad-roasted', 'Papad (roasted)', 'papadum|papadam|appalam|पापड़', 'vegan', '1 papad (12 g)', 12, 38, 2.6, 6.0, 0.3, 1.2],
      ['papad-fried', 'Papad (fried)', 'fried papad|fried papadum', 'vegan', '1 papad (15 g)', 15, 70, 2.7, 6.5, 3.6, 1.2],
    ],
  ],
  [
    'street',
    [
      ['pani-puri', 'Pani puri / golgappa', 'golgappa|gol gappa|puchka|phuchka|panipuri|gupchup|पानी पूरी|गोलगप्पे', 'vegan', '6 pieces (120 g)', 120, 202, 4.0, 30.0, 7.0, 3.0, A],
      ['bhel-puri', 'Bhel puri', 'bhel|bhelpuri|भेल पूरी', 'vegan', '1 plate (150 g)', 150, 265, 6.0, 40.0, 8.5, 3.5, A],
      ['papdi-chaat', 'Papdi chaat', 'papri chaat|chaat|पापड़ी चाट', 'veg', '1 plate (150 g)', 150, 332, 8.0, 38.0, 16.0, 3.5, A],
      ['aloo-tikki-chaat', 'Aloo tikki chaat', 'tikki chaat|टिक्की चाट', 'veg', '1 plate (200 g)', 200, 345, 7.0, 45.0, 14.5, 5.0, A],
      ['dahi-bhalla', 'Dahi bhalla / dahi vada', 'dahi vada|dahi bada|दही भल्ला|दही वड़ा', 'veg', '2 pieces + curd (200 g)', 200, 302, 11.0, 33.0, 13.5, 3.0, A],
      ['vada-pav', 'Vada pav', 'wada pav|vadapav|bombay burger|वड़ा पाव', 'vegan', '1 vada pav (150 g)', 150, 302, 7.0, 42.0, 11.5, 3.0, A],
      ['pav-bhaji', 'Pav bhaji', 'pao bhaji|bhaji pav|पाव भाजी', 'veg', '2 pav + 1 bowl bhaji (300 g)', 300, 525, 12.0, 66.0, 22.5, 8.0, A],
      ['dabeli', 'Dabeli', 'kutchi dabeli|दाबेली', 'veg', '1 dabeli (120 g)', 120, 290, 6.0, 42.0, 10.5, 3.0, A],
      ['veg-momos', 'Veg momos (steamed)', 'momos|momo|dumplings|veg dumplings|मोमोज़|मोमो', 'vegan', '6 pieces (150 g)', 150, 240, 7.0, 38.0, 6.0, 2.5, A],
      ['chicken-momos', 'Chicken momos (steamed)', 'chicken momo|chicken dumplings|चिकन मोमो', 'nonveg', '6 pieces (150 g)', 150, 280, 15.0, 34.0, 9.0, 1.5, A],
      ['paneer-roll', 'Paneer kathi roll', 'paneer roll|paneer frankie|kathi roll|frankie|पनीर रोल', 'veg', '1 roll (200 g)', 200, 478, 17.0, 45.0, 25.0, 3.0, A],
      ['chicken-roll', 'Chicken kathi roll', 'chicken roll|chicken frankie|चिकन रोल', 'nonveg', '1 roll (200 g)', 200, 450, 22.0, 44.0, 20.0, 2.5, A],
      ['hakka-noodles', 'Veg hakka noodles', 'chowmein|chow mein|noodles|hakka noodle|चाउमीन', 'vegan', '1 plate (200 g)', 200, 340, 7.0, 50.0, 12.0, 3.0, A],
      ['veg-manchurian', 'Veg manchurian (gravy)', 'manchurian|मंचूरियन', 'vegan', '1 bowl (150 g)', 150, 252, 5.0, 22.0, 15.5, 3.0, A],
      ['gobi-manchurian', 'Gobi manchurian (dry)', 'gobi manchurian|cauliflower manchurian', 'vegan', '1 plate (150 g)', 150, 305, 5.5, 28.0, 18.5, 3.5, A],
      ['chilli-paneer', 'Chilli paneer', 'chili paneer|चिली पनीर', 'veg', '1 plate (150 g)', 150, 342, 14.0, 15.0, 25.0, 2.0, A],
      ['chole-bhature', 'Chole bhature', 'chhole bhature|chole bhatura|छोले भटूरे', 'veg', '2 bhature + chole (310 g)', 310, 825, 22.0, 102.0, 35.0, 11.0, A],
      ['litti-chokha', 'Litti chokha', 'litti|लिट्टी चोखा', 'veg', '2 litti + chokha (250 g)', 250, 525, 15.0, 66.0, 20.5, 10.0, A],
      ['bhutta', 'Bhutta (roasted corn)', 'roasted corn|corn on the cob|makai|भुट्टा', 'veg', '1 cob (100 g kernels)', 100, 112, 3.4, 19.0, 2.5, 2.7, A],
    ],
  ],
  [
    'dairy',
    [
      ['milk-toned', 'Milk (toned)', 'milk|doodh|dudh|toned milk|दूध', 'veg', '1 glass (200 ml)', 206, 118, 6.4, 9.4, 6.0, 0.0],
      ['milk-full-cream', 'Milk (full cream)', 'full cream milk|whole milk|buffalo milk|bhains ka doodh', 'veg', '1 glass (200 ml)', 206, 182, 7.0, 10.0, 13.0, 0.0],
      ['milk-double-toned', 'Milk (double toned)', 'double toned milk|low fat milk', 'veg', '1 glass (200 ml)', 206, 92, 6.2, 9.6, 3.0, 0.0],
      ['haldi-doodh', 'Haldi doodh (turmeric milk)', 'turmeric milk|golden milk|हल्दी दूध', 'veg', '1 glass (200 ml)', 210, 146, 6.4, 15.0, 6.5, 0.3, A],
      ['curd', 'Curd / dahi', 'dahi|yogurt|yoghurt|thayir|mosaru|दही', 'veg', '1 katori (150 g)', 150, 90, 4.7, 6.5, 4.5, 0.0],
      ['greek-yogurt', 'Greek yogurt (plain)', 'hung curd|greek yoghurt|chakka', 'veg', '1 cup (150 g)', 150, 146, 13.5, 5.9, 7.5, 0.0],
      ['paneer', 'Paneer', 'cottage cheese|panir|पनीर', 'veg', '100 g', 100, 265, 18.3, 1.2, 20.8, 0.0],
      ['cheese-slice', 'Cheese slice', 'cheese|processed cheese|चीज़', 'veg', '1 slice (20 g)', 20, 62, 4.0, 1.0, 4.6, 0.0],
      ['butter', 'Butter', 'makhan|amul butter|मक्खन', 'veg', '1 tsp (5 g)', 5, 36, 0.0, 0.0, 4.1, 0.0],
      ['ghee', 'Ghee', 'desi ghee|clarified butter|घी', 'veg', '1 tsp (5 g)', 5, 45, 0.0, 0.0, 5.0, 0.0],
      ['fresh-cream', 'Fresh cream', 'malai|cream|मलाई', 'veg', '1 tbsp (15 g)', 15, 50, 0.3, 0.5, 5.3, 0.0],
      ['buttermilk', 'Buttermilk / chaas', 'chaas|chhachh|mattha|majjige|moru|छाछ', 'veg', '1 glass (250 ml)', 250, 40, 2.2, 3.5, 1.8, 0.0],
      ['sweet-lassi', 'Sweet lassi', 'lassi|meethi lassi|लस्सी', 'veg', '1 glass (250 ml)', 250, 222, 7.0, 34.0, 6.5, 0.0],
      ['mango-lassi', 'Mango lassi', 'aam lassi|मैंगो लस्सी', 'veg', '1 glass (250 ml)', 250, 262, 6.5, 44.0, 6.5, 1.0, A],
      ['boondi-raita', 'Boondi raita', 'raita|रायता', 'veg', '1 katori (150 g)', 150, 150, 5.0, 12.0, 9.0, 0.5, A],
      ['cucumber-raita', 'Cucumber raita', 'kheera raita|vegetable raita', 'veg', '1 katori (150 g)', 150, 90, 4.5, 7.0, 4.8, 0.6, A],
    ],
  ],
  [
    'drinks',
    [
      ['chai', 'Chai (milk + sugar)', 'chai|tea|masala chai|cutting chai|adrak chai|चाय', 'veg', '1 cup (150 ml)', 150, 78, 2.4, 11.5, 2.3, 0.0, A],
      ['chai-no-sugar', 'Chai (no sugar)', 'tea without sugar|sugar free chai|फीकी चाय', 'veg', '1 cup (150 ml)', 150, 45, 2.4, 3.6, 2.3, 0.0, A],
      ['black-coffee', 'Black coffee', 'americano|espresso|black coffee', 'vegan', '1 cup (240 ml)', 240, 2, 0.3, 0.0, 0.0, 0.0],
      ['milk-coffee', 'Coffee (milk + sugar)', 'coffee|filter coffee|kaapi|nescafe|कॉफी', 'veg', '1 cup (150 ml)', 150, 92, 3.2, 13.5, 3.0, 0.0, A],
      ['cold-coffee', 'Cold coffee', 'iced coffee|cold coffee shake', 'veg', '1 glass (300 ml)', 300, 230, 7.5, 32.0, 8.0, 0.0, A],
      ['cappuccino', 'Cappuccino / latte', 'latte|cappuccino|cafe latte', 'veg', '1 regular (240 ml)', 240, 130, 7.0, 10.0, 7.0, 0.0],
      ['green-tea', 'Green tea', 'green tea|herbal tea', 'vegan', '1 cup (240 ml)', 240, 2, 0.0, 0.5, 0.0, 0.0],
      ['nimbu-pani', 'Nimbu pani (with sugar)', 'lemonade|shikanji|lemon water|नींबू पानी', 'vegan', '1 glass (250 ml)', 250, 72, 0.1, 18.0, 0.0, 0.0, A],
      ['coconut-water', 'Coconut water', 'nariyal pani|tender coconut|elaneer|नारियल पानी', 'vegan', '1 glass (250 ml)', 250, 48, 1.8, 6.5, 0.5, 2.8],
      ['sugarcane-juice', 'Sugarcane juice', 'ganne ka ras|ganna juice|गन्ने का रस', 'vegan', '1 glass (250 ml)', 250, 180, 0.4, 45.0, 0.1, 0.0],
      ['orange-juice', 'Orange juice (fresh)', 'mosambi juice|santra juice|sweet lime juice|fresh juice', 'vegan', '1 glass (250 ml)', 250, 112, 1.7, 25.8, 0.5, 0.5],
      ['packaged-juice', 'Packaged fruit juice', 'real juice|tropicana|frooti|maaza|mango drink', 'vegan', '1 glass (200 ml)', 200, 110, 0.3, 27.0, 0.1, 0.2],
      ['cola', 'Cold drink (cola)', 'cold drink|coke|pepsi|thums up|soft drink|soda|कोल्ड ड्रिंक', 'vegan', '1 can (330 ml)', 330, 139, 0.0, 35.0, 0.0, 0.0],
      ['diet-cola', 'Diet cola / zero sugar', 'diet coke|coke zero|pepsi black', 'vegan', '1 can (330 ml)', 330, 1, 0.0, 0.0, 0.0, 0.0],
      ['energy-drink', 'Energy drink', 'red bull|monster|sting', 'vegan', '1 can (250 ml)', 250, 112, 0.0, 28.0, 0.0, 0.0],
      ['protein-shake', 'Protein shake (whey + milk)', 'whey shake|protein milkshake|प्रोटीन शेक', 'veg', '1 scoop + 250 ml toned milk', 290, 270, 32.0, 16.0, 8.5, 0.5],
      ['whey-scoop', 'Whey protein (1 scoop, in water)', 'whey|whey protein|protein powder|scoop', 'veg', '1 scoop (30 g)', 30, 120, 24.0, 3.0, 1.5, 0.0],
      ['jaljeera', 'Jaljeera', 'jal jeera|जलजीरा', 'vegan', '1 glass (250 ml)', 250, 30, 0.3, 7.0, 0.1, 0.3, A],
      ['banana-smoothie', 'Banana smoothie / shake', 'banana shake|smoothie|kela shake', 'veg', '1 glass (300 ml)', 300, 250, 8.0, 42.0, 5.0, 3.0, A],
      ['sattu-drink', 'Sattu drink (salted)', 'sattu sharbat|sattu|सत्तू', 'vegan', '1 glass (30 g sattu)', 280, 115, 6.6, 17.4, 1.5, 3.0, A],
      ['soy-milk', 'Soy milk (unsweetened)', 'soya milk|soymilk', 'vegan', '1 glass (200 ml)', 200, 67, 5.8, 3.3, 3.3, 0.8],
      ['almond-milk', 'Almond milk (unsweetened)', 'almond drink|badam drink', 'vegan', '1 glass (200 ml)', 200, 30, 1.0, 1.0, 2.5, 0.5],
    ],
  ],
  [
    'sweets',
    [
      ['gulab-jamun', 'Gulab jamun', 'gulabjamun|kala jamun|गुलाब जामुन', 'veg', '1 piece (50 g)', 50, 150, 2.0, 22.0, 6.0, 0.3],
      ['rasgulla', 'Rasgulla', 'rasagola|roshogolla|rossogolla|रसगुल्ला', 'veg', '1 piece (50 g)', 50, 105, 2.0, 21.0, 1.5, 0.0],
      ['jalebi', 'Jalebi', 'jilebi|imarti|जलेबी', 'veg', '2 pieces (50 g)', 50, 192, 1.2, 28.0, 8.5, 0.3],
      ['besan-ladoo', 'Besan ladoo', 'besan laddu|laddoo|ladoo|laddu|बेसन लड्डू|लड्डू', 'veg', '1 ladoo (40 g)', 40, 192, 4.0, 20.0, 10.5, 1.5],
      ['motichoor-ladoo', 'Motichoor ladoo', 'boondi ladoo|motichur laddu|मोतीचूर लड्डू', 'veg', '1 ladoo (40 g)', 40, 176, 2.2, 23.0, 8.5, 0.5],
      ['kheer', 'Rice kheer', 'kheer|payasam|chawal ki kheer|kiri|खीर', 'veg', '1 katori (150 g)', 150, 220, 6.0, 30.0, 8.5, 0.3, A],
      ['semiya-payasam', 'Seviyan / semiya payasam', 'seviyan|sevaiyan|vermicelli kheer|सेवइयां', 'veg', '1 katori (150 g)', 150, 230, 5.5, 33.0, 8.5, 0.5, A],
      ['gajar-halwa', 'Gajar ka halwa', 'gajar halwa|carrot halwa|गाजर का हलवा', 'veg', '1 katori (150 g)', 150, 322, 6.0, 38.0, 16.0, 3.0, A],
      ['sooji-halwa', 'Sooji halwa / sheera', 'suji halwa|sheera|kesari|rava kesari|halwa|हलवा', 'veg', '1 katori (120 g)', 120, 360, 4.5, 45.0, 18.0, 1.0, A],
      ['moong-dal-halwa', 'Moong dal halwa', 'मूंग दाल हलवा', 'veg', '1 serving (100 g)', 100, 405, 7.0, 40.0, 24.0, 2.0, A],
      ['kaju-katli', 'Kaju katli / barfi', 'kaju barfi|kaju katri|barfi|burfi|काजू कतली|बर्फी', 'veg', '2 pieces (30 g)', 30, 150, 3.0, 17.0, 7.5, 0.5],
      ['milk-barfi', 'Milk barfi', 'khoya barfi|mawa barfi|doodh barfi', 'veg', '1 piece (30 g)', 30, 120, 3.0, 15.0, 5.5, 0.0],
      ['rasmalai', 'Rasmalai', 'ras malai|रसमलाई', 'veg', '1 piece (80 g)', 80, 180, 6.0, 21.0, 8.0, 0.0],
      ['sandesh', 'Sandesh', 'sondesh|संदेश', 'veg', '1 piece (30 g)', 30, 95, 3.5, 13.0, 3.3, 0.0],
      ['mysore-pak', 'Mysore pak', 'mysorepak|मैसूर पाक', 'veg', '1 piece (30 g)', 30, 170, 1.8, 13.0, 12.5, 0.5],
      ['shrikhand', 'Shrikhand', 'amrakhand|श्रीखंड', 'veg', '1 bowl (100 g)', 100, 258, 6.0, 38.0, 9.0, 0.0],
      ['gujiya', 'Gujiya', 'karanji|ghughra|गुजिया', 'veg', '1 piece (40 g)', 40, 192, 2.5, 21.0, 11.0, 1.0],
      ['chikki', 'Peanut chikki', 'chikki|gajak|groundnut chikki|चिक्की', 'vegan', '1 piece (25 g)', 25, 128, 3.5, 14.0, 6.5, 1.2],
      ['kulfi', 'Kulfi', 'malai kulfi|matka kulfi|कुल्फी', 'veg', '1 stick (60 g)', 60, 150, 3.5, 15.0, 8.5, 0.0],
      ['ice-cream', 'Ice cream (vanilla)', 'icecream|vanilla ice cream|आइसक्रीम', 'veg', '1 scoop (65 g)', 65, 136, 2.3, 15.5, 7.2, 0.5],
      ['dark-chocolate', 'Dark chocolate (70%)', 'dark choco|bitter chocolate', 'veg', '2 squares (20 g)', 20, 118, 1.6, 6.5, 8.5, 2.2],
      ['milk-chocolate', 'Milk chocolate', 'chocolate|dairy milk|chocolate bar|चॉकलेट', 'veg', '1 bar (40 g)', 40, 214, 3.0, 23.5, 12.0, 1.4],
      ['cake', 'Cake (sponge / pastry)', 'pastry|cake slice|birthday cake|केक', 'egg', '1 slice (60 g)', 60, 230, 3.0, 30.0, 11.0, 0.5],
      ['brownie', 'Chocolate brownie', 'brownie', 'egg', '1 piece (60 g)', 60, 262, 3.0, 33.0, 13.5, 1.2],
      ['sugar', 'Sugar', 'cheeni|shakkar|chini|चीनी', 'vegan', '1 tsp (4 g)', 4, 16, 0.0, 4.0, 0.0, 0.0],
      ['jaggery', 'Jaggery (gur)', 'gur|gud|vellam|bella|गुड़', 'vegan', '1 piece (10 g)', 10, 38, 0.0, 9.5, 0.0, 0.0],
      ['honey', 'Honey', 'shahad|madhu|शहद', 'veg', '1 tbsp (21 g)', 21, 64, 0.1, 17.3, 0.0, 0.0],
    ],
  ],
  [
    'fruits',
    [
      ['banana', 'Banana', 'kela|kele|vazhaipazham|केला', 'vegan', '1 medium (118 g)', 118, 105, 1.3, 24.0, 0.4, 3.1],
      ['apple', 'Apple', 'seb|saib|सेब', 'vegan', '1 medium (180 g)', 180, 94, 0.5, 20.7, 0.3, 4.3],
      ['orange', 'Orange', 'santra|narangi|santara|संतरा', 'vegan', '1 medium (130 g)', 130, 62, 1.2, 12.3, 0.2, 3.1],
      ['mosambi', 'Sweet lime (mosambi)', 'mosambi|musambi|sweet lime|मौसमी', 'vegan', '1 medium (150 g)', 150, 64, 1.1, 13.5, 0.4, 1.8],
      ['mango', 'Mango', 'aam|mangoes|alphonso|आम', 'vegan', '1 cup sliced (165 g)', 165, 99, 1.4, 22.0, 0.6, 2.6],
      ['papaya', 'Papaya', 'papita|पपीता', 'vegan', '1 cup (145 g)', 145, 62, 0.7, 13.5, 0.4, 2.5],
      ['guava', 'Guava', 'amrood|amrud|peru|अमरूद', 'vegan', '1 medium (100 g)', 100, 68, 2.6, 9.0, 1.0, 5.4],
      ['watermelon', 'Watermelon', 'tarbooz|tarbuj|kalingad|तरबूज', 'vegan', '1 cup (150 g)', 150, 46, 0.9, 10.7, 0.2, 0.6],
      ['muskmelon', 'Muskmelon', 'kharbooja|kharbuja|cantaloupe|खरबूजा', 'vegan', '1 cup (160 g)', 160, 54, 1.3, 11.6, 0.3, 1.4],
      ['grapes', 'Grapes', 'angoor|angur|अंगूर', 'vegan', '1 cup (150 g)', 150, 104, 1.1, 25.8, 0.2, 1.4],
      ['pomegranate', 'Pomegranate', 'anar|anaar|अनार', 'vegan', '1 cup arils (175 g)', 175, 144, 2.9, 26.0, 2.0, 7.0],
      ['pineapple', 'Pineapple', 'ananas|अनानास', 'vegan', '1 cup (165 g)', 165, 82, 0.9, 19.3, 0.2, 2.3],
      ['chikoo', 'Chikoo (sapota)', 'chiku|sapota|sapodilla|चीकू', 'vegan', '1 medium (100 g)', 100, 83, 0.4, 14.7, 1.1, 5.3],
      ['pear', 'Pear', 'nashpati|नाशपाती', 'vegan', '1 medium (178 g)', 178, 101, 0.6, 21.6, 0.2, 5.5],
      ['kiwi', 'Kiwi', 'kiwifruit|कीवी', 'vegan', '1 kiwi (70 g)', 70, 43, 0.8, 8.2, 0.4, 2.1],
      ['strawberries', 'Strawberries', 'strawberry|स्ट्रॉबेरी', 'vegan', '1 cup (150 g)', 150, 48, 1.0, 8.5, 0.5, 3.0],
      ['jamun', 'Jamun', 'black plum|java plum|जामुन', 'vegan', '1 cup (100 g)', 100, 62, 0.7, 14.0, 0.2, 0.6],
      ['litchi', 'Litchi', 'lychee|lichi|लीची', 'vegan', '10 pieces (100 g)', 100, 66, 0.8, 15.2, 0.4, 1.3],
      ['custard-apple', 'Custard apple (sitaphal)', 'sitaphal|sharifa|शरीफा|सीताफल', 'vegan', '1 medium (100 g pulp)', 100, 94, 2.1, 20.0, 0.3, 4.4],
      ['amla', 'Amla (Indian gooseberry)', 'amla|gooseberry|nellikai|आंवला', 'vegan', '1 amla (30 g)', 30, 14, 0.3, 2.5, 0.2, 1.3],
      ['avocado', 'Avocado', 'butter fruit|एवोकाडो', 'vegan', '1/2 fruit (100 g)', 100, 160, 2.0, 1.8, 14.7, 6.7],
      ['fresh-coconut', 'Coconut (fresh)', 'nariyal|coconut|narial|नारियल', 'vegan', '1 piece (30 g)', 30, 106, 1.0, 1.9, 10.0, 2.7],
      ['dates', 'Dates', 'khajoor|khajur|खजूर', 'vegan', '2 dates (14 g)', 14, 40, 0.3, 9.4, 0.0, 1.1],
      ['raisins', 'Raisins', 'kishmish|munakka|किशमिश', 'vegan', '2 tbsp (20 g)', 20, 60, 0.6, 15.0, 0.1, 0.8],
    ],
  ],
  [
    'vegetables',
    [
      ['cucumber', 'Cucumber', 'kheera|khira|kakdi|खीरा', 'vegan', '1 medium (200 g)', 200, 30, 1.3, 5.6, 0.2, 1.0],
      ['tomato', 'Tomato', 'tamatar|टमाटर', 'vegan', '1 medium (120 g)', 120, 22, 1.1, 3.4, 0.2, 1.4],
      ['onion', 'Onion', 'pyaz|pyaaz|kanda|प्याज', 'vegan', '1 medium (110 g)', 110, 44, 1.2, 8.4, 0.1, 1.9],
      ['carrot', 'Carrot', 'gajar|गाजर', 'vegan', '1 medium (60 g)', 60, 25, 0.6, 4.1, 0.1, 1.7],
      ['green-salad', 'Green salad', 'salad|सलाद', 'vegan', '1 bowl (150 g)', 150, 30, 1.5, 4.5, 0.3, 2.2],
      ['kachumber', 'Kachumber salad', 'kachumbar|onion tomato cucumber salad|कचुंबर', 'vegan', '1 bowl (150 g)', 150, 35, 1.4, 5.5, 0.3, 1.8],
      ['boiled-potato', 'Potato (boiled)', 'aloo|alu|ubla aloo|potato|आलू', 'vegan', '1 medium (150 g)', 150, 130, 2.9, 28.0, 0.2, 2.7],
      ['sweet-potato', 'Sweet potato (boiled)', 'shakarkandi|shakarkand|शकरकंद', 'vegan', '1 medium (130 g)', 130, 112, 2.0, 23.3, 0.2, 3.9],
      ['broccoli', 'Broccoli (steamed)', 'brocoli|ब्रोकली', 'vegan', '1 cup (156 g)', 156, 58, 3.7, 7.7, 0.6, 5.1],
      ['spinach', 'Spinach (boiled)', 'palak|पालक', 'vegan', '1 cup (180 g)', 180, 41, 5.3, 2.6, 0.5, 4.3],
      ['sweet-corn', 'Sweet corn (boiled)', 'corn|american corn|makka|मक्का', 'vegan', '1 cup (150 g)', 150, 145, 5.0, 28.0, 2.0, 3.6],
      ['green-peas', 'Green peas (boiled)', 'matar|mutter|peas|मटर', 'vegan', '1 cup (160 g)', 160, 130, 8.6, 17.5, 0.4, 8.8],
      ['mushrooms', 'Mushrooms (raw)', 'button mushroom|khumbi', 'vegan', '1 cup (100 g)', 100, 22, 3.1, 2.3, 0.3, 1.0],
      ['beetroot', 'Beetroot', 'chukandar|beet|चुकंदर', 'vegan', '1 medium (80 g)', 80, 35, 1.3, 5.4, 0.1, 2.3],
      ['capsicum', 'Capsicum / bell pepper', 'shimla mirch|bell pepper|शिमला मिर्च', 'vegan', '1 medium (120 g)', 120, 25, 1.2, 3.5, 0.4, 2.0],
      ['moong-sprouts', 'Moong sprouts (raw)', 'sprouts|ankurit moong|bean sprouts|अंकुरित मूंग', 'vegan', '1 cup (100 g)', 100, 30, 3.0, 2.8, 0.2, 1.8],
      ['soya-chunks', 'Soya chunks (dry)', 'nutrela|soya badi|soy chunks|meal maker|सोया चंक्स', 'vegan', '1/3 cup dry (30 g)', 30, 104, 15.6, 6.0, 0.2, 3.9],
      ['tofu', 'Tofu (firm)', 'soya paneer|bean curd|टोफू', 'vegan', '100 g', 100, 144, 15.8, 2.0, 8.7, 2.3],
      ['veg-soup', 'Vegetable soup', 'veg soup|clear soup|सूप', 'vegan', '1 bowl (250 ml)', 250, 82, 2.5, 11.0, 3.0, 2.5, A],
      ['tomato-soup', 'Tomato soup', 'tamatar soup|टमाटर सूप', 'veg', '1 bowl (250 ml)', 250, 102, 2.5, 14.0, 4.0, 2.0, A],
      ['sweet-corn-soup', 'Sweet corn soup', 'corn soup', 'vegan', '1 bowl (250 ml)', 250, 122, 3.5, 20.0, 3.0, 1.5, A],
      ['chicken-soup', 'Chicken soup', 'chicken clear soup|chicken shorba', 'nonveg', '1 bowl (250 ml)', 250, 90, 9.0, 6.0, 3.5, 0.5, A],
    ],
  ],
  [
    'nuts_seeds',
    [
      ['almonds', 'Almonds', 'badam|बादाम', 'vegan', '10 almonds (12 g)', 12, 70, 2.5, 1.2, 6.0, 1.5],
      ['cashews', 'Cashews', 'kaju|काजू', 'vegan', '10 cashews (15 g)', 15, 85, 2.7, 4.5, 6.6, 0.5],
      ['walnuts', 'Walnuts', 'akhrot|अखरोट', 'vegan', '4 halves (15 g)', 15, 98, 2.3, 1.0, 9.8, 1.0],
      ['peanuts', 'Peanuts (roasted)', 'moongfali|mungfali|groundnut|shengdana|मूंगफली', 'vegan', '1 handful (30 g)', 30, 175, 7.4, 4.8, 14.6, 2.6],
      ['peanut-butter', 'Peanut butter', 'pb|peanut spread|पीनट बटर', 'vegan', '1 tbsp (16 g)', 16, 96, 3.6, 2.6, 8.1, 1.0],
      ['pistachios', 'Pistachios', 'pista|पिस्ता', 'vegan', '1 handful (30 g)', 30, 160, 5.7, 5.0, 12.8, 3.0],
      ['flaxseeds', 'Flaxseeds', 'alsi|flax seeds|linseed|अलसी', 'vegan', '1 tbsp (10 g)', 10, 53, 1.8, 0.2, 4.2, 2.7],
      ['chia-seeds', 'Chia seeds', 'chia|sabja|चिया', 'vegan', '1 tbsp (12 g)', 12, 58, 2.0, 0.9, 3.7, 4.1],
      ['pumpkin-seeds', 'Pumpkin seeds', 'kaddu ke beej|pepitas', 'vegan', '1 tbsp (10 g)', 10, 57, 3.0, 0.5, 4.9, 0.6],
      ['sunflower-seeds', 'Sunflower seeds', 'surajmukhi beej', 'vegan', '1 tbsp (10 g)', 10, 58, 2.1, 1.1, 5.1, 0.9],
      ['sesame-seeds', 'Sesame seeds (til)', 'til|gingelly|तिल', 'vegan', '1 tbsp (9 g)', 9, 52, 1.6, 1.0, 4.5, 1.1],
      ['mixed-dry-fruits', 'Mixed dry fruits', 'dry fruits|mewa|trail mix|सूखे मेवे', 'vegan', '1 handful (30 g)', 30, 160, 4.5, 8.0, 12.0, 2.0],
    ],
  ],
  [
    'fast_food',
    [
      ['maggi', 'Instant noodles (Maggi)', 'maggi|instant noodles|2 minute noodles|मैगी', 'veg', '1 pack (70 g dry)', 70, 312, 7.0, 42.0, 12.5, 2.0],
      ['veg-pizza-slice', 'Veg pizza (1 slice)', 'pizza|veggie pizza|पिज़्ज़ा', 'veg', '1 slice (100 g)', 100, 252, 10.0, 30.0, 10.0, 2.0],
      ['chicken-pizza-slice', 'Chicken pizza (1 slice)', 'chicken pizza|pepperoni pizza', 'nonveg', '1 slice (100 g)', 100, 268, 13.0, 29.0, 11.0, 1.8],
      ['veg-burger', 'Veg burger', 'aloo tikki burger|burger|बर्गर', 'veg', '1 burger (150 g)', 150, 385, 9.0, 50.0, 16.0, 3.5],
      ['chicken-burger', 'Chicken burger', 'chicken zinger|chicken burger', 'nonveg', '1 burger (180 g)', 180, 450, 20.0, 42.0, 22.0, 2.5],
      ['french-fries', 'French fries', 'fries|finger chips|chips fries', 'vegan', '1 medium (115 g)', 115, 360, 4.0, 44.0, 17.0, 4.0],
      ['chicken-nuggets', 'Chicken nuggets', 'nuggets', 'nonveg', '6 pieces (100 g)', 100, 300, 15.0, 16.0, 19.5, 1.0],
      ['fried-chicken', 'Fried chicken (1 piece)', 'kfc|fried chicken leg|crispy chicken', 'nonveg', '1 piece (100 g edible)', 100, 272, 21.0, 9.0, 17.0, 0.5],
      ['chicken-shawarma', 'Chicken shawarma roll', 'shawarma|shawarma roll|chicken wrap|शवर्मा', 'nonveg', '1 roll (250 g)', 250, 522, 28.0, 50.0, 23.0, 3.0, A],
      ['chicken-sandwich', 'Chicken sandwich', 'chicken sub', 'nonveg', '1 sandwich (160 g)', 160, 328, 22.0, 32.0, 12.0, 2.0],
      ['garlic-bread', 'Garlic bread', 'cheesy garlic bread', 'veg', '2 pieces (60 g)', 60, 212, 5.0, 24.0, 10.5, 1.2],
    ],
  ],
  [
    'other',
    [
      ['mint-chutney', 'Green / mint chutney', 'hari chutney|pudina chutney|dhaniya chutney|chutney|हरी चटनी', 'vegan', '1 tbsp (15 g)', 15, 8, 0.4, 1.0, 0.2, 0.5],
      ['pickle', 'Pickle (achar)', 'achar|aachar|mango pickle|अचार', 'vegan', '1 tsp (10 g)', 10, 25, 0.2, 0.6, 2.4, 0.4],
      ['ketchup', 'Tomato ketchup', 'sauce|tomato sauce|ketchup|केचप', 'vegan', '1 tbsp (17 g)', 17, 17, 0.2, 4.6, 0.0, 0.1],
      ['mayonnaise', 'Mayonnaise', 'mayo|मेयोनेज़', 'egg', '1 tbsp (14 g)', 14, 95, 0.1, 0.1, 10.5, 0.0],
      ['hummus', 'Hummus', 'humus|hommus', 'vegan', '2 tbsp (30 g)', 30, 50, 2.4, 3.5, 2.9, 1.8],
      ['cooking-oil', 'Cooking oil', 'oil|refined oil|tel|तेल', 'vegan', '1 tsp (5 g)', 5, 45, 0.0, 0.0, 5.0, 0.0],
      ['olive-oil', 'Olive oil', 'olive oil|जैतून का तेल', 'vegan', '1 tbsp (13.5 g)', 14, 119, 0.0, 0.0, 13.5, 0.0],
      ['protein-bar', 'Protein bar', 'protein bar|energy bar', 'veg', '1 bar (60 g)', 60, 225, 20.0, 18.0, 8.0, 5.0],
      ['sattu', 'Sattu (roasted gram flour)', 'sattu atta|chana sattu|सत्तू आटा', 'vegan', '2 tbsp (30 g)', 30, 115, 6.6, 17.4, 1.5, 3.0],
    ],
  ],
];

function toFood(category: FoodCategory, r: Row): Food {
  const [id, name, aliases, diet, label, grams, kcal, protein, carbs, fat, fiber, approx] = r;
  const food: Food = {
    id,
    name,
    aliases: aliases ? aliases.split('|').map((a) => a.trim()).filter(Boolean) : [],
    category,
    diet,
    serving: { label, grams },
    per: { kcal, protein, carbs, fat, fiber },
  };
  if (approx) food.approx = true;
  return food;
}

export const FOODS: Food[] = DATA.flatMap(([category, rows]) => rows.map((r) => toFood(category, r)));

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

/** Lowercase, strip Latin diacritics (keeps Devanagari matras), collapse separators to single spaces. */
function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}]+/gu, ' ')
    .trim();
}

interface IndexEntry {
  food: Food;
  order: number;
  name: string;
  terms: string[]; // normalized name first, then aliases
}

let INDEX: IndexEntry[] | null = null;
function getIndex(): IndexEntry[] {
  if (!INDEX) {
    INDEX = FOODS.map((food, order) => {
      const name = normalize(food.name);
      return { food, order, name, terms: [name, ...food.aliases.map(normalize)].filter(Boolean) };
    });
  }
  return INDEX;
}

const DIET_ALLOWED: Record<DietTag, ReadonlySet<DietTag>> = {
  vegan: new Set<DietTag>(['vegan']),
  veg: new Set<DietTag>(['veg', 'vegan']),
  egg: new Set<DietTag>(['veg', 'vegan', 'egg']),
  nonveg: new Set<DietTag>(['veg', 'vegan', 'egg', 'nonveg']),
};

/** Lower is better: 0 exact, 1 prefix, 2 word-start, 3 substring, 4 all words present; -1 no match. */
function scoreTerm(term: string, q: string, qWords: string[]): number {
  if (term === q) return 0;
  if (term.startsWith(q)) return 1;
  if ((' ' + term).includes(' ' + q)) return 2;
  if (term.includes(q)) return 3;
  const compactQ = q.replace(/ /g, '');
  if (compactQ.length >= 3 && term.replace(/ /g, '').includes(compactQ)) return 3;
  if (qWords.length > 1) {
    const words = term.split(' ');
    if (qWords.every((w) => words.some((tw) => tw.startsWith(w)))) return 4;
  }
  return -1;
}

export function searchFoods(query: string, opts?: { diet?: DietTag; limit?: number }): Food[] {
  const q = normalize(query ?? '');
  if (!q) return [];
  const limit = opts?.limit ?? 20;
  if (limit <= 0) return [];
  const allowed = opts?.diet ? DIET_ALLOWED[opts.diet] : null;
  const qWords = q.split(' ');

  const hits: { e: IndexEntry; score: number; viaName: boolean }[] = [];
  for (const e of getIndex()) {
    if (allowed && !allowed.has(e.food.diet)) continue;
    let best = -1;
    let viaName = false;
    e.terms.forEach((t, i) => {
      const s = scoreTerm(t, q, qWords);
      if (s >= 0 && (best < 0 || s < best || (s === best && i === 0))) {
        if (best < 0 || s < best) viaName = i === 0;
        else if (i === 0) viaName = true;
        best = s;
      }
    });
    if (best >= 0) hits.push({ e, score: best, viaName });
  }

  hits.sort(
    (a, b) =>
      a.score - b.score ||
      Number(b.viaName) - Number(a.viaName) ||
      a.e.name.length - b.e.name.length ||
      a.e.order - b.e.order,
  );
  return hits.slice(0, limit).map((h) => h.e.food);
}
