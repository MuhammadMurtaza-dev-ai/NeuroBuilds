import { useState, useEffect } from 'react';
import storageData from '../data/storage.json';

export interface BlogPost {
  id: string;
  title: string;
  excerpt: string;
  author: string;
  date: string;
  comments: number;
  category: string;
  image: string;
  featured: boolean;
  content: string;
}

export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  category: string;
  image: string;
  status: string;
  statusColor: string;
  inStock: boolean;
}

export interface Listing {
  id: string;
  title: string;
  description: string;
  price: number;
  negotiable: boolean;
  category: string;
  condition: 'new' | 'used' | 'refurbished';
  listingType: 'sell' | 'buy' | 'exchange';
  images: string[];
  country: string;
  province?: string;
  location: string;
  sellerId: string;
  sellerName: string;
  sellerContact: string;
  postedDate: string;
  views: number;
  savedBy: string[];
  status: 'active' | 'sold' | 'reserved' | 'hidden';
  tags: string[];
  specs: Record<string, string>;
  stockQuantity?: number;
  sku?: string;
}

export interface CommunityPost {
  id: string;
  title: string;
  author: string;
  category: string;
  replies: number;
  views: number;
  lastActivity: string;
  isPinned: boolean;
  content: string;
}

export interface UserBuild {
  id: string;
  name: string;
  status: 'draft' | 'completed' | 'published';
  components: number;
  budget: number;
  createdDate: string;
  thumbnail: string | null;
}

export interface User {
  id: string;
  name: string;
  email: string;
  username: string;
  avatar: string | null;
  joinDate: string;
}

export interface TrendingTopic {
  title: string;
  category: string;
  timeAgo: string;
  color: string;
}

export interface NavLink {
  label: string;
  path: string;
}

export interface FooterLink {
  label: string;
  path: string;
}

export interface FooterColumn {
  title: string;
  links: FooterLink[];
}

export interface HowItWorksStep {
  id: number;
  title: string;
  description: string;
  iconName: string;
}

export interface PricingFeature {
  name: string;
  included: boolean;
}

export interface PricingTier {
  id: string;
  name: string;
  price: number;
  period?: string;
  description: string;
  buttonText?: string;
  buttonVariant?: 'primary' | 'secondary';
  highlighted?: boolean;
  features: PricingFeature[];
}

export interface FAQItem {
  id: string;
  question: string;
  answer: string;
}

export interface Feature {
  id: string;
  title: string;
  description: string;
  iconName: string;
  gradient?: string;
}

export interface Testimonial {
  id: string;
  name: string;
  role: string;
  content: string;
  avatar?: string;
  rating?: number;
}

export interface AppConfig {
  brandName: string;
  footerBrandName: string;
}

export interface StorageData {
  blogPosts: BlogPost[];
  products: Product[];
  listings: Listing[];
  communityPosts: CommunityPost[];
  userBuilds: UserBuild[];
  users: User[];
  trendingTopics: TrendingTopic[];
  navLinks: NavLink[];
  footerColumns: FooterColumn[];
  howItWorksSteps: HowItWorksStep[];
  pricingTiers: PricingTier[];
  faqItems: FAQItem[];
  features: Feature[];
  testimonials: Testimonial[];
  appConfig: AppConfig;
}

const STORAGE_KEY = 'neurobuilds_data';

// Initialize localStorage with default data on first load
const initializeStorage = (): StorageData => {
  const existing = localStorage.getItem(STORAGE_KEY);
  if (existing) {
    try {
      const parsed = JSON.parse(existing) as StorageData;
      if (!parsed.listings) {
        parsed.listings = (storageData as unknown as StorageData).listings ?? [];
      }
      return parsed;
    } catch {
      console.error('Failed to parse storage data, using defaults');
    }
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(storageData));
  return storageData as unknown as StorageData;
};

export const useStorage = () => {
  const [data, setData] = useState<StorageData>(() => initializeStorage());

  // Save data to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }, [data]);

  // Blog Post Operations
  const addBlogPost = (post: Omit<BlogPost, 'id'>) => {
    const newPost: BlogPost = {
      ...post,
      id: Date.now().toString(),
    };
    setData(prev => ({
      ...prev,
      blogPosts: [newPost, ...prev.blogPosts],
    }));
    return newPost;
  };

  const updateBlogPost = (id: string, updates: Partial<BlogPost>) => {
    setData(prev => ({
      ...prev,
      blogPosts: prev.blogPosts.map(post =>
        post.id === id ? { ...post, ...updates } : post
      ),
    }));
  };

  const deleteBlogPost = (id: string) => {
    setData(prev => ({
      ...prev,
      blogPosts: prev.blogPosts.filter(post => post.id !== id),
    }));
  };

  // Product Operations
  const addProduct = (product: Omit<Product, 'id'>) => {
    const newProduct: Product = {
      ...product,
      id: Date.now().toString(),
    };
    setData(prev => ({
      ...prev,
      products: [...prev.products, newProduct],
    }));
    return newProduct;
  };

  const updateProduct = (id: string, updates: Partial<Product>) => {
    setData(prev => ({
      ...prev,
      products: prev.products.map(product =>
        product.id === id ? { ...product, ...updates } : product
      ),
    }));
  };

  const deleteProduct = (id: string) => {
    setData(prev => ({
      ...prev,
      products: prev.products.filter(product => product.id !== id),
    }));
  };

  // Listing Operations
  const addListing = (listing: Omit<Listing, 'id'>) => {
    const newListing: Listing = { ...listing, id: Date.now().toString() };
    setData(prev => ({ ...prev, listings: [newListing, ...(prev.listings || [])] }));
    return newListing;
  };

  const updateListing = (id: string, updates: Partial<Listing>) => {
    setData(prev => ({
      ...prev,
      listings: (prev.listings || []).map(l => l.id === id ? { ...l, ...updates } : l),
    }));
  };

  const deleteListing = (id: string) => {
    setData(prev => ({ ...prev, listings: (prev.listings || []).filter(l => l.id !== id) }));
  };

  // Community Post Operations
  const addCommunityPost = (post: Omit<CommunityPost, 'id'>) => {
    const newPost: CommunityPost = {
      ...post,
      id: Date.now().toString(),
    };
    setData(prev => ({
      ...prev,
      communityPosts: [newPost, ...prev.communityPosts],
    }));
    return newPost;
  };

  const updateCommunityPost = (id: string, updates: Partial<CommunityPost>) => {
    setData(prev => ({
      ...prev,
      communityPosts: prev.communityPosts.map(post =>
        post.id === id ? { ...post, ...updates } : post
      ),
    }));
  };

  const deleteCommunityPost = (id: string) => {
    setData(prev => ({
      ...prev,
      communityPosts: prev.communityPosts.filter(post => post.id !== id),
    }));
  };

  // User Build Operations
  const addUserBuild = (build: Omit<UserBuild, 'id'>) => {
    const newBuild: UserBuild = {
      ...build,
      id: Date.now().toString(),
    };
    setData(prev => ({
      ...prev,
      userBuilds: [...prev.userBuilds, newBuild],
    }));
    return newBuild;
  };

  const updateUserBuild = (id: string, updates: Partial<UserBuild>) => {
    setData(prev => ({
      ...prev,
      userBuilds: prev.userBuilds.map(build =>
        build.id === id ? { ...build, ...updates } : build
      ),
    }));
  };

  const deleteUserBuild = (id: string) => {
    setData(prev => ({
      ...prev,
      userBuilds: prev.userBuilds.filter(build => build.id !== id),
    }));
  };

  // User Operations
  const addUser = (user: Omit<User, 'id'>) => {
    const newUser: User = {
      ...user,
      id: Date.now().toString(),
    };
    setData(prev => ({
      ...prev,
      users: [...prev.users, newUser],
    }));
    return newUser;
  };

  const updateUser = (id: string, updates: Partial<User>) => {
    setData(prev => ({
      ...prev,
      users: prev.users.map(user =>
        user.id === id ? { ...user, ...updates } : user
      ),
    }));
  };

  // Reset to defaults
  const resetStorage = () => {
    localStorage.removeItem(STORAGE_KEY);
    setData(storageData as unknown as StorageData);
  };

  // Export data for backup
  const exportData = () => {
    const dataStr = JSON.stringify(data, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `neurobuilds-backup-${Date.now()}.json`;
    link.click();
  };

  return {
    data,
    // Blog operations
    addBlogPost,
    updateBlogPost,
    deleteBlogPost,
    // Product operations
    addProduct,
    updateProduct,
    deleteProduct,
    // Listing operations
    addListing,
    updateListing,
    deleteListing,
    // Community operations
    addCommunityPost,
    updateCommunityPost,
    deleteCommunityPost,
    // Build operations
    addUserBuild,
    updateUserBuild,
    deleteUserBuild,
    // User operations
    addUser,
    updateUser,
    // Utilities
    resetStorage,
    exportData,
  };
};
