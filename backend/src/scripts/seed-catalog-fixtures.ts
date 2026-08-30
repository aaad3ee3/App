/**
 * DEV-ONLY verification tool — NOT part of the app. Exercises the real
 * catalog-sync.service.ts sync functions against mock adapters seeded with real sample
 * payloads (copied verbatim from Libya Play's and Plus's actual API docs/live-tester
 * output), since this environment can't reach either supplier's network. Lets us verify
 * the sync/upsert/categorization/markup logic end-to-end with realistic data — including
 * real Libya Play image URLs — without guessing fixture shapes.
 *
 *   npm run seed:catalog-fixtures
 */
import { db } from "../db/knex";
import { syncLibyaPlay, syncPlus } from "../modules/catalog/catalog-sync.service";
import type {
  GiftCardCategory,
  GiftCardProduct,
  GiftCardSubCategory,
  GiftCardSupplierAdapter,
} from "../adapters/giftcards/giftcard-supplier.interface";
import type { SmmService, SmmSupplierAdapter } from "../adapters/smm/smm-supplier.interface";

const PUBG_CATEGORY: GiftCardCategory = {
  id: "142f2c21-8360-4641-b201-ade8b5af40ff",
  name: "شدات ببجي",
  image: "https://api.libyaplay.com/storage/images/uAcZdUqaeZk4rVfXP8OAoXMkIx0vyRP4shlWo5ab.webp",
  type: "games",
};

const PLAYSTATION_CATEGORY: GiftCardCategory = {
  id: "f1c865ee-a714-4b5a-8716-11df3af0bbb1",
  name: "بلايستيشن",
  image: "https://api.libyaplay.com/storage/images/8mJs0gX8A5jcX8tk8DfhgQVlbtn8LwtS4eOy3EoP.webp",
  type: "cards",
};

const PUBG_SUBCATEGORY: GiftCardSubCategory = {
  id: "d7ed76be-48f7-408c-83b7-40142c3d8db3",
  categoryId: PUBG_CATEGORY.id,
  name: "اكواد ببجي",
  description: "لعشاق PUBG Mobile والإثارة، أصبح بإمكانك الآن شحن شدات ببجي بسهولة.",
  howToUse: "ادخل موقع ببجي الشحن الرسمي، اختر PUBG Mobile، أدخل الكود.",
  policy: "هذا المنتج صالح للأستخدام في جميع البلدان",
  image: "https://api.libyaplay.com/storage/subcategories/EVmB4UnTxMUC6HzgQ0QkjlmFPXKCdTOiRfosLZL7.webp",
};

const PLAYSTATION_SUBCATEGORY: GiftCardSubCategory = {
  id: "ps-subcategory-cards",
  categoryId: PLAYSTATION_CATEGORY.id,
  name: "بطاقات PSN",
  description: "بطاقات شحن محفظة بلايستيشن نتورك",
  howToUse: "أدخل الكود من إعدادات الحساب على جهاز PlayStation",
  policy: "صالحة حسب منطقة الحساب",
  image: PLAYSTATION_CATEGORY.image,
};

const PUBG_PRODUCTS: GiftCardProduct[] = [
  { id: "e7b3d4f9-0a15-4634-a708-30fb5a7df45f", subCategoryId: PUBG_SUBCATEGORY.id, name: "60 شدة ببجي", description: "", image: "https://api.libyaplay.com/storage/products/qpjRyZfAujxral2CaGlQRCGa3I8fbpsa1Mw6zPUp.jpg", price: 8.0784, currency: "LYD", available: true },
  { id: "4e5ece8c-8a4d-4920-90e5-96f9e65dac15", subCategoryId: PUBG_SUBCATEGORY.id, name: "325 شدة ببجي", description: "", image: "https://api.libyaplay.com/storage/products/e7tOXx6wLHHdsSCgH4AX4gDceIIRfUF8XeKd5V8n.jpg", price: 40.392, currency: "LYD", available: true },
  { id: "57fe6528-e650-4609-beb9-cb97e9f1f0a1", subCategoryId: PUBG_SUBCATEGORY.id, name: "660 شدة ببجي", description: "", image: "https://api.libyaplay.com/storage/products/ofKu4pDKkquOwAtFhu0ZTs1kc6BXOKZStfUNrxfd.jpg", price: 80.784, currency: "LYD", available: true },
  { id: "d1f472fa-c95c-460d-a5d1-b9adcaba33ed", subCategoryId: PUBG_SUBCATEGORY.id, name: "1800 شدة ببجي", description: "", image: "https://api.libyaplay.com/storage/products/A1pDMcjAL5YEeJUjJZjuMbzujK9NMfAIOI7e1yo4.jpg", price: 201.96, currency: "LYD", available: true },
];

const PLAYSTATION_PRODUCTS: GiftCardProduct[] = [
  { id: "ps-card-10", subCategoryId: PLAYSTATION_SUBCATEGORY.id, name: "بطاقة بلايستيشن 10$", description: "", image: PLAYSTATION_CATEGORY.image, price: 55, currency: "LYD", available: true },
  { id: "ps-card-25", subCategoryId: PLAYSTATION_SUBCATEGORY.id, name: "بطاقة بلايستيشن 25$", description: "", image: PLAYSTATION_CATEGORY.image, price: 135, currency: "LYD", available: true },
  { id: "ps-card-50", subCategoryId: PLAYSTATION_SUBCATEGORY.id, name: "بطاقة بلايستيشن 50$", description: "", image: PLAYSTATION_CATEGORY.image, price: 265, currency: "LYD", available: true },
];

const mockGiftCardAdapter: GiftCardSupplierAdapter = {
  async listCategories() {
    return [PUBG_CATEGORY, PLAYSTATION_CATEGORY];
  },
  async listSubCategories(categoryId: string) {
    if (categoryId === PUBG_CATEGORY.id) return [PUBG_SUBCATEGORY];
    if (categoryId === PLAYSTATION_CATEGORY.id) return [PLAYSTATION_SUBCATEGORY];
    return [];
  },
  async listProducts(subCategoryId: string) {
    if (subCategoryId === PUBG_SUBCATEGORY.id) return PUBG_PRODUCTS;
    if (subCategoryId === PLAYSTATION_SUBCATEGORY.id) return PLAYSTATION_PRODUCTS;
    return [];
  },
  async purchase() {
    throw new Error("not used by the seed script");
  },
};

// A representative slice of the real Plus /services response (verbatim field values),
// covering enough platforms to exercise every branch of plus-categorization.ts.
const PLUS_SERVICES: SmmService[] = [
  { supplierServiceId: "401", name: "متابعين انستا 👥|حقيقي سرعة🔥|بدون ضمان", costPer1000: 0.532, currency: "USD", minQuantity: 100, maxQuantity: 1000000 },
  { supplierServiceId: "402", name: "متابعين انستا 👥|حقيقي سرعة🔥|30ي♻️", costPer1000: 0.644, currency: "USD", minQuantity: 100, maxQuantity: 1000000 },
  { supplierServiceId: "132", name: "متابعين تيك توك فوري🚀بدون تعويض👥", costPer1000: 1.976510067114094, currency: "USD", minQuantity: 10, maxQuantity: 1000000 },
  { supplierServiceId: "130", name: "لايكات تيك توك ثابت 30 يوم ❤️", costPer1000: 0.085, currency: "USD", minQuantity: 50, maxQuantity: 5000000 },
  { supplierServiceId: "363", name: "متابعين فيسبوك👥|جودة عالية🔥|بدون ضمان⚠️", costPer1000: 0.29592, currency: "USD", minQuantity: 10, maxQuantity: 10000 },
  { supplierServiceId: "287", name: "أعضاء تيليجرام👥ثابت وسريع🔥|ضمان7ي♻️", costPer1000: 0.155115, currency: "USD", minQuantity: 1, maxQuantity: 1000000 },
  { supplierServiceId: "538", name: "👥 أعضاء قناة واتساب حقيقي |سريع🚀| الارخص 🔥", costPer1000: 1.97162, currency: "USD", minQuantity: 10, maxQuantity: 10000 },
  { supplierServiceId: "269", name: "👥️ متابعين يوتيوب الارخص | سريع 🔥", costPer1000: 0.3, currency: "USD", minQuantity: 200, maxQuantity: 100000 },
  { supplierServiceId: "53", name: "متابعين تويتر عالية الجودة عالمي  متنوع🚀", costPer1000: 1.65, currency: "USD", minQuantity: 100, maxQuantity: 50000 },
];

const mockSmmAdapter: SmmSupplierAdapter = {
  async listServices() {
    return PLUS_SERVICES;
  },
  async addOrder() {
    throw new Error("not used by the seed script");
  },
  async getOrderStatus() {
    throw new Error("not used by the seed script");
  },
};

async function main() {
  const libyaPlayResult = await syncLibyaPlay(mockGiftCardAdapter);
  console.log(`✅ Libya Play (fixture): ${libyaPlayResult.categories} categories, ${libyaPlayResult.products} products`);

  const plusResult = await syncPlus(mockSmmAdapter);
  console.log(`✅ Plus (fixture): ${plusResult.categories} categories, ${plusResult.products} products`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => db.destroy());
