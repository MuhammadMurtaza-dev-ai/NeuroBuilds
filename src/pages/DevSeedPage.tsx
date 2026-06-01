import { useState } from 'react';
import { collection, addDoc, Timestamp } from 'firebase/firestore';
import { db } from '../Firebase';

const SEED_THREADS = [
  {
    title: 'My first PC build — Ryzen 5 7600X + RTX 4070 Super (Budget 150k PKR)',
    body: 'Finally pulled the trigger on my first build after months of lurking. Went with:\n\n- CPU: Ryzen 5 7600X\n- GPU: MSI RTX 4070 Super Gaming X\n- Mobo: MSI MAG B650 Tomahawk\n- RAM: 32GB DDR5-6000 Corsair Vengeance\n- Storage: 1TB Samsung 980 Pro\n- PSU: Corsair RM850x\n- Case: Fractal Torrent Compact\n\nPosting temps and benchmarks once it\'s up. Anyone else rocking this combo?',
    authorId: 'seed_user_1', authorName: 'Ahmed Raza',
    country: 'Pakistan', category: 'builds',
    upvoteCount: 24, upvotedBy: [], downvotedBy: [], replyCount: 7,
    createdAt: Timestamp.fromDate(new Date(Date.now() - 2 * 86_400_000)),
  },
  {
    title: 'RTX 4060 vs RX 7600 — Which one to buy in Pakistan right now?',
    body: 'Looking at both cards for 1080p gaming. RTX 4060 is around 80k PKR and RX 7600 is around 65k. The price difference is significant but DLSS 3 on the 4060 sounds tempting. Anyone have real-world experience with both in local temps (45°C+)?',
    authorId: 'seed_user_2', authorName: 'Bilal Khan',
    country: 'Pakistan', category: 'hardware',
    upvoteCount: 31, upvotedBy: [], downvotedBy: [], replyCount: 15,
    createdAt: Timestamp.fromDate(new Date(Date.now() - 1 * 86_400_000)),
  },
  {
    title: 'Custom loop for i9-13900K — temps dropped 18°C!',
    body: 'Moved from a 360mm AIO to a custom loop last week. Components:\n\n- EK Quantum CPU block\n- 360mm radiator (front) + 240mm (top)\n- Corsair XD5 pump/res combo\n- EK-CoolStream PE 360 + 240\n\nIdle: 38°C → 24°C\nCinebench R23: 92°C → 74°C\n\nFull write-up with photos coming soon. Happy to answer questions.',
    authorId: 'seed_user_3', authorName: 'Usman Tariq',
    country: 'Pakistan', category: 'loops',
    upvoteCount: 56, upvotedBy: [], downvotedBy: [], replyCount: 22,
    createdAt: Timestamp.fromDate(new Date(Date.now() - 3 * 86_400_000)),
  },
  {
    title: 'Windows 11 stuttering with Ryzen — fix inside',
    body: 'If you\'re on Ryzen 5000/7000 and seeing random stutters in games, try these:\n\n1. Disable Xbox Game Bar (Settings → Gaming → Xbox Game Bar)\n2. Disable HPET in Device Manager\n3. Set power plan to "Ryzen Balanced" not "High Performance"\n4. Update chipset drivers from AMD directly (not Windows Update)\n\nFixed my stutters in CS2 and Valorant completely. Share if this helps you.',
    authorId: 'seed_user_4', authorName: 'Sara Malik',
    country: 'Pakistan', category: 'software',
    upvoteCount: 88, upvotedBy: [], downvotedBy: [], replyCount: 34,
    createdAt: Timestamp.fromDate(new Date(Date.now() - 5 * 86_400_000)),
  },
  {
    title: 'WTB: RTX 4070 Ti Super — Karachi only',
    body: 'Looking to buy RTX 4070 Ti Super in Karachi. Budget around 140k-155k PKR. Prefer ASUS or MSI variant. Must have box and original receipt. Not interested in shipped items — in-person meetup only at a public place.',
    authorId: 'seed_user_5', authorName: 'Hassan Iftikhar',
    country: 'Pakistan', category: 'marketplace',
    upvoteCount: 5, upvotedBy: [], downvotedBy: [], replyCount: 8,
    createdAt: Timestamp.fromDate(new Date(Date.now() - 6 * 3_600_000)),
  },
  {
    title: 'B650 vs X670 — is the price difference worth it for gaming?',
    body: 'Planning an AM5 build and can\'t decide between B650 and X670. For pure gaming (no streaming, no content creation), is the X670E worth the extra 15-20k PKR? I don\'t need PCIe 5.0 for storage since I\'m sticking to PCIe 4.0 NVMe.',
    authorId: 'seed_user_6', authorName: 'Zara Hussain',
    country: 'Pakistan', category: 'hardware',
    upvoteCount: 19, upvotedBy: [], downvotedBy: [], replyCount: 11,
    createdAt: Timestamp.fromDate(new Date(Date.now() - 4 * 86_400_000)),
  },
  {
    title: 'DDR5 XMP not posting at rated speed — troubleshooting guide',
    body: 'If your DDR5 kit isn\'t booting at XMP speeds, here\'s what worked for me:\n\n1. Start at JEDEC (4800MHz) and confirm it boots\n2. Enable EXPO/XMP in BIOS — if it fails, don\'t panic\n3. Try relaxing secondary timings (tRFC is often the culprit)\n4. Update BIOS — AMD dropped AGESA updates that fix stability\n5. Try slots A2/B2 first (check your mobo manual)\n\nGot my Corsair 6000 CL30 stable after following step 4.',
    authorId: 'seed_user_7', authorName: 'Faisal Sheikh',
    country: 'Pakistan', category: 'software',
    upvoteCount: 42, upvotedBy: [], downvotedBy: [], replyCount: 18,
    createdAt: Timestamp.fromDate(new Date(Date.now() - 7 * 86_400_000)),
  },
  {
    title: 'Server rack build log — home lab in Lahore',
    body: 'Converting an old Supermicro 2U chassis into a home server. Running Proxmox VE, hosting a Plex server, Nextcloud, and a few Docker containers.\n\nSpecs:\n- Dual Xeon E5-2680v4 (28 cores total)\n- 128GB ECC DDR4\n- 4x 4TB WD Red NAS drives in RAID-10\n- 10GbE networking\n\nElectricity cost in Pakistan makes this tricky — keeping it on a smart plug and scheduling off-hours.',
    authorId: 'seed_user_8', authorName: 'Imran Chaudhry',
    country: 'Pakistan', category: 'builds',
    upvoteCount: 37, upvotedBy: [], downvotedBy: [], replyCount: 14,
    createdAt: Timestamp.fromDate(new Date(Date.now() - 9 * 86_400_000)),
  },
  {
    title: 'GPU prices in Pakistan — Aug 2025 market analysis',
    body: 'Compiled current prices from Computer Adda, Metro Cash & Carry, and online sellers:\n\n| GPU | Metro | Computer Adda | Grey Market |\n|-----|-------|---------------|-------------|\n| RTX 4060 | 82k | 78k | 68k |\n| RTX 4070 S | 135k | 128k | 115k |\n| RX 7600 | 67k | 63k | 55k |\n| RX 7700 XT | 98k | 92k | 82k |\n\nGrey market has no warranty — buy at your own risk. Metro prices include 1-year local warranty.',
    authorId: 'seed_user_9', authorName: 'Kamran Ali',
    country: 'Pakistan', category: 'marketplace',
    upvoteCount: 74, upvotedBy: [], downvotedBy: [], replyCount: 29,
    createdAt: Timestamp.fromDate(new Date(Date.now() - 2 * 86_400_000)),
  },
  {
    title: 'Water cooling a GPU for the first time — was it worth it?',
    body: 'Slapped an EK-Quantum Vector block on my RX 6900 XT after it was throttling at 110°C junction temp. Results:\n\nBefore: 110°C junction, 85°C edge, fans at 100%\nAfter: 72°C junction, 58°C edge, fans at 50% on my loop\n\nPerformance went up ~8% because it was thermal throttling. Noise dropped massively. Would recommend if you\'re keeping the card long-term.',
    authorId: 'seed_user_10', authorName: 'Naveed Iqbal',
    country: 'Pakistan', category: 'loops',
    upvoteCount: 61, upvotedBy: [], downvotedBy: [], replyCount: 19,
    createdAt: Timestamp.fromDate(new Date(Date.now() - 10 * 86_400_000)),
  },
  {
    title: 'Mini-ITX build in Cooler Master NR200P — 240W in 14L!',
    body: 'Just finished my first SFF build:\n\n- Ryzen 7 7700X\n- RX 7900 GRE\n- 32GB DDR5-6000\n- 2TB WD Black SN850X\n- SF850L PSU\n\nFits in a backpack. Temps are fine with the mesh panels — 75°C GPU, 80°C CPU under full load. The NR200P is incredibly builder-friendly for ITX.',
    authorId: 'seed_user_1', authorName: 'Ahmed Raza',
    country: 'Pakistan', category: 'builds',
    upvoteCount: 48, upvotedBy: [], downvotedBy: [], replyCount: 16,
    createdAt: Timestamp.fromDate(new Date(Date.now() - 11 * 86_400_000)),
  },
  {
    title: 'PSA: Avoid "Gaming" branded RAM — pay for CL30 DDR5',
    body: 'Just swapped from 5600MHz CL36 "Gaming" DDR5 to 6000MHz CL30 Corsair Vengeance. In latency-sensitive games (CS2, Valorant) I gained 12-15 FPS at 1080p on a Ryzen system. The infinity fabric frequency sync at 6000MHz (FCLK 2000) is the sweet spot for AM5. Don\'t cheap out on RAM timings.',
    authorId: 'seed_user_2', authorName: 'Bilal Khan',
    country: 'Pakistan', category: 'hardware',
    upvoteCount: 55, upvotedBy: [], downvotedBy: [], replyCount: 21,
    createdAt: Timestamp.fromDate(new Date(Date.now() - 8 * 86_400_000)),
  },
  {
    title: 'Looking for advice: GPU upgrade from GTX 1080 in 2025',
    body: 'Still rocking a GTX 1080 on a 1440p monitor and struggling with newer titles. Budget is around 80-90k PKR. I was looking at RTX 4060 but people say to wait for RTX 5060. Is the wait worth it or should I just pull the trigger now? I play mostly open-world RPGs.',
    authorId: 'seed_user_3', authorName: 'Usman Tariq',
    country: 'Pakistan', category: 'hardware',
    upvoteCount: 13, upvotedBy: [], downvotedBy: [], replyCount: 23,
    createdAt: Timestamp.fromDate(new Date(Date.now() - 12 * 3_600_000)),
  },
  {
    title: 'Corsair iCUE keeps crashing on Windows 11 — anyone else?',
    body: 'iCUE 5.x crashes every time I open it on my Windows 11 system. Tried reinstalling 3 times, clean boot, DDU for GPU drivers. Problem persists. My H150i RGB temp readings disappear when it crashes and my pump speed drops. Anyone found a fix? Thinking of switching to OpenRGB.',
    authorId: 'seed_user_4', authorName: 'Sara Malik',
    country: 'Pakistan', category: 'software',
    upvoteCount: 27, upvotedBy: [], downvotedBy: [], replyCount: 12,
    createdAt: Timestamp.fromDate(new Date(Date.now() - 1.5 * 86_400_000)),
  },
  {
    title: 'Selling my entire setup — moving abroad (Islamabad)',
    body: 'Relocating to UK in 3 weeks and need to sell everything. All items priced for quick sale:\n\n- RTX 4080 ASUS ROG: 200k\n- i9-13900K (delidded, LM): 95k\n- 64GB DDR5-5600: 48k\n- ASUS Z790 Hero: 85k\n- 4TB Samsung 990 Pro: 42k\n\nBundle discount available. Islamabad pickup only. DM me.',
    authorId: 'seed_user_5', authorName: 'Hassan Iftikhar',
    country: 'Pakistan', category: 'marketplace',
    upvoteCount: 33, upvotedBy: [], downvotedBy: [], replyCount: 17,
    createdAt: Timestamp.fromDate(new Date(Date.now() - 3 * 3_600_000)),
  },
];

const daysAgo = (n: number) => Timestamp.fromDate(new Date(Date.now() - n * 86_400_000));

const SEED_LISTINGS = [
  {
    title: 'NVIDIA RTX 4060 Ti 8GB — Like New',
    description: 'Barely used RTX 4060 Ti picked up 3 months ago. Bought for gaming but switching to workstation. Comes in original box with all accessories. No mining. Runs cool, stable.',
    price: 115000, negotiable: true, category: 'Components', condition: 'used', listingType: 'sell',
    images: [], country: 'Pakistan', location: 'Lahore, Punjab',
    sellerId: 'seed_user_1', sellerName: 'Ahmed Raza', sellerContact: '+92-300-1234567',
    views: 142, savedBy: [], status: 'active',
    tags: ['GPU', 'RTX 4060 Ti', 'NVIDIA', 'Gaming'],
    specs: { VRAM: '8GB GDDR6X', TDP: '165W', Ports: '3x DP 1.4, 1x HDMI 2.1' },
    postedDate: daysAgo(2),
  },
  {
    title: 'AMD Ryzen 5 7600X Processor — Sealed Box',
    description: 'Sealed, unopened Ryzen 5 7600X. Got it as a gift but already have a build. 6 cores / 12 threads, 5.3GHz boost. AM5 socket. Full warranty intact.',
    price: 60000, negotiable: false, category: 'Components', condition: 'new', listingType: 'sell',
    images: [], country: 'Pakistan', location: 'Karachi, Sindh',
    sellerId: 'seed_user_2', sellerName: 'Bilal Khan', sellerContact: '+92-321-9876543',
    views: 89, savedBy: [], status: 'active',
    tags: ['CPU', 'AMD', 'Ryzen 5', '7600X', 'AM5'],
    specs: { Cores: '6C / 12T', Boost: '5.3 GHz', Socket: 'AM5', TDP: '105W' },
    postedDate: daysAgo(5),
  },
  {
    title: 'ASUS ROG Strix B650E-F Gaming ATX Motherboard',
    description: 'Used for 6 months in a personal build. Switching to X670E. Board is in perfect condition — no bent pins, all slots working. PCIe 5.0, DDR5, WiFi 6E onboard.',
    price: 72000, negotiable: true, category: 'Components', condition: 'used', listingType: 'sell',
    images: [], country: 'Pakistan', location: 'Islamabad, ICT',
    sellerId: 'seed_user_3', sellerName: 'Usman Tariq', sellerContact: '+92-333-5556677',
    views: 55, savedBy: [], status: 'active',
    tags: ['Motherboard', 'ASUS', 'ROG', 'B650E', 'AM5', 'DDR5'],
    specs: { Socket: 'AM5', Chipset: 'B650E', Form: 'ATX', RAM: 'DDR5', WiFi: '6E' },
    postedDate: daysAgo(7),
  },
  {
    title: 'Corsair Vengeance DDR5 32GB (2×16GB) 6000MHz Kit',
    description: '32GB DDR5-6000 CL30 kit. Only 2 months old, selling because upgrading to 64GB. XMP profile works perfectly on ASUS and MSI boards.',
    price: 28000, negotiable: false, category: 'Components', condition: 'used', listingType: 'sell',
    images: [], country: 'Pakistan', location: 'Lahore, Punjab',
    sellerId: 'seed_user_4', sellerName: 'Sara Malik', sellerContact: '+92-345-2223344',
    views: 210, savedBy: [], status: 'active',
    tags: ['RAM', 'DDR5', 'Corsair', 'Vengeance', '32GB'],
    specs: { Capacity: '32GB (2×16)', Speed: 'DDR5-6000', Latency: 'CL30', Voltage: '1.35V' },
    postedDate: daysAgo(1),
  },
  {
    title: 'Corsair RM850x 850W 80+ Gold Fully Modular PSU',
    description: 'Excellent condition PSU from a build I recently upgraded. About 1 year old. Zero coil whine, all cables included. 80+ Gold rated, fully modular.',
    price: 22000, negotiable: true, category: 'Components', condition: 'used', listingType: 'sell',
    images: [], country: 'Pakistan', location: 'Rawalpindi, Punjab',
    sellerId: 'seed_user_5', sellerName: 'Hassan Iftikhar', sellerContact: '+92-300-7654321',
    views: 67, savedBy: [], status: 'active',
    tags: ['PSU', 'Power Supply', 'Corsair', '850W', 'Gold'],
    specs: { Wattage: '850W', Rating: '80+ Gold', Type: 'Fully Modular', Fan: '135mm' },
    postedDate: daysAgo(10),
  },
  {
    title: 'Samsung 980 Pro 1TB NVMe PCIe 4.0 SSD',
    description: 'Used in a PS5 for 8 months, then moved to PC. Read 7000 MB/s, Write 5000 MB/s. No issues whatsoever. Comes in anti-static bag.',
    price: 14000, negotiable: true, category: 'Components', condition: 'used', listingType: 'sell',
    images: [], country: 'Pakistan', location: 'Karachi, Sindh',
    sellerId: 'seed_user_6', sellerName: 'Zara Hussain', sellerContact: '+92-311-8889900',
    views: 305, savedBy: [], status: 'active',
    tags: ['SSD', 'NVMe', 'Samsung', '980 Pro', 'PCIe 4.0', '1TB'],
    specs: { Capacity: '1TB', Interface: 'PCIe 4.0 NVMe', Read: '7000 MB/s', Write: '5000 MB/s' },
    postedDate: daysAgo(3),
  },
  {
    title: 'MSI MAG274QRF-QD 27" 1440p 165Hz IPS Monitor',
    description: '27-inch QHD gaming monitor with Quantum Dot IPS panel, 165Hz refresh rate, and 1ms response. Bought 6 months ago. Comes with original stand and all cables.',
    price: 58000, negotiable: true, category: 'Monitors', condition: 'used', listingType: 'sell',
    images: [], country: 'Pakistan', location: 'Lahore, Punjab',
    sellerId: 'seed_user_7', sellerName: 'Faisal Sheikh', sellerContact: '+92-322-1112233',
    views: 180, savedBy: [], status: 'active',
    tags: ['Monitor', 'MSI', '1440p', '165Hz', 'IPS', 'Gaming Monitor'],
    specs: { Panel: 'IPS (QD)', Resolution: '2560×1440', Refresh: '165Hz', Response: '1ms' },
    postedDate: daysAgo(4),
  },
  {
    title: 'NZXT H510 Mid Tower Case — Matte Black',
    description: 'Clean NZXT H510 with tempered glass side panel. Barely used for 3 months, switching to a full-tower. Willing to exchange for NZXT H710.',
    price: 12000, negotiable: false, category: 'Components', condition: 'used', listingType: 'exchange',
    images: [], country: 'Pakistan', location: 'Faisalabad, Punjab',
    sellerId: 'seed_user_8', sellerName: 'Imran Chaudhry', sellerContact: '+92-303-6667788',
    views: 43, savedBy: [], status: 'active',
    tags: ['Case', 'NZXT', 'H510', 'Mid Tower', 'Tempered Glass'],
    specs: { Type: 'Mid Tower', 'GPU Clearance': '381mm', Material: 'Steel + TG' },
    postedDate: daysAgo(8),
  },
  {
    title: 'Complete Gaming PC Bundle — i7-12700K + RTX 3070',
    description: 'Full system: Intel i7-12700K, MSI RTX 3070 Gaming X Trio, 16GB Corsair DDR4 3600MHz, MSI Z690 Carbon, 1TB Samsung 970 EVO, Corsair 750W Gold, NZXT H510. Bundle only.',
    price: 250000, negotiable: true, category: 'Components', condition: 'used', listingType: 'sell',
    images: [], country: 'Pakistan', location: 'Multan, Punjab',
    sellerId: 'seed_user_9', sellerName: 'Kamran Ali', sellerContact: '+92-301-4445566',
    views: 520, savedBy: [], status: 'active',
    tags: ['PC Bundle', 'Gaming PC', 'i7', 'RTX 3070', 'Complete Build'],
    specs: { CPU: 'i7-12700K', GPU: 'RTX 3070 8GB', RAM: '16GB DDR4-3600', Storage: '1TB NVMe' },
    postedDate: daysAgo(6),
  },
  {
    title: 'Looking for: RTX 4070 Super — Islamabad/Rawalpindi',
    description: 'Wanted — RTX 4070 Super in good working condition. Prefer ASUS, MSI, or Gigabyte AERO variant. Cash ready. Islamabad or Rawalpindi only.',
    price: 130000, negotiable: true, category: 'Components', condition: 'used', listingType: 'buy',
    images: [], country: 'Pakistan', location: 'Islamabad, ICT',
    sellerId: 'seed_user_10', sellerName: 'Naveed Iqbal', sellerContact: '+92-335-9990011',
    views: 28, savedBy: [], status: 'active',
    tags: ['Wanted', 'RTX 4070 Super', 'NVIDIA', 'GPU', 'Buy'],
    specs: { Budget: '130,000 PKR', 'Preferred Brands': 'ASUS / MSI / Gigabyte' },
    postedDate: daysAgo(1),
  },
];

export default function DevSeedPage() {
  const [listingsLog, setListingsLog] = useState<string[]>([]);
  const [listingsRunning, setListingsRunning] = useState(false);
  const [listingsDone, setListingsDone] = useState(false);

  const [threadsLog, setThreadsLog] = useState<string[]>([]);
  const [threadsRunning, setThreadsRunning] = useState(false);
  const [threadsDone, setThreadsDone] = useState(false);

  const seedListings = async () => {
    setListingsRunning(true);
    setListingsLog([]);
    const col = collection(db, 'listings');
    let ok = 0;
    for (let i = 0; i < SEED_LISTINGS.length; i++) {
      try {
        const ref = await addDoc(col, SEED_LISTINGS[i]);
        ok++;
        setListingsLog(prev => [...prev, `✓ [${i + 1}/10] ${SEED_LISTINGS[i].title.slice(0, 50)} → ${ref.id}`]);
      } catch (err) {
        setListingsLog(prev => [...prev, `✗ [${i + 1}/10] ${SEED_LISTINGS[i].title.slice(0, 40)} — ${(err as Error).message}`]);
      }
    }
    setListingsLog(prev => [...prev, `\nDone — ${ok}/10 listings seeded.`]);
    setListingsRunning(false);
    setListingsDone(ok > 0);
  };

  const seedThreads = async () => {
    setThreadsRunning(true);
    setThreadsLog([]);
    const col = collection(db, 'threads');
    let ok = 0;
    const total = SEED_THREADS.length;
    for (let i = 0; i < total; i++) {
      try {
        const ref = await addDoc(col, SEED_THREADS[i]);
        ok++;
        setThreadsLog(prev => [...prev, `✓ [${i + 1}/${total}] ${SEED_THREADS[i].title.slice(0, 50)} → ${ref.id}`]);
      } catch (err) {
        setThreadsLog(prev => [...prev, `✗ [${i + 1}/${total}] ${SEED_THREADS[i].title.slice(0, 40)} — ${(err as Error).message}`]);
      }
    }
    setThreadsLog(prev => [...prev, `\nDone — ${ok}/${total} threads seeded.`]);
    setThreadsRunning(false);
    setThreadsDone(ok > 0);
  };

  return (
    <main className="min-h-screen bg-bg-dark flex flex-col items-center justify-center p-8 gap-6">
      <div className="glass-panel rounded-[2rem] border border-yellow-400/30 p-8 max-w-2xl w-full">
        <div className="flex items-center gap-3 mb-6">
          <span className="material-symbols-outlined text-3xl text-yellow-400">warning</span>
          <div>
            <h1 className="text-white font-bold text-xl">Dev Seed Tool</h1>
            <p className="text-gray-400 text-sm">Creates fake Pakistan listings. Remove this route before production.</p>
          </div>
        </div>

        <button
          onClick={seedListings}
          disabled={listingsRunning || listingsDone}
          className="w-full py-3 rounded-xl font-semibold text-bg-dark bg-primary hover:bg-primary/80 disabled:opacity-50 disabled:cursor-not-allowed transition-all mb-4"
        >
          {listingsRunning ? 'Seeding…' : listingsDone ? 'Done! ✓ Navigate to /marketplace' : 'Seed 10 Pakistan Listings'}
        </button>

        {listingsLog.length > 0 && (
          <pre className="font-mono text-xs text-gray-300 bg-black/40 rounded-xl p-4 overflow-auto max-h-48 whitespace-pre-wrap mb-6">
            {listingsLog.join('\n')}
          </pre>
        )}

        <hr className="border-white/10 mb-6" />

        <button
          onClick={seedThreads}
          disabled={threadsRunning || threadsDone}
          className="w-full py-3 rounded-xl font-semibold text-bg-dark bg-accent-purple hover:bg-accent-purple/80 disabled:opacity-50 disabled:cursor-not-allowed transition-all mb-4"
        >
          {threadsRunning ? 'Seeding…' : threadsDone ? 'Done! ✓ Navigate to /community' : `Seed ${SEED_THREADS.length} Community Threads`}
        </button>

        {threadsLog.length > 0 && (
          <pre className="font-mono text-xs text-gray-300 bg-black/40 rounded-xl p-4 overflow-auto max-h-48 whitespace-pre-wrap">
            {threadsLog.join('\n')}
          </pre>
        )}
      </div>
    </main>
  );
}
