/**
 * Built-in calorie table for everyday foods and drinks, so "a bowl of Fruity Pebbles" gets an instant estimate
 * with no AI call. Values are typical US servings (USDA-style averages and common package labels), rounded.
 * Results are always labeled as estimates in the app.
 */

export type TableHit = { calories: number; protein: number; carbs: number; fat: number; matched: string };

type Entry = {
  /** Words that identify it, most specific first. A name matches when it contains every word of one alias. */
  aliases: string[];
  /** What one serving means, and its nutrition: [calories, protein g, carbs g, fat g]. */
  serving: string;
  n: [number, number, number, number];
  /** Nutrition per fluid ounce, for drinks logged with ounces. */
  perOz?: boolean;
  /** Units that mean "one serving" (bowl, slice, piece…). */
  units?: string[];
};

const T: Entry[] = [
  // Cereal: a bowl ≈ 1½ cups cereal + 1 cup 2% milk.
  { aliases: ["fruity pebbles", "cocoa pebbles", "pebbles", "froot loops", "fruit loops", "lucky charms", "frosted flakes", "cinnamon toast crunch", "captain crunch", "cap n crunch", "honey nut cheerios", "apple jacks", "trix", "cocoa puffs", "reeses puffs", "golden grahams", "frosted mini wheats", "honey bunches of oats", "sweet cereal"],
    serving: "bowl with milk", n: [330, 10, 60, 6], units: ["bowl", "cup", "serving"] },
  { aliases: ["cheerios", "corn flakes", "rice krispies", "special k", "raisin bran", "bran flakes", "granola cereal", "cereal"],
    serving: "bowl with milk", n: [280, 11, 48, 5], units: ["bowl", "cup", "serving"] },
  { aliases: ["granola"], serving: "½ cup", n: [280, 7, 36, 12], units: ["cup", "bowl", "serving"] },
  { aliases: ["oatmeal", "oats", "grits"], serving: "bowl", n: [190, 6, 32, 4], units: ["bowl", "cup", "packet", "serving"] },
  { aliases: ["pancake"], serving: "pancake", n: [175, 4, 22, 7], units: ["pancake", "piece"] },
  { aliases: ["waffle"], serving: "waffle", n: [220, 6, 25, 11], units: ["waffle", "piece"] },
  { aliases: ["french toast"], serving: "slice", n: [150, 5, 16, 7], units: ["slice", "piece"] },
  { aliases: ["chicken and waffles", "chicken & waffles", "chicken n waffles"], serving: "plate", n: [1100, 45, 95, 60], units: ["plate", "order", "serving"] },
  { aliases: ["egg sandwich", "breakfast sandwich", "bacon egg and cheese", "sausage egg and cheese"], serving: "sandwich", n: [450, 20, 32, 26], units: ["sandwich"] },
  { aliases: ["breakfast burrito"], serving: "burrito", n: [650, 26, 55, 35], units: ["burrito"] },
  { aliases: ["scrambled eggs"], serving: "2 eggs", n: [200, 13, 2, 15], units: ["serving", "plate"] },
  { aliases: ["egg"], serving: "egg", n: [78, 6, 1, 5], units: ["egg", "eggs"] },
  { aliases: ["bacon"], serving: "slice", n: [45, 3, 0, 3.5], units: ["slice", "strip", "piece"] },
  { aliases: ["sausage"], serving: "link", n: [90, 5, 1, 8], units: ["link", "patty", "piece"] },
  { aliases: ["bagel cream cheese", "bagel with cream cheese"], serving: "bagel", n: [380, 12, 56, 12], units: ["bagel"] },
  { aliases: ["bagel"], serving: "bagel", n: [280, 11, 55, 2], units: ["bagel"] },
  { aliases: ["muffin"], serving: "muffin", n: [420, 6, 58, 18], units: ["muffin"] },
  { aliases: ["donut"], serving: "donut", n: [260, 3, 31, 14], units: ["donut", "doughnut"] },
  { aliases: ["doughnut"], serving: "doughnut", n: [260, 3, 31, 14], units: ["doughnut", "donut"] },
  { aliases: ["croissant"], serving: "croissant", n: [270, 5, 31, 14], units: ["croissant"] },
  { aliases: ["biscuit"], serving: "biscuit", n: [220, 4, 27, 10], units: ["biscuit"] },
  { aliases: ["toast"], serving: "slice with butter", n: [110, 3, 13, 5], units: ["slice", "piece"] },
  { aliases: ["yogurt"], serving: "cup", n: [150, 12, 18, 3], units: ["cup", "container"] },
  { aliases: ["banana"], serving: "banana", n: [105, 1, 27, 0], units: ["banana"] },
  { aliases: ["apple"], serving: "apple", n: [95, 0, 25, 0], units: ["apple"] },
  { aliases: ["orange"], serving: "orange", n: [62, 1, 15, 0], units: ["orange"] },
  { aliases: ["grapes"], serving: "cup", n: [104, 1, 27, 0], units: ["cup", "bowl"] },
  { aliases: ["strawberries"], serving: "cup", n: [50, 1, 12, 0], units: ["cup", "bowl"] },
  { aliases: ["fruit cup", "fruit salad", "fruit"], serving: "cup", n: [90, 1, 23, 0], units: ["cup", "bowl"] },

  // Lunch and dinner
  { aliases: ["pizza"], serving: "slice", n: [285, 12, 36, 10], units: ["slice", "piece"] },
  { aliases: ["double cheeseburger"], serving: "burger", n: [750, 42, 40, 45], units: ["burger"] },
  { aliases: ["cheeseburger"], serving: "burger", n: [600, 30, 40, 33], units: ["burger"] },
  { aliases: ["burger"], serving: "burger", n: [550, 28, 40, 30], units: ["burger"] },
  { aliases: ["hot dog"], serving: "hot dog", n: [290, 10, 24, 17], units: ["hot dog", "dog"] },
  { aliases: ["chicken sandwich"], serving: "sandwich", n: [520, 28, 48, 24], units: ["sandwich"] },
  { aliases: ["turkey sandwich", "ham sandwich", "sandwich", "sub", "hoagie"], serving: "sandwich", n: [450, 25, 45, 18], units: ["sandwich", "sub"] },
  { aliases: ["grilled cheese"], serving: "sandwich", n: [400, 15, 30, 25], units: ["sandwich"] },
  { aliases: ["philly cheesesteak", "cheesesteak"], serving: "sandwich", n: [800, 40, 60, 42], units: ["sandwich"] },
  { aliases: ["wrap"], serving: "wrap", n: [500, 25, 45, 22], units: ["wrap"] },
  { aliases: ["burrito bowl"], serving: "bowl", n: [700, 35, 75, 25], units: ["bowl"] },
  { aliases: ["burrito"], serving: "burrito", n: [850, 35, 100, 32], units: ["burrito"] },
  { aliases: ["quesadilla"], serving: "quesadilla", n: [700, 32, 50, 40], units: ["quesadilla"] },
  { aliases: ["birria taco", "birria"], serving: "taco", n: [260, 14, 16, 15], units: ["taco"] },
  { aliases: ["taco"], serving: "taco", n: [200, 10, 15, 11], units: ["taco"] },
  { aliases: ["nachos"], serving: "plate", n: [900, 30, 80, 52], units: ["plate", "order"] },
  { aliases: ["boneless wings"], serving: "wing", n: [70, 5, 4, 4], units: ["wing", "piece"] },
  { aliases: ["wings", "wing"], serving: "wing", n: [90, 7, 1, 6.5], units: ["wing", "piece"] },
  { aliases: ["chicken tenders", "chicken strips", "tenders"], serving: "tender", n: [130, 9, 8, 7], units: ["tender", "strip", "piece"] },
  { aliases: ["nuggets", "chicken nuggets"], serving: "nugget", n: [45, 2.5, 3, 3], units: ["nugget", "piece"] },
  { aliases: ["fried chicken"], serving: "piece", n: [320, 25, 10, 20], units: ["piece", "breast", "thigh", "leg"] },
  { aliases: ["grilled chicken", "chicken breast"], serving: "breast", n: [280, 50, 0, 7], units: ["breast", "piece"] },
  { aliases: ["fish and chips", "fish & chips"], serving: "plate", n: [950, 35, 85, 50], units: ["plate", "order"] },
  { aliases: ["fried fish", "catfish", "whiting"], serving: "fillet", n: [400, 25, 18, 25], units: ["fillet", "piece"] },
  { aliases: ["salmon"], serving: "fillet", n: [360, 34, 0, 23], units: ["fillet", "piece"] },
  { aliases: ["shrimp and grits", "shrimp & grits"], serving: "bowl", n: [700, 30, 45, 42], units: ["bowl", "plate"] },
  { aliases: ["steak"], serving: "8 oz steak", n: [600, 50, 0, 44], units: ["steak"] },
  { aliases: ["ribs"], serving: "half rack", n: [900, 60, 20, 65], units: ["rack", "order"] },
  { aliases: ["pulled pork", "brisket", "bbq plate"], serving: "plate", n: [800, 45, 60, 40], units: ["plate", "sandwich"] },
  { aliases: ["mac and cheese", "mac & cheese", "mac n cheese"], serving: "cup", n: [400, 15, 40, 20], units: ["cup", "side", "bowl", "serving"] },
  { aliases: ["spaghetti", "pasta", "lasagna", "alfredo"], serving: "plate", n: [750, 28, 90, 28], units: ["plate", "bowl", "serving"] },
  { aliases: ["ramen"], serving: "bowl", n: [650, 25, 75, 25], units: ["bowl"] },
  { aliases: ["pho"], serving: "bowl", n: [500, 30, 65, 10], units: ["bowl"] },
  { aliases: ["fried rice"], serving: "plate", n: [650, 18, 85, 25], units: ["plate", "bowl", "order"] },
  { aliases: ["orange chicken", "general tso", "sesame chicken"], serving: "plate", n: [900, 35, 100, 38], units: ["plate", "order"] },
  { aliases: ["sushi roll", "sushi"], serving: "roll", n: [300, 10, 45, 8], units: ["roll"] },
  { aliases: ["poke bowl", "poke"], serving: "bowl", n: [650, 35, 75, 20], units: ["bowl"] },
  { aliases: ["rice and beans", "red beans and rice"], serving: "plate", n: [450, 15, 80, 7], units: ["plate", "bowl"] },
  { aliases: ["rice"], serving: "cup", n: [205, 4, 45, 0], units: ["cup", "side", "bowl"] },
  { aliases: ["jerk chicken"], serving: "plate", n: [750, 45, 60, 32], units: ["plate"] },
  { aliases: ["oxtail"], serving: "plate", n: [900, 50, 60, 50], units: ["plate"] },
  { aliases: ["gyro"], serving: "gyro", n: [600, 28, 50, 32], units: ["gyro"] },
  { aliases: ["caesar salad"], serving: "salad", n: [450, 12, 20, 36], units: ["salad", "bowl"] },
  { aliases: ["salad"], serving: "salad", n: [350, 15, 20, 24], units: ["salad", "bowl"] },
  { aliases: ["soup", "chili", "gumbo"], serving: "bowl", n: [350, 18, 35, 14], units: ["bowl", "cup"] },
  { aliases: ["collard greens", "greens"], serving: "side", n: [150, 6, 10, 10], units: ["side", "cup"] },
  { aliases: ["fries", "french fries"], serving: "medium order", n: [365, 4, 48, 17], units: ["order", "side"] },
  { aliases: ["onion rings"], serving: "order", n: [480, 6, 50, 28], units: ["order", "side"] },
  { aliases: ["mashed potatoes"], serving: "cup", n: [240, 4, 35, 9], units: ["cup", "side"] },
  { aliases: ["cornbread"], serving: "piece", n: [200, 4, 30, 7], units: ["piece", "slice"] },
  { aliases: ["potato chips", "chips"], serving: "bag (1 oz)", n: [155, 2, 15, 10], units: ["bag", "serving"] },
  { aliases: ["popcorn"], serving: "bag", n: [400, 7, 45, 22], units: ["bag", "bowl"] },
  { aliases: ["peanut butter and jelly", "pb&j", "pbj"], serving: "sandwich", n: [380, 12, 45, 18], units: ["sandwich"] },

  // Sweets and snacks
  { aliases: ["ice cream"], serving: "cup", n: [275, 5, 32, 14], units: ["cup", "scoop", "bowl", "cone"] },
  { aliases: ["milkshake", "shake"], serving: "16 oz", n: [700, 15, 100, 25], units: ["shake", "cup"] },
  { aliases: ["cookie"], serving: "cookie", n: [200, 2, 27, 10], units: ["cookie"] },
  { aliases: ["brownie"], serving: "brownie", n: [250, 3, 35, 12], units: ["brownie", "piece"] },
  { aliases: ["cheesecake"], serving: "slice", n: [450, 7, 35, 32], units: ["slice", "piece"] },
  { aliases: ["cake"], serving: "slice", n: [400, 4, 55, 18], units: ["slice", "piece"] },
  { aliases: ["pie", "banana pudding", "cobbler"], serving: "slice", n: [380, 4, 52, 17], units: ["slice", "piece", "cup", "serving"] },
  { aliases: ["candy bar", "chocolate bar", "snickers", "kit kat", "reeses"], serving: "bar", n: [230, 3, 30, 12], units: ["bar", "pack"] },
  { aliases: ["granola bar", "protein bar"], serving: "bar", n: [200, 10, 22, 8], units: ["bar"] },
  { aliases: ["peanuts", "almonds", "nuts", "trail mix"], serving: "¼ cup", n: [200, 7, 7, 17], units: ["handful", "serving", "bag"] },

  // Drinks (per ounce when ounces are given; otherwise one typical serving)
  { aliases: ["sweet tea"], serving: "16 oz", n: [180, 0, 46, 0], units: ["cup", "glass"] },
  { aliases: ["lemonade"], serving: "16 oz", n: [200, 0, 52, 0], units: ["cup", "glass"] },
  { aliases: ["orange juice", "apple juice", "juice"], serving: "12 oz", n: [165, 2, 39, 0], units: ["cup", "glass", "bottle"] },
  { aliases: ["diet coke", "diet soda", "coke zero", "zero sugar", "sparkling water", "seltzer", "black coffee", "unsweet tea"], serving: "12 oz", n: [2, 0, 0, 0], units: ["can", "cup", "glass", "bottle"] },
  { aliases: ["soda", "coke", "pepsi", "sprite", "dr pepper", "ginger ale", "pop"], serving: "12 oz can", n: [150, 0, 39, 0], units: ["can", "cup", "glass", "bottle"] },
  { aliases: ["energy drink", "red bull", "monster"], serving: "16 oz", n: [210, 0, 54, 0], units: ["can"] },
  { aliases: ["sports drink", "gatorade", "powerade"], serving: "20 oz", n: [140, 0, 36, 0], units: ["bottle"] },
  { aliases: ["frappuccino", "frappe"], serving: "16 oz", n: [380, 5, 55, 15], units: ["cup"] },
  { aliases: ["latte", "cappuccino"], serving: "16 oz", n: [190, 12, 18, 7], units: ["cup"] },
  { aliases: ["coffee"], serving: "12 oz with cream & sugar", n: [70, 1, 9, 3], units: ["cup", "mug"] },
  { aliases: ["hot chocolate"], serving: "12 oz", n: [250, 8, 35, 9], units: ["cup", "mug"] },
  { aliases: ["smoothie"], serving: "16 oz", n: [300, 5, 65, 3], units: ["cup"] },
  { aliases: ["protein shake"], serving: "shake", n: [160, 30, 5, 3], units: ["shake", "bottle", "scoop"] },
  { aliases: ["milk"], serving: "8 oz", n: [122, 8, 12, 5], units: ["cup", "glass"] },
  { aliases: ["light beer"], serving: "12 oz", n: [100, 1, 5, 0], units: ["can", "bottle", "beer"] },
  { aliases: ["ipa"], serving: "12 oz", n: [200, 2, 18, 0], units: ["can", "bottle", "pint"] },
  { aliases: ["beer"], serving: "12 oz", n: [150, 2, 13, 0], units: ["can", "bottle", "beer", "pint"] },
  { aliases: ["hard seltzer", "white claw", "truly"], serving: "12 oz", n: [100, 0, 2, 0], units: ["can"] },
  { aliases: ["wine"], serving: "5 oz glass", n: [125, 0, 4, 0], units: ["glass"] },
  { aliases: ["margarita"], serving: "8 oz", n: [300, 0, 36, 0], units: ["drink", "glass"] },
  { aliases: ["pina colada"], serving: "8 oz", n: [450, 1, 60, 8], units: ["drink", "glass"] },
  { aliases: ["mimosa"], serving: "6 oz", n: [120, 0, 12, 0], units: ["glass", "drink"] },
  { aliases: ["long island"], serving: "drink", n: [280, 0, 33, 0], units: ["drink", "glass"] },
  { aliases: ["mojito", "cocktail", "mixed drink", "old fashioned", "martini", "cosmo"], serving: "drink", n: [220, 0, 15, 0], units: ["drink", "glass"] },
  { aliases: ["tequila", "vodka", "whiskey", "rum", "gin", "henny", "hennessy", "shot"], serving: "1.5 oz shot", n: [100, 0, 0, 0], units: ["shot"] },
];

// Per-ounce values for drinks whose serving above is a fixed size.
const SERVING_OZ: Record<string, number> = { "16 oz": 16, "12 oz": 12, "20 oz": 20, "8 oz": 8, "6 oz": 6, "5 oz glass": 5, "12 oz can": 12, "1.5 oz shot": 1.5, "12 oz with cream & sugar": 12 };

const norm = (s: string) => ` ${s.toLowerCase().replace(/&/g, " and ").replace(/['’]/g, "").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim()} `;
const WORD_NUM: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, half: 0.5, couple: 2, few: 3 };

/** "2 slices" → 2, "a big bowl" → 1.4, "half" → 0.5, "1/2 plate" → 0.5. Defaults to 1. */
export function amountMultiplier(amount: string | null | undefined): number {
  if (!amount) return 1;
  const a = norm(amount);
  let n = 1;
  const frac = /(\d+)\s*\/\s*(\d+)/.exec(amount);
  const num = /(\d+(?:\.\d+)?)/.exec(amount);
  if (frac && Number(frac[2]) > 0) n = Number(frac[1]) / Number(frac[2]);
  else if (num) n = Number(num[1]);
  else for (const [w, v] of Object.entries(WORD_NUM)) if (a.includes(` ${w} `)) { n = v; break; }
  if (/ (big|large|huge|extra large|xl) /.test(a)) n *= 1.4;
  else if (/ (small|little|mini|kids) /.test(a)) n *= 0.7;
  if (/ (half|split) /.test(a) && n !== 0.5) n *= 0.5;
  return Math.min(Math.max(n, 0.1), 20);
}

/**
 * Typical nutrition for an everyday food or drink, or null when it isn't in the table
 * (then the AI estimate, if it's on, takes over).
 */
export function lookupFood(input: { name: string; amount?: string | null; ounces?: number | null }): TableHit | null {
  const name = norm(input.name);
  let best: { e: Entry; alias: string } | null = null;
  for (const e of T) {
    for (const alias of e.aliases) {
      const words = alias.split(" ");
      if (words.every((w) => name.includes(` ${w} `) || name.includes(` ${w}s `) || name.includes(` ${w}es `))) {
        if (!best || alias.length > best.alias.length) best = { e, alias };
        break;
      }
    }
  }
  if (!best) return null;
  const { e } = best;
  let mult: number;
  const servingOz = SERVING_OZ[e.serving];
  if (input.ounces && servingOz) mult = input.ounces / servingOz;   // drinks logged with ounces
  // No amount typed? A count in the name counts ("10 wings").
  else mult = amountMultiplier(input.amount || (/^\s*(\d|a |an |one |two |three |half )/i.test(input.name) ? input.name : null));
  const r1 = (x: number) => Math.round(x * mult * 10) / 10;
  return { calories: Math.round(e.n[0] * mult), protein: r1(e.n[1]), carbs: r1(e.n[2]), fat: r1(e.n[3]), matched: best.alias };
}
