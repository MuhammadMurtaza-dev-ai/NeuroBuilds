import { useState } from 'react';
import { collection, addDoc, Timestamp } from 'firebase/firestore';
import { db, auth } from '../Firebase';

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
    savedBy: ['seed_user_2', 'seed_user_3', 'seed_user_5', 'seed_user_7', 'seed_user_9'], status: 'active',
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
    savedBy: ['seed_user_1', 'seed_user_4', 'seed_user_6'], status: 'active',
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
    savedBy: ['seed_user_2', 'seed_user_8'], status: 'active',
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
    savedBy: ['seed_user_1', 'seed_user_3', 'seed_user_5', 'seed_user_6', 'seed_user_7', 'seed_user_9', 'seed_user_10'], status: 'active',
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
    savedBy: ['seed_user_3', 'seed_user_4'], status: 'active',
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
    savedBy: ['seed_user_1', 'seed_user_2', 'seed_user_4', 'seed_user_8'], status: 'active',
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
    savedBy: ['seed_user_2', 'seed_user_5', 'seed_user_6', 'seed_user_10'], status: 'active',
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
    savedBy: ['seed_user_7'], status: 'active',
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
    savedBy: ['seed_user_1', 'seed_user_3', 'seed_user_4', 'seed_user_5', 'seed_user_6', 'seed_user_8', 'seed_user_9', 'seed_user_10'], status: 'active',
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
    savedBy: ['seed_user_2', 'seed_user_7'], status: 'active',
    tags: ['Wanted', 'RTX 4070 Super', 'NVIDIA', 'GPU', 'Buy'],
    specs: { Budget: '130,000 PKR', 'Preferred Brands': 'ASUS / MSI / Gigabyte' },
    postedDate: daysAgo(1),
  },
];

const hoursAgo = (h: number) => Timestamp.fromDate(new Date(Date.now() - h * 3_600_000));

interface SeedComment { authorId: string; authorName: string; body: string; createdAt: Timestamp }
interface SeedBlog {
  title: string; content: string; thumbnailUrl: string; category: 'Tutorial' | 'Hardware' | 'Industry';
  authorId: string; authorName: string; authorType: 'user' | 'ai_agent';
  status: 'pending_review' | 'published'; isPublished: boolean;
  createdAt: Timestamp; updatedAt: Timestamp;
  comments?: SeedComment[];
}

const SEED_BLOGS: SeedBlog[] = [
  // ─── pending_review ────────────────────────────────────────────────────────
  {
    title: 'Is the RTX 5090 Worth It for the Average Gamer?',
    category: 'Hardware', status: 'pending_review', isPublished: false,
    authorId: 'seed_user_1', authorName: 'Ahmed Raza', authorType: 'user',
    thumbnailUrl: '',
    createdAt: hoursAgo(3), updatedAt: hoursAgo(3),
    content: `# Is the RTX 5090 Worth It for the Average Gamer?\n\nNVIDIA's flagship RTX 5090 arrived with a jaw-dropping price tag and equally jaw-dropping specs. But does it make sense for a typical gamer running a 1440p monitor?\n\n## What the Numbers Say\n\nThe 5090 posts 4K frame-rates that simply didn't exist at launch, but at 1440p you're leaving roughly 60 % of its throughput on the table. Frame generation helps, yet introduces input latency that competitive players will immediately notice.\n\n## The Pakistan Context\n\nImported grey-market 5090s are landing around 350,000–400,000 PKR. For that budget you could build **two** respectable 1440p gaming rigs around the RTX 4070 Super. The opportunity cost is significant.\n\n## Verdict\n\nIf you're a content creator who also games, the VRAM alone (32 GB GDDR7) justifies the premium. For pure gaming, the RTX 4070 Ti Super at ~140k PKR is the rational choice — it delivers 95 % of the real-world experience at 35 % of the price.`,
  },
  {
    title: 'Step-by-Step: Delidding Your Intel CPU in 2025 — Is It Still Worth It?',
    category: 'Tutorial', status: 'pending_review', isPublished: false,
    authorId: 'seed_user_3', authorName: 'Usman Tariq', authorType: 'user',
    thumbnailUrl: '',
    createdAt: hoursAgo(7), updatedAt: hoursAgo(7),
    content: `# Delidding Your Intel CPU in 2025\n\nDelidding used to be a right of passage for enthusiasts. With Raptor Lake's notoriously hot TIM, it's back in the spotlight.\n\n## What You Need\n\n- Der8auer Delid-Die-Mate X (or vice grip + luck)\n- Liquid metal (Thermal Grizzly Conductonaut Extreme)\n- Isopropyl alcohol 99 %\n- Cotton swabs and steady hands\n\n## The Process\n\n1. Remove the CPU from your motherboard.\n2. Use the Delid-Die-Mate to slide the IHS sideways — apply slow, even pressure.\n3. Clean the old TIM off both the die and the IHS with IPA.\n4. Apply a micro-bead of liquid metal **only** to the die — spread to cover, but not to the SMD components around the edge.\n5. Re-seat the IHS and use the Relid tool to press it back.\n\n## Expected Results\n\nTypical drops on an i9-13900K: **15–22 °C** under Cinebench. That translates to sustained higher clocks and a quieter system.\n\n## Risk\n\nLiquid metal is electrically conductive. One slip and you have a PKR 90,000 paperweight. Proceed with full awareness.`,
  },
  {
    title: "Pakistan's PC Gaming Market in 2025: Growth, Challenges & Opportunities",
    category: 'Industry', status: 'pending_review', isPublished: false,
    authorId: 'seed_user_9', authorName: 'Kamran Ali', authorType: 'user',
    thumbnailUrl: '',
    createdAt: hoursAgo(1), updatedAt: hoursAgo(1),
    content: `# Pakistan's PC Gaming Market in 2025\n\n## A Market Coming of Age\n\nPakistan's PC gaming segment has quietly doubled over three years. Broadband penetration, falling peripheral prices, and a young median age (22 years) are converging into a meaningful market.\n\n## Key Trends\n\n**E-sports infrastructure** — PUBG Mobile and Valorant tournaments now attract live audiences at Expo Centre Karachi and Lahore Expo. Prize pools crossed PKR 10M for the first time in 2024.\n\n**Grey market maturity** — Buyers are increasingly choosing authorized dealers over grey imports, driven by warranty horror stories and improved authorized pricing.\n\n**Content creation crossover** — A growing cohort of Pakistani YouTubers review hardware in Urdu and Punjabi, making component selection accessible to a non-English audience.\n\n## Challenges\n\n- Dollar-denominated import costs make hardware expensive relative to median income\n- Unstable electricity (load-shedding) pushes buyers toward UPS solutions, adding 15–20 % to build cost\n- Counterfeit components, especially RAM and SSDs, remain a problem in smaller cities\n\n## The Opportunity\n\nFor platforms like NeuroBuilds, this transition is the moment — a community that helps Pakistani builders make informed, local-context decisions fills a genuine gap.`,
  },

  // ─── published with comments ───────────────────────────────────────────────
  {
    title: 'Top 5 Budget PC Builds Under 100k PKR in 2025',
    category: 'Tutorial', status: 'published', isPublished: true,
    authorId: 'seed_user_2', authorName: 'Bilal Khan', authorType: 'user',
    thumbnailUrl: '',
    createdAt: daysAgo(14), updatedAt: daysAgo(14),
    content: `# Top 5 Budget PC Builds Under 100k PKR in 2025\n\nBuilding a capable PC in Pakistan doesn't require a six-figure spend. Here are five balanced builds, priced at current Metro and Computer Adda rates.\n\n## Build 1 — The 1080p Starter (65k PKR)\n- **CPU**: Ryzen 5 5600 (~22k)\n- **GPU**: RX 6600 (~38k grey / 42k retail)\n- **Mobo**: MSI B550M Pro (~14k)\n- **RAM**: 16 GB DDR4-3200 (~8k)\n- **PSU**: Cooler Master 650W Bronze (~8k)\n- **Storage**: 500 GB Kingston NV2 (~4k)\n\nCapable of 1080p/High in every modern title at 60–100 FPS.\n\n## Build 2 — The Sweet Spot (85k PKR)\n- **CPU**: Ryzen 5 7600 (~28k)\n- **GPU**: RX 7600 (~62k)\n- **Mobo**: B650M DS3H (~16k)\n- **RAM**: 16 GB DDR5-4800 (~11k)\n\nAM5 platform means CPU upgrades for years.\n\n## Final Advice\n\nAlways buy RAM and SSD from authorized dealers — counterfeits are rampant on social media marketplaces. Stick to Computer Adda or Metro for warranties.`,
    comments: [
      { authorId: 'seed_user_4', authorName: 'Sara Malik', createdAt: hoursAgo(300), body: 'Build 1 is exactly what I put together for my cousin last month. RX 6600 runs Valorant at 200+ FPS on 1080p Medium. Great shout.' },
      { authorId: 'seed_user_6', authorName: 'Zara Hussain', createdAt: hoursAgo(280), body: 'Any reason you went with Ryzen 5 7600 over the 7600X for Build 2? Seen the X variant on sale lately.' },
      { authorId: 'seed_user_2', authorName: 'Bilal Khan', createdAt: hoursAgo(270), body: '@Zara — the non-X is basically the same die with a slightly lower boost and no bundled cooler premium. Save the difference for better RAM timings.' },
      { authorId: 'seed_user_8', authorName: 'Imran Chaudhry', createdAt: hoursAgo(240), body: 'Worth mentioning: add a decent UPS to any budget build. WAPDA cuts cost more in the long run than a cheap PSU.' },
    ],
  },
  {
    title: 'DDR5 vs DDR4: Does Memory Generation Actually Matter for Gaming?',
    category: 'Hardware', status: 'published', isPublished: true,
    authorId: 'seed_user_7', authorName: 'Faisal Sheikh', authorType: 'user',
    thumbnailUrl: '',
    createdAt: daysAgo(10), updatedAt: daysAgo(10),
    content: `# DDR5 vs DDR4 for Gaming — The Real Answer\n\nSince AMD moved to DDR5-only with AM5, buyers often ask: is the extra cost justified?\n\n## Bandwidth vs Latency\n\nDDR5 at 6000 MHz CL30 delivers roughly 2× the raw bandwidth of DDR4-3600. However, primary latency (CL to actual nanoseconds) is similar or slightly worse at equivalent price points.\n\n## Gaming Benchmarks\n\nIn CPU-bound scenarios (CS2, Valorant at 1080p), the 5800X3D on DDR4-3600 still beats the 7600 on DDR5-4800. **But** pair the 7600 with DDR5-6000 at the FCLK-synced sweet spot (2000 MHz Infinity Fabric) and the tables turn.\n\n## The Verdict\n\n| Scenario | Winner |\n|----------|--------|\n| Budget gaming (DDR4 platform) | DDR4 — no argument |\n| AM5 + gaming | DDR5-6000 CL30 |\n| Workloads (video editing, ML) | DDR5 by a clear margin |\n\n## What to Buy in Pakistan\n\nCorsair Vengeance DDR5-6000 CL30 32 GB kit sits at ~28k PKR. That's a meaningful but justifiable premium if you're on AM5 for the long haul.`,
    comments: [
      { authorId: 'seed_user_1', authorName: 'Ahmed Raza', createdAt: hoursAgo(220), body: 'Tested this myself — 7600 + DDR5-6000 C30 gave me 15 FPS more in CS2 at 1080p vs DDR5-4800. The FCLK sync is real.' },
      { authorId: 'seed_user_10', authorName: 'Naveed Iqbal', createdAt: hoursAgo(200), body: 'What about 3D V-Cache CPUs? The 7800X3D seems to care less about RAM speed because of the on-die cache.' },
      { authorId: 'seed_user_7', authorName: 'Faisal Sheikh', createdAt: hoursAgo(195), body: '@Naveed — correct! 7800X3D is barely affected by RAM speed in gaming. The cache absorbs most latency. Different story for creative apps though.' },
    ],
  },
  {
    title: 'How to Optimize Windows 11 for Gaming — The Complete 2025 Guide',
    category: 'Tutorial', status: 'published', isPublished: true,
    authorId: 'seed_user_4', authorName: 'Sara Malik', authorType: 'user',
    thumbnailUrl: '',
    createdAt: daysAgo(6), updatedAt: daysAgo(6),
    content: `# Windows 11 Gaming Optimization — Full Checklist\n\nWindows 11 ships with settings that actively hurt gaming performance. Here's the definitive fix list.\n\n## Core Settings\n\n1. **Game Mode ON** — Settings → Gaming → Game Mode → On\n2. **Hardware-Accelerated GPU Scheduling (HAGS)** — Settings → Display → Graphics → Change default graphics settings → ON *(requires DirectX 12 GPU)*\n3. **Variable Refresh Rate** — Enable in the same menu\n4. **Disable Xbox Game Bar** — Settings → Gaming → Xbox Game Bar → Off\n\n## Power Plan\n\nFor Intel: set to **High Performance**. For AMD Ryzen: install the **AMD Ryzen Balanced** plan from AMD's chipset driver package — it enables the correct C-state transitions that "High Performance" breaks on Ryzen.\n\n## NVIDIA-Specific\n\n- NVIDIA Control Panel → Manage 3D Settings → Power management mode → **Prefer maximum performance**\n- Shader Cache Size → **Unlimited**\n- Disable "Whisper Mode" if enabled\n\n## Background Processes\n\nDisable: Xbox services, Connected User Experiences, Windows Search indexing during gaming sessions (via Services.msc — set to Manual).\n\n## Thermal Paste\n\nNot a Windows setting, but: if your CPU hits 95 °C under Cinebench, no software fix will save your frame times. Replace thermal paste after 2–3 years.`,
    comments: [
      { authorId: 'seed_user_5', authorName: 'Hassan Iftikhar', createdAt: hoursAgo(130), body: 'HAGS broke SLI / multi-GPU on older setups — good reminder to only enable it on DX12 hardware. Saved me from a rabbit hole last week.' },
      { authorId: 'seed_user_3', authorName: 'Usman Tariq', createdAt: hoursAgo(110), body: 'The AMD Ryzen Balanced plan tip is underrated. My 7600X dropped 8°C idle after switching from High Performance.' },
      { authorId: 'seed_user_9', authorName: 'Kamran Ali', createdAt: hoursAgo(95), body: 'Would add: disable "Memory Integrity" (Core Isolation) if your anticheat software complains. It does add latency on older systems.' },
    ],
  },
  {
    title: 'AMD vs NVIDIA in Pakistan 2025 — Where Does Your Money Actually Go?',
    category: 'Industry', status: 'published', isPublished: true,
    authorId: 'seed_user_6', authorName: 'Zara Hussain', authorType: 'user',
    thumbnailUrl: '',
    createdAt: daysAgo(3), updatedAt: daysAgo(3),
    content: `# AMD vs NVIDIA in Pakistan — An Honest Breakdown\n\nThe AMD vs NVIDIA debate is often framed around benchmarks. In Pakistan, import duties, availability, and after-sales support change the calculus significantly.\n\n## Price Parity at Each Tier (Jun 2025)\n\n| AMD | Price (PKR) | NVIDIA Equivalent | Price (PKR) | Verdict |\n|-----|-------------|-------------------|-------------|---------|\n| RX 7600 | 62–67k | RTX 4060 | 78–82k | AMD wins |\n| RX 7700 XT | 90–98k | RTX 4060 Ti | 95–105k | AMD wins |\n| RX 7900 GRE | 120–130k | RTX 4070 Super | 128–135k | Draw |\n| RX 7900 XTX | 195–210k | RTX 4080 Super | 230–250k | AMD wins |\n\n## Where NVIDIA Justifies Its Premium\n\n- **DLSS 3 Frame Generation** — genuinely useful in supported titles\n- **NVENC encoder** — still the best for content creators streaming at high quality\n- **CUDA ecosystem** — non-negotiable for ML/AI workloads\n\n## Where AMD Wins in Pakistan\n\n- **Price** — consistently 15–25 % cheaper at each tier\n- **Driver maturity** — 2023–25 AMD drivers are solid; the stability reputation gap has closed\n- **Availability** — local authorized RX stock is more consistent than RTX 40-series\n\n## Bottom Line\n\nFor pure gaming: AMD's RX 7000 series offers better rupee-per-frame. If you edit video, stream, or run any ML pipeline, NVIDIA's ecosystem extras tip the balance back.`,
    comments: [
      { authorId: 'seed_user_1', authorName: 'Ahmed Raza', createdAt: hoursAgo(60), body: 'Switched from RTX 3070 to RX 7900 GRE when I saw the price gap. Zero regrets. FSR 3 frame gen works in more titles than I expected.' },
      { authorId: 'seed_user_2', authorName: 'Bilal Khan', createdAt: hoursAgo(45), body: "The NVENC point is huge. I stream on Twitch and the quality difference vs AMF is still noticeable at 6000 kbps. Team NVIDIA for me until AMD closes that gap." },
      { authorId: 'seed_user_5', authorName: 'Hassan Iftikhar', createdAt: hoursAgo(30), body: 'Any idea if the RX 9070 will hit local shelves before Q3? Import timelines from Newegg resellers are all over the place.' },
      { authorId: 'seed_user_6', authorName: 'Zara Hussain', createdAt: hoursAgo(20), body: "@Hassan — I've seen estimates of 3–4 months post-global launch for authorized stock. Grey market will have it sooner but expect a 10–15k premium." },
    ],
  },
];

export default function DevSeedPage() {
  const [listingsLog, setListingsLog] = useState<string[]>([]);
  const [listingsRunning, setListingsRunning] = useState(false);
  const [listingsDone, setListingsDone] = useState(false);

  const [threadsLog, setThreadsLog] = useState<string[]>([]);
  const [threadsRunning, setThreadsRunning] = useState(false);
  const [threadsDone, setThreadsDone] = useState(false);

  const [blogsLog, setBlogsLog] = useState<string[]>([]);
  const [blogsRunning, setBlogsRunning] = useState(false);
  const [blogsDone, setBlogsDone] = useState(false);

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

  const seedBlogs = async () => {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      setBlogsLog(['✗ You must be signed in to seed blogs. Please log in first.']);
      return;
    }

    setBlogsRunning(true);
    setBlogsLog([]);

    const tokenResult = await currentUser.getIdTokenResult();
    const userIsAdmin = tokenResult.claims.admin === true;

    if (!userIsAdmin) {
      setBlogsLog(prev => [...prev,
        '⚠ Not signed in as admin — all posts will be created as pending_review.',
        '  Published posts require the admin JWT claim. Go to /admin → Role Management to promote yourself,',
        '  then sign out and back in before re-running this seed.',
        '',
      ]);
    }

    const blogsCol = collection(db, 'blogs');
    let ok = 0;
    const total = SEED_BLOGS.length;

    for (let i = 0; i < total; i++) {
      const { comments, ...templateData } = SEED_BLOGS[i];

      // Non-admins: must use real UID as authorId and force status to pending_review
      const blogData = {
        ...templateData,
        authorId: userIsAdmin ? templateData.authorId : currentUser.uid,
        authorName: userIsAdmin ? templateData.authorName : (currentUser.displayName ?? 'Developer'),
        status: userIsAdmin ? templateData.status : 'pending_review' as const,
        isPublished: userIsAdmin ? templateData.isPublished : false,
      };

      try {
        const blogRef = await addDoc(blogsCol, {
          ...blogData,
          excerpt: blogData.content.replace(/[#*_`>[\]]/g, '').slice(0, 160).trimEnd() + '…',
          commentCount: comments?.length ?? 0,
          rejectionNote: null,
          publishAt: null,
          videoUrl: null,
        });

        if (comments && comments.length > 0) {
          const commentsCol = collection(db, 'blogs', blogRef.id, 'comments');
          for (const c of comments) {
            await addDoc(commentsCol, c);
          }
        }

        ok++;
        const tag = blogData.status === 'pending_review' ? '[REVIEW]' : '[PUBLISHED]';
        setBlogsLog(prev => [...prev, `✓ [${i + 1}/${total}] ${tag} ${blogData.title.slice(0, 50)} → ${blogRef.id}${comments?.length ? ` + ${comments.length} comments` : ''}`]);
      } catch (err) {
        setBlogsLog(prev => [...prev, `✗ [${i + 1}/${total}] ${blogData.title.slice(0, 40)} — ${(err as Error).message}`]);
      }
    }

    const publishedCount = userIsAdmin ? 4 : 0;
    const reviewCount = userIsAdmin ? 3 : total;
    setBlogsLog(prev => [...prev, `\nDone — ${ok}/${total} posts seeded (${reviewCount} pending review, ${publishedCount} published).`]);
    if (!userIsAdmin && ok > 0) {
      setBlogsLog(prev => [...prev, 'Tip: Approve the 4 "published" posts from /admin → Review Queue to make them appear on /blog.']);
    }
    setBlogsRunning(false);
    setBlogsDone(ok > 0);
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

        <hr className="border-white/10 mb-6" />

        <button
          onClick={seedBlogs}
          disabled={blogsRunning || blogsDone}
          className="w-full py-3 rounded-xl font-semibold text-bg-dark bg-primary hover:bg-primary/80 disabled:opacity-50 disabled:cursor-not-allowed transition-all mb-4"
          style={{ background: blogsRunning || blogsDone ? undefined : 'linear-gradient(135deg,#0df2f2,#bf00ff)' }}
        >
          {blogsRunning ? 'Seeding…' : blogsDone ? 'Done! ✓ Navigate to /blog or /admin' : 'Seed 7 Blog Posts (3 in review + 4 published w/ comments)'}
        </button>

        {blogsLog.length > 0 && (
          <pre className="font-mono text-xs text-gray-300 bg-black/40 rounded-xl p-4 overflow-auto max-h-48 whitespace-pre-wrap">
            {blogsLog.join('\n')}
          </pre>
        )}
      </div>
    </main>
  );
}
