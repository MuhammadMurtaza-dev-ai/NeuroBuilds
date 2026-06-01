/**
 * Seed 10 fake Pakistan marketplace listings into Firestore.
 * Usage: node scripts/seed-listings.mjs <email> <password>
 *
 * Requires firebase package (already a project dep).
 */

import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, addDoc, Timestamp } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyCsBcgqaDwWRuilTuG6kfnSXcQcACxJC14',
  authDomain: 'neurobuilds-dea37.firebaseapp.com',
  projectId: 'neurobuilds-dea37',
  storageBucket: 'neurobuilds-dea37.firebasestorage.app',
  messagingSenderId: '946745015004',
  appId: '1:946745015004:web:288fe48c4f7e35fea7d219',
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const [email, password] = process.argv.slice(2);
if (!email || !password) {
  console.error('Usage: node scripts/seed-listings.mjs <email> <password>');
  process.exit(1);
}

console.log(`Signing in as ${email}…`);
await signInWithEmailAndPassword(auth, email, password);
console.log('Authenticated. Seeding listings…\n');

const daysAgo = (n) => Timestamp.fromDate(new Date(Date.now() - n * 86_400_000));

const listings = [
  {
    title: 'NVIDIA RTX 4060 Ti 8GB — Like New',
    description:
      'Barely used RTX 4060 Ti picked up 3 months ago. Bought for gaming but switching to workstation. Comes in original box with all accessories. No mining. Runs cool, stable.',
    price: 115000,
    negotiable: true,
    category: 'Components',
    condition: 'used',
    listingType: 'sell',
    images: [],
    country: 'Pakistan',
    location: 'Lahore, Punjab',
    sellerId: 'seed_user_1',
    sellerName: 'Ahmed Raza',
    sellerContact: '+92-300-1234567',
    views: 142,
    savedBy: [],
    status: 'active',
    tags: ['GPU', 'RTX 4060 Ti', 'NVIDIA', 'Gaming', 'Graphics Card'],
    specs: { VRAM: '8GB GDDR6X', TDP: '165W', Ports: '3x DP 1.4, 1x HDMI 2.1' },
    postedDate: daysAgo(2),
  },
  {
    title: 'AMD Ryzen 5 7600X Processor — Sealed Box',
    description:
      'Sealed, unopened Ryzen 5 7600X. Got it as a gift but already have a build. 6 cores / 12 threads, 5.3GHz boost. AM5 socket. Full warranty intact.',
    price: 60000,
    negotiable: false,
    category: 'Components',
    condition: 'new',
    listingType: 'sell',
    images: [],
    country: 'Pakistan',
    location: 'Karachi, Sindh',
    sellerId: 'seed_user_2',
    sellerName: 'Bilal Khan',
    sellerContact: '+92-321-9876543',
    views: 89,
    savedBy: [],
    status: 'active',
    tags: ['CPU', 'AMD', 'Ryzen 5', '7600X', 'AM5'],
    specs: { Cores: '6C / 12T', Boost: '5.3 GHz', Socket: 'AM5', TDP: '105W' },
    postedDate: daysAgo(5),
  },
  {
    title: 'ASUS ROG Strix B650E-F Gaming ATX Motherboard',
    description:
      'Used for 6 months in a personal build. Switching to X670E. Board is in perfect condition — no bent pins, all slots working. PCIe 5.0, DDR5, WiFi 6E onboard.',
    price: 72000,
    negotiable: true,
    category: 'Components',
    condition: 'used',
    listingType: 'sell',
    images: [],
    country: 'Pakistan',
    location: 'Islamabad, ICT',
    sellerId: 'seed_user_3',
    sellerName: 'Usman Tariq',
    sellerContact: '+92-333-5556677',
    views: 55,
    savedBy: [],
    status: 'active',
    tags: ['Motherboard', 'ASUS', 'ROG', 'B650E', 'AM5', 'DDR5'],
    specs: { Socket: 'AM5', Chipset: 'B650E', Form: 'ATX', RAM: 'DDR5', WiFi: '6E' },
    postedDate: daysAgo(7),
  },
  {
    title: 'Corsair Vengeance DDR5 32GB (2×16GB) 6000MHz Kit',
    description:
      '32GB DDR5-6000 CL30 kit. Only 2 months old, selling because upgrading to 64GB. XMP profile works perfectly on ASUS and MSI boards. Price is firm.',
    price: 28000,
    negotiable: false,
    category: 'Components',
    condition: 'used',
    listingType: 'sell',
    images: [],
    country: 'Pakistan',
    location: 'Lahore, Punjab',
    sellerId: 'seed_user_4',
    sellerName: 'Sara Malik',
    sellerContact: '+92-345-2223344',
    views: 210,
    savedBy: [],
    status: 'active',
    tags: ['RAM', 'DDR5', 'Corsair', 'Vengeance', '32GB', '6000MHz'],
    specs: { Capacity: '32GB (2×16)', Speed: 'DDR5-6000', Latency: 'CL30', Voltage: '1.35V' },
    postedDate: daysAgo(1),
  },
  {
    title: 'Corsair RM850x 850W 80+ Gold Fully Modular PSU',
    description:
      'Excellent condition PSU from a build I recently upgraded. About 1 year old. Zero coil whine, all cables included. 80+ Gold rated, fully modular.',
    price: 22000,
    negotiable: true,
    category: 'Components',
    condition: 'used',
    listingType: 'sell',
    images: [],
    country: 'Pakistan',
    location: 'Rawalpindi, Punjab',
    sellerId: 'seed_user_5',
    sellerName: 'Hassan Iftikhar',
    sellerContact: '+92-300-7654321',
    views: 67,
    savedBy: [],
    status: 'active',
    tags: ['PSU', 'Power Supply', 'Corsair', '850W', 'Gold', 'Modular'],
    specs: { Wattage: '850W', Rating: '80+ Gold', Type: 'Fully Modular', Fan: '135mm' },
    postedDate: daysAgo(10),
  },
  {
    title: 'Samsung 980 Pro 1TB NVMe PCIe 4.0 SSD',
    description:
      'Used in a PS5 for 8 months, then moved to PC. Fully compatible with PCIe 4.0 M.2 slots. Read 7000 MB/s, Write 5000 MB/s. No issues whatsoever.',
    price: 14000,
    negotiable: true,
    category: 'Components',
    condition: 'used',
    listingType: 'sell',
    images: [],
    country: 'Pakistan',
    location: 'Karachi, Sindh',
    sellerId: 'seed_user_6',
    sellerName: 'Zara Hussain',
    sellerContact: '+92-311-8889900',
    views: 305,
    savedBy: [],
    status: 'active',
    tags: ['SSD', 'NVMe', 'Samsung', '980 Pro', 'PCIe 4.0', '1TB'],
    specs: { Capacity: '1TB', Interface: 'PCIe 4.0 NVMe', Read: '7000 MB/s', Write: '5000 MB/s' },
    postedDate: daysAgo(3),
  },
  {
    title: 'MSI MAG274QRF-QD 27" 1440p 165Hz IPS Monitor',
    description:
      '27-inch QHD gaming monitor with Quantum Dot IPS panel, 165Hz refresh rate, and 1ms response. Bought 6 months ago. Comes with original stand and all cables.',
    price: 58000,
    negotiable: true,
    category: 'Monitors',
    condition: 'used',
    listingType: 'sell',
    images: [],
    country: 'Pakistan',
    location: 'Lahore, Punjab',
    sellerId: 'seed_user_7',
    sellerName: 'Faisal Sheikh',
    sellerContact: '+92-322-1112233',
    views: 180,
    savedBy: [],
    status: 'active',
    tags: ['Monitor', 'MSI', '1440p', '165Hz', 'IPS', 'Gaming Monitor'],
    specs: { Panel: 'IPS (QD)', Resolution: '2560×1440', Refresh: '165Hz', Response: '1ms', Ports: 'DP 1.2, HDMI 2.0' },
    postedDate: daysAgo(4),
  },
  {
    title: 'NZXT H510 Mid Tower Case — Matte Black',
    description:
      'Clean NZXT H510 with tempered glass side panel. Barely used for 3 months, switching to a full-tower. No scratches, all dust filters intact. Willing to exchange for NZXT H710.',
    price: 12000,
    negotiable: false,
    category: 'Components',
    condition: 'used',
    listingType: 'exchange',
    images: [],
    country: 'Pakistan',
    location: 'Faisalabad, Punjab',
    sellerId: 'seed_user_8',
    sellerName: 'Imran Chaudhry',
    sellerContact: '+92-303-6667788',
    views: 43,
    savedBy: [],
    status: 'active',
    tags: ['Case', 'NZXT', 'H510', 'Mid Tower', 'Tempered Glass'],
    specs: { Type: 'Mid Tower', 'GPU Clearance': '381mm', 'Radiator': '240mm top', Material: 'Steel + TG' },
    postedDate: daysAgo(8),
  },
  {
    title: 'Complete Gaming PC Bundle — i7-12700K + RTX 3070 + 16GB DDR4',
    description:
      'Full system for sale as a bundle only. Specs: Intel i7-12700K, MSI RTX 3070 Gaming X Trio, 16GB Corsair 3600MHz DDR4, MSI Z690 Carbon, 1TB Samsung 970 EVO, Corsair 750W Gold, NZXT H510.',
    price: 250000,
    negotiable: true,
    category: 'Components',
    condition: 'used',
    listingType: 'sell',
    images: [],
    country: 'Pakistan',
    location: 'Multan, Punjab',
    sellerId: 'seed_user_9',
    sellerName: 'Kamran Ali',
    sellerContact: '+92-301-4445566',
    views: 520,
    savedBy: [],
    status: 'active',
    tags: ['PC Bundle', 'Gaming PC', 'i7', 'RTX 3070', 'Complete Build'],
    specs: { CPU: 'i7-12700K', GPU: 'RTX 3070 8GB', RAM: '16GB DDR4-3600', Storage: '1TB NVMe', PSU: '750W Gold' },
    postedDate: daysAgo(6),
  },
  {
    title: 'Looking for: RTX 4070 Super — Islamabad/Rawalpindi',
    description:
      'Wanted — RTX 4070 Super in good working condition. Prefer ASUS, MSI, or Gigabyte AERO/GAMING variant. Can pay up to 130,000 PKR cash. Location: Islamabad or RWP only.',
    price: 130000,
    negotiable: true,
    category: 'Components',
    condition: 'used',
    listingType: 'buy',
    images: [],
    country: 'Pakistan',
    location: 'Islamabad, ICT',
    sellerId: 'seed_user_10',
    sellerName: 'Naveed Iqbal',
    sellerContact: '+92-335-9990011',
    views: 28,
    savedBy: [],
    status: 'active',
    tags: ['Wanted', 'RTX 4070 Super', 'NVIDIA', 'GPU', 'Buy'],
    specs: { Budget: '130,000 PKR', 'Preferred Brands': 'ASUS / MSI / Gigabyte', Condition: 'Used OK' },
    postedDate: daysAgo(1),
  },
];

const db_col = collection(db, 'listings');

let success = 0;
for (const listing of listings) {
  try {
    const ref = await addDoc(db_col, listing);
    console.log(`✓ [${++success}/10] "${listing.title.slice(0, 50)}" → ${ref.id}`);
  } catch (err) {
    console.error(`✗ Failed: ${listing.title}`, err.message);
  }
}

console.log(`\nDone — ${success}/10 listings seeded to Pakistan.`);
process.exit(0);
