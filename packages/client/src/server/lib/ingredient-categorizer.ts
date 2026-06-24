import type { GroceryCategory } from '../types/grocery-list';

const CATEGORY_KEYWORDS: Record<GroceryCategory, string[]> = {
  Produce: [
    'onion', 'garlic', 'tomato', 'spinach', 'broccoli', 'carrot', 'potato',
    'lettuce', 'celery', 'mushroom', 'avocado', 'bell pepper', 'lemon', 'lime',
    'ginger', 'parsley', 'chive', 'basil', 'cilantro', 'mint', 'thyme', 'rosemary',
    'green onion', 'scallion', 'leek', 'zucchini', 'cucumber', 'eggplant', 'cabbage',
    'kale', 'arugula', 'bok choy', 'beansprout', 'bean sprout', 'spring onion',
    'capsicum', 'pumpkin', 'squash', 'sweet potato', 'yam', 'radish', 'turnip',
    'beetroot', 'beet', 'fennel', 'asparagus', 'artichoke', 'brussels sprout',
    'cauliflower', 'corn', 'pea', 'bean', 'edamame', 'apple', 'banana', 'orange',
    'mango', 'pineapple', 'strawberry', 'blueberry', 'raspberry', 'grape', 'cherry',
    'peach', 'pear', 'plum', 'watermelon', 'cantaloupe', 'lychee', 'papaya',
    'kiwi', 'pomegranate', 'fig', 'date', 'herb',
  ],
  Dairy: [
    'milk', 'cheese', 'butter', 'cream', 'yoghurt', 'yogurt', 'feta', 'parmesan',
    'mozzarella', 'cheddar', 'brie', 'gouda', 'ricotta', 'cream cheese',
    'sour cream', 'half and half', 'heavy cream', 'whipping cream', 'condensed milk',
    'evaporated milk', 'ghee', 'egg',
  ],
  Meat: [
    'chicken', 'beef', 'pork', 'lamb', 'turkey', 'duck', 'bacon', 'ham',
    'sausage', 'salami', 'pepperoni', 'chorizo', 'ground beef', 'ground turkey',
    'ground pork', 'steak', 'rib', 'brisket', 'tenderloin', 'veal', 'venison',
    'mince', 'minced beef', 'minced chicken',
  ],
  Seafood: [
    'shrimp', 'prawn', 'salmon', 'tuna', 'fish', 'crab', 'lobster', 'scallop',
    'mussel', 'clam', 'oyster', 'squid', 'octopus', 'anchovy', 'sardine',
    'tilapia', 'cod', 'halibut', 'snapper', 'sea bass', 'mackerel', 'trout',
  ],
  Grains: [
    'rice', 'pasta', 'bread', 'flour', 'noodle', 'oat', 'quinoa', 'arborio',
    'tortilla', 'crouton', 'burger bun', 'bun', 'roll', 'pita', 'naan', 'roti',
    'couscous', 'barley', 'bulgur', 'farro', 'cornmeal', 'polenta', 'breadcrumb',
    'panko', 'wrap', 'cracker', 'cereal',
  ],
  Pantry: [
    'soy sauce', 'oyster sauce', 'fish sauce', 'hoisin sauce', 'worcestershire',
    'olive oil', 'vegetable oil', 'sesame oil', 'coconut oil', 'canola oil',
    'cumin', 'paprika', 'garam masala', 'turmeric', 'coriander', 'cinnamon',
    'oregano', 'chili flake', 'chilli flake', 'red pepper flake', 'cayenne',
    'black pepper', 'white pepper', 'salt', 'sugar', 'brown sugar', 'honey',
    'maple syrup', 'vanilla', 'baking powder', 'baking soda', 'cornstarch',
    'cornflour', 'stock', 'broth', 'bouillon', 'canned tomato', 'tomato paste',
    'tomato sauce', 'diced tomato', 'coconut milk', 'coconut cream',
    'chickpea', 'lentil', 'kidney bean', 'black bean', 'cannellini bean',
    'white bean', 'pinto bean', 'chickpeas', 'lentils',
    'taco seasoning', 'italian seasoning', 'mixed spice', 'allspice', 'nutmeg',
    'cardamom', 'star anise', 'bay leaf', 'white wine', 'red wine', 'vinegar',
    'balsamic', 'rice wine', 'mirin', 'sake', 'tahini', 'peanut butter',
    'almond butter', 'nut butter', 'jam', 'jelly', 'marmalade',
    'olive', 'caper', 'sun dried tomato', 'roasted pepper', 'artichoke heart',
    'lemon juice', 'lime juice', 'orange juice', 'apple cider',
    'pine nut', 'walnut', 'almond', 'cashew', 'pecan', 'pistachio',
    'peanut', 'hazelnut', 'sunflower seed', 'pumpkin seed', 'sesame seed',
    'flaxseed', 'chia seed', 'coconut flake', 'raisin', 'dried cranberry',
    'dried fruit',
  ],
  Condiments: [
    'ketchup', 'mustard', 'mayonnaise', 'mayo', 'hot sauce', 'sriracha',
    'caesar dressing', 'ranch dressing', 'italian dressing', 'vinaigrette',
    'bbq sauce', 'relish', 'pickle', 'salsa', 'guacamole', 'hummus',
    'tartar sauce', 'aioli', 'tzatziki',
  ],
  Frozen: [
    'frozen pea', 'frozen corn', 'frozen berry', 'frozen vegetable',
    'frozen spinach', 'frozen broccoli', 'frozen edamame', 'ice cream',
  ],
  Other: [],
};

/** Returns true when keyword appears as whole words within name */
function containsKeyword(name: string, keyword: string): boolean {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|\\s)${escaped}(\\s|$)`).test(name);
}

/**
 * Infers the grocery category for a canonical ingredient name.
 * Uses whole-word, longest-keyword match to avoid partial matches like
 * "corn" matching "unicorn".
 */
export function inferCategory(canonicalName: string): GroceryCategory {
  const name = canonicalName.toLowerCase();

  let bestCategory: GroceryCategory = 'Other';
  let bestMatchLength = 0;

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS) as [GroceryCategory, string[]][]) {
    for (const keyword of keywords) {
      if (containsKeyword(name, keyword) && keyword.length > bestMatchLength) {
        bestMatchLength = keyword.length;
        bestCategory = category;
      }
    }
  }

  return bestCategory;
}
