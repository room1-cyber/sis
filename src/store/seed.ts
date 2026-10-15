import type {
  Appointment,
  AppSettings,
  Customer,
  Database,
  Invoice,
  LabOrder,
  Prescription,
  Product,
  ProductCategory,
  Purchase,
  ReturnRecord,
  StockMovement,
  Supplier,
  User,
} from '@/types';
import { addDays, atNoon } from '@/lib/date';
import { computeInvoiceTotals, invoiceStatusFor, round2 } from '@/lib/calc';
import { nextNumber, uid } from '@/lib/id';
import { DB_VERSION, defaultSettings } from './db';

/* ---------------------------------------------------------------------------
 * Demo database. Everything is generated from a fixed seed so the sample data
 * is identical on every fresh install (and in tests).
 * ------------------------------------------------------------------------- */

export const DEMO_CREDENTIALS = [
  { username: 'admin', password: 'admin123', role: 'admin' as const },
  { username: 'manager', password: 'demo123', role: 'manager' as const },
  { username: 'cashier', password: 'demo123', role: 'cashier' as const },
  { username: 'optometrist', password: 'demo123', role: 'optometrist' as const },
];

/** Deterministic PRNG (mulberry32) so demo data never changes between reloads. */
function makeRandom(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const random = makeRandom(20260115);
const pick = <T>(items: T[]): T => items[Math.floor(random() * items.length)];
const between = (min: number, max: number) => Math.round(min + random() * (max - min));

/* --------------------------------- Users ---------------------------------- */

function demoUsers(): User[] {
  const created = atNoon(addDays(new Date(), -420));
  return [
    {
      id: 'usr_admin',
      username: 'admin',
      fullName: 'عبدالله الشمري',
      role: 'admin',
      salt: 'fe5701d3b2793a587398cfb5189a3feb',
      passwordHash: '0fa75fe59f2bfa6d7e90fdfce10c37f52a6a1083d4f32491319150f676a5498f',
      phone: '0551000001',
      email: 'admin@albasira-optics.com',
      active: true,
      createdAt: created,
    },
    {
      id: 'usr_manager',
      username: 'manager',
      fullName: 'منى العبدالله',
      role: 'manager',
      salt: '34b9776f3e304b1a311bcea11975cf7f',
      passwordHash: 'c68e902390893b8e2b0b3494b524546a84d7a53bb0694d49b290253a8c36d734',
      phone: '0551000002',
      active: true,
      createdAt: created,
    },
    {
      id: 'usr_cashier',
      username: 'cashier',
      fullName: 'فهد المطيري',
      role: 'cashier',
      salt: '7954254975f0e214f7e5f98a9af2ccf1',
      passwordHash: '3c76f84d31b31de566fa37b5c584dba9cfcc7f95db3dd133728f0055bb417cc5',
      phone: '0551000003',
      active: true,
      createdAt: created,
    },
    {
      id: 'usr_optometrist',
      username: 'optometrist',
      fullName: 'د. هدى الزهراني',
      role: 'optometrist',
      salt: '0540e482b26eff4a695f9a4223078e84',
      passwordHash: '6ac84ee8a5406ba44a5fb5d49f5dd7d8cce0e5c72967bf9e48e085ef314b1aa6',
      phone: '0551000004',
      active: true,
      createdAt: created,
    },
  ];
}

/* -------------------------------- Suppliers -------------------------------- */

function demoSellers(): Supplier[] {
  const created = atNoon(addDays(new Date(), -400));
  const rows: Array<[string, string, string, string, string, number]> = [
    ['SUP-001', 'شركة العدسات المتحدة', 'م. سامي الحربي', '0112223344', 'sales@united-lenses.com', 12450],
    ['SUP-002', 'مؤسسة الإطارات الذهبية', 'أ. رائد العمري', '0113334455', 'info@golden-frames.com', 6380],
    ['SUP-003', 'وكيل راي بان السعودية', 'م. لمى الدوسري', '0114445566', 'orders@rayban-agent.sa', 0],
    ['SUP-004', 'شركة المحاليل الطبية', 'أ. ناصر القرني', '0115556677', 'contact@med-solutions.com', 2140],
    ['SUP-005', 'معمل الرياض للعدسات', 'م. طلال الغامدي', '0116667788', 'lab@riyadh-lens.com', 8700],
  ];
  return rows.map(([code, name, contactPerson, phone, email, balance]) => ({
    id: `sup_${code}`,
    code,
    name,
    contactPerson,
    phone,
    email,
    address: 'الرياض، المملكة العربية السعودية',
    taxNumber: `300${between(1000000, 9999999)}00003`,
    balance,
    notes: '',
    createdAt: created,
  }));
}

/* -------------------------------- Products --------------------------------- */

type ProductSeed = [
  sku: string,
  nameAr: string,
  nameEn: string,
  category: ProductCategory,
  brand: string,
  price: number,
  cost: number,
  quantity: number,
  minQuantity: number,
  extra?: Partial<Product>,
];

const PRODUCT_SEED: ProductSeed[] = [
  // --- Frames -------------------------------------------------------------
  ['FRM-RB-01', 'إطار راي بان أفياتور', 'Ray-Ban Aviator Frame', 'frames', 'Ray-Ban', 850, 520, 6, 2, { color: 'ذهبي', size: '58-14-140', material: 'معدن', gender: 'men', model: 'RB3025' }],
  ['FRM-RB-02', 'إطار راي بان ويافيرر', 'Ray-Ban Wayfarer Frame', 'frames', 'Ray-Ban', 780, 470, 4, 2, { color: 'أسود', size: '54-18-145', material: 'أسيتات', gender: 'unisex', model: 'RB2140' }],
  ['FRM-OAK-01', 'إطار أوكلي هولبروك', 'Oakley Holbrook Frame', 'frames', 'Oakley', 920, 560, 3, 2, { color: 'أزرق مطفي', size: '55-18-140', material: 'أو ماتر', gender: 'men', model: 'OO9102' }],
  ['FRM-POL-01', 'إطار بوليس سكوير', 'Police Square Frame', 'frames', 'Police', 640, 380, 8, 3, { color: 'بني', size: '53-17-145', material: 'أسيتات', gender: 'men', model: 'PLR' }],
  ['FRM-GUC-01', 'إطار غوتشي كلاسيك', 'Gucci Classic Frame', 'frames', 'Gucci', 1850, 1200, 2, 1, { color: 'أسود/ذهبي', size: '52-19-145', material: 'أسيتات', gender: 'women', model: 'GG0396' }],
  ['FRM-TIT-01', 'إطار تيتانيوم خفيف', 'Titanium Light Frame', 'frames', 'Titanium Pro', 1250, 760, 3, 1, { color: 'فضي', size: '51-18-140', material: 'تيتانيوم', gender: 'unisex' }],
  ['FRM-MET-01', 'إطار معدني دائري', 'Round Metal Frame', 'frames', 'Vogue', 420, 230, 7, 3, { color: 'وردي ذهبي', size: '50-20-145', material: 'معدن', gender: 'women' }],
  ['FRM-KID-01', 'إطار أطفال مرن', 'Kids Flexible Frame', 'frames', 'Kids Vision', 260, 140, 12, 4, { color: 'أزرق', size: '44-16-125', material: 'TR90', gender: 'kids' }],
  // --- Sunglasses ---------------------------------------------------------
  ['SUN-RB-01', 'شمسية راي بان أفياتور', 'Ray-Ban Aviator Sunglasses', 'sunglasses', 'Ray-Ban', 1150, 700, 5, 2, { color: 'ذهبي/رمادي', size: '58-14-140', material: 'معدن', gender: 'men', model: 'RB3025' }],
  ['SUN-OAK-01', 'شمسية أوكلي هولبروك', 'Oakley Holbrook Sunglasses', 'sunglasses', 'Oakley', 1290, 820, 4, 2, { color: 'أسود/أزرق', size: '55-18-140', material: 'أو ماتر', gender: 'men', model: 'OO9102' }],
  ['SUN-POL-01', 'شمسية بوليس رياضية', 'Police Sport Sunglasses', 'sunglasses', 'Police', 890, 540, 6, 2, { color: 'أسود', size: '60-15-135', material: 'نايلون', gender: 'men' }],
  ['SUN-GUC-02', 'شمسية غوتشي كبيرة', 'Gucci Oversized Sunglasses', 'sunglasses', 'Gucci', 2100, 1400, 2, 1, { color: 'بني/ذهبي', size: '56-18-140', material: 'أسيتات', gender: 'women' }],
  ['SUN-KID-01', 'شمسية أطفال', 'Kids Sunglasses', 'sunglasses', 'Kids Vision', 190, 95, 10, 3, { color: 'أحمر', size: '46-15-125', material: 'TR90', gender: 'kids' }],
  ['SUN-CLIP-01', 'كليب شمسي للإطار', 'Clip-on Sun Lens', 'sunglasses', 'ClipPro', 150, 70, 15, 5, { color: 'رمادي', gender: 'unisex' }],

  // --- Lenses -------------------------------------------------------------
  ['LNS-SV-156', 'عدسة مفردة 1.56', 'Single Vision Lens 1.56', 'lenses', 'Essilor', 180, 85, 40, 10, { material: 'CR-39' }],
  ['LNS-SV-160', 'عدسة مفردة 1.60', 'Single Vision Lens 1.60', 'lenses', 'Essilor', 260, 130, 30, 10, { material: 'MR-8' }],
  ['LNS-SV-167', 'عدسة مفردة 1.67', 'Single Vision Lens 1.67', 'lenses', 'Hoya', 420, 240, 18, 6, { material: 'MR-10' }],
  ['LNS-PRG-160', 'عدسة متعددة البؤر 1.60', 'Progressive Lens 1.60', 'lenses', 'Zeiss', 950, 600, 10, 4, { material: 'MR-8' }],
  ['LNS-PHG-156', 'عدسة متغيرة اللون 1.56', 'Photochromic Lens 1.56', 'lenses', 'Hoya', 520, 300, 12, 4, { material: 'CR-39' }],
  ['LNS-BLU-160', 'عدسة حماية الضوء الأزرق', 'Blue Light Filter Lens 1.60', 'lenses', 'Essilor', 380, 200, 20, 6, { material: 'MR-8' }],
  ['LNS-POL-156', 'عدسة شمسية مستقطبة', 'Polarized Sun Lens 1.56', 'lenses', 'Essilor', 320, 170, 14, 5, { material: 'CR-39' }],
  // --- Contact lenses -----------------------------------------------------
  ['CL-ACU-01', 'عدسات أكيوفيو أواسيس (٦ قطع)', 'Acuvue Oasys (6 pcs)', 'contact_lenses', 'Acuvue', 240, 150, 25, 8],
  ['CL-AIR-01', 'عدسات إير أوبتكس (٦ قطع)', 'Air Optix (6 pcs)', 'contact_lenses', 'Alcon', 210, 130, 20, 8],
  ['CL-DAI-01', 'عدسات ديلي فريش (٣٠ قطعة)', 'Dailies FreshLook (30 pcs)', 'contact_lenses', 'Alcon', 330, 210, 15, 6],
  ['CL-BIO-01', 'عدسات بيوترو يومية (٣٠ قطعة)', 'Biotrue ONEday (30 pcs)', 'contact_lenses', 'Bausch & Lomb', 350, 225, 12, 5],
  // --- Solutions & accessories -------------------------------------------
  ['SOL-OPT-01', 'محلول عدسات ٣٦٠ مل', 'Contact Lens Solution 360ml', 'solutions', 'Opti-Free', 65, 35, 40, 12],
  ['SOL-DRO-01', 'قطرة مرطبة للعين', 'Lubricating Eye Drops', 'solutions', 'Systane', 45, 22, 50, 15],
  ['SOL-SPR-01', 'سبراي تنظيف النظارات', 'Lens Cleaning Spray', 'solutions', 'Opti-Free', 35, 15, 60, 20],
  ['ACC-CSE-01', 'علبة نظارات جلدية', 'Leather Glasses Case', 'accessories', 'OptiCare', 55, 25, 45, 15],
  ['ACC-CLN-01', 'قماش تنظيف مايكروفايبر', 'Microfiber Cleaning Cloth', 'accessories', 'OptiCare', 15, 5, 100, 25],
  ['ACC-CHN-01', 'سلسلة نظارات', 'Glasses Chain', 'accessories', 'OptiCare', 40, 18, 30, 10],
  ['ACC-CRD-01', 'حبل نظارات رياضي', 'Sports Eyewear Strap', 'accessories', 'OptiCare', 50, 22, 25, 10],
  // --- Services (no stock) ------------------------------------------------
  ['SRV-EXM-01', 'فحص نظر شامل', 'Comprehensive Eye Exam', 'services', 'OptiCare', 120, 0, 0, 0],
  ['SRV-FIT-01', 'تركيب وتعديل النظارة', 'Frame Fitting & Adjustment', 'services', 'OptiCare', 60, 0, 0, 0],
  ['SRV-REP-01', 'صيانة وإصلاح نظارات', 'Eyewear Repair Service', 'services', 'OptiCare', 80, 0, 0, 0],
];

const LOCATION_BY_CATEGORY: Record<ProductCategory, string> = {
  frames: 'رف الإطارات A',
  sunglasses: 'رف النظارات الشمسية B',
  lenses: 'خزانة العدسات C',
  contact_lenses: 'ثلاجة العدسات D',
  solutions: 'رف المحاليل E',
  accessories: 'رف الإكسسوارات F',
  services: '—',
};

function demoProducts(suppliers: Supplier[]): Product[] {
  const created = atNoon(addDays(new Date(), -300));
  return PRODUCT_SEED.map((row, index) => {
    const [sku, nameAr, nameEn, category, brand, price, cost, quantity, minQuantity, extra] = row;
    return {
      id: `prd_${sku}`,
      sku,
      barcode: `62${String(1000000 + index * 137).padStart(8, '0')}`,
      nameAr,
      nameEn,
      category,
      brand,
      model: extra?.model ?? '',
      color: extra?.color ?? '',
      size: extra?.size ?? '',
      material: extra?.material ?? '',
      gender: extra?.gender,
      price,
      cost,
      quantity,
      minQuantity,
      supplierId: category === 'services' ? undefined : suppliers[index % suppliers.length].id,
      location: LOCATION_BY_CATEGORY[category],
      warrantyMonths: category === 'frames' || category === 'sunglasses' ? 12 : 0,
      active: true,
      notes: '',
      createdAt: created,
      updatedAt: created,
    } satisfies Product;
  });
}

/* ------------------------------- Customers --------------------------------- */

type CustomerSeed = [
  name: string,
  nameEn: string,
  phone: string,
  gender: 'male' | 'female',
  city: string,
  birthYear: number,
  insurance?: string,
];

const CUSTOMER_SEED: CustomerSeed[] = [
  ['أحمد محمد العتيبي', 'Ahmed M. Alotaibi', '0551234567', 'male', 'الرياض', 1985],
  ['سارة عبدالله القحطاني', 'Sarah A. Alqahtani', '0537654321', 'female', 'الرياض', 1992, 'بوبا العربية'],
  ['خالد سعد الدوسري', 'Khalid S. Aldosari', '0509876543', 'male', 'جدة', 1978, 'التعاونية'],
  ['نورة فهد الشمري', 'Noura F. Alshammari', '0566112233', 'female', 'الرياض', 1996],
  ['محمد علي الحربي', 'Mohammed A. Alharbi', '0553344556', 'male', 'الدمام', 1981, 'بوبا العربية'],
  ['فاطمة يوسف الزهراني', 'Fatima Y. Alzahrani', '0544455667', 'female', 'مكة', 1969],
  ['عبدالعزيز ناصر الغامدي', 'Abdulaziz N. Alghamdi', '0577788990', 'male', 'الرياض', 1990],
  ['هيا تركي المطيري', 'Haya T. Almutairi', '0555566778', 'female', 'الرياض', 2001],
  ['سلطان راشد السبيعي', 'Sultan R. Alsubaie', '0533322110', 'male', 'الخبر', 1975, 'ملاذ للتأمين'],
  ['ريم ماجد العسيري', 'Reem M. Alasiri', '0562211445', 'female', 'أبها', 1988],
  ['ياسر إبراهيم البلوي', 'Yasser I. Albalawi', '0559900112', 'male', 'تبوك', 1983],
  ['لينا حسن الأنصاري', 'Lina H. Alansari', '0548877665', 'female', 'الرياض', 2010],
];

function demoCustomers(): Customer[] {
  return CUSTOMER_SEED.map((row, index) => {
    const [name, nameEn, phone, gender, city, birthYear, insurance] = row;
    const createdAt = atNoon(addDays(new Date(), -(360 - index * 24)));
    return {
      id: `cus_${1000 + index}`,
      code: `CUS-${1000 + index}`,
      name,
      nameEn,
      phone,
      gender,
      city,
      address: `${city}، المملكة العربية السعودية`,
      birthDate: atNoon(`${birthYear}-0${between(1, 9)}-${String(between(1, 28)).padStart(2, '0')}`),
      occupation: gender === 'male' ? 'موظف' : 'ربة منزل',
      insuranceCompany: insurance,
      insuranceNumber: insurance ? `INS-${between(100000, 999999)}` : undefined,
      loyaltyPoints: between(0, 240),
      notes: '',
      createdAt,
      updatedAt: createdAt,
    } satisfies Customer;
  });
}

/* ----------------------------- Prescriptions ------------------------------- */

const DOCTORS = ['د. هدى الزهراني', 'د. سامي القحطاني', 'د. ماجد العنزي'];

type RxSeed = [
  customerIndex: number,
  type: Prescription['type'],
  od: [number, number, number, number | null],
  os: [number, number, number, number | null],
  pd: number,
  daysAgo: number,
  diagnosis: string,
];

const RX_SEED: RxSeed[] = [
  [0, 'distance', [-1.25, -0.5, 90, null], [-1.0, -0.75, 85, null], 63, 25, 'قصر نظر بسيط'],
  [1, 'progressive', [-2.5, -0.75, 180, 2.0], [-2.25, -1.0, 175, 2.0], 62, 60, 'قصر نظر مع طول نظر للقراءة'],
  [2, 'distance', [-3.75, -1.25, 10, null], [-4.0, -1.5, 170, null], 66, 120, 'قصر نظر متوسط'],
  [3, 'reading', [0.75, 0, 0, 1.75], [0.5, -0.25, 90, 1.75], 60, 40, 'طول نظر للقراءة'],
  [4, 'contact', [-2.0, -0.75, 95, null], [-2.25, -0.5, 80, null], 64, 15, 'قصر نظر - عدسات لاصقة'],
  [5, 'progressive', [1.5, -0.5, 45, 2.25], [1.75, -0.75, 135, 2.25], 61, 200, 'طول نظر مع شيخوخة عدسة'],
  [6, 'distance', [-0.75, 0, 0, null], [-1.25, -0.5, 100, null], 65, 8, 'قصر نظر بسيط'],
  [7, 'reading', [0, 0, 0, 1.5], [0, 0, 0, 1.5], 59, 95, 'إجهاد بصري'],
  [8, 'bifocal', [2.25, -0.5, 15, 2.0], [2.0, -0.75, 165, 2.0], 67, 150, 'طول نظر مع قصر نظر للقراءة'],
  [11, 'distance', [-1.5, -0.25, 60, null], [-1.75, -0.5, 120, null], 56, 5, 'قصر نظر بسيط - طفل'],
];

function demoPrescriptions(customers: Customer[]): Prescription[] {
  return RX_SEED.map((row, index) => {
    const [customerIndex, type, od, os, pd, daysAgo, diagnosis] = row;
    const customer = customers[customerIndex];
    const date = atNoon(addDays(new Date(), -daysAgo));
    return {
      id: `rx_${700 + index}`,
      number: nextNumber('RX', 700 + index),
      customerId: customer.id,
      date,
      type,
      doctorName: DOCTORS[index % DOCTORS.length],
      clinic: index % 2 === 0 ? 'عيادة البصيرة للعيون' : 'مركز النور الطبي',
      od: { sph: od[0], cyl: od[1], axis: od[2], add: od[3], va: index % 3 === 0 ? '6/9' : '6/6' },
      os: { sph: os[0], cyl: os[1], axis: os[2], add: os[3], va: index % 3 === 0 ? '6/12' : '6/6' },
      pd,
      pdNear: type === 'progressive' ? pd - 3 : null,
      segmentHeight: type === 'progressive' ? 18 : null,
      diagnosis,
      notes: index % 3 === 0 ? 'يُنصح بمراجعة الطبيب بعد سنة' : '',
      nextVisit: atNoon(addDays(new Date(), 365 - daysAgo)),
      createdAt: date,
    } satisfies Prescription;
  });
}

/* -------------------------------- Invoices --------------------------------- */

const SELLERS = [
  { id: 'usr_cashier', name: 'فهد المطيري' },
  { id: 'usr_manager', name: 'منى العبدالله' },
  { id: 'usr_admin', name: 'عبدالله الشمري' },
];

const PAYMENT_METHODS: Invoice['paymentMethod'][] = [
  'cash',
  'cash',
  'cash',
  'card',
  'card',
  'transfer',
  'credit',
  'insurance',
];

const LENS_COATINGS = [
  ['antiReflective'],
  ['antiReflective', 'scratchResistant'],
  ['antiReflective', 'blueLight'],
  ['antiReflective', 'uv400', 'scratchResistant'],
];

function pickDayOffsets(): number[] {
  const offsets: number[] = [0, 0, 1, 1, 2];
  for (let day = 3; day < 118 && offsets.length < 46; day += 1) {
    if (random() < 0.42) offsets.push(day);
  }
  return offsets;
}

interface InvoiceBuild {
  invoices: Invoice[];
  movements: StockMovement[];
}

function demoInvoices(customers: Customer[], products: Product[], settings: AppSettings): InvoiceBuild {
  const invoices: Invoice[] = [];
  const movements: StockMovement[] = [];
  const sellable = products.filter((p) => p.category !== 'services');
  const offsets = pickDayOffsets();
  let counter = settings.counters.invoices;
  let movementCounter = 0;

  offsets.forEach((daysAgo, index) => {
    const perDay = daysAgo === 0 ? 2 + Math.floor(random() * 2) : 1 + Math.floor(random() * 2);
    for (let n = 0; n < perDay; n += 1) {
      counter += 1;
      const seller = SELLERS[Math.floor(random() * SELLERS.length)];
      const date = new Date(addDays(new Date(), -daysAgo));
      date.setHours(10 + Math.floor(random() * 11), Math.floor(random() * 60), 0, 0);

      const lineCount = 1 + Math.floor(random() * 3);
      const used = new Set<string>();
      const items: Invoice['items'] = [];
      for (let l = 0; l < lineCount; l += 1) {
        const product = pick(sellable);
        if (used.has(product.id)) continue;
        used.add(product.id);
        const needsLens = product.category === 'frames';
        const quantity = product.category === 'accessories' || product.category === 'solutions' ? 1 + Math.floor(random() * 2) : 1;
        const upgradePrice = needsLens ? pick([180, 260, 380, 520]) : 0;
        const listPrice = product.price + upgradePrice;
        const discount = random() < 0.25 ? round2(listPrice * (random() < 0.5 ? 0.05 : 0.1)) : 0;
        items.push({
          id: uid('item'),
          productId: product.id,
          sku: product.sku,
          nameAr: product.nameAr,
          nameEn: product.nameEn,
          category: product.category,
          quantity,
          unitPrice: round2(listPrice - discount),
          listPrice,
          discount,
          unitCost: product.cost,
          lensOptions: needsLens
            ? {
                lensType: 'singleVision',
                index: pick(['1.56', '1.60', '1.67']),
                coating: pick(LENS_COATINGS),
                tint: '',
                upgradePrice,
              }
            : undefined,
        });
      }
      if (items.length === 0) continue;

      const invoiceDiscount = random() < 0.18 ? between(20, 120) : 0;
      const totals = computeInvoiceTotals({
        lines: items.map((item) => ({ quantity: item.quantity, unitPrice: item.unitPrice })),
        discount: invoiceDiscount,
        taxRate: settings.taxRate,
        pricesIncludeTax: settings.pricesIncludeTax,
      });

      const method = pick(PAYMENT_METHODS);
      const payRoll = random();
      const paid = method === 'credit' && payRoll > 0.4 ? 0 : payRoll > 0.8 ? round2(totals.total * 0.4) : totals.total;
      const withCustomer = random() < 0.78;
      const customer = withCustomer ? customers[Math.floor(random() * customers.length)] : undefined;

      invoices.push({
        id: `inv_${counter}`,
        number: nextNumber(settings.invoicePrefix, counter),
        date: date.toISOString(),
        createdAt: date.toISOString(),
        customerId: customer?.id,
        customerName: customer?.name ?? 'عميل نقدي',
        customerPhone: customer?.phone,
        items,
        subtotal: totals.subtotal,
        discount: totals.discount,
        taxRate: settings.taxRate,
        taxAmount: totals.taxAmount,
        total: totals.total,
        paid: Math.min(paid, totals.total),
        payments:
          paid > 0
            ? [
                {
                  id: uid('pay'),
                  date: date.toISOString(),
                  amount: Math.min(paid, totals.total),
                  method,
                  userId: seller.id,
                },
              ]
            : [],
        paymentMethod: method,
        status: invoiceStatusFor(totals.total, Math.min(paid, totals.total)),
        insuranceCompany: method === 'insurance' ? customer?.insuranceCompany ?? 'بوبا العربية' : undefined,
        notes: '',
        refunded: 0,
        userId: seller.id,
        userName: seller.name,
      });

      // Stock movements for the most recent invoices only (keeps the log readable).
      if (index < 16) {
        items.forEach((item) => {
          movementCounter += 1;
          const product = products.find((p) => p.id === item.productId);
          if (!product) return;
          const previousQty = product.quantity + item.quantity;
          movements.push({
            id: `mv_${counter}_${movementCounter}`,
            productId: item.productId,
            productName: product.nameAr,
            type: 'sale',
            quantity: -item.quantity,
            previousQty,
            newQty: product.quantity,
            reference: nextNumber(settings.invoicePrefix, counter),
            reason: '',
            userId: seller.id,
            userName: seller.name,
            date: date.toISOString(),
          });
        });
      }
    }
  });

  return { invoices, movements };
}

/* --------------------------------- Returns --------------------------------- */

const RETURN_REASONS = ['المقاس غير مناسب', 'تغيير الموديل', 'عيب في الإطار'];

function demoReturns(invoices: Invoice[], settings: AppSettings): ReturnRecord[] {
  const returns: ReturnRecord[] = [];
  const candidates = invoices.filter((invoice) => invoice.status === 'paid' && invoice.items.length > 0).slice(0, 2);
  candidates.forEach((invoice, index) => {
    const item = invoice.items[0];
    const amount = round2(item.unitPrice * item.quantity);
    const date = addDays(invoice.createdAt, 3 + index * 3).toISOString();
    const counter = settings.counters.returns + index + 1;
    invoice.refunded = round2(invoice.refunded + amount);
    if (invoice.refunded + 0.01 >= invoice.total) invoice.status = 'returned';
    returns.push({
      id: `ret_${counter}`,
      number: nextNumber(settings.returnPrefix, counter),
      invoiceId: invoice.id,
      invoiceNumber: invoice.number,
      date,
      lines: [
        {
          productId: item.productId,
          nameAr: item.nameAr,
          nameEn: item.nameEn,
          quantity: item.quantity,
          amount,
        },
      ],
      amount,
      refundMethod: 'cash',
      reason: RETURN_REASONS[index % RETURN_REASONS.length],
      userId: 'usr_manager',
      userName: 'منى العبدالله',
    });
  });
  return returns;
}

/* ------------------------------- Lab orders -------------------------------- */

type LabSeed = [
  customerIndex: number,
  rxIndex: number | null,
  orderType: LabOrder['orderType'],
  status: LabOrder['status'],
  lensType: string,
  lensIndex: string,
  daysAgo: number,
  total: number,
  deposit: number,
];

const LAB_SEED: LabSeed[] = [
  [0, 0, 'distance', 'ready', 'عدسة مفردة 1.56', '1.56', 4, 1030, 400],
  [1, 1, 'progressive', 'in_lab', 'عدسة متعددة البؤر 1.60', '1.60', 6, 1730, 600],
  [2, 2, 'distance', 'delivered', 'عدسة مفردة 1.67', '1.67', 21, 1340, 1340],
  [3, 3, 'reading', 'delivered', 'عدسة مفردة 1.56', '1.56', 30, 600, 600],
  [4, 4, 'lens_only', 'sent_to_lab', 'عدسة مفردة 1.60', '1.60', 2, 520, 200],
  [5, 5, 'progressive', 'received', 'عدسة متعددة البؤر 1.60', '1.60', 9, 2210, 800],
  [6, 6, 'sunglasses', 'draft', 'عدسة شمسية مستقطبة', '1.56', 1, 1290, 0],
  [8, 8, 'bifocal', 'cancelled', 'عدسة ثنائية البؤرة 1.56', '1.56', 40, 1490, 0],
];

const LAB_NAMES = ['معمل الرياض للعدسات', 'معمل الخليج البصري', 'معمل النخبة للعدسات'];

function demoLabOrders(customers: Customer[], prescriptions: Prescription[], settings: AppSettings): LabOrder[] {
  return LAB_SEED.map((row, index) => {
    const [customerIndex, rxIndex, orderType, status, lensType, lensIndex, daysAgo, total, deposit] = row;
    const customer = customers[customerIndex];
    const created = atNoon(addDays(new Date(), -daysAgo));
    const counter = settings.counters.labOrders + index + 1;
    const sentDate = status === 'draft' ? undefined : addDays(created, 1).toISOString();
    const receivedDate =
      status === 'received' || status === 'ready' || status === 'delivered'
        ? addDays(created, 4).toISOString()
        : undefined;
    const deliveredDate = status === 'delivered' ? addDays(created, 6).toISOString() : undefined;
    return {
      id: `lab_${counter}`,
      number: nextNumber(settings.labOrderPrefix, counter),
      customerId: customer.id,
      customerName: customer.name,
      customerPhone: customer.phone,
      prescriptionId: rxIndex === null ? undefined : prescriptions[rxIndex]?.id,
      orderType,
      frameDescription: orderType === 'lens_only' ? 'الإطار من العميل' : 'إطار راي بان أفياتور',
      lensType,
      lensIndex,
      coating: ['antiReflective', 'scratchResistant'],
      tint: orderType === 'sunglasses' ? 'رمادي ٨٥٪' : '',
      labName: LAB_NAMES[index % LAB_NAMES.length],
      sentDate,
      expectedDate: addDays(created, 5).toISOString(),
      receivedDate,
      deliveredDate,
      status,
      total,
      deposit,
      notes: '',
      technician: 'أ. طلال الغامدي',
      userId: 'usr_optometrist',
      userName: 'د. هدى الزهراني',
      createdAt: created,
      updatedAt: deliveredDate ?? receivedDate ?? sentDate ?? created,
    } satisfies LabOrder;
  });
}

/* -------------------------------- Purchases -------------------------------- */

type PurchaseSeed = [
  supplierIndex: number,
  daysAgo: number,
  status: Purchase['status'],
  skus: string[],
  paidRatio: number,
];

const PURCHASE_SEED: PurchaseSeed[] = [
  [0, 34, 'received', ['LNS-SV-156', 'LNS-SV-160', 'LNS-BLU-160'], 1],
  [4, 24, 'received', ['LNS-PRG-160', 'LNS-PHG-156'], 0.5],
  [1, 9, 'ordered', ['FRM-RB-01', 'FRM-POL-01'], 0],
  [3, 4, 'draft', ['SOL-OPT-01', 'ACC-CLN-01'], 0],
];

function demoPurchases(
  suppliers: Supplier[],
  products: Product[],
  settings: AppSettings,
): { purchases: Purchase[]; movements: StockMovement[] } {
  const purchases: Purchase[] = [];
  const movements: StockMovement[] = [];
  let movementCounter = 0;

  PURCHASE_SEED.forEach((row, index) => {
    const [supplierIndex, daysAgo, status, skus, paidRatio] = row;
    const supplier = suppliers[supplierIndex];
    const date = atNoon(addDays(new Date(), -daysAgo));
    const counter = settings.counters.purchases + index + 1;
    const number = nextNumber(settings.purchasePrefix, counter);

    const lines = skus
      .map((sku) => products.find((product) => product.sku === sku))
      .filter((product): product is Product => Boolean(product))
      .map((product) => {
        const quantity = product.category === 'lenses' ? between(10, 30) : between(4, 15);
        return {
          id: uid('pline'),
          productId: product.id,
          sku: product.sku,
          nameAr: product.nameAr,
          nameEn: product.nameEn,
          quantity,
          receivedQty: status === 'received' ? quantity : 0,
          unitCost: product.cost,
        };
      });

    const subtotal = round2(lines.reduce((sum, line) => sum + line.quantity * line.unitCost, 0));
    const taxAmount = round2(subtotal * (settings.taxRate / 100));
    const total = round2(subtotal + taxAmount);

    purchases.push({
      id: `pur_${counter}`,
      number,
      supplierId: supplier.id,
      supplierName: supplier.name,
      date,
      expectedDate: addDays(date, 7).toISOString(),
      receivedDate: status === 'received' ? addDays(date, 5).toISOString() : undefined,
      lines,
      subtotal,
      taxAmount,
      total,
      paid: round2(total * paidRatio),
      status,
      notes: '',
      userId: 'usr_manager',
      userName: 'منى العبدالله',
      createdAt: date,
    });

    if (status === 'received') {
      lines.forEach((line) => {
        movementCounter += 1;
        const product = products.find((p) => p.id === line.productId);
        if (!product) return;
        movements.push({
          id: `mv_pur_${counter}_${movementCounter}`,
          productId: line.productId,
          productName: product.nameAr,
          type: 'purchase',
          quantity: line.quantity,
          previousQty: Math.max(product.quantity - line.quantity, 0),
          newQty: product.quantity,
          reference: number,
          reason: supplier.name,
          userId: 'usr_manager',
          userName: 'منى العبدالله',
          date: addDays(date, 5).toISOString(),
        });
      });
    }
  });

  return { purchases, movements };
}

/* ------------------------------ Appointments ------------------------------- */

type AppointmentSeed = [
  customerIndex: number,
  dayOffset: number,
  time: string,
  durationMin: number,
  type: Appointment['type'],
  status: Appointment['status'],
];

const APPOINTMENT_SEED: AppointmentSeed[] = [
  [0, 0, '10:00', 30, 'eye_exam', 'confirmed'],
  [4, 0, '11:30', 30, 'fitting', 'confirmed'],
  [7, 0, '17:00', 20, 'delivery', 'scheduled'],
  [1, 1, '09:30', 45, 'eye_exam', 'confirmed'],
  [2, 2, '16:00', 30, 'followup', 'scheduled'],
  [9, 4, '12:00', 30, 'consultation', 'scheduled'],
  [10, 6, '18:30', 20, 'repair', 'scheduled'],
  [3, 9, '10:30', 45, 'eye_exam', 'scheduled'],
  [5, -2, '11:00', 30, 'followup', 'completed'],
  [6, -4, '15:30', 30, 'eye_exam', 'completed'],
  [8, -6, '13:00', 20, 'delivery', 'no_show'],
  [11, -9, '09:00', 30, 'eye_exam', 'cancelled'],
];

function demoAppointments(customers: Customer[]): Appointment[] {
  return APPOINTMENT_SEED.map((row, index) => {
    const [customerIndex, dayOffset, time, durationMin, type, status] = row;
    const customer = customers[customerIndex];
    const date = addDays(new Date(), dayOffset);
    return {
      id: `apt_${index + 1}`,
      customerId: customer.id,
      customerName: customer.name,
      phone: customer.phone,
      date: atNoon(date),
      time,
      durationMin,
      type,
      doctorName: DOCTORS[index % DOCTORS.length],
      status,
      notes: '',
      createdAt: atNoon(addDays(date, -7)),
    } satisfies Appointment;
  });
}

/* --------------------------- Stock adjustments ----------------------------- */

type MovementSeed = [
  sku: string,
  type: StockMovement['type'],
  quantity: number,
  reason: string,
  daysAgo: number,
];

const MOVEMENT_SEED: MovementSeed[] = [
  ['FRM-GUC-01', 'damage', -1, 'خدش أثناء العرض', 12],
  ['SOL-DRO-01', 'adjust', -2, 'تسوية جرد دوري', 7],
  ['ACC-CLN-01', 'in', 20, 'شراء نقدي من السوق', 20],
  ['LNS-SV-167', 'out', -3, 'استخدام داخلي في المعمل', 5],
  ['SUN-RB-01', 'damage', -1, 'كسر في العدسة', 26],
];

function demoAdjustmentMovements(products: Product[]): StockMovement[] {
  return MOVEMENT_SEED.flatMap((row, index) => {
    const [sku, type, quantity, reason, daysAgo] = row;
    const product = products.find((item) => item.sku === sku);
    if (!product) return [];
    const date = addDays(new Date(), -daysAgo);
    date.setHours(14, 30, 0, 0);
    return [
      {
        id: `mv_adj_${index + 1}`,
        productId: product.id,
        productName: product.nameAr,
        type,
        quantity,
        previousQty: Math.max(product.quantity - quantity, 0),
        newQty: product.quantity,
        reference: 'تسوية يدوية',
        reason,
        userId: 'usr_manager',
        userName: 'منى العبدالله',
        date: date.toISOString(),
      } satisfies StockMovement,
    ];
  });
}

/* --------------------------- Database assembly ----------------------------- */

/** Highest numeric part of a set of document numbers (used to seed counters). */
function maxCounter(numbers: string[], fallback: number): number {
  const values = numbers
    .map((number) => parseInt(number.replace(/[^\d]/g, ''), 10))
    .filter((value) => Number.isFinite(value));
  return values.length > 0 ? Math.max(...values) : fallback;
}

/** Builds the full demo database used on a fresh install / "load demo data". */
export function createDemoDatabase(): Database {
  const settings = defaultSettings();
  const suppliers = demoSellers();
  const products = demoProducts(suppliers);
  const customers = demoCustomers();
  const prescriptions = demoPrescriptions(customers);
  const { invoices, movements: saleMovements } = demoInvoices(customers, products, settings);
  const returns = demoReturns(invoices, settings);
  const labOrders = demoLabOrders(customers, prescriptions, settings);
  const { purchases, movements: purchaseMovements } = demoPurchases(suppliers, products, settings);
  const appointments = demoAppointments(customers);
  const stockMovements = [...saleMovements, ...purchaseMovements, ...demoAdjustmentMovements(products)].sort(
    (a, b) => b.date.localeCompare(a.date),
  );

  return {
    version: DB_VERSION,
    users: demoUsers(),
    customers,
    prescriptions,
    products,
    suppliers,
    invoices,
    returns,
    labOrders,
    purchases,
    appointments,
    stockMovements,
    settings: {
      ...settings,
      counters: {
        invoices: maxCounter(
          invoices.map((invoice) => invoice.number),
          settings.counters.invoices,
        ),
        prescriptions: maxCounter(
          prescriptions.map((prescription) => prescription.number),
          settings.counters.prescriptions,
        ),
        customers: maxCounter(
          customers.map((customer) => customer.code),
          settings.counters.customers,
        ),
        suppliers: maxCounter(
          suppliers.map((supplier) => supplier.code),
          settings.counters.suppliers,
        ),
        labOrders: maxCounter(
          labOrders.map((order) => order.number),
          settings.counters.labOrders,
        ),
        purchases: maxCounter(
          purchases.map((purchase) => purchase.number),
          settings.counters.purchases,
        ),
        returns: maxCounter(
          returns.map((item) => item.number),
          settings.counters.returns,
        ),
        stockMovements: stockMovements.length,
      },
    },
  };
}








